import { Type } from "@google/genai";
import { executeWithModelFailover, buildModelGenerationConfig } from "../ai/gemini-router.ts";
import { calculateRecommendedBundle } from "./bundle-calculator.ts";
import type {
  CurrencyCode,
  RecommendedBundle,
  SetupCategorySearchResult,
  SetupComparisonCategoryResult,
  SetupRequirementItem,
} from "../../types/index.ts";

const setupComparisonSchema = {
  type: Type.OBJECT,
  properties: {
    comparisons: {
      type: Type.ARRAY,
      description: "Comparison assessments for each product requirement category.",
      items: {
        type: Type.OBJECT,
        properties: {
          requirementId: { type: Type.STRING },
          recommendedProductId: { type: Type.STRING },
          alternativeProductId: { type: Type.STRING },
          recommendedReason: { type: Type.STRING },
          keyDifferences: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          tradeoffs: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          missingSpecs: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          compatibilityNotes: { type: Type.STRING },
          compatibilityStatus: {
            type: Type.STRING,
            description: "'verified' if all compatibility factors confirmed, 'unverified' if specs missing, 'not_applicable' for non-PC setups",
          },
        },
        required: [
          "requirementId",
          "recommendedProductId",
          "recommendedReason",
          "keyDifferences",
          "tradeoffs",
        ],
      },
    },
  },
  required: ["comparisons"],
};

export interface RunSetupComparisonOptions {
  query: string;
  totalBudget: number;
  currency?: CurrencyCode;
  requirements: SetupRequirementItem[];
  categories: SetupCategorySearchResult[];
  selectedItemIds?: Record<string, string>;
  requestId?: string;
}

export interface RunSetupComparisonResult {
  bundle: RecommendedBundle;
  comparisons: SetupComparisonCategoryResult[];
  modelUsed?: string;
  usedFallback?: boolean;
}

/**
 * Runs a single consolidated Gemini comparison across all product requirements in a setup.
 */
