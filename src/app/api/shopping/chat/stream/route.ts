import { NextRequest } from "next/server";
import { streamConciergeTurn } from "@/lib/concierge/streaming-engine";
import { createInitialSession } from "@/lib/ai/conversation-engine";
import type {
  ChatRequestPayload,
  AuthoritativeShoppingSession,
} from "@/types";

export const maxDuration = 30; // 30s timeout

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequestPayload = await req.json().catch(() => null);

    const userMessage = typeof body?.message === "string" ? body.message.trim() : "";
    if (!userMessage) {
      return new Response(JSON.stringify({ error: "Message must not be empty." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const incomingSession = body.sessionState;
    const baseSession: AuthoritativeShoppingSession = incomingSession && incomingSession.sessionId
      ? {
          sessionId: incomingSession.sessionId,
          currentTaskId: incomingSession.currentTaskId,
          stage: incomingSession.stage || "initial_request",
          conversationState: incomingSession.conversationState || "idle",
          turnId: incomingSession.turnId || "turn_0",
          revision: incomingSession.revision || 1,
          originalRequest: incomingSession.originalRequest || userMessage,
          mode: incomingSession.mode || body.mode || "single",
          budget: incomingSession.budget !== undefined ? incomingSession.budget : (body.budget || null),
          currency: incomingSession.currency || body.currency || "USD",
          intentSummary: incomingSession.intentSummary || `Shopping for ${userMessage}`,
          requirements: incomingSession.requirements || [],
          pendingQuestions: incomingSession.pendingQuestions || [],
          activeQuestion: incomingSession.activeQuestion || null,
          answeredQuestionIds: incomingSession.answeredQuestionIds || [],
          answers: incomingSession.answers || {},
          attributeOrigins: incomingSession.attributeOrigins || {},
          canonicalAttributes: incomingSession.canonicalAttributes || {},
          messages: Array.isArray(incomingSession.messages) ? incomingSession.messages : [],
          previousInteractionId: incomingSession.previousInteractionId || null,
          storeInteractions: incomingSession.storeInteractions !== false,
          canSearch: Boolean(incomingSession.canSearch),
          retrievedProductIds: Array.isArray(incomingSession.retrievedProductIds) ? incomingSession.retrievedProductIds : [],
          selectedProductId: incomingSession.selectedProductId || null,
          selectedVariants: incomingSession.selectedVariants || {},
          lastAction: incomingSession.lastAction || "continue_conversation",
          shoppingBrief: incomingSession.shoppingBrief,
          workspace: incomingSession.workspace,
          welcomeMessage: incomingSession.welcomeMessage,
          updatedAt: Date.now(),
        }
      : createInitialSession({
          sessionId: body.sessionId,
          initialQuery: userMessage,
          mode: body.mode,
          budget: body.budget,
          currency: body.currency,
        });

    const encoder = new TextEncoder();
    const generator = streamConciergeTurn({
      userMessage,
      session: baseSession,
      clientMessageId: body.clientMessageId,
      answeredQuestionId: body.answeredQuestionId,
      currentProductsSummary: body.currentProductsSummary || [],
    });

    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { value, done } = await generator.next();
          if (done) {
            controller.close();
            return;
          }
          const sseChunk = `data: ${JSON.stringify(value)}\n\n`;
          controller.enqueue(encoder.encode(sseChunk));
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errChunk = `data: ${JSON.stringify({ type: "error", error: errMsg, canRetry: true })}\n\n`;
          controller.enqueue(encoder.encode(errChunk));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform, no-store",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to process streaming conversational turn.";
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

