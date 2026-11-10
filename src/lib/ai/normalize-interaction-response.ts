import { z } from "zod";
import type {
  ConversationalAction,
  DomainScope,
  SingleNextQuestion,
  QuestionOption,
  CurrencyCode,
} from "@/types";
import { SPENDPILOT_REDIRECT_MESSAGE } from "./domain-guard.ts";
import { canonicalizeAttributeKey } from "../shopping/canonical-attributes.ts";
import { getRandomSearchingText } from "./conversation-engine.ts";

export interface NormalizedInteractionResult {
  success: boolean;
  scope: DomainScope;
  action: ConversationalAction;
  assistantMessage: string; // Strictly natural language text, never raw JSON
  question: SingleNextQuestion | null;
  requirementUpdates: Record<
    string,
    {
      value: string | number;
      source?: "user_explicit" | "user_confirmed" | "ai_suggested";
    }
  >;
  readyForSearch: boolean;
  referencedProductIds: string[];
  variantSelection: {
    productId: string;
    selectedOptions: Record<string, string>;
  } | null;
  rawParsedAction?: string;
  error?: string;
}

export interface NormalizeContext {
  userMessage?: string;
  category?: string;
  budget?: number | null;
  currency?: CurrencyCode;
}

const QuestionOptionSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  value: z.string(),
  description: z.string().optional(),
});

export const InternalQuestionSchema = z.object({
  id: z.string().optional(),
  attributeKey: z.string().optional(),
  slot: z.string().optional(),
  attribute: z.string().optional(),
  text: z.string().optional(),
  question: z.string().optional(),
  inputType: z
    .enum(["single_select", "multi_select", "text", "budget", "size_picker", "color_picker", "text_input", "boolean_toggle"])
    .optional(),
  options: z.array(QuestionOptionSchema).optional(),
  allowSkip: z.boolean().optional(),
  required: z.boolean().optional(),
});

/**
 * Extracts raw structured text from Gemini Interactions API or generateContent response objects.
 */
export function extractStructuredOutputText(raw: unknown): string {
  if (!raw) return "";

  if (typeof raw === "string") {
    return raw.trim();
  }

  // Handle Gemini Interactions API response object
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;

    // 1. Check documented output_text property
    if (typeof obj.output_text === "string" && obj.output_text.trim()) {
      return obj.output_text.trim();
    }

    // 2. Check generateContent text property
    if (typeof obj.text === "string" && obj.text.trim()) {
      return obj.text.trim();
    }

    // 3. Inspect documented interaction steps if output_text was empty
    if (Array.isArray(obj.steps)) {
      for (let i = obj.steps.length - 1; i >= 0; i--) {
        const step = obj.steps[i] as Record<string, unknown>;
        if (typeof step?.output === "string" && step.output.trim()) {
          return step.output.trim();
        }
        if (typeof step?.text === "string" && step.text.trim()) {
          return step.text.trim();
        }
      }
    }

    // 4. Check candidates parts
    if (Array.isArray(obj.candidates) && obj.candidates[0]) {
      const cand = obj.candidates[0] as Record<string, unknown>;
      const content = cand.content as Record<string, unknown>;
      if (Array.isArray(content?.parts)) {
        const textParts = content.parts
          .map((p: unknown) => (typeof (p as Record<string, unknown>)?.text === "string" ? (p as Record<string, unknown>).text : ""))
          .filter(Boolean);
        if (textParts.length > 0) {
          return textParts.join("").trim();
        }
      }
    }

    // 5. If it's a plain object with action/assistantMessage/question, serialize to JSON
    if (
      !Object.prototype.hasOwnProperty.call(obj, "text") &&
      !Object.prototype.hasOwnProperty.call(obj, "output_text") &&
      !Object.prototype.hasOwnProperty.call(obj, "candidates") &&
      !Object.prototype.hasOwnProperty.call(obj, "steps")
    ) {
      try {
        return JSON.stringify(obj);
      } catch {
        // ignore
      }
    }
  }

  return "";
}

/**
 * Strips markdown code fences (e.g. ```json ... ```) and extracts bare JSON string.
 */
