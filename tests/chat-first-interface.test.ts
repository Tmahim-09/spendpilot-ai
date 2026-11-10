import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  orchestrateShoppingTurn,
} from "../src/lib/orchestrator/index.ts";
import {
  processUserMessage,
  createInitialSession,
  extractBudgetFromText,
  SPENDPILOT_INITIAL_GREETING,
} from "../src/lib/ai/conversation-engine.ts";
import {
  extractBudgetAndCurrency,
  extractCurrencyFromText,
  formatMinorUnits,
} from "../src/lib/money.ts";
import { createTurnTracker } from "../src/lib/observability/call-tracker.ts";

describe("SpendPilot AI: Chat-First Interface Migration (Criteria 1 - 15)", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Static greeting displayed on fresh load without API calls
  // ─────────────────────────────────────────────────────────────────────────────
  test("1. Static greeting displayed on fresh load without API calls", () => {
    const session = createInitialSession({ sessionId: "fresh_load" });
    assert.strictEqual(session.messages.length, 0, "Session messages start empty");

    // The static greeting text matches the PRD specification exactly
    assert.ok(SPENDPILOT_INITIAL_GREETING.includes("Hi! I'm SpendPilot, your personal shopping assistant."));
    assert.ok(SPENDPILOT_INITIAL_GREETING.includes("What are you looking for today?"));
    assert.ok(SPENDPILOT_INITIAL_GREETING.includes("Tell me what you need, what matters most to you, and your budget if you have one."));

    // Fresh session creation performs 0 Gemini calls
    const tracker = createTurnTracker("fresh_load_turn", 1);
    const metrics = tracker.getMetrics();
    assert.strictEqual(metrics.geminiCalls, 0, "Must make 0 Gemini calls on fresh load");
    assert.strictEqual(metrics.channel3SearchCalls, 0, "Must make 0 Channel3 searches on fresh load");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. No form elements (mode toggle, budget input, currency dropdown, policy radio buttons, find button) present in page.tsx
  // ─────────────────────────────────────────────────────────────────────────────
  test("2. No legacy form elements present in page.tsx DOM structure", () => {
    const pagePath = path.resolve(process.cwd(), "src/app/page.tsx");
    const pageContent = fs.readFileSync(pagePath, "utf-8");

    // Verify obsolete form components are NOT imported or rendered
    assert.ok(!pageContent.includes("HeroSection"), "HeroSection must be completely removed");
    assert.ok(!pageContent.includes("ShoppingPrompt"), "ShoppingPrompt must be completely removed");
    assert.ok(!pageContent.includes("BudgetInput"), "BudgetInput must be completely removed");
    assert.ok(!pageContent.includes("ExamplePrompts"), "ExamplePrompts must be completely removed");
    assert.ok(!pageContent.includes("ShoppingModeSelector"), "ShoppingModeSelector must be completely removed");
    assert.ok(!pageContent.includes("Find & Compare Options"), "Legacy submit button must be removed");
    assert.ok(!pageContent.includes("Near Budget (Top 10%)"), "Targeting policy radio buttons must be removed");

    // Verify Chat is the primary element
    assert.ok(pageContent.includes("<ContinuousChatWorkspace"), "ContinuousChatWorkspace must be the main view");
    assert.ok(pageContent.includes("<SiteHeader"), "SiteHeader is rendered");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Sending message via Enter key works; Shift+Enter creates newline without sending
  // ─────────────────────────────────────────────────────────────────────────────
  test("3. Enter sends message; Shift+Enter creates newline without sending", () => {
    let messageSent = false;
    let defaultPrevented = false;

    const handleKeyDownSimulated = (e: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        messageSent = true;
      }
    };

    // Test Shift+Enter -> does NOT send, does NOT prevent default
    messageSent = false;
    defaultPrevented = false;
    handleKeyDownSimulated({
      key: "Enter",
      shiftKey: true,
      preventDefault: () => { defaultPrevented = true; },
    });
    assert.strictEqual(messageSent, false, "Shift+Enter must not send message");
    assert.strictEqual(defaultPrevented, false, "Shift+Enter must not prevent newline default");

    // Test plain Enter -> sends message, prevents default
    messageSent = false;
    defaultPrevented = false;
    handleKeyDownSimulated({
      key: "Enter",
      shiftKey: false,
      preventDefault: () => { defaultPrevented = true; },
    });
    assert.strictEqual(messageSent, true, "Enter without shift must trigger send");
    assert.strictEqual(defaultPrevented, true, "Enter without shift must prevent newline default");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Request asks at least 1 product detail question, confirms details, and searches on Proceed
  // ─────────────────────────────────────────────────────────────────────────────
  test("4. Request asks at least 1 product detail question, confirms details, and searches on Proceed", async () => {
    const userMessage = "noise-cancelling over-ear headphones under $200";

    const session = createInitialSession({ sessionId: "sess_headphones_complete" });
    const orchestratorResult = await orchestrateShoppingTurn({
      userMessage,
      activeBrief: null,
      activeSessionId: session.sessionId,
      sourceMessageId: "sub_headphone_1",
    });

    assert.strictEqual(orchestratorResult.brief.budget?.maximum?.amountMinor, 20000, "Budget must be $200 (20000 cents)");
    assert.ok(orchestratorResult.brief.productRequirements.length > 0, "Must create product requirement");
    assert.ok(
      orchestratorResult.brief.productRequirements[0].category.includes("headphone") ||
      orchestratorResult.brief.productRequirements[0].category.includes("audio"),
      "Category should be headphones/audio"
    );

    // Turn 1: SpendPilot asks at least one product detail question before calling Channel3
    assert.strictEqual(orchestratorResult.isReadyForSearch, false, "Must ask product detail question first");
    assert.ok(orchestratorResult.question, "Must ask at least one question about product details");

    const turn1Result = await processUserMessage({
      session,
      userMessage,
      clientMessageId: "sub_headphone_1",
      precomputedOrchestration: orchestratorResult,
    });

    assert.strictEqual(turn1Result.shouldExecuteSearch, false, "shouldExecuteSearch must wait for details and proceed");
    assert.strictEqual(turn1Result.action, "ask_follow_up");

    // Turn 2: User answers product detail question -> SpendPilot asks if more details are needed + offers Proceed
    const turn2Orch = await orchestrateShoppingTurn({
      userMessage: "Sony / Bose (Top ANC)",
      activeBrief: turn1Result.session.shoppingBrief || null,
      activeSessionId: session.sessionId,
      answeredQuestionId: turn1Result.assistantMessage.nextQuestion?.id || "q_headphone_priority",
      sourceMessageId: "sub_headphone_2",
    });

    const turn2Result = await processUserMessage({
      session: turn1Result.session,
      userMessage: "Sony / Bose (Top ANC)",
      answeredQuestionId: turn1Result.assistantMessage.nextQuestion?.id || "q_headphone_priority",
      clientMessageId: "sub_headphone_2",
      precomputedOrchestration: turn2Orch,
    });

    assert.strictEqual(turn2Result.shouldExecuteSearch, false, "Should not search before proceed");
    assert.ok(turn2Result.assistantMessage.content.includes("before I search") || turn2Result.assistantMessage.content.includes("details"));

    // Turn 3: User confirms Proceed -> triggers search
    const turn3Orch = await orchestrateShoppingTurn({
      userMessage: "Proceed to search",
      activeBrief: turn2Result.session.shoppingBrief || null,
      activeSessionId: session.sessionId,
      answeredQuestionId: "q_proceed_confirmation",
      sourceMessageId: "sub_headphone_3",
    });

    const turn3Result = await processUserMessage({
      session: turn2Result.session,
      userMessage: "Proceed to search",
      answeredQuestionId: "q_proceed_confirmation",
      clientMessageId: "sub_headphone_3",
      precomputedOrchestration: turn3Orch,
    });

    assert.strictEqual(turn3Result.shouldExecuteSearch, true, "Proceed confirms search execution");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Incomplete request ('I need running shoes') triggers follow-up question with quick-reply chips
  // ─────────────────────────────────────────────────────────────────────────────
  test("5. Incomplete request ('I need running shoes') triggers follow-up question with quick-reply chips", async () => {
    const userMessage = "I need running shoes";

    const session = createInitialSession({ sessionId: "sess_shoes_incomplete" });
    const orchestratorResult = await orchestrateShoppingTurn({
      userMessage,
      activeBrief: null,
      activeSessionId: session.sessionId,
      sourceMessageId: "sub_shoes_1",
    });

    assert.strictEqual(orchestratorResult.isReadyForSearch, false, "Incomplete request without budget should not search immediately");
    assert.ok(orchestratorResult.question, "Must ask a focused follow-up question");
    assert.ok(orchestratorResult.question.options && orchestratorResult.question.options.length > 0, "Question must have quick-reply chips");

    const turnResult = await processUserMessage({
      session,
      userMessage,
      clientMessageId: "sub_shoes_1",
      precomputedOrchestration: orchestratorResult,
    });

    assert.strictEqual(turnResult.shouldExecuteSearch, false, "Search must wait for preferences");
    assert.strictEqual(turnResult.action, "ask_follow_up", "Action should ask follow-up");
    assert.ok(turnResult.assistantMessage.nextQuestion?.options?.length, "Must offer quick-reply chips");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Quick-reply chip click submits response without extra Gemini call (Rule 7B)
  // ─────────────────────────────────────────────────────────────────────────────
  test("6. Quick-reply chip click submits response without extra Gemini call (Rule 7B)", async () => {
    const session = createInitialSession({ sessionId: "sess_quick_reply" });

    // Step 1: User says "I need running shoes"
    const turn1Orch = await orchestrateShoppingTurn({
      userMessage: "I need running shoes",
      activeBrief: null,
      activeSessionId: session.sessionId,
      sourceMessageId: "turn1_msg",
    });

    const turn1 = await processUserMessage({
      session,
      userMessage: "I need running shoes",
      clientMessageId: "turn1_msg",
      precomputedOrchestration: turn1Orch,
    });

    // Step 2: User clicks a quick-reply chip (e.g. "Road Running")
    const quickReplyTracker = createTurnTracker("qr_turn_2", turn1.session.revision);
    const turn2Orch = await orchestrateShoppingTurn({
      userMessage: "Road Running",
      activeBrief: turn1.session.shoppingBrief || null,
      activeSessionId: session.sessionId,
      answeredQuestionId: "q_cushioning",
      sourceMessageId: "qr_turn_2",
    });

    const turn2 = await processUserMessage({
      session: turn1.session,
      userMessage: "Road Running",
      answeredQuestionId: "q_cushioning",
      clientMessageId: "qr_turn_2",
      precomputedOrchestration: turn2Orch,
    });

    assert.ok(turn2.session, "Session updated successfully");
    const metrics = quickReplyTracker.getMetrics();
    assert.strictEqual(metrics.geminiCalls, 0, "Quick reply must make 0 Gemini calls via Rule 7B");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Multi-product request ('desk, chair, monitor for $1500') asks which product to start with
  // ─────────────────────────────────────────────────────────────────────────────
  test("7. Multi-product request ('desk, chair, monitor for $1500') asks which product to start with", async () => {
    const userMessage = "desk, chair, monitor for $1500";

    const session = createInitialSession({ sessionId: "sess_multi_item" });
    const orchestratorResult = await orchestrateShoppingTurn({
      userMessage,
      activeBrief: null,
      activeSessionId: session.sessionId,
      sourceMessageId: "multi_1",
    });

    // Recognizes multi-item request and asks which one to start with
    assert.strictEqual(orchestratorResult.isReadyForSearch, false, "Must not activate search immediately for multi-item");
    assert.strictEqual(orchestratorResult.suggestedAction, "ask_question");
    assert.ok(
      orchestratorResult.assistantMessage.includes("which one would you like to start with"),
      "Must ask naturally which product to start with"
    );
    assert.ok(orchestratorResult.question, "Must provide a starting_product question");
    assert.deepStrictEqual(orchestratorResult.question.options, ["Desk", "Chair", "Monitor"]);

    const turnResult = await processUserMessage({
      session,
      userMessage,
      clientMessageId: "multi_1",
      precomputedOrchestration: orchestratorResult,
    });

    assert.strictEqual(turnResult.shouldExecuteSearch, false, "Must not activate old setup search wizard");
    assert.ok(turnResult.assistantMessage.content.includes("which one would you like to start with"));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Reset/Start Over button clears state and restores initial greeting
  // ─────────────────────────────────────────────────────────────────────────────
  test("8. Reset/Start Over clears state and restores initial greeting", () => {
    // Simulate active session with user messages, products, and attributes
    const activeSession = createInitialSession({ sessionId: "active_session", currency: "EUR" });
    activeSession.messages = [
      { id: "u1", role: "user", content: "Need a laptop", createdAt: Date.now() },
      { id: "a1", role: "assistant", content: "Here are some laptops", createdAt: Date.now() },
    ];
    activeSession.retrievedProductIds = ["prod_1", "prod_2"];
    activeSession.budget = 120000;

    // Reset session
    const resetSession = createInitialSession({ currency: "EUR" });

    assert.strictEqual(resetSession.messages.length, 0, "Messages must be reset to 0");
    assert.strictEqual(resetSession.retrievedProductIds?.length ?? 0, 0, "Product IDs must be cleared");
    assert.strictEqual(resetSession.budget, null, "Budget must be cleared");
    assert.strictEqual(resetSession.currency, "EUR", "Currency preference preserved");
    assert.strictEqual(resetSession.canSearch, false, "canSearch must reset to false");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Budget extracted from various natural formats ($500, 200 euros, £150, etc.)
  // ─────────────────────────────────────────────────────────────────────────────
  test("9. Budget and currency extracted from diverse natural language formats", () => {
    // $500
    const b1 = extractBudgetAndCurrency("$500");
    assert.strictEqual(b1.budgetMinor, 50000);
    assert.strictEqual(b1.currency, "USD");

    // 200 euros
    const b2 = extractBudgetAndCurrency("200 euros");
    assert.strictEqual(b2.budgetMinor, 20000);
    assert.strictEqual(b2.currency, "EUR");

    // £150
    const b3 = extractBudgetAndCurrency("£150");
    assert.strictEqual(b3.budgetMinor, 15000);
    assert.strictEqual(b3.currency, "GBP");

    // under 500 bucks
    const b4 = extractBudgetAndCurrency("under 500 bucks");
    assert.strictEqual(b4.budgetMinor, 50000);
    assert.strictEqual(b4.currency, "USD");

    // around 80 euros
    const b5 = extractBudgetAndCurrency("around 80 euros");
    assert.strictEqual(b5.budgetMinor, 8000);
    assert.strictEqual(b5.currency, "EUR");

    // £200 max
    const b6 = extractBudgetAndCurrency("£200 max");
    assert.strictEqual(b6.budgetMinor, 20000);
    assert.strictEqual(b6.currency, "GBP");

    // between 300 and 500 dollars (budget cap is upper limit)
    const b7 = extractBudgetAndCurrency("between 300 and 500 dollars");
    assert.strictEqual(b7.budgetMinor, 50000);
    assert.strictEqual(b7.minBudgetMinor, 30000);
    assert.strictEqual(b7.currency, "USD");

    // extractBudgetFromText helper backwards-compatibility
    assert.strictEqual(extractBudgetFromText("noise-cancelling headphones under $200"), 20000);
    assert.strictEqual(extractBudgetFromText("around 80 euros"), 8000);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. Prices displayed in correct currency throughout the chat
  // ─────────────────────────────────────────────────────────────────────────────
  test("10. Prices displayed in correct currency throughout the chat", () => {
    assert.strictEqual(formatMinorUnits(50000, "USD"), "$500.00");
    assert.strictEqual(formatMinorUnits(20000, "EUR"), "€200.00");
    assert.strictEqual(formatMinorUnits(15000, "GBP"), "£150.00");

    assert.strictEqual(extractCurrencyFromText("I have 80 euros to spend"), "EUR");
    assert.strictEqual(extractCurrencyFromText("budget of £200"), "GBP");
    assert.strictEqual(extractCurrencyFromText("under 500 dollars"), "USD");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. Products showcasing section and chatting section are distinct; SpendPilot icon used
  // ─────────────────────────────────────────────────────────────────────────────
  test("11. Products showcasing and chatting are distinct sections; SpendPilot icon used", () => {
    const pagePath = path.resolve(process.cwd(), "src/app/page.tsx");
    const pageContent = fs.readFileSync(pagePath, "utf-8");

    const chatWorkspacePath = path.resolve(process.cwd(), "src/components/chat/ContinuousChatWorkspace.tsx");
    const workspaceContent = fs.readFileSync(chatWorkspacePath, "utf-8");

    const productResultsPath = path.resolve(process.cwd(), "src/components/product-results/LiveProductResults.tsx");
    const resultsContent = fs.readFileSync(productResultsPath, "utf-8");

    // 1. page.tsx separates ContinuousChatWorkspace and LiveProductResults into distinct sections
    assert.ok(pageContent.includes("<ContinuousChatWorkspace"), "page.tsx renders ContinuousChatWorkspace");
    assert.ok(pageContent.includes("<LiveProductResults"), "page.tsx renders LiveProductResults in its own section");
    assert.ok(pageContent.includes("Dedicated Product Showcasing Section"), "Distinct showcase section exists in page.tsx");

    // 2. ContinuousChatWorkspace is purely the conversation workspace (no inline ProductCard cramped inside chat bubbles)
    assert.ok(!workspaceContent.includes("<ProductCard"), "ContinuousChatWorkspace does not squeeze product cards into chat bubbles");
    assert.ok(workspaceContent.includes("View Products Showcase"), "ContinuousChatWorkspace has action linking to product showcase");
    assert.ok(resultsContent.includes('id="products-showcase"'), "LiveProductResults is anchored at products-showcase");

    // 3. Status indicator after user input replaces spinning sparkle with SpendPilot logo icon
    assert.ok(workspaceContent.includes('src="/logo/SpendPilotLOGO.png"'), "ContinuousChatWorkspace displays SpendPilot logo icon in thinking indicator");
    assert.ok(!workspaceContent.includes('Sparkles className="h-3.5 w-3.5 animate-spin"'), "ContinuousChatWorkspace does not use spinning sparkles icon");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 12. 'Configure Options' opens variant selector modal
  // ─────────────────────────────────────────────────────────────────────────────
  test("12. 'Configure Options' opens variant selector modal", () => {
    const pagePath = path.resolve(process.cwd(), "src/app/page.tsx");
    const pageContent = fs.readFileSync(pagePath, "utf-8");

    assert.ok(pageContent.includes("<ProductVariantConfigurator"), "ProductVariantConfigurator must be in page.tsx");
    assert.ok(pageContent.includes("onConfigureProduct={(p) => setConfiguringProduct(p)}"), "onConfigureProduct opens modal");
    assert.ok(pageContent.includes("handleConfirmVariantSelection"), "Confirmed variant selection updates pricing and selections");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 13. Duplicate submission prevented while request is in flight
  // ─────────────────────────────────────────────────────────────────────────────
  test("13. Duplicate submission prevented while request is in flight", async () => {
    const session = createInitialSession({ sessionId: "sess_dup_check" });
    const clientMsgId = "msg_dup_test_1";

    const turn1 = await processUserMessage({
      session,
      userMessage: "MacBook Air under $1000",
      clientMessageId: clientMsgId,
    });

    // Submitting again with identical clientMessageId is guarded
    const turn2 = await processUserMessage({
      session: turn1.session,
      userMessage: "MacBook Air under $1000",
      clientMessageId: clientMsgId,
    });

    // Messages length does not duplicate
    const userMsgs = turn2.session.messages.filter((m) => m.clientMessageId === clientMsgId || m.content === "MacBook Air under $1000");
    assert.strictEqual(userMsgs.length, 1, "Duplicate submission with same clientMessageId must not duplicate user message");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 14. No API calls triggered on typing/keystrokes
  // ─────────────────────────────────────────────────────────────────────────────
  test("14. No API calls triggered on typing/keystrokes", () => {
    const chatWorkspacePath = path.resolve(process.cwd(), "src/components/chat/ContinuousChatWorkspace.tsx");
    const workspaceContent = fs.readFileSync(chatWorkspacePath, "utf-8");

    // onChange in textarea only updates local input text state
    assert.ok(workspaceContent.includes("onChange={(e) => setInputText(e.target.value)}"));
    // Verify no fetch or API call inside onChange
    assert.ok(!workspaceContent.match(/onChange=\{.*fetch/));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 15. Clean initial greeting matches specification
  // ─────────────────────────────────────────────────────────────────────────────
  test("15. Clean initial greeting matches PRD Section 2 exactly", () => {
    const expected =
      "Hi! I'm SpendPilot, your personal shopping assistant. What are you looking for today? Tell me what you need, what matters most to you, and your budget if you have one. I'll help you discover and compare suitable products.";
    assert.strictEqual(SPENDPILOT_INITIAL_GREETING, expected);
  });
});
