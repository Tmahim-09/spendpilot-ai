import { NextRequest, NextResponse } from "next/server";
import { executeSetupSearch } from "@/lib/setup/setup-search";
import type {
  SetupSearchRequestPayload,
  SetupSearchResponsePayload,
  SetupRequirementItem,
} from "@/types";

export async function POST(request: NextRequest) {
  const t0 = performance.now();
  const requestId = `setupsrch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    const body = (await request.json().catch(() => null)) as Partial<SetupSearchRequestPayload> | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid JSON request payload." },
        { status: 400 }
      );
    }

    const rawItems = (body as { items?: unknown; requirements?: unknown }).items ?? (body as { items?: unknown; requirements?: unknown }).requirements;
    const items = Array.isArray(rawItems) ? (rawItems as SetupRequirementItem[]) : [];

    const {
      totalBudget = 0,
      currency = "USD",
      pricePreference = "best_value",
      expandRequirementIds = [],
    } = body;

    if (items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Setup search requires at least one product requirement item." },
        { status: 400 }
      );
    }

    // Check Channel3 API key
    if (!process.env.CHANNEL3_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "CHANNEL3_API_KEY is not configured on the server.",
        },
        { status: 503 }
      );
    }

    const categories = await executeSetupSearch({
      items,
      totalBudget,
      currency,
      pricePreference,
      expandRequirementIds,
      concurrencyLimit: 2,
    });

    const totalCandidates = categories.reduce(
      (sum, cat) => sum + (cat.products?.length || 0),
      0
    );

    const durationMs = Math.round(performance.now() - t0);

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[SetupSearchAPI] id=${requestId} categories=${categories.length} totalCandidates=${totalCandidates} duration=${durationMs}ms`
      );
    }

    return NextResponse.json(
      {
        success: true,
        currency,
        totalBudget,
        categories,
        totalCandidates,
        timings: {
          durationMs,
          requestId,
        },
      } satisfies SetupSearchResponsePayload,
      { status: 200 }
    );
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - t0);
    const message = err instanceof Error ? err.message : "Error executing setup discovery.";

    if (process.env.NODE_ENV !== "production") {
      console.error(`[SetupSearchAPI] id=${requestId} error: ${message}`);
    }

    return NextResponse.json(
      {
        success: false,
        error: "Channel3 product discovery temporarily encountered an error.",
        timings: {
          durationMs,
          requestId,
        },
      } satisfies Partial<SetupSearchResponsePayload>,
      { status: 500 }
    );
  }
}
