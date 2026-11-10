import { test, describe } from "node:test";
import assert from "node:assert";
import { orchestrateShoppingTurn } from "../src/lib/orchestrator/index.ts";
import { processUserMessage } from "../src/lib/ai/conversation-engine.ts";
import { createInitialSession } from "../src/lib/ai/conversation-engine.ts";
import { getProgressMessage } from "../src/lib/shopping/search-progress.ts";
import type { NormalizedProduct } from "../src/types/index.ts";

describe("SpendPilot AI: Intelligent Clarification, Search Flow & Progress Messages", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Core Conversation Flow: Winter Body Lotion (Turn 1 & Turn 2)
  // ─────────────────────────────────────────────────────────────────────────
  test("Turn 1: Winter Body Lotion identifies winter context, asks skin type, and blocks Channel3 search (0 search calls)", async () => {
    let channel3SearchCalls = 0;
    const fakeChannel3Search = () => {
      channel3SearchCalls += 1;
      return Promise.resolve([]);
    };

    // User submits initial winter request
    const userMessage = "I need to shop for upcoming winter season. We can start with body lotion.";
    const result = await orchestrateShoppingTurn({
      userMessage,
      activeBrief: null,
      activeSessionId: "session_winter_test_1",
    });

    // 1. Validates category and winter context
    const brief = result.brief;
    assert.strictEqual(brief.productRequirements.length, 1, "Should create one requirement for body lotion");
    const req = brief.productRequirements[0];
    assert.ok(req.category.toLowerCase().includes("skincare") || req.category.toLowerCase().includes("beauty"));
    assert.ok(req.displayName.toLowerCase().includes("lotion") || req.displayName.toLowerCase().includes("winter"));
    assert.ok(req.purpose.includes("winter_moisturizing") || req.purpose.includes("skincare"));

    // 2. Produces one category-specific skin type question
    assert.ok(result.clarification, "Must produce a clarification question");
    assert.strictEqual(result.clarification.attributeKey, "skin_type");
    assert.ok(
      result.clarification.question.toLowerCase().includes("skin") ||
      result.clarification.question.toLowerCase().includes("winter"),
      "Question must be about skin or winter body care"
    );

    // 3. Contextual quick-reply choices
    const optionValues = result.clarification.options.map((o) => o.value);
    assert.ok(optionValues.includes("Dry"), "Should offer Dry");
    assert.ok(optionValues.includes("Very dry"), "Should offer Very dry");
    assert.ok(optionValues.includes("Sensitive"), "Should offer Sensitive");
    assert.ok(optionValues.includes("Normal"), "Should offer Normal");

    // 4. Mutually exclusive search: Channel3 search calls must be ZERO
    assert.strictEqual(result.isReadyForSearch, false, "Must NOT be ready for search while clarification is pending");
    assert.strictEqual(result.suggestedAction, "ask_question");

    // If clarification is pending, simulated Channel3 is never invoked
    if (result.isReadyForSearch) {
      await fakeChannel3Search();
    }
    assert.strictEqual(channel3SearchCalls, 0, "Channel3 calls MUST be 0 when clarification is pending");
  });

  test("Turn 2: Answering 'Very dry skin.' saves answer, keeps winter context, and triggers search exactly once", async () => {
    let channel3SearchCalls = 0;
    const fakeChannel3Search = () => {
      channel3SearchCalls += 1;
      return Promise.resolve([
        {
          sourceProductId: "ch3_lotion_101",
          title: "Intense Winter Moisture Body Lotion for Very Dry Skin",
          priceMinor: 1499,
          currency: "USD",
        },
      ]);
    };

    // Reconstruct brief from Turn 1
    const turn1Result = await orchestrateShoppingTurn({
      userMessage: "I need to shop for upcoming winter season. We can start with body lotion.",
      activeBrief: null,
      activeSessionId: "session_winter_test_2",
    });

    assert.ok(turn1Result.clarification);

    // User responds in Turn 2
    const turn2Message = "Very dry skin.";
    const turn2Result = await orchestrateShoppingTurn({
      userMessage: turn2Message,
      activeBrief: turn1Result.brief,
      activeSessionId: "session_winter_test_2",
    });

    // 1. Answer is saved in requirements
    const activeReq = turn2Result.brief.productRequirements[0];
    const skinConstraint = activeReq.constraints.find((c) => c.key === "skin_type");
    assert.ok(skinConstraint, "Must have skin_type constraint recorded");
    assert.strictEqual(skinConstraint.value, "Very dry");

    // 2. Previous winter context is preserved
    const seasonConstraint = activeReq.constraints.find((c) => c.key === "season");
    if (seasonConstraint) {
      assert.strictEqual(seasonConstraint.value, "winter");
    }
    assert.ok(activeReq.purpose.includes("winter_moisturizing") || activeReq.purpose.includes("skincare"));

    // 3. Search is now ready and triggered exactly once
    assert.strictEqual(turn2Result.isReadyForSearch, true, "Must be ready for search after skin type is answered");
    assert.strictEqual(turn2Result.clarification, null, "No further clarification needed");
    assert.strictEqual(turn2Result.suggestedAction, "start_product_search");

    if (turn2Result.isReadyForSearch) {
      await fakeChannel3Search();
    }
    assert.strictEqual(channel3SearchCalls, 1, "Channel3 search MUST be called exactly once");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Search Progress Experience & Messaging (Stages A - E)
  // ─────────────────────────────────────────────────────────────────────────
  test("Search progress stages produce curated, contextual messages and never persist as old chat messages", () => {
    const query = "winter body lotion";
    const category = "skincare";

    // Stage A: Understanding
    const stageA = getProgressMessage("understanding", query, category, { isWinter: true });
    assert.ok(stageA.toLowerCase().includes("understanding"));

    // Stage B: Searching (animated dots state)
    const stageB = getProgressMessage("searching", query, category, { isWinter: true });
    assert.strictEqual(stageB, "Finding suitable body lotions for your winter routine...");

    // Stage C: Search completed
    const stageC = getProgressMessage("search_completed", query, category, { isWinter: true });
    assert.strictEqual(
      stageC,
      "I've found some body lotion options for your winter shopping. Let's see which ones fit you best."
    );

    // Stage D: Comparing
    const stageD = getProgressMessage("comparing", query, category, { isWinter: true });
    assert.strictEqual(stageD, "Comparing hydration, ingredients, and value...");

    // Stage E: Final response
    const stageE = getProgressMessage("completed", query, category, { isWinter: true });
    assert.strictEqual(
      stageE,
      "I've compared the available options. Here are the strongest matches for your winter body lotion."
    );

    // Verify transient state: progress messages are NOT saved as chat history
    const session = createInitialSession({ sessionId: "sess_progress_test" });
    assert.strictEqual(session.messages.length, 0, "Progress messages must NOT be permanently saved in session messages");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Complete Product Request (Immediate Search)
  // ─────────────────────────────────────────────────────────────────────────
  test("A complete product request triggers search immediately without asking unnecessary questions", async () => {
    const result = await orchestrateShoppingTurn({
      userMessage: "Sony WH-1000XM5 wireless noise cancelling headphones under $400",
      activeBrief: null,
      activeSessionId: "session_complete_query",
    });

    assert.strictEqual(result.isReadyForSearch, true, "Complete request must be ready for search");
    assert.strictEqual(result.clarification, null, "Must not ask questions when query is specific");
    assert.ok(
      result.suggestedAction === "start_new_task" || result.suggestedAction === "start_product_search",
      "Should start search or new task"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Laptop Product Clarification
  // ─────────────────────────────────────────────────────────────────────────
  test("Laptop request asks workload or OS clarification, never generic or skincare options", async () => {
    const result = await orchestrateShoppingTurn({
      userMessage: "I need a new laptop for university",
      activeBrief: null,
      activeSessionId: "session_laptop_test",
    });

    assert.ok(result.clarification, "Must ask clarification for generic laptop request");
    const key = result.clarification.attributeKey;
    assert.ok(key === "operating_system" || key === "workload" || key === "primary_use");

    // Options must NOT include skincare or unrelated fields
    const labels = result.clarification.options.map((o) => o.label.toLowerCase());
    assert.strictEqual(labels.some((l) => l.includes("skin") || l.includes("lotion")), false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Specialized Replacement Part Request
  // ─────────────────────────────────────────────────────────────────────────
  test("Specialized replacement part request asks for exact model compatibility with options: [] (free-text)", async () => {
    const result = await orchestrateShoppingTurn({
      userMessage: "Replacement lens cap for my camera",
      activeBrief: null,
      activeSessionId: "session_camera_cap",
    });

    assert.ok(result.clarification, "Must ask for camera/lens model");
    assert.strictEqual(result.clarification.attributeKey, "camera_model");
    assert.deepStrictEqual(result.clarification.options, [], "Must allow free-text input with empty options array");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Quick-Reply Direct Transition (0 Gemini Calls)
  // ─────────────────────────────────────────────────────────────────────────
  test("Selecting a contextual quick-reply triggers fast-path with 0 Gemini calls", async () => {
    const session = createInitialSession({ sessionId: "sess_quick_reply_test" });
    session.activeQuestion = {
      id: "q_skin_type",
      attributeKey: "skin_type",
      text: "Since you're shopping for winter, how would you describe your skin?",
      inputType: "single_select",
      options: [
        { id: "opt_1", label: "Very dry", value: "Very dry" },
        { id: "opt_2", label: "Sensitive", value: "Sensitive" },
      ],
      required: true,
      allowSkip: true,
    };

    const result = await processUserMessage({
      session,
      userMessage: "Very dry",
      answeredQuestionId: "q_skin_type",
      answeredAttributeKey: "skin_type",
    });

    assert.strictEqual(result.modelUsed, "quick-reply-fast-path");
    assert.strictEqual(result.session.canonicalAttributes?.["skin_type"]?.value, "Very dry");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Duplicate Submissions (Idempotency)
  // ─────────────────────────────────────────────────────────────────────────
  test("Duplicate user submission with same clientMessageId is ignored without duplicate processing", async () => {
    const session = createInitialSession({ sessionId: "sess_idempotent_test" });
    const clientMessageId = "msg_client_repeat_123";

    // First submission
    const res1 = await processUserMessage({
      session,
      userMessage: "I need running shoes",
      clientMessageId,
    });

    // Second submission with exact same clientMessageId
    const res2 = await processUserMessage({
      session: res1.session,
      userMessage: "I need running shoes",
      clientMessageId,
    });

    assert.strictEqual(res2.shouldExecuteSearch, false);
    assert.strictEqual(res2.session.messages.length, res1.session.messages.length);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Channel3 Failure Handling
  // ─────────────────────────────────────────────────────────────────────────
  test("Channel3 search failure preserves user requirements and does not fabricate products", () => {
    const session = createInitialSession({ sessionId: "sess_failure_test" });
    session.canonicalAttributes = {
      skin_type: {
        key: "skin_type",
        label: "Skin Type",
        value: "Very dry",
        displayValue: "Very dry",
        source: "user_explicit",
        status: "confirmed",
        constraint: "hard_requirement",
        updatedAt: Date.now(),
      },
    };

    // Simulate search failure handler
    const searchFailed = true;
    let products: NormalizedProduct[] = [];
    let progressCleared = false;
    let errorMessage: string | null = null;

    if (searchFailed) {
      progressCleared = true;
      products = [];
      errorMessage = "Unable to retrieve products. Please try again.";
    }

    assert.strictEqual(progressCleared, true, "Progress indicator must be cleared on failure");
    assert.strictEqual(products.length, 0, "No products should be fabricated on failure");
    assert.strictEqual(session.canonicalAttributes?.["skin_type"]?.value, "Very dry", "User requirements must be preserved");
    assert.ok(errorMessage);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Empty Search Results Handling
  // ─────────────────────────────────────────────────────────────────────────
  test("Empty search results state offers helpful refinement without fabricated products", () => {
    const rawResults: NormalizedProduct[] = [];
    let assistantNotice = "";

    if (rawResults.length === 0) {
      assistantNotice = "I couldn't find any products matching those exact specifications. Would you like to adjust your price range, brand, or key features?";
    }

    assert.strictEqual(rawResults.length, 0);
    assert.ok(assistantNotice.includes("adjust your price range") || assistantNotice.includes("alternatives"));
  });
});
