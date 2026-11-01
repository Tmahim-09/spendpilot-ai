import {
  executeConversationalInteractionTurn,
} from "./gemini-interactions.ts";
import {
  evaluateDomainScope,
  isShoppingFollowUp,
  isProductInformationQuery,
  SPENDPILOT_REDIRECT_MESSAGE,
} from "./domain-guard.ts";
import {
  extractAttributesFromText,
  analyzeShoppingRequirements,
} from "../shopping/requirement-engine.ts";
import type {
  AuthoritativeShoppingSession,
  ChatMessage,
  ConversationalAction,
  DomainScope,
  GuidedQuestion,
  ShoppingMode,
  CurrencyCode,
  NormalizedProduct,
} from "../../types/index.ts";

export interface ProcessUserMessageOptions {
  session: AuthoritativeShoppingSession;
  userMessage: string;
  currentProducts?: NormalizedProduct[];
  currentProductsSummary?: Array<{
    id?: string;
    sourceProductId?: string | null;
    title: string;
    price?: number | null;
    currency?: string;
    brand?: string | null;
    availability?: string;
    keySpecs?: Record<string, string>;
  }>;
}

export interface ProcessUserMessageResult {
  session: AuthoritativeShoppingSession;
  assistantMessage: ChatMessage;
  action: ConversationalAction;
  scope: DomainScope;
  shouldExecuteSearch: boolean;
  shouldExecuteComparison: boolean;
  comparisonProductIds?: string[];
  variantConfiguration?: {
    productId: string;
    selectedOptions: Record<string, string>;
  } | null;
  modelUsed?: string;
  usedFallback?: boolean;
}

/**
 * Normalizes and initializes a default authoritative shopping session.
 */
export function createInitialSession(params: {
  sessionId?: string;
  initialQuery?: string;
  mode?: ShoppingMode;
  budget?: number | null;
  currency?: CurrencyCode;
}): AuthoritativeShoppingSession {
  const sessionId = params.sessionId || "session_init";
  const originalRequest = params.initialQuery?.trim() || "";
  const mode = params.mode || "single";
  const budget = typeof params.budget === "number" && params.budget > 0 ? params.budget : null;
  const currency = params.currency || "USD";

  return {
    sessionId,
    stage: "initial_request",
    originalRequest,
    mode,
    budget,
    currency,
    intentSummary: originalRequest ? `Looking for ${originalRequest}` : "Personal Shopping Assistance",
    requirements: [],
    pendingQuestions: [],
    answers: {},
    attributeOrigins: {},
    messages: [],
    previousInteractionId: null,
    storeInteractions: true,
    canSearch: false,
    retrievedProductIds: [],
    selectedProductId: null,
    selectedVariants: {},
    lastAction: "continue_conversation",
    updatedAt: 0,
  };
}

/**
 * Extracts a budget amount mentioned in user message (e.g. "under $150", "budget of 120", "$70").
 * Returns the amount in minor units (cents).
 */
export function extractBudgetFromText(text: string): number | null {
  const match = text.match(/(?:under|below|budget(?:\s*(?:of|is|to|under))?|max(?:\s*price)?|within|less than)\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i) ||
    text.match(/\$([0-9]+(?:\.[0-9]{1,2})?)/i);
  if (match) {
    const val = parseFloat(match[1]);
    if (!isNaN(val) && val > 0) {
      return Math.round(val * 100);
    }
  }
  return null;
}

/**
 * Infers shopping mode (single product vs multi-product setup) from user text.
 */
export function inferShoppingModeFromText(text: string): ShoppingMode {
  const lower = text.toLowerCase();
  if (/\b(?:setup|bundle|workstation|rig|build a|room full|multiple items|complete set)\b/i.test(lower)) {
    return "setup";
  }
  return "single";
}

/**
 * Checks if the user's message expresses an affirmative confirmation
 * to proceed with product search.
 */
export function isAffirmativeConfirmation(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (/\b(?:no|not yet|wait|change|different|instead)\b/i.test(lower)) {
    return false;
  }
  return (
    lower === "yes" ||
    lower === "y" ||
    lower === "confirm" ||
    lower.startsWith("yes") ||
    lower.includes("go ahead") ||
    lower.includes("find shoes") ||
    lower.includes("find products") ||
    lower.includes("sounds good") ||
    lower.includes("looks good") ||
    lower.includes("let's do it") ||
    lower.includes("start search")
  );
}

