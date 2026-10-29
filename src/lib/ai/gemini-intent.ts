import { Type } from "@google/genai";
import { generateContentWithRetry } from "./gemini-client.ts";
import type { ParsedShoppingIntent, CurrencyCode } from "../../types/index.ts";

const ALLOWED_CURRENCIES: CurrencyCode[] = ["USD", "EUR", "GBP"];

const shoppingIntentSchema = {
  type: Type.OBJECT,
  properties: {
    isShoppingRequest: {
      type: Type.BOOLEAN,
      description:
        "True if the user is looking to shop, discover, or buy products. False for greetings, general questions, or non-shopping queries.",
    },
    searchQuery: {
      type: Type.STRING,
      description:
        "A concise, focused 2-5 word keyword search query suitable for searching an e-commerce product catalog (e.g. 'wireless mouse', 'mechanical keyboard', 'ergonomic mesh chair'). Do not include pricing, budget words, or punctuation in this search query.",
    },
    category: {
      type: Type.STRING,
      description: "Primary product category (e.g. 'Computer Peripherals', 'Office Furniture', 'Audio', 'Desk Accessories').",
    },
    userStatedTotalBudget: {
      type: Type.NUMBER,
      description:
        "Total overall budget stated in the user text as a positive number (e.g., 'under $300' -> 300). Null if no total budget stated.",
    },
    userStatedMaxItemPrice: {
      type: Type.NUMBER,
      description:
        "Per-item price cap explicitly stated (e.g., 'max $50 per item', 'each under $40' -> 40). Null if not specified.",
    },
    currency: {
      type: Type.STRING,
      description: "ISO currency code detected (USD, EUR, GBP). Defaults to USD.",
    },
    mustHave: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Essential hard requirements (e.g. ['wireless', 'Bluetooth', 'silent']).",
    },
    preferences: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Soft preferences or aesthetic desires (e.g. ['minimalist', 'black finish']).",
    },
    excluded: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Features or brands explicitly excluded by the user.",
    },
    summary: {
      type: Type.STRING,
      description:
        "A concise 1-sentence factual summary of what the user is shopping for, their key constraints, and budget.",
    },
    needsClarification: {
      type: Type.BOOLEAN,
      description:
        "True if the request is not a shopping request or is too vague to search for any product.",
    },
    clarificationMessage: {
      type: Type.STRING,
      description:
        "Helpful friendly message explaining how SpendPilot can help or asking for product requirements.",
    },
  },
  required: ["isShoppingRequest", "searchQuery", "category", "summary", "needsClarification"],
};

export interface InterpretIntentOptions {
  userInput: string;
  formBudget?: number | null;
  formCurrency?: CurrencyCode;
}

/**
 * Uses Gemini with structured JSON output to parse the user's natural language shopping request.
 * Enforces server-side precedence: form values take precedence over parsed text values.
 */
export async function interpretShoppingIntent({
  userInput,
  formBudget = null,
  formCurrency = "USD",
}: InterpretIntentOptions): Promise<ParsedShoppingIntent> {
  const trimmedInput = userInput.trim();

  const systemInstruction = `You are the Shopping Intent Parser for SpendPilot AI, a budget-aware commerce assistant for the PayPal AI Hackathon 2026.
Your job is to extract structured shopping requirements from user requests.
Rules:
1. If the user input is a greeting (e.g. "hi", "hello"), chit-chat, or off-topic, set isShoppingRequest to false, needsClarification to true, and provide a polite clarificationMessage explaining you help find and compare products within a budget.
2. For shopping requests, extract a clean product search query without pricing words or conversational phrases. (e.g., "Help me find a reliable wireless mouse under $40" -> "reliable wireless mouse").
3. Distinguish total overall budget (e.g. "total under $300") from per-item caps (e.g. "no single item over $50").
4. Never invent products or hallucinate constraints not stated or implied by the user.`;

  const parsedJson = await generateContentWithRetry(async (ai, model) => {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [{ text: `Shopping request to parse:\n"${trimmedInput}"` }],
        },
      ],
      config: {
        systemInstruction,
        temperature: 0.1, // Low temperature for deterministic factual extraction
        responseMimeType: "application/json",
        responseSchema: shoppingIntentSchema,
      },
    });

    const text = response.text?.trim() || "{}";
    return JSON.parse(text) as Record<string, unknown>;
  });

  return resolveShoppingIntent(parsedJson, trimmedInput, formBudget, formCurrency);
}

