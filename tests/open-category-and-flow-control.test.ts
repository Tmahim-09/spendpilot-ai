import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  orchestrateShoppingTurn,
  buildChannel3SearchRequests,
  extractDeterministicPatches,
} from "../src/lib/orchestrator/index.ts";
import {
  processUserMessage,
  createInitialSession,
  extractBudgetFromText,
} from "../src/lib/ai/conversation-engine.ts";
import { evaluateNextQuestion } from "../src/lib/concierge/question-tracker.ts";
import { createTurnTracker } from "../src/lib/observability/call-tracker.ts";
import {
  parseToMinorUnits,
  formatMinorUnits,
  minorToMajorUnits,
} from "../src/lib/money.ts";
import {
  resolveNaturalMessage,
  normalizeInteractionResponse,
} from "../src/lib/ai/normalize-interaction-response.ts";
import { SPENDPILOT_REDIRECT_MESSAGE } from "../src/lib/ai/domain-guard.ts";
import type { ShoppingBrief } from "../src/types/index.ts";

describe("SpendPilot AI: Open-Category Shopping Agent & Simplified Flow Control (Tests A - M)", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Test A: Initial request asks at least 1 product detail question -> proceed confirms search
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test A: Initial request asks at least 1 detail question, proceed confirms search", async () => {
    const session = createInitialSession({
      sessionId: "sess_test_a",
    });

    const userMessage =
      "Find me a Windows laptop for web development under $1,200 with 16GB RAM";
    const tracker = createTurnTracker("client_msg_a_1", session.revision);
    assert.ok(tracker);

    const orchestratorResult = await orchestrateShoppingTurn({
      userMessage,
      activeBrief: null,
      activeSessionId: session.sessionId,
      sourceMessageId: "client_msg_a_1",
    });

    // Validates structured Shopping Brief
    const brief = orchestratorResult.brief;
    assert.strictEqual(brief.productRequirements.length, 1);
    const req = brief.productRequirements[0];
    assert.strictEqual(req.category, "laptop");

    // All explicit details preserved
    assert.strictEqual(brief.budget?.maximum?.amountMinor, 120000);
    const osConstraint = req.constraints.find((c) => c.key === "os");
    assert.ok(osConstraint, "Must have OS constraint");
    assert.strictEqual(osConstraint?.value, "Windows");

    const ramConstraint = req.constraints.find((c) => c.key === "memory");
    assert.ok(ramConstraint, "Must have RAM constraint");
    assert.strictEqual(ramConstraint?.value, "16GB");

    // Turn 1: SpendPilot asks at least one question about product details
    assert.strictEqual(
      orchestratorResult.isReadyForSearch,
      false,
      "Turn 1 must ask at least 1 product detail question before calling Channel3"
    );
    assert.ok(
      orchestratorResult.question,
      "Initial request must ask a product detail question"
    );

    // Process user message with precomputed orchestration
    const turn1Result = await processUserMessage({
      session,
      userMessage,
      clientMessageId: "client_msg_a_1",
      precomputedOrchestration: orchestratorResult,
    });

    assert.strictEqual(turn1Result.shouldExecuteSearch, false);
    assert.strictEqual(turn1Result.action, "ask_follow_up");
    assert.ok(turn1Result.assistantMessage.nextQuestion);

    // Turn 2: User answers detail question -> SpendPilot asks if more details are needed with proceed option
    const turn2Orch = await orchestrateShoppingTurn({
      userMessage: "14-inch compact",
      activeBrief: turn1Result.session.shoppingBrief || null,
      activeSessionId: session.sessionId,
      answeredQuestionId: turn1Result.assistantMessage.nextQuestion.id,
      sourceMessageId: "client_msg_a_2",
    });

    const turn2Result = await processUserMessage({
      session: turn1Result.session,
      userMessage: "14-inch compact",
      answeredQuestionId: turn1Result.assistantMessage.nextQuestion.id,
      clientMessageId: "client_msg_a_2",
      precomputedOrchestration: turn2Orch,
    });

    assert.strictEqual(turn2Result.shouldExecuteSearch, false);
    assert.ok(turn2Result.assistantMessage.content.includes("before I search") || turn2Result.assistantMessage.content.includes("details"));

    // Turn 3: User confirms Proceed -> executes Channel3 search
    const turn3Orch = await orchestrateShoppingTurn({
      userMessage: "Proceed to search",
      activeBrief: turn2Result.session.shoppingBrief || null,
      activeSessionId: session.sessionId,
      answeredQuestionId: "q_proceed_confirmation",
      sourceMessageId: "client_msg_a_3",
    });

    const turn3Result = await processUserMessage({
      session: turn2Result.session,
      userMessage: "Proceed to search",
      answeredQuestionId: "q_proceed_confirmation",
      clientMessageId: "client_msg_a_3",
      precomputedOrchestration: turn3Orch,
    });

    assert.strictEqual(turn3Result.shouldExecuteSearch, true);
    assert.strictEqual(turn3Result.action, "search_products");

    // Form search request
    const searchRequests = buildChannel3SearchRequests(turn3Result.session.shoppingBrief!);
    assert.strictEqual(searchRequests.length, 1);
    assert.strictEqual(searchRequests[0].maxPriceMinor, 120000);
    assert.ok(
      searchRequests[0].searchQuery.toLowerCase().includes("windows"),
      "Search query should include Windows"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test B: Incomplete request -> exactly 1 relevant question -> 0 Channel3 calls
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test B: Incomplete request - exactly 1 relevant clarification question, zero search calls", async () => {
    const session = createInitialSession({
      sessionId: "sess_test_b",
    });

    const userMessage = "I need a chair.";
    const tracker = createTurnTracker("client_msg_b_1", session.revision);

    const orchestratorResult = await orchestrateShoppingTurn({
      userMessage,
      activeBrief: null,
      activeSessionId: session.sessionId,
      sourceMessageId: "client_msg_b_1",
    });

    assert.strictEqual(
      orchestratorResult.isReadyForSearch,
      false,
      "Vague single-item request must NOT search prematurely"
    );
    assert.ok(
      orchestratorResult.question,
      "Must ask exactly one clarification question"
    );
    assert.strictEqual(orchestratorResult.question?.attributeKey, "chair_type");
    assert.ok(
      orchestratorResult.question?.options &&
        orchestratorResult.question.options.length >= 2,
      "Must provide quick-reply options"
    );

    const result = await processUserMessage({
      session,
      userMessage,
      clientMessageId: "client_msg_b_1",
      precomputedOrchestration: orchestratorResult,
    });

    assert.strictEqual(result.shouldExecuteSearch, false);
    assert.strictEqual(result.action, "ask_follow_up");
    assert.ok(result.assistantMessage.nextQuestion);
    assert.strictEqual(tracker.getMetrics().channel3SearchCalls, 0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test C: Quick reply -> 0 Gemini calls -> immediate search or next step
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test C: Quick reply - zero Gemini calls for known quick reply", async () => {
    const initialSession = createInitialSession({
      sessionId: "sess_test_c",
    });

    // Step 1: Incomplete request generates pending question
    const turn1 = await processUserMessage({
      session: initialSession,
      userMessage: "I need a chair",
      clientMessageId: "msg_c_1",
    });

    const pendingQ = turn1.session.activeQuestion;
    assert.ok(pendingQ, "Must have active question");

    // Step 2: User clicks a known quick-reply button
    const turnTracker = createTurnTracker("msg_c_2", turn1.session.revision);

    const turn2 = await processUserMessage({
      session: turn1.session,
      userMessage: "Ergonomic Desk / Office Chair",
      clientMessageId: "msg_c_2",
      answeredQuestionId: pendingQ.id,
      answeredAttributeKey: pendingQ.attributeKey,
    });

    // Zero Gemini calls for known quick reply! (Rule 7B)
    assert.strictEqual(
      turnTracker.getMetrics().geminiCalls,
      0,
      "Rule 7B: Zero Gemini calls must be made for known quick replies"
    );

    // Question is marked answered and cleared from active
    assert.ok(
      turn2.session.answeredQuestionIds?.includes(pendingQ.id),
      "Answered question must be stored in answeredQuestionIds"
    );
    assert.strictEqual(
      turn2.session.activeQuestion,
      null,
      "Pending question should be cleared"
    );

    // Canonical attributes updated directly
    assert.ok(turn2.session.canonicalAttributes?.[pendingQ.attributeKey]);
    assert.strictEqual(
      turn2.session.canonicalAttributes?.[pendingQ.attributeKey].value,
      "Ergonomic Desk / Office Chair"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test D: Repetition prevention -> never ask answered question
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test D: Repetition prevention - never re-ask an answered question or duplicate attribute", () => {
    const brief: ShoppingBrief = {
      schemaVersion: 1,
      taskId: "task_test_d",
      mode: "single_product",
      userGoal: "Find a laptop for university",
      productRequirements: [
        {
          id: "req_laptop_d",
          category: "laptop",
          displayName: "Laptop",
          searchQuery: "laptop university",
          quantity: 1,
          purpose: ["university"],
          constraints: [
            {
              id: "c_os_d",
              key: "os",
              value: "macOS",
              strength: "hard",
              source: "user_explicit",
            },
          ],
          excludedAttributes: [],
        },
      ],
      missingInformation: [],
      status: "collecting",
      updatedAt: new Date().toISOString(),
    };

    // If Gemini or orchestrator suggests asking OS again
    const evalResult = evaluateNextQuestion({
      brief,
      userMessage: "I need 16GB RAM as well",
      askedQuestionIds: ["q_os_previous"],
      answeredQuestionIds: ["q_os_previous", "os"],
      suggestedQuestion: {
        attributeKey: "os",
        text: "What operating system do you prefer, macOS or Windows?",
        options: ["macOS", "Windows"],
      },
    });

    // Must be rejected because OS was already answered!
    assert.notStrictEqual(
      evalResult.nextQuestion?.attributeKey,
      "os",
      "Must NEVER re-ask a question for an attribute that is already answered"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test E: Unfamiliar product category (water purifier replacement cartridge)
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test E: Unfamiliar product category - water purifier replacement cartridge without laptop questions", async () => {
    const userMessage =
      "I need a compatible replacement cartridge for my specific water purifier";

    const patches = extractDeterministicPatches(userMessage, {
      schemaVersion: 1,
      taskId: "task_test_e",
      mode: "single_product",
      userGoal: userMessage,
      productRequirements: [],
      missingInformation: [],
      status: "collecting",
      updatedAt: new Date().toISOString(),
    });

    assert.strictEqual(patches.action, "ask_question");
    assert.ok(patches.question, "Must ask at least one question about product details");
    assert.strictEqual(patches.question.attributeKey, "brand_or_model");
    const createReqPatch = patches.patches.find(
      (p) => p.type === "create_requirement"
    );
    assert.ok(createReqPatch && createReqPatch.type === "create_requirement");
    assert.strictEqual(
      createReqPatch.requirement.category,
      "water_filtration"
    );
    assert.ok(
      createReqPatch.requirement.constraints.some(
        (c) => c.key === "compatibility"
      ),
      "Must prioritize compatibility constraint"
    );

    // Must NOT ask laptop or headphone questions
    assert.ok(!patches.assistantMessage.toLowerCase().includes("macos"));
    assert.ok(!patches.assistantMessage.toLowerCase().includes("windows"));
    assert.ok(!patches.assistantMessage.toLowerCase().includes("earbud"));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test F: Other diverse product categories without hardcoded allowlist
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test F: Open category support for dining tables, camera batteries, cosmetics, guitar strings, auto parts", async () => {
    const diverseQueries = [
      {
        query: "solid oak dining table for 6 people under $800",
        expectedCategory: "furniture",
      },
      {
        query: "rechargeable camera battery for Sony A7IV",
        expectedCategory: "electronics",
      },
      {
        query: "hydrating face serum for sensitive skin under $40",
        expectedCategory: "beauty",
      },
      {
        query: "acoustic guitar strings light gauge",
        expectedCategory: "musical_instruments",
      },
      {
        query: "ceramic front brake pads for 2018 Honda Civic",
        expectedCategory: "automotive",
      },
    ];

    for (const item of diverseQueries) {
      const orchestratorResult = await orchestrateShoppingTurn({
        userMessage: item.query,
        activeBrief: null,
        activeSessionId: "sess_diverse",
      });

      const brief = orchestratorResult.brief;
      assert.ok(
        brief.productRequirements.length >= 1,
        `Must parse requirement for '${item.query}'`
      );
      assert.strictEqual(
        brief.productRequirements[0].category,
        item.expectedCategory
      );
      assert.strictEqual(
        orchestratorResult.isReadyForSearch,
        true,
        `Specific query '${item.query}' should be ready for search without questionnaires`
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test G: Multi-product workstation
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test G: Multi-product workstation - monitor, desk, chair, keyboard under $1,500 total budget", async () => {
    const userMessage =
      "I want a full workstation within $1,500, including a monitor, desk, chair, and keyboard.";

    const orchestratorResult = await orchestrateShoppingTurn({
      userMessage,
      activeBrief: null,
      activeSessionId: "sess_workstation",
    });

    const brief = orchestratorResult.brief;
    assert.strictEqual(brief.mode, "multi_product");
    assert.strictEqual(brief.budget?.maximum?.amountMinor, 150000);
    assert.strictEqual(brief.productRequirements.length, 4);

    const categories = brief.productRequirements.map((r) => r.category);
    assert.ok(categories.includes("monitor"));
    assert.ok(categories.includes("desk"));
    assert.ok(categories.includes("chair"));
    assert.ok(categories.includes("keyboard"));

    // Channel3 search adapter divides or allocates budget proportionally
    const searchRequests = buildChannel3SearchRequests(brief);
    assert.strictEqual(searchRequests.length, 4);

    // Each request gets allocated portion (150000 / 4 = 37500 minor units = $375)
    for (const req of searchRequests) {
      assert.strictEqual(req.maxPriceMinor, 37500);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test H: Out-of-scope request -> polite redirect -> 0 Channel3 calls
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test H: Out-of-scope request - polite redirect without calling Channel3", async () => {
    const session = createInitialSession({
      sessionId: "sess_test_h",
    });

    const userMessage = "Write a Python program for me.";
    const tracker = createTurnTracker("msg_h_1", session.revision);

    const result = await processUserMessage({
      session,
      userMessage,
      clientMessageId: "msg_h_1",
    });

    assert.strictEqual(result.scope, "out_of_scope");
    assert.strictEqual(result.shouldExecuteSearch, false);
    assert.strictEqual(result.assistantMessage.content, SPENDPILOT_REDIRECT_MESSAGE);
    assert.strictEqual(tracker.getMetrics().channel3SearchCalls, 0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test I: Identical repeated submission (Idempotency)
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test I: Duplicate submission - identical clientMessageId is ignored safely", async () => {
    const session = createInitialSession({
      sessionId: "sess_test_i",
    });

    const turn1 = await processUserMessage({
      session,
      userMessage: "Find running shoes under $120",
      clientMessageId: "msg_dedup_100",
    });

    // Re-submit exact same clientMessageId
    const turn2 = await processUserMessage({
      session: turn1.session,
      userMessage: "Find running shoes under $120",
      clientMessageId: "msg_dedup_100",
    });

    assert.strictEqual(
      turn2.shouldExecuteSearch,
      false,
      "Duplicate message must not trigger re-search"
    );
    // Messages list does not have duplicate user messages
    const userMsgs = turn2.session.messages.filter(
      (m) => m.clientMessageId === "msg_dedup_100"
    );
    assert.strictEqual(userMsgs.length, 1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test J: Changed requirements mid-session
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test J: Changed requirements - updates existing requirement and preserves unrelated preferences", async () => {
    const session = createInitialSession({
      sessionId: "sess_test_j",
      initialQuery: "MacBook Air for coding under $1,000",
    });

    // Turn 1: Add 16GB RAM
    const turn1 = await processUserMessage({
      session,
      userMessage: "16GB RAM",
      clientMessageId: "msg_j_1",
    });

    assert.strictEqual(
      turn1.session.canonicalAttributes?.["memory"]?.value,
      "16GB"
    );

    // Turn 2: User changes requirement to 32GB RAM
    const turn2 = await processUserMessage({
      session: turn1.session,
      userMessage: "Actually make that 32GB RAM",
      clientMessageId: "msg_j_2",
    });

    assert.strictEqual(
      turn2.session.canonicalAttributes?.["memory"]?.value,
      "32GB"
    );
    // Preserves budget
    assert.strictEqual(turn2.session.budget, 100000);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test K: Concurrent or stale response protection
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test K: Stale response protection - only 1 pending question at a time and revision monotonicity", async () => {
    const session = createInitialSession({
      sessionId: "sess_test_k",
    });

    const turn1 = await processUserMessage({
      session,
      userMessage: "I need running shoes",
      clientMessageId: "msg_k_1",
    });

    assert.ok((turn1.session.revision ?? 0) > (session.revision ?? 0));
    const activeQ1 = turn1.session.activeQuestion;

    // Simulate answering active question
    const turn2 = await processUserMessage({
      session: turn1.session,
      userMessage: "Size 10.5",
      clientMessageId: "msg_k_2",
      answeredQuestionId: activeQ1?.id,
      answeredAttributeKey: activeQ1?.attributeKey,
    });

    assert.ok((turn2.session.revision ?? 0) > (turn1.session.revision ?? 0));
    assert.ok(
      turn2.session.answeredQuestionIds?.includes(activeQ1!.id),
      "Answered question must be stored in answeredQuestionIds"
    );
    assert.notStrictEqual(
      turn2.session.activeQuestion?.id,
      activeQ1?.id,
      "Previous question must not remain active"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test L: JSON leakage prevention
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test L: JSON leakage prevention - chat displays natural assistant language only", () => {
    const leakedRawJson = JSON.stringify({
      action: "ask_question",
      slot: "os",
      question: "Do you prefer macOS or Windows?",
      assistantMessage: "Would you like macOS or Windows for your coursework?",
    });

    const sanitized = resolveNaturalMessage(
      leakedRawJson,
      "I'm here to help you shop."
    );
    assert.ok(
      !sanitized.startsWith("{"),
      "Must not start with JSON brace"
    );
    assert.strictEqual(
      sanitized,
      "Would you like macOS or Windows for your coursework?"
    );

    const markdownFenced = "```json\n" + leakedRawJson + "\n```";
    const norm = normalizeInteractionResponse(markdownFenced);
    assert.strictEqual(
      norm.assistantMessage,
      "Would you like macOS or Windows for your coursework?"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test M: Money accuracy
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test M: Money accuracy - minor to major unit calculations and formatting", () => {
    // $1,200.00 parses to 120000 cents
    const minor = parseToMinorUnits("$1,200");
    assert.strictEqual(minor, 120000);

    // Exact major units
    const major = minorToMajorUnits(minor);
    assert.strictEqual(major, 1200);

    // Formatted output
    const formatted = formatMinorUnits(minor, "USD");
    assert.strictEqual(formatted, "$1,200.00");

    // $150.50
    assert.strictEqual(parseToMinorUnits("150.50"), 15050);
    assert.strictEqual(formatMinorUnits(15050, "USD"), "$150.50");

    // Text extraction
    assert.strictEqual(
      extractBudgetFromText("under $1,500 for my workstation"),
      150000
    );
  });
});