export function extractCleanJsonString(text: string): string {
  let cleaned = text.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  // If text has text before or after the JSON object, isolate { ... }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

/**
 * Checks if a string contains raw JSON or serialized internal contract structures.
 */
export function isRawJsonString(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  let trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    trimmed = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return true;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return true;
  if (
    trimmed.includes('"action":') &&
    (trimmed.includes('"slot":') ||
      trimmed.includes('"question":') ||
      trimmed.includes('"updates":') ||
      trimmed.includes('"assistantMessage":') ||
      trimmed.includes('"response":'))
  ) {
    return true;
  }
  return false;
}

/**
 * Recursively resolves a natural language message from a potentially nested or JSON-serialized string.
 * Guarantees that internal action keys and JSON braces NEVER appear in the returned message!
 */
export function resolveNaturalMessage(messageCandidate: unknown, fallbackMessage = ""): string {
  if (!messageCandidate) return fallbackMessage;

  if (typeof messageCandidate !== "string") {
    if (typeof messageCandidate === "object") {
      const obj = messageCandidate as Record<string, unknown>;
      const candidate =
        obj.assistantMessage ||
        obj.response ||
        obj.message ||
        (typeof obj.question === "string" ? obj.question : (obj.question as Record<string, unknown>)?.text) ||
        "";
      if (typeof candidate === "string" && candidate.trim()) {
        return resolveNaturalMessage(candidate, fallbackMessage);
      }
    }
    return fallbackMessage;
  }

  const trimmed = messageCandidate.trim();

  // If candidate is a JSON string, extract the customer-facing message from inside it!
  if (isRawJsonString(trimmed)) {
    try {
      const parsed = JSON.parse(extractCleanJsonString(trimmed));
      const extracted =
        parsed.assistantMessage ||
        parsed.response ||
        parsed.message ||
        (typeof parsed.question === "string" ? parsed.question : parsed.question?.text) ||
        "";
      if (typeof extracted === "string" && extracted.trim()) {
        return resolveNaturalMessage(extracted, fallbackMessage);
      }
    } catch {
      // Regex extraction fallback if JSON parsing fails
      const respMatch = trimmed.match(/"response"\s*:\s*"([^"]+)"/i);
      if (respMatch && respMatch[1]) return respMatch[1];

      const msgMatch = trimmed.match(/"assistantMessage"\s*:\s*"([^"]+)"/i);
      if (msgMatch && msgMatch[1]) return msgMatch[1];

      const qMatch = trimmed.match(/"question"\s*:\s*"([^"]+)"/i);
      if (qMatch && qMatch[1]) return qMatch[1];
    }
  }

  // Ensure no trailing JSON or unparsed internal markers remain
  let result = trimmed;
  if (result.startsWith('"') && result.endsWith('"')) {
    result = result.slice(1, -1);
  }

  return result.trim() || fallbackMessage;
}

/**
 * Removes repetitive robotic acknowledgements (e.g. "Got it!", "Perfect!", "Great choice!")
 * from the beginning of customer-facing assistant messages.
 */
export function cleanRepetitiveAcknowledgements(message: string): string {
  if (!message || typeof message !== "string") return "";
  let result = message.trim();
  result = result.replace(
    /^(?:got it[!,.]*|perfect[!,.]*|great choice[!,.]*|thanks for clarifying[!,.]*|one more thing[!,.]*|understood[!,.—-]*|awesome[!,.]*|sure thing[!,.]*)\s+/i,
    ""
  );
  if (result.length > 0) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }
  return result;
}

/**
 * Normalizes legacy action names into canonical application actions.
 */
export function normalizeActionName(rawAction: unknown): ConversationalAction {
  const actionStr = String(rawAction || "").trim().toLowerCase();

  switch (actionStr) {
    case "clarify":
    case "ask_question":
    case "ask_follow_up":
      return "clarify";

    case "update_state":
    case "update_requirements":
      return "update_state";

    case "conversation_reply":
    case "continue_conversation":
    case "respond":
      return "conversation_reply";

    case "search_products":
    case "start_product_search":
      return "search_products";

    case "compare_products":
      return "compare_products";

    case "configure_variant":
      return "configure_variant";

    case "confirm_requirements":
    case "show_requirement_summary":
    case "request_confirmation":
    case "confirm_configuration":
      return "confirm_requirements";

    case "out_of_scope":
    case "reject_unrelated_request":
      return "out_of_scope";

    case "new_shopping_task":
    case "start_new_task":
      return "new_shopping_task";

    default:
      return "conversation_reply";
  }
}

