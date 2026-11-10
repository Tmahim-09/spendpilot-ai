import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeInteractionResponse } from "../src/lib/ai/normalize-interaction-response.ts";
import { SPENDPILOT_SEARCHING_TEXTS } from "../src/lib/ai/conversation-engine.ts";
import { prepareComparisonShortlist } from "../src/lib/ai/gemini-comparison.ts";
import { detectPricePreferenceFromQuery, resolvePricePreference } from "../src/lib/shopping/price-policy.ts";
import type { NormalizedProduct } from "../src/types/index.ts";

describe("SpendPilot AI: Budget Proximity, Searching Fallbacks & 4-Product Comparison Cap", () => {
  // 1. Fallback text fix: Never emits "What specific preferences do you have in mind?" before search
  test("1. When ready for search, replaces generic preferences question with dynamic searching text", () => {
    const rawJson = JSON.stringify({
      action: "start_product_search",
      readyForSearch: true,
      assistantMessage: "I'm ready to help you find what you need. What specific preferences do you have in mind?",
    });

    const normalized = normalizeInteractionResponse(rawJson);
    assert.strictEqual(normalized.readyForSearch, true);
    assert.ok(
      !normalized.assistantMessage.includes("What specific preferences do you have in mind"),
      "Generic preferences question must be eliminated"
    );
    assert.ok(
      (SPENDPILOT_SEARCHING_TEXTS as readonly string[]).includes(normalized.assistantMessage),
      `Expected assistantMessage to be one of SPENDPILOT_SEARCHING_TEXTS, got: "${normalized.assistantMessage}"`
    );
  });

  test("2. Empty output with action search_products uses dynamic searching text instead of generic preferences question", () => {
    const rawJson = JSON.stringify({
      action: "search_products",
      readyForSearch: true,
      assistantMessage: "",
    });

    const normalized = normalizeInteractionResponse(rawJson);
    assert.ok(
      !normalized.assistantMessage.includes("What specific preferences do you have in mind"),
      "Must not use generic preference prompt"
    );
    assert.ok(
      (SPENDPILOT_SEARCHING_TEXTS as readonly string[]).includes(normalized.assistantMessage),
      `Expected dynamic searching text, got: "${normalized.assistantMessage}"`
    );
  });

  // 3. Price preference detection: "Close to budget" vs "Best budget saver"
  test("3. Accurately detects 'close to budget' vs 'best budget saver' intent", () => {
    assert.strictEqual(detectPricePreferenceFromQuery("show me options close to budget"), "near_budget");
    assert.strictEqual(detectPricePreferenceFromQuery("closest to my budget"), "near_budget");
    assert.strictEqual(detectPricePreferenceFromQuery("best budget saver"), "best_value");
    assert.strictEqual(detectPricePreferenceFromQuery("cheapest one"), "best_value");
    assert.strictEqual(detectPricePreferenceFromQuery("save money please"), "best_value");

    // Default resolution without explicit modifier is near_budget
    assert.strictEqual(resolvePricePreference(undefined, "gaming chair for $1000"), "near_budget");
    // Explicit override takes precedence
    assert.strictEqual(resolvePricePreference("best_value", "gaming chair close to budget"), "best_value");
  });

  // 4. Budget proximity: Candidates closest to $100 budget are shortlisted first (e.g. $95 vs $44)
  test("4. Shortlist strictly limits side-by-side comparison to top 4 products closest to budget", () => {
    const candidateProducts: NormalizedProduct[] = [
      {
        source: "channel3",
        sourceProductId: "prod-cheap-44",
        title: "Budget Entry Chair $44",
        priceMinor: 4400,
        currency: "USD",
        availability: "in_stock",
        retailerName: "Store A",
        retailerUrl: "https://example.com/a",
        imageUrl: "https://example.com/a.jpg",
        specifications: {},
        offersCount: 1,
        sourceFacts: ["Basic plastic frame"],
      },
      {
        source: "channel3",
        sourceProductId: "prod-near-89",
        title: "Quality Mid-Range Chair $89",
        priceMinor: 8900,
        currency: "USD",
        availability: "in_stock",
        retailerName: "Store B",
        retailerUrl: "https://example.com/b",
        imageUrl: "https://example.com/b.jpg",
        specifications: {},
        offersCount: 1,
        sourceFacts: ["Breathable mesh, lumbar support"],
      },
      {
        source: "channel3",
        sourceProductId: "prod-near-95",
        title: "Premium Ergonomic Chair $95",
        priceMinor: 9500,
        currency: "USD",
        availability: "in_stock",
        retailerName: "Store C",
        retailerUrl: "https://example.com/c",
        imageUrl: "https://example.com/c.jpg",
        specifications: {},
        offersCount: 1,
        sourceFacts: ["High density foam, steel base"],
      },
      {
        source: "channel3",
        sourceProductId: "prod-near-99",
        title: "Top Tier Mesh Chair $99",
        priceMinor: 9900,
        currency: "USD",
        availability: "in_stock",
        retailerName: "Store D",
        retailerUrl: "https://example.com/d",
        imageUrl: "https://example.com/d.jpg",
        specifications: {},
        offersCount: 1,
        sourceFacts: ["Full adjustability, 4D armrests"],
      },
      {
        source: "channel3",
        sourceProductId: "prod-entry-35",
        title: "Low End Stool $35",
        priceMinor: 3500,
        currency: "USD",
        availability: "in_stock",
        retailerName: "Store E",
        retailerUrl: "https://example.com/e",
        imageUrl: "https://example.com/e.jpg",
        specifications: {},
        offersCount: 1,
        sourceFacts: ["Simple stool"],
      },
      {
        source: "channel3",
        sourceProductId: "prod-mid-75",
        title: "Standard Chair $75",
        priceMinor: 7500,
        currency: "USD",
        availability: "in_stock",
        retailerName: "Store F",
        retailerUrl: "https://example.com/f",
        imageUrl: "https://example.com/f.jpg",
        specifications: {},
        offersCount: 1,
        sourceFacts: ["Padded cushion"],
      },
    ];

    // When budget is 100 USD:
    // Products closest to $100 ($99, $95, $89, $75) should be in the top 4 shortlist,
    // and the $44 entry chair is excluded from the 4-card screen comparison.
    const shortlist = prepareComparisonShortlist(candidateProducts, 100);

    assert.strictEqual(shortlist.length, 4, "Comparison shortlist must contain exactly 4 products to fit screen");

    const shortlistedIds = shortlist.map((p) => p.sourceProductId);

    // Closest to 100 are: 99 (diff 1), 95 (diff 5), 89 (diff 11), 75 (diff 25)
    assert.deepStrictEqual(shortlistedIds, [
      "prod-near-99",
      "prod-near-95",
      "prod-near-89",
      "prod-mid-75",
    ]);

    // $44 is NOT in the top 4 because it is $56 away from budget
    assert.strictEqual(
      shortlistedIds.includes("prod-cheap-44"),
      false,
      "Product at $44 should not displace options close to the $100 budget"
    );
  });

  // 5. When user explicitly chooses "Best Budget Saver", lowest priced items are prioritized
  test("5. When priority override asks for budget saver / lowest price, cheapest qualifying items are shortlisted", () => {
    const candidateProducts: NormalizedProduct[] = [
      {
        source: "channel3",
        sourceProductId: "prod-cheap-44",
        title: "Budget Entry Chair $44",
        priceMinor: 4400,
        currency: "USD",
        availability: "in_stock",
        retailerName: "Store A",
        retailerUrl: "https://example.com/a",
        imageUrl: "https://example.com/a.jpg",
        specifications: {},
        offersCount: 1,
        sourceFacts: ["Basic plastic frame"],
      },
      {
        source: "channel3",
        sourceProductId: "prod-near-99",
        title: "Top Tier Mesh Chair $99",
        priceMinor: 9900,
        currency: "USD",
        availability: "in_stock",
        retailerName: "Store D",
        retailerUrl: "https://example.com/d",
        imageUrl: "https://example.com/d.jpg",
        specifications: {},
        offersCount: 1,
        sourceFacts: ["Full adjustability, 4D armrests"],
      },
      {
        source: "channel3",
        sourceProductId: "prod-entry-35",
        title: "Low End Stool $35",
        priceMinor: 3500,
        currency: "USD",
        availability: "in_stock",
        retailerName: "Store E",
        retailerUrl: "https://example.com/e",
        imageUrl: "https://example.com/e.jpg",
        specifications: {},
        offersCount: 1,
        sourceFacts: ["Simple stool"],
      },
      {
        source: "channel3",
        sourceProductId: "prod-mid-75",
        title: "Standard Chair $75",
        priceMinor: 7500,
        currency: "USD",
        availability: "in_stock",
        retailerName: "Store F",
        retailerUrl: "https://example.com/f",
        imageUrl: "https://example.com/f.jpg",
        specifications: {},
        offersCount: 1,
        sourceFacts: ["Padded cushion"],
      },
      {
        source: "channel3",
        sourceProductId: "prod-near-95",
        title: "Premium Ergonomic Chair $95",
        priceMinor: 9500,
        currency: "USD",
        availability: "in_stock",
        retailerName: "Store C",
        retailerUrl: "https://example.com/c",
        imageUrl: "https://example.com/c.jpg",
        specifications: {},
        offersCount: 1,
        sourceFacts: ["High density foam, steel base"],
      },
    ];

    const shortlist = prepareComparisonShortlist(
      candidateProducts,
      100,
      "Recommend best budget value option that saves money while meeting needs"
    );

    assert.strictEqual(shortlist.length, 4, "Comparison shortlist must contain at most 4 products");

    const shortlistedIds = shortlist.map((p) => p.sourceProductId);

    // In budget saver mode, lowest prices first: 35, 44, 75, 95
    assert.deepStrictEqual(shortlistedIds, [
      "prod-entry-35",
      "prod-cheap-44",
      "prod-mid-75",
      "prod-near-95",
    ]);
  });
});
