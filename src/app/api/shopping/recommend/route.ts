import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAiComparison } from "@/lib/ai/gemini-comparison";
import { filterEligibleCandidates } from "@/lib/shopping/eligibility-gate";
import type {
  ShoppingRecommendResponsePayload,
  NormalizedProduct,
  CanonicalShoppingAttribute,
} from "@/types";

const normalizedProductSchema = z
  .object({
    sourceProductId: z.string().optional(),
    title: z.string().min(1, "Product title cannot be empty"),
    priceMinor: z.number().nullable().optional(),
    currency: z.enum(["USD", "EUR", "GBP"]).optional(),
    brand: z.string().nullable().optional(),
    imageUrl: z.string().optional(),
    retailerName: z.string().optional(),
    retailerUrl: z.string().optional(),
    rating: z.number().nullable().optional(),
    reviewCount: z.number().nullable().optional(),
    availability: z.string().optional(),
    features: z.array(z.string()).optional(),
    specifications: z.record(z.string(), z.unknown()).optional(),
    offers: z.array(z.any()).optional(),
    selectedOffer: z.any().optional(),
  })
  .passthrough();

export const shoppingRecommendRequestSchema = z.object({
  query: z.string().trim().min(1, "Query is required"),
  products: z.array(normalizedProductSchema).min(1, "At least one product is required for recommendation"),
  budget: z.number().nullable().optional(),
  currency: z.enum(["USD", "EUR", "GBP"]).optional(),
  priorityOverride: z.string().optional(),
  canonicalAttributes: z.record(z.string(), z.any()).optional(),
  intent: z.any().optional(),
});

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const t0 = performance.now();
  const requestId = `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    const rawBody = await request.json().catch(() => null);

    if (!rawBody || typeof rawBody !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid JSON request payload." },
        { status: 400 }
      );
    }

    const validation = shoppingRecommendRequestSchema.safeParse(rawBody);
    if (!validation.success) {
      const issues = validation.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return NextResponse.json(
        { success: false, error: `Invalid recommend request: ${issues}` },
        { status: 400 }
      );
    }

    const {
      query,
      products,
      budget = null,
      currency = "USD",
      priorityOverride,
      canonicalAttributes,
    } = validation.data;

    // Filter candidate products against active hard requirements
    const eligibility = filterEligibleCandidates({
      products: products as unknown as NormalizedProduct[],
      canonicalAttributes: canonicalAttributes as Record<string, CanonicalShoppingAttribute> | undefined,
      budgetCents: budget ? Math.round(budget * 100) : null,
      currency,
    });

    const eligibleCandidates = eligibility.eligibleProducts;

    if (!Array.isArray(eligibleCandidates) || eligibleCandidates.length === 0) {
      return NextResponse.json(
        {
          success: true,
          aiStatus: "complete",
          topRecommendations: [],
          otherMatches: [],
          allProducts: [],
          comparisonOverview: eligibility.noMatchMessage || "No eligible products match your confirmed requirements.",
          comparison: null,
          evidenceFacts: {},
          timings: {
            geminiDurationMs: Math.round(performance.now() - t0),
            requestId,
          },
        } satisfies ShoppingRecommendResponsePayload,
        { status: 200 }
      );
    }

    // Check if Gemini API key is configured
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          success: true,
          aiStatus: "unavailable",
          aiMessage: "AI comparison unavailable (missing GEMINI_API_KEY). Showing verified catalog matches.",
          comparison: null,
          evidenceFacts: {},
          topRecommendations: [],
          otherMatches: eligibleCandidates,
          allProducts: eligibleCandidates,
          comparisonOverview: null,
          timings: {
            geminiDurationMs: Math.round(performance.now() - t0),
            requestId,
          },
        } satisfies ShoppingRecommendResponsePayload,
        { status: 200 }
      );
    }

    // Call Gemini evidence-grounded comparison with automatic model failover
    const result = await runAiComparison({
      query,
      products: eligibleCandidates,
      budget,
      currency,
      priorityOverride,
      requestId,
    });

    const geminiDurationMs = Math.round(performance.now() - t0);

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[RecommendAPI] id=${requestId} query="${query}" model=${result.modelUsed || "unknown"} fallback=${Boolean(result.usedFallback)} duration=${geminiDurationMs}ms criteriaCount=${result.comparison.criteria.length}`
      );
    }

    return NextResponse.json(
      {
        success: true,
        aiStatus: "complete",
        comparison: result.comparison,
        evidenceFacts: result.evidenceFacts,
        topRecommendations: result.topRecommendations,
        otherMatches: result.otherMatches,
        allProducts: result.allProducts,
        comparisonOverview: result.comparison.summary,
        modelUsed: result.modelUsed,
        usedFallback: result.usedFallback,
        timings: {
          geminiDurationMs,
          requestId,
        },
      } satisfies ShoppingRecommendResponsePayload,
      { status: 200 }
    );
  } catch (error: unknown) {
    const geminiDurationMs = Math.round(performance.now() - t0);
    const message = error instanceof Error ? error.message : "AI comparison error occurred.";

    const isAuth =
      message.toLowerCase().includes("permission_denied") ||
      message.toLowerCase().includes("api key") ||
      message.includes("401") ||
      message.includes("403");
    const isQuota =
      message.toLowerCase().includes("quota") ||
      message.toLowerCase().includes("resource_exhausted") ||
      message.toLowerCase().includes("rate limit") ||
      message.includes("429");
    const isTimeout =
      message.toLowerCase().includes("timeout") ||
      message.toLowerCase().includes("deadline") ||
      message.toLowerCase().includes("aborted");

    const safeMessage = isAuth
      ? "AI comparison configuration error (invalid Gemini credentials). Displaying verified Channel3 catalog results."
      : isQuota
      ? "AI comparison quota reached across configured models. Displaying verified Channel3 catalog results."
      : isTimeout
      ? "AI comparison timed out (high server load). Displaying verified Channel3 catalog results."
      : "AI comparison temporarily unavailable. Displaying verified Channel3 catalog results.";

    if (process.env.NODE_ENV !== "production") {
      console.warn(`[RecommendAPI] id=${requestId} fallback duration=${geminiDurationMs}ms message="${message}"`);
    }

    // Gracefully return HTTP 200 with untouched products so client UI is never broken or blocked
    return NextResponse.json(
      {
        success: true,
        aiStatus: "unavailable",
        aiMessage: safeMessage,
        comparison: null,
        evidenceFacts: {},
        topRecommendations: [],
        otherMatches: [],
        allProducts: [],
        comparisonOverview: null,
        timings: {
          geminiDurationMs,
          requestId,
        },
      } satisfies ShoppingRecommendResponsePayload,
      { status: 200 }
    );
  }
}