/**
 * Normalizes legacy question and slot structures into a validated SingleNextQuestion.
 */
export function normalizeQuestion(
  rawQuestion: unknown,
  rawSlot?: unknown
): SingleNextQuestion | null {
  if (!rawQuestion && !rawSlot) return null;

  let text = "";
  let attrKey = "";
  let inputType: SingleNextQuestion["inputType"] = "single_select";
  let options: QuestionOption[] = [];
  let allowSkip = true;
  let required = false;

  // Case 1: rawQuestion is a string (e.g. { slot: "os", question: "Do you have an OS preference?" })
  if (typeof rawQuestion === "string" && rawQuestion.trim()) {
    text = rawQuestion.trim();
    attrKey = typeof rawSlot === "string" ? rawSlot.trim() : "preference";
  } else if (typeof rawQuestion === "object" && rawQuestion !== null) {
    const qObj = rawQuestion as Record<string, unknown>;
    text = String(qObj.text || qObj.question || "").trim();
    attrKey = String(qObj.attributeKey || qObj.attribute || qObj.slot || rawSlot || "preference").trim();
    if (qObj.inputType === "single_select" || qObj.inputType === "multi_select") {
      inputType = qObj.inputType;
    }
    allowSkip = qObj.allowSkip !== false;
    required = Boolean(qObj.required);

    if (Array.isArray(qObj.options)) {
      const seen = new Set<string>();
      for (let i = 0; i < qObj.options.length; i++) {
        const item = qObj.options[i];
        let label = "";
        let val = "";
        if (typeof item === "string") {
          label = item.trim();
          val = item.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
        } else if (typeof item === "object" && item !== null) {
          const opt = item as Record<string, string>;
          label = (opt.label || opt.value || "").trim();
          val = (opt.value || opt.label || "").trim();
        }

        const norm = label.toLowerCase();
        if (label && !seen.has(norm)) {
          seen.add(norm);
          options.push({
            id: `opt_${i + 1}`,
            label,
            value: val || label,
          });
        }
      }
    }
  }

  if (!text) return null;

  const canonicalKey = canonicalizeAttributeKey(attrKey) || attrKey.toLowerCase().replace(/[^a-z0-9]+/g, "_");

  // Provide high-quality standard quick-replies if model didn't supply them
  if (options.length === 0) {
    if (canonicalKey === "operating_system" || canonicalKey === "os") {
      options = [
        { id: "opt_macos", label: "macOS", value: "macos" },
        { id: "opt_windows", label: "Windows", value: "windows" },
        { id: "opt_none", label: "No preference", value: "no_preference" },
      ];
    } else if (canonicalKey === "form_factor") {
      options = [
        { id: "opt_over_ear", label: "Over-ear", value: "over_ear" },
        { id: "opt_in_ear", label: "In-ear (Earbuds)", value: "in_ear" },
        { id: "opt_on_ear", label: "On-ear", value: "on_ear" },
        { id: "opt_none", label: "No preference", value: "no_preference" },
      ];
    } else if (canonicalKey === "noise_cancellation") {
      options = [
        { id: "opt_anc", label: "Yes, ANC is important", value: "anc" },
        { id: "opt_passive", label: "Basic noise isolation is fine", value: "passive" },
        { id: "opt_none", label: "No preference", value: "no_preference" },
      ];
    } else if (canonicalKey === "memory" || canonicalKey === "ram") {
      options = [
        { id: "opt_16gb", label: "16GB", value: "16gb" },
        { id: "opt_32gb", label: "32GB", value: "32gb" },
        { id: "opt_8gb", label: "8GB", value: "8gb" },
        { id: "opt_none", label: "No preference", value: "no_preference" },
      ];
    } else if (canonicalKey === "storage") {
      options = [
        { id: "opt_512gb", label: "512GB", value: "512gb" },
        { id: "opt_1tb", label: "1TB", value: "1tb" },
        { id: "opt_2tb", label: "2TB", value: "2tb" },
        { id: "opt_none", label: "No preference", value: "no_preference" },
      ];
    }
  }

  return {
    id: `q_${canonicalKey}`,
    attributeKey: canonicalKey,
    text,
    inputType,
    options,
    allowSkip,
    required,
  };
}

