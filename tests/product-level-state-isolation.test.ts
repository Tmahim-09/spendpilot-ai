import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createInitialWorkspace,
  addIndependentItem,
  setActiveWorkspaceItem,
  getActiveWorkspaceItem,
  findItemInWorkspace,
  selectProductForItem,
  updateItemSearchResults,
  updateItemComparison,
  selectOfferForItem,
  updateVariantForItem,
} from "../src/lib/workspace/workspace-manager.ts";
import { resolveRequirementForItem } from "../src/lib/workspace/sync-engine.ts";
import type {
  NormalizedProduct,
  AiComparisonResult,
  EvidenceFact,
  ProductOfferItem,
  ProductVariantSelection,
} from "../src/types/index.ts";
import type { ShoppingBrief } from "../src/lib/orchestrator/types.ts";

describe("SPENDPILOT RELEASE FIX PHASE 1: Complete Product-Level State Isolation (Tests A - H)", () => {
  const sampleChair1: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "chair_herman_miller_x",
    title: "Herman Miller Embody Gaming Chair",
    imageUrl: "https://example.com/embody.jpg",
    priceMinor: 159500,
    currency: "USD",
    retailerName: "Herman Miller",
    retailerUrl: "https://hermanmiller.com/embody",
    availability: "in_stock",
    specifications: { Material: "Sync Fabric", Warranty: "12 years" },
    sourceFacts: ["BackFit adjustment", "Pixelated support"],
    offers: [
      {
        id: "off_hm_1",
        domain: "hermanmiller.com",
        priceMinor: 159500,
        currency: "USD",
        availability: "in_stock",
        url: "https://hermanmiller.com/embody",
      },
    ],
  };

  const sampleChair2: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "chair_secretlab_titan",
    title: "Secretlab TITAN Evo 2024",
    imageUrl: "https://example.com/titan.jpg",
    priceMinor: 54900,
    currency: "USD",
    retailerName: "Secretlab",
    retailerUrl: "https://secretlab.co/titan",
    availability: "in_stock",
    specifications: { Material: "Hybrid Leatherette" },
    sourceFacts: ["4-way lumbar support", "Magnetic head pillow"],
    offers: [
      {
        id: "off_sec_1",
        domain: "secretlab.co",
        priceMinor: 54900,
        currency: "USD",
        availability: "in_stock",
        url: "https://secretlab.co/titan",
      },
    ],
  };

  const sampleHeadphones1: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "hp_sony_wh1000xm5",
    title: "Sony WH-1000XM5 Wireless Noise-Canceling Headphones",
    imageUrl: "https://example.com/xm5.jpg",
    priceMinor: 39800,
    currency: "USD",
    retailerName: "Sony Store",
    retailerUrl: "https://sony.com/wh1000xm5",
    availability: "in_stock",
    specifications: { BatteryLife: "30h", NoiseCanceling: "Dual Processor V1" },
    sourceFacts: ["Industry-leading ANC", "Auto NC Optimizer"],
    offers: [
      {
        id: "off_sony_1",
        domain: "sony.com",
        priceMinor: 39800,
        currency: "USD",
        availability: "in_stock",
        url: "https://sony.com/wh1000xm5",
      },
      {
        id: "off_sony_bestbuy",
        domain: "bestbuy.com",
        priceMinor: 34999,
        currency: "USD",
        availability: "in_stock",
        url: "https://bestbuy.com/sony-wh1000xm5",
      },
    ],
  };

  const sampleHeadphones2: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "hp_bose_qc_ultra",
    title: "Bose QuietComfort Ultra Headphones",
    imageUrl: "https://example.com/bose.jpg",
    priceMinor: 42900,
    currency: "USD",
    retailerName: "Bose",
    retailerUrl: "https://bose.com/qc-ultra",
    availability: "in_stock",
    specifications: { BatteryLife: "24h", SpatialAudio: "Immersive Audio" },
    sourceFacts: ["World-class ANC", "CustomTune technology"],
    offers: [
      {
        id: "off_bose_1",
        domain: "bose.com",
        priceMinor: 42900,
        currency: "USD",
        availability: "in_stock",
        url: "https://bose.com/qc-ultra",
      },
    ],
  };

  const chairComparison: AiComparisonResult = {
    summary: "Herman Miller Embody offers superior medical-grade ergonomics, while Secretlab offers value and versatility.",
    bestMatchProductId: "chair_herman_miller_x",
    bestMatchReason: "Unsurpassed ergonomic spinal support for long work sessions.",
    priorityInterpretation: ["Ergonomics", "Durability"],
    criteria: [
      {
        name: "Ergonomics",
        importance: "high",
        assessments: [
          {
            productId: "chair_herman_miller_x",
            assessment: "strong",
            reason: "Pixelated matrix conforms naturally.",
            evidenceFactIds: ["fact_chair_1"],
          },
        ],
      },
    ],
    tradeoffs: [
      {
        productId: "chair_herman_miller_x",
        summary: "Premium price for unmatched 12-year warranty and ergonomic support.",
      },
    ],
    alternativePicks: [
      {
        productId: "chair_secretlab_titan",
        bestFor: "Best adjustability and value under $600.",
        reason: "4-way lumbar and magnetic head pillow at lower price.",
      },
    ],
    missingInformation: [],
  };

  const chairEvidence: Record<string, EvidenceFact> = {
    fact_chair_1: {
      id: "fact_chair_1",
      productId: "chair_herman_miller_x",
      category: "feature",
      label: "Ergonomics",
      value: "Pixelated Support Matrix",
      sourceField: "sourceFacts",
    },
  };

  const headphoneComparison1: AiComparisonResult = {
    summary: "Sony WH-1000XM5 leads in active noise cancellation.",
    bestMatchProductId: "hp_sony_wh1000xm5",
    bestMatchReason: "Class-leading ANC and 30-hour battery life.",
    priorityInterpretation: ["Noise Cancellation", "Sound Quality"],
    criteria: [],
    tradeoffs: [
      {
        productId: "hp_sony_wh1000xm5",
        summary: "Excellent ANC, but does not fold as compactly as predecessors.",
      },
    ],
    alternativePicks: [],
    missingInformation: [],
  };

  const headphoneEvidence1: Record<string, EvidenceFact> = {
    fact_hp_1: {
      id: "fact_hp_1",
      productId: "hp_sony_wh1000xm5",
      category: "feature",
      label: "Noise Canceling",
      value: "Dual Processor V1",
      sourceField: "specifications",
    },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Test A: Search gaming chair -> results saved only to chair item candidates
  //         -> active item is chair -> displays chair candidates
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test A: Search gaming chair -> results saved only to chair item candidates -> active item is chair", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Ergonomic Gaming Chair",
      individualBudget: { amountMinor: 100000, currency: "USD", strict: true },
    });

    const chairItem = getActiveWorkspaceItem(ws);
    assert.ok(chairItem, "Chair item must be active");
    assert.strictEqual(chairItem.displayName, "Ergonomic Gaming Chair");

    // Save search results specifically to the chair item
    ws = updateItemSearchResults(ws, chairItem.id, {
      candidates: [sampleChair1, sampleChair2],
      searchFingerprint: "fp_chair_test_a",
      searchStatus: "completed",
    });

    const updatedChairItem = findItemInWorkspace(ws, chairItem.id)?.item;
    assert.ok(updatedChairItem, "Chair item must exist in workspace");
    assert.strictEqual(updatedChairItem.candidates.length, 2, "Chair candidates must be saved");
    assert.strictEqual(updatedChairItem.candidates[0].sourceProductId, "chair_herman_miller_x");
    assert.strictEqual(updatedChairItem.candidates[1].sourceProductId, "chair_secretlab_titan");
    assert.strictEqual(updatedChairItem.searchStatus, "completed");

    // Verify active workspace item returns chair candidates
    const activeItem = getActiveWorkspaceItem(ws);
    assert.strictEqual(activeItem?.id, chairItem.id);
    assert.strictEqual(activeItem?.candidates.length, 2);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test B: Add gaming headphones -> search headphones with noise-canceling preference
  //         -> headphone results saved only to headphone item -> no chair constraints in headphone search
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test B: Add gaming headphones -> results saved only to headphone item -> no chair constraints leaked", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Ergonomic Gaming Chair",
      preferences: { material: "Leather" },
      hardConstraints: { type: "Ergonomic" },
    });
    const chairItemId = ws.activeItemId!;

    ws = updateItemSearchResults(ws, chairItemId, {
      candidates: [sampleChair1, sampleChair2],
      searchFingerprint: "fp_chair",
      searchStatus: "completed",
    });

    // Add independent item for headphones
    ws = addIndependentItem(ws, {
      productRequest: "Gaming headphones",
      category: "Electronics",
      displayName: "Noise-Canceling Gaming Headphones",
      preferences: { noise_canceling: "active" },
      individualBudget: { amountMinor: 40000, currency: "USD", strict: false },
    });
    const headphoneItemId = ws.activeItemId!;
    assert.notStrictEqual(chairItemId, headphoneItemId, "Headphone item has distinct ID from chair");

    const headphoneItem = findItemInWorkspace(ws, headphoneItemId)?.item;
    assert.ok(headphoneItem);
    // Verify no chair constraints leaked into headphone item
    assert.strictEqual(headphoneItem.preferences.material, undefined);
    assert.strictEqual(headphoneItem.hardConstraints.type, undefined);
    assert.strictEqual(headphoneItem.preferences.noise_canceling, "active");

    // Save headphone search results specifically to headphone item
    ws = updateItemSearchResults(ws, headphoneItemId, {
      candidates: [sampleHeadphones1, sampleHeadphones2],
      searchFingerprint: "fp_headphones",
      searchStatus: "completed",
    });

    const chairItemAfter = findItemInWorkspace(ws, chairItemId)?.item;
    const headphoneItemAfter = findItemInWorkspace(ws, headphoneItemId)?.item;

    assert.strictEqual(chairItemAfter?.candidates.length, 2);
    assert.strictEqual(chairItemAfter?.candidates[0].sourceProductId, "chair_herman_miller_x");

    assert.strictEqual(headphoneItemAfter?.candidates.length, 2);
    assert.strictEqual(headphoneItemAfter?.candidates[0].sourceProductId, "hp_sony_wh1000xm5");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test C: Out-of-order search responses:
  //         Search chair, switch to headphones, search headphones. Chair search completes late.
  //         Headphone candidates remain displayed. Chair candidates saved to chair item. Active item remains headphones.
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test C: Out-of-order search responses: late chair search does not overwrite active headphone item", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Gaming Chair",
    });
    const chairItemId = ws.activeItemId!;

    // Mark chair as searching
    ws = updateItemSearchResults(ws, chairItemId, {
      searchStatus: "searching",
      searchId: "search_chair_1",
    });

    // User switches to headphones and starts search
    ws = addIndependentItem(ws, {
      productRequest: "Gaming headphones",
      category: "Electronics",
      displayName: "Gaming Headphones",
    });
    const headphoneItemId = ws.activeItemId!;
    assert.strictEqual(ws.activeItemId, headphoneItemId);

    // Headphone search completes FIRST
    ws = updateItemSearchResults(ws, headphoneItemId, {
      candidates: [sampleHeadphones1, sampleHeadphones2],
      searchId: "search_hp_1",
      searchFingerprint: "fp_hp_done",
      searchStatus: "completed",
    });

    // Now late chair search response arrives
    ws = updateItemSearchResults(ws, chairItemId, {
      candidates: [sampleChair1, sampleChair2],
      searchId: "search_chair_1",
      searchFingerprint: "fp_chair_done_late",
      searchStatus: "completed",
    });

    // Verify: active item is STILL headphones (NOT flipped back to chair)
    assert.strictEqual(ws.activeItemId, headphoneItemId, "Active item must remain headphones");

    // Verify: currently displayed candidates on active item are headphones
    const activeItem = getActiveWorkspaceItem(ws);
    assert.strictEqual(activeItem?.id, headphoneItemId);
    assert.strictEqual(activeItem?.candidates.length, 2);
    assert.strictEqual(activeItem?.candidates[0].sourceProductId, "hp_sony_wh1000xm5");

    // Verify: chair item received and saved its own candidates cleanly
    const chairItem = findItemInWorkspace(ws, chairItemId)?.item;
    assert.strictEqual(chairItem?.candidates.length, 2);
    assert.strictEqual(chairItem?.candidates[0].sourceProductId, "chair_herman_miller_x");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test D: Compare products on chair -> comparison saved to chair item
  //         -> switch to headphones -> comparison display is null (not chair's comparison)
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test D: Compare products on chair -> comparison saved to chair item -> switch to headphones -> comparison is null", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Gaming Chair",
    });
    const chairItemId = ws.activeItemId!;

    ws = updateItemSearchResults(ws, chairItemId, {
      candidates: [sampleChair1, sampleChair2],
      searchStatus: "completed",
    });

    // Run comparison on chair
    ws = updateItemComparison(ws, chairItemId, chairComparison, chairEvidence);

    // Verify chair has comparison
    const chairItem = findItemInWorkspace(ws, chairItemId)?.item;
    assert.ok(chairItem?.comparison, "Chair must have comparison");
    assert.strictEqual(chairItem.comparison?.bestMatchProductId, "chair_herman_miller_x");

    // Add and switch to headphones
    ws = addIndependentItem(ws, {
      productRequest: "Gaming headphones",
      category: "Electronics",
      displayName: "Gaming Headphones",
    });
    const headphoneItemId = ws.activeItemId!;
    ws = updateItemSearchResults(ws, headphoneItemId, {
      candidates: [sampleHeadphones1, sampleHeadphones2],
      searchStatus: "completed",
    });

    // Headphone item has NO comparison yet
    const headphoneItem = findItemInWorkspace(ws, headphoneItemId)?.item;
    assert.strictEqual(headphoneItem?.comparison, undefined, "Headphones must NOT have comparison");

    // Active item display: derived strictly from active workspace item
    const activeItem = getActiveWorkspaceItem(ws);
    assert.strictEqual(activeItem?.id, headphoneItemId);
    const displayedComparison = activeItem?.comparison ?? null;
    assert.strictEqual(displayedComparison, null, "Active item comparison must be null, never falling back to chair comparison");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test E: Refine priority on headphones -> comparison updated only on headphone item
  //         -> chair comparison unchanged
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test E: Refine priority on headphones -> updates only headphone item -> chair comparison unchanged", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Gaming Chair",
    });
    const chairItemId = ws.activeItemId!;
    ws = updateItemSearchResults(ws, chairItemId, { candidates: [sampleChair1, sampleChair2] });
    ws = updateItemComparison(ws, chairItemId, chairComparison, chairEvidence);

    ws = addIndependentItem(ws, {
      productRequest: "Gaming headphones",
      category: "Electronics",
      displayName: "Gaming Headphones",
    });
    const headphoneItemId = ws.activeItemId!;
    ws = updateItemSearchResults(ws, headphoneItemId, { candidates: [sampleHeadphones1, sampleHeadphones2] });
    ws = updateItemComparison(ws, headphoneItemId, headphoneComparison1, headphoneEvidence1);

    // Refine priority on headphones
    const headphoneComparisonRefined: AiComparisonResult = {
      summary: "Bose QC Ultra offers superior spatial audio stage.",
      bestMatchProductId: "hp_bose_qc_ultra",
      bestMatchReason: "Superior spatial audio for immersive gaming.",
      priorityInterpretation: ["Spatial Audio", "Comfort"],
      criteria: [],
      tradeoffs: [
        {
          productId: "hp_bose_qc_ultra",
          summary: "Best spatial immersion at a higher price.",
        },
      ],
      alternativePicks: [],
      missingInformation: [],
    };

    ws = updateItemComparison(ws, headphoneItemId, headphoneComparisonRefined, {});

    // Verify headphones has refined comparison
    const headphoneItem = findItemInWorkspace(ws, headphoneItemId)?.item;
    assert.strictEqual(headphoneItem?.comparison?.bestMatchProductId, "hp_bose_qc_ultra");

    // Verify chair comparison is COMPLETELY UNTOUCHED
    const chairItem = findItemInWorkspace(ws, chairItemId)?.item;
    assert.strictEqual(chairItem?.comparison?.bestMatchProductId, "chair_herman_miller_x");
    assert.strictEqual(chairItem?.comparison?.summary, chairComparison.summary);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test F: Select offer on headphones -> updates only headphone item -> chair selection unchanged.
  //         Same for variant selection.
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test F: Select offer & variant on headphones -> updates only headphone item -> chair selection unchanged", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Gaming Chair",
    });
    const chairItemId = ws.activeItemId!;
    ws = updateItemSearchResults(ws, chairItemId, { candidates: [sampleChair1, sampleChair2] });
    // Select chair product
    ws = selectProductForItem(ws, chairItemId, sampleChair1, sampleChair1.offers?.[0]);

    ws = addIndependentItem(ws, {
      productRequest: "Gaming headphones",
      category: "Electronics",
      displayName: "Gaming Headphones",
    });
    const headphoneItemId = ws.activeItemId!;
    ws = updateItemSearchResults(ws, headphoneItemId, { candidates: [sampleHeadphones1, sampleHeadphones2] });
    // Select headphone product with original offer
    ws = selectProductForItem(ws, headphoneItemId, sampleHeadphones1, sampleHeadphones1.offers?.[0]);

    // Verify initial states
    const chairBefore = findItemInWorkspace(ws, chairItemId)?.item;
    const hpBefore = findItemInWorkspace(ws, headphoneItemId)?.item;
    assert.strictEqual(chairBefore?.selectedOffer?.id, "off_hm_1");
    assert.strictEqual(hpBefore?.selectedOffer?.id, "off_sony_1");

    // 1. Select a new offer for headphones (Best Buy at $349.99)
    const bestBuyOffer: ProductOfferItem = sampleHeadphones1.offers![1];
    ws = selectOfferForItem(ws, headphoneItemId, "hp_sony_wh1000xm5", bestBuyOffer);

    // Verify headphone offer updated
    const hpAfterOffer = findItemInWorkspace(ws, headphoneItemId)?.item;
    assert.strictEqual(hpAfterOffer?.selectedOffer?.id, "off_sony_bestbuy");
    assert.strictEqual(hpAfterOffer?.selectedOffer?.priceMinor, 34999);

    // Verify chair offer is STILL the original chair offer
    const chairAfterOffer = findItemInWorkspace(ws, chairItemId)?.item;
    assert.strictEqual(chairAfterOffer?.selectedOffer?.id, "off_hm_1");
    assert.strictEqual(chairAfterOffer?.selectedOffer?.priceMinor, 159500);

    // 2. Select a variant for headphones
    const hpVariant: ProductVariantSelection = {
      productId: "hp_sony_wh1000xm5",
      selectedOptions: { Color: "Silver" },
      confirmedPriceMinor: 34999,
      confirmedRetailerUrl: "https://bestbuy.com/sony-wh1000xm5",
      isConfirmed: true,
      title: "Sony WH-1000XM5 (Silver)",
    };
    ws = updateVariantForItem(ws, headphoneItemId, hpVariant);

    const hpAfterVariant = findItemInWorkspace(ws, headphoneItemId)?.item;
    assert.strictEqual(hpAfterVariant?.selectedVariant?.Color, "Silver");
    assert.strictEqual(hpAfterVariant?.selectedProduct?.title, "Sony WH-1000XM5 (Silver)");

    // Verify chair product and variant are completely unaffected
    const chairAfterVariant = findItemInWorkspace(ws, chairItemId)?.item;
    assert.strictEqual(chairAfterVariant?.selectedVariant, undefined);
    assert.strictEqual(chairAfterVariant?.selectedProduct?.title, "Herman Miller Embody Gaming Chair");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test G: Two product requirements in brief (chair, headphones)
  //         -> searching for headphones resolves headphone requirement -> chair searchQuery not used
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test G: Two product requirements in brief -> resolveRequirementForItem resolves exact item requirement, never array[0]", () => {
    const brief: ShoppingBrief = {
      schemaVersion: 1,
      taskId: "task_test_g",
      mode: "single_product",
      userGoal: "Find gaming chair and headphones",
      budget: { maximum: { amountMinor: 200000, currency: "USD" } },
      productRequirements: [
        {
          id: "req_chair_01",
          displayName: "Gaming Chair",
          category: "Furniture",
          searchQuery: "ergonomic high-back leather gaming chair",
          quantity: 1,
          purpose: ["gaming", "work"],
          constraints: [],
          excludedAttributes: [],
        },
        {
          id: "req_hp_02",
          displayName: "Gaming Headphones",
          category: "Electronics",
          searchQuery: "wireless noise-canceling spatial audio headset",
          quantity: 1,
          purpose: ["gaming", "calls"],
          constraints: [],
          excludedAttributes: [],
        },
      ],
      missingInformation: [],
      status: "collecting",
      updatedAt: new Date().toISOString(),
    };

    // Item 1: Chair linked to req_chair_01
    const chairItem = {
      id: "item_chair_123",
      requirementId: "req_chair_01",
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Gaming Chair",
      hardConstraints: {},
      preferences: {},
      priority: "essential" as const,
      status: "ready_to_search" as const,
      candidates: [],
      dependencies: [],
      answeredQuestionIds: [],
    };

    // Item 2: Headphones linked to req_hp_02
    const headphoneItem = {
      id: "item_hp_456",
      requirementId: "req_hp_02",
      productRequest: "Gaming headphones",
      category: "Electronics",
      displayName: "Gaming Headphones",
      hardConstraints: {},
      preferences: {},
      priority: "preferred" as const,
      status: "ready_to_search" as const,
      candidates: [],
      dependencies: [],
      answeredQuestionIds: [],
    };

    // Resolve requirement for headphone item
    const resolvedForHeadphones = resolveRequirementForItem(brief, headphoneItem);
    assert.ok(resolvedForHeadphones, "Must resolve requirement for headphones");
    assert.strictEqual(resolvedForHeadphones.id, "req_hp_02");
    assert.strictEqual(
      resolvedForHeadphones.searchQuery,
      "wireless noise-canceling spatial audio headset",
      "Must use headphones search query, NOT the first requirement's chair query"
    );

    // Resolve requirement for chair item
    const resolvedForChair = resolveRequirementForItem(brief, chairItem);
    assert.ok(resolvedForChair, "Must resolve requirement for chair");
    assert.strictEqual(resolvedForChair.id, "req_chair_01");
    assert.strictEqual(resolvedForChair.searchQuery, "ergonomic high-back leather gaming chair");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test H: Refresh / workspace reload -> both items restore with their respective
  //         candidates, comparisons, and selections intact
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test H: Refresh / workspace reload -> both items restore with respective candidates, comparisons, and selections intact", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "Gaming chair",
      category: "Furniture",
      displayName: "Gaming Chair",
    });
    const chairItemId = ws.activeItemId!;
    ws = updateItemSearchResults(ws, chairItemId, {
      candidates: [sampleChair1, sampleChair2],
      searchFingerprint: "fp_chair_persist",
      searchStatus: "completed",
    });
    ws = updateItemComparison(ws, chairItemId, chairComparison, chairEvidence);
    ws = selectProductForItem(ws, chairItemId, sampleChair1, sampleChair1.offers?.[0]);

    ws = addIndependentItem(ws, {
      productRequest: "Gaming headphones",
      category: "Electronics",
      displayName: "Gaming Headphones",
    });
    const headphoneItemId = ws.activeItemId!;
    ws = updateItemSearchResults(ws, headphoneItemId, {
      candidates: [sampleHeadphones1, sampleHeadphones2],
      searchFingerprint: "fp_hp_persist",
      searchStatus: "completed",
    });
    ws = updateItemComparison(ws, headphoneItemId, headphoneComparison1, headphoneEvidence1);
    ws = selectProductForItem(ws, headphoneItemId, sampleHeadphones1, sampleHeadphones1.offers?.[1]);

    // Set active item to chair to verify activeItemId restoration
    ws = setActiveWorkspaceItem(ws, chairItemId);

    // Simulate serialization & deserialization (localStorage persistence cycle)
    const serialized = JSON.stringify(ws);
    const restoredWs = JSON.parse(serialized);

    assert.strictEqual(restoredWs.activeItemId, chairItemId, "Active item must be preserved");
    const activeRestored = getActiveWorkspaceItem(restoredWs);
    assert.ok(activeRestored);
    assert.strictEqual(activeRestored.id, chairItemId);
    assert.strictEqual(activeRestored.candidates.length, 2);
    assert.strictEqual(activeRestored.comparison?.bestMatchProductId, "chair_herman_miller_x");
    assert.strictEqual(activeRestored.selectedProduct?.sourceProductId, "chair_herman_miller_x");

    // Check headphone item in restored workspace
    const hpRestored = findItemInWorkspace(restoredWs, headphoneItemId)?.item;
    assert.ok(hpRestored);
    assert.strictEqual(hpRestored.candidates.length, 2);
    assert.strictEqual(hpRestored.candidates[0].sourceProductId, "hp_sony_wh1000xm5");
    assert.strictEqual(hpRestored.comparison?.bestMatchProductId, "hp_sony_wh1000xm5");
    assert.strictEqual(hpRestored.selectedProduct?.sourceProductId, "hp_sony_wh1000xm5");
    assert.strictEqual(hpRestored.selectedOffer?.id, "off_sony_bestbuy");
  });
});
