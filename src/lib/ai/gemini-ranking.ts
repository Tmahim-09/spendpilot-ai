import { Type, ThinkingLevel } from "@google/genai";
import { executeGeminiWithDeadline } from "./gemini-client.ts";
import type { NormalizedProduct, ParsedShoppingIntent } from "../../types/index.ts";
import { formatCurrency } from "../utils.ts";

const rankingSchema = {
  type: Type.OBJECT,
  properties: {
    comparisonOverview: {
      type: Type.STRING,
      description:
        "A concise 1-2 sentence overview comparing the available candidate products against the user's needs and budget.",
    },
    recommendations: {
      type: Type.ARRAY,
      description:
        "Up to 3 recommended products in ranked order (rank 1 is top pick). Only include productIds that appear in the candidate list.",
      items: {
        type: Type.OBJECT,
        properties: {
          productId: {
            type: Type.STRING,
            description: "Exact productId matching an item from the candidate list.",
          },
          rank: {
            type: Type.INTEGER,
            description: "Rank position (1, 2, or 3).",
          },
          recommendationReason: {
            type: Type.STRING,
            description:
              "A concise 1-2 sentence explanation of why this product fits the user's specific request and budget, citing verified attributes.",
          },
          keyTradeOffs: {
            type: Type.STRING,
            description:
              "Any notable trade-offs, compromises, or details missing from the listing (e.g. battery life not stated).",
          },
          fitScore: {
            type: Type.INTEGER,
            description:
              "Approximate fit percentage (integer from 70 to 98) representing alignment with stated preferences.",
          },
        },
        required: ["productId", "rank", "recommendationReason"],
      },
    },
  },
  required: ["comparisonOverview", "recommendations"],
};

export interface RankProductsOptions {
  query?: string;
  budget?: number | null;
  currency?: string;
  intent?: ParsedShoppingIntent;
  products: NormalizedProduct[];
}

export interface RankedResult {
  topRecommendations: NormalizedProduct[];
  otherMatches: NormalizedProduct[];
  allProducts: NormalizedProduct[];
  comparisonOverview: string | null;
}

/**
 * Sends a compact, privacy-safe summary of actual Channel3 products to Gemini for evidence-based ranking.
 * Strictly verifies product IDs to prevent hallucinated products or fabricated facts.
 */
export async function rankAndExplainProducts({
  query,
  budget,
  currency = "USD",
  intent,
  products,
}: RankProductsOptions): Promise<RankedResult> {
  if (!products || products.length === 0) {
    return {
      topRecommendations: [],
      otherMatches: [],
      allProducts: [],
      comparisonOverview: null,
    };
  }

  // Create lookup map of valid candidate product IDs
  const candidateMap = new Map<string, NormalizedProduct>();
  products.forEach((p) => {
    if (p.sourceProductId) {
      candidateMap.set(p.sourceProductId, { ...p });
    }
  });

  // Prepare a compact, safe representation of candidates (max 8 items, no bloated metadata)
  const candidateSummaries = products.slice(0, 8).map((p) => ({
    productId: p.sourceProductId,
    title: p.title,
    brand: p.brand || "Not specified",
    startingPrice: p.priceMinor !== null ? formatCurrency(p.priceMinor, p.currency || "USD") : "Not provided",
    retailer: p.retailerName || "Verified Retailer",
    availability: p.availability,
    offersCount: p.offersCount || 1,
    keyFeatures: p.sourceFacts?.slice(0, 4) || [],
    specifications: Object.entries(p.specifications || {}).slice(0, 5),
  }));

  const systemInstruction = `You are the Shopping Comparison & Ranking Engine for SpendPilot AI.
Your job is to analyze real candidate products discovered through Channel3 and rank the top 1 to 3 best matches.
Rules:
1. Grounding: All explanations must be grounded in the provided listing facts. Never invent specifications, ratings, prices, or retailer URLs.
2. Only recommend productIds that exist in the candidate list. Do not introduce new products.
3. Be transparent: If a specification like battery life, weight, or warranty is not in the data, do not invent it. Note it as unverified in keyTradeOffs.
4. Tone: Concise, professional, objective. Avoid promotional hype like "best ever" or "unbeatable".`;

  const effectiveBudget = budget ?? intent?.totalBudget ?? null;
  const effectiveCurrency = currency || intent?.currency || "USD";
  const intentSummary = intent?.summary || `Shopping request: "${query || "products"}"`;

  const userPrompt = `User Shopping Request:
- Goal: ${intentSummary}
- Target Budget: ${effectiveBudget ? `${effectiveCurrency} ${effectiveBudget}` : "No strict budget set"}
${intent?.mustHave && intent.mustHave.length > 0 ? `- Must-Have Requirements: ${intent.mustHave.join(", ")}` : ""}
${intent?.preferences && intent.preferences.length > 0 ? `- Preferences: ${intent.preferences.join(", ")}` : ""}
${intent?.excluded && intent.excluded.length > 0 ? `- Excluded Features: ${intent.excluded.join(", ")}` : ""}

Candidate Products from Channel3:
${JSON.stringify(candidateSummaries, null, 2)}

Rank up to 3 best products, explain why each matches, and summarize trade-offs.`;

  const parsedResponse = await executeGeminiWithDeadline(
    async (ai, model, signal) => {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        config: {
          abortSignal: signal,
          systemInstruction,
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: rankingSchema,
          thinkingConfig:
            model === "gemini-3.8-flash"
              ? { thinkingLevel: ThinkingLevel.LOW }
              : undefined,
        },
      });

      const text = response.text?.trim() || "{}";
      return JSON.parse(text) as {
        comparisonOverview?: string;
        recommendations?: Array<{
          productId: string;
          rank: number;
          recommendationReason: string;
          keyTradeOffs?: string;
          fitScore?: number;
        }>;
      };
    },
    { timeoutMs: 10000, maxRetries: 1 }
  );

  return matchAndValidateRankings(
    parsedResponse.recommendations,
    products,
    parsedResponse.comparisonOverview
  );
}

