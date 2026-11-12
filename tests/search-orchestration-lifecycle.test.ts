import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createInitialWorkspace,
  addIndependentItem,
  setActiveWorkspaceItem,
  findItemInWorkspace,
  updateItemSearchResults,
  updateItemComparison,
} from "../src/lib/workspace/workspace-manager";
import {
  executeItemSearchLifecycle,
  deriveItemDisplayState,
  SearchOrchestratorDependencies,
} from "../src/lib/workspace/search-orchestrator";
import {
  NormalizedProduct,
  AiComparisonResult,
  EvidenceFact,
  ShoppingWorkspace,
} from "../src/types";

const sampleChairProduct: NormalizedProduct = {
  source: "channel3",
  sourceProductId: "chair_leather_pro",
  title: "Ergonomic Top-Grain Leather Office Chair",
  imageUrl: "https://example.com/chair.jpg",
  priceMinor: 95000,
  currency: "USD",
  retailerName: "ErgoComfort",
  retailerUrl: "https://example.com/chair",
  availability: "in_stock",
  specifications: { Material: "Leather", Mechanism: "Synchro-tilt" },
  sourceFacts: ["Top-grain leather", "Adjustable lumbar"],
  offers: [
    {
      id: "off_chair_1",
      domain: "ergocomfort.com",
      priceMinor: 95000,
      currency: "USD",
      availability: "in_stock",
      url: "https://example.com/chair",
    },
  ],
};

const sampleHeadphoneProduct: NormalizedProduct = {
  source: "channel3",
  sourceProductId: "headphone_anc_pro",
  title: "Wireless ANC Gaming Headphones",
  imageUrl: "https://example.com/headphone.jpg",
  priceMinor: 18000,
  currency: "USD",
  retailerName: "AudioPro",
  retailerUrl: "https://example.com/headphone",
  availability: "in_stock",
  specifications: { Connectivity: "Wireless", ANC: "Active" },
  sourceFacts: ["40h battery", "Active Noise Cancellation"],
  offers: [
    {
      id: "off_hp_1",
      domain: "audiopro.com",
      priceMinor: 18000,
      currency: "USD",
      availability: "in_stock",
      url: "https://example.com/headphone",
    },
  ],
};

const sampleComparison: AiComparisonResult = {
  summary: "Top-grain leather chair provides unmatched ergonomic support.",
  bestMatchProductId: "chair_leather_pro",
  bestMatchReason: "Best alignment with lumbar support and leather preferences.",
  priorityInterpretation: ["Ergonomics", "Leather"],
  criteria: [],
  tradeoffs: [],
  alternativePicks: [],
  missingInformation: [],
};

const sampleEvidenceFacts: Record<string, EvidenceFact> = {
  fact_chair_mat: {
    id: "fact_chair_mat",
    productId: "chair_leather_pro",
    category: "feature",
    label: "Material",
    value: "Top-grain Leather",
    sourceField: "specifications",
  },
};