export async function runSetupComparison({
  query,
  totalBudget,
  currency = "USD",
  requirements,
  categories,
  selectedItemIds = {},
  requestId = `cmp_${Date.now().toString(36)}`,
}: RunSetupComparisonOptions): Promise<RunSetupComparisonResult> {
  // If no candidates in any category, return immediately without invoking LLM
  const hasCandidates = categories.some((c) => c.products.length > 0);
  if (!hasCandidates) {
    const bundle = calculateRecommendedBundle({
      totalBudget,
      currency,
      requirements,
      categories,
      comparisons: [],
      selectedItemIds,
    });
    return { bundle, comparisons: [] };
  }

  // Build compact summaries for Gemini prompt
  const categoryPromptData = categories.map((cat) => {
    const req = requirements.find((r) => r.id === cat.requirementId);
    return {
      requirementId: cat.requirementId,
      requirementName: cat.requirementName,
      allocatedBudget: `${currency} ${((cat.allocatedAmountMinor || 0) / 100).toFixed(2)}`,
      requestedFeatures: req?.requirements || [],
      priority: req?.priority || "medium",
      candidates: cat.products.map((p) => ({
        productId: p.sourceProductId || p.title,
        title: p.title,
        brand: p.brand || "Unknown",
        price: p.priceMinor !== null ? `${currency} ${(p.priceMinor / 100).toFixed(2)}` : "Price unlisted",
        retailer: p.retailerName || "Verified Merchant",
        specifications: p.specifications || {},
        sourceFacts: p.sourceFacts || [],
      })),
    };
  });

  const systemInstruction = `You are the Lead Multi-Product Comparison Engine for SpendPilot AI (PayPal AI Hackathon 2026).
Your job is to compare the up to 2 product alternatives within EACH requirement category of the user's multi-product setup.
Rules:
1. Category-isolated comparison: Compare alternatives WITHIN each requirement category. Never compare a monitor against a keyboard as if they were alternatives.
2. Select the best match for each category: Identify recommendedProductId from the provided candidates for that requirement.
3. If 2 candidates are present: Recommend one and designate the other as alternativeProductId, explaining key differences and trade-offs.
4. Grounding: Do not invent specifications, prices, or ratings. Use only facts from the listing.
5. PC Component Compatibility:
   - For custom PC components (CPU, motherboard, RAM, case, power supply), check socket, form factor, RAM type, and wattage.
   - If crucial attributes are missing, set compatibilityStatus to 'unverified' and explain in compatibilityNotes.
   - NEVER falsely claim that a full PC build is guaranteed compatible when facts are missing.
   - Set compatibilityStatus to 'not_applicable' for non-PC setups.`;

  const userPrompt = `Shopping Request: "${query}"
Total Budget: ${currency} ${totalBudget}

Categories and Candidate Alternatives to Evaluate:
${JSON.stringify(categoryPromptData, null, 2)}

Provide a side-by-side comparison for each category.`;

  let rawJson: Record<string, unknown> | null = null;
  let modelUsed: string | undefined;
  let usedFallback = false;

  try {
    const failoverResult = await executeWithModelFailover<Record<string, unknown>>({
      requestId,
      totalTimeoutMs: 18000,
      executeFn: async (ai, model, signal) => {
        const config = buildModelGenerationConfig(model, {
          abortSignal: signal,
          systemInstruction,
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: setupComparisonSchema,
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
          return { valid: false, reason: "Model output is not an object" };
        }
        return { valid: true };
      },
    });

    rawJson = failoverResult.data;
    modelUsed = failoverResult.modelUsed;
    usedFallback = failoverResult.usedFallback;
  } catch (err: unknown) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[SetupComparator] Fallback triggered due to error:`, err);
    }
  }

  // Validate and sanitize comparisons
  const comparisons = validateSetupComparisons(rawJson, categories);

  // Compute final recommended bundle
  const bundle = calculateRecommendedBundle({
    totalBudget,
    currency,
    requirements,
    categories,
    comparisons,
    selectedItemIds,
  });

  return {
    bundle,
    comparisons,
    modelUsed,
    usedFallback,
  };
}

/**
 * Validates Gemini setup comparison output:
 * - Ensures recommendedProductId exists in that category's actual candidate list.
 * - Ensures alternativeProductId exists in that category's actual candidate list.
 * - Strips or corrects hallucinated product IDs.
 */
export function validateSetupComparisons(
  rawJson: unknown,
  categories: SetupCategorySearchResult[]
): SetupComparisonCategoryResult[] {
  const categoryMap = new Map<string, SetupCategorySearchResult>();
  for (const cat of categories) {
    categoryMap.set(cat.requirementId, cat);
  }

  const rawComparisons =
    rawJson && typeof rawJson === "object" && Array.isArray((rawJson as Record<string, unknown>).comparisons)
      ? ((rawJson as Record<string, unknown>).comparisons as Array<Record<string, unknown>>)
      : [];

  const rawMap = new Map<string, Record<string, unknown>>();
  for (const item of rawComparisons) {
    if (item && typeof item.requirementId === "string") {
      rawMap.set(item.requirementId, item);
    }
  }

  const results: SetupComparisonCategoryResult[] = [];

  for (const cat of categories) {
    const rawComp = rawMap.get(cat.requirementId);
    const validCandidateIds = cat.products.map((p) => p.sourceProductId || p.title);

    let recommendedProductId: string | null = null;
    let alternativeProductId: string | null = null;

    if (rawComp && typeof rawComp.recommendedProductId === "string") {
      const id = rawComp.recommendedProductId.trim();
      if (validCandidateIds.includes(id)) {
        recommendedProductId = id;
      }
    }

    if (rawComp && typeof rawComp.alternativeProductId === "string") {
      const id = rawComp.alternativeProductId.trim();
      if (validCandidateIds.includes(id) && id !== recommendedProductId) {
        alternativeProductId = id;
      }
    }

    // Default fallback to real candidates if Gemini returned fake IDs or missing
    if (!recommendedProductId && validCandidateIds.length > 0) {
      recommendedProductId = validCandidateIds[0];
    }
    if (!alternativeProductId && validCandidateIds.length > 1) {
      alternativeProductId = validCandidateIds.find((id) => id !== recommendedProductId) || null;
    }

    const recommendedReason =
      rawComp && typeof rawComp.recommendedReason === "string" && rawComp.recommendedReason.trim()
        ? rawComp.recommendedReason.trim()
        : validCandidateIds.length > 0
        ? "Best match based on verified specifications and budget allocation."
        : "No products available in this category.";

    const keyDifferences =
      rawComp && Array.isArray(rawComp.keyDifferences)
        ? rawComp.keyDifferences.filter((d): d is string => typeof d === "string" && d.trim().length > 0)
        : [];

    const tradeoffs =
      rawComp && Array.isArray(rawComp.tradeoffs)
        ? rawComp.tradeoffs.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        : [];

    const missingSpecs =
      rawComp && Array.isArray(rawComp.missingSpecs)
        ? rawComp.missingSpecs.filter((m): m is string => typeof m === "string" && m.trim().length > 0)
        : [];

    const compatibilityNotes =
      rawComp && typeof rawComp.compatibilityNotes === "string"
        ? rawComp.compatibilityNotes.trim()
        : undefined;

    const rawCompatStatus =
      rawComp && typeof rawComp.compatibilityStatus === "string"
        ? rawComp.compatibilityStatus.toLowerCase()
        : "not_applicable";

    const compatibilityStatus: SetupComparisonCategoryResult["compatibilityStatus"] =
      rawCompatStatus === "verified" || rawCompatStatus === "unverified"
        ? rawCompatStatus
        : "not_applicable";

    results.push({
      requirementId: cat.requirementId,
      requirementName: cat.requirementName,
      candidateProductIds: validCandidateIds,
      recommendedProductId,
      alternativeProductId,
      recommendedReason,
      keyDifferences,
      tradeoffs,
      missingSpecs,
      compatibilityNotes,
      compatibilityStatus,
    });
  }

  return results;
}
