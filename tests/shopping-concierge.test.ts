import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  streamConciergeTurn,
  buildConciergeDialogueContext,
  evaluateNextQuestion,
} from "../src/lib/concierge/index.ts";
import { createInitialSession } from "../src/lib/ai/conversation-engine.ts";
import { validateShoppingBrief } from "../src/lib/orchestrator/index.ts";
import type {
  ConciergeStreamEvent,
  PendingQuestion,
} from "../src/lib/concierge/types.ts";
import type {
  AuthoritativeShoppingSession,
} from "../src/types/index.ts";

/**
 * Helper to collect all events emitted by streamConciergeTurn
 */
async function collectStreamEvents(
  generator: AsyncGenerator<ConciergeStreamEvent, void, unknown>
): Promise<ConciergeStreamEvent[]> {
  const events: ConciergeStreamEvent[] = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

describe("SpendPilot Phase 2: Real-Time AI Shopping Concierge (Tests A - I)", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Test A: Laptop conversation
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test A: Laptop conversation - Purpose kept, macOS/Apple added, natural response without repeating question", async () => {
    // 1. Initial turn: Laptop for computer science & university & light gaming under $1,000
    const initialSession = createInitialSession({
      sessionId: "sess_concierge_test_a",
    });

    const turn1Generator = streamConciergeTurn({
      userMessage: "I need a laptop for computer science at university and some light gaming, my budget is $1,000",
      session: initialSession,
      clientMessageId: "client_msg_a_1",
    });

    const turn1Events = await collectStreamEvents(turn1Generator);
    const start1 = turn1Events.find((e) => e.type === "start");
    const brief1 = turn1Events.find((e) => e.type === "brief");
    const done1 = turn1Events.find((e) => e.type === "done");

    assert.ok(start1 && start1.type === "start");
    assert.ok(brief1 && brief1.type === "brief");
    assert.ok(done1 && done1.type === "done");

    const sessionAfterTurn1 = done1.session;
    const shoppingBrief1 = sessionAfterTurn1.shoppingBrief!;

    // Category must be laptop
    assert.strictEqual(shoppingBrief1.productRequirements.length, 1);
    const req1 = shoppingBrief1.productRequirements[0];
    assert.strictEqual(req1.category, "laptop");

    // Must preserve all requested purposes
    assert.ok(
      req1.purpose.includes("programming") || req1.purpose.includes("computer_science"),
      "Must retain computer science/programming purpose"
    );
    assert.ok(req1.purpose.includes("university"), "Must retain university purpose");
    assert.ok(req1.purpose.includes("light_gaming"), "Must retain light gaming purpose");

    // Budget: $1,000 USD (100000 minor units)
    assert.strictEqual(shoppingBrief1.budget?.maximum?.amountMinor, 100000);

    // Initial response asks follow up (e.g. OS preference: macOS or Windows)
    const turn1AssistantText = done1.fullText.toLowerCase();
    assert.ok(
      turn1AssistantText.includes("macos") ||
        turn1AssistantText.includes("windows") ||
        turn1AssistantText.includes("operating system"),
      "Assistant should ask about operating system preference"
    );

    // 2. Follow-up turn: "macOS, Apple MacBook"
    const turn2Generator = streamConciergeTurn({
      userMessage: "macOS, Apple MacBook",
      session: sessionAfterTurn1,
      clientMessageId: "client_msg_a_2",
    });

    const turn2Events = await collectStreamEvents(turn2Generator);
    const brief2 = turn2Events.find((e) => e.type === "brief");
    const done2 = turn2Events.find((e) => e.type === "done");

    assert.ok(brief2 && brief2.type === "brief");
    assert.ok(done2 && done2.type === "done");

    const sessionAfterTurn2 = done2.session;
    const shoppingBrief2 = sessionAfterTurn2.shoppingBrief!;
    const req2 = shoppingBrief2.productRequirements[0];

    // Purpose must STILL be retained across turns!
    assert.ok(
      req2.purpose.includes("programming") || req2.purpose.includes("computer_science"),
      "Must preserve computer science purpose in turn 2"
    );
    assert.ok(req2.purpose.includes("university"), "Must preserve university purpose in turn 2");
    assert.ok(req2.purpose.includes("light_gaming"), "Must preserve gaming purpose in turn 2");

    // Added Apple and macOS constraints
    const constraintKeys = req2.constraints.map((c) => c.key.toLowerCase());
    const constraintValues = req2.constraints.map((c) => String(c.value).toLowerCase());
    assert.ok(constraintKeys.includes("os"), "Must have added OS constraint");
    assert.ok(constraintValues.includes("macos"), "Must have macOS value");

    // Notes budget or MacBook M1/M2 / refurbished
    const turn2AssistantText = done2.fullText.toLowerCase();
    assert.ok(
      turn2AssistantText.includes("macbook") ||
        turn2AssistantText.includes("m1") ||
        turn2AssistantText.includes("m2") ||
        turn2AssistantText.includes("budget") ||
        turn2AssistantText.includes("1,000"),
      "Assistant should address MacBook feasibility or models within $1,000"
    );

    // Must NOT repeat the same OS question
    const qEvent = turn2Events.find((e) => e.type === "question");
    if (qEvent && qEvent.type === "question" && qEvent.question) {
      assert.notStrictEqual(qEvent.question.attributeKey, "os", "Must NOT repeat OS question");
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test B: Screen size question and unrelated useful answer
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test B: Screen size question and unrelated useful answer - accepts answer and does not repeat screen size", async () => {
    const brief = {
      schemaVersion: 1 as const,
      taskId: "task_test_b",
      mode: "single_product" as const,
      userGoal: "Find a laptop for college",
      productRequirements: [
        {
          id: "req_laptop_b",
          category: "laptop",
          displayName: "Laptop",
          searchQuery: "laptop",
          quantity: 1,
          purpose: ["college"],
          constraints: [],
          excludedAttributes: [],
        },
      ],
      missingInformation: [],
      status: "collecting" as const,
      updatedAt: new Date().toISOString(),
    };

    const pendingScreenQuestion: PendingQuestion = {
      id: "q_screen_size_1",
      requirementId: "req_laptop_b",
      attributeKey: "screen_size",
      text: "Do you prefer a 13-inch or a larger 15-inch/16-inch display?",
      options: [
        { id: "opt_1", label: "13-inch", value: "13-inch" },
        { id: "opt_2", label: "15-inch", value: "15-inch" },
      ],
      createdAt: Date.now(),
      status: "active",
    };

    // User responds with "macOS, Apple MacBook" instead of answering 13 or 15 inch
    const evalResult = evaluateNextQuestion({
      brief,
      userMessage: "macOS, Apple MacBook",
      previousQuestion: pendingScreenQuestion,
      askedQuestionIds: ["q_screen_size_1"],
      answeredQuestionIds: [],
    });

    // Screen size was bypassed/superseded because user provided other useful info
    assert.strictEqual(
      evalResult.supersededQuestionId,
      "q_screen_size_1",
      "Previous question should be marked superseded"
    );

    // Screen size question MUST NOT be repeated immediately
    if (evalResult.nextQuestion) {
      assert.notStrictEqual(
        evalResult.nextQuestion.attributeKey,
        "screen_size",
        "Must NOT repeat screen size question"
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test C: Anime room decorations
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test C: Anime room decorations - recognizes decor task, does not produce canned responses or laptop questions", async () => {
    const session = createInitialSession({
      sessionId: "sess_concierge_test_c",
    });

    const generator = streamConciergeTurn({
      userMessage:
        "Help me decorate my room with anime stuff. I love Naruto, One Piece, and Attack on Titan. Budget is $150.",
      session,
    });

    const events = await collectStreamEvents(generator);
    const briefEvent = events.find((e) => e.type === "brief");
    const doneEvent = events.find((e) => e.type === "done");

    assert.ok(briefEvent && briefEvent.type === "brief");
    assert.ok(doneEvent && doneEvent.type === "done");

    const brief = briefEvent.brief;

    // Must be multi-product room decor
    assert.strictEqual(brief.mode, "multi_product");
    const categories = brief.productRequirements.map((r) => r.category.toLowerCase());

    // Must NOT have any laptop, PC, or tech specs
    assert.strictEqual(
      categories.some((c) => c.includes("laptop") || c.includes("pc")),
      false,
      "Must NOT create laptop or PC categories"
    );

    // Franchises must be preserved
    const allConstraints = brief.productRequirements.flatMap((r) => r.constraints);
    const franchiseValues = allConstraints
      .filter((c) => c.key === "franchise")
      .map((c) => String(c.value).toLowerCase());

    assert.ok(
      franchiseValues.some((v) => v.includes("naruto")),
      "Must preserve Naruto"
    );
    assert.ok(
      franchiseValues.some((v) => v.includes("one piece")),
      "Must preserve One Piece"
    );
    assert.ok(
      franchiseValues.some((v) => v.includes("attack on titan")),
      "Must preserve Attack on Titan"
    );

    // Budget: $150 USD (15000 minor units)
    assert.strictEqual(brief.budget?.maximum?.amountMinor, 15000);

    // Output must not contain canned greetings or generic checklists
    const lowerAssistant = doneEvent.fullText.toLowerCase();
    assert.strictEqual(lowerAssistant.includes("canned"), false);
    assert.strictEqual(lowerAssistant.includes("ram"), false);
    assert.strictEqual(lowerAssistant.includes("processor"), false);
    assert.strictEqual(lowerAssistant.includes("ssd"), false);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test D: Free-text refinement
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test D: Free-text refinement - interprets 'Nothing too expensive, but I want something that lasts' in context", async () => {
    // Initial session with laptop
    const session = createInitialSession({
      sessionId: "sess_concierge_test_d",
    });

    const turn1Generator = streamConciergeTurn({
      userMessage: "I need a MacBook for college",
      session,
    });
    const turn1Events = await collectStreamEvents(turn1Generator);
    const done1 = turn1Events.find((e) => e.type === "done");
    assert.ok(done1 && done1.type === "done");

    // User adds free text refinement: "Nothing too expensive, but I want something that lasts"
    const turn2Generator = streamConciergeTurn({
      userMessage: "Nothing too expensive, but I want something that lasts",
      session: done1.session,
    });
    const turn2Events = await collectStreamEvents(turn2Generator);
    const done2 = turn2Events.find((e) => e.type === "done");
    assert.ok(done2 && done2.type === "done");

    const brief2 = done2.session.shoppingBrief!;
    const activeReq = brief2.productRequirements[0];

    // Must record durability/build quality without requiring a button click!
    const hasDurabilityConstraint = activeReq.constraints.some(
      (c) => c.key === "build_quality" && String(c.value).includes("durable")
    );
    assert.strictEqual(hasDurabilityConstraint, true, "Must extract build quality constraint");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test E: New shopping task
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test E: New shopping task - generates fresh task ID, clears old requirements, zero leaked laptop context", async () => {
    // 1. Initial MacBook task
    const session = createInitialSession({
      sessionId: "sess_concierge_test_e",
    });

    const turn1Generator = streamConciergeTurn({
      userMessage: "I need an Apple MacBook Air under $1,200",
      session,
    });
    const turn1Events = await collectStreamEvents(turn1Generator);
    const done1 = turn1Events.find((e) => e.type === "done");
    assert.ok(done1 && done1.type === "done");

    const macBookTaskId = done1.taskId;
    const sessionWithMacBook = done1.session;

    // 2. Explicit new task switch: "Now help me find anime decorations for my bedroom under $100"
    const turn2Generator = streamConciergeTurn({
      userMessage: "Now help me find anime decorations for my bedroom under $100",
      session: sessionWithMacBook,
    });
    const turn2Events = await collectStreamEvents(turn2Generator);
    const done2 = turn2Events.find((e) => e.type === "done");
    assert.ok(done2 && done2.type === "done");

    const animeTaskId = done2.taskId;
    const newBrief = done2.session.shoppingBrief!;

    // 1. Must generate a fresh task ID
    assert.notStrictEqual(animeTaskId, macBookTaskId, "Must generate a different task ID for new task");

    // 2. Requirements must contain anime decor, zero laptop requirements
    const categories = newBrief.productRequirements.map((r) => r.category.toLowerCase());
    assert.strictEqual(
      categories.some((c) => c.includes("laptop")),
      false,
      "New shopping brief must NOT contain laptop requirements"
    );

    // 3. Dialogue context built for the new task must not leak old laptop requirements into new brief
    const contextPrompt = buildConciergeDialogueContext({
      session: done2.session,
      brief: newBrief,
      userMessage: "Now help me find anime decorations for my bedroom under $100",
    });

    assert.ok(
      contextPrompt.includes(`ACTIVE SHOPPING TASK ID: ${animeTaskId}`),
      "Must bind context to new task ID"
    );
    assert.strictEqual(
      contextPrompt.includes("Apple MacBook laptop"),
      false,
      "Active task Shopping Brief in prompt must not leak MacBook requirements"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test F: Genuine streaming
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test F: Genuine streaming - chunks arrive progressively, yielding multiple delta events matching final message", async () => {
    const session = createInitialSession({
      sessionId: "sess_concierge_test_f",
    });

    const mockChunks = [
      "I've found ",
      "some great ",
      "MacBook options ",
      "matching your ",
      "university needs.",
    ];

    const generator = streamConciergeTurn({
      userMessage: "I need a MacBook under $1,200",
      session,
      customStreamChunks: mockChunks,
    });

    const events = await collectStreamEvents(generator);

    // Filter delta events
    const deltaEvents = events.filter((e) => e.type === "delta");
    assert.strictEqual(deltaEvents.length, mockChunks.length, "Must yield exactly one delta per chunk");

    const streamedTexts = deltaEvents.map((e) => (e as { type: "delta"; text: string }).text);
    assert.deepStrictEqual(streamedTexts, mockChunks, "Deltas must match progressive chunks");

    // Final message in done event matches accumulated chunks
    const doneEvent = events.find((e) => e.type === "done") as {
      type: "done";
      fullText: string;
    };
    assert.ok(doneEvent, "Must emit done event");
    assert.strictEqual(doneEvent.fullText, mockChunks.join(""));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test G: Duplicate submission prevention
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test G: Duplicate submission prevention - identical clientMessageId is ignored without duplicate session messages", async () => {
    const session = createInitialSession({
      sessionId: "sess_concierge_test_g",
    });

    const fixedClientMessageId = "msg_client_fixed_submit_999";

    // First submission
    const turn1Events = await collectStreamEvents(
      streamConciergeTurn({
        userMessage: "I need a laptop for computer science",
        session,
        clientMessageId: fixedClientMessageId,
      })
    );

    const done1 = turn1Events.find((e) => e.type === "done") as {
      type: "done";
      session: AuthoritativeShoppingSession;
    };
    assert.ok(done1, "Turn 1 must succeed");
    const sessionTurn1 = done1.session;
    const initialMessageCount = sessionTurn1.messages.length;

    // Second rapid submission with the SAME clientMessageId
    const turn2Events = await collectStreamEvents(
      streamConciergeTurn({
        userMessage: "I need a laptop for computer science",
        session: sessionTurn1,
        clientMessageId: fixedClientMessageId,
      })
    );

    const errorEvent = turn2Events.find((e) => e.type === "error") as {
      type: "error";
      error: string;
      session?: AuthoritativeShoppingSession;
    };
    assert.ok(errorEvent, "Duplicate submission must yield an error event");
    assert.ok(
      errorEvent.error.includes("Duplicate submission"),
      "Error must explain duplicate submission was ignored"
    );

    // Messages array must NOT have grown with duplicates!
    const resultingMessages = errorEvent.session ? errorEvent.session.messages : sessionTurn1.messages;
    assert.strictEqual(
      resultingMessages.length,
      initialMessageCount,
      "Duplicate submission must not add duplicate messages"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test H: Streaming failure recovery
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test H: Streaming failure recovery - preserves partial text with indicator, emits error, allows safe retry", async () => {
    const session = createInitialSession({
      sessionId: "sess_concierge_test_h",
    });

    const mockChunks = ["Looking for ", "MacBook models... ", "Found M1 Air ", "and M2 Air."];

    // Simulate interruption after 2 chunks
    const generator = streamConciergeTurn({
      userMessage: "Find MacBook options",
      session,
      customStreamChunks: mockChunks,
      simulateStreamErrorAfterChunk: 2,
    });

    const events = await collectStreamEvents(generator);

    // Delta events before interruption
    const deltas = events.filter((e) => e.type === "delta");
    assert.strictEqual(deltas.length, 2, "Should have streamed first 2 deltas");

    // Interruption error event emitted
    const errorEvent = events.find((e) => e.type === "error") as {
      type: "error";
      error: string;
      partialText?: string;
      canRetry: boolean;
      session?: AuthoritativeShoppingSession;
    };
    assert.ok(errorEvent, "Must emit error event");
    assert.strictEqual(errorEvent.canRetry, true, "Must flag canRetry = true");
    assert.ok(
      errorEvent.partialText?.includes("[Interrupted]"),
      "Partial text must have interruption indicator"
    );

    // Interrupted session preserves partial message
    assert.ok(errorEvent.session, "Error event should include interrupted session");
    const interruptedSession = errorEvent.session!;
    const lastMsg = interruptedSession.messages[interruptedSession.messages.length - 1];
    assert.strictEqual(lastMsg.role, "assistant");
    assert.ok(lastMsg.content.includes("[Interrupted]"));

    // User can safely retry: new turn continues cleanly
    const retryGenerator = streamConciergeTurn({
      userMessage: "Please continue finding MacBook options",
      session: interruptedSession,
      clientMessageId: "retry_msg_1",
    });

    const retryEvents = await collectStreamEvents(retryGenerator);
    const retryDone = retryEvents.find((e) => e.type === "done") as {
      type: "done";
      session: AuthoritativeShoppingSession;
    };
    assert.ok(retryDone, "Retry turn should complete successfully");
    // Ensure messages array was appended to without duplicate interrupted turns
    const finalMessages = retryDone.session.messages;
    assert.strictEqual(finalMessages[finalMessages.length - 1].role, "assistant");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test I: Full refresh
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test I: Full refresh - starts with clean empty state and zero stale requirements", async () => {
    // Simulate user reloading page / full refresh
    const freshSession = createInitialSession({
      sessionId: `sess_refresh_${Date.now()}`,
    });

    // Fresh session is completely clean
    assert.strictEqual(freshSession.messages.length, 0, "Messages must be empty");
    assert.strictEqual(freshSession.requirements.length, 0, "Requirements must be empty");
    assert.strictEqual(freshSession.pendingQuestions.length, 0, "Pending questions must be empty");
    assert.strictEqual(freshSession.shoppingBrief, undefined, "Shopping brief must not carry stale data");
    assert.strictEqual(freshSession.canSearch, false, "canSearch must be false");

    // An initial request on fresh session initializes clean Shopping Brief
    const generator = streamConciergeTurn({
      userMessage: "I need running shoes under $120",
      session: freshSession,
    });

    const events = await collectStreamEvents(generator);
    const briefEvent = events.find((e) => e.type === "brief") as {
      type: "brief";
      brief: import("../src/lib/orchestrator/types.ts").ShoppingBrief;
    };

    assert.ok(briefEvent);
    assert.strictEqual(briefEvent.brief.schemaVersion, 1);
    assert.ok(validateShoppingBrief(briefEvent.brief).success);
    assert.strictEqual(briefEvent.brief.budget?.maximum?.amountMinor, 12000);
  });
});
