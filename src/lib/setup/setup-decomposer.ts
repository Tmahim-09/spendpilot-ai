import { Type } from "@google/genai";
import { executeWithModelFailover, buildModelGenerationConfig } from "../ai/gemini-router.ts";
import type {
  CurrencyCode,
  SetupDecompositionResult,
  SetupRequirementItem,
} from "../../types/index.ts";

const decompositionSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "Brief summary of the setup being planned and intent interpretation.",
    },
    isPrebuiltVsCustom: {
      type: Type.STRING,
      description: "'prebuilt' if a prebuilt desktop system is requested, 'custom_pc' if custom components are requested, or 'standard' for non-PC bundles.",
    },
    items: {
      type: Type.ARRAY,
      description: "List of at most 8 distinct product requirements that compose this setup.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "Product category name (e.g. 'Gaming desktop PC', 'Gaming monitor', 'Mechanical keyboard').",
          },
          searchQuery: {
            type: Type.STRING,
            description: "Targeted product search query for Channel3 (e.g. 'gaming desktop PC RTX', '144Hz gaming monitor').",
          },
          allocationPercentage: {
            type: Type.NUMBER,
            description: "Suggested percentage of total budget allocated to this item (e.g. 60 for 60%).",
          },
          allocatedAmount: {
            type: Type.NUMBER,
            description: "Suggested budget amount for this item in the target currency.",
          },
          requirements: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Key features or specifications requested for this product.",
          },
          priority: {
            type: Type.STRING,
            description: "Priority: 'high', 'medium', or 'low'.",
          },
        },
        required: [
          "name",
          "searchQuery",
          "allocationPercentage",
          "allocatedAmount",
          "requirements",
          "priority",
        ],
      },
    },
  },
  required: ["summary", "isPrebuiltVsCustom", "items"],
};

export interface DecomposeSetupOptions {
  query: string;
  totalBudget: number;
  currency?: CurrencyCode;
  requestId?: string;
}

/**
 * Decomposes a multi-product setup shopping request into individual product requirements
 * using Gemini and normalizes allocations server-side.
 */
export async function decomposeSetupRequest({
  query,
  totalBudget,
  currency = "USD",
  requestId = `dec_${Date.now().toString(36)}`,
}: DecomposeSetupOptions): Promise<SetupDecompositionResult> {
  const safeTotalBudget = Math.max(1, totalBudget);

  const systemInstruction = `You are the Lead Multi-Product Setup Planner for SpendPilot AI (PayPal AI Hackathon 2026).
Your job is to break down a multi-product bundle or setup request into individual product requirements with proposed budget allocations.
Rules:
1. Identify actual requested products: Preserve explicitly requested items. Do not omit requested items or add gratuitous extras.
2. Max items: Return at most 8 distinct product requirements.
3. Allocations: Propose reasonable allocations where the sum of allocated amounts does NOT exceed the total budget.
4. Search queries: Each item must have a clean, targeted product search query suitable for Channel3.
5. Distinction: Distinguish between a prebuilt desktop system ('prebuilt') and custom individual component PC builds ('custom_pc').
6. Priority: Assign 'high', 'medium', or 'low' priority.`;

  const userPrompt = `Shopping Request: "${query}"
Total Budget: ${currency} ${safeTotalBudget}

Decompose this request into individual product requirements with budget allocations within the total budget.`;

  const rawResult = await executeWithModelFailover<Record<string, unknown>>({
    requestId,
    totalTimeoutMs: 14000,
    executeFn: async (ai, model, signal) => {
      const config = buildModelGenerationConfig(model, {
        abortSignal: signal,
        systemInstruction,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: decompositionSchema,
      });

      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        config,
      });

      const text = response.text?.trim() || "{}";
      return JSON.parse(text) as Record<string, unknown>;
    },
    validateFn: (data) => {
      if (!data || typeof data !== "object") {
        return { valid: false, reason: "Decomposition output is not an object" };
      }
      const items = (data as Record<string, unknown>).items;
      if (!Array.isArray(items) || items.length === 0) {
        return { valid: false, reason: "Decomposition items list is empty" };
      }
      return { valid: true };
    },
  });

  return normalizeDecomposition(rawResult.data, safeTotalBudget, currency);
}

/**
 * Deterministically validates and normalizes Gemini decomposition output:
 * - Caps at 8 items.
 * - Generates stable requirement IDs (`req-1`, `req-2`, ...).
 * - Enforces that total allocations sum to no more than the user's total budget.
 * - Computes exact integer cents (minor units).
 */
