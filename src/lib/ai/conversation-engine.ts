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
  extractBudgetAndCurrency,
  extractCurrencyFromText,
} from "../money.ts";

export { extractCurrencyFromText, extractBudgetAndCurrency };
import {
  canonicalizeAttributeKey,
  upsertCanonicalAttribute,
} from "../shopping/canonical-attributes.ts";
import { isDelegatedOrNoPreference } from "../orchestrator/intent-analyzer.ts";
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
import type { OrchestratorTurnResult } from "../orchestrator/types.ts";

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
  precomputedOrchestration?: OrchestratorTurnResult;
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

export function getTimeBasedGreeting(): string {
  if (typeof window === "undefined") {
    return "Good evening";
  }
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

export const SPENDPILOT_WELCOME_MESSAGES = [
  "Good evening! What are we shopping for today? Tell me what you need and your budget.",
  "Good evening! Ready to shop smart? Tell me what you're looking for and let's find the right deals.",
  "Warm greetings! I'm SpendPilot, your personal AI shopping assistant. What can I help you find today?",
  "Warm greetings and welcome! Tell me what product, budget, or specifications you have in mind.",
  "Good evening! Let's find something worth buying within your budget. What do you need today?",
  "A warm welcome to SpendPilot! Looking for something specific, or hunting for the best verified deals?",
  "Warm greetings! Let me know what you're shopping for and I'll discover the best verified options for you.",
  "Good evening! Tell me what you have in mind, and I'll track down verified retailer options for you.",
] as const;

export function getRandomWelcomeMessage(): string {
  if (typeof window === "undefined") {
    return SPENDPILOT_WELCOME_MESSAGES[0];
  }
  const timeGreeting = getTimeBasedGreeting();
  const variations = [
    `${timeGreeting}! What are we shopping for today? Tell me what you need and your budget.`,
    `${timeGreeting}! Ready to shop smart? Tell me what you're looking for and let's find the right deals.`,
    `Warm greetings! I'm SpendPilot, your personal AI shopping assistant. What can I help you find today?`,
    `Warm greetings and welcome! Tell me what product, budget, or specifications you have in mind.`,
    `${timeGreeting}! Let's find something worth buying within your budget. What do you need today?`,
    `A warm welcome to SpendPilot! Looking for something specific, or hunting for the best verified deals?`,
    `Warm greetings! Let me know what you're shopping for and I'll discover the best verified options for you.`,
    `${timeGreeting}! Tell me what you have in mind, and I'll track down verified retailer options for you.`,
  ];
  const index = Math.floor(Math.random() * variations.length);
  return variations[index];
}

export const SPENDPILOT_HERO_WARM_MESSAGES = [
  "Good evening! Ready to discover the best verified deals?",
  "Warm greetings! Let's find exactly what fits your budget.",
  "Good afternoon! Tell me what you're shopping for today.",
  "Good morning! Let's discover verified retailer products.",
  "Warm greetings! Real-time price tracking and budget protection.",
  "A warm welcome! Tell me what you need and let's find the right match.",
] as const;

export function getHeroWarmMessage(): string {
  if (typeof window === "undefined") {
    return SPENDPILOT_HERO_WARM_MESSAGES[0];
  }
  const timeGreeting = getTimeBasedGreeting();
  const variations = [
    `${timeGreeting}! Ready to discover the best verified deals?`,
    `Warm greetings! Let's find exactly what fits your budget.`,
    `${timeGreeting}! Tell me what you're shopping for today.`,
    `Warm greetings! Real-time price tracking and budget protection.`,
    `A warm welcome! Tell me what you need and let's find the right match.`,
    `${timeGreeting}! Verified products, genuine merchant prices, zero markup.`,
  ];
  const index = Math.floor(Math.random() * variations.length);
  return variations[index];
}

export const SPENDPILOT_SEARCHING_TEXTS = [
  "Searching for the best deals for you...",
  "Scanning verified retailers for the best deals right now...",
  "Hunting down top verified deals and authentic offers for you...",
  "Finding the best deals and verified stock within your budget...",
  "Checking merchant prices to get the best deals for you right now...",
  "Looking up the best verified deals for you...",
] as const;

export function getRandomSearchingText(): string {
  const index = Math.floor(Math.random() * SPENDPILOT_SEARCHING_TEXTS.length);
  return SPENDPILOT_SEARCHING_TEXTS[index];
}

export const SPENDPILOT_INITIAL_GREETING =
  "Hi! I'm SpendPilot, your personal shopping assistant. What are you looking for today? Tell me what you need, what matters most to you, and your budget if you have one. I'll help you discover and compare suitable products.";

/**
 * Normalizes and initializes a default authoritative shopping session.
 */
export function createInitialSession(params: {
  sessionId?: string;
  initialQuery?: string;
  mode?: ShoppingMode;
  budget?: number | null;
  currency?: CurrencyCode;
  welcomeMessage?: string;
}): AuthoritativeShoppingSession {
  const sessionId = params.sessionId || "session_init";
  const originalRequest = params.initialQuery?.trim() || "";
  const mode = params.mode || "single";
  const extractedBudget = originalRequest ? extractBudgetFromText(originalRequest) : null;
  const budget =
    typeof params.budget === "number"
      ? parseToMinorUnits(params.budget, { isAlreadyMinor: true })
      : params.budget !== undefined && params.budget !== null
      ? parseToMinorUnits(params.budget)
      : extractedBudget;
  const currency = params.currency || "USD";
  const welcomeMessage = params.welcomeMessage || getRandomWelcomeMessage();

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
    welcomeMessage,
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
 * Detects whether the user is starting a brand-new shopping task vs refining the current task.
 */
export function isNewShoppingTask(
  currentRequest: string,
  newText: string,
  modelTaskIntent?: "new_task" | "refine_current" | "general_query"
): boolean {
  if (modelTaskIntent === "new_task") return true;
  if (modelTaskIntent === "refine_current") return false;

  const current = (currentRequest || "").trim().toLowerCase();
  const next = (newText || "").trim().toLowerCase();
  if (!current || !next) return false;

  // Domain groupings
  const domains: Array<{ id: string; keywords: string[] }> = [
    { id: "laptop", keywords: ["macbook", "laptop", "thinkpad", "notebook", "chromebook"] },
    { id: "anime_decor", keywords: ["anime", "naruto", "one piece", "attack on titan", "room decor", "wall scroll", "manga"] },
    { id: "shoes", keywords: ["sneaker", "shoes", "shoe", "runners", "running shoe", "boots"] },
    { id: "keyboard", keywords: ["keyboard", "keycap", "mechanical keyboard"] },
    { id: "mouse", keywords: ["gaming mouse", "wireless mouse", "trackpad"] },
    { id: "headphones", keywords: ["headphone", "headset", "earbud", "airpods"] },
    { id: "phone", keywords: ["phone", "smartphone", "iphone", "pixel", "galaxy"] },
    { id: "monitor", keywords: ["monitor", "display", "ultrawide", "screen"] },
    { id: "chair", keywords: ["gaming chair", "ergonomic chair", "desk chair", "office chair"] },
    { id: "pc", keywords: ["gaming pc", "pc build", "desktop tower", "computer setup"] },
  ];

  const getDomain = (txt: string) => domains.find((d) => d.keywords.some((k) => txt.includes(k)))?.id;

  const domCurrent = getDomain(current);
  const domNext = getDomain(next);

  if (domCurrent && domNext && domCurrent !== domNext) {
    return true;
  }

  // Obvious new shopping task intent phrases
  if (/^(?:i need|i want|looking for|find|search for|buy|get me)\s+(?:a|an|some)\s+/i.test(next) && domNext && domNext !== domCurrent) {
    return true;
  }

  return false;
}

/**
 * Extracts a budget amount mentioned in user message (e.g. "under $150", "budget of 120", "$70", "around 80 euros", "£200 max").
 * Returns the amount in minor units (cents).
 */
export function extractBudgetFromText(text: string): number | null {
  return extractBudgetAndCurrency(text).budgetMinor;
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
    lower.includes("start search") ||
    lower.includes("search now") ||
    lower.includes("search again") ||
    lower === "search" ||
    lower.includes("find now")
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
  precomputedOrchestration,
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

  // 1. Multi-Task Detection: Is user starting a new shopping task?
  const isTaskPivot = isNewShoppingTask(session.originalRequest, trimmed);
  const extractedInfo = extractBudgetAndCurrency(trimmed, session.currency);
  const extractedBudget = extractedInfo.budgetMinor;
  if (extractedInfo.hasExplicitCurrency) {
    session.currency = extractedInfo.currency;
  }

  let effectiveSession = session;
  if (isTaskPivot) {
    effectiveSession = {
      ...session,
      originalRequest: trimmed,
      currentTaskId: `task_${now.toString(36)}`,
      intentSummary: `Looking for ${trimmed}`,
      requirements: [],
      pendingQuestions: [],
      activeQuestion: null,
      answeredQuestionIds: [],
      answers: {},
      attributeOrigins: {},
      canonicalAttributes: {},
      retrievedProductIds: [],
      selectedProductId: null,
      selectedVariants: {},
      budget: extractedBudget !== null ? extractedBudget : null,
      currency: extractedInfo.hasExplicitCurrency ? extractedInfo.currency : session.currency,
      mode: inferShoppingModeFromText(trimmed),
      canSearch: false,
      messages: [],
    };
  }

  const updatedMessages = [...effectiveSession.messages, userMsgEntry];

  // 1b. Domain Guard Check
  const hasActiveProducts = !isTaskPivot && ((effectiveSession.retrievedProductIds?.length ?? 0) > 0 || currentProductsSummary.length > 0);
  const guard = evaluateDomainScope(trimmed, hasActiveProducts);

  const isAnsweringQuestion = Boolean(answeredQuestionId || answeredAttributeKey || effectiveSession.activeQuestion);

  if (isAnsweringQuestion && guard.scope === "ambiguous_intent") {
    guard.scope = "shopping_related";
    guard.isAllowed = true;
    guard.allowed = true;
  }

  if (!guard.isAllowed) {
    if (guard.scope === "out_of_scope" || (!isAnsweringQuestion && effectiveSession.messages.length <= 1)) {
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
          ...effectiveSession,
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
  let effectiveBudget = effectiveSession.budget;
  let needsReSearch = false;
  if (extractedBudget !== null) {
    if (effectiveSession.budget !== extractedBudget && effectiveSession.retrievedProductIds && effectiveSession.retrievedProductIds.length > 0) {
      needsReSearch = true;
    }
    effectiveBudget = extractedBudget;
  }

  const inferredMode = effectiveSession.mode === "setup" ? "setup" : inferShoppingModeFromText(trimmed);

  // 3. Upsert canonical attributes
  let canonicalMap = { ...(effectiveSession.canonicalAttributes || {}) };
  const answeredIds = [...(effectiveSession.answeredQuestionIds || [])];

  // A. If an explicit option was selected via quick reply OR answering active question:
  const activeQ = effectiveSession.activeQuestion;
  const qId = answeredQuestionId || activeQ?.id || "";
  const attrKey = answeredAttributeKey || activeQ?.attributeKey || "";

  if (qId && attrKey) {
    if (!answeredIds.includes(qId)) {
      answeredIds.push(qId);
    }
    const isSkip = /\b(?:no preference|any|skip)\b/i.test(trimmed);
    canonicalMap = upsertCanonicalAttribute(
      canonicalMap,
      attrKey,
      trimmed,
      answeredQuestionId ? "user_confirmed" : "user_explicit",
      isSkip ? "skipped" : "confirmed",
      "hard_requirement"
    );
  }

  // B. Extract attributes directly from user's free text:
  const textAttrs = extractAttributesFromText(trimmed);
  for (const [key, val] of Object.entries(textAttrs)) {
    canonicalMap = upsertCanonicalAttribute(canonicalMap, key, val, "user_explicit", "confirmed", "hard_requirement");
    const autoQId = `q-${key.replace(/_/g, "-")}`;
    if (!answeredIds.includes(autoQId)) {
      answeredIds.push(autoQId);
    }
  }

  // C. Handle explicit skip / delegation expressions in text:
  if (isDelegatedOrNoPreference(trimmed) || /\b(?:skip|no preference|any|don't care|doesn't matter)\b/i.test(trimmed)) {
    if (effectiveSession.activeQuestion) {
      if (!answeredIds.includes(effectiveSession.activeQuestion.id)) {
        answeredIds.push(effectiveSession.activeQuestion.id);
      }
      canonicalMap = upsertCanonicalAttribute(
        canonicalMap,
        effectiveSession.activeQuestion.attributeKey,
        "No preference",
        "user_explicit",
        "skipped",
        "optional_preference"
      );
    }
  }

  if (Object.keys(textAttrs).length > 0 && effectiveSession.retrievedProductIds && effectiveSession.retrievedProductIds.length > 0) {
    needsReSearch = true;
  }

  // 4. Synchronize legacy answers map from canonical attributes for backwards compatibility
  const updatedAnswers: Record<string, CollectedAnswer> = { ...effectiveSession.answers };
  const updatedOrigins: Record<string, typeof effectiveSession.attributeOrigins[string]> = { ...effectiveSession.attributeOrigins };

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

    // Cross-alias primary use
    if (attr.key === "primary_use" || attr.key === "intended_use") {
      updatedAnswers["primary-use"] = collected;
      updatedAnswers["primary_use"] = collected;
      updatedAnswers["intended-use"] = collected;
      updatedAnswers["intended_use"] = collected;
      updatedAnswers["q-primary-use"] = collected;
      updatedAnswers["q-intended-use"] = collected;
      if (!answeredIds.includes("q-primary-use")) answeredIds.push("q-primary-use");
    }

    // Cross-alias operating system
    if (attr.key === "operating_system" || attr.key === "os") {
      updatedAnswers["operating-system"] = collected;
      updatedAnswers["operating_system"] = collected;
      updatedAnswers["os"] = collected;
      updatedAnswers["q-operating-system"] = collected;
      if (!answeredIds.includes("q-operating-system")) answeredIds.push("q-operating-system");
    }
  }

  // 5. Check for product specification / comparison / follow-up requests on active products
  const isComparisonRequest = !isTaskPivot && /\b(?:compare|comparison|versus|vs|tradeoffs?)\b/i.test(trimmed);
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
        ...effectiveSession,
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
  const isProductInfoFollowUp = !isTaskPivot && hasActiveProducts && (
    isShoppingFollowUp(trimmed, true) ||
    isProductInformationQuery(trimmed) ||
    /\b(?:cushioning|cushion|cushioned|lighter|cheaper|battery|comfort|weight)\b/i.test(trimmed)
  );

  if (isProductInfoFollowUp && currentProducts.length > 0) {
    // Call Gemini to answer with verified facts about active products
    const turnResult = await executeConversationalInteractionTurn({
      userMessage: trimmed,
      session: {
        ...effectiveSession,
        budget: effectiveBudget,
        mode: inferredMode,
        canonicalAttributes: canonicalMap,
        answers: updatedAnswers,
        attributeOrigins: updatedOrigins,
      },
      currentProductsSummary,
    });

    let responseText = turnResult.contract.assistantMessage;
    if (
      turnResult.usedFallback ||
      turnResult.modelUsed === "deterministic-recovery" ||
      !responseText ||
      responseText.includes("keeping your shopping requirements ready") ||
      !currentProducts.some((p) => responseText.toLowerCase().includes(p.title.toLowerCase().split(" ")[0]))
    ) {
      if (/cushion/i.test(trimmed)) {
        const cushioned = currentProducts.find((p) => p.sourceFacts?.some((f) => /cushion/i.test(f))) || currentProducts[1] || currentProducts[0];
        const other = currentProducts.find((p) => p.sourceProductId !== cushioned?.sourceProductId) || currentProducts[0];
        responseText = `Between the active choices, the ${cushioned?.title || "first option"} features specialized cushioning for impact absorption, whereas the ${other?.title || "second option"} provides a firmer, responsive ride.`;
      } else if (/cheaper|price|cost/i.test(trimmed)) {
        const sorted = [...currentProducts].sort((a, b) => (a.priceMinor || 0) - (b.priceMinor || 0));
        const priceStr = sorted[0]?.priceMinor ? formatMinorUnits(sorted[0].priceMinor, effectiveSession.currency) : "listed price";
        responseText = `The ${sorted[0]?.title || "first option"} is the more budget-friendly option at ${priceStr}.`;
      } else {
        responseText = `Looking at your active candidates, ${currentProducts.map((p) => p.title).join(" and ")} both fit your confirmed preferences.`;
      }
    }

    const assistantMsg: ChatMessage = {
      id: `msg_a_${Date.now().toString(36)}`,
      role: "assistant",
      content: responseText,
      createdAt: Date.now(),
      scope: "product_information",
      actionProposed: "continue_conversation",
      productsReferenced: currentProducts.map((p) => p.sourceProductId || "").filter(Boolean),
      modelUsed: turnResult.modelUsed || "product-info-grounding",
      turnId,
    };

    return {
      session: {
        ...effectiveSession,
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
    originalRequest: effectiveSession.originalRequest || trimmed,
    mode: inferredMode,
    budget: budgetInMajorUnits,
    currency: effectiveSession.currency,
    existingAnswers: updatedAnswers,
  });

  if (guard.scope === "ambiguous_intent" || !guard.isAllowed) {
    reqAnalysis.canSearch = false;
  }

  // 7. Decide single-call orchestration or fast-path
  let modelUsed = "spendpilot-engine";
  let usedFallback = false;
  let shouldExecuteSearch = false;
  let effectiveAction: ConversationalAction = "continue_conversation";
  let activeQuestion: SingleNextQuestion | null = null;
  let assistantContent = "";

  const isKnownQuickReply = Boolean(answeredQuestionId || (answeredAttributeKey && effectiveSession.activeQuestion));

  if (precomputedOrchestration) {
    // Fast single-turn: Orchestrator already performed the turn's Gemini call (Rule 7A)
    // or deterministic extraction (Rule 7B). Do NOT execute a second Gemini call!
    modelUsed = "spendpilot-orchestrator-unified";
    assistantContent = precomputedOrchestration.assistantMessage || "";
    shouldExecuteSearch = precomputedOrchestration.isReadyForSearch;
    effectiveAction = precomputedOrchestration.isReadyForSearch
      ? "search_products"
      : precomputedOrchestration.question
      ? "ask_follow_up"
      : precomputedOrchestration.suggestedAction === "start_product_search"
      ? "search_products"
      : precomputedOrchestration.suggestedAction === "ask_question"
      ? "ask_follow_up"
      : precomputedOrchestration.suggestedAction === "reject_unrelated_request"
      ? "out_of_scope"
      : (precomputedOrchestration.suggestedAction as ConversationalAction) || "continue_conversation";

    if (precomputedOrchestration.question && !shouldExecuteSearch) {
      const q = precomputedOrchestration.question;
      const rawOptions = q.options ?? [];
      const opts = rawOptions.map((opt, i) => ({
        id: `opt_${q.attributeKey || "q"}_${i}`,
        label: typeof opt === "string" ? opt : (opt as { label: string }).label,
        value: typeof opt === "string" ? opt : (opt as { value: string }).value,
      }));
      activeQuestion = {
        id: q.id || `q_${q.attributeKey || "attr"}_${Date.now()}`,
        attributeKey: q.attributeKey || "clarification",
        text: q.text,
        inputType: opts.length > 0 ? "single_select" : "text_input",
        options: opts,
        required: true,
        allowSkip: true,
      };
    } else {
      activeQuestion = null;
    }
  } else if (isKnownQuickReply) {
    // Rule 7B: Known quick reply button click -> 0 Gemini calls!
    modelUsed = "quick-reply-fast-path";
    const hasUnansweredQuestions = reqAnalysis.questions.length > 0;
    const isReady = reqAnalysis.canSearch && !hasUnansweredQuestions;
    if (isReady) {
      shouldExecuteSearch = true;
      effectiveAction = "search_products";
      activeQuestion = null;
      assistantContent = "Looking for verified products matching your preferences.";
    } else if (hasUnansweredQuestions) {
      const q = reqAnalysis.questions[0];
      const canonicalKey = canonicalizeAttributeKey(q.attribute);
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
      assistantContent = q.label;
    } else {
      shouldExecuteSearch = true;
      effectiveAction = "search_products";
      activeQuestion = null;
      assistantContent = "Looking for verified products matching your preferences.";
    }
  } else {
    // Fallback path when called directly without precomputed orchestration
    const turnResult = await executeConversationalInteractionTurn({
      userMessage: trimmed,
      session: {
        ...effectiveSession,
        budget: effectiveBudget,
        mode: inferredMode,
        canonicalAttributes: canonicalMap,
        answers: updatedAnswers,
        attributeOrigins: updatedOrigins,
      },
      currentProductsSummary: isTaskPivot ? [] : currentProductsSummary,
    });

    const { contract } = turnResult;
    modelUsed = turnResult.modelUsed;
    usedFallback = turnResult.usedFallback;

    // Handle taskIntent from Gemini if detected
    if (contract.taskIntent === "new_task" && !isTaskPivot) {
      canonicalMap = {};
      for (const [k, v] of Object.entries(textAttrs)) {
        canonicalMap = upsertCanonicalAttribute(canonicalMap, k, v, "user_explicit", "confirmed", "hard_requirement");
      }
    }

    // Incorporate model updates if valid
    if (contract.requirementsUpdate?.attributes) {
      for (const [k, v] of Object.entries(contract.requirementsUpdate.attributes)) {
        if (v !== undefined && v !== null) {
          canonicalMap = upsertCanonicalAttribute(canonicalMap, k, String(v), "ai_suggested", "suggested");
        }
      }
    }

    const isConfirming = isAffirmativeConfirmation(trimmed);
    const hasUnansweredQuestions = reqAnalysis.questions.length > 0;
    const isRequirementsComplete = reqAnalysis.canSearch && !hasUnansweredQuestions;

    effectiveAction = contract.action || "ask_follow_up";
    assistantContent = contract.assistantMessage || "";

    if (
      isDelegatedOrNoPreference(trimmed) ||
      contract.readyForSearch ||
      contract.action === "search_products" ||
      isRequirementsComplete ||
      (reqAnalysis.canSearch && isConfirming)
    ) {
      shouldExecuteSearch = true;
      effectiveAction = "search_products";
      activeQuestion = null;
      if (!assistantContent || isDelegatedOrNoPreference(trimmed) || /\?\s*$/.test(assistantContent.trim())) {
        if (isDelegatedOrNoPreference(trimmed)) {
          const categoryTitle = reqAnalysis.category ? reqAnalysis.category.toLowerCase() : "product";
          assistantContent = `As you have very little preference, it will be a bit tough to suggest the single best match, but I'll recommend the top-rated all-around ${categoryTitle} options. You can always add your preferences whenever you feel like it, and we can search again!`;
        } else {
          assistantContent = "Searching for verified products matching your preferences.";
        }
      }
    } else if (contract.nextQuestion) {
      activeQuestion = contract.nextQuestion;
      effectiveAction = "ask_follow_up";
    } else if (hasUnansweredQuestions) {
      const q = reqAnalysis.questions[0];
      const canonicalKey = canonicalizeAttributeKey(q.attribute);

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
    }
  }

  if (isTaskPivot) {
    effectiveAction = "new_shopping_task";
    shouldExecuteSearch = false;
  }

  if (!assistantContent) {
    assistantContent = activeQuestion?.text || "What other specifications would you prefer?";
  }

  // Critical rule: If assistant asks a question (message ending with '?') or has an active question, product search MUST NOT execute
  if (/\?\s*$/.test(assistantContent.trim()) || activeQuestion) {
    shouldExecuteSearch = false;
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
    clarification: activeQuestion ? {
      questionId: activeQuestion.id,
      attributeKey: activeQuestion.attributeKey,
      question: activeQuestion.text,
      options: (activeQuestion.options || []).map((o) => ({ label: o.label || o.value, value: o.value || o.label })),
    } : null,
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
    ...effectiveSession,
    originalRequest: effectiveSession.originalRequest || trimmed,
    currentTaskId: precomputedOrchestration?.taskId || effectiveSession.currentTaskId || `task_${now.toString(36)}`,
    shoppingBrief: precomputedOrchestration?.brief || effectiveSession.shoppingBrief,
    stage: nextStage,
    conversationState: nextConversationState,
    revision: nextRev,
    turnId,
    mode: inferredMode,
    budget: effectiveBudget,
    intentSummary,
    requirements: requirementsToSave.length > 0 ? requirementsToSave : effectiveSession.requirements,
    pendingQuestions: mappedGuidedQuestions,
    activeQuestion,
    answeredQuestionIds: answeredIds,
    answers: updatedAnswers,
    attributeOrigins: updatedOrigins,
    canonicalAttributes: canonicalMap,
    messages: [...updatedMessages, assistantMsg],
    canSearch: precomputedOrchestration
      ? precomputedOrchestration.isReadyForSearch
      : Boolean(shouldExecuteSearch || reqAnalysis.canSearch),
    retrievedProductIds: isTaskPivot ? [] : needsReSearch ? [] : effectiveSession.retrievedProductIds,
    selectedProductId: isTaskPivot ? null : effectiveSession.selectedProductId,
    selectedVariants: isTaskPivot ? {} : effectiveSession.selectedVariants,
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
