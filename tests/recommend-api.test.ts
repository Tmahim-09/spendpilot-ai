import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matchAndValidateRankings } from "../src/lib/ai/gemini-ranking.ts";
import type { NormalizedProduct } from "../src/types/index.ts";

describe("Shopping Recommendation Pipeline & Fallback Safety", () => {
  const mockCandidates: NormalizedProduct[] = [
    {
      source: "channel3",
      sourceProductId: "c3-101",
      title: "Anker Ergonomic Wireless Mouse",
      brand: "Anker",
      imageUrl: "https://example.com/anker.png",
      priceMinor: 2799,
      currency: "USD",
      retailerName: "amazon.com",
      retailerUrl: "https://channel3.redirect/anker",
      availability: "in_stock",
      specifications: { DPI: "1600" },
      sourceFacts: ["Vertical ergonomic grip", "Battery life up to 18 months"],
    },
    {
      source: "channel3",
      sourceProductId: "c3-102",
      title: "Logitech Pebble M350 Silent Mouse",
      brand: "Logitech",
      imageUrl: "https://example.com/pebble.png",
      priceMinor: 2999,
      currency: "USD",
      retailerName: "bestbuy.com",
      retailerUrl: "https://channel3.redirect/pebble",
      availability: "in_stock",
      specifications: { Battery: "AA included" },
      sourceFacts: ["Silent clicks", "Slim portable design"],
    },
  ];

  test("correctly structures recommendations and attaches AI Pick badges without data corruption", () => {
    const rawRecommendations = [
      {
        productId: "c3-101",
        rank: 1,
        recommendationReason: "Best ergonomic wrist angle for long study sessions.",
        keyTradeOffs: "Requires 2x AAA batteries.",
        fitScore: 96,
      },
    ];

    const result = matchAndValidateRankings(rawRecommendations, mockCandidates, "Anker is the best pick.");

    assert.strictEqual(result.topRecommendations.length, 1);
    assert.strictEqual(result.otherMatches.length, 1);
    assert.strictEqual(result.allProducts.length, 2);

    const topPick = result.topRecommendations[0];
    assert.strictEqual(topPick.sourceProductId, "c3-101");
    assert.strictEqual(topPick.rank, 1);
    assert.strictEqual(topPick.fitScore, 96);
    assert.strictEqual(topPick.explanation, "Best ergonomic wrist angle for long study sessions.");
    assert.strictEqual(topPick.keyTradeOffs, "Requires 2x AAA batteries.");

    // Critical assertion: Authentic pricing and links must remain untouched!
    assert.strictEqual(topPick.priceMinor, 2799);
    assert.strictEqual(topPick.retailerUrl, "https://channel3.redirect/anker");
    assert.strictEqual(topPick.retailerName, "amazon.com");

    // Other matches contains the untouched Logitech mouse
    const secondOption = result.otherMatches[0];
    assert.strictEqual(secondOption.sourceProductId, "c3-102");
    assert.strictEqual(secondOption.priceMinor, 2999);
  });

  test("gracefully falls back when recommendation list is empty or API failed", () => {
    // When Gemini ranking returns empty or fails, products must be preserved in otherMatches
    const result = matchAndValidateRankings([], mockCandidates);

    assert.strictEqual(result.topRecommendations.length, 0);
    assert.strictEqual(result.otherMatches.length, 2);
    assert.strictEqual(result.allProducts.length, 2);
    assert.strictEqual(result.allProducts[0].sourceProductId, "c3-101");
    assert.strictEqual(result.allProducts[1].sourceProductId, "c3-102");
  });
});

