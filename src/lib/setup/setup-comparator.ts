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
import type { RelevanceEvaluationResult } from "../relevance/relevance-evaluator.ts";

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
          recommendedProductId: {
            type: Type.STRING,
            description: "Product ID of the best eligible match, or null if no candidate meets the hard theme constraints.",
          },
          alternativeProductId: {
            type: Type.STRING,
            description: "Product ID of the secondary alternative, or null.",
          },
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
    return { bundle, comparisons: validateSetupComparisons(null, categories, requirements) };
  }

  // Build compact summaries for Gemini prompt
  const categoryPromptData = categories.map((cat) => {
    const req = requirements.find((r) => r.id === cat.requirementId);
    return {
      requirementId: cat.requirementId,
      requirementName: cat.requirementName,
      mandatoryFranchises: req?.requiredFranchises || [],
      mandatoryCharacters: req?.requiredCharacters || [],
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
Your job is to compare candidate alternatives within EACH requirement category of the user's multi-product setup.

CRITICAL INSTRUCTION HIERARCHY:
1. Satisfy mandatory user intent: If a category requires a specific theme or anime franchise (e.g. Naruto, One Piece, Attack on Titan), ONLY candidates with verified evidence of that franchise are eligible.
2. Honest unfilled state: If none of the candidates in a category satisfy the hard theme constraints, set recommendedProductId to null and explain why. NEVER choose an irrelevant or generic product as a winner.
3. Compare eligible alternatives: If candidates meet the theme, compare them on key differences, trade-offs, and quality.
4. Grounding: Do not invent specifications, prices, or ratings. Use only facts from the listing.
5. PC Component Compatibility: Check socket, form factor, RAM, and PSU. Set compatibilityStatus to 'unverified' if specs missing, or 'not_applicable' for non-PC setups.`;

  const userPrompt = `Shopping Request: "${query}"
Total Budget: ${currency} ${totalBudget}

Categories and Candidate Alternatives to Evaluate:
${JSON.stringify(categoryPromptData, null, 2)}

Provide a side-by-side comparison for each category following the instruction hierarchy.`;

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
  const comparisons = validateSetupComparisons(rawJson, categories, requirements);

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
 * - Attaches relevance badge and unfulfilled actions.
 */
export function validateSetupComparisons(
  rawJson: unknown,
  categories: SetupCategorySearchResult[],
  requirements: SetupRequirementItem[] = []
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
  for (const c of rawComparisons) {
    if (c && typeof c.requirementId === "string") {
      rawMap.set(c.requirementId, c);
    }
  }

  const results: SetupComparisonCategoryResult[] = [];

  for (const cat of categories) {
    const rawComp = rawMap.get(cat.requirementId);
    const validCandidateIds = cat.products.map((p) => p.sourceProductId || p.title);
    const req = requirements.find((r) => r.id === cat.requirementId);

    // If zero eligible products found in this category:
    if (validCandidateIds.length === 0) {
      const targetFranchises = req?.requiredFranchises?.length
        ? req.requiredFranchises
        : req?.preferredFranchises || [];
      const franchiseNotice =
        targetFranchises.length > 0
          ? `No verified ${targetFranchises.join(" / ")} products found in retailer stock.`
          : `No qualifying products found within budget.`;

      results.push({
        requirementId: cat.requirementId,
        requirementName: cat.requirementName,
        candidateProductIds: [],
        recommendedProductId: null,
        alternativeProductId: null,
        recommendedReason: cat.unfulfilledReason || franchiseNotice,
        keyDifferences: [],
        tradeoffs: [],
        missingSpecs: [],
        compatibilityStatus: "not_applicable",
        unfulfilled: true,
        unfulfilledActions: [
          "Search with alternative keywords",
          "Explore in another format",
          "Allow general anime decoration",
          "Leave requirement unfilled",
        ],
      });
      continue;
    }

    let recommendedProductId: string | null = null;
    let alternativeProductId: string | null = null;

    const relevanceMap = (cat.relevanceMap || {}) as Record<string, RelevanceEvaluationResult>;

    if (rawComp && typeof rawComp.recommendedProductId === "string") {
      const id = rawComp.recommendedProductId.trim();
      if (validCandidateIds.includes(id)) {
        const candEval = relevanceMap[id];
        if (!candEval || candEval.isEligible) {
          recommendedProductId = id;
        }
      }
    }

    if (rawComp && typeof rawComp.alternativeProductId === "string") {
      const id = rawComp.alternativeProductId.trim();
      if (validCandidateIds.includes(id) && id !== recommendedProductId) {
        const candEval = relevanceMap[id];
        if (!candEval || candEval.isEligible) {
          alternativeProductId = id;
        }
      }
    }

    // Default to first eligible candidate if model returned missing, hallucinated, or ineligible ID
    if (!recommendedProductId && validCandidateIds.length > 0) {
      const eligibleId = validCandidateIds.find((id) => {
        const ev = relevanceMap[id];
        return !ev || ev.isEligible;
      });
      recommendedProductId = eligibleId || null;
    }
    if (!alternativeProductId && validCandidateIds.length > 1) {
      alternativeProductId =
        validCandidateIds.find((id) => {
          if (id === recommendedProductId) return false;
          const ev = relevanceMap[id];
          return !ev || ev.isEligible;
        }) || null;
    }

    // If no candidate is eligible, mark unfulfilled
    if (!recommendedProductId) {
      const targetFranchises = req?.requiredFranchises?.length
        ? req.requiredFranchises
        : req?.preferredFranchises || [];
      const franchiseNotice =
        targetFranchises.length > 0
          ? `No verified ${targetFranchises.join(" / ")} products found in retailer stock.`
          : `No qualifying products found within budget.`;

      results.push({
        requirementId: cat.requirementId,
        requirementName: cat.requirementName,
        candidateProductIds: validCandidateIds,
        recommendedProductId: null,
        alternativeProductId: null,
        recommendedReason: cat.unfulfilledReason || franchiseNotice,
        keyDifferences: [],
        tradeoffs: [],
        missingSpecs: [],
        compatibilityStatus: "not_applicable",
        unfulfilled: true,
        unfulfilledActions: [
          "Search with alternative keywords",
          "Explore in another format",
          "Allow general anime decoration",
          "Leave requirement unfilled",
        ],
      });
      continue;
    }

    // Attach relevance evaluation details
    const chosenEval = recommendedProductId ? relevanceMap[recommendedProductId] : undefined;

    let relevanceBadge: string | undefined;
    if (chosenEval) {
      const franchise =
        chosenEval.matchedFranchises?.[0] ||
        req?.preferredFranchises?.[0] ||
        req?.requiredFranchises?.[0];
      const character = chosenEval.matchedCharacters?.[0];

      switch (chosenEval.outcome) {
        case "direct_franchise_match":
          relevanceBadge = franchise ? `${franchise} franchise match` : "Direct franchise match";
          break;
        case "verified_character_match":
          relevanceBadge = character
            ? `${character} character match`
            : franchise
            ? `${franchise} character match`
            : "Verified character match";
          break;
        case "verified_franchise_alias_match":
          relevanceBadge = franchise ? `${franchise} franchise match` : "Franchise alias match";
          break;
        case "verified_same_franchise_substitute":
          relevanceBadge = franchise ? `${franchise} alternative format` : "Alternative format";
          break;
        case "general_anime_theme":
          relevanceBadge = "General anime theme";
          break;
        case "direct_match":
          relevanceBadge = franchise ? `${franchise} match` : "Direct Match";
          break;
        case "verified_substitute":
          relevanceBadge = franchise ? `${franchise} alternative format` : "Verified Alternative";
          break;
        case "uncertain":
        case "unrelated":
          relevanceBadge = "Theme not verified";
          break;
        default:
          if (franchise) {
            relevanceBadge = `${franchise} match`;
          }
          break;
      }
    } else if (req?.preferredFranchises && req.preferredFranchises.length > 0) {
      relevanceBadge = `${req.preferredFranchises[0]} match`;
    } else if (req?.requiredFranchises && req.requiredFranchises.length > 0) {
      relevanceBadge = `${req.requiredFranchises[0]} match`;
    }

    const recommendedReason =
      rawComp && typeof rawComp.recommendedReason === "string" && rawComp.recommendedReason.trim()
        ? rawComp.recommendedReason.trim()
        : "Best verified candidate matching your requested theme and budget.";

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
      relevanceBadge,
      relevanceOutcome: chosenEval?.outcome,
      evidenceQuote: chosenEval?.evidenceQuote,
      evidenceField: chosenEval?.evidenceField,
    });
  }

  return results;
}
