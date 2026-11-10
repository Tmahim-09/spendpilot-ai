import type { ShoppingBrief } from "../orchestrator/types.ts";
import type { PendingQuestion, PendingQuestionOption } from "./types.ts";
import { isDelegatedOrNoPreference } from "../orchestrator/intent-analyzer.ts";

export interface QuestionEvaluationParams {
  brief: ShoppingBrief;
  userMessage?: string;
  previousQuestion?: PendingQuestion | null;
  askedQuestionIds?: string[];
  answeredQuestionIds?: string[];
  answeredQuestionId?: string;
  suggestedQuestion?: {
    id?: string;
    attributeKey?: string;
    text: string;
    options?: Array<string | { label: string; value: string }>;
    isEssential?: boolean;
  } | null;
}

export interface QuestionEvaluationResult {
  nextQuestion: PendingQuestion | null;
  supersededQuestionId?: string | null;
  canProceedToSearch: boolean;
}

/**
 * Checks whether a Shopping Brief has enough specific information
 * to execute product discovery immediately across ANY product category.
 *
 * Rules:
 * 1. Product type is identifiable.
 * 2. Essential constraints are known or query has sufficient detail.
 * 3. Budget, brand, color, size are NOT universally mandatory.
 */
export function isSearchReady(brief: ShoppingBrief): boolean {
  if (!brief.productRequirements || brief.productRequirements.length === 0) {
    return false;
  }

  // Explicit status overrides
  if (brief.status === "ready_to_search") return true;
  if (brief.status === "needs_clarification") return false;

  const firstReq = brief.productRequirements[0];
  const query = (firstReq.searchQuery || firstReq.displayName || "").trim();
  if (query.length < 2) return false;

  const words = query.split(/\s+/).filter(Boolean);
  const hasConstraints = Array.isArray(firstReq.constraints) && firstReq.constraints.length > 0;
  const hasPurpose = Array.isArray(firstReq.purpose) && firstReq.purpose.length > 0;
  const hasBudget = Boolean(brief.budget?.maximum?.amountMinor);

  // If user provided multiple words, explicit constraints, purpose, or budget,
  // we have enough to query the product retrieval engine directly!
  if (hasConstraints || hasPurpose || hasBudget || words.length >= 3) {
    return true;
  }

  // Multi-product setups with multiple requirements are ready once components are identified
  if (brief.mode === "multi_product" && brief.productRequirements.length >= 2) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether a question should be asked next, ensuring:
 * 1. Open-world product categories adapt questions dynamically via Gemini (Section 2).
 * 2. Questions already asked or answered are NEVER repeated (Section 6).
 * 3. Bypassed previous questions are marked superseded (Section 6).
 * 4. At most 1 question per turn, only if missing details materially affect search (Section 3).
 * 5. Complete requests proceed to search immediately with 0 questions (Section 3 & 6).
 * 6. Quick replies strictly match the active question or remain empty [] for free-text (Section 4).
 */
export function evaluateNextQuestion(
  params: QuestionEvaluationParams
): QuestionEvaluationResult {
  const {
    brief,
    userMessage,
    previousQuestion,
    askedQuestionIds = [],
    answeredQuestionIds = [],
    suggestedQuestion,
  } = params;

  const lowerMsg = (userMessage || "").toLowerCase();
  let supersededQuestionId: string | null = null;

  // Check if previous question was active
  if (previousQuestion && previousQuestion.status === "active") {
    // Did user answer the previous question?
    const isDirectAnswer = previousQuestion.options?.some(
      (opt) =>
        lowerMsg.includes(opt.value.toLowerCase()) ||
        lowerMsg.includes(opt.label.toLowerCase())
    );

    if (!isDirectAnswer) {
      // User provided other useful information instead!
      // Mark previous question superseded so it is NOT blindly repeated
      supersededQuestionId = previousQuestion.id;
    }
  }

  // Check all known attributes already answered or constrained in brief
  const knownAttributeKeys = new Set<string>();
  for (const id of answeredQuestionIds) {
    knownAttributeKeys.add(id.toLowerCase());
  }
  for (const req of brief.productRequirements || []) {
    for (const c of req.constraints || []) {
      knownAttributeKeys.add(c.key.toLowerCase());
    }
  }

  // Check if user explicitly confirmed proceed to search or delegated preference ("u suggest")
  const isProceedConfirm =
    Boolean(params.answeredQuestionId && params.answeredQuestionId.includes("proceed")) ||
    /\b(proceed|search now|find products|no more details|go ahead|ready|looks good|no other details|that's all|thats all|none)\b/i.test((userMessage || "").trim());

  const isDelegated = isDelegatedOrNoPreference(userMessage || "");

  if (isProceedConfirm || isDelegated) {
    return {
      nextQuestion: null,
      supersededQuestionId: previousQuestion?.id || null,
      canProceedToSearch: true,
    };
  }

  // 1. If Gemini or the orchestrator suggested a contextually relevant question, evaluate and validate it
  if (suggestedQuestion && suggestedQuestion.text) {
    const rawKey = suggestedQuestion.attributeKey || "clarification";
    const normKey = rawKey.toLowerCase();

    const alreadyAsked =
      (suggestedQuestion.id && askedQuestionIds.includes(suggestedQuestion.id)) ||
      askedQuestionIds.some((id) => id.toLowerCase().includes(normKey));

    const alreadyAnswered =
      (suggestedQuestion.id && answeredQuestionIds.includes(suggestedQuestion.id)) ||
      knownAttributeKeys.has(normKey) ||
      answeredQuestionIds.some((id) => id.toLowerCase().includes(normKey));

    const superseded = supersededQuestionId && supersededQuestionId.toLowerCase().includes(normKey);

    // If not already asked or answered, and not superseded
    if (!alreadyAsked && !alreadyAnswered && !superseded) {
      const qId = suggestedQuestion.id || `q_${normKey}_${Date.now()}`;
      // Respect empty options array for free-text inputs (Section 4 & 5)
      const rawOptions = suggestedQuestion.options ?? [];

      const options: PendingQuestionOption[] = rawOptions.map((opt, i) => {
        if (typeof opt === "string") {
          return {
            id: `opt_${normKey}_${i}`,
            label: opt,
            value: opt,
          };
        }
        return {
          id: opt.label ? `opt_${normKey}_${i}` : `opt_${i}`,
          label: opt.label || opt.value,
          value: opt.value || opt.label,
        };
      });

      return {
        nextQuestion: {
          id: qId,
          requirementId: brief.productRequirements[0]?.id,
          attributeKey: normKey,
          text: suggestedQuestion.text,
          options,
          createdAt: Date.now(),
          status: "active",
        },
        supersededQuestionId,
        canProceedToSearch: false,
      };
    }
  }

  // 2. No valid unanswered question suggested. Check if search is ready
  const searchReady = isSearchReady(brief);

  return {
    nextQuestion: null,
    supersededQuestionId,
    canProceedToSearch: searchReady,
  };
}