/**
 * Normalizes and validates raw intent data parsed from Gemini, enforcing server-side form precedence.
 */
export function resolveShoppingIntent(
  parsedJson: Record<string, unknown>,
  userInput: string,
  formBudget: number | null = null,
  formCurrency: CurrencyCode = "USD"
): ParsedShoppingIntent {
  const trimmedInput = userInput.trim();

  // Server-side validation and sanitization
  const isShoppingRequest = Boolean(parsedJson.isShoppingRequest);
  const needsClarification = Boolean(parsedJson.needsClarification) || !isShoppingRequest;

  // Clean searchQuery fallback
  let searchQuery = typeof parsedJson.searchQuery === "string" ? parsedJson.searchQuery.trim() : "";
  if (!searchQuery || searchQuery.length < 2) {
    searchQuery = trimmedInput.slice(0, 100);
  }

  // Precedence rule: If user explicitly provided a budget in the UI form, it is authoritative!
  let resolvedTotalBudget: number | null = null;
  if (formBudget !== null && typeof formBudget === "number" && formBudget > 0) {
    resolvedTotalBudget = formBudget;
  } else if (
    typeof parsedJson.userStatedTotalBudget === "number" &&
    parsedJson.userStatedTotalBudget > 0 &&
    parsedJson.userStatedTotalBudget <= 1000000
  ) {
    resolvedTotalBudget = parsedJson.userStatedTotalBudget;
  }

  // Max item price
  let maxItemPrice: number | null = null;
  if (
    typeof parsedJson.userStatedMaxItemPrice === "number" &&
    parsedJson.userStatedMaxItemPrice > 0 &&
    parsedJson.userStatedMaxItemPrice <= 1000000
  ) {
    maxItemPrice = parsedJson.userStatedMaxItemPrice;
  }

  // Currency resolution: form currency takes precedence, fallback to allowed currencies
  let currency: CurrencyCode = formCurrency;
  if (typeof parsedJson.currency === "string") {
    const upperCurr = parsedJson.currency.toUpperCase() as CurrencyCode;
    if (ALLOWED_CURRENCIES.includes(upperCurr) && !formBudget) {
      currency = upperCurr;
    }
  }

  const category =
    typeof parsedJson.category === "string" && parsedJson.category.trim()
      ? parsedJson.category.trim()
      : "General Products";

  const summary =
    typeof parsedJson.summary === "string" && parsedJson.summary.trim()
      ? parsedJson.summary.trim()
      : `Looking for ${searchQuery}${resolvedTotalBudget ? ` within budget of ${currency} ${resolvedTotalBudget}` : ""}.`;

  const mustHave = Array.isArray(parsedJson.mustHave)
    ? parsedJson.mustHave.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const preferences = Array.isArray(parsedJson.preferences)
    ? parsedJson.preferences.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const excluded = Array.isArray(parsedJson.excluded)
    ? parsedJson.excluded.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const clarificationMessage =
    typeof parsedJson.clarificationMessage === "string" && parsedJson.clarificationMessage.trim()
      ? parsedJson.clarificationMessage.trim()
      : needsClarification
      ? "I can help you discover and compare products within your budget. What specific item or equipment setup are you looking for?"
      : null;

  return {
    isShoppingRequest,
    searchQuery,
    category,
    totalBudget: resolvedTotalBudget,
    maxItemPrice,
    currency,
    mustHave,
    preferences,
    excluded,
    summary,
    needsClarification,
    clarificationMessage,
  };
}

