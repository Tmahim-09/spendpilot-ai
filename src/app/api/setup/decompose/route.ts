import { NextRequest, NextResponse } from "next/server";
import { decomposeSetupRequest } from "@/lib/setup/setup-decomposer";
import type {
  SetupDecomposeRequestPayload,
  SetupDecomposeResponsePayload,
} from "@/types";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const t0 = performance.now();
  const requestId = `dec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    const body = (await request.json().catch(() => null)) as Partial<SetupDecomposeRequestPayload> | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid JSON request payload." },
        { status: 400 }
      );
    }

    const { query = "", currency = "USD" } = body;
    const trimmedQuery = typeof query === "string" ? query.trim() : "";
    if (trimmedQuery.length < 3) {
      return NextResponse.json(
        { success: false, error: "Please enter a more descriptive setup request (at least 3 characters)." },
        { status: 400 }
      );
    }

    const rawBudget = body.totalBudget ?? body.budget;
    const numBudget = typeof rawBudget === "number" && !isNaN(rawBudget) ? rawBudget : Number(rawBudget);
    if (isNaN(numBudget) || numBudget <= 0) {
      return NextResponse.json(
        { success: false, error: "Total setup budget must be a positive number." },
        { status: 400 }
      );
    }

    if (numBudget > 1000000) {
      return NextResponse.json(
        { success: false, error: "Budget cannot exceed 1,000,000." },
        { status: 400 }
      );
    }

    const decomposition = await decomposeSetupRequest({
      query: trimmedQuery,
      totalBudget: numBudget,
      currency,
      requestId,
    });

    const durationMs = Math.round(performance.now() - t0);

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[SetupDecomposeAPI] id=${requestId} query="${trimmedQuery}" itemsCount=${decomposition.items.length} duration=${durationMs}ms`
      );
    }

    return NextResponse.json(
      {
        success: true,
        decomposition,
        timings: {
          durationMs,
          requestId,
        },
      } satisfies SetupDecomposeResponsePayload,
      { status: 200 }
    );
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - t0);
    const message = err instanceof Error ? err.message : "Error decomposing setup request.";

    if (process.env.NODE_ENV !== "production") {
      console.error(`[SetupDecomposeAPI] id=${requestId} error: ${message}`);
    }

    return NextResponse.json(
      {
        success: false,
        error: "AI setup decomposition is temporarily unavailable. Please try again.",
        timings: {
          durationMs,
          requestId,
        },
      } satisfies SetupDecomposeResponsePayload,
      { status: 500 }
    );
  }
}
