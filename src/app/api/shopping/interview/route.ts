import { NextResponse } from "next/server";
import { executeGuidedInterviewTurn } from "@/lib/ai/gemini-interview";
import type {
  GuidedInterviewRequestPayload,
  GuidedInterviewResponsePayload,
} from "@/types";

export const maxDuration = 30; // 30s timeout

export async function POST(req: Request) {
  try {
    const body: GuidedInterviewRequestPayload = await req.json();

    const requestText = typeof body.requestText === "string" ? body.requestText.trim() : "";
    if (!requestText || requestText.length < 2) {
      return NextResponse.json(
        {
          success: false,
          error: "Request text must be at least 2 characters.",
        },
        { status: 400 }
      );
    }

    const mode = body.mode === "setup" ? "setup" : "single";
    const budget =
      typeof body.budget === "number" && body.budget > 0 ? body.budget : null;
    const currency = body.currency || "USD";
    const answers = body.answers || {};
    const sessionId = body.sessionId || `session-${Date.now().toString(36)}`;

    const result = await executeGuidedInterviewTurn({
      originalRequest: requestText,
      mode,
      budget,
      currency,
      existingAnswers: answers,
    });

    const responsePayload: GuidedInterviewResponsePayload = {
      success: true,
      sessionId,
      stage: result.stage,
      intentSummary: result.intentSummary,
      requirements: result.requirements,
      questions: result.questions,
      canSearch: result.canSearch,
      message: result.assistantMessage,
      modelUsed: result.modelUsed,
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to execute shopping interview turn";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
