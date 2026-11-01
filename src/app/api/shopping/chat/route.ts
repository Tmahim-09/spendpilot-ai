import { NextResponse } from "next/server";
import {
  processUserMessage,
  createInitialSession,
} from "@/lib/ai/conversation-engine";
import type {
  ChatRequestPayload,
  ChatResponsePayload,
  AuthoritativeShoppingSession,
} from "@/types";

export const maxDuration = 30; // 30s timeout

export async function POST(req: Request) {
  try {
    const body: ChatRequestPayload = await req.json();

    const userMessage = typeof body.message === "string" ? body.message.trim() : "";
    if (!userMessage) {
      return NextResponse.json(
        {
          success: false,
          error: "Message must not be empty.",
        },
        { status: 400 }
      );
    }

    // Reconstruct or initialize authoritative session
    const incomingSession = body.sessionState;
    const baseSession: AuthoritativeShoppingSession = incomingSession && incomingSession.sessionId
      ? {
          sessionId: incomingSession.sessionId,
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
          updatedAt: Date.now(),
        }
      : createInitialSession({
          sessionId: body.sessionId,
          initialQuery: userMessage,
          mode: body.mode,
          budget: body.budget,
          currency: body.currency,
        });

    const result = await processUserMessage({
      session: baseSession,
      userMessage,
      clientMessageId: body.clientMessageId,
      answeredQuestionId: body.answeredQuestionId,
      answeredAttributeKey: body.answeredAttributeKey,
      currentProductsSummary: body.currentProductsSummary || [],
    });

    const responsePayload: ChatResponsePayload = {
      success: true,
      sessionId: result.session.sessionId,
      turnId: result.session.turnId,
      revision: result.session.revision,
      message: result.assistantMessage.content,
      action: result.action,
      scope: result.scope,
      requirements: result.session.requirements,
      nextQuestion: result.assistantMessage.nextQuestion || null,
      questions: result.assistantMessage.questions || [],
      suggestedReplies: result.assistantMessage.suggestedReplies || [],
      canSearch: result.session.canSearch,
      shouldExecuteSearch: result.shouldExecuteSearch,
      shouldExecuteComparison: result.shouldExecuteComparison,
      comparisonRequestedProductIds: result.comparisonProductIds,
      variantConfiguration: result.variantConfiguration,
      session: result.session,
      modelUsed: result.modelUsed,
      usedFallback: result.usedFallback,
      previousInteractionId: result.session.previousInteractionId,
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to process conversational turn.";
    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}

