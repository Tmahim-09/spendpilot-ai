import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matchAndValidateRankings } from "../src/lib/ai/gemini-ranking.ts";
import type { NormalizedProduct } from "../src/types/index.ts";

describe("Gemini Candidate Ranking & Grounding Engine", () => {
  const sampleProducts: NormalizedProduct[] = [
    {
      source: "channel3",
      sourceProductId: "prod-1",
      title: "Logitech M170 Wireless Mouse",
      brand: "Logitech",
      imageUrl: "https://example.com/m170.jpg",
      priceMinor: 1499,
      compareAtPriceMinor: 1999,
      currency: "USD",
      retailerName: "Target",
      retailerUrl: "https://channel3.redirect/m170",
      availability: "in_stock",
      specifications: { Battery: "12-month AA" },
      sourceFacts: ["Reliable 2.4GHz wireless", "Compact ambidextrous shape"],
    },
    {
      source: "channel3",
      sourceProductId: "prod-2",
      title: "HP 400 Quiet Wireless Mouse",
      brand: "HP",
      imageUrl: "https://example.com/hp400.jpg",
      priceMinor: 2499,
      currency: "USD",
      retailerName: "Best Buy",
      retailerUrl: "https://channel3.redirect/hp400",
      availability: "in_stock",
      specifications: { DPI: "1600" },
      sourceFacts: ["Quiet clicks", "Ergonomic thumb rest"],
    },
    {
      source: "channel3",
      sourceProductId: "prod-3",
      title: "Dell Multi-Device Wireless Mouse",
      brand: "Dell",
      imageUrl: "https://example.com/dell.jpg",
      priceMinor: 3899,
      currency: "USD",
      retailerName: "Dell",
      retailerUrl: "https://channel3.redirect/dell",
      availability: "in_stock",
      specifications: { Connection: "Dual-mode Bluetooth + 2.4G" },
      sourceFacts: ["Connects up to 3 devices"],
    },
  ];

  test("correctly matches recommendations to authentic candidates and preserves genuine data", () => {
    const rawRecommendations = [
      {
        productId: "prod-2",
        rank: 1,
        recommendationReason: "Best quiet clicks for university library studying within budget.",
        keyTradeOffs: "Requires single AA battery.",
        fitScore: 94,
      },
      {
        productId: "prod-1",
        rank: 2,
        recommendationReason: "Most affordable reliable option under $15.",
        fitScore: 88,
      },
    ];

    const result = matchAndValidateRankings(
      rawRecommendations,
      sampleProducts,
      "Both HP and Logitech options provide reliable wireless connectivity under $40."
    );

    assert.strictEqual(result.topRecommendations.length, 2);
    assert.strictEqual(result.otherMatches.length, 1);
    assert.strictEqual(result.allProducts.length, 3);
    assert.strictEqual(
      result.comparisonOverview,
      "Both HP and Logitech options provide reliable wireless connectivity under $40."
    );

    // Verify Rank #1 (HP)
    const rank1 = result.topRecommendations[0];
    assert.strictEqual(rank1.sourceProductId, "prod-2");
    assert.strictEqual(rank1.rank, 1);
    assert.strictEqual(rank1.fitScore, 94);
    assert.strictEqual(rank1.explanation, "Best quiet clicks for university library studying within budget.");
    assert.strictEqual(rank1.keyTradeOffs, "Requires single AA battery.");
    // Crucial: authentic data must not be changed!
    assert.strictEqual(rank1.priceMinor, 2499, "Price minor must remain untouched");
    assert.strictEqual(rank1.retailerUrl, "https://channel3.redirect/hp400", "Retailer link must remain untouched");
    assert.strictEqual(rank1.retailerName, "Best Buy");

    // Verify Rank #2 (Logitech)
    const rank2 = result.topRecommendations[1];
    assert.strictEqual(rank2.sourceProductId, "prod-1");
    assert.strictEqual(rank2.rank, 2);
    assert.strictEqual(rank2.fitScore, 88);
    assert.strictEqual(rank2.priceMinor, 1499);

    // Verify Other Matches (Dell)
    const other = result.otherMatches[0];
    assert.strictEqual(other.sourceProductId, "prod-3");
    assert.strictEqual(other.priceMinor, 3899);
  });

  test("strictly rejects hallucinated or non-existent product IDs", () => {
    const hallucinatedRecs = [
      {
        productId: "fake-hallucinated-mouse-999",
        rank: 1,
        recommendationReason: "Fake product invented by LLM.",
        fitScore: 99,
      },
      {
        productId: "prod-1",
        rank: 2,
        recommendationReason: "Real product matched.",
        fitScore: 85,
      },
      {
        productId: "another-fake-id",
        rank: 3,
        recommendationReason: "Another fake product.",
        fitScore: 90,
      },
    ];

    const result = matchAndValidateRankings(hallucinatedRecs, sampleProducts);

    // Only the genuine candidate ('prod-1') is accepted!
    assert.strictEqual(result.topRecommendations.length, 1);
    assert.strictEqual(result.topRecommendations[0].sourceProductId, "prod-1");
    // Remaining genuine products are in otherMatches
    assert.strictEqual(result.otherMatches.length, 2);
    assert.strictEqual(result.allProducts.length, 3);
  });

  test("handles empty or malformed recommendation outputs safely", () => {
    const emptyResult = matchAndValidateRankings([], sampleProducts);
    assert.strictEqual(emptyResult.topRecommendations.length, 0);
    assert.strictEqual(emptyResult.otherMatches.length, 3);

    const nullProductResult = matchAndValidateRankings([], []);
    assert.strictEqual(nullProductResult.allProducts.length, 0);
  });
});