export interface RawAiRecommendation {
  productId: string;
  rank: number;
  recommendationReason: string;
  keyTradeOffs?: string;
  fitScore?: number;
}

/**
 * Pure function that matches AI recommendation payloads to genuine candidate products,
 * rejects hallucinated IDs, clamps fit scores, preserves authentic prices/offers/links,
 * and partitions products into topRecommendations and otherMatches.
 */
export function matchAndValidateRankings(
  rawRecommendations: unknown,
  products: NormalizedProduct[],
  rawOverview?: unknown
): RankedResult {
  if (!products || products.length === 0) {
    return {
      topRecommendations: [],
      otherMatches: [],
      allProducts: [],
      comparisonOverview: null,
    };
  }

  // Create deep clone lookup map of valid candidate product IDs
  const candidateMap = new Map<string, NormalizedProduct>();
  products.forEach((p) => {
    if (p.sourceProductId) {
      // Shallow-clone product to avoid mutating the original array items directly
      candidateMap.set(p.sourceProductId, { ...p });
    }
  });

  const comparisonOverview =
    typeof rawOverview === "string" && rawOverview.trim()
      ? rawOverview.trim()
      : null;

  const topRecommendations: NormalizedProduct[] = [];
  const assignedIds = new Set<string>();

  // Process and validate recommendations against genuine candidate map
  if (Array.isArray(rawRecommendations)) {
    // Sort recommendations by rank 1..3
    const sortedRecs = [...rawRecommendations].sort(
      (a, b) => (Number(a.rank) || 99) - (Number(b.rank) || 99)
    );

    for (const rec of sortedRecs) {
      if (!rec || typeof rec.productId !== "string") continue;
      const matchedProduct = candidateMap.get(rec.productId);

      // CRITICAL: Reject hallucinated or unknown product IDs
      if (matchedProduct && !assignedIds.has(rec.productId)) {
        assignedIds.add(rec.productId);

        const rankVal = Number(rec.rank) || topRecommendations.length + 1;
        const fitScoreVal =
          typeof rec.fitScore === "number" && rec.fitScore >= 50 && rec.fitScore <= 100
            ? Math.round(rec.fitScore)
            : 90;

        matchedProduct.explanation = rec.recommendationReason?.trim() || "Matches your shopping requirements.";
        matchedProduct.keyTradeOffs = rec.keyTradeOffs?.trim() || undefined;
        matchedProduct.fitScore = fitScoreVal;
        matchedProduct.rank = rankVal;

        topRecommendations.push(matchedProduct);
      }
    }
  }

  // The remaining products become otherMatches (also cloned for safety)
  const otherMatches: NormalizedProduct[] = [];
  for (const product of products) {
    if (product.sourceProductId && !assignedIds.has(product.sourceProductId)) {
      otherMatches.push({ ...product });
    }
  }

  // Combined list with recommended items at the top
  const allProducts = [...topRecommendations, ...otherMatches];

  return {
    topRecommendations,
    otherMatches,
    allProducts,
    comparisonOverview,
  };
}

