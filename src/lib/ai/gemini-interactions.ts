import type { GoogleGenAI } from "@google/genai";
import { getGeminiClient } from "./gemini-client.ts";
import {
  getConfiguredModelChain,
  classifyGeminiError,
  buildModelGenerationConfig,
} from "./gemini-router.ts";
import {
  evaluateDomainScope,
  SPENDPILOT_REDIRECT_MESSAGE,
} from "./domain-guard.ts";
import { formatMinorUnits, minorToMajorUnits } from "../money.ts";
import type {
  AuthoritativeShoppingSession,
  ConversationalActionContract,
  DomainScope,
  ConversationalAction,
  QuestionOption,
  SingleNextQuestion,
} from "../../types/index.ts";

export const SPENDPILOT_SYSTEM_INSTRUCTION = `You are SpendPilot AI, an elite conversational personal shopping assistant for the PayPal AI Hackathon 2026.

PERMANENT IDENTITY & ROLE:
- Your exclusive mission is helping users find products, explain specifications, compare alternatives, build setups, manage budgets, and configure variants.
- You are NOT a general-purpose AI. You NEVER write code, solve math/calculus homework, write essays, tell fictional stories, or answer general trivia.
- If a user asks for non-shopping tasks (e.g., "Write a Python script", "Solve my calculus problem", "Which model are you?"), you MUST classify scope as "out_of_scope", set action to "out_of_scope", and respond with the exact SPENDPILOT_REDIRECT_MESSAGE: "${SPENDPILOT_REDIRECT_MESSAGE}".
- CRITICAL EXCEPTION: Technical requirements for shopping (e.g., "I need a laptop for Python programming", "Which GPU is best for 1440p gaming?", "Explain OLED vs IPS") ARE valid shopping conversations.

CONVERSATION PRINCIPLES:
1. Speak naturally, warmly, and concisely as a knowledgeable shopping specialist.
2. Ask questions ONE turn at a time using 'nextQuestion'. NEVER dump multiple questions simultaneously.
3. NEVER repeat an answered question, and NEVER ask for information already mentioned in the prompt or confirmed in session.
4. Allow optional preferences to be skipped ("No preference", "You decide").
5. When all essential specifications are known (e.g. for headphones: connectivity, form factor, ANC), do NOT ask for repeated confirmation or say you are keeping requirements ready. Acknowledge user specifications warmly and set action to "search_products" with readyForSearch: true so search begins immediately.
6. When active products are present in session, answer questions about them using ONLY verified listing facts. Do not invent specs or ratings.
7. Always return a valid JSON object matching the action contract schema.`;

export const CONVERSATIONAL_ACTION_SCHEMA = {
  type: "object",
  properties: {
    scope: {
      type: "string",
      enum: [
        "shopping_related",
        "shopping_follow_up",
        "product_information",
        "ambiguous_intent",
        "out_of_scope",
      ],
    },
    action: {
      type: "string",
      enum: [
        "continue_conversation",
        "ask_follow_up",
        "show_requirement_summary",
        "request_confirmation",
        "search_products",
        "compare_products",
        "refine_search",
        "configure_variant",
        "confirm_configuration",
        "out_of_scope",
        "clarify_intent",
      ],
    },
    assistantMessage: { type: "string" },
    requirementsUpdate: {
      type: "object",
      properties: {
        productCategory: { type: "string" },
        budget: {
          type: "object",
          properties: {
            maximum: { type: "number" },
            currency: { type: "string" },
          },
        },
        attributes: {
          type: "object",
        },
      },
    },
    nextQuestion: {
      type: "object",
      properties: {
        id: { type: "string" },
        attributeKey: { type: "string" },
        text: { type: "string" },
        inputType: {
          type: "string",
          enum: ["single_select", "multi_select", "size_picker", "color_picker", "text_input", "boolean_toggle"],
        },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              value: { type: "string" },
              description: { type: "string" },
            },
            required: ["id", "label", "value"],
          },
        },
        required: { type: "boolean" },
        allowSkip: { type: "boolean" },
      },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          attribute: { type: "string" },
          question: { type: "string" },
          inputType: {
            type: "string",
            enum: ["single_select", "multi_select", "size_picker", "color_picker", "text_input", "boolean_toggle"],
          },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                value: { type: "string" },
                description: { type: "string" },
              },
              required: ["id", "label", "value"],
            },
          },
          required: { type: "boolean" },
          allowSkip: { type: "boolean" },
        },
        required: ["id", "attribute", "question", "inputType", "required", "allowSkip"],
      },
    },
    suggestedReplies: {
      type: "array",
      items: { type: "string" },
    },
    readyForSearch: { type: "boolean" },
    requiresConfirmation: { type: "boolean" },
    referencedProductIds: {
      type: "array",
      items: { type: "string" },
    },
    variantSelection: {
      type: "object",
      properties: {
        productId: { type: "string" },
        selectedOptions: { type: "object" },
      },
    },
  },
  required: ["scope", "action", "assistantMessage", "readyForSearch", "requiresConfirmation"],
};