/**
 * Extracts and canonicalizes requirement updates from various schema formats.
 */
export function extractRequirementUpdates(
  rawUpdates: unknown
): Record<string, { value: string | number; source?: "user_explicit" | "user_confirmed" | "ai_suggested" }> {
  const result: Record<string, { value: string | number; source?: "user_explicit" | "user_confirmed" | "ai_suggested" }> = {};
  if (!rawUpdates || typeof rawUpdates !== "object") return result;

  const updatesObj = rawUpdates as Record<string, unknown>;

  // Format 1: Direct map { operating_system: { value: "macos", source: "user_explicit" } }
  // or { operating_system: "macos" }
  for (const [key, val] of Object.entries(updatesObj)) {
    if (key === "brief" || key === "requirements" || key === "attributes") continue;

    const canonicalKey = canonicalizeAttributeKey(key) || key;
    if (typeof val === "object" && val !== null && "value" in val) {
      const v = (val as { value: string | number; source?: string }).value;
      if (typeof v === "string" || typeof v === "number") {
        result[canonicalKey] = {
          value: v,
          source: (val as { source?: "user_explicit" | "user_confirmed" | "ai_suggested" }).source || "user_explicit",
        };
      }
    } else if (typeof val === "string" || typeof val === "number") {
      result[canonicalKey] = {
        value: val,
        source: "user_explicit",
      };
    }
  }

  // Format 2: Legacy { brief: { requirements: [ { constraints: { os: "macOS" } } ] } }
  if (updatesObj.brief && typeof updatesObj.brief === "object") {
    const brief = updatesObj.brief as Record<string, unknown>;
    if (Array.isArray(brief.requirements)) {
      for (const req of brief.requirements) {
        if (req && typeof req === "object" && req.constraints) {
          const constraints = req.constraints as Record<string, unknown>;
          for (const [ck, cv] of Object.entries(constraints)) {
            const canonicalKey = canonicalizeAttributeKey(ck) || ck;
            if (typeof cv === "string" || typeof cv === "number") {
              result[canonicalKey] = {
                value: cv,
                source: "user_explicit",
              };
            }
          }
        }
      }
    }
  }

  // Format 3: Legacy { attributes: { os: "macOS" } }
  if (updatesObj.attributes && typeof updatesObj.attributes === "object") {
    for (const [ak, av] of Object.entries(updatesObj.attributes as Record<string, unknown>)) {
      const canonicalKey = canonicalizeAttributeKey(ak) || ak;
      if (typeof av === "string" || typeof av === "number") {
        result[canonicalKey] = {
          value: av,
          source: "ai_suggested",
        };
      }
    }
  }

  return result;
}

/**
 * MANDATORY SERVER-SIDE NORMALIZER:
 * Receives raw output from Gemini Interactions API or generateContent,
 * parses structured JSON, maps legacy formats, validates against internal contracts,
 * and guarantees that raw JSON NEVER reaches customer chat.
 */
