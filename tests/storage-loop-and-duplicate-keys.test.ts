import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Channel3Api } from "@channel3/sdk";
import type { NormalizedProduct } from "../src/types/index.ts";
import {
  normalizeChannel3Products,
} from "../src/lib/channel3/normalize-products.ts";
import {
  saveWorkspaceToStorage,
  subscribeWorkspace,
  parseStoredWorkspace,
  clearStoredWorkspace,
  getWorkspaceSnapshot,
} from "../src/lib/workspace/workspace-storage.ts";
import {
  createInitialWorkspace,
  addIndependentItem,
  selectProductForItem,
} from "../src/lib/workspace/workspace-manager.ts";
import { runAiComparison } from "../src/lib/ai/gemini-comparison.ts";

describe("SpendPilot AI: Storage Loop Prevention & Strict Key Uniqueness", () => {
  beforeEach(() => {
    // Setup a clean window/localStorage mock for node test environment
    const storageMap = new Map<string, string>();
    const listeners: Record<string, ((e: Event) => void)[]> = {};

    (global as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => storageMap.get(k) || null,
        setItem: (k: string, v: string) => storageMap.set(k, v),
        removeItem: (k: string) => storageMap.delete(k),
        clear: () => storageMap.clear(),
      },
      addEventListener: (type: string, cb: (e: Event) => void) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(cb);
      },
      removeEventListener: (type: string, cb: (e: Event) => void) => {
        if (!listeners[type]) return;
        listeners[type] = listeners[type].filter((fn) => fn !== cb);
      },
      dispatchEvent: (e: Event) => {
        const fns = listeners[e.type] || [];
        for (const fn of fns) fn(e);
        return true;
      },
    };
  });

  test("1. saveWorkspaceToStorage does NOT dispatch synthetic 'storage' events on window", () => {
    const ws = createInitialWorkspace({ id: "test_ws_1", currency: "USD" });
    let windowStorageEventFired = false;

    // Listen on window for native 'storage' events
    (global as unknown as { window: { addEventListener: (t: string, cb: () => void) => void } }).window.addEventListener(
      "storage",
      () => {
        windowStorageEventFired = true;
      }
    );

    saveWorkspaceToStorage(ws);

    // Native storage listeners on the same window must NEVER be triggered by same-tab saves
    assert.strictEqual(
      windowStorageEventFired,
      false,
      "saveWorkspaceToStorage must not dispatch synthetic storage events on window (breaks React render loop)"
    );

    // Storage itself should have the written data
    const snapshot = getWorkspaceSnapshot();
    assert.ok(snapshot.includes("test_ws_1"));
  });

  test("2. subscribeWorkspace in-memory registry receives same-tab reactive updates without window event", () => {
    let subscriberNotifiedCount = 0;
    const unsubscribe = subscribeWorkspace(() => {
      subscriberNotifiedCount++;
    });

    const ws = createInitialWorkspace({ id: "test_ws_sub", currency: "USD" });
    saveWorkspaceToStorage(ws);

    assert.strictEqual(subscriberNotifiedCount, 1, "In-memory subscriber should be notified on save");

    // Saving identical workspace is a no-op and must not trigger subscriber again
    saveWorkspaceToStorage(ws);
    assert.strictEqual(
      subscriberNotifiedCount,
      1,
      "Subsequent identical saves must be short-circuited to prevent infinite cycles"
    );

    unsubscribe();
  });

  test("3. normalizeChannel3Products merges duplicate product listings and unique retailer offers", () => {
    const duplicateProductBatch: Channel3Api.Product[] = [
      {
        id: "W0fj10q",
        title: "Motion 1 Haptic Gaming Chair",
        brands: [{ id: "b1", name: "Cooler Master" }],
        offers: [
          {
            domain: "bestbuy.com",
            url: "https://buy.channel3.com/chair-bestbuy",
            price: { price: 999.99, currency: "USD" },
            availability: "InStock" as Channel3Api.OfferAvailabilityStatus,
          },
        ],
      },
      {
        id: "W0fj10q", // Exact same product ID from a second merchant
        title: "Motion 1 Haptic Gaming Chair",
        brands: [{ id: "b1", name: "Cooler Master" }],
        offers: [
          {
            domain: "amazon.com",
            url: "https://buy.channel3.com/chair-amazon",
            price: { price: 949.99, currency: "USD" },
            availability: "InStock" as Channel3Api.OfferAvailabilityStatus,
          },
        ],
      },
      {
        id: "yA4RaG9",
        title: "Secretlab TITAN Evo Gaming Chair",
        brands: [{ id: "b2", name: "Secretlab" }],
        offers: [
          {
            domain: "secretlab.co",
            url: "https://buy.channel3.com/secretlab-direct",
            price: { price: 549.0, currency: "USD" },
            availability: "InStock" as Channel3Api.OfferAvailabilityStatus,
          },
        ],
      },
    ];

    const normalized = normalizeChannel3Products(duplicateProductBatch, "USD");

    // Exactly 2 unique canonical products
    assert.strictEqual(normalized.length, 2, "Duplicate product listings must be merged by sourceProductId");
    assert.strictEqual(normalized[0].sourceProductId, "W0fj10q");
    assert.strictEqual(normalized[1].sourceProductId, "yA4RaG9");

    // W0fj10q now has both retailer offers merged
    assert.strictEqual(normalized[0].offersCount, 2, "Separate retailer offers must be merged into product.offers");
    assert.strictEqual(normalized[0].offers?.[0]?.domain, "bestbuy.com");
    assert.strictEqual(normalized[0].offers?.[1]?.domain, "amazon.com");

    // Offers have unique stable IDs
    assert.ok(normalized[0].offers?.[0]?.id, "Offer must have a defined id");
    assert.ok(normalized[0].offers?.[1]?.id, "Offer must have a defined id");
    assert.notStrictEqual(normalized[0].offers?.[0]?.id, normalized[0].offers?.[1]?.id);
  });

  test("4. runAiComparison returns strictly unique product keys in allProducts (regression test for W0fj10q and yA4RaG9)", async () => {
    // Construct 8 realistic mock candidate products where items 6 and 7 are the reported IDs
    const mockProducts: NormalizedProduct[] = [
      { source: "channel3", sourceProductId: "prod_0", title: "Budget Office Chair", imageUrl: null, priceMinor: 15000, currency: "USD", retailerName: "Store A", retailerUrl: "#", availability: "in_stock", offers: [], offersCount: 0, specifications: {}, sourceFacts: [] },
      { source: "channel3", sourceProductId: "prod_1", title: "Ergonomic Task Chair", imageUrl: null, priceMinor: 25000, currency: "USD", retailerName: "Store B", retailerUrl: "#", availability: "in_stock", offers: [], offersCount: 0, specifications: {}, sourceFacts: [] },
      { source: "channel3", sourceProductId: "prod_2", title: "Mesh Swivel Chair", imageUrl: null, priceMinor: 35000, currency: "USD", retailerName: "Store C", retailerUrl: "#", availability: "in_stock", offers: [], offersCount: 0, specifications: {}, sourceFacts: [] },
      { source: "channel3", sourceProductId: "prod_3", title: "Executive Leather Chair", imageUrl: null, priceMinor: 45000, currency: "USD", retailerName: "Store D", retailerUrl: "#", availability: "in_stock", offers: [], offersCount: 0, specifications: {}, sourceFacts: [] },
      { source: "channel3", sourceProductId: "prod_4", title: "Pro Gaming Chair", imageUrl: null, priceMinor: 55000, currency: "USD", retailerName: "Store E", retailerUrl: "#", availability: "in_stock", offers: [], offersCount: 0, specifications: {}, sourceFacts: [] },
      { source: "channel3", sourceProductId: "prod_5", title: "High-End Racing Chair", imageUrl: null, priceMinor: 65000, currency: "USD", retailerName: "Store F", retailerUrl: "#", availability: "in_stock", offers: [], offersCount: 0, specifications: {}, sourceFacts: [] },
      // Index 6 and 7: Close to a 1000 USD budget ($999 and $950)
      { source: "channel3", sourceProductId: "W0fj10q", title: "Motion 1 Haptic Gaming Chair", imageUrl: null, priceMinor: 99999, currency: "USD", retailerName: "BestBuy", retailerUrl: "#", availability: "in_stock", offers: [], offersCount: 0, specifications: {}, sourceFacts: [] },
      { source: "channel3", sourceProductId: "yA4RaG9", title: "Titan Evo 2024 Gaming Chair", imageUrl: null, priceMinor: 95000, currency: "USD", retailerName: "Secretlab", retailerUrl: "#", availability: "in_stock", offers: [], offersCount: 0, specifications: {}, sourceFacts: [] },
    ];

    const mockAiClient = {
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            summary: "Comparison of top gaming chairs",
            bestMatchProductId: "W0fj10q",
            bestMatchReason: "Optimal ergonomics and comfort within budget",
            priorityInterpretation: ["1000 USD budget"],
            criteria: [
              {
                name: "Comfort & Ergonomics",
                importance: "high",
                assessments: {
                  W0fj10q: { rating: "strong", explanation: "Superior support" },
                  yA4RaG9: { rating: "strong", explanation: "Great cushioning" },
                },
              },
            ],
            tradeoffs: [],
            alternativePicks: [
              {
                productId: "yA4RaG9",
                bestFor: "Firm support",
                reason: "Titan Evo provides firm cold-cure foam",
              },
            ],
            missingInformation: [],
          }),
        }),
      },
    } as unknown as import("@google/genai").GoogleGenAI;

    const result = await runAiComparison({
      query: "gaming chair for 1000 USD",
      products: mockProducts,
      budget: 1000,
      currency: "USD",
      requestId: "test_duplicate_key_regression",
      aiClient: mockAiClient,
    });

    // Count occurrences of each product ID in allProducts
    const idCounts = new Map<string, number>();
    for (const p of result.allProducts) {
      const id = p.sourceProductId || p.title;
      idCounts.set(id, (idCounts.get(id) || 0) + 1);
    }

    // W0fj10q and yA4RaG9 MUST appear at most once in allProducts
    assert.strictEqual(idCounts.get("W0fj10q") || 0, 1, "W0fj10q must appear exactly once in allProducts");
    assert.strictEqual(idCounts.get("yA4RaG9") || 0, 1, "yA4RaG9 must appear exactly once in allProducts");

    // Every product in allProducts must have a count of exactly 1
    for (const [id, count] of idCounts.entries()) {
      assert.strictEqual(count, 1, `Product ${id} must not appear more than once in allProducts`);
    }

    // Also assert topRecommendations and otherMatches are mutually exclusive
    const topIds = new Set(result.topRecommendations.map((p) => p.sourceProductId || p.title));
    for (const p of result.otherMatches) {
      const id = p.sourceProductId || p.title;
      assert.strictEqual(topIds.has(id), false, `Product ${id} must not appear in both topRecommendations and otherMatches`);
    }
  });

  test("5. Parsing and workspace restoration correctly reconstructs selected item states", () => {
    let ws = createInitialWorkspace({ id: "cart_session_1", currency: "USD" });
    const product: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "W0fj10q",
      title: "Motion 1 Haptic Gaming Chair",
      imageUrl: null,
      priceMinor: 99999,
      currency: "USD",
      retailerName: "BestBuy",
      retailerUrl: "https://bestbuy.com",
      availability: "in_stock",
      offers: [],
      offersCount: 1,
      specifications: {},
      sourceFacts: [],
    };

    ws = addIndependentItem(ws, {
      productRequest: "gaming chair",
      displayName: "Motion 1 Haptic Gaming Chair",
    });

    const itemId = ws.groups[0].items[0].id;
    ws = selectProductForItem(ws, itemId, product);

    saveWorkspaceToStorage(ws);

    const snapshot = getWorkspaceSnapshot();
    const parsed = parseStoredWorkspace(snapshot);

    assert.ok(parsed !== null);
    assert.strictEqual(parsed.id, "cart_session_1");
    assert.strictEqual(parsed.groups.length, 1);
    assert.strictEqual(parsed.groups[0].items[0].selectedProductId, "W0fj10q");
    assert.strictEqual(parsed.groups[0].items[0].status, "selected");

    // Clear workspace cleanly
    clearStoredWorkspace();
    assert.strictEqual(getWorkspaceSnapshot(), "");
    assert.strictEqual(parseStoredWorkspace(getWorkspaceSnapshot()), null);
  });
});
