import { getGeminiClient } from "../ai/gemini-client.ts";
import {
  getConfiguredModelChain,
  buildModelGenerationConfig,
} from "../ai/gemini-router.ts";
import { CONCIERGE_SYSTEM_INSTRUCTION } from "./system-instruction.ts";
import { buildConciergeDialogueContext } from "./context-builder.ts";
import { evaluateNextQuestion } from "./question-tracker.ts";
import { isDelegatedOrNoPreference } from "../orchestrator/intent-analyzer.ts";
import { orchestrateShoppingTurn } from "../orchestrator/index.ts";
import { upsertCanonicalAttribute } from "../shopping/canonical-attributes.ts";
import {
  normalizeInteractionResponse,
  resolveNaturalMessage,
} from "../ai/normalize-interaction-response.ts";
import { getRandomSearchingText } from "../ai/conversation-engine.ts";
import { createTurnTracker } from "../observability/call-tracker.ts";
import { syncWorkspaceFromBrief } from "../workspace/sync-engine.ts";
import type {
  AuthoritativeShoppingSession,
  ChatMessage,
  CurrencyCode,
} from "../../types/index.ts";
import type {
  ConciergeStreamEvent,
  PendingQuestion,
} from "./types.ts";

export interface StreamConciergeTurnParams {
  userMessage: string;
  session: AuthoritativeShoppingSession;
  clientMessageId?: string;
  answeredQuestionId?: string;
  currentProductsSummary?: Array<{
    id?: string;
    sourceProductId?: string | null;
    title: string;
    price?: number | null;
    currency?: string;
    brand?: string | null;
    availability?: string;
  }>;
  customStreamChunks?: string[] | AsyncIterable<string>;
  simulateStreamErrorAfterChunk?: number;
}

/**
 * Executes a streaming Concierge turn yielding typed SSE events:
 * 1. Validated Phase 1 orchestrator update for Shopping Brief.
 * 2. Next question and quick-reply evaluation.
 * 3. Genuine Gemini streaming chunks with model failover protection.
 * 4. Final state synchronization.
 */