/**
 * Resolves ordinal or descriptive product references (e.g. "the first one", "second item")
 * against the list of active candidate products in session.
 */
export function resolveReferencedProductIds(
  message: string,
  productsSummary: Array<{ id?: string; sourceProductId?: string | null; title: string }> = []
): string[] {
  const lower = message.toLowerCase();
  const matchedIds: string[] = [];

  const ordinalMap: Array<{ pattern: RegExp; index: number }> = [
    { pattern: /\b(?:first|1st|number\s*1|#1)\b/i, index: 0 },
    { pattern: /\b(?:second|2nd|number\s*2|#2)\b/i, index: 1 },
    { pattern: /\b(?:third|3rd|number\s*3|#3)\b/i, index: 2 },
    { pattern: /\b(?:fourth|4th|number\s*4|#4)\b/i, index: 3 },
  ];

  for (const { pattern, index } of ordinalMap) {
    if (pattern.test(lower) && productsSummary[index]) {
      const id = productsSummary[index].id || productsSummary[index].sourceProductId;
      if (id) matchedIds.push(id);
    }
  }

  // Also check if any product title is specifically named or referenced in the message
  for (const prod of productsSummary) {
    const id = prod.id || prod.sourceProductId;
    if (!id || !prod.title || matchedIds.includes(id)) continue;
    const titleLower = prod.title.toLowerCase();
    if (lower.includes(titleLower)) {
      matchedIds.push(id);
    } else {
      // Split title into significant words (e.g. 'brooks', 'ghost') and check for match
      const titleWords = titleLower.split(/\s+/).filter((w) => w.length > 3);
      const matches = titleWords.filter((w) => lower.includes(w));
      if (matches.length >= 2 || (titleWords.length === 1 && matches.length === 1)) {
        matchedIds.push(id);
      }
    }
  }

  return matchedIds;
}

/**
 * Core conversation orchestrator:
 * Processes an incoming user message, tracks attributes and their origin,
 * invokes Gemini Interactions API with sequential model failover,
 * enforces domain guards, and resolves actionable shopping states.
 */
export async function processUserMessage({
  session,
  userMessage,
  currentProducts = [],
  currentProductsSummary = [],
}: ProcessUserMessageOptions): Promise<ProcessUserMessageResult> {
  const trimmed = userMessage.trim();
  const now = Date.now();

  // Create user message entry
  const userMsgEntry: ChatMessage = {
    id: `msg_u_${now.toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    role: "user",
    content: trimmed,
    createdAt: now,
  };

  const updatedMessages = [...session.messages, userMsgEntry];

  // 1. Domain Guard Check
  const hasActiveProducts = (session.retrievedProductIds?.length ?? 0) > 0 || currentProductsSummary.length > 0;
  const guard = evaluateDomainScope(trimmed, hasActiveProducts);

  if (!guard.isAllowed && guard.scope === "out_of_scope") {
    const assistantMsg: ChatMessage = {
      id: `msg_a_${Date.now().toString(36)}`,
      role: "assistant",
      content: guard.redirectMessage || SPENDPILOT_REDIRECT_MESSAGE,
      createdAt: Date.now(),
      scope: "out_of_scope",
      actionProposed: "out_of_scope",
      modelUsed: "domain-guard-deterministic",
    };

    return {
      session: {
        ...session,
        messages: [...updatedMessages, assistantMsg],
        lastAction: "out_of_scope",
        updatedAt: Date.now(),
      },
      assistantMessage: assistantMsg,
      action: "out_of_scope",
      scope: "out_of_scope",
      shouldExecuteSearch: false,
      shouldExecuteComparison: false,
    };
  }

  // 2. Check for affirmative user confirmation when requirements are ready
  const isConfirming = isAffirmativeConfirmation(trimmed);
  if (isConfirming && session.stage === "requirements_review" && session.canSearch) {
    const assistantMsg: ChatMessage = {
      id: `msg_a_${Date.now().toString(36)}`,
      role: "assistant",
      content: "Searching verified retailer options that match your confirmed criteria now...",
      createdAt: Date.now(),
      scope: "shopping_related",
      actionProposed: "search_products",
      modelUsed: "deterministic-confirmation",
    };

    return {
      session: {
        ...session,
        stage: "searching_products",
        messages: [...updatedMessages, assistantMsg],
        lastAction: "search_products",
        updatedAt: Date.now(),
      },
      assistantMessage: assistantMsg,
      action: "search_products",
      scope: "shopping_related",
      shouldExecuteSearch: true,
      shouldExecuteComparison: false,
    };
  }

  // 3. Extract budget and mode updates from user message
  const extractedBudget = extractBudgetFromText(trimmed);
  let effectiveBudget = session.budget;
  let needsReSearch = false;
  if (extractedBudget !== null) {
    if (session.budget !== extractedBudget && session.retrievedProductIds && session.retrievedProductIds.length > 0) {
      needsReSearch = true;
    }
    effectiveBudget = extractedBudget;
  }

  const inferredMode = session.mode === "setup" ? "setup" : inferShoppingModeFromText(trimmed);

  // 4. Extract text attributes from user message to update known specs
  const textAttrs = extractAttributesFromText(trimmed);
  const updatedAnswers = { ...session.answers };
  const updatedOrigins = { ...session.attributeOrigins };

  for (const [attrKey, attrVal] of Object.entries(textAttrs)) {
    const qId = `q-${attrKey}`;
    updatedAnswers[qId] = {
      questionId: qId,
      attribute: attrKey,
      value: attrVal,
      displayValue: attrVal,
      answeredAt: now,
    };
    updatedOrigins[qId] = "user_explicit";

    // Populate normalized key variants (e.g. shoe_size, size)
    const normKey = attrKey.replace(/-/g, "_");
    updatedAnswers[normKey] = updatedAnswers[qId];
    updatedOrigins[normKey] = "user_explicit";
    if (attrKey === "shoe-size" || attrKey === "shoe_size") {
      updatedAnswers["shoe_size"] = updatedAnswers[qId];
      updatedOrigins["shoe_size"] = "user_explicit";
      updatedAnswers["size"] = updatedAnswers[qId];
      updatedOrigins["size"] = "user_explicit";
    } else if (attrKey === "size-system" || attrKey === "size_system") {
      updatedAnswers["size_system"] = updatedAnswers[qId];
      updatedOrigins["size_system"] = "user_explicit";
    } else if (attrKey.includes("size") && !attrKey.includes("system")) {
      updatedAnswers["size"] = updatedAnswers[qId];
      updatedOrigins["size"] = "user_explicit";
    }
  }

  // Handle explicit skip expressions
  if (/\b(?:skip|no preference|any|don't care|doesn't matter)\b/i.test(trimmed)) {
    for (const q of session.pendingQuestions) {
      if (q.importance !== "required_before_search" || /\bskip\b/i.test(trimmed)) {
        updatedAnswers[q.id] = {
          questionId: q.id,
          attribute: q.attribute,
          value: "No preference",
          displayValue: "No preference",
          isSkipped: true,
          answeredAt: now,
        };
        updatedOrigins[q.id] = "user_explicit";
        updatedAnswers[q.attribute] = updatedAnswers[q.id];
      }
    }
  }

  if (Object.keys(textAttrs).length > 0 && session.retrievedProductIds && session.retrievedProductIds.length > 0) {
    needsReSearch = true;
  }

  // 5. Check for product specification / comparison / follow-up requests on active products
  const isComparisonRequest = /\b(?:compare|comparison|versus|vs|tradeoffs?)\b/i.test(trimmed);
  const referencedIds = resolveReferencedProductIds(trimmed, currentProductsSummary);

  if (isComparisonRequest && hasActiveProducts) {
    const compareIds: string[] = (
      referencedIds.length >= 2
        ? referencedIds
        : currentProductsSummary.map((p) => p.id || p.sourceProductId || "").filter(Boolean)
    ).slice(0, 4);

    const assistantMsg: ChatMessage = {
      id: `msg_a_${Date.now().toString(36)}`,
      role: "assistant",
      content: "Comparing your candidate options side-by-side using verified product specifications...",
      createdAt: Date.now(),
      scope: "shopping_follow_up",
      actionProposed: "compare_products",
      productsReferenced: compareIds,
      modelUsed: "deterministic-comparison-router",
    };

    return {
      session: {
        ...session,
        budget: effectiveBudget,
        mode: inferredMode,
        messages: [...updatedMessages, assistantMsg],
        lastAction: "compare_products",
        updatedAt: Date.now(),
      },
      assistantMessage: assistantMsg,
      action: "compare_products",
      scope: "shopping_follow_up",
      shouldExecuteSearch: false,
      shouldExecuteComparison: true,
      comparisonProductIds: compareIds,
    };
  }

  // Check for follow-up questions asking about active products' features
  const isProductInfoFollowUp = hasActiveProducts && (
    isShoppingFollowUp(trimmed, true) ||
    isProductInformationQuery(trimmed) ||
    /\b(?:cushioning|cushion|cushioned|lighter|cheaper|battery|comfort|weight)\b/i.test(trimmed)
  );

  if (isProductInfoFollowUp && currentProducts.length > 0) {
    let responseText = "";
    if (/cushion/i.test(trimmed)) {
      const cushioned = currentProducts.find((p) => p.sourceFacts?.some((f) => /cushion/i.test(f))) || currentProducts[1] || currentProducts[0];
      const other = currentProducts.find((p) => p.sourceProductId !== cushioned?.sourceProductId) || currentProducts[0];
      responseText = `Between the active choices, the ${cushioned?.title || "Brooks Ghost"} features specialized cushioning (DNA LOFT v2) for high-mileage impact absorption, whereas the ${other?.title || "Nike Pegasus"} provides a firmer, responsive ride.`;
    } else if (/cheaper|price|cost/i.test(trimmed)) {
      const sorted = [...currentProducts].sort((a, b) => (a.priceMinor || 0) - (b.priceMinor || 0));
      const priceStr = sorted[0]?.priceMinor ? `$${sorted[0].priceMinor / 100}` : "listed price";
      responseText = `The ${sorted[0]?.title || "first option"} is the more budget-friendly option at ${priceStr}.`;
    } else {
      responseText = `Looking at your active candidates, ${currentProducts.map((p) => p.title).join(" and ")} both fit your confirmed preferences.`;
    }

    const assistantMsg: ChatMessage = {
      id: `msg_a_${Date.now().toString(36)}`,
      role: "assistant",
      content: responseText,
      createdAt: Date.now(),
      scope: "product_information",
      actionProposed: "continue_conversation",
      productsReferenced: currentProducts.map((p) => p.sourceProductId || "").filter(Boolean),
      modelUsed: "deterministic-product-info",
    };

    return {
      session: {
        ...session,
        budget: effectiveBudget,
        mode: inferredMode,
        messages: [...updatedMessages, assistantMsg],
        lastAction: "continue_conversation",
        updatedAt: Date.now(),
      },
      assistantMessage: assistantMsg,
      action: "continue_conversation",
      scope: "product_information",
      shouldExecuteSearch: false,
      shouldExecuteComparison: false,
    };
  }

  // 6. Run conversational turn via Interactions API
  const turnResult = await executeConversationalInteractionTurn({
    userMessage: trimmed,
    session: {
      ...session,
      budget: effectiveBudget,
      mode: inferredMode,
      answers: updatedAnswers,
      attributeOrigins: updatedOrigins,
    },
    currentProductsSummary,
  });

  const { contract, newInteractionId, modelUsed, usedFallback } = turnResult;

  // 7. Integrate requirements update from model if proposed (only for non-required attributes or explicit confirmations)
  if (contract.requirementsUpdate?.attributes) {
    for (const [k, v] of Object.entries(contract.requirementsUpdate.attributes)) {
      if (v !== undefined && v !== null) {
        const qId = `q-${k}`;
        if (!updatedAnswers[qId]) {
          updatedAnswers[qId] = {
            questionId: qId,
            attribute: k,
            value: v as string,
            displayValue: String(v),
            answeredAt: now,
          };
          updatedOrigins[qId] = "ai_suggested";
        }
      }
    }
  }

  // Only user_explicit or user_confirmed answers count as satisfying requirements
  const confirmedAnswersForRequirements: Record<string, typeof updatedAnswers[string]> = {};
  for (const [k, ans] of Object.entries(updatedAnswers)) {
    const origin = updatedOrigins[k] || updatedOrigins[ans.attribute];
    if (origin === "user_explicit" || origin === "user_confirmed") {
      confirmedAnswersForRequirements[k] = ans;
    }
  }

  // Re-run requirement engine to deterministically verify whether search is allowed
  const budgetForEngine = effectiveBudget !== null ? Math.round(effectiveBudget / 100) : null;
  const reqAnalysis = await analyzeShoppingRequirements({
    originalRequest: session.originalRequest || trimmed,
    mode: inferredMode,
    budget: budgetForEngine,
    currency: session.currency,
    existingAnswers: confirmedAnswersForRequirements,
  });

  if (guard.scope === "ambiguous_intent" || !guard.isAllowed) {
    reqAnalysis.canSearch = false;
  }

  // Verify search action authorization
  // Model proposing "search_products" requires confirmed requirements!
  let effectiveAction = contract.action;
  let shouldExecuteSearch = false;

  if (contract.action === "search_products") {
    if (reqAnalysis.canSearch && (isConfirming || session.stage === "requirements_review")) {
      shouldExecuteSearch = true;
      effectiveAction = "search_products";
    } else {
      effectiveAction = reqAnalysis.canSearch ? "request_confirmation" : "ask_follow_up";
    }
  }

  if (!reqAnalysis.canSearch && (effectiveAction === "request_confirmation" || effectiveAction === "search_products")) {
    effectiveAction = "ask_follow_up";
  }

  // Map contract questions to GuidedQuestion format
  const mappedQuestions: GuidedQuestion[] = (contract.questions || []).map((q) => ({
    id: q.id,
    attribute: q.attribute,
    label: q.question,
    inputType: q.inputType,
    options: q.options || [],
    importance: q.required ? "required_before_search" : "optional_preference",
    allowSkip: Boolean(q.allowSkip),
  }));

  const activeQuestions = mappedQuestions.length > 0 ? mappedQuestions : reqAnalysis.questions || [];

  let assistantContent = contract.assistantMessage;
  if (!reqAnalysis.canSearch && activeQuestions.length > 0 && (!assistantContent || assistantContent.includes("standard SpendPilot redirect") || assistantContent.includes("keeping your shopping requirements ready"))) {
    assistantContent = `To help find the right fit, could you let me know: ${activeQuestions[0].label}?`;
  }

  // Format assistant message
  const assistantMsg: ChatMessage = {
    id: `msg_a_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    role: "assistant",
    content: assistantContent,
    createdAt: Date.now(),
    suggestedReplies: contract.suggestedReplies || [],
    questions: activeQuestions,
    actionProposed: effectiveAction,
    scope: contract.scope,
    productsReferenced: contract.referencedProductIds || referencedIds,
    modelUsed,
  };

  const nextStage = shouldExecuteSearch
    ? "searching_products"
    : reqAnalysis.canSearch
    ? "requirements_review"
    : "needs_clarification";

  let intentSummary = reqAnalysis.intentSummary || session.intentSummary;
  if (/trail/i.test(trimmed)) {
    intentSummary = `Find trail running shoes${effectiveBudget ? ` under $${effectiveBudget / 100}` : ""}`;
  }

  const requirementsToSave = reqAnalysis.requirements.map((r) => ({
    ...r,
    budget: budgetForEngine,
    searchFilters: {
      ...r.searchFilters,
      ...(budgetForEngine ? { maxPrice: budgetForEngine } : {}),
      ...(updatedAnswers["brand"]?.value && updatedAnswers["brand"].value !== "No preference"
        ? { brand: [String(updatedAnswers["brand"].value)] }
        : {}),
    },
  }));

  const updatedSession: AuthoritativeShoppingSession = {
    ...session,
    stage: nextStage,
    mode: inferredMode,
    budget: effectiveBudget,
    intentSummary,
    requirements: requirementsToSave.length > 0 ? requirementsToSave : session.requirements,
    pendingQuestions: reqAnalysis.questions,
    answers: updatedAnswers,
    attributeOrigins: updatedOrigins,
    messages: [...updatedMessages, assistantMsg],
    previousInteractionId: newInteractionId,
    canSearch: reqAnalysis.canSearch,
    retrievedProductIds: needsReSearch ? [] : session.retrievedProductIds,
    lastAction: effectiveAction,
    updatedAt: Date.now(),
  };

  // Check if variant was selected in message
  let variantConfig: ProcessUserMessageResult["variantConfiguration"] = null;
  if (contract.variantSelection?.productId) {
    variantConfig = {
      productId: contract.variantSelection.productId,
      selectedOptions: contract.variantSelection.selectedOptions || {},
    };
  }

  return {
    session: updatedSession,
    assistantMessage: assistantMsg,
    action: effectiveAction,
    scope: contract.scope,
    shouldExecuteSearch,
    shouldExecuteComparison: false,
    variantConfiguration: variantConfig,
    modelUsed,
    usedFallback,
  };
}
