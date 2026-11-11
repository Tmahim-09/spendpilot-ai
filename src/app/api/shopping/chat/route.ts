import { NextResponse } from "next/server";
import {
  processUserMessage,
  createInitialSession,
} from "@/lib/ai/conversation-engine";
import { orchestrateShoppingTurn } from "@/lib/orchestrator/index";
import { resolveNaturalMessage } from "@/lib/ai/normalize-interaction-response";
import { createTurnTracker } from "@/lib/observability/call-tracker";
import { syncWorkspaceFromBrief } from "@/lib/workspace/sync-engine";
import { isConversationalAcknowledgement } from "@/lib/orchestrator/intent-analyzer";
import type {
  ChatRequestPayload,
  ChatResponsePayload,
  AuthoritativeShoppingSession,
  CurrencyCode,
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

    // Initialize turn call tracker for observability (Section 19)
    const submissionId = body.clientMessageId || `sub_${Date.now()}`;
    const tracker = createTurnTracker(submissionId, baseSession.revision);

    // Run central orchestrator to manage structured Shopping Brief and task lifecycle
    // (Rule 7A: 1 Gemini call for new text, Rule 7B: 0 Gemini calls for quick replies)
    const orchestratorResult = await orchestrateShoppingTurn({
      userMessage,
      activeBrief: baseSession.shoppingBrief || null,
      activeSessionId: baseSession.sessionId,
      activeTaskId: baseSession.currentTaskId || null,
      answeredQuestionId: body.answeredQuestionId,
      sourceMessageId: body.clientMessageId,
      conversationHistory: (baseSession.messages || []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    baseSession.shoppingBrief = orchestratorResult.brief;
    baseSession.currentTaskId = orchestratorResult.taskId;
    baseSession.workspace = syncWorkspaceFromBrief(
      baseSession.workspace,
      orchestratorResult.brief,
      userMessage,
      (orchestratorResult.brief.budget?.maximum?.currency as CurrencyCode) || baseSession.currency
    );

    const result = await processUserMessage({
      session: baseSession,
      userMessage,
      clientMessageId: body.clientMessageId,
      answeredQuestionId: body.answeredQuestionId,
      answeredAttributeKey: body.answeredAttributeKey,
      currentProductsSummary: body.currentProductsSummary || [],
      precomputedOrchestration: orchestratorResult,
    });

    const isAck = isConversationalAcknowledgement(userMessage);
    const effectiveShouldExecuteSearch = !isAck && Boolean(result.shouldExecuteSearch);

    // Record turn decision reason and log summary
    tracker.setDecisionReason(
      effectiveShouldExecuteSearch
        ? "ready_for_product_search"
        : result.assistantMessage.nextQuestion
        ? "clarification_question_required"
        : "continue_dialogue"
    );
    tracker.logSummary();

    const naturalContent = resolveNaturalMessage(
      result.assistantMessage.content,
      "I'm ready to help you find the right product within your budget."
    );

    const responsePayload: ChatResponsePayload = {
      success: true,
      sessionId: result.session.sessionId,
      turnId: result.session.turnId,
      revision: result.session.revision,
      message: naturalContent,
      assistantMessage: naturalContent,
      action: isAck ? "continue_conversation" : result.action,
      scope: isAck ? "shopping_related" : result.scope,
      requirements: result.session.requirements,
      nextQuestion: isAck ? null : (result.assistantMessage.nextQuestion || null),
      clarification: isAck ? null : (result.assistantMessage.clarification || (result.assistantMessage.nextQuestion ? {
        questionId: result.assistantMessage.nextQuestion.id,
        attributeKey: result.assistantMessage.nextQuestion.attributeKey,
        question: result.assistantMessage.nextQuestion.text,
        options: (result.assistantMessage.nextQuestion.options || []).map((o) => ({ label: o.label || o.value, value: o.value || o.label })),
      } : null)),
      questions: isAck ? [] : (result.assistantMessage.questions || []),
      suggestedReplies: result.assistantMessage.suggestedReplies || [],
      quickReplies: result.assistantMessage.suggestedReplies || [],
      conversationStatus: effectiveShouldExecuteSearch
        ? "searching"
        : result.shouldExecuteComparison
        ? "comparing"
        : "idle",
      canSearch: !isAck && result.session.canSearch,
      shouldExecuteSearch: effectiveShouldExecuteSearch,
      shouldExecuteComparison: result.shouldExecuteComparison,
      comparisonRequestedProductIds: result.comparisonProductIds,
      variantConfiguration: result.variantConfiguration,
      session: {
        ...result.session,
        shoppingBrief: orchestratorResult.brief,
        workspace: baseSession.workspace,
        currentTaskId: orchestratorResult.taskId,
      },
      brief: orchestratorResult.brief,
      taskId: orchestratorResult.taskId,
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

