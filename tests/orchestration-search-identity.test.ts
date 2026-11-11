import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { orchestrateShoppingTurn } from "../src/lib/orchestrator/index.ts";
import { syncWorkspaceFromBrief } from "../src/lib/workspace/sync-engine.ts";
import {
  createInitialWorkspace,
  addIndependentItem,
  setActiveWorkspaceItem,
  findItemInWorkspace,
  selectProductForItem,
  selectOfferForItem,
  updateItemSearchResults,
  updateItemComparison,
  buildItemSearchFingerprint,
  deriveItemCanonicalAttributes,
} from "../src/lib/workspace/workspace-manager.ts";
import { buildConstrainedSearchQuery, filterEligibleCandidates } from "../src/lib/shopping/eligibility-gate.ts";
import type {
  NormalizedProduct,
  AiComparisonResult,
  EvidenceFact,
  ProductOfferItem,
} from "../src/types/index.ts";

describe("SpendPilot Phase 1 Completion: Orchestration Search Identity & Context Isolation (Tests A - I)", () => {
  const sampleChair: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "chair_leather_ergonomic",
    title: "Ergonomic Top-Grain Leather Gaming Chair",
    imageUrl: "https://example.com/chair.jpg",
    priceMinor: 95000,
    currency: "USD",
    retailerName: "ErgoSeating",
    retailerUrl: "https://example.com/chair",
    availability: "in_stock",
    specifications: { Material: "Leather" },
    sourceFacts: ["Top-grain leather", "Adjustable lumbar"],
    offers: [
      {
        id: "off_chair_1",
        domain: "example.com",
        priceMinor: 95000,
        currency: "USD",
        availability: "in_stock",
        url: "https://example.com/chair",
      },
    ],
  };

  const sampleHeadphones: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "hp_wireless_anc",
    title: "Pro Wireless Noise-Cancelling Gaming Headset",
    imageUrl: "https://example.com/hp.jpg",
    priceMinor: 18000,
    currency: "USD",
    retailerName: "AudioHub",
    retailerUrl: "https://example.com/hp",
    availability: "in_stock",
    specifications: { Connectivity: "Wireless", ANC: "Active" },
    sourceFacts: ["Active noise cancellation", "40mm drivers"],
    offers: [
      {
        id: "off_hp_1",
        domain: "audiohub.com",
        priceMinor: 18000,
        currency: "USD",
        availability: "in_stock",
        url: "https://audiohub.com/hp",
      },
      {
        id: "off_hp_retailer2",
        domain: "bestdeal.com",
        priceMinor: 16999,
        currency: "USD",
        availability: "in_stock",
        url: "https://bestdeal.com/hp",
      },
    ],
  };

  const comparison1: AiComparisonResult = {
    summary: "Comparison summary 1",
    bestMatchProductId: "chair_leather_ergonomic",
    bestMatchReason: "Fits leather and ergonomics",
    priorityInterpretation: ["Leather", "Ergonomics"],
    criteria: [],
    tradeoffs: [],
    alternativePicks: [],
    missingInformation: [],
  };

  const comparison2: AiComparisonResult = {
    summary: "Headphone comparison summary",
    bestMatchProductId: "hp_wireless_anc",
    bestMatchReason: "Top ANC performance under $200",
    priorityInterpretation: ["ANC", "Wireless"],
    criteria: [],
    tradeoffs: [],
    alternativePicks: [],
    missingInformation: [],
  };

  const evidence1: Record<string, EvidenceFact> = {
    fact_1: {
      id: "fact_1",
      productId: "chair_leather_ergonomic",
      category: "feature",
      label: "Material",
      value: "Leather",
      sourceField: "specifications",
    },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Tests A, B, C: Full Orchestration Turn -> Chair -> Headphone -> No Leaked Context
  // ─────────────────────────────────────────────────────────────────────────────
  test("Tests A, B, C: Full Orchestration Flow - Chair ($1000 + Leather) then Headphones ($200) contains zero chair context", async () => {
    // Turn 1: Chair request
    const turn1 = await orchestrateShoppingTurn({
      userMessage: "I need to buy a gaming chair for 1000 USD.",
      activeBrief: null,
      activeSessionId: "sess_orch_1",
      sourceMessageId: "msg_orch_1",
    });

    // Turn 2: Clarification with leather
    const turn2 = await orchestrateShoppingTurn({
      userMessage: "Leather",
      activeBrief: turn1.brief,
      activeSessionId: "sess_orch_1",
      sourceMessageId: "msg_orch_2",
      conversationHistory: [
        { role: "user", content: "I need to buy a gaming chair for 1000 USD." },
        { role: "assistant", content: turn1.assistantMessage },
      ],
    });

    // Verify Turn 2 captures chair with leather and 1000 USD
    const chairReq = turn2.brief.productRequirements[0];
    assert.match(chairReq.displayName.toLowerCase(), /chair/i);
    const chairBudgetMinor = turn2.brief.budget?.maximum?.amountMinor;
    assert.strictEqual(chairBudgetMinor, 100000, "Chair budget must be $1,000 USD");
    assert.ok(
      chairReq.constraints.some((c) => String(c.value).toLowerCase().includes("leather")),
      "Chair must have leather constraint"
    );

    // Sync workspace for chair
    let ws = syncWorkspaceFromBrief(undefined, turn2.brief, "Leather", "USD");
    const chairItem = ws.groups[0].items[0];
    assert.ok(chairItem);
    assert.strictEqual(chairItem.productRequest.toLowerCase().includes("chair"), true);

    // Turn 3: User starts new independent search for headphones under $200
    const turn3 = await orchestrateShoppingTurn({
      userMessage: "I also need a gaming headphone under 200 usd",
      activeBrief: turn2.brief,
      activeSessionId: "sess_orch_1",
      sourceMessageId: "msg_orch_3",
      conversationHistory: [
        { role: "user", content: "I need to buy a gaming chair for 1000 USD." },
        { role: "assistant", content: turn1.assistantMessage },
        { role: "user", content: "Leather" },
        { role: "assistant", content: turn2.assistantMessage },
      ],
    });

    // Verify new task / requirement
    const hpReq = turn3.brief.productRequirements[0];
    assert.match(hpReq.displayName.toLowerCase(), /head/i, "Requirement must be for headphones");
    assert.strictEqual(turn3.brief.budget?.maximum?.amountMinor, 20000, "Headphones budget must be $200 USD");

    // CRITICAL: Verify headphone requirement contains NO chair attributes
    const hasLeatherInHp = hpReq.constraints.some((c) => String(c.value).toLowerCase().includes("leather"));
    assert.strictEqual(hasLeatherInHp, false, "Headphones requirement must NOT contain leather attribute");

    // Sync workspace with headphones
    ws = syncWorkspaceFromBrief(ws, turn3.brief, "gaming headphone under 200 usd", "USD");
    const hpItem = findItemInWorkspace(ws, ws.activeItemId!)?.item;
    assert.ok(hpItem);

    // Verify item-derived canonical attributes for headphone search
    const hpCanonicalAttrs = deriveItemCanonicalAttributes(hpItem, null);
    assert.strictEqual(hpCanonicalAttrs["material"], undefined, "Headphone canonical attributes must not contain chair material");

    // Verify search query construction for Channel3
    const constrainedHpQuery = buildConstrainedSearchQuery(hpItem.searchQuery || "gaming headphones", hpCanonicalAttrs);
    assert.strictEqual(constrainedHpQuery.toLowerCase().includes("leather"), false, "Constrained query must not contain leather");

    // Verify eligibility filter for headphones does not filter by leather
    const eligibility = filterEligibleCandidates({
      products: [sampleHeadphones],
      canonicalAttributes: hpCanonicalAttrs,
      budgetCents: 20000,
      currency: "USD",
    });
    assert.strictEqual(eligibility.eligibleProducts.length, 1, "Headphones must be eligible under its own requirements");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test D: Start two searches for the same item and complete older one late -> rejected
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test D: Start two searches for the same item and complete older one late -> older search must be rejected", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Gaming Chair",
    });
    const chairItemId = ws.activeItemId!;

    // Start Search 1
    const searchId1 = "search_chair_v1";
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId: searchId1,
      searchFingerprint: "fp_v1",
      searchStatus: "searching",
    });

    const itemAfterSearch1 = findItemInWorkspace(ws, chairItemId)?.item;
    assert.strictEqual(itemAfterSearch1?.searchId, searchId1);
    assert.strictEqual(itemAfterSearch1?.searchStatus, "searching");

    // Start Search 2 on the same item (superseding Search 1)
    const searchId2 = "search_chair_v2";
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId: searchId2,
      searchFingerprint: "fp_v2",
      searchStatus: "searching",
    });

    const itemAfterSearch2 = findItemInWorkspace(ws, chairItemId)?.item;
    assert.strictEqual(itemAfterSearch2?.searchId, searchId2, "Current registered searchId must be search_chair_v2");

    // Now Search 1 completes LATE with stale candidates
    const oldStaleProduct: NormalizedProduct = {
      ...sampleChair,
      sourceProductId: "chair_stale_v1",
      title: "Old Stale Chair",
    };

    const wsAfterLateUpdate = updateItemSearchResults(ws, chairItemId, {
      searchId: searchId1, // Mismatched old searchId!
      searchStatus: "completed",
      candidates: [oldStaleProduct],
      searchError: null,
    });

    // Verify: Stale update was REJECTED!
    const itemAfterLate = findItemInWorkspace(wsAfterLateUpdate, chairItemId)?.item;
    assert.strictEqual(itemAfterLate?.searchId, searchId2, "searchId must still be search_chair_v2");
    assert.strictEqual(itemAfterLate?.candidates.length, 0, "Stale candidates must NOT be saved");
    assert.strictEqual(itemAfterLate?.searchStatus, "searching", "searchStatus must NOT be set to completed by stale response");
    assert.strictEqual(wsAfterLateUpdate.revision, ws.revision, "Workspace revision must NOT increment on rejected stale update");

    // Now Search 2 completes with valid searchId
    const wsAfterValidUpdate = updateItemSearchResults(ws, chairItemId, {
      searchId: searchId2,
      searchStatus: "completed",
      candidates: [sampleChair],
    });

    const itemAfterValid = findItemInWorkspace(wsAfterValidUpdate, chairItemId)?.item;
    assert.strictEqual(itemAfterValid?.searchStatus, "completed");
    assert.strictEqual(itemAfterValid?.candidates.length, 1);
    assert.strictEqual(itemAfterValid?.candidates[0].sourceProductId, "chair_leather_ergonomic");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test E: Start searches for two different items and complete out of order
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test E: Start searches for two different items and complete out of order -> results remain with originating item", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Gaming Chair",
    });
    const chairItemId = ws.activeItemId!;

    ws = addIndependentItem(ws, {
      productRequest: "Gaming headphones",
      category: "Electronics",
      displayName: "Gaming Headphones",
    });
    const hpItemId = ws.activeItemId!;

    // Start chair search
    const chairSearchId = "search_chair_e1";
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId: chairSearchId,
      searchFingerprint: "fp_chair",
      searchStatus: "searching",
    });

    // Start headphone search
    const hpSearchId = "search_hp_e2";
    ws = updateItemSearchResults(ws, hpItemId, {
      searchId: hpSearchId,
      searchFingerprint: "fp_hp",
      searchStatus: "searching",
    });

    // Complete Headphone search FIRST (out of order)
    ws = updateItemSearchResults(ws, hpItemId, {
      searchId: hpSearchId,
      searchStatus: "completed",
      candidates: [sampleHeadphones],
    });

    // Complete Chair search SECOND
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId: chairSearchId,
      searchStatus: "completed",
      candidates: [sampleChair],
    });

    const finalChairItem = findItemInWorkspace(ws, chairItemId)?.item;
    const finalHpItem = findItemInWorkspace(ws, hpItemId)?.item;

    assert.strictEqual(finalChairItem?.candidates.length, 1);
    assert.strictEqual(finalChairItem?.candidates[0].sourceProductId, "chair_leather_ergonomic");

    assert.strictEqual(finalHpItem?.candidates.length, 1);
    assert.strictEqual(finalHpItem?.candidates[0].sourceProductId, "hp_wireless_anc");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test F: Switch active item while search is running -> result saved to original item without changing active item
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test F: Switch active item while search is running -> result saved to original item without changing active item", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Gaming Chair",
    });
    const chairItemId = ws.activeItemId!;

    ws = addIndependentItem(ws, {
      productRequest: "Gaming headphones",
      category: "Electronics",
      displayName: "Gaming Headphones",
    });
    const hpItemId = ws.activeItemId!;

    // Chair starts searching
    const chairSearchId = "search_chair_f";
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId: chairSearchId,
      searchFingerprint: "fp_chair_f",
      searchStatus: "searching",
    });

    // Switch active item to headphones
    ws = setActiveWorkspaceItem(ws, hpItemId);
    assert.strictEqual(ws.activeItemId, hpItemId, "Active item must be headphones");

    // Chair search completes while headphones is the active item
    ws = updateItemSearchResults(ws, chairItemId, {
      searchId: chairSearchId,
      searchStatus: "completed",
      candidates: [sampleChair],
    });

    // Verify active item is STILL headphones
    assert.strictEqual(ws.activeItemId, hpItemId, "Active item must NOT change when chair search completes");

    // Verify chair results were saved on chair item
    const chairItem = findItemInWorkspace(ws, chairItemId)?.item;
    assert.strictEqual(chairItem?.candidates.length, 1);
    assert.strictEqual(chairItem?.candidates[0].sourceProductId, "chair_leather_ergonomic");

    // Verify headphones item was not modified
    const hpItem = findItemInWorkspace(ws, hpItemId)?.item;
    assert.strictEqual(hpItem?.candidates.length, 0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test G: Update active item's comparison -> another item's comparison remains unchanged
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test G: Update active item comparison -> another item's comparison remains unchanged", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Gaming Chair",
    });
    const chairItemId = ws.activeItemId!;
    ws = updateItemSearchResults(ws, chairItemId, { candidates: [sampleChair] });
    ws = updateItemComparison(ws, chairItemId, comparison1, evidence1);

    ws = addIndependentItem(ws, {
      productRequest: "Gaming headphones",
      category: "Electronics",
      displayName: "Gaming Headphones",
    });
    const hpItemId = ws.activeItemId!;
    ws = updateItemSearchResults(ws, hpItemId, { candidates: [sampleHeadphones] });
    ws = updateItemComparison(ws, hpItemId, comparison2, {});

    // Refine comparison on headphones
    const refinedHpComparison: AiComparisonResult = {
      summary: "Refined headphone comparison",
      bestMatchProductId: "hp_wireless_anc",
      bestMatchReason: "Refined for battery life",
      priorityInterpretation: ["Battery"],
      criteria: [],
      tradeoffs: [],
      alternativePicks: [],
      missingInformation: [],
    };
    ws = updateItemComparison(ws, hpItemId, refinedHpComparison, {});

    const hpItem = findItemInWorkspace(ws, hpItemId)?.item;
    assert.strictEqual(hpItem?.comparison?.summary, "Refined headphone comparison");

    const chairItem = findItemInWorkspace(ws, chairItemId)?.item;
    assert.strictEqual(chairItem?.comparison?.summary, "Comparison summary 1", "Chair comparison must be unchanged");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test H: Change one item's retailer offer -> another item remains unchanged
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test H: Change one item's retailer offer -> another item remains unchanged", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Gaming Chair",
    });
    const chairItemId = ws.activeItemId!;
    ws = updateItemSearchResults(ws, chairItemId, { candidates: [sampleChair] });
    ws = selectProductForItem(ws, chairItemId, sampleChair, sampleChair.offers![0]);

    ws = addIndependentItem(ws, {
      productRequest: "Gaming headphones",
      category: "Electronics",
      displayName: "Gaming Headphones",
    });
    const hpItemId = ws.activeItemId!;
    ws = updateItemSearchResults(ws, hpItemId, { candidates: [sampleHeadphones] });
    ws = selectProductForItem(ws, hpItemId, sampleHeadphones, sampleHeadphones.offers![0]);

    // Change offer for headphones to retailer 2 ($169.99)
    const newOffer: ProductOfferItem = sampleHeadphones.offers![1];
    ws = selectOfferForItem(ws, hpItemId, "hp_wireless_anc", newOffer);

    const hpItem = findItemInWorkspace(ws, hpItemId)?.item;
    assert.strictEqual(hpItem?.selectedOffer?.id, "off_hp_retailer2");
    assert.strictEqual(hpItem?.selectedOffer?.priceMinor, 16999);

    const chairItem = findItemInWorkspace(ws, chairItemId)?.item;
    assert.strictEqual(chairItem?.selectedOffer?.id, "off_chair_1");
    assert.strictEqual(chairItem?.selectedOffer?.priceMinor, 95000, "Chair offer price must remain 95000");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test I: Attempt search without itemId -> application rejects safely
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test I: Attempt search with missing or invalid itemId -> rejected and workspace preserved", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Gaming Chair",
    });
    const chairItemId = ws.activeItemId!;

    // Attempt update with empty/missing itemId
    const wsAfterEmptyId = updateItemSearchResults(ws, "", {
      searchId: "search_invalid",
      searchStatus: "completed",
      candidates: [sampleChair],
    });
    assert.strictEqual(wsAfterEmptyId.revision, ws.revision, "Empty itemId must be rejected");

    // Attempt update with non-existent itemId
    const wsAfterNonExistentId = updateItemSearchResults(ws, "item_does_not_exist", {
      searchId: "search_invalid",
      searchStatus: "completed",
      candidates: [sampleChair],
    });
    assert.strictEqual(wsAfterNonExistentId.revision, ws.revision, "Non-existent itemId must be rejected");

    // Original item is completely unaffected
    const chairItem = findItemInWorkspace(wsAfterNonExistentId, chairItemId)?.item;
    assert.strictEqual(chairItem?.candidates.length, 0);
    assert.strictEqual(chairItem?.searchStatus, undefined);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test Fingerprint Determinism & Key Ordering
  // ─────────────────────────────────────────────────────────────────────────────
  test("Search Fingerprint: stable canonical serialization regardless of object key order", () => {
    const fp1 = buildItemSearchFingerprint({
      itemId: "item_123",
      searchQuery: "Gaming Chair",
      budgetMinor: 100000,
      currency: "USD",
      hardConstraints: { material: "leather", ergonomics: true },
      preferences: { color: "black", brand: "Secretlab" },
    });

    // Same values, different key insertion order
    const fp2 = buildItemSearchFingerprint({
      itemId: "item_123",
      searchQuery: "  gaming chair  ",
      budgetMinor: 100000,
      currency: "USD",
      hardConstraints: { ergonomics: true, material: "leather" },
      preferences: { brand: "Secretlab", color: "black" },
    });

    assert.strictEqual(fp1, fp2, "Fingerprints with identical attributes in different key order must be equal");

    // Changed material produces different fingerprint
    const fp3 = buildItemSearchFingerprint({
      itemId: "item_123",
      searchQuery: "Gaming Chair",
      budgetMinor: 100000,
      currency: "USD",
      hardConstraints: { material: "fabric", ergonomics: true },
      preferences: { color: "black", brand: "Secretlab" },
    });

    assert.notStrictEqual(fp1, fp3, "Changed constraint must produce a different fingerprint");
  });
});