export interface ExecuteConversationalTurnOptions {
  userMessage: string;
  session: AuthoritativeShoppingSession;
  currentProductsSummary?: Array<{
    id?: string;
    sourceProductId?: string | null;
    title: string;
    price?: number | null;
    currency?: string;
    brand?: string | null;
    availability?: string;
    keySpecs?: Record<string, string>;
  }> | string;
  aiClient?: GoogleGenAI;
  models?: string[];
  totalTimeoutMs?: number;
}

export interface ConversationalTurnResult {
  contract: ConversationalActionContract;
  newInteractionId: string | null;
  modelUsed: string;
  usedFallback: boolean;
}

/**
 * Builds a compact application-managed summary of the ongoing session
 * for context-injection and graceful recovery when interactions expire.
 */
export function buildCompactSessionContext(
  session: AuthoritativeShoppingSession,
  currentProductsSummary?: ExecuteConversationalTurnOptions["currentProductsSummary"]
): string {
  const parts: string[] = [];
  parts.push(`Original Request: "${session.originalRequest}"`);
  parts.push(`Shopping Mode: ${session.mode}`);
  parts.push(`Currency: ${session.currency}`);
  if (session.budget) {
    const major = minorToMajorUnits(session.budget);
    parts.push(`Budget: ${formatMinorUnits(session.budget, session.currency)} (${major} ${session.currency}, ${session.budget} minor units)`);
  }
  if (session.intentSummary) {
    parts.push(`Intent Summary: ${session.intentSummary}`);
  }
  parts.push(`Current Stage: ${session.stage}`);

  // Known attributes
  const knownEntries: string[] = [];
  if (session.canonicalAttributes && Object.keys(session.canonicalAttributes).length > 0) {
    for (const attr of Object.values(session.canonicalAttributes)) {
      if (attr.status !== "skipped") {
        knownEntries.push(`${attr.label}: ${attr.displayValue}`);
      }
    }
  } else {
    for (const [k, a] of Object.entries(session.answers)) {
      if (!a.isSkipped && a.value !== undefined) {
        knownEntries.push(`${a.attribute || k}: ${a.displayValue || a.value}`);
      }
    }
  }
  if (knownEntries.length > 0) {
    parts.push(`Known Requirements & Preferences:\n- ${knownEntries.join("\n- ")}`);
  }

  // Active products in results
  if (typeof currentProductsSummary === "string" && currentProductsSummary.trim().length > 0) {
    parts.push(`Active Candidate Products in Results:\n${currentProductsSummary}`);
  } else if (Array.isArray(currentProductsSummary) && currentProductsSummary.length > 0) {
    const prodList = currentProductsSummary.map((p, idx) => {
      const id = p.id || p.sourceProductId || `#${idx + 1}`;
      const priceStr = p.price !== null && p.price !== undefined ? `${p.currency || "USD"} ${p.price}` : "Price unlisted";
      return `[Product #${idx + 1}] ID: "${id}", Title: "${p.title}", Price: ${priceStr}, Availability: ${p.availability || "Unknown"}`;
    });
    parts.push(`Active Candidate Products in Results:\n${prodList.join("\n")}`);
  }

  // Selected variant configuration if present
  if (session.selectedVariants && Object.keys(session.selectedVariants).length > 0) {
    parts.push(`Selected Product Configurations:\n${JSON.stringify(session.selectedVariants, null, 2)}`);
  }

  return parts.join("\n\n");
}

