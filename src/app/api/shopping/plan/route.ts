import { NextRequest, NextResponse } from "next/server";
import { interpretShoppingIntent } from "@/lib/ai/gemini-intent";
import { rankAndExplainProducts } from "@/lib/ai/gemini-ranking";
import { searchChannel3Products } from "@/lib/channel3/client";
import { normalizeChannel3Products } from "@/lib/channel3/normalize-products";
import { validateSearchPayload } from "@/lib/validation/search";
import type {
  ShoppingPlanResponsePayload,
  ParsedShoppingIntent,
  NormalizedProduct,
  AiProcessingStatus,
} from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    const validation = validateSearchPayload(body);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: validation.status }
      );
    }

    const { query: rawQuery, budget: formBudget, currency } = validation.data;

    let intent: ParsedShoppingIntent | null = null;
    let aiStatus: AiProcessingStatus = "complete";
    let aiMessage: string | null = null;

    // Step 1: Interpret Intent via Gemini
    try {
      intent = await interpretShoppingIntent({
        userInput: rawQuery,
        formBudget,
        formCurrency: currency,
      });

      // Handle non-shopping queries or greeting clarifications
      if (!intent.isShoppingRequest || intent.needsClarification) {
        const response: ShoppingPlanResponsePayload = {
          success: true,
          aiStatus: "complete",
          aiMessage: intent.clarificationMessage,
          intent,
          topRecommendations: [],
          otherMatches: [],
          allProducts: [],
          comparisonOverview: null,
          query: rawQuery,
          budgetApplied: formBudget,
          currency,
          count: 0,
        };
        return NextResponse.json(response, { status: 200 });
      }
    } catch (err: unknown) {
      // Graceful fallback: If Gemini intent parsing fails or API key missing, create fallback intent
      aiStatus = "partial";
      const errMsg = err instanceof Error ? err.message : "Gemini intent interpretation unavailable.";
      aiMessage = errMsg.includes("GEMINI_API_KEY")
        ? "AI intent parsing unavailable (missing key). Searching Channel3 directly."
        : "AI interpretation temporarily busy. Searching Channel3 directly.";

      intent = {
        isShoppingRequest: true,
        searchQuery: rawQuery,
        category: "General",
        totalBudget: formBudget,
        maxItemPrice: null,
        currency,
        mustHave: [],
        preferences: [],
        excluded: [],
        summary: `Shopping search for "${rawQuery}"`,
        needsClarification: false,
      };
    }

    // Step 2: Search Channel3 using validated search query and resolved budget
    const channel3Query = intent.searchQuery || rawQuery;
    const effectiveBudget = intent.totalBudget ?? formBudget;

    let rawProducts: ReturnType<typeof normalizeChannel3Products> = [];
    let isCached = false;

    try {
      const searchResult = await searchChannel3Products({
        query: channel3Query,
        maxPrice: effectiveBudget,
        currency,
        limit: 8,
      });
      isCached = searchResult.cached;
      rawProducts = normalizeChannel3Products(searchResult.products, currency);

      // Defensive filtering for budget
      if (effectiveBudget !== null) {
        const budgetMinor = Math.round(effectiveBudget * 100);
        rawProducts = rawProducts.filter((p) => p.priceMinor === null || p.priceMinor <= budgetMinor);
      }
    } catch (channel3Err: unknown) {
      const msg = channel3Err instanceof Error ? channel3Err.message : "Channel3 search failed";
      return NextResponse.json(
        {
          success: false,
          error: `Product catalog search failed: ${msg}`,
        },
        { status: 502 }
      );
    }

    // If zero products returned from Channel3
    if (rawProducts.length === 0) {
      const response: ShoppingPlanResponsePayload = {
        success: true,
        aiStatus: aiStatus === "complete" ? "complete" : "partial",
        aiMessage: aiMessage || "No products found on Channel3 matching your query and budget.",
        intent,
        topRecommendations: [],
        otherMatches: [],
        allProducts: [],
        comparisonOverview: "No products currently available for this search within the specified constraints.",
        query: channel3Query,
        budgetApplied: effectiveBudget,
        currency,
        count: 0,
        cached: isCached,
      };
      return NextResponse.json(response, { status: 200 });
    }

    // Step 3: Rank & Explain Candidate Products using Gemini
    let topRecommendations: NormalizedProduct[] = [];
    let otherMatches: NormalizedProduct[] = rawProducts;
    let allProducts: NormalizedProduct[] = rawProducts;
    let comparisonOverview: string | null = null;

    if (aiStatus === "complete" && intent) {
      try {
        const ranked = await rankAndExplainProducts({
          intent,
          products: rawProducts,
        });

        topRecommendations = ranked.topRecommendations;
        otherMatches = ranked.otherMatches;
        allProducts = ranked.allProducts;
        comparisonOverview = ranked.comparisonOverview;
      } catch {
        // Graceful fallback: If Gemini ranking fails, preserve real Channel3 products without fabricated facts
        aiStatus = "partial";
        aiMessage = "Product ranking temporarily unavailable. Showing verified Channel3 search matches.";
        topRecommendations = [];
        otherMatches = rawProducts;
        allProducts = rawProducts;
      }
    }

    const payload: ShoppingPlanResponsePayload = {
      success: true,
      aiStatus,
      aiMessage,
      intent,
      topRecommendations,
      otherMatches,
      allProducts,
      comparisonOverview,
      query: channel3Query,
      budgetApplied: effectiveBudget,
      currency,
      count: allProducts.length,
      cached: isCached,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An unexpected server error occurred.";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