export async function* streamConciergeTurn(
  params: StreamConciergeTurnParams
): AsyncGenerator<ConciergeStreamEvent, void, unknown> {
  const {
    userMessage,
    session,
    clientMessageId,
    answeredQuestionId,
    currentProductsSummary,
    customStreamChunks,
    simulateStreamErrorAfterChunk,
  } = params;

  // Duplicate submission check: if clientMessageId has already been recorded in session messages
  if (
    clientMessageId &&
    session.messages?.some(
      (m) => (m.clientMessageId && m.clientMessageId === clientMessageId) || m.id === clientMessageId
    )
  ) {
    yield {
      type: "error",
      error: `Duplicate submission with clientMessageId '${clientMessageId}' was ignored.`,
      canRetry: false,
      session,
    };
    return;
  }

  const turnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const tracker = createTurnTracker(clientMessageId || `stream_${turnId}`, session.revision);

  // 1. Run Central Orchestrator for validated Shopping Brief and Intent
  // Rule 7A: 1 Gemini call for new text, Rule 7B: 0 Gemini calls for quick replies
  const orchestratorResult = await orchestrateShoppingTurn({
    userMessage,
    activeBrief: session.shoppingBrief || null,
    activeSessionId: session.sessionId,
    activeTaskId: session.currentTaskId || null,
    answeredQuestionId,
    sourceMessageId: clientMessageId,
    conversationHistory: (session.messages || []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const updatedBrief = orchestratorResult.brief;
  const taskId = orchestratorResult.taskId;

  const createInterruptedSession = (partialText: string): AuthoritativeShoppingSession => {
    const updatedUserMsg: ChatMessage = {
      id: clientMessageId || `msg_u_${Date.now()}`,
      role: "user",
      content: userMessage,
      createdAt: Date.now(),
      clientMessageId,
    };
    const interruptedAssistantMsg: ChatMessage = {
      id: `msg_a_interrupted_${Date.now()}`,
      role: "assistant",
      content: `${partialText} [Interrupted]`,
      createdAt: Date.now(),
    };
    const finalMsgs = [...(session.messages || [])];
    if (!finalMsgs.some((m) => m.id === updatedUserMsg.id)) {
      finalMsgs.push(updatedUserMsg);
    }
    finalMsgs.push(interruptedAssistantMsg);

    return {
      ...session,
      currentTaskId: taskId,
      shoppingBrief: updatedBrief,
      messages: finalMsgs,
      canSearch: false,
      updatedAt: Date.now(),
    };
  };

  // Emit task and brief start events
  yield {
    type: "start",
    turnId,
    taskId,
  };

  yield {
    type: "brief",
    brief: updatedBrief,
    taskId,
  };

  // 2. Evaluate Question State
  const askedQuestionIds = session.pendingQuestions.map((q) => q.id);
  const answeredQuestionIds = session.answeredQuestionIds || [];
  if (answeredQuestionId && !answeredQuestionIds.includes(answeredQuestionId)) {
    answeredQuestionIds.push(answeredQuestionId);
  }

  const questionEval = evaluateNextQuestion({
    brief: updatedBrief,
    userMessage,
    previousQuestion: session.activeQuestion as unknown as PendingQuestion | null,
    askedQuestionIds,
    answeredQuestionIds,
    answeredQuestionId,
    suggestedQuestion: orchestratorResult.question,
  });

  const nextQuestion = questionEval.nextQuestion;
  yield {
    type: "question",
    question: nextQuestion,
  };

  const canSearch = questionEval.canProceedToSearch;
  const shouldExecuteSearch = canSearch && !nextQuestion;

  yield {
    type: "action",
    action: orchestratorResult.suggestedAction,
    canSearch,
    shouldExecuteSearch,
  };

  // 3. Build Dialogue Context for Gemini
  const promptContext = buildConciergeDialogueContext({
    session,
    brief: updatedBrief,
    userMessage,
    activeQuestion: nextQuestion,
    askedQuestionIds,
    currentProductsSummary,
  });

  // 4. Genuine Gemini Streaming with Safe Model Failover
  let fullAccumulatedText = "";
  let hasStreamedAnyDelta = false;
  const hasRealApiKey =
    Boolean(process.env.GEMINI_API_KEY) && process.env.GEMINI_API_KEY !== "test-dummy-api-key";

  if (customStreamChunks) {
    let chunkCount = 0;
    let isJsonCandidate = false;
    let rawAccum = "";
    try {
      for await (const chunk of customStreamChunks) {
        chunkCount++;
        if (simulateStreamErrorAfterChunk && chunkCount > simulateStreamErrorAfterChunk) {
          throw new Error("Simulated stream network interruption.");
        }
        rawAccum += chunk;
        if (!isJsonCandidate && (rawAccum.trim().startsWith("{") || rawAccum.trim().startsWith("```"))) {
          isJsonCandidate = true;
        }

        if (!isJsonCandidate) {
          hasStreamedAnyDelta = true;
          fullAccumulatedText += chunk;
          yield {
            type: "delta",
            text: chunk,
          };
        }
      }

      if (isJsonCandidate) {
        const norm = normalizeInteractionResponse(rawAccum);
        fullAccumulatedText = norm.assistantMessage || orchestratorResult.assistantMessage;
        if (
          (orchestratorResult.suggestedAction === "start_product_search" || shouldExecuteSearch) &&
          (/what specific preferences|what details matter most|ready to help you find what you need/i.test(fullAccumulatedText) ||
            /\?$/.test(fullAccumulatedText.trim()))
        ) {
          fullAccumulatedText = getRandomSearchingText();
        }
        hasStreamedAnyDelta = true;
        const words = fullAccumulatedText.split(" ");
        for (let i = 0; i < words.length; i++) {
          const chunk = (i > 0 ? " " : "") + words[i];
          yield {
            type: "delta",
            text: chunk,
          };
        }
      }
    } catch (err: unknown) {
      if (hasStreamedAnyDelta) {
        const interruptedSession = createInterruptedSession(fullAccumulatedText);
        yield {
          type: "error",
          error: err instanceof Error ? err.message : "Response stream was interrupted.",
          partialText: `${fullAccumulatedText} [Interrupted]`,
          canRetry: true,
          session: interruptedSession,
        };
        return;
      }
      throw err;
    }
  } else if (hasRealApiKey && !orchestratorResult.modelUsed && !isDelegatedOrNoPreference(userMessage)) {
    const aiClient = getGeminiClient();
    const modelChain = getConfiguredModelChain();
    let streamSucceeded = false;

    for (let idx = 0; idx < modelChain.length; idx++) {
      const model = modelChain[idx];
      try {
        const responseStream = await aiClient.models.generateContentStream({
          model,
          contents: [
            {
              role: "user",
              parts: [{ text: promptContext }],
            },
          ],
          config: buildModelGenerationConfig(model, {
            systemInstruction: CONCIERGE_SYSTEM_INSTRUCTION,
            temperature: 0.2,
            abortSignal: AbortSignal.timeout(15000),
          }),
        });

        let isJsonCandidate = false;
        let rawAccum = "";

        for await (const chunk of responseStream) {
          const deltaText = chunk.text;
          if (deltaText) {
            rawAccum += deltaText;
            if (!isJsonCandidate && (rawAccum.trim().startsWith("{") || rawAccum.trim().startsWith("```"))) {
              isJsonCandidate = true;
            }

            if (!isJsonCandidate) {
              hasStreamedAnyDelta = true;
              fullAccumulatedText += deltaText;
              yield {
                type: "delta",
                text: deltaText,
              };
            }
          }
        }

        if (isJsonCandidate) {
          const norm = normalizeInteractionResponse(rawAccum);
          fullAccumulatedText = norm.assistantMessage || orchestratorResult.assistantMessage;
          if (
            (orchestratorResult.suggestedAction === "start_product_search" || shouldExecuteSearch) &&
            (/what specific preferences|what details matter most|ready to help you find what you need/i.test(fullAccumulatedText) ||
              /\?$/.test(fullAccumulatedText.trim()))
          ) {
            fullAccumulatedText = getRandomSearchingText();
          }
          hasStreamedAnyDelta = true;
          const words = fullAccumulatedText.split(" ");
          for (let i = 0; i < words.length; i++) {
            const chunk = (i > 0 ? " " : "") + words[i];
            yield {
              type: "delta",
              text: chunk,
            };
          }
        }

        streamSucceeded = true;
        break;
      } catch {
        // If error happened AFTER text was already streamed, DO NOT failover to another model
        // to prevent duplicate or conflicting streamed replies!
        if (hasStreamedAnyDelta) {
          const interruptedSession = createInterruptedSession(fullAccumulatedText);
          yield {
            type: "error",
            error: "Response stream was interrupted.",
            partialText: `${fullAccumulatedText} [Interrupted]`,
            canRetry: true,
            session: interruptedSession,
          };
          return;
        }
        // If no text was streamed yet, continue to fallback model
        continue;
      }
    }

    if (!streamSucceeded && !hasStreamedAnyDelta) {
      // All model attempts failed before any delta was streamed
      // Use natural fallback message derived from orchestrator
      const fallbackText = resolveNaturalMessage(orchestratorResult.assistantMessage, "I'm looking into options for you.");
      yield {
        type: "delta",
        text: fallbackText,
      };
      fullAccumulatedText = fallbackText;
    }
  } else {
    // Deterministic simulation for tests and offline development
    // Streams actual words in genuine chunks so client parsers receive realistic deltas!
    const textToStream = resolveNaturalMessage(orchestratorResult.assistantMessage, "I'm looking into options for you.");
    const words = textToStream.split(" ");
    for (let i = 0; i < words.length; i++) {
      if (simulateStreamErrorAfterChunk && i >= simulateStreamErrorAfterChunk) {
        const interruptedSession = createInterruptedSession(fullAccumulatedText);
        yield {
          type: "error",
          error: "Simulated stream network interruption.",
          partialText: `${fullAccumulatedText} [Interrupted]`,
          canRetry: true,
          session: interruptedSession,
        };
        return;
      }
      const chunk = (i > 0 ? " " : "") + words[i];
      hasStreamedAnyDelta = true;
      fullAccumulatedText += chunk;
      yield {
        type: "delta",
        text: chunk,
      };
    }
  }

  // Ensure content is strictly natural language, never JSON
  const naturalAssistantContent = resolveNaturalMessage(
    fullAccumulatedText,
    orchestratorResult.assistantMessage
  );

  // Critical rule: If assistant asks a question, product search MUST NOT execute
  const assistantAsksQuestion = /\?\s*$/.test(naturalAssistantContent.trim()) || Boolean(nextQuestion);
  const finalShouldExecuteSearch = shouldExecuteSearch && !assistantAsksQuestion;

  // 5. Final State Synchronization
  const updatedUserMessage: ChatMessage = {
    id: clientMessageId || `msg_u_${Date.now()}`,
    role: "user",
    content: userMessage,
    createdAt: Date.now(),
    clientMessageId,
  };

  const updatedAssistantMessage: ChatMessage = {
    id: `msg_a_${Date.now()}`,
    role: "assistant",
    content: naturalAssistantContent,
    createdAt: Date.now(),
    nextQuestion: nextQuestion
      ? {
          id: nextQuestion.id,
          attributeKey: nextQuestion.attributeKey,
          text: nextQuestion.text,
          options: nextQuestion.options,
          required: false,
          inputType: "single_select",
        }
      : null,
  };

  const finalMessages = [...(session.messages || [])];
  // Deduplicate user message if not already added
  if (!finalMessages.some((m) => m.id === updatedUserMessage.id)) {
    finalMessages.push(updatedUserMessage);
  }
  finalMessages.push(updatedAssistantMessage);

  // Check if starting a new task / product context
  const isNewTask =
    orchestratorResult.detectedIntent?.type === "start_new_task" ||
    (session.currentTaskId && taskId !== session.currentTaskId);

  // Synchronize canonical attributes from updated brief with strict task isolation
  let updatedCanonicalAttrs = isNewTask ? {} : { ...(session.canonicalAttributes || {}) };
  for (const req of updatedBrief.productRequirements) {
    for (const c of req.constraints) {
      updatedCanonicalAttrs = upsertCanonicalAttribute(
        updatedCanonicalAttrs,
        c.key,
        typeof c.value === "string" || Array.isArray(c.value) ? c.value : String(c.value),
        c.source || "user_explicit",
        "confirmed",
        c.strength === "hard" ? "hard_requirement" : "optional_preference"
      );
    }
  }

  const updatedSession: AuthoritativeShoppingSession = {
    ...session,
    currentTaskId: taskId,
    shoppingBrief: updatedBrief,
    originalRequest: isNewTask ? userMessage : (session.originalRequest || userMessage),
    retrievedProductIds: isNewTask ? [] : (session.retrievedProductIds || []),
    selectedProductId: isNewTask ? null : (session.selectedProductId || null),
    workspace: syncWorkspaceFromBrief(
      session.workspace,
      updatedBrief,
      userMessage,
      (updatedBrief.budget?.maximum?.currency as CurrencyCode) ?? session.currency
    ),
    budget: isNewTask
      ? (updatedBrief.budget?.maximum?.amountMinor ?? null)
      : (updatedBrief.budget?.maximum?.amountMinor ?? session.budget),
    currency: (updatedBrief.budget?.maximum?.currency as CurrencyCode) ?? session.currency,
    canonicalAttributes: updatedCanonicalAttrs,
    messages: finalMessages,
    canSearch: finalShouldExecuteSearch,
    activeQuestion: updatedAssistantMessage.nextQuestion,
    pendingQuestions: updatedAssistantMessage.nextQuestion
      ? [
          {
            id: updatedAssistantMessage.nextQuestion.id,
            attribute: updatedAssistantMessage.nextQuestion.attributeKey,
            label: updatedAssistantMessage.nextQuestion.text,
            inputType: updatedAssistantMessage.nextQuestion.inputType,
            options: updatedAssistantMessage.nextQuestion.options,
            importance: "required_before_search",
            allowSkip: false,
          },
        ]
      : [],
    answeredQuestionIds,
    lastAction: finalShouldExecuteSearch ? "search_products" : "continue_conversation",
    updatedAt: Date.now(),
  };

  tracker.setDecisionReason(
    finalShouldExecuteSearch
      ? "ready_for_product_search"
      : nextQuestion
      ? "question_asked"
      : "dialogue_response"
  );
  tracker.logSummary();

  yield {
    type: "done",
    turnId,
    taskId,
    fullText: fullAccumulatedText,
    session: updatedSession,
    canSearch,
    shouldExecuteSearch: finalShouldExecuteSearch,
    action: orchestratorResult.suggestedAction,
  };
}
