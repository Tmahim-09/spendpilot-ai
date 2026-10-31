import { executeWithModelFailover, buildModelGenerationConfig } from "./gemini-router.ts";
import { analyzeShoppingRequirements } from "../shopping/requirement-engine.ts";
import type {
  ShoppingMode,
  CurrencyCode,
  GuidedQuestion,
  StructuredRequirement,
  CollectedAnswer,
  ShoppingStage,
} from "@/types";

export interface InterviewTurnResult {
  stage: ShoppingStage;
  intentSummary: string;
  assistantMessage: string;
  requirements: StructuredRequirement[];
  questions: GuidedQuestion[];
  canSearch: boolean;
  modelUsed?: string;
}

const INTERVIEW_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intentSummary: { type: "string" },
    assistantMessage: { type: "string" },
    canSearch: { type: "boolean" },
    clarifyingNotes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["intentSummary", "assistantMessage", "canSearch"],
};

/**
 * Executes a conversational interview turn using Gemini with automatic model failover.
 * Pairs conversational synthesis from Gemini with deterministic attribute validation.
 */
export async function executeGuidedInterviewTurn(params: {
  originalRequest: string;
  mode: ShoppingMode;
  budget: number | null;
  currency: CurrencyCode;
  existingAnswers?: Record<string, CollectedAnswer>;
}): Promise<InterviewTurnResult> {
  const { originalRequest, mode, budget, currency, existingAnswers = {} } = params;

  // 1. Run deterministic requirement analysis first
  // This extracts text attributes, verifies category metadata, and determines strictly valid questions
  const baseAnalysis = await analyzeShoppingRequirements({
    originalRequest,
    mode,
    budget,
    currency,
    existingAnswers,
  });

  // If search is ready (all required fields answered or none missing), we can transition immediately
  if (baseAnalysis.canSearch) {
    return {
      stage: "requirements_review",
      intentSummary: baseAnalysis.intentSummary,
      assistantMessage:
        "Great, I have all the key details to find your verified matches. Review your requirements below and let's search!",
      requirements: baseAnalysis.requirements,
      questions: [],
      canSearch: true,
      modelUsed: "deterministic-engine",
    };
  }

  // 2. Prepare context prompt for Gemini
  const answersList = Object.values(existingAnswers)
    .filter((a) => !a.isSkipped && a.value !== undefined)
    .map((a) => `${a.attribute}: ${a.displayValue || a.value}`);

  const questionsList = baseAnalysis.questions.map(
    (q) => `[${q.importance}] Question: "${q.label}" (Options: ${q.options.map((o) => o.label).join(", ")})`
  );

  const prompt = `You are SpendPilot AI, a knowledgeable and friendly personal shopping assistant.
The user is shopping for: "${originalRequest}".
Shopping Mode: ${mode}.
Budget: ${budget ? `$${budget} ${currency}` : "Not specified"}.

Existing known answers from user:
${answersList.length > 0 ? answersList.join("\n") : "None yet."}

Identified questions to ask:
${questionsList.join("\n")}

Instructions:
1. Greet the user naturally and acknowledge what they've asked for.
2. In 1 or 2 friendly, everyday conversational sentences, explain why we are asking for these specific details before searching.
3. Be warm, concise, and helpful. Do NOT use technical jargon like "attribute extraction" or "filter schemas".
4. Determine whether the shopping requirements can be searched yet.`;

  try {
    const failoverResult = await executeWithModelFailover<{
      intentSummary?: string;
      assistantMessage?: string;
      canSearch?: boolean;
    }>({
      totalTimeoutMs: 15000,
      executeFn: async (ai, model, signal) => {
        const config = buildModelGenerationConfig(model, {
          abortSignal: signal,
          systemInstruction:
            "You are SpendPilot AI, an elite personal shopping assistant. Generate concise, human conversational copy for shopping requirements. Always output valid JSON.",
          responseMimeType: "application/json",
          responseSchema: INTERVIEW_RESPONSE_SCHEMA,
          temperature: 0.2,
        });

        const response = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config,
        });

        const text = response.text?.trim() || "{}";
        return JSON.parse(text);
      },
      validateFn: (data) => {
        if (!data || typeof data !== "object") {
          return { valid: false, reason: "Output is not an object" };
        }
        return { valid: true };
      },
    });

    const parsed = failoverResult.data;

    return {
      stage: baseAnalysis.canSearch ? "requirements_review" : "needs_clarification",
      intentSummary: parsed.intentSummary || baseAnalysis.intentSummary,
      assistantMessage:
        parsed.assistantMessage ||
        "A few quick details will help me find the best verified options within your budget.",
      requirements: baseAnalysis.requirements,
      questions: baseAnalysis.questions,
      canSearch: baseAnalysis.canSearch,
      modelUsed: failoverResult.modelUsed,
    };
  } catch {
    // Graceful fallback: If all Gemini models fail or are rate-limited,
    // the deterministic requirement engine safely preserves the conversation flow!
    return {
      stage: "needs_clarification",
      intentSummary: baseAnalysis.intentSummary,
      assistantMessage:
        "A few quick details will help me find the best verified options within your budget.",
      requirements: baseAnalysis.requirements,
      questions: baseAnalysis.questions,
      canSearch: baseAnalysis.canSearch,
      modelUsed: "deterministic-fallback",
    };
  }
}
