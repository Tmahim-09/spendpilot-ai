import { NextRequest, NextResponse } from "next/server";
import { searchChannel3Products } from "@/lib/channel3/client";
import { normalizeChannel3Products } from "@/lib/channel3/normalize-products";
import { validateSearchPayload } from "@/lib/validation/search";
import type { SearchProductsResponsePayload } from "@/types";

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

    const { query, budget, currency } = validation.data;

    // Check if API key is present before attempting search
    if (!process.env.CHANNEL3_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            "CHANNEL3_API_KEY is not configured on the server. Please add your Channel3 API key to .env.local to enable live product searches.",
        },
        { status: 503 }
      );
    }

    // Perform live Channel3 search
    const { products: rawProducts, cached } = await searchChannel3Products({
      query,
      maxPrice: budget,
      currency,
      limit: 8,
    });

    // Normalize raw products into application schema
    let normalized = normalizeChannel3Products(rawProducts, currency);

    // Apply defensive budget filter if user specified budget
    if (budget !== null) {
      const budgetMinor = Math.round(budget * 100);
      normalized = normalized.filter((p) => p.priceMinor === null || p.priceMinor <= budgetMinor);
    }

    const responsePayload: SearchProductsResponsePayload = {
      success: true,
      query,
      budgetApplied: budget,
      currency,
      count: normalized.length,
      products: normalized,
      cached,
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An unexpected server error occurred.";

    // Classify known status errors
    const isAuthError = message.toLowerCase().includes("unauthorized") || message.toLowerCase().includes("api key");
    const isQuotaError = message.toLowerCase().includes("quota") || message.toLowerCase().includes("credit");
    const isRateLimit = message.toLowerCase().includes("rate limit");
    const isTimeout = message.toLowerCase().includes("timed out");

    let status = 500;
    if (isAuthError) status = 401;
    else if (isQuotaError) status = 402;
    else if (isRateLimit) status = 429;
    else if (isTimeout) status = 504;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status }
    );
  }
}
