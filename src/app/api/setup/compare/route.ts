import { NextRequest, NextResponse } from "next/server";
import { runSetupComparison } from "@/lib/setup/setup-comparator";
import type {
  SetupCompareRequestPayload,
  SetupCompareResponsePayload,
} from "@/types";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const t0 = performance.now();
  const requestId = `setupcmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    const body = (await request.json().catch(() => null)) as Partial<SetupCompareRequestPayload> | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid JSON request payload." },
        { status: 400 }
      );
    }

    const {
      query = "",
      totalBudget = 0,
      currency = "USD",
      requirements = [],
      categories = [],
      selectedItemIds = {},
    } = body;

    const result = await runSetupComparison({
      query,
      totalBudget,
      currency,
      requirements,
      categories,
      selectedItemIds,
      requestId,
    });

    const durationMs = Math.round(performance.now() - t0);

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[SetupCompareAPI] id=${requestId} model=${result.modelUsed || "none"} isComplete=${result.bundle.isComplete} duration=${durationMs}ms`
      );
    }

    return NextResponse.json(
      {
        success: true,
        aiStatus: "complete",
        bundle: result.bundle,
        comparisons: result.comparisons,
        modelUsed: result.modelUsed,
        usedFallback: result.usedFallback,
        timings: {
          durationMs,
          requestId,
        },
      } satisfies SetupCompareResponsePayload,
      { status: 200 }
    );
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - t0);
    const message = err instanceof Error ? err.message : "Error executing setup comparison.";

    if (process.env.NODE_ENV !== "production") {
      console.error(`[SetupCompareAPI] id=${requestId} error: ${message}`);
    }

    return NextResponse.json(
      {
        success: false,
        error: "AI setup comparison temporarily encountered an error.",
        timings: {
          durationMs,
          requestId,
        },
      } satisfies Partial<SetupCompareResponsePayload>,
      { status: 500 }
    );
  }
}