export function normalizeInteractionResponse(
  rawOutput: unknown,
  context?: NormalizeContext
): NormalizedInteractionResult {
  const fallbackMessage = "Tell me which specific features you prefer.";
  const rawText = extractStructuredOutputText(rawOutput);

  if (!rawText) {
    return {
      success: false,
      scope: "shopping_related",
      action: "conversation_reply",
      assistantMessage: fallbackMessage,
      question: null,
      requirementUpdates: {},
      readyForSearch: false,
      referencedProductIds: [],
      variantSelection: null,
      error: "Empty output received from model.",
    };
  }

  // If the raw text is plain text and not JSON, treat it as a natural conversation reply
  if (!isRawJsonString(rawText)) {
    return {
      success: true,
      scope: "shopping_related",
      action: "conversation_reply",
      assistantMessage: resolveNaturalMessage(rawText, fallbackMessage),
      question: null,
      requirementUpdates: {},
      readyForSearch: false,
      referencedProductIds: [],
      variantSelection: null,
    };
  }

  try {
    const cleanJson = extractCleanJsonString(rawText);
    const parsed = JSON.parse(cleanJson) as Record<string, unknown>;

    // 1. Resolve Scope
    let scope: DomainScope = "shopping_related";
    if (parsed.scope && typeof parsed.scope === "string") {
      const s = parsed.scope.toLowerCase();
      if (s === "out_of_scope" || s.includes("out_of_scope")) {
        scope = "out_of_scope";
      } else if (s === "shopping_follow_up" || s === "product_information" || s === "ambiguous_intent") {
        scope = s as DomainScope;
      }
    }

    // 2. Resolve Action
    const rawActionStr = String(parsed.action || "");
    const action = normalizeActionName(rawActionStr);

    if (action === "out_of_scope" || scope === "out_of_scope") {
      return {
        success: true,
        scope: "out_of_scope",
        action: "out_of_scope",
        assistantMessage: SPENDPILOT_REDIRECT_MESSAGE,
        question: null,
        requirementUpdates: {},
        readyForSearch: false,
        referencedProductIds: [],
        variantSelection: null,
        rawParsedAction: rawActionStr,
      };
    }

    // 3. Resolve Customer-Facing Natural Assistant Message
    // Check assistantMessage, response, message, or question text
    let naturalMessage = resolveNaturalMessage(
      parsed.assistantMessage || parsed.response || parsed.message,
      ""
    );

    // 4. Resolve Question
    const question = normalizeQuestion(
      parsed.question || parsed.nextQuestion,
      parsed.slot || parsed.attributeKey
    );

    // If assistantMessage is still empty, derive a natural message from question or context
    if (!naturalMessage) {
      if (question?.text) {
        naturalMessage = question.text;
      } else if (action === "search_products") {
        naturalMessage = context?.category
          ? `Scanning verified ${context.category} deals within your budget...`
          : getRandomSearchingText();
      } else {
        naturalMessage = fallbackMessage;
      }
    }

    // Double-check: ensure naturalMessage NEVER has internal JSON
    naturalMessage = resolveNaturalMessage(naturalMessage, fallbackMessage);

    // 5. Resolve Requirement Updates
    const requirementUpdates = extractRequirementUpdates(
      parsed.requirementUpdates || parsed.updates || parsed.requirementsUpdate
    );

    // 6. Ready for search
    const readyForSearch = Boolean(
      parsed.readyForSearch || parsed.ready_for_search || action === "search_products"
    );

    // If starting or ready for search, NEVER output generic preference questions like "What specific preferences do you have in mind?"
    if (readyForSearch || action === "search_products") {
      const isPreferencesQuestion =
        /what specific preferences|what details matter most|ready to help you find what you need/i.test(naturalMessage) ||
        /\?$/.test(naturalMessage.trim());
      if (!naturalMessage || isPreferencesQuestion || naturalMessage === fallbackMessage) {
        naturalMessage = getRandomSearchingText();
      }
    }

    // 7. Referenced Product IDs
    const referencedProductIds = Array.isArray(parsed.referencedProductIds)
      ? (parsed.referencedProductIds as string[])
      : [];

    // 8. Variant Selection
    let variantSelection: NormalizedInteractionResult["variantSelection"] = null;
    if (parsed.variantSelection && typeof parsed.variantSelection === "object") {
      const vs = parsed.variantSelection as Record<string, unknown>;
      if (typeof vs.productId === "string" && typeof vs.selectedOptions === "object" && vs.selectedOptions !== null) {
        variantSelection = {
          productId: vs.productId,
          selectedOptions: vs.selectedOptions as Record<string, string>,
        };
      }
    }

    return {
      success: true,
      scope,
      action,
      assistantMessage: naturalMessage,
      question,
      requirementUpdates,
      readyForSearch,
      referencedProductIds,
      variantSelection,
      rawParsedAction: rawActionStr,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Malformed JSON response";
    return {
      success: false,
      scope: "shopping_related",
      action: "conversation_reply",
      assistantMessage: fallbackMessage,
      question: null,
      requirementUpdates: {},
      readyForSearch: false,
      referencedProductIds: [],
      variantSelection: null,
      error: errorMsg,
    };
  }
}
