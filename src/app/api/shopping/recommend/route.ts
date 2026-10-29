import { NextRequest, NextResponse } from "next/server";
import { rankAndExplainProducts } from "@/lib/ai/gemini-ranking";
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

    const { query = "", products = [], budget = null, currency = "USD" } = body;

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        {
          success: true,
          aiStatus: "complete",
          topRecommendations: [],
          otherMatches: [],
          allProducts: [],
          comparisonOverview: null,
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
          aiMessage: "AI recommendation unavailable (missing GEMINI_API_KEY). Showing verified catalog matches.",
          topRecommendations: [],
          otherMatches: products as NormalizedProduct[],
          allProducts: products as NormalizedProduct[],
          comparisonOverview: null,
          timings: {
            geminiDurationMs: Math.round(performance.now() - t0),
            requestId,
          },
        } satisfies ShoppingRecommendResponsePayload,
        { status: 200 }
      );
    }

    // Call Gemini candidate ranking with hard 10s deadline & low thinking
    const ranked = await rankAndExplainProducts({
      query,
      budget,
      currency,
      products: products as NormalizedProduct[],
    });

    const geminiDurationMs = Math.round(performance.now() - t0);

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[RecommendAPI] id=${requestId} query="${query}" recCount=${ranked.topRecommendations.length} duration=${geminiDurationMs}ms`
      );
    }

    return NextResponse.json(
      {
        success: true,
        aiStatus: "complete",
        topRecommendations: ranked.topRecommendations,
        otherMatches: ranked.otherMatches,
        allProducts: ranked.allProducts,
        comparisonOverview: ranked.comparisonOverview,
        timings: {
          geminiDurationMs,
          requestId,
        },
      } satisfies ShoppingRecommendResponsePayload,
      { status: 200 }
    );
  } catch (error: unknown) {
    const geminiDurationMs = Math.round(performance.now() - t0);
    const message = error instanceof Error ? error.message : "AI ranking error occurred.";

    const isQuota =
      message.toLowerCase().includes("quota") ||
      message.toLowerCase().includes("resource_exhausted") ||
      message.includes("429");
    const isTimeout =
      message.toLowerCase().includes("timeout") ||
      message.toLowerCase().includes("deadline") ||
      message.toLowerCase().includes("aborted");

    const safeMessage = isQuota
      ? "AI comparison quota reached for today. Displaying verified Channel3 catalog results."
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
