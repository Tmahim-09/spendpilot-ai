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
} from "../src/lib/ai/conversation-engine.ts";

import { evaluateNextQuestion } from "../src/lib/concierge/question-tracker.ts";
import { createTurnTracker } from "../src/lib/observability/call-tracker.ts";
import { resolveNaturalMessage } from "../src/lib/ai/normalize-interaction-response.ts";

import {
  createInitialWorkspace,
  addIndependentItem,
  createCoordinatedSetupGroup,
} from "../src/lib/workspace/workspace-manager.ts";

import type {
  ShoppingBrief,
} from "../src/types/index.ts";

describe("SpendPilot AI: Adaptive Questions & Contextual Quick Replies (Tests 1 - 18)", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Test 1: Headphone request generates headphone-related clarification
  // ─────────────────────────────────────────────────────────────────────────────
  test("1. Headphone request generates headphone-related clarification (over-ear / in-ear / ANC)", async () => {
    const result = await orchestrateShoppingTurn({
      userMessage: "Find me some good headphones under $150",
      activeSessionId: "sess_adapt_test_1",
    });

    assert.strictEqual(result.isReadyForSearch, false, "Should ask clarification before searching");
    assert.ok(result.clarification, "Must produce a structured Clarification object");

    // Must be headphone specific (form factor, ANC, or priority)
    const validKeys = ["form_factor", "noise_cancellation", "headphone_priority"];
    assert.ok(
      validKeys.includes(result.clarification.attributeKey),
      `Attribute key must be headphone-specific, got: ${result.clarification.attributeKey}`
    );

    // Options must be headphone choices
    assert.ok(result.clarification.options.length >= 2, "Must offer 2-4 quick reply options");
    const optionLabels = result.clarification.options.map((o) => o.label.toLowerCase());
    const hasHeadphoneOption = optionLabels.some(
      (l) => l.includes("over-ear") || l.includes("in-ear") || l.includes("anc") || l.includes("wireless")
    );
    assert.ok(hasHeadphoneOption, `Options must be headphone-related: ${JSON.stringify(optionLabels)}`);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 2: Laptop request generates laptop-related clarification
  // ─────────────────────────────────────────────────────────────────────────────
  test("2. Laptop request generates laptop-related clarification (OS / workload)", async () => {
    const result = await orchestrateShoppingTurn({
      userMessage: "I need a laptop for university under $1000",
      activeSessionId: "sess_adapt_test_2",
    });

    assert.strictEqual(result.isReadyForSearch, false, "Should ask clarification for general laptop request");
    assert.ok(result.clarification, "Must produce a clarification");

    const validLaptopKeys = ["os", "operating_system", "screen_size", "workload", "laptop_priority"];
    assert.ok(
      validLaptopKeys.includes(result.clarification.attributeKey),
      `Clarification must be laptop-specific, got: ${result.clarification.attributeKey}`
    );

    // Check options are laptop-related
    const labels = result.clarification.options.map((o) => o.label.toLowerCase());
    const isLaptopRelated = labels.some(
      (l) => l.includes("mac") || l.includes("windows") || l.includes("chrome") || l.includes("inch") || l.includes("screen")
    );
    assert.ok(isLaptopRelated, `Options must be laptop related: ${JSON.stringify(labels)}`);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 3: Furniture request generates furniture-related clarification
  // ─────────────────────────────────────────────────────────────────────────────
  test("3. Furniture request generates furniture-related clarification (chair type / room / options)", async () => {
    const result = await orchestrateShoppingTurn({
      userMessage: "I want to buy a chair for my apartment",
      activeSessionId: "sess_adapt_test_3",
    });

    assert.strictEqual(result.isReadyForSearch, false, "Should clarify chair type");
    assert.ok(result.clarification, "Must produce a clarification");

    assert.strictEqual(result.clarification.attributeKey, "chair_type");
    const labels = result.clarification.options.map((o) => o.label);
    assert.ok(labels.includes("Office chair"), "Must include Office chair");
    assert.ok(labels.includes("Dining chair"), "Must include Dining chair");
    assert.ok(labels.includes("Lounge chair"), "Must include Lounge chair");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 4: Specialized replacement part asks for exact model with options: []
  // ─────────────────────────────────────────────────────────────────────────────
  test("4. Specialized replacement part asks for exact model with options: [] (free-text)", async () => {
    const result = await orchestrateShoppingTurn({
      userMessage: "I need a replacement battery for my Sony camera",
      activeSessionId: "sess_adapt_test_4",
    });

    assert.strictEqual(result.isReadyForSearch, false, "Should ask for camera model before searching");
    assert.ok(result.clarification, "Must produce clarification");
    assert.strictEqual(result.clarification.attributeKey, "camera_model");

    // Crucial requirement: free-text input must have empty options array
    assert.deepStrictEqual(
      result.clarification.options,
      [],
      "Must provide options: [] for free-text model input so user can type exact model"
    );
    assert.ok(
      result.clarification.question.toLowerCase().includes("model"),
      "Question must ask for specific model number"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 5: Skincare requests do not receive laptop or electronics options
  // ─────────────────────────────────────────────────────────────────────────────
  test("5. Skincare requests do not receive laptop or electronics options", async () => {
    const result = await orchestrateShoppingTurn({
      userMessage: "I need a gentle moisturizer for sensitive skin under $30",
      activeSessionId: "sess_adapt_test_5",
    });

    assert.ok(result.clarification, "Must produce a clarification");
    assert.strictEqual(result.clarification.attributeKey, "skin_type_finish");

    const optionLabels = result.clarification.options.map((o) => o.label.toLowerCase());
    const electronicsKeywords = ["windows", "mac", "ram", "over-ear", "in-ear", "bluetooth", "hdmi", "monitor"];
    for (const kw of electronicsKeywords) {
      assert.strictEqual(
        optionLabels.some((l) => l.includes(kw)),
        false,
        `Skincare options must NOT contain electronics term '${kw}'`
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 6: A complete product request searches without unnecessary questions
  // ─────────────────────────────────────────────────────────────────────────────
  test("6. A complete product request searches without unnecessary questions (isReadyForSearch: true, nextQuestion: null)", async () => {
    const result = await orchestrateShoppingTurn({
      userMessage: "Sony WH-1000XM5 wireless over-ear noise-cancelling headphones under $400",
      activeSessionId: "sess_adapt_test_6",
    });

    assert.strictEqual(result.isReadyForSearch, true, "Fully specified product must be search ready");
    assert.strictEqual(result.question, null, "Must not ask questions when product is fully specified");
    assert.strictEqual(result.clarification, null, "Clarification must be null when ready for search");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 7: Quick replies match their exact question
  // ─────────────────────────────────────────────────────────────────────────────
  test("7. Quick replies match their exact question", async () => {
    const result = await orchestrateShoppingTurn({
      userMessage: "I'm looking for running shoes under $120",
      activeSessionId: "sess_adapt_test_7",
    });

    assert.ok(result.clarification, "Must return clarification for running shoes");
    const clarification = result.clarification;

    // Verify schema shape
    assert.ok(typeof clarification.questionId === "string" && clarification.questionId.length > 0);
    assert.ok(typeof clarification.attributeKey === "string" && clarification.attributeKey.length > 0);
    assert.ok(typeof clarification.question === "string" && clarification.question.length > 0);

    // Verify 2-4 contextual options
    assert.ok(clarification.options.length >= 2 && clarification.options.length <= 4);
    for (const opt of clarification.options) {
      assert.ok(typeof opt.label === "string" && opt.label.trim().length > 0);
      assert.ok(typeof opt.value === "string" && opt.value.trim().length > 0);
      assert.ok(opt.label.length <= 40, `Option label '${opt.label}' must be concise (<= 40 chars)`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 8: Custom text answers work even when options are shown
  // ─────────────────────────────────────────────────────────────────────────────
  test("8. Custom text answers work even when options are shown", async () => {
    // Turn 1: Initial query
    const turn1 = await orchestrateShoppingTurn({
      userMessage: "I need running shoes under $120",
      activeSessionId: "sess_adapt_test_8",
    });
    assert.strictEqual(turn1.isReadyForSearch, false);
    assert.ok(turn1.clarification);

    // Turn 2: User responds with custom typed text not in the suggested options
    const turn2 = await orchestrateShoppingTurn({
      userMessage: "I run on wet forest trails and need aggressive grip and waterproofing",
      activeBrief: turn1.brief,
      activeSessionId: "sess_adapt_test_8",
      answeredQuestionId: "q_cushioning",
    });

    const activeReq = turn2.brief.productRequirements[0];
    assert.ok(activeReq, "Must have active requirement");
    const hasGripOrCustomPref = activeReq.constraints.some(
      (c) =>
        String(c.value).toLowerCase().includes("trail") ||
        String(c.value).toLowerCase().includes("grip") ||
        String(c.value).toLowerCase().includes("waterproof") ||
        c.key === "preference"
    );
    assert.ok(hasGripOrCustomPref, "Must capture user's custom typed response into constraints");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 9: No options shown when discrete choices are unsuitable (options: [])
  // ─────────────────────────────────────────────────────────────────────────────
  test("9. No options shown when discrete choices are unsuitable (options: [])", () => {
    const brief: ShoppingBrief = {
      schemaVersion: 1,
      taskId: "task_adapt_test_9",
      mode: "single_product",
      userGoal: "Find a replacement camera lens cap",
      budget: { maximum: { amountMinor: 2500, currency: "USD" } },
      productRequirements: [
        {
          id: "req_cap_1",
          category: "electronics",
          displayName: "Camera Lens Cap",
          searchQuery: "camera lens cap",
          quantity: 1,
          purpose: ["photography"],
          constraints: [],
          excludedAttributes: [],
        },
      ],
      missingInformation: [],
      status: "collecting",
      updatedAt: new Date().toISOString(),
    };

    const nextQ = evaluateNextQuestion({
      brief,
      userMessage: "Find a replacement camera lens cap",
    });
    if (nextQ.nextQuestion) {
      assert.deepStrictEqual(
        nextQ.nextQuestion.options,
        [],
        "Open-ended model/size question must produce empty options: [] array"
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 10: Previously answered questions are never repeated
  // ─────────────────────────────────────────────────────────────────────────────
  test("10. Previously answered questions are never repeated", async () => {
    // Turn 1: User asks for headphones with over-ear specified
    const turn1 = await orchestrateShoppingTurn({
      userMessage: "I need over-ear wireless headphones under $200",
      activeSessionId: "sess_adapt_test_10",
    });

    // Form factor was already provided ("over-ear"), so turn 1 should NOT ask form factor
    if (turn1.clarification) {
      assert.notStrictEqual(
        turn1.clarification.attributeKey,
        "form_factor",
        "Must NOT ask form factor when already specified in user prompt"
      );
      assert.ok(
        turn1.clarification.attributeKey === "noise_cancellation" ||
        turn1.clarification.attributeKey === "headphone_priority"
      );
    }

    // Turn 2: User answers ANC question
    const turn2 = await orchestrateShoppingTurn({
      userMessage: "Active Noise Cancellation (ANC)",
      activeBrief: turn1.brief,
      activeSessionId: "sess_adapt_test_10",
      answeredQuestionId: "q_noise_cancellation",
    });

    if (turn2.clarification) {
      assert.notStrictEqual(turn2.clarification.attributeKey, "form_factor");
      assert.notStrictEqual(turn2.clarification.attributeKey, "noise_cancellation");
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 11: Only one clarification question is generated per response
  // ─────────────────────────────────────────────────────────────────────────────
  test("11. Only one clarification question is generated per response", async () => {
    const result = await orchestrateShoppingTurn({
      userMessage: "I need a coffee maker",
      activeSessionId: "sess_adapt_test_11",
    });

    assert.ok(result.clarification, "Must have clarification");
    // Clarification is a single object, not an array of questions
    assert.strictEqual(typeof result.clarification.question, "string");
    // Question should contain at most 1 question mark
    const qMarks = (result.clarification.question.match(/\?/g) || []).length;
    assert.ok(qMarks <= 1, "Must ask at most one single question per turn");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 12: Known quick replies do not trigger Gemini (0 calls)
  // ─────────────────────────────────────────────────────────────────────────────
  test("12. Known quick replies do not trigger Gemini (0 calls)", async () => {
    const session = createInitialSession({ sessionId: "sess_adapt_test_12" });
    const tracker = createTurnTracker("client_msg_12", session.revision);

    // Initial message
    await processUserMessage({
      session,
      userMessage: "I need running shoes under $100",
    });

    const callsAfterTurn1 = tracker.getMetrics().geminiCalls;

    // Turn 2: User clicks known quick reply "Road Running"
    await processUserMessage({
      session,
      userMessage: "Road Running",
    });

    const callsAfterTurn2 = tracker.getMetrics().geminiCalls;
    // Rule 7B: Known quick-reply answer must not trigger additional Gemini calls
    assert.strictEqual(
      callsAfterTurn2 - callsAfterTurn1,
      0,
      "Selecting a known quick-reply option must execute with 0 Gemini calls"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 13: Channel3 is not called merely to generate clarification questions
  // ─────────────────────────────────────────────────────────────────────────────
  test("13. Channel3 is not called merely to generate clarification questions", async () => {
    const session = createInitialSession({ sessionId: "sess_adapt_test_13" });
    const tracker = createTurnTracker("client_msg_13", session.revision);

    const orchestratorResult = await orchestrateShoppingTurn({
      userMessage: "I'm looking for a monitor",
      activeSessionId: session.sessionId,
    });

    const turnResult = await processUserMessage({
      session,
      userMessage: "I'm looking for a monitor",
      precomputedOrchestration: orchestratorResult,
    });

    // Clarification turn -> must NOT execute search
    assert.strictEqual(turnResult.shouldExecuteSearch, false, "Must not be ready for search while clarifying");
    assert.strictEqual(turnResult.session.canSearch, false, "Session canSearch must be false");
    assert.strictEqual(tracker.getMetrics().channel3SearchCalls, 0, "Channel3 must not be called during clarification");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 14: Channel3 receives the important collected product requirements
  // ─────────────────────────────────────────────────────────────────────────────
  test("14. Channel3 receives the important collected product requirements", async () => {
    const turn1 = await orchestrateShoppingTurn({
      userMessage: "Sony WH-1000XM5 wireless over-ear noise-cancelling headphones under $400",
      activeSessionId: "sess_adapt_test_14",
    });

    assert.strictEqual(turn1.isReadyForSearch, true);
    const searchRequests = buildChannel3SearchRequests(turn1.brief);
    assert.ok(searchRequests.length > 0, "Must build Channel3 search requests");

    const req = searchRequests[0];
    const query = req.searchQuery.toLowerCase();
    assert.ok(query.includes("sony") || query.includes("wh-1000xm5"), "Must include brand/model");
    assert.strictEqual(req.maxPriceMinor, 40000, "Must preserve budget ($400 = 40000 minor units)");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 15: Multiple independent shopping items preserve separate requirements
  // ─────────────────────────────────────────────────────────────────────────────
  test("15. Multiple independent shopping items preserve separate requirements", () => {
    let workspace = createInitialWorkspace();

    // Add first item: running shoes
    workspace = addIndependentItem(workspace, {
      productRequest: "Trail running shoes under $120",
      category: "shoes",
      hardConstraints: { terrain: "trail", cushioning: "maximum" },
    });

    // Add second item: wireless mouse
    workspace = addIndependentItem(workspace, {
      productRequest: "Ergonomic wireless mouse under $80",
      category: "electronics",
      hardConstraints: { connectivity: "wireless", sensor: "optical" },
    });

    const items = workspace.groups[0].items;
    const shoeItem = items[0];
    const mouseItem = items[1];

    // Verify isolation: shoe constraints are not in mouse and vice-versa
    assert.strictEqual(mouseItem.hardConstraints["terrain"], undefined);
    assert.strictEqual(mouseItem.hardConstraints["cushioning"], undefined);
    assert.strictEqual(shoeItem.hardConstraints["connectivity"], undefined);
    assert.strictEqual(shoeItem.hardConstraints["sensor"], undefined);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 16: Coordinated setup questions remain relevant to the active component
  // ─────────────────────────────────────────────────────────────────────────────
  test("16. Coordinated setup questions remain relevant to the active component", () => {
    let workspace = createInitialWorkspace();
    workspace = createCoordinatedSetupGroup(workspace, {
      title: "Gaming Setup under $2,500",
      items: [
        { productRequest: "Gaming PC desktop with RTX 4070", category: "computer", priority: "essential" },
        { productRequest: "144Hz 27-inch gaming monitor", category: "monitor", priority: "essential" },
        { productRequest: "Mechanical gaming keyboard", category: "keyboard", priority: "preferred" },
      ],
      sharedBudget: { amountMinor: 250000, currency: "USD", strict: false },
    });

    const group = workspace.groups[0];
    const monitorItem = group.items[1];
    workspace.activeItemId = monitorItem.id;

    // Focused on monitor: check question is relevant to monitor, not PC or keyboard
    const brief: ShoppingBrief = {
      schemaVersion: 1,
      taskId: "task_adapt_test_16",
      mode: "multi_product",
      userGoal: "144Hz 27-inch gaming monitor",
      budget: { maximum: { amountMinor: 40000, currency: "USD" } },
      productRequirements: [
        {
          id: monitorItem.id,
          category: "monitor",
          displayName: "Gaming Monitor",
          searchQuery: "gaming monitor",
          quantity: 1,
          purpose: ["gaming"],
          constraints: [],
          excludedAttributes: [],
        },
      ],
      missingInformation: [],
      status: "collecting",
      updatedAt: new Date().toISOString(),
    };

    const nextQ = evaluateNextQuestion({
      brief,
      userMessage: "144Hz 27-inch gaming monitor",
    });
    if (nextQ.nextQuestion) {
      assert.ok(
        nextQ.nextQuestion.text.toLowerCase().includes("monitor") ||
        nextQ.nextQuestion.text.toLowerCase().includes("display") ||
        nextQ.nextQuestion.text.toLowerCase().includes("screen") ||
        nextQ.nextQuestion.text.toLowerCase().includes("refresh") ||
        nextQ.nextQuestion.attributeKey.includes("monitor") ||
        nextQ.nextQuestion.attributeKey.includes("display"),
        `Setup question must be relevant to the active monitor component, got: ${nextQ.nextQuestion.text}`
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 17: Malformed Gemini output does not leak JSON into chat (resolveNaturalMessage)
  // ─────────────────────────────────────────────────────────────────────────────
  test("17. Malformed Gemini output does not leak JSON into chat (resolveNaturalMessage)", () => {
    const rawJsonPayload = JSON.stringify({
      action: "ask_question",
      assistantMessage: "What screen size do you prefer for your laptop?",
      patches: [],
      suggestedReplies: ["13-inch", "15-inch"],
    });

    const parsed = resolveNaturalMessage(rawJsonPayload, "Fallback message");
    assert.strictEqual(
      parsed,
      "What screen size do you prefer for your laptop?",
      "Must extract assistantMessage from raw JSON payload"
    );
    assert.strictEqual(parsed.includes("{"), false, "Must not contain JSON brace {");
    assert.strictEqual(parsed.includes("}"), false, "Must not contain JSON brace }");
    assert.strictEqual(parsed.includes("action"), false, "Must not contain raw schema keys");

    // Test with markdown code block formatting
    const rawCodeBlock = "```json\n" + rawJsonPayload + "\n```";
    const parsedBlock = resolveNaturalMessage(rawCodeBlock, "Fallback message");
    assert.strictEqual(
      parsedBlock,
      "What screen size do you prefer for your laptop?",
      "Must extract from markdown code fences"
    );
    assert.strictEqual(parsedBlock.includes("```"), false, "Must strip markdown code fences");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 18: Gemini failures do not trigger unrelated hardcoded questions
  // ─────────────────────────────────────────────────────────────────────────────
  test("18. Gemini failures do not trigger unrelated hardcoded questions", () => {
    // When Gemini throws or is unavailable, extractDeterministicPatches is used as fallback
    const emptyBrief: ShoppingBrief = {
      schemaVersion: 1,
      taskId: "task_adapt_test_18",
      mode: "single_product",
      userGoal: "",
      productRequirements: [],
      missingInformation: [],
      status: "collecting",
      updatedAt: new Date().toISOString(),
    };

    // Case A: Headphone query produces headphone questions, never chair/shoe questions
    const hpFallback = extractDeterministicPatches("I want wireless headphones under $100", emptyBrief);
    assert.ok(hpFallback.clarification);
    assert.ok(
      hpFallback.clarification.attributeKey === "form_factor" ||
      hpFallback.clarification.attributeKey === "noise_cancellation"
    );

    // Case B: Camera battery produces exact model question with options: []
    const camFallback = extractDeterministicPatches("Replacement battery for Nikon camera", emptyBrief);
    assert.ok(camFallback.clarification);
    assert.strictEqual(camFallback.clarification.attributeKey, "camera_model");
    assert.deepStrictEqual(camFallback.clarification.options, []);

    // Case C: Skincare query never produces electronics options
    const skinFallback = extractDeterministicPatches("Cleanser for dry skin under $20", emptyBrief);
    assert.ok(skinFallback.clarification);
    const skinLabels = skinFallback.clarification.options.map((o) => o.label.toLowerCase());
    assert.strictEqual(skinLabels.some((l) => l.includes("windows") || l.includes("ram")), false);
  });
});
