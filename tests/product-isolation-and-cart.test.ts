import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { orchestrateShoppingTurn } from "../src/lib/orchestrator/index.ts";
import { streamConciergeTurn } from "../src/lib/concierge/streaming-engine.ts";
import { syncWorkspaceFromBrief } from "../src/lib/workspace/sync-engine.ts";
import {
  selectProductForItem,
  calculateWorkspaceBudgetSummary,
  findItemInWorkspace,
} from "../src/lib/workspace/workspace-manager.ts";
import {
  logConversationTurnDiagnostics,
  getRecentTurnDiagnostics,
  clearTurnDiagnostics,
} from "../src/lib/observability/conversation-diagnostics.ts";
import type { NormalizedProduct, AuthoritativeShoppingSession } from "../src/types/index.ts";

describe("SpendPilot AI: Product Context Isolation, Search Results, and Cart Persistence (Regression Flow)", () => {
  const sampleMotion1Chair: NormalizedProduct = {
    source: "channel3",
    imageUrl: "https://example.com/motion1.jpg",
    sourceProductId: "p_motion_1_chair",
    title: "Motion 1 Haptic Gaming Chair",
    priceMinor: 99999, // $999.99
    currency: "USD",
    retailerName: "Cooler Master",
    retailerUrl: "https://coolermaster.com/motion-1",
    availability: "in_stock",
    specifications: {
      Material: "Leather",
      Cushioning: "Soft Foam",
      Haptics: "D-BOX",
    },
    sourceFacts: ["Premium Leather", "Ergonomic Cushioning"],
    offers: [
      {
        id: "off_motion1_1",
        domain: "coolermaster.com",
        priceMinor: 99999,
        currency: "USD",
        availability: "in_stock",
        url: "https://coolermaster.com/motion-1",
      },
    ],
  };

  const sampleHyperXHeadphones: NormalizedProduct = {
    source: "channel3",
    imageUrl: "https://example.com/hyperx.jpg",
    sourceProductId: "p_hyperx_cloud2",
    title: "HyperX Cloud II Wireless Gaming Headset",
    priceMinor: 14999, // $149.99
    currency: "USD",
    retailerName: "Best Buy",
    retailerUrl: "https://bestbuy.com/hyperx-cloud2",
    availability: "in_stock",
    specifications: {
      Connectivity: "Wireless",
      BatteryLife: "30 hours",
    },
    sourceFacts: ["Wireless Audio", "Noise Cancelling"],
    offers: [
      {
        id: "off_hyperx_1",
        domain: "bestbuy.com",
        priceMinor: 14999,
        currency: "USD",
        availability: "in_stock",
        url: "https://bestbuy.com/hyperx-cloud2",
      },
    ],
  };

  test("Section 14 Complete Regression Flow: Gaming Chair (turns 1-4) -> Selection -> Headphone Isolation (turn 7) -> Combined Cart", async () => {
    // ─── Turn 1: User asks for gaming chair for 1000 USD ──────────────────────
    const turn1 = await orchestrateShoppingTurn({
      userMessage: "I need to buy a gaming chair for 1000 USD.",
      activeBrief: null,
      activeSessionId: "session_reg_1",
      sourceMessageId: "msg_turn_1",
    });

    assert.ok(turn1.brief.productRequirements.length > 0, "Turn 1 must create at least one product requirement");
    const chairReq = turn1.brief.productRequirements[0];
    assert.match(chairReq.displayName.toLowerCase(), /chair/i, "Requirement must be for a chair");
    assert.ok(turn1.brief.budget?.maximum?.amountMinor === 100000 || chairReq.constraints.some((c) => String(c.value).includes("1000")), "Budget must capture $1,000 USD");
    assert.equal(turn1.suggestedAction, "ask_question", "Turn 1 should ask for clarification");

    // ─── Turn 2: User says 'Leather' ─────────────────────────────────────────
    const turn2 = await orchestrateShoppingTurn({
      userMessage: "Leather",
      activeBrief: turn1.brief,
      activeSessionId: "session_reg_1",
      sourceMessageId: "msg_turn_2",
      conversationHistory: [
        { role: "user", content: "I need to buy a gaming chair for 1000 USD." },
        { role: "assistant", content: turn1.assistantMessage },
      ],
    });

    assert.ok(turn2.brief.productRequirements.length > 0, "Turn 2 must keep chair requirement");
    const chairReqAfterTurn2 = turn2.brief.productRequirements[0];
    assert.match(chairReqAfterTurn2.displayName.toLowerCase(), /chair/i, "Must not rename product to 'Leather'");
    const materialConstraint = chairReqAfterTurn2.constraints.find((c) => c.key === "material");
    assert.ok(materialConstraint, "Material constraint must be recorded");
    assert.match(String(materialConstraint.value).toLowerCase(), /leather/i, "Material value must be leather");

    // ─── Turn 3: User says 'u suggest but need a comfortable one' ─────────────
    const turn3 = await orchestrateShoppingTurn({
      userMessage: "u suggest but need a comfortable one",
      activeBrief: turn2.brief,
      activeSessionId: "session_reg_1",
      sourceMessageId: "msg_turn_3",
      conversationHistory: [
        { role: "user", content: "I need to buy a gaming chair for 1000 USD." },
        { role: "assistant", content: turn1.assistantMessage },
        { role: "user", content: "Leather" },
        { role: "assistant", content: turn2.assistantMessage },
      ],
    });

    const chairReqAfterTurn3 = turn3.brief.productRequirements[0];
    assert.match(chairReqAfterTurn3.displayName.toLowerCase(), /chair/i, "Chair context must be preserved in Turn 3");
    // Clarification asks about firm vs soft cushioning
    assert.ok(
      turn3.clarification?.options?.some((o) => /soft|firm/i.test(o.label)) ||
      turn3.assistantMessage.toLowerCase().includes("cushion") ||
      turn3.assistantMessage.toLowerCase().includes("support") ||
      turn3.assistantMessage.toLowerCase().includes("comfort") ||
      turn3.suggestedAction === "start_product_search",
      "Must address cushioning/comfort options"
    );

    // ─── Turn 4: User says 'softer' ──────────────────────────────────────────
    const turn4 = await orchestrateShoppingTurn({
      userMessage: "softer",
      activeBrief: turn3.brief,
      activeSessionId: "session_reg_1",
      sourceMessageId: "msg_turn_4",
      conversationHistory: [
        { role: "user", content: "I need to buy a gaming chair for 1000 USD." },
        { role: "assistant", content: turn1.assistantMessage },
        { role: "user", content: "Leather" },
        { role: "assistant", content: turn2.assistantMessage },
        { role: "user", content: "u suggest but need a comfortable one" },
        { role: "assistant", content: turn3.assistantMessage },
      ],
    });

    const chairReqAfterTurn4 = turn4.brief.productRequirements[0];
    assert.match(chairReqAfterTurn4.displayName.toLowerCase(), /chair/i, "Must maintain chair context");
    assert.equal(turn4.suggestedAction, "start_product_search", "Turn 4 must initiate product search");

    // ─── Turn 5 & 6: Search & Product Selection (Motion 1 Haptic Gaming Chair)
    // Synchronize workspace from Turn 4 brief
    let workspace = syncWorkspaceFromBrief(undefined, turn4.brief, "softer", "USD");
    assert.equal(workspace.groups.length, 1, "Must have 1 independent group");
    const chairItem = workspace.groups[0].items[0];
    assert.ok(chairItem, "Chair item must exist in workspace");

    // User selects Motion 1 chair
    workspace = selectProductForItem(workspace, chairItem.id, sampleMotion1Chair, sampleMotion1Chair.offers![0]);
    const updatedChairItem = findItemInWorkspace(workspace, chairItem.id);
    assert.equal(updatedChairItem?.item.status, "selected", "Chair item status must be 'selected'");
    assert.equal(updatedChairItem?.item.selectedProductId, "p_motion_1_chair");

    // ─── Turn 7: User says 'I also need a gaming headphone under 200 usd' ─────
    const turn7 = await orchestrateShoppingTurn({
      userMessage: "I also need a gaming headphone under 200 usd",
      activeBrief: turn4.brief,
      activeSessionId: "session_reg_1",
      sourceMessageId: "msg_turn_7",
      conversationHistory: [
        { role: "user", content: "I need to buy a gaming chair for 1000 USD." },
        { role: "assistant", content: turn1.assistantMessage },
        { role: "user", content: "Leather" },
        { role: "assistant", content: turn2.assistantMessage },
        { role: "user", content: "u suggest but need a comfortable one" },
        { role: "assistant", content: turn3.assistantMessage },
        { role: "user", content: "softer" },
        { role: "assistant", content: turn4.assistantMessage },
      ],
    });

    assert.equal(turn7.detectedIntent.type, "start_new_task", "Must detect new product intent");
    assert.ok(turn7.brief.productRequirements.length > 0, "Must have new requirement for headphones");
    const headphoneReq = turn7.brief.productRequirements[0];

    // CRITICAL ISOLATION ASSERTIONS:
    assert.match(headphoneReq.displayName.toLowerCase(), /head/i, "New requirement must be for headphones/headset");
    assert.notEqual(headphoneReq.category.toLowerCase(), "chair", "Category must NOT be chair");
    assert.notEqual(headphoneReq.category.toLowerCase(), "gaming chairs", "Category must NOT be Gaming Chairs");

    // ZERO INHERITED ATTRIBUTES:
    const hasLeather = headphoneReq.constraints.some((c) => String(c.value).toLowerCase().includes("leather"));
    const hasCushioning = headphoneReq.constraints.some((c) => String(c.value).toLowerCase().includes("softer") || String(c.value).toLowerCase().includes("cushion"));
    assert.equal(hasLeather, false, "Headphones must NOT inherit leather constraint from chair");
    assert.equal(hasCushioning, false, "Headphones must NOT inherit cushioning constraint from chair");

    // ─── Synchronize Workspace with Turn 7 Brief ─────────────────────────────
    const updatedWs = syncWorkspaceFromBrief(workspace, turn7.brief, "I also need a gaming headphone under 200 usd", "USD");
    assert.equal(updatedWs.groups.length, 1, "Must maintain the independent shopping group");
    const groupItems = updatedWs.groups[0].items;
    assert.equal(groupItems.length, 2, "Workspace must now contain BOTH chair and headphones");

    // Chair must remain selected with verified offer intact
    const chairInWs = groupItems.find((i) => i.id === chairItem.id);
    assert.ok(chairInWs, "Chair item must persist in workspace");
    assert.equal(chairInWs.status, "selected", "Chair status must remain 'selected'");
    assert.equal(chairInWs.selectedProductId, "p_motion_1_chair");
    assert.equal(chairInWs.selectedOffer?.priceMinor, 99999);

    // Headphones must be ready for search
    const headphoneItem = groupItems.find((i) => i.id !== chairItem.id);
    assert.ok(headphoneItem, "Headphone item must exist in workspace");
    assert.equal(headphoneItem.status, "ready_to_search", "Headphone item must be ready to search");

    // ─── User Selects Headphones (HyperX Cloud II) ───────────────────────────
    const finalWs = selectProductForItem(updatedWs, headphoneItem.id, sampleHyperXHeadphones, sampleHyperXHeadphones.offers![0]);
    const summary = calculateWorkspaceBudgetSummary(finalWs, "USD");

    const totalItems = finalWs.groups.reduce((sum, g) => sum + g.items.length, 0);
    const selectedItems = finalWs.groups.reduce((sum, g) => sum + g.items.filter((i) => i.status === "selected").length, 0);
    assert.equal(totalItems, 2, "Total items count must be 2");
    assert.equal(selectedItems, 2, "Selected items count must be 2");
    // $999.99 + $149.99 = $1,149.98 (114998 cents)
    assert.equal(summary.totalSelectedMinor, 99999 + 14999, "Combined cart total must equal sum of verified offers ($1,149.98)");
  });

  test("Streaming Engine: Strict Canonical Attribute and Request Scoping Across Sequential Turns", async () => {
    const initialSession: AuthoritativeShoppingSession = {
      sessionId: "session_stream_iso",
      currentTaskId: "task_chair_1",
      stage: "product_selection",
      originalRequest: "I need to buy a gaming chair for 1000 USD.",
      mode: "single",
      budget: 100000,
      currency: "USD",
      intentSummary: "Shopping for gaming chair",
      requirements: [],
      pendingQuestions: [],
      answers: {},
      attributeOrigins: {},
      canonicalAttributes: {
        material: {
          key: "material",
          label: "Material",
          value: "leather",
          displayValue: "Leather",
          source: "user_explicit",
          status: "confirmed",
          constraint: "hard_requirement",
          updatedAt: Date.now(),
        },
        cushioning: {
          key: "cushioning",
          label: "Cushioning",
          value: "softer",
          displayValue: "Softer",
          source: "user_explicit",
          status: "confirmed",
          constraint: "hard_requirement",
          updatedAt: Date.now(),
        },
      },
      messages: [],
      canSearch: true,
      updatedAt: Date.now(),
    };

    // User now sends Turn 7 in stream
    const generator = streamConciergeTurn({
      userMessage: "I also need a gaming headphone under 200 usd",
      session: initialSession,
      clientMessageId: "msg_stream_headphone",
    });

    let doneSession: AuthoritativeShoppingSession | null = null;
    for await (const chunk of generator) {
      if (chunk.type === "done") {
        doneSession = chunk.session;
      }
    }

    assert.ok(doneSession, "Done event must yield final authoritative session");
    assert.equal(doneSession.originalRequest, "I also need a gaming headphone under 200 usd", "originalRequest must be updated to the new product query");
    assert.equal(doneSession.budget, 20000, "Budget must be updated to $200 (20000 minor units)");

    // Canonical attributes must be isolated - zero chair attributes
    const attrs = doneSession.canonicalAttributes || {};
    assert.equal("material" in attrs, false, "Chair material must NOT exist in headphone canonical attributes");
    assert.equal("cushioning" in attrs, false, "Chair cushioning must NOT exist in headphone canonical attributes");
  });

  test("Diagnostics: Verification of Tracing Tags (workspaceId, itemId, searchId, cartMutationId, apiCalls)", () => {
    clearTurnDiagnostics();

    logConversationTurnDiagnostics({
      requestId: "req_diag_test_1",
      sessionRevision: 2,
      timestamp: Date.now(),
      modelId: "gemini-3.1-flash-lite",
      apiMethod: "generateContent",
      sdkVersion: "@google/genai@2.32.0",
      hasSystemInstruction: true,
      conversationTurnsCount: 3,
      hasWorkspaceState: true,
      parsedAction: "start_product_search",
      isClarification: false,
      optionsCount: 0,
      usedFallback: false,
      channel3Called: false,
      workspaceId: "ws_test_99",
      itemId: "item_chair_1",
      submissionId: "sub_user_44",
      searchId: "srch_101",
      operationId: "op_search_chair",
      cartMutationId: "mut_cart_select_1",
      actualApiCallCount: 1,
    });

    const entries = getRecentTurnDiagnostics(1);
    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.equal(entry.workspaceId, "ws_test_99");
    assert.equal(entry.itemId, "item_chair_1");
    assert.equal(entry.submissionId, "sub_user_44");
    assert.equal(entry.searchId, "srch_101");
    assert.equal(entry.operationId, "op_search_chair");
    assert.equal(entry.cartMutationId, "mut_cart_select_1");
    assert.equal(entry.actualApiCallCount, 1);
  });
});

