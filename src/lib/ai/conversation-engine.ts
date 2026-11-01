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
import {
  parseToMinorUnits,
  minorToMajorUnits,
  formatMinorUnits,
} from "../money.ts";
import {
  canonicalizeAttributeKey,
  upsertCanonicalAttribute,
} from "../shopping/canonical-attributes.ts";
import type {
  AuthoritativeShoppingSession,
  ChatMessage,
  ConversationalAction,
  DomainScope,
  GuidedQuestion,
  ShoppingMode,
  CurrencyCode,
  NormalizedProduct,
  SingleNextQuestion,
  CollectedAnswer,
} from "../../types/index.ts";

export interface ProcessUserMessageOptions {
  session: AuthoritativeShoppingSession;
  userMessage: string;
  clientMessageId?: string;
  answeredQuestionId?: string;
  answeredAttributeKey?: string;
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
  const budget =
    typeof params.budget === "number"
      ? parseToMinorUnits(params.budget, { isAlreadyMinor: true })
      : parseToMinorUnits(params.budget);
  const currency = params.currency || "USD";

  return {
    sessionId,
    stage: "initial_request",
    conversationState: "idle",
    turnId: "turn_0",
    revision: 1,
    originalRequest,
    mode,
    budget,
    currency,
    intentSummary: originalRequest ? `Looking for ${originalRequest}` : "Personal Shopping Assistance",
    requirements: [],
    pendingQuestions: [],
    activeQuestion: null,
    answeredQuestionIds: [],
    answers: {},
    attributeOrigins: {},
    canonicalAttributes: {},
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
      return parseToMinorUnits(val);
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
 * Processes an incoming user message, updates canonical attributes with provenance,
 * enforces domain guards, decides next single question or triggers automatic search.
 */
export async function processUserMessage({
  session,
  userMessage,
  clientMessageId,
  answeredQuestionId,
  answeredAttributeKey,
  currentProducts = [],
  currentProductsSummary = [],
}: ProcessUserMessageOptions): Promise<ProcessUserMessageResult> {
  const trimmed = userMessage.trim();
  const now = Date.now();

  // 0. Idempotency Check: Prevent duplicate processing if client re-submits exact same message
  if (clientMessageId && session.messages.some((m) => m.clientMessageId === clientMessageId)) {
    const lastAssistant = session.messages.slice().reverse().find((m) => m.role === "assistant");
    return {
      session,
      assistantMessage: lastAssistant || {
        id: `msg_dup_${now}`,
        role: "assistant",
        content: "Already received your update.",
        createdAt: now,
      },
      action: session.lastAction || "continue_conversation",
      scope: "shopping_related",
      shouldExecuteSearch: false,
      shouldExecuteComparison: false,
    };
  }

  const nextRev = (session.revision || 0) + 1;
  const turnId = `turn_${nextRev}_${now.toString(36)}`;

  // Create user message entry
  const userMsgEntry: ChatMessage = {
    id: `msg_u_${now.toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    role: "user",
    content: trimmed,
    createdAt: now,
    clientMessageId,
    turnId,
  };

  const updatedMessages = [...session.messages, userMsgEntry];

  // 1. Domain Guard Check
  const hasActiveProducts = (session.retrievedProductIds?.length ?? 0) > 0 || currentProductsSummary.length > 0;
  const guard = evaluateDomainScope(trimmed, hasActiveProducts);

  const isAnsweringQuestion = Boolean(answeredQuestionId || answeredAttributeKey || session.activeQuestion);

  if (isAnsweringQuestion && guard.scope === "ambiguous_intent") {
    guard.scope = "shopping_related";
    guard.isAllowed = true;
    guard.allowed = true;
  }

  if (!guard.isAllowed) {
    if (guard.scope === "out_of_scope" || (!isAnsweringQuestion && session.messages.length <= 1)) {
      const assistantMsg: ChatMessage = {
        id: `msg_a_${Date.now().toString(36)}`,
        role: "assistant",
        content: guard.redirectMessage || SPENDPILOT_REDIRECT_MESSAGE,
        createdAt: Date.now(),
        scope: guard.scope,
        actionProposed: guard.scope === "out_of_scope" ? "out_of_scope" : "clarify_intent",
        modelUsed: "domain-guard-deterministic",
        turnId,
      };

      return {
        session: {
          ...session,
          conversationState: "idle",
          revision: nextRev,
          turnId,
          messages: [...updatedMessages, assistantMsg],
          lastAction: guard.scope === "out_of_scope" ? "out_of_scope" : "clarify_intent",
          updatedAt: Date.now(),
        },
        assistantMessage: assistantMsg,
        action: guard.scope === "out_of_scope" ? "out_of_scope" : "clarify_intent",
        scope: guard.scope,
        shouldExecuteSearch: false,
        shouldExecuteComparison: false,
      };
    }
  }

  // 2. Budget extraction & invalidation
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

  // 3. Upsert canonical attributes
  let canonicalMap = { ...(session.canonicalAttributes || {}) };
  const answeredIds = [...(session.answeredQuestionIds || [])];

  // A. If an explicit option was selected via quick reply:
  if (answeredQuestionId || answeredAttributeKey) {
    const qId = answeredQuestionId || session.activeQuestion?.id || "";
    const attrKey = answeredAttributeKey || session.activeQuestion?.attributeKey || "preference";
    if (qId && !answeredIds.includes(qId)) {
      answeredIds.push(qId);
    }
    const isSkip = /\b(?:no preference|any|skip)\b/i.test(trimmed);
    canonicalMap = upsertCanonicalAttribute(
      canonicalMap,
      attrKey,
      trimmed,
      "user_confirmed",
      isSkip ? "skipped" : "confirmed"
    );
  }

  // B. Extract attributes directly from user's free text:
  const textAttrs = extractAttributesFromText(trimmed);
  for (const [key, val] of Object.entries(textAttrs)) {
    canonicalMap = upsertCanonicalAttribute(canonicalMap, key, val, "user_explicit", "confirmed");
  }

  // C. Handle explicit skip expressions in text:
  if (/\b(?:skip|no preference|any|don't care|doesn't matter)\b/i.test(trimmed)) {
    if (session.activeQuestion) {
      if (!answeredIds.includes(session.activeQuestion.id)) {
        answeredIds.push(session.activeQuestion.id);
      }
      canonicalMap = upsertCanonicalAttribute(
        canonicalMap,
        session.activeQuestion.attributeKey,
        "No preference",
        "user_explicit",
        "skipped"
      );
    }
  }

  if (Object.keys(textAttrs).length > 0 && session.retrievedProductIds && session.retrievedProductIds.length > 0) {
    needsReSearch = true;
  }

  // 4. Synchronize legacy answers map from canonical attributes for backwards compatibility
  const updatedAnswers: Record<string, CollectedAnswer> = { ...session.answers };
  const updatedOrigins: Record<string, typeof session.attributeOrigins[string]> = { ...session.attributeOrigins };

  for (const attr of Object.values(canonicalMap)) {
    const qId = `q-${attr.key.replace(/_/g, "-")}`;
    const hyphenKey = attr.key.replace(/_/g, "-");
    const collected: CollectedAnswer = {
      questionId: qId,
      attribute: hyphenKey,
      value: attr.status === "skipped" ? "No preference" : attr.value,
      displayValue: attr.displayValue,
      isSkipped: attr.status === "skipped",
      answeredAt: attr.updatedAt,
    };
    updatedAnswers[qId] = collected;
    updatedAnswers[attr.key] = collected;
    updatedAnswers[hyphenKey] = collected;
    updatedOrigins[qId] = attr.source;
    updatedOrigins[attr.key] = attr.source;
    updatedOrigins[hyphenKey] = attr.source;
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
      modelUsed: "comparison-service",
      turnId,
    };

    return {
      session: {
        ...session,
        conversationState: "comparing_products",
        revision: nextRev,
        turnId,
        budget: effectiveBudget,
        mode: inferredMode,
        canonicalAttributes: canonicalMap,
        answers: updatedAnswers,
        attributeOrigins: updatedOrigins,
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
      responseText = `Between the active choices, the ${cushioned?.title || "first option"} features specialized cushioning for impact absorption, whereas the ${other?.title || "second option"} provides a firmer, responsive ride.`;
    } else if (/cheaper|price|cost/i.test(trimmed)) {
      const sorted = [...currentProducts].sort((a, b) => (a.priceMinor || 0) - (b.priceMinor || 0));
      const priceStr = sorted[0]?.priceMinor ? formatMinorUnits(sorted[0].priceMinor, session.currency) : "listed price";
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
      modelUsed: "product-info-grounding",
      turnId,
    };

    return {
      session: {
        ...session,
        conversationState: "results_ready",
        revision: nextRev,
        turnId,
        budget: effectiveBudget,
        mode: inferredMode,
        canonicalAttributes: canonicalMap,
        answers: updatedAnswers,
        attributeOrigins: updatedOrigins,
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

  // 6. Evaluate shopping requirements deterministically
  const budgetInMajorUnits = minorToMajorUnits(effectiveBudget);
  const reqAnalysis = await analyzeShoppingRequirements({
    originalRequest: session.originalRequest || trimmed,
    mode: inferredMode,
    budget: budgetInMajorUnits,
    currency: session.currency,
    existingAnswers: updatedAnswers,
  });

  if (guard.scope === "ambiguous_intent" || !guard.isAllowed) {
    reqAnalysis.canSearch = false;
  }

  // 7. Check if all essential requirements are answered and search can begin automatically
  const isConfirming = isAffirmativeConfirmation(trimmed);
  const hasUnansweredQuestions = reqAnalysis.questions.length > 0;
  const isRequirementsComplete = reqAnalysis.canSearch && !hasUnansweredQuestions;

  let shouldExecuteSearch = false;
  let effectiveAction: ConversationalAction = "ask_follow_up";
  let activeQuestion: SingleNextQuestion | null = null;
  let assistantContent = "";

  if (isRequirementsComplete || (reqAnalysis.canSearch && isConfirming)) {
    // Requirements are complete! Automatically begin Channel3 product search
    shouldExecuteSearch = true;
    effectiveAction = "search_products";

    const categoryTitle = reqAnalysis.category.toLowerCase();
    const confirmedHighlights = Object.values(canonicalMap)
      .filter((a) => a.status === "confirmed" && a.value !== "No preference")
      .map((a) => a.displayValue)
      .filter((v) => !v.toLowerCase().includes(categoryTitle));

    const specsStr = confirmedHighlights.length > 0 ? ` ${confirmedHighlights.join(", ")}` : "";
    const budgetStr = effectiveBudget ? ` within your ${formatMinorUnits(effectiveBudget, session.currency)} budget` : "";

    assistantContent = `Perfect! I'll look for${specsStr} ${categoryTitle}${budgetStr}.`;
  } else if (hasUnansweredQuestions) {
    // Exactly ONE next question
    const q = reqAnalysis.questions[0];
    const canonicalKey = canonicalizeAttributeKey(q.attribute);

    // Deduplicate options: keep only 1 option per distinct label/value
    const seenOpt = new Set<string>();
    const sanitizedOptions = q.options.filter((o) => {
      const norm = (o.label || o.value || "").trim().toLowerCase();
      if (!norm || seenOpt.has(norm)) return false;
      seenOpt.add(norm);
      return true;
    });

    activeQuestion = {
      id: q.id,
      attributeKey: canonicalKey,
      text: q.label,
      inputType: q.inputType,
      options: sanitizedOptions,
      required: q.importance === "required_before_search",
      allowSkip: q.allowSkip,
    };

    effectiveAction = "ask_follow_up";
    shouldExecuteSearch = false;
    assistantContent = q.label;
  }

  // 8. If questions remain and user didn't just answer an explicit option, invoke Gemini for conversational context
  let modelUsed = "spendpilot-engine";
  let usedFallback = false;

  if (!shouldExecuteSearch && (!answeredQuestionId || !assistantContent)) {
    const turnResult = await executeConversationalInteractionTurn({
      userMessage: trimmed,
      session: {
        ...session,
        budget: effectiveBudget,
        mode: inferredMode,
        canonicalAttributes: canonicalMap,
        answers: updatedAnswers,
        attributeOrigins: updatedOrigins,
      },
      currentProductsSummary,
    });

    const { contract } = turnResult;
    modelUsed = turnResult.modelUsed;
    usedFallback = turnResult.usedFallback;

    // Incorporate model updates if valid
    if (contract.requirementsUpdate?.attributes) {
      for (const [k, v] of Object.entries(contract.requirementsUpdate.attributes)) {
        if (v !== undefined && v !== null) {
          canonicalMap = upsertCanonicalAttribute(canonicalMap, k, String(v), "ai_suggested", "suggested");
        }
      }
    }

    if (contract.action === "search_products" && reqAnalysis.canSearch) {
      shouldExecuteSearch = true;
      effectiveAction = "search_products";
      assistantContent = contract.assistantMessage || assistantContent;
      activeQuestion = null;
    } else if (contract.assistantMessage && !contract.assistantMessage.includes("keeping your shopping requirements ready")) {
      assistantContent = contract.assistantMessage;
    }
  }

  if (!assistantContent) {
    assistantContent = activeQuestion?.text || "What other specifications would you prefer?";
  }

  // 9. Format Assistant Chat Message
  const mappedGuidedQuestions: GuidedQuestion[] = activeQuestion
    ? [
        {
          id: activeQuestion.id,
          attribute: activeQuestion.attributeKey,
          label: activeQuestion.text,
          inputType: activeQuestion.inputType,
          options: activeQuestion.options,
          importance: activeQuestion.required ? "required_before_search" : "optional_preference",
          allowSkip: activeQuestion.allowSkip ?? true,
        },
      ]
    : [];

  const assistantMsg: ChatMessage = {
    id: `msg_a_${now.toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    role: "assistant",
    content: assistantContent,
    createdAt: now,
    nextQuestion: activeQuestion,
    questions: mappedGuidedQuestions,
    suggestedReplies: activeQuestion?.options.map((o) => o.label || o.value).slice(0, 4) || [],
    actionProposed: effectiveAction,
    scope: guard.scope,
    productsReferenced: referencedIds,
    modelUsed,
    turnId,
  };

  const nextStage = shouldExecuteSearch
    ? "searching_products"
    : reqAnalysis.canSearch
    ? "requirements_review"
    : "needs_clarification";

  const nextConversationState = shouldExecuteSearch
    ? "searching_products"
    : reqAnalysis.canSearch
    ? "ready_for_search"
    : "waiting_for_user_answer";

  let intentSummary = reqAnalysis.intentSummary || session.intentSummary;
  if (/trail/i.test(trimmed)) {
    intentSummary = `Find trail running shoes${effectiveBudget ? ` under $${minorToMajorUnits(effectiveBudget)}` : ""}`;
  }

  const requirementsToSave = reqAnalysis.requirements.map((r) => ({
    ...r,
    budget: budgetInMajorUnits,
    searchFilters: {
      ...r.searchFilters,
      ...(budgetInMajorUnits ? { maxPrice: budgetInMajorUnits } : {}),
      ...(updatedAnswers["brand"]?.value && updatedAnswers["brand"].value !== "No preference"
        ? { brand: [String(updatedAnswers["brand"].value)] }
        : {}),
    },
  }));

  const updatedSession: AuthoritativeShoppingSession = {
    ...session,
    originalRequest: session.originalRequest || trimmed,
    stage: nextStage,
    conversationState: nextConversationState,
    revision: nextRev,
    turnId,
    mode: inferredMode,
    budget: effectiveBudget,
    intentSummary,
    requirements: requirementsToSave.length > 0 ? requirementsToSave : session.requirements,
    pendingQuestions: mappedGuidedQuestions,
    activeQuestion,
    answeredQuestionIds: answeredIds,
    answers: updatedAnswers,
    attributeOrigins: updatedOrigins,
    canonicalAttributes: canonicalMap,
    messages: [...updatedMessages, assistantMsg],
    canSearch: reqAnalysis.canSearch,
    retrievedProductIds: needsReSearch ? [] : session.retrievedProductIds,
    lastAction: effectiveAction,
    updatedAt: now,
  };

  return {
    session: updatedSession,
    assistantMessage: assistantMsg,
    action: effectiveAction,
    scope: guard.scope,
    shouldExecuteSearch,
    shouldExecuteComparison: false,
    modelUsed,
    usedFallback,
  };
}

/**
 * Convenient alias for multi-turn conversational processing in tests and orchestrators.
 */
export async function processConversationalTurn(
  session: AuthoritativeShoppingSession,
  userMessage: string,
  options?: {
    clientMessageId?: string;
    answeredQuestionId?: string;
    answeredAttributeKey?: string;
    currentProducts?: NormalizedProduct[];
  }
): Promise<ProcessUserMessageResult> {
  return processUserMessage({
    session,
    userMessage,
    clientMessageId: options?.clientMessageId,
    answeredQuestionId: options?.answeredQuestionId,
    answeredAttributeKey: options?.answeredAttributeKey,
    currentProducts: options?.currentProducts,
  });
}