export function normalizeDecomposition(
  rawJson: unknown,
  totalBudget: number,
  currency: CurrencyCode = "USD"
): SetupDecompositionResult {
  const safeTotalBudget = Math.max(1, totalBudget);
  const totalBudgetMinor = Math.round(safeTotalBudget * 100);

  const rawObj = typeof rawJson === "object" && rawJson !== null ? (rawJson as Record<string, unknown>) : {};
  const summary =
    typeof rawObj.summary === "string" && rawObj.summary.trim()
      ? rawObj.summary.trim()
      : `Setup plan for budget of ${currency} ${safeTotalBudget}`;

  const isPrebuiltVsCustom =
    rawObj.isPrebuiltVsCustom === "prebuilt" ||
    rawObj.isPrebuiltVsCustom === "custom_pc"
      ? rawObj.isPrebuiltVsCustom
      : "standard";

  const rawItems = Array.isArray(rawObj.items) ? rawObj.items : [];
  // Cap at 8 items max
  const cappedItems = rawItems.slice(0, 8);

  // If no items extracted, generate a safe fallback single item
  if (cappedItems.length === 0) {
    const defaultItem: SetupRequirementItem = {
      id: "req-1",
      name: "Main Setup Item",
      searchQuery: summary,
      allocationPercentage: 100,
      allocatedAmountMinor: totalBudgetMinor,
      allocatedAmount: safeTotalBudget,
      requirements: [],
      priority: "high",
    };
    return {
      currency,
      totalBudget: safeTotalBudget,
      totalBudgetMinor,
      allocatedTotalMinor: totalBudgetMinor,
      remainingUnallocatedMinor: 0,
      items: [defaultItem],
      summary,
      isPrebuiltVsCustom,
    };
  }

  // Parse raw amounts and percentages
  interface ParsedItem {
    name: string;
    searchQuery: string;
    rawPct: number;
    rawAmount: number;
    requirements: string[];
    priority: "high" | "medium" | "low";
  }

  const parsedItems: ParsedItem[] = [];
  let sumRawPct = 0;
  let sumRawAmount = 0;

  for (const raw of cappedItems) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;

    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Setup Component";
    const searchQuery =
      typeof item.searchQuery === "string" && item.searchQuery.trim()
        ? item.searchQuery.trim()
        : name;

    const rawPct = typeof item.allocationPercentage === "number" && item.allocationPercentage > 0
      ? item.allocationPercentage
      : 0;

    const rawAmount = typeof item.allocatedAmount === "number" && item.allocatedAmount > 0
      ? item.allocatedAmount
      : (rawPct > 0 ? (rawPct / 100) * safeTotalBudget : 0);

    const rawReqs = Array.isArray(item.requirements)
      ? item.requirements.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
      : [];

    const rawPriority = typeof item.priority === "string" ? item.priority.toLowerCase() : "medium";
    const priority: "high" | "medium" | "low" =
      rawPriority === "high" || rawPriority === "low" ? rawPriority : "medium";

    parsedItems.push({
      name,
      searchQuery,
      rawPct,
      rawAmount,
      requirements: rawReqs,
      priority,
    });

    sumRawPct += rawPct;
    sumRawAmount += rawAmount;
  }

  // If parsedItems is empty after filtering
  if (parsedItems.length === 0) {
    return normalizeDecomposition({}, safeTotalBudget, currency);
  }

  // Server-side normalization of allocations
  // Determine if percentages or dollar amounts should be primary basis
  const items: SetupRequirementItem[] = [];
  let allocatedTotalMinor = 0;

  // If amounts were provided and sum is within budget, use amounts
  const amountsSumMinor = Math.round(sumRawAmount * 100);
  const useExactAmounts = amountsSumMinor > 0 && amountsSumMinor <= totalBudgetMinor;

  for (let i = 0; i < parsedItems.length; i++) {
    const item = parsedItems[i];
    const id = `req-${i + 1}`;

    let itemMinor: number;
    if (useExactAmounts) {
      itemMinor = Math.round(item.rawAmount * 100);
    } else if (sumRawPct > 0) {
      // Normalize percentage so they don't exceed 100%
      const normalizedPct = (item.rawPct / Math.max(sumRawPct, 100)) * 100;
      itemMinor = Math.floor((normalizedPct / 100) * totalBudgetMinor);
    } else {
      // Distribute evenly if no amounts or percentages
      itemMinor = Math.floor(totalBudgetMinor / parsedItems.length);
    }

    // Minimum $1 per item unless total budget is extremely small
    itemMinor = Math.max(100, itemMinor);

    allocatedTotalMinor += itemMinor;
    const allocatedAmount = Math.round(itemMinor) / 100;
    const allocationPercentage = Math.round((itemMinor / totalBudgetMinor) * 100);

    items.push({
      id,
      name: item.name,
      searchQuery: item.searchQuery,
      allocationPercentage,
      allocatedAmountMinor: itemMinor,
      allocatedAmount,
      requirements: item.requirements,
      priority: item.priority,
    });
  }

  // Strictly enforce budget ceiling: if allocatedTotalMinor exceeds totalBudgetMinor, scale down!
  if (allocatedTotalMinor > totalBudgetMinor) {
    const scale = totalBudgetMinor / allocatedTotalMinor;
    allocatedTotalMinor = 0;

    for (let i = 0; i < items.length; i++) {
      items[i].allocatedAmountMinor = Math.floor(items[i].allocatedAmountMinor * scale);
      items[i].allocatedAmount = Math.round(items[i].allocatedAmountMinor) / 100;
      items[i].allocationPercentage = Math.round((items[i].allocatedAmountMinor / totalBudgetMinor) * 100);
      allocatedTotalMinor += items[i].allocatedAmountMinor;
    }
  }

  const remainingUnallocatedMinor = Math.max(0, totalBudgetMinor - allocatedTotalMinor);

  return {
    currency,
    totalBudget: safeTotalBudget,
    totalBudgetMinor,
    allocatedTotalMinor,
    remainingUnallocatedMinor,
    items,
    summary,
    isPrebuiltVsCustom,
  };
}
