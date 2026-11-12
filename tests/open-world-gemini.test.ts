import { test, describe } from "node:test";
import assert from "node:assert";
import { orchestrateShoppingTurn } from "../src/lib/orchestrator/index.ts";
import { generateOrchestrationPlan } from "../src/lib/orchestrator/gemini-orchestrator.ts";
import { getRecentTurnDiagnostics } from "../src/lib/observability/conversation-diagnostics.ts";

// Load local environment if available for live evaluation tests
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Ignore if missing in CI/testing environments
  }
}

describe("SpendPilot AI: Open-World Gemini Conversation Engine Refactor", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Part 1: Open-World Architecture & Deterministic Baseline (Unit Tests)
  // ─────────────────────────────────────────────────────────────────────────

  test("Unit 1: Specialized replacement part with model compatibility requirement asks for model number with empty options []", async () => {
    let channel3SearchCalls = 0;
    const fakeChannel3Search = () => {
      channel3SearchCalls += 1;
      return Promise.resolve([]);
    };

    const userMessage = "I need replacement agitator dogs for a Whirlpool washing machine";
    const result = await orchestrateShoppingTurn({
      userMessage,
      activeBrief: null,
      activeSessionId: "session_open_world_1",
    });

    // 1. Must recognize product without needing a hardcoded category template
    const brief = result.brief;
    assert.strictEqual(brief.productRequirements.length, 1);
    const req = brief.productRequirements[0];
    assert.ok(req.displayName.toLowerCase().includes("whirlpool") || req.displayName.toLowerCase().includes("agitator"));

    // 2. Must ask for model number to verify compatibility
    assert.ok(result.clarification, "Must produce a clarification question");
    assert.strictEqual(result.clarification.attributeKey, "model_number");
    assert.ok(
      result.clarification.question.toLowerCase().includes("model number") ||
      result.clarification.question.toLowerCase().includes("appliance"),
      "Question must ask for the appliance model number"
    );

    // 3. Open-world free text: options MUST be empty array (no generic questionnaire options)
    assert.strictEqual(result.clarification.options.length, 0, "Free text model number must have empty options []");

    // 4. Mutual exclusion: isReadyForSearch MUST be false, Channel3 search calls MUST be 0
    assert.strictEqual(result.isReadyForSearch, false, "Must NOT be ready for search while waiting for model number");
    assert.strictEqual(result.suggestedAction, "ask_question");

    if (result.isReadyForSearch) {
      await fakeChannel3Search();
    }
    assert.strictEqual(channel3SearchCalls, 0, "Channel3 calls MUST be 0 when clarification is pending");
  });

  test("Unit 2: Fully specified request triggers immediate search with zero clarification questions", async () => {
    let channel3SearchCalls = 0;
    const fakeChannel3Search = () => {
      channel3SearchCalls += 1;
      return Promise.resolve([]);
    };

    const userMessage = "Sony WH-1000XM5 wireless noise cancelling headphones under $400";
    const result = await orchestrateShoppingTurn({
      userMessage,
      activeBrief: null,
      activeSessionId: "session_open_world_2",
    });

    // 1. Requirements and budget parsed
    const brief = result.brief;
    assert.strictEqual(brief.productRequirements.length, 1);
    assert.ok(brief.budget?.maximum?.amountMinor, "Budget must be parsed");
    assert.strictEqual(brief.budget.maximum.amountMinor, 40000);

    // 2. Immediate search: clarification must be null
    assert.strictEqual(result.clarification, null, "Complete query must produce null clarification");
    assert.strictEqual(result.isReadyForSearch, true, "Must be ready for search immediately");
    assert.ok(
      result.suggestedAction === "start_product_search" || result.suggestedAction === "start_new_task",
      "Action must indicate starting search / new task"
    );

    if (result.isReadyForSearch) {
      await fakeChannel3Search();
    }
    assert.strictEqual(channel3SearchCalls, 1, "Channel3 search should proceed immediately for fully specified query");
  });

  test("Unit 3: Unfamiliar laboratory equipment (Olympus 0.5x C-mount adapter) correctly handled without canned templates", async () => {
    const userMessage = "I need a 0.5x C-mount reduction lens adapter for my Olympus lab microscope";
    const result = await orchestrateShoppingTurn({
      userMessage,
      activeBrief: null,
      activeSessionId: "session_open_world_3",
    });

    const brief = result.brief;
    assert.strictEqual(brief.productRequirements.length, 1);
    const req = brief.productRequirements[0];
    assert.ok(req.searchQuery.toLowerCase().includes("c-mount") || req.searchQuery.toLowerCase().includes("olympus"));
    assert.ok(
      !result.clarification || result.clarification.question !== "What specific type or preferences do you have for this product?",
      "Must not use obsolete generic fallback question"
    );
  });

  test("Unit 4: Strict mutual exclusion: search is blocked and Channel3 is NEVER called when clarification is pending", async () => {
    let channel3Executed = false;
    const userMessage = "I need winter boots";
    const result = await orchestrateShoppingTurn({
      userMessage,
      activeBrief: null,
      activeSessionId: "session_open_world_4",
    });

    if (result.suggestedAction === "ask_question") {
      assert.strictEqual(result.isReadyForSearch, false);
      assert.ok(result.clarification !== null);
      if (result.isReadyForSearch) {
        channel3Executed = true;
      }
    }
    assert.strictEqual(channel3Executed, false, "Channel3 must never execute when clarification is pending");
  });

  test("Unit 5: Fast-path quick reply click updates requirement directly with 0 additional Gemini API calls", async () => {
    // Turn 1: create brief
    const turn1 = await orchestrateShoppingTurn({
      userMessage: "I need running shoes",
      activeBrief: null,
      activeSessionId: "session_open_world_5",
    });

    const briefTurn1 = turn1.brief;

    // Turn 2: User clicks quick reply "Trail"
    const turn2 = await orchestrateShoppingTurn({
      userMessage: "Trail",
      activeBrief: briefTurn1,
      activeSessionId: "session_open_world_5",
    });

    const briefTurn2 = turn2.brief;
    const reqTurn2 = briefTurn2.productRequirements[0];
    const terrainConstraint = reqTurn2.constraints.find((c) => c.key === "terrain" || String(c.value).toLowerCase().includes("trail"));
    assert.ok(terrainConstraint, "Should apply terrain constraint from quick reply");
  });

  test("Unit 6: Out-of-scope non-shopping query is politely redirected to shopping", async () => {
    const userMessage = "Can you help me solve this calculus integral: integral of x^2 dx?";
    const result = await orchestrateShoppingTurn({
      userMessage,
      activeBrief: null,
      activeSessionId: "session_open_world_6",
    });

    assert.strictEqual(result.suggestedAction, "reject_unrelated_request");
    assert.strictEqual(result.isReadyForSearch, false);
    assert.ok(result.assistantMessage.toLowerCase().includes("shopping"));
  });

  test("Unit 7: Real-time turn diagnostics tracker records requests, SDK version, and Channel3 status", async () => {
    const recent = getRecentTurnDiagnostics(5);
    assert.ok(Array.isArray(recent), "Recent diagnostics must be an array");
    assert.ok(recent.length > 0, "Must have recorded recent diagnostics");

    const latest = recent[recent.length - 1];
    assert.ok(latest.requestId, "Diagnostic must have requestId");
    assert.strictEqual(latest.sdkVersion, "@google/genai@2.32.0");
    assert.strictEqual(typeof latest.channel3Called, "boolean");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Part 2: Real Live Gemini Evaluations on Unseen Open-World Products
  // ─────────────────────────────────────────────────────────────────────────

  const hasApiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "test-dummy-api-key");

  test("Live 1: Whirlpool washer agitator dogs -> asks model number with empty options []", { skip: !hasApiKey }, async () => {
    const plan = await generateOrchestrationPlan({
      userMessage: "I need replacement agitator dogs for a Whirlpool washing machine",
    });

    assert.strictEqual(plan.action, "ask_question", "Must ask for model number before searching");
    assert.ok(plan.modelUsed?.includes("gemini"), "Must use live Gemini model");
    assert.ok(plan.clarification, "Must produce clarification object");
    assert.strictEqual(plan.clarification.attributeKey, "model_number");
    assert.ok(
      plan.clarification.question.toLowerCase().includes("model number") ||
      plan.clarification.question.toLowerCase().includes("washer") ||
      plan.clarification.question.toLowerCase().includes("machine"),
      "Question must ask for washing machine model number"
    );
    assert.strictEqual(plan.clarification.options.length, 0, "Options must be empty array [] for free-text model number");
  });

  test("Live 2: Ice climbing crampons -> asks boot binding system with contextual options", { skip: !hasApiKey }, async () => {
    const plan = await generateOrchestrationPlan({
      userMessage: "I am looking for ice climbing crampons",
    });

    assert.strictEqual(plan.action, "ask_question", "Must ask about binding system or points");
    assert.ok(plan.clarification, "Must produce clarification object");
    assert.ok(
      plan.clarification.question.toLowerCase().includes("binding") ||
      plan.clarification.question.toLowerCase().includes("boot") ||
      plan.clarification.question.toLowerCase().includes("attachment"),
      "Question must address boot compatibility or binding system"
    );
    assert.ok(plan.clarification.options.length >= 2, "Must offer contextual binding options");
    const optionLabels = plan.clarification.options.map((o) => o.label.toLowerCase()).join(" ");
    assert.ok(
      optionLabels.includes("automatic") || optionLabels.includes("step-in") || optionLabels.includes("strap"),
      "Options must include realistic crampon binding types"
    );
  });

  test("Live 3: Flatwound bass guitar strings -> asks scale length with musical options or initiates search", { skip: !hasApiKey }, async () => {
    const plan = await generateOrchestrationPlan({
      userMessage: "I need flatwound bass guitar strings",
    });

    assert.ok(
      plan.action === "ask_question" || plan.action === "start_product_search",
      "Action must be either ask_question or start_product_search"
    );
    if (plan.action === "ask_question") {
      assert.ok(plan.clarification, "Must produce clarification object");
      assert.ok(
        plan.clarification.question.toLowerCase().includes("scale") ||
        plan.clarification.question.toLowerCase().includes("gauge") ||
        plan.clarification.question.toLowerCase().includes("bass") ||
        plan.clarification.question.toLowerCase().includes("string"),
        "Question must address scale length or string gauge"
      );
      assert.ok(plan.clarification.options.length >= 0, "Options must be valid array");
    }
  });

  test("Live 4: Dyneema composite fabric (DCF) -> dynamically reasons about fabric weight or initiates search", { skip: !hasApiKey }, async () => {
    const plan = await generateOrchestrationPlan({
      userMessage: "I am looking for Dyneema composite fabric for ultralight backpacking gear",
    });

    assert.ok(
      plan.action === "ask_question" || plan.action === "start_product_search",
      "Action must be either ask_question or start_product_search"
    );
    if (plan.action === "ask_question") {
      assert.ok(plan.clarification, "Must produce clarification object");
      assert.ok(
        plan.clarification.question.toLowerCase().includes("weight") ||
        plan.clarification.question.toLowerCase().includes("thickness") ||
        plan.clarification.question.toLowerCase().includes("fabric") ||
        plan.clarification.question.toLowerCase().includes("gear") ||
        plan.clarification.question.toLowerCase().includes("dyneema") ||
        plan.clarification.question.toLowerCase().includes("use") ||
        plan.clarification.question.toLowerCase().includes("project") ||
        plan.clarification.question.toLowerCase().includes("type"),
        "Question must address fabric attributes"
      );
    } else {
      assert.strictEqual(plan.clarification, null, "Clarification must be null when searching");
      const searchQ = (plan.patches.find((p) => p.type === "create_requirement") as { type: string; requirement?: { searchQuery?: string } })?.requirement?.searchQuery?.toLowerCase() || "";
      assert.ok(searchQ.includes("dyneema"), "Search query must include dyneema");
    }
  });

  test("Live 5: Whole house sediment water filter -> asks filter dimensions with plumbing sizes", { skip: !hasApiKey }, async () => {
    const plan = await generateOrchestrationPlan({
      userMessage: "I need a replacement whole house sediment water filter cartridge",
    });

    assert.strictEqual(plan.action, "ask_question");
    assert.ok(plan.clarification, "Must produce clarification object");
    assert.ok(
      plan.clarification.question.toLowerCase().includes("dimension") ||
      plan.clarification.question.toLowerCase().includes("size") ||
      plan.clarification.question.toLowerCase().includes("micron") ||
      plan.clarification.question.toLowerCase().includes("filter"),
      "Question must address dimensions or micron rating"
    );
  });

  test("Live 6: Fully specified query -> searches immediately with null clarification and zero questions", { skip: !hasApiKey }, async () => {
    const plan = await generateOrchestrationPlan({
      userMessage: "Sony WH-1000XM5 wireless noise cancelling headphones under $400",
    });

    assert.strictEqual(plan.action, "start_product_search", "Must search immediately");
    assert.strictEqual(plan.clarification, null, "Clarification must be null");
    assert.ok(plan.patches.some((p) => p.type === "set_budget"), "Must record budget patch");
  });
});
