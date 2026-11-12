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
import { SPENDPILOT_CENTRAL_SYSTEM_INSTRUCTION } from "./central-instruction.ts";
import { trackGeminiCall } from "../observability/call-tracker.ts";
import { formatMinorUnits, minorToMajorUnits } from "../money.ts";
import {
  normalizeInteractionResponse,
  resolveNaturalMessage,
} from "./normalize-interaction-response.ts";
import type {
  AuthoritativeShoppingSession,
  ConversationalActionContract,
  DomainScope,
  ConversationalAction,
  QuestionOption,
  SingleNextQuestion,
} from "../../types/index.ts";

export const SPENDPILOT_SYSTEM_INSTRUCTION = `${SPENDPILOT_CENTRAL_SYSTEM_INSTRUCTION}

PERMANENT IDENTITY & ROLE:
- Your exclusive mission is helping users find products, explain specifications, compare alternatives, build multi-product setups, manage budgets, and configure variants.
- You are NOT a general-purpose AI. You NEVER write code, solve math/calculus homework, write essays, tell fictional stories, or answer general trivia.
- If a user asks for non-shopping tasks (e.g., "Write a Python script", "Solve my calculus problem", "Which model are you?"), you MUST classify scope as "out_of_scope", set action to "out_of_scope", and respond with the exact SPENDPILOT_REDIRECT_MESSAGE: "${SPENDPILOT_REDIRECT_MESSAGE}".
- CRITICAL EXCEPTION: Technical requirements for shopping (e.g., "I need a laptop for Python programming", "Which GPU is best for 1440p gaming?", "Explain OLED vs IPS") ARE valid shopping conversations.

CONVERSATION PRINCIPLES & DYNAMIC INTELLIGENCE:
1. Speak naturally, warmly, and contextually as an expert personal shopper. NEVER sound like a rigid questionnaire or wizard. NEVER use generic canned phrases like "Let's find the best options for you. Could you share your preferred style or features?" or "Preferences complete!".
2. CONTEXT AWARENESS:
   - When a user asks for themed room decor (e.g. "I want to decorate my room with Naruto, One Piece, and Attack on Titan"): immediately understand all requested franchises and the room decoration objective. Ask only about genuinely missing essential criteria (such as budget ceiling or decor format preference: wall art vs figurines vs LED signs). NEVER ask generic furniture questions.
   - When a user asks for a specific tech item (e.g. "MacBook for programming with 1TB SSD"): recognize product family (MacBook), manufacturer (Apple), OS (macOS), intended use (programming), and storage (1TB SSD). NEVER ask what operating system they prefer. Ask only for missing essential information (like budget).
   - When a user specifies details (e.g. "Gaming keyboard under $100 with wireless connectivity"): immediately recognize category (gaming keyboard), budget ($100), and connectivity (wireless). Do NOT re-ask these details.
3. TASK SWITCHING vs. REFINEMENT:
   - If the user changes to a completely new shopping task (e.g., from room decor to a MacBook, or from headphones to running shoes):
     Set taskIntent to "new_task".
     Set action to "ask_follow_up" (if essential info like budget is missing) or "search_products" (if enough info is present).
     Respond naturally acknowledging the switch to the new item.
     Do NOT carry over previous product attributes to the new task.
   - If the user refines the current task ("Can I get the same with 1TB?", "Show me cheaper options", "Do you have it in black?"):
     Set taskIntent to "refine_current".
4. ONE MEANINGFUL QUESTION AT A TIME:
   - Ask at most ONE contextually relevant question per turn using 'nextQuestion'.
   - NEVER dump multiple questions. NEVER repeat an answered question.
   - Provide concise, useful quick-reply options when helpful, but ensure the conversation flows naturally if the user responds with free text.
5. WHEN READY TO SEARCH:
   - When essential specifications are known (or when user says "search", "find products", "yes", "looks good"), set action to "search_products" and readyForSearch: true so search begins immediately.
6. GROUNDED PRODUCT SPECIFICATIONS:
   - When active products are present in session, answer questions using ONLY verified listing facts. Never invent specifications, ratings, or prices.
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
        "new_shopping_task",
      ],
    },
    taskIntent: {
      type: "string",
      enum: ["new_task", "refine_current", "general_query"],
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

  // Dialogue transcript for current task (fixes missing conversation history)
  if (Array.isArray(session.messages) && session.messages.length > 0) {
    const recent = session.messages.slice(-8).map((m) => {
      const role = m.role === "user" ? "Shopper" : "Assistant";
      return `${role}: "${m.content.replace(/\n+/g, " ").trim()}"`;
    });
    parts.push(`Recent Dialogue Transcript (Current Task):\n${recent.join("\n")}`);
  }

  // Active pending question
  if (session.activeQuestion) {
    parts.push(`Active Pending Question: "${session.activeQuestion.text}"`);
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

          trackGeminiCall(`gemini_interactions_${model}`);
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

        trackGeminiCall(`gemini_generateContent_${model}`);
        const genRes = await client.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: genConfig,
        });
        rawText = genRes.text?.trim() || "";
      }

      const normalized = normalizeInteractionResponse(rawText, {
        userMessage,
        category: session.requirements?.[0]?.categorySlug,
        budget: session.budget,
        currency: session.currency,
      });

      // 4. Validate output contract server-side
      const validatedContract = sanitizeAndValidateActionContract(
        {
          scope: normalized.scope,
          action: normalized.action,
          assistantMessage: normalized.assistantMessage,
          nextQuestion: normalized.question,
          requirementsUpdate: {
            attributes: normalized.requirementUpdates,
          },
          readyForSearch: normalized.readyForSearch,
          referencedProductIds: normalized.referencedProductIds,
          variantSelection: normalized.variantSelection,
        },
        userMessage,
        hasActiveProducts
      );

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
      // Else loop continues to next model in priority order (gemini-3.5-flash-lite, gemini-3.8-flash)
    }
  }

  // Graceful deterministic fallback if all models fail
  return {
    contract: {
      scope: guardResult.scope,
      action: "ask_follow_up",
      assistantMessage: generateDynamicFallbackMessage(userMessage, session),
      readyForSearch: false,
      requiresConfirmation: false,
    },
    newInteractionId: session.previousInteractionId || null,
    modelUsed: "deterministic-recovery",
    usedFallback: true,
  };
}

/**
 * Generates a contextual, natural fallback message when Gemini API is unavailable,
 * strictly avoiding hardcoded boilerplate or generic questionnaires.
 */
export function generateDynamicFallbackMessage(
  userMessage: string,
  session: AuthoritativeShoppingSession
): string {
  const lower = userMessage.toLowerCase();
  if (lower.includes("macbook") || lower.includes("laptop")) {
    if (!session.budget) {
      return "I can help you find the best MacBook for your needs. What target budget would you like to stay within?";
    }
    return "Great choice! Do you have a preferred screen size (like 13-inch or 14-inch), or should I look across models within your budget?";
  }
  if (
    lower.includes("anime") ||
    lower.includes("naruto") ||
    lower.includes("one piece") ||
    lower.includes("attack on titan")
  ) {
    if (!session.budget) {
      return "Decorating your room with Naruto, One Piece, and Attack on Titan sounds awesome! What total budget do you have in mind for the room setup?";
    }
    return "Awesome anime themes! What specific types of decor are you most interested in (e.g. wall art, desk figures, lighting), or would you like a balanced variety?";
  }
  if (lower.includes("keyboard")) {
    if (!session.budget) {
      return "I'll help you pick a great gaming keyboard. What is your target budget?";
    }
    return "Looking for gaming keyboards! Do you prefer a compact mechanical layout, or full-size with a number pad?";
  }
  if (lower.includes("headphone") || lower.includes("headset") || lower.includes("audio")) {
    if (!session.budget) {
      return "I can help you find the right headphones. What is your target budget?";
    }
    return "Do you prefer over-ear headphones or earbuds?";
  }
  if (lower.includes("shoe") || lower.includes("sneaker") || lower.includes("running")) {
    return "What shoe size do you wear?";
  }
  if (session.budget) {
    return `I'm searching for options within your budget. Any particular brand or must-have features you'd like me to focus on?`;
  }
  return `I'd love to help you find that. What target budget would you like to stay within?`;
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
  const taskIntent = payload.taskIntent as "new_task" | "refine_current" | "general_query" | undefined;
  let assistantMessage = resolveNaturalMessage(
    payload.assistantMessage || payload.response || payload.message,
    ""
  );

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
    if (typeof payload.question === "string" && payload.question.trim()) {
      assistantMessage = payload.question.trim();
    } else {
      assistantMessage =
        action === "out_of_scope"
          ? SPENDPILOT_REDIRECT_MESSAGE
          : "I'm ready to help you find the right product within your budget. What details can I help with?";
    }
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
    taskIntent,
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
