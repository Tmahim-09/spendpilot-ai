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
 * Enforces explicit Apple MacBook identity before workspace search.
 * A user saying "MacBook" has already selected Apple/macOS; a generic laptop
 * model response must never broaden that requirement to Windows devices.
 */
function enforceExplicitMacBookIdentity(
  plan: Awaited<ReturnType<typeof generateOrchestrationPlan>>,
  userMessage: string,
  activeBrief: OrchestratorTurnInput["activeBrief"],
  isNewTask: boolean
): void {
  const message = userMessage.trim();
  const explicitlyNamesMacBook = /\bmacbook\b/i.test(message);
  const negatesMacBook =
    /\b(?:not|no|without|exclude|excluding|instead of|rather than)\b.{0,24}\bmacbook\b/i.test(message) ||
    /\bmacbook\b.{0,24}\b(?:not|excluded|rather than)\b/i.test(message);
  const comparesPlatforms =
    /\bmacbook\b.{0,40}\b(?:vs\.?|versus|or)\b.{0,28}\b(?:windows|chromebook|chromeos|linux|pc)\b/i.test(message) ||
    /\b(?:windows|chromebook|chromeos|linux|pc)\b.{0,40}\b(?:vs\.?|versus|or)\b.{0,28}\bmacbook\b/i.test(message);

  if (!explicitlyNamesMacBook || negatesMacBook || comparesPlatforms || plan.action === "reject_unrelated_request") {
    return;
  }

  const createPatch = plan.patches.find((patch) => patch.type === "create_requirement");
  let updatePatch = !isNewTask
    ? plan.patches.find((patch) => patch.type === "update_requirement")
    : undefined;

  // If a new task was detected, never update the previous product requirement.
  if (isNewTask && updatePatch) {
    plan.patches.splice(plan.patches.indexOf(updatePatch), 1);
    updatePatch = undefined;
  }

  const activeRequirement = !isNewTask
    ? activeBrief?.productRequirements.find((req) =>
        updatePatch && updatePatch.type === "update_requirement"
          ? req.id === updatePatch.requirementId
          : req.id === activeBrief?.productRequirements[0]?.id
      )
    : undefined;

  const productNameMatch = message.match(/\bmacbook(?:\s+(?:air|pro))?\b/i)?.[0] || "MacBook";
  const displayName = "Apple " + productNameMatch.replace(/^macbook/i, "MacBook");
  const existingQuery =
    createPatch?.type === "create_requirement"
      ? createPatch.requirement.searchQuery
      : updatePatch?.type === "update_requirement"
        ? updatePatch.updates.searchQuery || activeRequirement?.searchQuery
        : activeRequirement?.searchQuery;
  const queryRemainder = (existingQuery || message)
    .replace(/\b(?:windows(?:\s+11)?|chromebook|chrome\s*os|chromeos|linux\s+pc)\b/gi, " ")
    .replace(/\bapple\b|\bmacbook(?:\s+(?:air|pro))?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const searchQuery = [displayName, queryRemainder].filter(Boolean).join(" ");

  let requirementId: string;
  if (createPatch && createPatch.type === "create_requirement") {
    requirementId = createPatch.requirement.id;
    createPatch.requirement.category = "laptop";
    createPatch.requirement.displayName = displayName;
    createPatch.requirement.searchQuery = searchQuery;
  } else if (updatePatch && updatePatch.type === "update_requirement") {
    requirementId = updatePatch.requirementId;
    updatePatch.updates.category = "laptop";
    updatePatch.updates.displayName = displayName;
    updatePatch.updates.searchQuery = searchQuery;
  } else if (activeRequirement) {
    requirementId = activeRequirement.id;
    plan.patches.push({
      type: "update_requirement",
      requirementId,
      updates: { category: "laptop", displayName, searchQuery },
    });
  } else {
    requirementId = "req_macbook_" + Date.now();
    plan.patches.push({
      type: "create_requirement",
      requirement: {
        id: requirementId,
        category: "laptop",
        displayName,
        searchQuery,
        quantity: 1,
        purpose: [],
        constraints: [],
        excludedAttributes: [],
      },
    });
  }

  // Apply after model patches so explicit Apple/macOS requirements win.
  for (const [key, value] of [
    ["operating_system", "macOS"],
    ["manufacturer", "Apple"],
    ["product_family", "MacBook"],
  ] as const) {
    plan.patches.push({
      type: "add_constraint",
      requirementId,
      constraint: {
        id: "c_explicit_macbook_" + key + "_" + Date.now(),
        key,
        value,
        source: "user_explicit",
        strength: "hard",
      },
    });
  }

  const userProvidedUse = /\b(?:programming|coding|software development|development|university|college|school|study|student|video editing|photo editing|design|creative work|gaming|business|office|work|travel|everyday|general use|productivity|engineering)\b/i.test(message);
  const useAlreadyAnswered = Boolean(
    !isNewTask &&
    activeBrief?.productRequirements.some((req) =>
      req.purpose.length > 0 ||
      req.constraints.some((constraint) =>
        /^(?:primary_use|intended_use|use_case|workload)$/i.test(constraint.key)
      )
    )
  );

  // A bare MacBook request should lead to one useful preference question,
  // not an immediate generic laptop search or an OS question.
  if (!userProvidedUse && !useAlreadyAnswered) {
    const question = "What will you mainly use your MacBook for?";
    const options = [
      { label: "Programming & university", value: "Programming & university" },
      { label: "Creative work & editing", value: "Creative work & editing" },
      { label: "Everyday productivity", value: "Everyday productivity" },
      { label: "Business & professional work", value: "Business & professional work" },
    ];
    plan.action = "ask_question";
    plan.assistantMessage = "Got it. I’ll keep the search focused on Apple MacBooks. " + question;
    plan.question = {
      id: "q_macbook_primary_use",
      attributeKey: "primary_use",
      text: question,
      options,
    };
    plan.clarification = {
      questionId: "q_macbook_primary_use",
      attributeKey: "primary_use",
      question,
      options,
    };
    plan.suggestedReplies = options.map((option) => option.label);
    plan.patches.push({ type: "set_status", status: "collecting" });
  }
}

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

  // Keep explicit product identity stronger than model-generated search guesses.
  enforceExplicitMacBookIdentity(plan, userMessage, activeBrief, isNewTask);

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
