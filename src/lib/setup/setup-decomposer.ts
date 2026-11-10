import { Type } from "@google/genai";
import { executeWithModelFailover, buildModelGenerationConfig } from "../ai/gemini-router.ts";
import {
  identifyFranchisesInText,
  normalizeEntityDisplayName,
  isGeneralAnimeTheme,
} from "../relevance/entity-registry.ts";
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
      description: "List of franchises or themes explicitly requested (e.g. ['Naruto', 'One Piece', 'Attack on Titan']).",
    },
    preferredFranchises: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of preferred franchises that can satisfy any category in this setup.",
    },
    mandatoryCharacters: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of explicitly requested characters (e.g. ['Luffy', 'Naruto Uzumaki', 'Levi Ackerman']).",
    },
    requiredTheme: {
      type: Type.STRING,
      description: "Overarching theme requirement (e.g. 'Japanese anime', 'Cyberpunk', 'Minimalist').",
    },
    items: {
      type: Type.ARRAY,
      description: "List of at most 8 distinct product requirements that compose this setup.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "Product role/category name (e.g. 'Anime wall decoration', 'Anime figurine or collectible', 'Anime desk accessory', 'Anime decorative lighting', 'Anime floor or textile decor').",
          },
          productCategory: {
            type: Type.STRING,
            description: "Physical role/category (e.g. 'wall decoration', 'figurine', 'desk accessory', 'decorative lighting', 'floor rug', 'textile decoration').",
          },
          searchQuery: {
            type: Type.STRING,
            description: "Search query for Channel3 including preferred franchises and category (e.g. 'Naruto One Piece Attack on Titan anime room wall decor poster tapestry', 'Naruto One Piece anime action figure').",
          },
          fallbackQuery: {
            type: Type.STRING,
            description: "Targeted fallback search query with alternative formats (e.g. 'Naruto One Piece anime wall scroll tapestry').",
          },
          requiredFranchises: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Mandatory franchise ONLY if the user explicitly requested this individual item to belong to that specific franchise (e.g. ['Naruto']). Otherwise leave empty.",
          },
          preferredFranchises: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of preferred franchises that can satisfy this category (e.g. ['Naruto', 'One Piece', 'Attack on Titan']).",
          },
          allowedProductFormats: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Flexible physical formats allowed for this role (e.g. ['poster', 'wall scroll', 'tapestry', 'neon sign', 'wall flag']).",
          },
          allowAlternativeFormat: {
            type: Type.BOOLEAN,
            description: "Whether alternative decorative formats within the franchise are permitted (default true).",
          },
          allowGeneralAnimeFallback: {
            type: Type.BOOLEAN,
            description: "Whether general anime-themed items are permitted as lower-priority fallback (default true for broad anime room requests).",
          },
          requiredCharacters: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Specific character(s) required if explicitly requested.",
          },
          mustHaveTerms: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Terms that MUST appear in the product listing.",
          },
          hardConstraints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Mandatory conditions for eligibility (e.g. ['Must be decorative anime merchandise', 'Must fit budget']).",
          },
          softPreferences: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Ranking preferences (e.g. ['Vibrant colors', 'Action pose', 'LED lighting']).",
          },
          allowedSubstitutions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Alternative product formats allowed if primary format unavailable.",
          },
          diversityGroup: {
            type: Type.STRING,
            description: "Visual/physical diversity group: 'wall-lighting', 'wall-art', 'bedding', 'figurine', 'rug', 'pillows', 'desk-mat', 'pc', 'monitor', 'keyboard', 'mouse', 'headset', 'speakers', 'chair', 'electronics', 'hardware', or 'general'.",
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

CRITICAL TWO-DIMENSIONAL DECOMPOSITION ARCHITECTURE:
1. Product Role / Category (Physical role):
   - Wall decor ('wall-art' - poster, wall scroll, tapestry, flag, canvas, neon sign)
   - Figurine or collectible ('figurine' - action figure, nendoroid, statue)
   - Desk accessory ('desk-mat' - desk mat, mouse pad, keyboard rest, stand)
   - Decorative lighting ('wall-lighting' - neon sign, LED desk lamp, acrylic light)
   - Floor or textile decor ('rug' or 'bedding' or 'pillows' - rug, blanket, decorative pillows)

2. Theme / Franchise Preference:
   - Identify overarching themes (e.g. 'Japanese anime') and preferred franchises (e.g. ['Naruto', 'One Piece', 'Attack on Titan']).
   - IMPORTANT: In broad requests (e.g. "I am a fan of Naruto, One Piece, Attack on Titan... make my room full of decorative anime products"):
     * Do NOT arbitrarily bind each category to a single franchise (e.g. do NOT say Naruto ONLY for neon sign, One Piece ONLY for canvas, Attack on Titan ONLY for bedding).
     * Set preferredFranchises to all requested franchises on the requirements so ANY preferred franchise can fulfill ANY product category!
     * Leave requiredFranchises EMPTY unless the user explicitly requested a specific combination (e.g. "I want a Naruto poster AND a One Piece figure").
     * Set allowAlternativeFormat: true and allowGeneralAnimeFallback: true for broad decorative requests.
     * Populate allowedProductFormats with flexible physical formats (e.g. ['poster', 'wall scroll', 'tapestry', 'neon sign', 'wall flag']).

3. BUNDLE DIVERSITY:
   - When the user asks for varied items or says "make sure none of them are similar", generate a diverse collection across DIFFERENT physical item types:
     * One decorative lighting / neon sign ('wall-lighting')
     * One canvas or wall scroll artwork ('wall-art')
     * One bedding set or blanket ('bedding')
     * One character figurine or collectible ('figurine')
     * One floor rug / carpet ('rug')
     * One desk mat / mouse pad ('desk-mat')
   - AVOID redundant combinations (e.g. do not suggest 3 canvas prints or 2 mouse pads).

4. SEARCH QUERIES:
   - Queries should combine the preferred franchises with the product category and formats:
     * Example: "Naruto One Piece Attack on Titan anime room wall decor poster tapestry"
     * Example: "Naruto One Piece anime action figure"
     * Example: "Naruto One Piece anime floor rug"
   - Fallback queries: "anime room decor {category}"
   - NEVER fall back to completely unrelated non-anime items.

5. Max 8 items. Budget sum must not exceed the total budget.`;

  const userPrompt = `Shopping Request: "${query}"
Total Budget: ${currency} ${safeTotalBudget}

Decompose this request using the two-dimensional architecture (Product roles + Theme preferences) with budget allocations.`;

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

function inferAllowedProductFormats(category: string, diversityGroup: string): string[] {
  const cat = `${category} ${diversityGroup}`.toLowerCase();
  if (cat.includes("light") || cat.includes("neon") || cat.includes("lamp")) {
    return ["neon sign", "led desk lamp", "night light", "acrylic lamp", "decorative lighting"];
  }
  if (
    cat.includes("wall") ||
    cat.includes("art") ||
    cat.includes("canvas") ||
    cat.includes("poster") ||
    cat.includes("scroll") ||
    cat.includes("tapestry") ||
    cat.includes("flag")
  ) {
    return ["poster", "wall scroll", "tapestry", "neon sign", "wall flag", "canvas print", "framed art"];
  }
  if (cat.includes("bedding") || cat.includes("duvet") || cat.includes("blanket") || cat.includes("quilt")) {
    return ["bedding set", "duvet cover", "throw blanket", "fleece blanket", "comforter", "bedspread"];
  }
  if (cat.includes("rug") || cat.includes("floor") || cat.includes("carpet") || cat.includes("mat")) {
    return ["floor rug", "area rug", "carpet", "door mat", "runner rug"];
  }
  if (cat.includes("figurine") || cat.includes("figure") || cat.includes("collectible") || cat.includes("statue")) {
    return ["action figure", "figurine", "nendoroid", "statue", "pvc figure", "collectible model"];
  }
  if (cat.includes("pillow") || cat.includes("cushion")) {
    return ["throw pillow", "decorative cushion", "pillowcase", "plush cushion"];
  }
  if (cat.includes("desk") || cat.includes("mouse") || cat.includes("pad")) {
    return ["desk mat", "mouse pad", "extended gaming mat", "keyboard pad", "desk accessory"];
  }
  return ["merchandise", "decor", "accessory"];
}

/**
 * Deterministically validates and normalizes Gemini decomposition output:
 * - Caps at 8 items.
 * - Extracts and enforces preferred and mandatory franchises from query if omitted by LLM.
 * - Implements Two-Dimensional intent separation (Product role/category vs. Theme preference).
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

  // Identify franchises from the user query
  const detectedFranchises = identifyFranchisesInText(originalQuery);
  const detectedFranchiseNames = Array.from(new Set(detectedFranchises.map((f) => f.canonicalName)));

  const rawMandatoryFranchises = Array.isArray(rawObj.mandatoryFranchises)
    ? rawObj.mandatoryFranchises.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    : [];

  const rawPreferredFranchises = Array.isArray(rawObj.preferredFranchises)
    ? rawObj.preferredFranchises.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    : [];

  const allFranchises = Array.from(
    new Set([...detectedFranchiseNames, ...rawMandatoryFranchises, ...rawPreferredFranchises])
  );

  const isAnimeTheme = isGeneralAnimeTheme(originalQuery) || allFranchises.length > 0;
  const requiredTheme =
    typeof rawObj.requiredTheme === "string" && rawObj.requiredTheme.trim()
      ? rawObj.requiredTheme.trim()
      : (isAnimeTheme ? "Japanese anime" : undefined);

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
      preferredFranchises: allFranchises,
      requiredFranchises: allFranchises.length === 1 ? allFranchises : [],
      allowedProductFormats: ["merchandise", "decor", "accessory"],
      allowAlternativeFormat: true,
      allowGeneralAnimeFallback: isAnimeTheme,
      diversityGroup: "general",
      maximumAlternatives: 2,
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
      requiredTheme,
      mandatoryFranchises: allFranchises,
      preferredFranchises: allFranchises,
      allowGeneralAnimeFallback: isAnimeTheme,
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
    requiredFranchises?: string[];
    preferredFranchises?: string[];
    allowedProductFormats: string[];
    allowAlternativeFormat: boolean;
    allowGeneralAnimeFallback: boolean;
    requiredCharacters: string[];
    mustHaveTerms: string[];
    hardConstraints: string[];
    softPreferences: string[];
    allowedSubstitutions: string[];
    diversityGroup: string;
    maximumAlternatives: number;
  }

  const parsedItems: ParsedItem[] = [];
  let sumRawPct = 0;
  let sumRawAmount = 0;

  for (let idx = 0; idx < cappedItems.length; idx++) {
    const raw = cappedItems[idx];
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;

    const rawName = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Setup Component";
    const name = normalizeEntityDisplayName(rawName);

    const diversityGroup =
      typeof item.diversityGroup === "string" && item.diversityGroup.trim()
        ? item.diversityGroup.trim()
        : inferDiversityGroup(name);

    const productCategory =
      typeof item.productCategory === "string" && item.productCategory.trim()
        ? item.productCategory.trim()
        : name;

    const allowedProductFormats =
      Array.isArray(item.allowedProductFormats) && item.allowedProductFormats.length > 0
        ? (item.allowedProductFormats.filter((fmt): fmt is string => typeof fmt === "string" && fmt.trim().length > 0))
        : inferAllowedProductFormats(productCategory, diversityGroup);

    const allowAlternativeFormat =
      typeof item.allowAlternativeFormat === "boolean" ? item.allowAlternativeFormat : true;

    const allowGeneralAnimeFallback =
      typeof item.allowGeneralAnimeFallback === "boolean" ? item.allowGeneralAnimeFallback : isAnimeTheme;

    const rawPct =
      typeof item.allocationPercentage === "number" && item.allocationPercentage > 0
        ? item.allocationPercentage
        : 0;
    const rawAmount =
      typeof item.allocatedAmount === "number" && item.allocatedAmount > 0
        ? item.allocatedAmount
        : rawPct > 0
        ? (rawPct / 100) * safeTotalBudget
        : 0;

    const rawReqs = Array.isArray(item.requirements)
      ? item.requirements.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
      : [];

    const rawPriority = typeof item.priority === "string" ? item.priority.toLowerCase() : "medium";
    const priority: "high" | "medium" | "low" =
      rawPriority === "high" || rawPriority === "low" ? rawPriority : "medium";

    // Two-Dimensional Architecture:
    // If the request mentions multiple preferred franchises, broad room items should NOT be rigidly locked
    // to a single franchise. Instead, preferredFranchises gives all preferred options.
    const rawRequiredFranchises = Array.isArray(item.requiredFranchises)
      ? item.requiredFranchises.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
      : [];

    let itemPreferredFranchises = Array.isArray(item.preferredFranchises)
      ? item.preferredFranchises.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
      : [];

    if (itemPreferredFranchises.length === 0 && allFranchises.length > 0) {
      itemPreferredFranchises = [...allFranchises];
    }

    // Only set requiredFranchises if explicitly restricted (e.g. user requested only 1 franchise total)
    let itemRequiredFranchises: string[] | undefined = undefined;
    if (allFranchises.length === 1) {
      itemRequiredFranchises = [allFranchises[0]];
    } else if (rawRequiredFranchises.length === 1 && allFranchises.length > 1) {
      // In broad multi-franchise setups, don't lock down unless query explicitly tied this category to 1 franchise
      itemRequiredFranchises = undefined;
    } else if (rawRequiredFranchises.length > 0) {
      itemRequiredFranchises = rawRequiredFranchises;
    }

    let searchQuery =
      typeof item.searchQuery === "string" && item.searchQuery.trim()
        ? item.searchQuery.trim()
        : `${allFranchises.join(" ")} anime ${productCategory}`;
    searchQuery = normalizeEntityDisplayName(searchQuery);

    let fallbackQuery =
      typeof item.fallbackQuery === "string" && item.fallbackQuery.trim()
        ? item.fallbackQuery.trim()
        : `${allFranchises.slice(0, 1).join(" ")} ${allowedProductFormats.slice(0, 2).join(" ")}`;
    fallbackQuery = normalizeEntityDisplayName(fallbackQuery);

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
      requiredFranchises: itemRequiredFranchises,
      preferredFranchises: itemPreferredFranchises,
      allowedProductFormats,
      allowAlternativeFormat,
      allowGeneralAnimeFallback,
      requiredCharacters: Array.isArray(item.requiredCharacters) ? (item.requiredCharacters as string[]) : [],
      mustHaveTerms: Array.isArray(item.mustHaveTerms)
        ? (item.mustHaveTerms as string[])
        : (itemPreferredFranchises.length > 0 ? itemPreferredFranchises : []),
      hardConstraints: Array.isArray(item.hardConstraints)
        ? (item.hardConstraints as string[])
        : (itemPreferredFranchises.length > 0 ? [`Must match ${itemPreferredFranchises.join(" or ")}`] : []),
      softPreferences: Array.isArray(item.softPreferences) ? (item.softPreferences as string[]) : [],
      allowedSubstitutions,
      diversityGroup,
      maximumAlternatives: 2,
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

    const queryLower = originalQuery.toLowerCase();
    const userReqs: string[] = [];
    const baselineReqs: string[] = [];

    for (const reqStr of item.requirements) {
      const words = reqStr
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2);
      const isExplicitInQuery = words.some(
        (w) =>
          queryLower.includes(w) &&
          !["gaming", "setup", "product", "need", "want", "under", "with", "best", "good", "budget"].includes(w)
      );
      if (isExplicitInQuery) {
        userReqs.push(reqStr);
      } else {
        baselineReqs.push(reqStr);
      }
    }

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
      userRequirements: userReqs,
      baselineRequirements: baselineReqs,
      priority: item.priority,
      requiredTheme,
      requiredFranchises: item.requiredFranchises,
      preferredFranchises: item.preferredFranchises,
      allowedProductFormats: item.allowedProductFormats,
      allowAlternativeFormat: item.allowAlternativeFormat,
      allowGeneralAnimeFallback: item.allowGeneralAnimeFallback,
      requiredCharacters: item.requiredCharacters,
      mustHaveTerms: item.mustHaveTerms,
      hardConstraints: item.hardConstraints,
      softPreferences: item.softPreferences,
      allowedSubstitutions: item.allowedSubstitutions,
      diversityGroup: item.diversityGroup,
      maximumAlternatives: 2,
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
    requiredTheme,
    mandatoryFranchises: allFranchises,
    preferredFranchises: allFranchises,
    allowGeneralAnimeFallback: isAnimeTheme,
  };
}