/**
 * Executes a stateful or stateless conversational turn with Gemini Interactions API,
 * supporting sequential model fallback and graceful recovery.
 */
export async function executeConversationalInteractionTurn({
  userMessage,
  session,
  currentProductsSummary = [],
  aiClient,
  models = getConfiguredModelChain(),
}: ExecuteConversationalTurnOptions): Promise<ConversationalTurnResult> {
  // 1. First run deterministic domain guard check without initializing Gemini
  const hasActiveProducts = (session.retrievedProductIds?.length ?? 0) > 0 || currentProductsSummary.length > 0;
  const guardResult = evaluateDomainScope(userMessage, hasActiveProducts);

  if (!guardResult.isAllowed && guardResult.scope === "out_of_scope") {
    return {
      contract: {
        scope: "out_of_scope",
        action: "out_of_scope",
        assistantMessage: guardResult.redirectMessage || SPENDPILOT_REDIRECT_MESSAGE,
        readyForSearch: false,
        requiresConfirmation: false,
      },
      newInteractionId: session.previousInteractionId || null,
      modelUsed: "domain-guard-deterministic",
      usedFallback: false,
    };
  }

  // 2. Prepare conversational prompt & context
  const sessionContext = buildCompactSessionContext(session, currentProductsSummary);
  const prompt = `Current Shopping Session State:
${sessionContext}

User Message: "${userMessage}"

Respond with appropriate conversational message and next proposed shopping action.`;

  const storeMode = session.storeInteractions !== false;

  // 3. Sequential Model Fallback Chain
  for (let idx = 0; idx < models.length; idx++) {
    const model = models[idx];
    const isFallback = idx > 0;

    try {
      let client = aiClient;
      if (!client) {
        try {
          client = getGeminiClient();
        } catch {
          // If no API key or client initialization fails, break to deterministic recovery
          break;
        }
      }

      // First attempt with Google Gen AI Interactions API if available
      let interactionId: string | null = null;
      let rawText = "";

      // Interactions API Attempt
      if (client.interactions && typeof client.interactions.create === "function") {
        try {
          const interactionParams: Record<string, unknown> = {
            model,
            input: prompt,
            system_instruction: SPENDPILOT_SYSTEM_INSTRUCTION,
            store: storeMode,
            response_format: {
              type: "json_object",
              schema: CONVERSATIONAL_ACTION_SCHEMA,
            },
            generation_config: {
              temperature: 0.2,
            },
          };

          // Re-use previous interaction ID if stateful
          if (storeMode && session.previousInteractionId) {
            interactionParams.previous_interaction_id = session.previousInteractionId;
          }

          const interaction = (await client.interactions.create(
            interactionParams as unknown as Parameters<typeof client.interactions.create>[0]
          )) as unknown as { id?: string; output_text?: string };
          interactionId = interaction?.id || null;
          rawText = interaction?.output_text || "";
        } catch (interactionErr: unknown) {
          // If interaction failed due to invalid / expired interaction ID, retry turn without previous_interaction_id
          const errStr = String(interactionErr).toLowerCase();
          if (session.previousInteractionId && (errStr.includes("not found") || errStr.includes("expired") || errStr.includes("404"))) {
            const retryRes = (await client.interactions.create({
              model,
              input: prompt,
              system_instruction: SPENDPILOT_SYSTEM_INSTRUCTION,
              store: storeMode,
              response_format: {
                type: "json_object",
                schema: CONVERSATIONAL_ACTION_SCHEMA,
              },
              generation_config: {
                temperature: 0.2,
              },
            } as unknown as Parameters<typeof client.interactions.create>[0])) as unknown as { id?: string; output_text?: string };
            interactionId = retryRes?.id || null;
            rawText = retryRes?.output_text || "";
          } else {
            throw interactionErr;
          }
        }
      }

      // If Interactions API was bypassed or returned empty, fallback to generateContent
      if (!rawText) {
        const genConfig = buildModelGenerationConfig(model, {
          systemInstruction: SPENDPILOT_SYSTEM_INSTRUCTION,
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: CONVERSATIONAL_ACTION_SCHEMA,
        });

        const genRes = await client.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: genConfig,
        });
        rawText = genRes.text?.trim() || "";
      }

      const parsed = JSON.parse(rawText || "{}") as ConversationalActionContract;

      // 4. Validate output contract server-side
      const validatedContract = sanitizeAndValidateActionContract(parsed, userMessage, hasActiveProducts);

      return {
        contract: validatedContract,
        newInteractionId: interactionId || session.previousInteractionId || null,
        modelUsed: model,
        usedFallback: isFallback,
      };
    } catch (err: unknown) {
      const classified = classifyGeminiError(err);

      // Stop immediately on non-retryable errors (401, 403, invalid keys)
      if (classified.isFatal || !classified.isRetryableForNextModel) {
        break;
      }
      // Else loop continues to next model in priority order (gemini-3.5-flash-lite, gemini-2.5-flash-lite)
    }
  }

  // Graceful deterministic fallback if all models fail
  return {
    contract: {
      scope: guardResult.scope,
      action: "ask_follow_up",
      assistantMessage: "Let's find the best options for you. Could you share your preferred style or features?",
      readyForSearch: false,
      requiresConfirmation: false,
    },
    newInteractionId: session.previousInteractionId || null,
    modelUsed: "deterministic-recovery",
    usedFallback: true,
  };
}

