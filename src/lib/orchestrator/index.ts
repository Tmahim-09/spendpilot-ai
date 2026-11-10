import type {
  OrchestratorTurnInput,
  OrchestratorTurnResult,
} from "./types.ts";
import { analyzeUserShoppingIntent } from "./intent-analyzer.ts";
import { resolveActiveBriefForTurn } from "./task-manager.ts";
import {
  generateOrchestrationPlan,
  extractDeterministicPatches,
} from "./gemini-orchestrator.ts";
import { applyBriefPatches } from "./brief-patch.ts";
import { checkBriefReadinessForSearch } from "./channel3-adapter.ts";

/**
 * SpendPilot AI Central Server-Side Shopping Orchestrator
 * Coordinates intent interpretation, task isolation, Shopping Brief updates,
 * patch validation, and product discovery readiness.
 */
export async function orchestrateShoppingTurn(
  input: OrchestratorTurnInput
): Promise<OrchestratorTurnResult> {
  const {
    userMessage,
    activeBrief,
    answeredQuestionId,
    conversationHistory,
    sourceMessageId,
  } = input;

  // 1. Interpret user shopping intent
  const detectedIntent = analyzeUserShoppingIntent({
    userMessage,
    activeBrief,
    answeredQuestionId,
    conversationHistory,
  });

  // 2. Establish isolated task state (generates fresh task ID & brief if starting a new task)
  const { brief: currentBrief, isNewTask } = resolveActiveBriefForTurn(
    activeBrief,
    detectedIntent,
    userMessage
  );

  // 3. Generate structured orchestration plan (patches, assistant message, questions)
  // Rule 7B: Known quick reply button click -> 0 Gemini calls!
  const isKnownQuickReply = Boolean(answeredQuestionId || detectedIntent.type === "answer_question");
  const plan = isKnownQuickReply
    ? extractDeterministicPatches(userMessage, currentBrief, detectedIntent)
    : await generateOrchestrationPlan({
        userMessage,
        activeBrief: currentBrief,
        intent: detectedIntent,
        conversationHistory,
        sourceMessageId,
      });

  // 4. Deterministically apply validated patches to the Shopping Brief
  const { brief: updatedBrief, applied: patchesApplied, rejected: rejectedPatches } =
    applyBriefPatches(currentBrief, plan.patches);

  // 5. Evaluate product discovery readiness
  const isAskingQuestion = Boolean(plan.question || plan.action === "ask_question");
  const readiness = checkBriefReadinessForSearch(updatedBrief);
  const isReady = readiness.isReady && !isAskingQuestion;

  // 6. Final action determination
  let finalAction = plan.action;
  if (isNewTask && finalAction !== "reject_unrelated_request" && !plan.question && finalAction !== "ask_question") {
    finalAction = "start_new_task";
  }

  return {
    taskId: updatedBrief.taskId,
    brief: updatedBrief,
    detectedIntent,
    patchesApplied,
    rejectedPatches,
    missingInformation: updatedBrief.missingInformation,
    isReadyForSearch: isReady,
    suggestedAction: finalAction,
    assistantMessage: plan.assistantMessage,
    clarification: plan.clarification || (plan.question ? {
      questionId: plan.question.id || `q_${plan.question.attributeKey || "detail"}`,
      attributeKey: plan.question.attributeKey || "product_detail",
      question: plan.question.text,
      options: (plan.question.options || []).map((opt) =>
        typeof opt === "string" ? { label: opt, value: opt } : opt
      ),
    } : null),
    question: plan.question || null,
    suggestedReplies: plan.suggestedReplies,
    modelUsed: plan.modelUsed,
  };
}

// Re-export key modules for external consumption
export * from "./types.ts";
export * from "./brief-schema.ts";
export * from "./brief-patch.ts";
export * from "./intent-analyzer.ts";
export * from "./task-manager.ts";
export * from "./channel3-adapter.ts";
export * from "./gemini-orchestrator.ts";
