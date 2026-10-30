import { Type } from "@google/genai";
import { executeWithModelFailover, buildModelGenerationConfig } from "../ai/gemini-router.ts";
import { identifyFranchisesInText } from "../relevance/entity-registry.ts";
import { inferDiversityGroup } from "./bundle-diversity.ts";
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
    mandatoryFranchises: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of mandatory franchises or themes requested (e.g. ['Naruto', 'One Piece', 'Attack on Titan']).",
    },
    mandatoryCharacters: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of explicitly requested characters (e.g. ['Luffy', 'Naruto Uzumaki', 'Levi Ackerman']).",
    },
    items: {
      type: Type.ARRAY,
      description: "List of at most 8 distinct product requirements that compose this setup.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "Product category name (e.g. 'Naruto LED neon wall sign', 'One Piece canvas wall art', 'Attack on Titan bedding set').",
          },
          productCategory: {
            type: Type.STRING,
            description: "Physical category (e.g. 'neon wall decor', 'canvas wall art', 'bedding set', 'figurine', 'rug', 'throw pillows', 'desk mat').",
          },
          searchQuery: {
            type: Type.STRING,
            description: "High-specificity search query for Channel3 preserving mandatory franchise/character (e.g. 'Naruto Uzumaki anime LED neon wall sign').",
          },
          fallbackQuery: {
            type: Type.STRING,
            description: "Targeted fallback search query preserving mandatory franchise (e.g. 'Naruto anime wall light'). NEVER make it generic.",
          },
          requiredFranchises: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Mandatory franchise(s) this specific item MUST belong to (e.g. ['Naruto']). Generic or other franchises are rejected.",
          },
          requiredCharacters: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Specific character(s) required if explicitly requested.",
          },
          mustHaveTerms: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Terms that MUST appear in the product listing (e.g. ['Naruto']).",
          },
          hardConstraints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Mandatory conditions for eligibility (e.g. ['Must be authentic Naruto merchandise', 'Must be a wall decoration']).",
          },
          softPreferences: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Ranking preferences (e.g. ['LED lighting', 'vibrant colors', 'wall mounted']).",
          },
          allowedSubstitutions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Alternative product formats allowed if primary format unavailable (e.g. ['Naruto wall scroll', 'Naruto poster', 'Naruto decorative lamp']).",
          },
          diversityGroup: {
            type: Type.STRING,
            description: "Visual/physical diversity group: 'wall-lighting', 'wall-art', 'bedding', 'figurine', 'rug', 'pillows', 'desk-mat', 'electronics', 'hardware', or 'general'.",
          },
          allocationPercentage: {
            type: Type.NUMBER,
            description: "Suggested percentage of total budget allocated to this item (e.g. 20 for 20%).",
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
          "productCategory",
          "searchQuery",
          "fallbackQuery",
          "requiredFranchises",
          "diversityGroup",
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
Your job is to break down a multi-product bundle or setup request into individual product requirements with hard constraints and budget allocations.

CRITICAL RULES FOR RELEVANCE AND DIVERSITY:
1. Hard Requirements vs Soft Preferences:
   - HARD REQUIREMENTS: Conditions that a product MUST satisfy to be eligible. If the user mentions specific themes, anime franchises (e.g. Naruto, One Piece, Attack on Titan), or characters, these are MANDATORY HARD CONSTRAINTS on requiredFranchises.
   - A generic item (e.g. "Girl Boss canvas", "Astronaut moon artwork", "plain solid duvet cover") is completely unacceptable for a themed request.
   - Another anime franchise (e.g. Demon Slayer) is NOT an acceptable substitute when Naruto, One Piece, or Attack on Titan is requested.
   - SOFT PREFERENCES: Color, style, shape, or material preferences that guide ranking among eligible products.

2. BUNDLE DIVERSITY:
   - When the user asks for varied items or says "make sure none of them are similar", generate a diverse collection across DIFFERENT physical item types:
     * One wall neon sign / decorative lighting ('wall-lighting')
     * One canvas or wall scroll artwork ('wall-art')
     * One bedding set ('bedding')
     * One character figurine or collectible ('figurine')
     * One floor rug / carpet ('rug')
     * One decorative pillow / cushion set ('pillows')
     * One desk mat / mouse pad ('desk-mat')
   - AVOID redundant combinations (e.g. do not suggest 3 canvas prints or 2 mouse pads).

3. HIGH-SPECIFICITY SEARCH QUERIES:
   - Channel3 queries MUST include the mandatory franchise and character:
     * GOOD: "Naruto Uzumaki anime LED neon wall sign"
     * GOOD: "One Piece Monkey D Luffy anime canvas wall art"
     * GOOD: "Attack on Titan Survey Corps anime bedding set"
     * BAD: "Wall art", "Decorative bedding", "Neon light"
   - Fallback queries MUST preserve the mandatory franchise (e.g. "Naruto anime wall light"). NEVER fall back to generic non-franchise terms.

4. Distribute the requested franchises across the requirements so each requested franchise is represented.
5. Max 8 items. Budget sum must not exceed the total budget.`;

  const userPrompt = `Shopping Request: "${query}"
Total Budget: ${currency} ${safeTotalBudget}

Decompose this request into individual product requirements with mandatory franchises, diversity groups, and budget allocations.`;

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

  return normalizeDecomposition(rawResult.data, safeTotalBudget, currency, query);
}

/**
 * Deterministically validates and normalizes Gemini decomposition output:
 * - Caps at 8 items.
 * - Extracts and enforces mandatory franchises from query if omitted by LLM.
 * - Enforces diversity groups.
 * - Enforces that total allocations sum to no more than the user's total budget.
 * - Computes exact integer cents (minor units).
 */
export function normalizeDecomposition(
  rawJson: unknown,
  totalBudget: number,
  currency: CurrencyCode = "USD",
  originalQuery: string = ""
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

  // Identify mandatory franchises from the user query
  const detectedFranchises = identifyFranchisesInText(originalQuery);
  const detectedFranchiseNames = Array.from(new Set(detectedFranchises.map((f) => f.canonicalName)));

  const rawMandatoryFranchises = Array.isArray(rawObj.mandatoryFranchises)
    ? rawObj.mandatoryFranchises.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    : [];

  const mandatoryFranchises = Array.from(new Set([...detectedFranchiseNames, ...rawMandatoryFranchises]));

  const rawItems = Array.isArray(rawObj.items) ? rawObj.items : [];
  const cappedItems = rawItems.slice(0, 8);

  // If no items extracted, generate a safe fallback single item
  if (cappedItems.length === 0) {
    const defaultItem: SetupRequirementItem = {
      id: "req-1",
      name: "Main Setup Item",
      searchQuery: summary,
      fallbackQuery: summary,
      productCategory: "general",
      allocationPercentage: 100,
      allocatedAmountMinor: totalBudgetMinor,
      allocatedAmount: safeTotalBudget,
      requirements: [],
      priority: "high",
      requiredFranchises: mandatoryFranchises,
      diversityGroup: "general",
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
      mandatoryFranchises,
    };
  }

  // Parse raw amounts and percentages
  interface ParsedItem {
    name: string;
    productCategory: string;
    searchQuery: string;
    fallbackQuery: string;
    rawPct: number;
    rawAmount: number;
    requirements: string[];
    priority: "high" | "medium" | "low";
    requiredFranchises: string[];
    requiredCharacters: string[];
    mustHaveTerms: string[];
    hardConstraints: string[];
    softPreferences: string[];
    allowedSubstitutions: string[];
    diversityGroup: string;
  }

  const parsedItems: ParsedItem[] = [];
  let sumRawPct = 0;
  let sumRawAmount = 0;

  for (let idx = 0; idx < cappedItems.length; idx++) {
    const raw = cappedItems[idx];
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;

    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Setup Component";
    let searchQuery = typeof item.searchQuery === "string" && item.searchQuery.trim() ? item.searchQuery.trim() : name;
    let fallbackQuery = typeof item.fallbackQuery === "string" && item.fallbackQuery.trim() ? item.fallbackQuery.trim() : searchQuery;
    const productCategory = typeof item.productCategory === "string" && item.productCategory.trim() ? item.productCategory.trim() : name;

    const rawPct = typeof item.allocationPercentage === "number" && item.allocationPercentage > 0 ? item.allocationPercentage : 0;
    const rawAmount = typeof item.allocatedAmount === "number" && item.allocatedAmount > 0
      ? item.allocatedAmount
      : (rawPct > 0 ? (rawPct / 100) * safeTotalBudget : 0);

    const rawReqs = Array.isArray(item.requirements)
      ? item.requirements.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
      : [];

    const rawPriority = typeof item.priority === "string" ? item.priority.toLowerCase() : "medium";
    const priority: "high" | "medium" | "low" = rawPriority === "high" || rawPriority === "low" ? rawPriority : "medium";

    let itemFranchises = Array.isArray(item.requiredFranchises)
      ? item.requiredFranchises.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
      : [];

    // If query has mandatory franchises but this item has none, assign one cyclically from query franchises
    if (itemFranchises.length === 0 && mandatoryFranchises.length > 0) {
      const assigned = mandatoryFranchises[idx % mandatoryFranchises.length];
      itemFranchises = [assigned];
    }

    // Ensure search query includes the mandatory franchise
    if (itemFranchises.length > 0) {
      const primaryFranchise = itemFranchises[0];
      if (!searchQuery.toLowerCase().includes(primaryFranchise.toLowerCase())) {
        searchQuery = `${primaryFranchise} ${searchQuery}`;
      }
      if (!fallbackQuery.toLowerCase().includes(primaryFranchise.toLowerCase())) {
        fallbackQuery = `${primaryFranchise} ${fallbackQuery}`;
      }
    }

    const diversityGroup = typeof item.diversityGroup === "string" && item.diversityGroup.trim()
      ? item.diversityGroup.trim()
      : inferDiversityGroup(name);

    const allowedSubstitutions = Array.isArray(item.allowedSubstitutions)
      ? item.allowedSubstitutions.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [];

    parsedItems.push({
      name,
      productCategory,
      searchQuery,
      fallbackQuery,
      rawPct,
      rawAmount,
      requirements: rawReqs,
      priority,
      requiredFranchises: itemFranchises,
      requiredCharacters: Array.isArray(item.requiredCharacters) ? (item.requiredCharacters as string[]) : [],
      mustHaveTerms: Array.isArray(item.mustHaveTerms) ? (item.mustHaveTerms as string[]) : itemFranchises,
      hardConstraints: Array.isArray(item.hardConstraints) ? (item.hardConstraints as string[]) : [`Must belong to ${itemFranchises.join(", ")}`],
      softPreferences: Array.isArray(item.softPreferences) ? (item.softPreferences as string[]) : [],
      allowedSubstitutions,
      diversityGroup,
    });

    sumRawPct += rawPct;
    sumRawAmount += rawAmount;
  }

  if (parsedItems.length === 0) {
    return normalizeDecomposition({}, safeTotalBudget, currency, originalQuery);
  }

  // Server-side normalization of allocations
  const items: SetupRequirementItem[] = [];
  let allocatedTotalMinor = 0;

  const amountsSumMinor = Math.round(sumRawAmount * 100);
  const useExactAmounts = amountsSumMinor > 0 && amountsSumMinor <= totalBudgetMinor;

  for (let i = 0; i < parsedItems.length; i++) {
    const item = parsedItems[i];
    const id = `req-${i + 1}`;

    let itemMinor: number;
    if (useExactAmounts) {
      itemMinor = Math.round(item.rawAmount * 100);
    } else if (sumRawPct > 0) {
      const normalizedPct = (item.rawPct / Math.max(sumRawPct, 100)) * 100;
      itemMinor = Math.floor((normalizedPct / 100) * totalBudgetMinor);
    } else {
      itemMinor = Math.floor(totalBudgetMinor / parsedItems.length);
    }

    itemMinor = Math.max(100, itemMinor);

    allocatedTotalMinor += itemMinor;
    const allocatedAmount = Math.round(itemMinor) / 100;
    const allocationPercentage = Math.round((itemMinor / totalBudgetMinor) * 100);

    items.push({
      id,
      name: item.name,
      productCategory: item.productCategory,
      searchQuery: item.searchQuery,
      fallbackQuery: item.fallbackQuery,
      allocationPercentage,
      allocatedAmountMinor: itemMinor,
      allocatedAmount,
      requirements: item.requirements,
      priority: item.priority,
      requiredFranchises: item.requiredFranchises,
      requiredCharacters: item.requiredCharacters,
      mustHaveTerms: item.mustHaveTerms,
      hardConstraints: item.hardConstraints,
      softPreferences: item.softPreferences,
      allowedSubstitutions: item.allowedSubstitutions,
      diversityGroup: item.diversityGroup,
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
    mandatoryFranchises,
  };
}