/**
 * Sanitizes and validates the model's proposed action contract.
 * Prevents arbitrary model execution and ensures out-of-scope prompts are blocked.
 */
export function sanitizeAndValidateActionContract(
  raw: Record<string, unknown> | Partial<ConversationalActionContract>,
  userMessage: string,
  hasActiveProducts: boolean
): ConversationalActionContract {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = (raw || {}) as Record<string, any>;
  let scope: DomainScope = (payload.scope as DomainScope) || "shopping_related";
  let action: ConversationalAction = (payload.action as ConversationalAction) || "continue_conversation";
  let assistantMessage = typeof payload.assistantMessage === "string" ? payload.assistantMessage.trim() : "";

  // 1. If scope is out_of_scope or prompt fails domain guard: enforce redirect
  const guard = evaluateDomainScope(userMessage, hasActiveProducts);
  if (!guard.isAllowed && guard.scope === "out_of_scope") {
    scope = "out_of_scope";
    action = "out_of_scope";
    assistantMessage = SPENDPILOT_REDIRECT_MESSAGE;
  } else if (scope === "out_of_scope") {
    action = "out_of_scope";
    assistantMessage = SPENDPILOT_REDIRECT_MESSAGE;
  }

  // Fallback message if empty
  if (!assistantMessage) {
    assistantMessage =
      action === "out_of_scope"
        ? SPENDPILOT_REDIRECT_MESSAGE
        : "I'm ready to help you find the right product within your budget. What details can I help with?";
  }

  // 2. Validate and sanitize nextQuestion (strictly ONE question)
  let nextQuestion: SingleNextQuestion | null = null;

  if (payload.nextQuestion && typeof payload.nextQuestion.text === "string" && payload.nextQuestion.text.trim()) {
    const rawQ = payload.nextQuestion;
    const attrKey = rawQ.attributeKey || rawQ.id || "preference";
    const seenOptions = new Set<string>();
    const sanitizedOptions: QuestionOption[] = [];

    for (const opt of rawQ.options || []) {
      const norm = (opt.label || opt.value || "").trim().toLowerCase();
      if (!norm || seenOptions.has(norm)) continue;
      seenOptions.add(norm);
      sanitizedOptions.push({
        id: opt.id || `opt-${sanitizedOptions.length + 1}`,
        label: opt.label || opt.value,
        value: opt.value || opt.label,
        description: opt.description,
      });
    }

    nextQuestion = {
      id: rawQ.id || `q_${attrKey.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      attributeKey: attrKey,
      text: rawQ.text.trim(),
      inputType: rawQ.inputType || "single_select",
      options: sanitizedOptions,
      required: Boolean(rawQ.required),
      allowSkip: rawQ.allowSkip !== false,
    };
  } else if (Array.isArray(payload.questions) && payload.questions.length > 0) {
    const rawList = payload.questions as Array<Record<string, unknown>>;
    const firstQ = rawList.find(
      (q) => q && typeof (q.question || q.label || q.text) === "string" && String(q.question || q.label || q.text).trim().length > 0
    );
    if (firstQ) {
      const qText = String(firstQ.question || firstQ.label || firstQ.text || "").trim();
      const attrKey = String(firstQ.attribute || firstQ.id || "preference");
      const seenOptions = new Set<string>();
      const sanitizedOptions: QuestionOption[] = [];

      const rawOptions = (Array.isArray(firstQ.options) ? firstQ.options : []) as Array<Record<string, unknown>>;
      for (const opt of rawOptions) {
        const optLabel = typeof opt.label === "string" ? opt.label : typeof opt.value === "string" ? opt.value : "";
        const optValue = typeof opt.value === "string" ? opt.value : optLabel;
        const norm = optLabel.trim().toLowerCase();
        if (!norm || seenOptions.has(norm)) continue;
        seenOptions.add(norm);
        sanitizedOptions.push({
          id: String(opt.id || `opt-${sanitizedOptions.length + 1}`),
          label: optLabel,
          value: optValue,
          description: typeof opt.description === "string" ? opt.description : undefined,
        });
      }

      nextQuestion = {
        id: String(firstQ.id || `q_${attrKey.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`),
        attributeKey: attrKey,
        text: qText,
        inputType: (typeof firstQ.inputType === "string" ? firstQ.inputType : "single_select") as "single_select",
        options: sanitizedOptions,
        required: Boolean(firstQ.required || firstQ.importance === "required_before_search"),
        allowSkip: firstQ.allowSkip !== false,
      };
    }
  }

  // Provide at most 1 item in questions for backwards compatibility
  const sanitizedQuestions = nextQuestion
    ? [
        {
          id: nextQuestion.id,
          attribute: nextQuestion.attributeKey,
          question: nextQuestion.text,
          inputType: nextQuestion.inputType,
          options: nextQuestion.options,
          required: nextQuestion.required,
          allowSkip: nextQuestion.allowSkip,
        },
      ]
    : [];

  const suggestedReplies = Array.isArray(payload.suggestedReplies)
    ? payload.suggestedReplies.filter((r: unknown) => typeof r === "string" && r.trim().length > 0).slice(0, 4)
    : [];

  return {
    scope,
    action,
    assistantMessage,
    requirementsUpdate: payload.requirementsUpdate,
    nextQuestion,
    questions: sanitizedQuestions,
    suggestedReplies,
    readyForSearch: Boolean(payload.readyForSearch),
    requiresConfirmation: Boolean(payload.requiresConfirmation),
    referencedProductIds: Array.isArray(payload.referencedProductIds) ? payload.referencedProductIds : [],
    variantSelection: payload.variantSelection,
  };
}
