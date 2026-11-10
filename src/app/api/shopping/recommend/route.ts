import { NextRequest, NextResponse } from "next/server";
import { runAiComparison } from "@/lib/ai/gemini-comparison";
import { filterEligibleCandidates } from "@/lib/shopping/eligibility-gate";
import type {
  ShoppingRecommendRequestPayload,
  ShoppingRecommendResponsePayload,
  NormalizedProduct,
} from "@/types";

export async function POST(request: NextRequest) {
  const t0 = performance.now();
  const requestId = `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    const body = (await request.json().catch(() => null)) as Partial<ShoppingRecommendRequestPayload> | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid JSON request payload." },
        { status: 400 }
      );
    }

    const {
      query = "",
      products = [],
      budget = null,
      currency = "USD",
      priorityOverride,
      canonicalAttributes,
    } = body;

    // Filter candidate products against active hard requirements
    const eligibility = filterEligibleCandidates({
      products: products as NormalizedProduct[],
      canonicalAttributes,
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
