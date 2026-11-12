import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  orchestrateShoppingTurn,
  createInitialShoppingBrief,
  applyBriefPatch,
  applyBriefPatches,
  buildChannel3SearchRequests,
  checkBriefReadinessForSearch,
  validateShoppingBrief,
} from "../src/lib/orchestrator/index.ts";

import { createInitialSession } from "../src/lib/ai/conversation-engine.ts";

import type {
  ShoppingBriefPatch,
} from "../src/lib/orchestrator/types.ts";

describe("SpendPilot Phase 1: Central Shopping Orchestrator & Shopping Brief (Tests A - I)", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Test A: MacBook request
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test A: MacBook request parses into one laptop requirement, budget, purpose, and no invented specs", async () => {
    const inputPrompt = "I need a MacBook for programming and university under $1,200.";

    const result = await orchestrateShoppingTurn({
      userMessage: inputPrompt,
      activeSessionId: "sess_test_a",
    });

    const brief = result.brief;

    // 1. Single product mode
    assert.strictEqual(brief.mode, "single_product");

    // 2. Exactly one laptop requirement
    assert.strictEqual(brief.productRequirements.length, 1);
    const req = brief.productRequirements[0];
    assert.strictEqual(req.category, "laptop");
    assert.ok(req.displayName.toLowerCase().includes("macbook"));

    // 3. Correct budget: $1,200 USD (120000 minor units)
    assert.ok(brief.budget?.maximum);
    assert.strictEqual(brief.budget.maximum.amountMinor, 120000);
    assert.strictEqual(brief.budget.maximum.currency, "USD");

    // 4. Purpose contains programming and university
    assert.ok(req.purpose.includes("programming"), "Must record programming purpose");
    assert.ok(req.purpose.includes("university"), "Must record university purpose");

    // 5. No invented memory, storage, or chip specifications!
    const constraintKeys = req.constraints.map((c) => c.key.toLowerCase());
    assert.strictEqual(constraintKeys.includes("ram"), false, "Must NOT invent RAM");
    assert.strictEqual(constraintKeys.includes("memory"), false, "Must NOT invent Memory");
    assert.strictEqual(constraintKeys.includes("storage"), false, "Must NOT invent Storage");
    assert.strictEqual(constraintKeys.includes("chip"), false, "Must NOT invent Processor/Chip");

    // 6. Valid schema
    const check = validateShoppingBrief(brief);
    assert.strictEqual(check.success, true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test B: User adds macOS
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test B: Follow-up 'macOS, Apple MacBook' updates active requirement, preserves purpose & budget, no duplicates", async () => {
    // 1. Initial turn: MacBook for university under $1,200
    const turn1 = await orchestrateShoppingTurn({
      userMessage: "I need a MacBook for programming and university under $1,200.",
      activeSessionId: "sess_test_b",
    });

    const initialTaskId = turn1.taskId;
    const initialReqId = turn1.brief.productRequirements[0]?.id;
    assert.ok(initialReqId);

    // 2. Follow-up: "macOS, Apple MacBook."
    const turn2 = await orchestrateShoppingTurn({
      userMessage: "macOS, Apple MacBook.",
      activeBrief: turn1.brief,
      activeTaskId: initialTaskId,
      activeSessionId: "sess_test_b",
    });

    const brief = turn2.brief;

    // 3. Retain same task ID
    assert.strictEqual(brief.taskId, initialTaskId);

    // 4. Do not duplicate requirement
    assert.strictEqual(brief.productRequirements.length, 1);
    const req = brief.productRequirements[0];
    assert.strictEqual(req.id, initialReqId);

    // 5. Preserves original purpose and budget
    assert.ok(req.purpose.includes("programming"));
    assert.ok(req.purpose.includes("university"));
    assert.strictEqual(brief.budget?.maximum?.amountMinor, 120000);

    // 6. Records manufacturer, family, and OS
    const constraintsByKey = new Map(req.constraints.map((c) => [c.key, c]));
    assert.ok(constraintsByKey.has("os"), "Must have os constraint");
    assert.strictEqual(constraintsByKey.get("os")?.value, "macOS");
    assert.strictEqual(constraintsByKey.get("os")?.source, "user_explicit");
    assert.strictEqual(constraintsByKey.get("os")?.strength, "hard");

    assert.ok(constraintsByKey.has("product_family"));
    assert.strictEqual(constraintsByKey.get("product_family")?.value, "MacBook");

    // 7. Valid schema
    assert.strictEqual(validateShoppingBrief(brief).success, true);
  });

  test("MacBook-only requests retain Apple identity and ask one useful usage question", async () => {
    const result = await orchestrateShoppingTurn({
      userMessage: "I need a MacBook.",
      activeSessionId: "sess_macbook_identity",
    });

    assert.strictEqual(result.brief.productRequirements.length, 1);
    const requirement = result.brief.productRequirements[0];
    assert.strictEqual(requirement.category, "laptop");
    assert.match(requirement.displayName.toLowerCase(), /macbook/);

    const constraints = new Map(requirement.constraints.map((constraint) => [constraint.key, constraint]));
    assert.strictEqual(constraints.get("operating_system")?.value, "macOS");
    assert.strictEqual(constraints.get("manufacturer")?.value, "Apple");
    assert.strictEqual(constraints.get("product_family")?.value, "MacBook");

    const questionText = result.question?.text || result.clarification?.question || "";
    assert.match(questionText, /use your macbook/i);
    assert.strictEqual(result.suggestedAction, "ask_question");
  });

  test("MacBook usage quick reply is recorded and starts an Apple-focused search", async () => {
    const firstTurn = await orchestrateShoppingTurn({
      userMessage: "I need a MacBook.",
      activeSessionId: "sess_macbook_usage",
    });

    const secondTurn = await orchestrateShoppingTurn({
      userMessage: "Programming & university",
      activeBrief: firstTurn.brief,
      activeTaskId: firstTurn.taskId,
      answeredQuestionId: "q_macbook_primary_use",
      activeSessionId: "sess_macbook_usage",
    });

    const requirement = secondTurn.brief.productRequirements[0];
    assert.ok(requirement.purpose.includes("Programming & university"));
    assert.match(requirement.searchQuery, /macbook/i);
    assert.match(requirement.searchQuery, /programming & university/i);
    assert.ok(
      requirement.constraints.some(
        (constraint) => constraint.key === "primary_use" &&
          constraint.value === "Programming & university"
      )
    );
    assert.strictEqual(secondTurn.suggestedAction, "start_product_search");
    assert.strictEqual(secondTurn.question, null);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test C: Gaming setup
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test C: 'Build a gaming setup under $3,000' establishes multi-product mode, separate components, no invented specs", async () => {
    const inputPrompt = "Build a gaming setup under $3,000.";

    const result = await orchestrateShoppingTurn({
      userMessage: inputPrompt,
      activeSessionId: "sess_test_c",
    });

    const brief = result.brief;

    // 1. Multi-product mode
    assert.strictEqual(brief.mode, "multi_product");

    // 2. One overall budget ($3,000 USD / 300000 minor units)
    assert.strictEqual(brief.budget?.maximum?.amountMinor, 300000);
    assert.strictEqual(brief.budget?.maximum?.currency, "USD");

    // 3. Separate component requirements (PC, monitor, keyboard, mouse, headset)
    assert.ok(brief.productRequirements.length >= 3, "Setup must contain multiple component requirements");
    const categories = brief.productRequirements.map((r) => r.category.toLowerCase());
    assert.ok(categories.some((c) => c.includes("pc") || c.includes("desktop")), "Must include gaming PC");
    assert.ok(categories.some((c) => c.includes("monitor")), "Must include monitor");

    // 4. No invented 32GB RAM or 1440p requirements
    for (const req of brief.productRequirements) {
      for (const c of req.constraints) {
        assert.notStrictEqual(String(c.value).toLowerCase(), "32gb", "Must NOT invent 32GB RAM");
        assert.notStrictEqual(String(c.value).toLowerCase(), "1440p", "Must NOT invent 1440p resolution");
        assert.notStrictEqual(String(c.value).toLowerCase(), "rtx 4080", "Must NOT invent RTX 4080");
      }
    }

    // 5. Channel3 search requests verify separate component queries
    const searchRequests = buildChannel3SearchRequests(brief);
    assert.strictEqual(searchRequests.length, brief.productRequirements.length);
    for (const req of searchRequests) {
      assert.ok(req.searchQuery.length > 0);
      assert.ok(
        req.maxPriceMinor !== null &&
          req.maxPriceMinor !== undefined &&
          req.maxPriceMinor <= 300000
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test D: Anime room decoration
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test D: Anime room decoration preserves franchises without gaming or laptop requirements", async () => {
    const inputPrompt = "I want my room decorated with Naruto, One Piece and Attack on Titan.";

    const result = await orchestrateShoppingTurn({
      userMessage: inputPrompt,
      activeSessionId: "sess_test_d",
    });

    const brief = result.brief;

    // 1. Room decoration intent
    assert.strictEqual(brief.mode, "multi_product");
    assert.ok(brief.userGoal.toLowerCase().includes("room decorated") || brief.userGoal.toLowerCase().includes("naruto"));

    // 2. Franchise information preserved across requirements
    const allPurposes = brief.productRequirements.flatMap((r) => r.purpose);
    const allConstraints = brief.productRequirements.flatMap((r) => r.constraints.map((c) => String(c.value)));
    const allCombined = [...allPurposes, ...allConstraints].join(" ");

    assert.ok(allCombined.includes("Naruto"), "Must preserve Naruto");
    assert.ok(allCombined.includes("One Piece"), "Must preserve One Piece");
    assert.ok(allCombined.includes("Attack on Titan"), "Must preserve Attack on Titan");

    // 3. No laptop or gaming PC requirements
    for (const req of brief.productRequirements) {
      assert.notStrictEqual(req.category, "laptop");
      assert.notStrictEqual(req.category, "gaming_pc");
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test E: New task
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test E: Starting MacBook request then 'Now help me decorate my room' creates a different task ID and fresh requirements", async () => {
    // Turn 1: MacBook
    const turn1 = await orchestrateShoppingTurn({
      userMessage: "I need a MacBook under $1,200.",
      activeSessionId: "sess_test_e",
    });

    const task1Id = turn1.taskId;
    assert.strictEqual(turn1.brief.productRequirements[0]?.category, "laptop");

    // Turn 2: Topic switch to room decoration
    const turn2 = await orchestrateShoppingTurn({
      userMessage: "Now help me decorate my room.",
      activeBrief: turn1.brief,
      activeTaskId: task1Id,
      activeSessionId: "sess_test_e",
    });

    // 1. Must establish a different task ID
    assert.notStrictEqual(turn2.taskId, task1Id, "Must create fresh task ID");

    // 2. Must create fresh requirements without old MacBook constraints
    assert.notStrictEqual(turn2.brief.taskId, task1Id);
    for (const req of turn2.brief.productRequirements) {
      assert.notStrictEqual(req.category, "laptop", "Must not leak laptop requirement into room decor");
      for (const c of req.constraints) {
        assert.notStrictEqual(String(c.value).toLowerCase(), "macbook");
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test F: Refinement
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test F: 'Can you find that MacBook with 1TB?' retains current task and updates storage constraint", async () => {
    const turn1 = await orchestrateShoppingTurn({
      userMessage: "I need a MacBook Air under $1,400.",
      activeSessionId: "sess_test_f",
    });

    const initialTaskId = turn1.taskId;

    // Refinement turn
    const turn2 = await orchestrateShoppingTurn({
      userMessage: "Can you find that MacBook with 1TB?",
      activeBrief: turn1.brief,
      activeTaskId: initialTaskId,
      activeSessionId: "sess_test_f",
    });

    // 1. Task ID is retained
    assert.strictEqual(turn2.taskId, initialTaskId, "Must retain current task ID on refinement");

    // 2. Storage constraint added/updated to 1TB
    const req = turn2.brief.productRequirements[0];
    assert.ok(req);
    const storageConstraint = req.constraints.find((c) => c.key.toLowerCase() === "storage");
    assert.ok(storageConstraint, "Storage constraint must be present");
    assert.strictEqual(storageConstraint.value, "1TB");
    assert.strictEqual(storageConstraint.strength, "hard");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test G: Requirement provenance
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test G: An AI-suggested specification must not become a hard requirement until the user confirms it", () => {
    const brief = createInitialShoppingBrief({ userGoal: "Need a gaming laptop" });

    // 1. Add requirement
    const reqId = "req_laptop_1";
    const briefWithReq = applyBriefPatch(brief, {
      type: "create_requirement",
      requirement: {
        id: reqId,
        category: "laptop",
        displayName: "Gaming Laptop",
        searchQuery: "gaming laptop",
        quantity: 1,
        purpose: ["gaming"],
        constraints: [],
        excludedAttributes: [],
      },
    });

    // 2. AI suggests 32GB RAM (soft constraint, ai_suggested)
    const briefWithAiSuggestion = applyBriefPatch(briefWithReq, {
      type: "add_constraint",
      requirementId: reqId,
      constraint: {
        id: "c_ram_ai",
        key: "ram",
        value: "32GB",
        strength: "soft",
        source: "ai_suggested",
      },
    });

    const aiConstraint = briefWithAiSuggestion.productRequirements[0]?.constraints.find(
      (c) => c.key === "ram"
    );
    assert.ok(aiConstraint);
    assert.strictEqual(aiConstraint.source, "ai_suggested");
    assert.strictEqual(aiConstraint.strength, "soft");

    // 3. User explicitly confirms: "Yes, 32GB works"
    const briefWithUserConfirmation = applyBriefPatch(briefWithAiSuggestion, {
      type: "update_constraint",
      requirementId: reqId,
      constraintId: "c_ram_ai",
      updates: {
        source: "user_confirmed",
        strength: "hard",
      },
    });

    const confirmedConstraint = briefWithUserConfirmation.productRequirements[0]?.constraints.find(
      (c) => c.key === "ram"
    );
    assert.ok(confirmedConstraint);
    assert.strictEqual(confirmedConstraint.source, "user_confirmed");
    assert.strictEqual(confirmedConstraint.strength, "hard");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test H: Invalid patches
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test H: Invalid currency, malformed budgets, missing IDs and unknown constraints are rejected safely", () => {
    const brief = createInitialShoppingBrief({ userGoal: "Initial brief" });

    // 1. Malformed budget (negative amount)
    const patchNegativeBudget = {
      type: "set_budget",
      budget: {
        maximum: {
          amountMinor: -5000,
          currency: "USD",
        },
      },
    };
    assert.throws(
      () => applyBriefPatch(brief, patchNegativeBudget),
      /amountMinor must be non-negative|schema validation failed/i
    );

    // 2. Unsupported currency
    const patchBadCurrency = {
      type: "set_budget",
      budget: {
        maximum: {
          amountMinor: 5000,
          currency: "INVALID_MONEY",
        },
      },
    };
    assert.throws(
      () => applyBriefPatch(brief, patchBadCurrency),
      /Currency must be one of|schema validation failed/i
    );

    // 3. Nonexistent requirement ID
    const patchMissingReq = {
      type: "add_constraint",
      requirementId: "nonexistent_req_id",
      constraint: {
        id: "c_test",
        key: "brand",
        value: "Sony",
        strength: "hard",
        source: "user_explicit",
      },
    };
    assert.throws(
      () => applyBriefPatch(brief, patchMissingReq),
      /requirement 'nonexistent_req_id' not found/i
    );

    // 4. Batch application safely isolates valid patches from invalid ones
    const validPatch: ShoppingBriefPatch = {
      type: "set_user_goal",
      userGoal: "Updated valid goal",
    };
    const batchResult = applyBriefPatches(brief, [validPatch, patchBadCurrency, patchMissingReq]);

    // Valid patch applied
    assert.strictEqual(batchResult.applied.length, 1);
    assert.strictEqual(batchResult.brief.userGoal, "Updated valid goal");

    // Invalid patches rejected safely without corrupting the brief
    assert.strictEqual(batchResult.rejected.length, 2);
    assert.strictEqual(validateShoppingBrief(batchResult.brief).success, true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test I: Fresh page session
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test I: A full refresh creates a new empty shopping session and initial brief", () => {
    // 1. Initial conversation session
    const session = createInitialSession({ currency: "USD" });
    assert.strictEqual(session.requirements.length, 0);
    assert.strictEqual(session.messages.length, 0);
    assert.strictEqual(session.canSearch, false);
    assert.strictEqual(session.shoppingBrief, undefined);

    // 2. Initial Shopping Brief
    const initialBrief = createInitialShoppingBrief();
    assert.strictEqual(initialBrief.schemaVersion, 1);
    assert.strictEqual(initialBrief.productRequirements.length, 0);
    assert.strictEqual(initialBrief.missingInformation.length, 0);
    assert.strictEqual(initialBrief.status, "collecting");

    // 3. Readiness check on initial brief confirms it cannot search
    const readiness = checkBriefReadinessForSearch(initialBrief);
    assert.strictEqual(readiness.isReady, false);
    assert.ok(readiness.reasons.length > 0);
  });
});