test("SpendPilot Phase 1 Final: Strict Search Ownership & Search Lifecycle Orchestration", async (t) => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Test A: Start chair search with own item ID & requirements
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test("Test A: Start chair search with own item ID & requirements", async () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Ergonomic leather chair",
      category: "Furniture",
      displayName: "Office Chair",
      preferences: { material: "leather" },
      individualBudget: { amountMinor: 100000, currency: "USD", strict: false },
    });
    const chairItemId = ws.activeItemId!;

    let receivedQuery = "";
    let receivedBudget: number | null = null;
    let receivedAttrs: Record<string, unknown> | undefined;

    const mockDeps: SearchOrchestratorDependencies = {
      searchProducts: async (params) => {
        receivedQuery = params.query;
        receivedBudget = params.budget;
        receivedAttrs = params.canonicalAttributes;
        return { success: true, products: [sampleChairProduct] };
      },
      recommendProducts: async () => ({
        success: true,
        comparison: sampleComparison,
        evidenceFacts: sampleEvidenceFacts,
      }),
    };

    const lifecycleResult = await executeItemSearchLifecycle(
      {
        workspace: ws,
        itemId: chairItemId,
        searchQuery: "Ergonomic leather chair",
      },
      mockDeps
    );

    assert.strictEqual(lifecycleResult.accepted, true, "Search update must be accepted");
    assert.strictEqual(lifecycleResult.status, "completed");
    assert.strictEqual(lifecycleResult.originatingItemId, chairItemId);
    assert.strictEqual(lifecycleResult.candidates.length, 1);
    assert.strictEqual(lifecycleResult.candidates[0].sourceProductId, "chair_leather_pro");
    assert.strictEqual(lifecycleResult.comparison?.bestMatchProductId, "chair_leather_pro");
    assert.ok(lifecycleResult.completionMessage, "Must produce completion message");

    // Verify search query parameters were strictly derived from chair item
    assert.strictEqual(receivedQuery, "Ergonomic leather chair");
    assert.strictEqual(receivedBudget, 1000, "Budget must be 1000 USD");
    assert.ok(receivedAttrs?.["material"], "Must contain chair material constraint");

    // Verify workspace was updated
    const savedChair = findItemInWorkspace(lifecycleResult.workspace, chairItemId)?.item;
    assert.strictEqual(savedChair?.candidates.length, 1);
    assert.strictEqual(savedChair?.searchStatus, "completed");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test B: Start headphone search with different item ID & requirements
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test("Test B: Start headphone search with different item ID & requirements", async () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Ergonomic leather chair",
      category: "Furniture",
      displayName: "Office Chair",
      preferences: { material: "leather" },
      individualBudget: { amountMinor: 100000, currency: "USD", strict: false },
    });
    const chairItemId = ws.activeItemId!;

    ws = addIndependentItem(ws, {
      productRequest: "Wireless ANC gaming headphones",
      category: "Electronics",
      displayName: "Gaming Headphones",
      preferences: { noise_canceling: "active" },
      individualBudget: { amountMinor: 20000, currency: "USD", strict: false },
    });
    const hpItemId = ws.activeItemId!;
    assert.notStrictEqual(chairItemId, hpItemId, "Chair and headphones must have distinct item IDs");

    let receivedHpQuery = "";
    let receivedHpBudget: number | null = null;
    let receivedHpAttrs: Record<string, unknown> | undefined;

    const mockDeps: SearchOrchestratorDependencies = {
      searchProducts: async (params) => {
        receivedHpQuery = params.query;
        receivedHpBudget = params.budget;
        receivedHpAttrs = params.canonicalAttributes;
        return { success: true, products: [sampleHeadphoneProduct] };
      },
    };

    const hpResult = await executeItemSearchLifecycle(
      {
        workspace: ws,
        itemId: hpItemId,
        searchQuery: "Wireless ANC gaming headphones",
      },
      mockDeps
    );

    assert.strictEqual(hpResult.accepted, true);
    assert.strictEqual(hpResult.status, "completed");
    assert.strictEqual(hpResult.originatingItemId, hpItemId);
    assert.strictEqual(hpResult.candidates.length, 1);
    assert.strictEqual(hpResult.candidates[0].sourceProductId, "headphone_anc_pro");

    // Verify ZERO chair context leaked into headphones search
    assert.strictEqual(receivedHpBudget, 200, "Headphones budget must be $200, not $1,000");
    assert.strictEqual(receivedHpAttrs?.["material"], undefined, "Headphone attrs must NOT contain leather material");
    assert.strictEqual(receivedHpQuery.includes("chair"), false, "Headphone query must NOT contain chair");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test C: Complete both requests out of order (both save to originating items)
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test("Test C: Complete both requests out of order (both save to originating items)", async () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Chair",
      category: "Furniture",
      displayName: "Chair",
    });
    const chairItemId = ws.activeItemId!;

    ws = addIndependentItem(ws, {
      productRequest: "Headphones",
      category: "Electronics",
      displayName: "Headphones",
    });
    const hpItemId = ws.activeItemId!;

    // Start Chair search
    const chairSearchId = "search_chair_c";
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId: chairSearchId,
      searchFingerprint: "fp_chair_c",
      searchStatus: "searching",
    });

    // Start Headphones search
    const hpSearchId = "search_hp_c";
    ws = updateItemSearchResults(ws, hpItemId, {
      searchId: hpSearchId,
      searchFingerprint: "fp_hp_c",
      searchStatus: "searching",
    });

    // Complete Headphones FIRST (out of order)
    ws = updateItemSearchResults(ws, hpItemId, {
      searchId: hpSearchId,
      searchStatus: "completed",
      candidates: [sampleHeadphoneProduct],
    });

    // Complete Chair SECOND
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId: chairSearchId,
      searchStatus: "completed",
      candidates: [sampleChairProduct],
    });

    const chairItem = findItemInWorkspace(ws, chairItemId)?.item;
    const hpItem = findItemInWorkspace(ws, hpItemId)?.item;

    assert.strictEqual(chairItem?.candidates.length, 1);
    assert.strictEqual(chairItem?.candidates[0].sourceProductId, "chair_leather_pro");

    assert.strictEqual(hpItem?.candidates.length, 1);
    assert.strictEqual(hpItem?.candidates[0].sourceProductId, "headphone_anc_pro");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test D: Switch active item during search (active item unchanged by search completion)
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test("Test D: Switch active item during search (active item unchanged by search completion)", async () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Chair",
      category: "Furniture",
      displayName: "Chair",
    });
    const chairItemId = ws.activeItemId!;

    ws = addIndependentItem(ws, {
      productRequest: "Headphones",
      category: "Electronics",
      displayName: "Headphones",
    });
    const hpItemId = ws.activeItemId!;

    // Start Chair search
    const chairSearchId = "search_chair_d";
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId: chairSearchId,
      searchFingerprint: "fp_chair_d",
      searchStatus: "searching",
    });

    // User switches active item to headphones
    ws = setActiveWorkspaceItem(ws, hpItemId);
    assert.strictEqual(ws.activeItemId, hpItemId, "Active item must be headphones");

    // Chair search completes while headphones is the active item
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId: chairSearchId,
      searchStatus: "completed",
      candidates: [sampleChairProduct],
    });

    // Active item must remain HEADPHONES without disruption
    assert.strictEqual(ws.activeItemId, hpItemId, "Active item must NOT be flipped back to chair");

    // Results must be saved cleanly on chair item
    const chairItem = findItemInWorkspace(ws, chairItemId)?.item;
    assert.strictEqual(chairItem?.candidates.length, 1);
    assert.strictEqual(chairItem?.candidates[0].sourceProductId, "chair_leather_pro");

    // Headphone candidates must remain unaffected
    const hpItem = findItemInWorkspace(ws, hpItemId)?.item;
    assert.strictEqual(hpItem?.candidates.length, 0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test E: Start two searches for same item, finish older one last (older rejected, newer accepted)
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test("Test E: Start two searches for same item, finish older one last (older rejected, newer accepted)", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Gaming Chair",
    });
    const chairItemId = ws.activeItemId!;

    // Search 1 starts
    const searchId1 = "search_chair_v1";
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId: searchId1,
      searchFingerprint: "fp_v1",
      searchStatus: "searching",
    });
    assert.strictEqual(findItemInWorkspace(ws, chairItemId)?.item.searchId, searchId1);

    // Search 2 starts on same item (supersedes Search 1)
    const searchId2 = "search_chair_v2";
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId: searchId2,
      searchFingerprint: "fp_v2",
      searchStatus: "searching",
    });
    assert.strictEqual(findItemInWorkspace(ws, chairItemId)?.item.searchId, searchId2);

    // Attempt to complete older Search 1
    const wsAfterStale = updateItemSearchResults(ws, chairItemId, {
      searchId: searchId1, // Mismatched old search ID
      searchStatus: "completed",
      candidates: [sampleChairProduct],
    });

    // Verify rejection: returns unchanged workspace without incrementing revision
    assert.strictEqual(wsAfterStale, ws, "Stale update must return unchanged workspace");
    assert.strictEqual(wsAfterStale.revision, ws.revision, "Revision must not increment");
    const itemAfterStale = findItemInWorkspace(wsAfterStale, chairItemId)?.item;
    assert.strictEqual(itemAfterStale?.candidates.length, 0, "Stale candidates must not be saved");
    assert.strictEqual(itemAfterStale?.searchStatus, "searching", "Must still be searching from search 2");

    // Complete newer Search 2
    const wsAfterNewer = updateItemSearchResults(ws, chairItemId, {
      searchId: searchId2,
      searchStatus: "completed",
      candidates: [sampleChairProduct],
    });

    assert.notStrictEqual(wsAfterNewer, ws, "Newer update must be accepted");
    assert.strictEqual(wsAfterNewer.revision, ws.revision + 1);
    const itemAfterNewer = findItemInWorkspace(wsAfterNewer, chairItemId)?.item;
    assert.strictEqual(itemAfterNewer?.searchStatus, "completed");
    assert.strictEqual(itemAfterNewer?.candidates.length, 1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test F: Omit search ID from completion update and verify rejection
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test("Test F: Omit search ID from completion update and verify rejection", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Gaming Chair",
    });
    const chairItemId = ws.activeItemId!;

    // Start search
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId: "search_chair_f",
      searchFingerprint: "fp_f",
      searchStatus: "searching",
    });

    const revBefore = ws.revision;

    // Attempt completion with omitted searchId
    const wsOmitted = updateItemSearchResults(ws, chairItemId, {
      searchStatus: "completed",
      candidates: [sampleChairProduct],
    });

    assert.strictEqual(wsOmitted, ws, "Omitted searchId update must return unchanged workspace");
    assert.strictEqual(wsOmitted.revision, revBefore, "Revision must not increment");
    const item = findItemInWorkspace(wsOmitted, chairItemId)?.item;
    assert.strictEqual(item?.candidates.length, 0, "Candidates must not be saved without searchId");

    // Attempt completion with empty string searchId
    const wsEmpty = updateItemSearchResults(ws, chairItemId, {
      searchId: "   ",
      searchStatus: "completed",
      candidates: [sampleChairProduct],
    });

    assert.strictEqual(wsEmpty, ws, "Empty searchId update must return unchanged workspace");
    assert.strictEqual(wsEmpty.revision, revBefore);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test G: Attempt comparison update without current search ID and verify rejection
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test("Test G: Attempt comparison update without current search ID and verify rejection", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Gaming Chair",
    });
    const chairItemId = ws.activeItemId!;

    // Start search & complete
    const searchId = "search_chair_g";
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId,
      searchFingerprint: "fp_g",
      searchStatus: "searching",
    });
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId,
      searchStatus: "completed",
      candidates: [sampleChairProduct],
    });

    const revBefore = ws.revision;

    // 1. Attempt comparison without searchId
    const wsNoId = updateItemComparison(ws, chairItemId, sampleComparison, sampleEvidenceFacts);
    assert.strictEqual(wsNoId, ws, "Comparison update without searchId must be rejected");
    assert.strictEqual(wsNoId.revision, revBefore);
    assert.strictEqual(findItemInWorkspace(wsNoId, chairItemId)?.item.comparison, undefined);

    // 2. Attempt comparison with wrong searchId
    const wsWrongId = updateItemComparison(
      ws,
      chairItemId,
      sampleComparison,
      sampleEvidenceFacts,
      undefined,
      "wrong_search_id"
    );
    assert.strictEqual(wsWrongId, ws, "Comparison update with mismatched searchId must be rejected");
    assert.strictEqual(wsWrongId.revision, revBefore);

    // 3. Valid comparison with matching searchId
    const wsValid = updateItemComparison(
      ws,
      chairItemId,
      sampleComparison,
      sampleEvidenceFacts,
      undefined,
      searchId
    );
    assert.notStrictEqual(wsValid, ws, "Valid comparison update must be accepted");
    assert.strictEqual(wsValid.revision, revBefore + 1);
    assert.strictEqual(findItemInWorkspace(wsValid, chairItemId)?.item.comparison?.bestMatchProductId, "chair_leather_pro");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test H: Verify idle item never displays another item's loading or progress state
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test("Test H: Verify idle item never displays another item's loading or progress state", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Chair",
      category: "Furniture",
      displayName: "Chair",
    });
    const chairItemId = ws.activeItemId!;

    ws = addIndependentItem(ws, {
      productRequest: "Headphones",
      category: "Electronics",
      displayName: "Headphones",
    });
    const hpItemId = ws.activeItemId!;

    // Chair is actively searching in background
    const searchingItemIds = new Set([chairItemId]);
    const itemProgressMap = new Map([
      [chairItemId, { stage: "searching", message: "Searching live catalogs for chairs..." }],
    ]);
    const itemStatusTextMap = new Map([
      [chairItemId, "Searching live catalogs for chairs..."],
    ]);

    // Active item is Headphones (which is IDLE)
    ws = setActiveWorkspaceItem(ws, hpItemId);

    // Derive display state for headphones
    const hpDisplayState = deriveItemDisplayState({
      workspace: ws,
      targetItemId: hpItemId,
      searchingItemIds,
      itemProgressMap,
      itemStatusTextMap,
    });

    // Assert that Headphones displays IDLE state with ZERO leakage from Chair
    assert.strictEqual(hpDisplayState.isSearching, false, "Idle headphone item must NOT be searching");
    assert.strictEqual(hpDisplayState.isComparing, false, "Idle headphone item must NOT be comparing");
    assert.strictEqual(hpDisplayState.searchProgress, null, "Idle headphone item must have null searchProgress");
    assert.strictEqual(hpDisplayState.statusText, null, "Idle headphone item must have null statusText");

    // Derive display state for Chair
    const chairDisplayState = deriveItemDisplayState({
      workspace: ws,
      targetItemId: chairItemId,
      searchingItemIds,
      itemProgressMap,
      itemStatusTextMap,
    });

    // Assert that Chair displays its active searching state
    assert.strictEqual(chairDisplayState.isSearching, true, "Chair item must be searching");
    assert.strictEqual(chairDisplayState.searchProgress?.stage, "searching");
    assert.strictEqual(chairDisplayState.statusText, "Searching live catalogs for chairs...");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test I: Verify stale completion cannot create a success chat message
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test("Test I: Verify stale completion cannot create a success chat message", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Chair",
      category: "Furniture",
      displayName: "Chair",
    });
    const chairItemId = ws.activeItemId!;

    // Search 1 starts
    const searchId1 = "search_chair_i1";
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId: searchId1,
      searchFingerprint: "fp_i1",
      searchStatus: "searching",
    });

    // Search 2 starts on same item (supersedes Search 1)
    const searchId2 = "search_chair_i2";
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId: searchId2,
      searchFingerprint: "fp_i2",
      searchStatus: "searching",
    });

    // Simulate chat messages array
    interface ChatMessage {
      id: string;
      role: "user" | "assistant";
      content: string;
    }
    const messages: ChatMessage[] = [
      { id: "msg_user_1", role: "user", content: "Find me a gaming chair" },
    ];

    // Helper simulating executeDirectSearch completion handler
    function handleSearchCompletion(
      currentWs: ShoppingWorkspace,
      itemId: string,
      resultSearchId: string,
      products: NormalizedProduct[],
      finalMsg: string
    ): { workspace: ShoppingWorkspace; messages: ChatMessage[]; accepted: boolean } {
      const nextWs = updateItemSearchResults(currentWs, itemId, {
        searchId: resultSearchId,
        searchFingerprint: "fp_i",
        searchStatus: "completed",
        candidates: products,
      });

      // Strict acceptance check: must advance revision
      if (nextWs === currentWs || nextWs.revision <= currentWs.revision) {
        // REJECTED: Do NOT append message
        return { workspace: currentWs, messages, accepted: false };
      }

      // ACCEPTED: append success message
      const nextMessages: ChatMessage[] = [
        ...messages,
        { id: `msg_completed_${Date.now()}`, role: "assistant", content: finalMsg },
      ];
      return { workspace: nextWs, messages: nextMessages, accepted: true };
    }

    // Attempt to complete with stale searchId1
    const staleResult = handleSearchCompletion(
      ws,
      chairItemId,
      searchId1, // Stale!
      [sampleChairProduct],
      "Here are the best chair options."
    );

    assert.strictEqual(staleResult.accepted, false, "Stale completion must be rejected");
    assert.strictEqual(staleResult.messages.length, 1, "Stale completion must NOT append chat message");
    assert.strictEqual(staleResult.workspace.revision, ws.revision, "Workspace revision must not change");

    // Complete with valid searchId2
    const validResult = handleSearchCompletion(
      ws,
      chairItemId,
      searchId2, // Valid!
      [sampleChairProduct],
      "Here are the best chair options."
    );

    assert.strictEqual(validResult.accepted, true, "Valid completion must be accepted");
    assert.strictEqual(validResult.messages.length, 2, "Valid completion MUST append chat message");
    assert.strictEqual(validResult.messages[1].role, "assistant");
    assert.strictEqual(validResult.messages[1].content, "Here are the best chair options.");
    assert.strictEqual(validResult.workspace.revision, ws.revision + 1);
  });
});
