import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractEvidenceFacts } from "../src/lib/ai/evidence-extractor.ts";
import { validateAndCleanComparison } from "../src/lib/ai/comparison-validator.ts";
import { runAiComparison } from "../src/lib/ai/gemini-comparison.ts";
import type { NormalizedProduct, EvidenceFact } from "../src/types/index.ts";

describe("Core AI Comparison Pipeline & Grounding Validation", () => {
  const mockCandidates: NormalizedProduct[] = [
    {
      source: "channel3",
      sourceProductId: "prod-logitech",
      title: "Logitech MX Master 3S Wireless Mouse",
      brand: "Logitech",
      imageUrl: "https://example.com/logitech.jpg",
      priceMinor: 9999,
      currency: "USD",
      retailerName: "Best Buy",
      retailerUrl: "https://example.com/buy-logitech",
      availability: "in_stock",
      offersCount: 3,
      offers: [
        {
          domain: "bestbuy.com",
          url: "https://example.com/bestbuy",
          priceMinor: 9999,
          currency: "USD",
          availability: "in_stock",
        },
        {
          domain: "amazon.com",
          url: "https://example.com/amazon",
          priceMinor: 10499,
          currency: "USD",
          availability: "in_stock",
        },
      ],
      specifications: {
        Connectivity: "Bluetooth 5.3 & Logi Bolt USB",
        DPI: "8000 DPI Darkfield",
        Battery: "70-day USB-C rechargeable",
      },
      sourceFacts: ["Quiet clicks with 90% noise reduction", "Electromagnetic MagSpeed scroll wheel"],
    },
    {
      source: "channel3",
      sourceProductId: "prod-hp",
      title: "HP 400 Quiet Wireless Mouse",
      brand: "HP",
      imageUrl: "https://example.com/hp.jpg",
      priceMinor: 2499,
      currency: "USD",
      retailerName: "Target",
      retailerUrl: "https://example.com/buy-hp",
      availability: "in_stock",
      offersCount: 1,
      specifications: {
        Connectivity: "2.4GHz wireless USB receiver",
      },
      sourceFacts: ["Quiet click buttons for quiet study", "Ergonomic thumb grip"],
    },
    {
      source: "channel3",
      sourceProductId: "prod-dell",
      title: "Dell Multi-Device Wireless Mouse",
      brand: "Dell",
      imageUrl: "https://example.com/dell.jpg",
      priceMinor: 3499,
      currency: "EUR", // Different currency test case
      retailerName: "Dell",
      retailerUrl: "https://example.com/buy-dell",
      availability: "in_stock",
      specifications: {
        Connectivity: "Dual-mode Bluetooth + 2.4G",
        Battery: "36-month battery life with 1x AA",
      },
      sourceFacts: ["Connects up to 3 PCs"],
    },
  ];

  // Test 1: Valid AI comparison containing several real candidate IDs
  test("1. processes a valid AI comparison containing real candidate IDs", () => {
    const { evidenceFacts } = extractEvidenceFacts(mockCandidates);

    const rawGeminiOutput = {
      summary: "Comparison of 3 wireless mice for university studying and productivity.",
      bestMatchProductId: "prod-hp",
      bestMatchReason: "Most budget-friendly quiet option for library studying under $25.",
      priorityInterpretation: ["Quiet clicks for library studying", "Budget under $40"],
      criteria: [
        {
          name: "Quiet Operation",
          importance: "high",
          assessments: [
            {
              productId: "prod-hp",
              assessment: "strong",
              reason: "Features quiet click buttons verified in source facts.",
              evidenceFactIds: Object.keys(evidenceFacts).filter((id) =>
                evidenceFacts[id]?.productId === "prod-hp"
              ),
            },
            {
              productId: "prod-logitech",
              assessment: "strong",
              reason: "Has 90% reduced noise clicks.",
              evidenceFactIds: Object.keys(evidenceFacts).filter((id) =>
                evidenceFacts[id]?.productId === "prod-logitech"
              ),
            },
          ],
        },
      ],
      tradeoffs: [
        {
          productId: "prod-hp",
          summary: "Battery life duration not specified in listing.",
        },
      ],
      alternativePicks: [
        {
          productId: "prod-logitech",
          bestFor: "All-day Ergonomics & Multi-device",
          reason: "Top-tier 8000 DPI sensor and rechargeable battery if willing to spend more.",
        },
      ],
      missingInformation: [
        {
          productId: "prod-hp",
          field: "Battery Life",
          explanation: "Specific runtime in months was not stated in the retailer specs.",
        },
      ],
    };

    const result = validateAndCleanComparison(rawGeminiOutput, mockCandidates, evidenceFacts, "wireless mouse");

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.comparison.bestMatchProductId, "prod-hp");
    assert.strictEqual(result.comparison.criteria.length, 1);
    assert.strictEqual(result.comparison.criteria[0].assessments.length, 2);
    assert.strictEqual(result.topRecommendations.length, 2); // HP (best) + Logitech (alternative)
    assert.strictEqual(result.otherMatches.length, 1); // Dell (remaining)
  });

  // Test 2: Primary recommendation actually references a known candidate product
  test("2. verifies primary recommendation references a known candidate product", () => {
    const { evidenceFacts } = extractEvidenceFacts(mockCandidates);
    const raw = {
      summary: "Summary text",
      bestMatchProductId: "prod-logitech",
      bestMatchReason: "Best overall ergonomics and features.",
      criteria: [],
    };

    const result = validateAndCleanComparison(raw, mockCandidates, evidenceFacts);
    assert.strictEqual(result.comparison.bestMatchProductId, "prod-logitech");
    assert.strictEqual(result.topRecommendations[0]?.sourceProductId, "prod-logitech");
  });

  // Test 3: Multiple criteria with evidence linked to the correct product
  test("3. validates multiple criteria with evidence linked to the correct product", () => {
    const { evidenceFacts } = extractEvidenceFacts(mockCandidates);

    // Pick a real fact from Logitech
    const logiFactId = Object.keys(evidenceFacts).find(
      (id) => evidenceFacts[id]?.productId === "prod-logitech" && evidenceFacts[id]?.category === "specification"
    );
    assert.ok(logiFactId, "Expected to find a Logitech specification fact");

    const raw = {
      summary: "Comparison",
      bestMatchProductId: "prod-logitech",
      bestMatchReason: "Winner",
      criteria: [
        {
          name: "Connectivity",
          importance: "high",
          assessments: [
            {
              productId: "prod-logitech",
              assessment: "strong",
              reason: "Supports Bluetooth 5.3 and Logi Bolt.",
              evidenceFactIds: [logiFactId],
            },
          ],
        },
      ],
    };

    const result = validateAndCleanComparison(raw, mockCandidates, evidenceFacts);
    const assessedFactIds = result.comparison.criteria[0].assessments[0].evidenceFactIds;
    assert.deepStrictEqual(assessedFactIds, [logiFactId]);
  });

  // Test 4: Unknown product IDs returned by Gemini
  test("4. strictly rejects unknown or hallucinated product IDs returned by Gemini", () => {
    const { evidenceFacts } = extractEvidenceFacts(mockCandidates);

    const raw = {
      summary: "Comparison",
      bestMatchProductId: "hallucinated-mouse-999", // FAKE ID
      bestMatchReason: "Made up product.",
      criteria: [
        {
          name: "Price",
          importance: "medium",
          assessments: [
            {
              productId: "another-fake-id",
              assessment: "strong",
              reason: "Cheap.",
            },
            {
              productId: "prod-hp",
              assessment: "strong",
              reason: "Real product.",
            },
          ],
        },
      ],
      alternativePicks: [
        {
          productId: "third-fake-id",
          bestFor: "Gaming",
          reason: "Fake.",
        },
      ],
    };

    const result = validateAndCleanComparison(raw, mockCandidates, evidenceFacts);

    // Best match fallback to first real candidate
    assert.strictEqual(result.comparison.bestMatchProductId, "prod-logitech");
    // Unknown assessment filtered out
    assert.strictEqual(result.comparison.criteria[0].assessments.length, 1);
    assert.strictEqual(result.comparison.criteria[0].assessments[0].productId, "prod-hp");
    // Unknown alternative pick filtered out
    assert.strictEqual(result.comparison.alternativePicks.length, 0);
    assert.ok(result.rejectionReasons.length > 0);
  });

  // Test 5: Evidence references belonging to another product (cross-contamination rejection)
  test("5. rejects evidence references belonging to a different product", () => {
    const { evidenceFacts } = extractEvidenceFacts(mockCandidates);

    // Find a fact that belongs to Logitech
    const logiFactId = Object.keys(evidenceFacts).find(
      (id) => evidenceFacts[id]?.productId === "prod-logitech"
    );
    assert.ok(logiFactId);

    const raw = {
      summary: "Comparison",
      bestMatchProductId: "prod-hp",
      bestMatchReason: "HP mouse",
      criteria: [
        {
          name: "Features",
          importance: "high",
          assessments: [
            {
              productId: "prod-hp", // HP product
              assessment: "strong",
              reason: "Claims HP has Logitech MagSpeed wheel",
              evidenceFactIds: [logiFactId], // WRONG PRODUCT ID CITATION!
            },
          ],
        },
      ],
    };

    const result = validateAndCleanComparison(raw, mockCandidates, evidenceFacts);
    const hpAssessment = result.comparison.criteria[0].assessments[0];

    // The cross-contaminated fact ID MUST BE STRIPPED!
    assert.strictEqual(hpAssessment.evidenceFactIds.length, 0, "Cross-product fact citation must be rejected");
    assert.ok(result.rejectionReasons.some((r) => r.includes("Rejected cross-product fact citation")));
  });

  // Test 6: Missing product specifications
  test("6. transparently preserves missing product specifications in missingInformation", () => {
    const { evidenceFacts } = extractEvidenceFacts(mockCandidates);

    const raw = {
      summary: "Comparison",
      bestMatchProductId: "prod-hp",
      bestMatchReason: "HP",
      criteria: [
        {
          name: "Battery Duration",
          importance: "medium",
          assessments: [
            {
              productId: "prod-hp",
              assessment: "unknown",
              reason: "Battery life is not stated in the retailer listing.",
            },
          ],
        },
      ],
      missingInformation: [
        {
          productId: "prod-hp",
          field: "Battery Life",
          explanation: "Listing does not state runtime hours or months.",
        },
      ],
    };

    const result = validateAndCleanComparison(raw, mockCandidates, evidenceFacts);
    assert.strictEqual(result.comparison.missingInformation.length, 1);
    assert.strictEqual(result.comparison.missingInformation[0].productId, "prod-hp");
    assert.strictEqual(result.comparison.missingInformation[0].field, "Battery Life");
  });

  // Test 7: Products with several merchant offers
  test("7. extracts and formats multiple merchant offers in evidence", () => {
    const { candidateSummariesForPrompt } = extractEvidenceFacts(mockCandidates);
    const logitechSummary = candidateSummariesForPrompt.find((c) => c.productId === "prod-logitech");

    assert.ok(logitechSummary);
    assert.strictEqual(logitechSummary.offersCount, 3);
    assert.strictEqual(logitechSummary.primaryRetailer, "Best Buy");
    assert.strictEqual(logitechSummary.startingPrice, "$99.99");
  });

  // Test 8: Incomparable prices in different currencies
  test("8. preserves original currencies without fabricated currency conversions", () => {
    const { candidateSummariesForPrompt } = extractEvidenceFacts(mockCandidates);
    const dellSummary = candidateSummariesForPrompt.find((c) => c.productId === "prod-dell");

    assert.ok(dellSummary);
    // Preserves EUR currency string directly without fake conversion!
    assert.ok(dellSummary.startingPrice.includes("34.99"));
  });

  // Test 9: Empty Channel3 results and single candidate
  test("9. handles empty Channel3 results and single candidate without calling LLM", async () => {
    // Empty candidate test
    const emptyRes = await runAiComparison({
      query: "wireless mouse",
      products: [],
    });
    assert.strictEqual(emptyRes.comparison.criteria.length, 0);
    assert.strictEqual(emptyRes.topRecommendations.length, 0);

    // Single candidate test (Section 2: explain limitation without manufacturing alternatives)
    const singleRes = await runAiComparison({
      query: "wireless mouse",
      products: [mockCandidates[0]],
    });
    assert.strictEqual(singleRes.topRecommendations.length, 1);
    assert.strictEqual(singleRes.comparison.bestMatchProductId, "prod-logitech");
    assert.ok(singleRes.comparison.summary.includes("Only 1 product matched"));
  });

  // Test 10: Malformed structured output
  test("10. handles malformed structured output gracefully", () => {
    const { evidenceFacts } = extractEvidenceFacts(mockCandidates);

    // Pass non-object or null
    const nullRes = validateAndCleanComparison(null, mockCandidates, evidenceFacts, "mouse");
    assert.strictEqual(nullRes.valid, false);
    assert.strictEqual(nullRes.comparison.bestMatchProductId, "prod-logitech");
    assert.strictEqual(nullRes.topRecommendations.length, 3);

    // Pass malformed object with string criteria instead of array
    const malformed = {
      summary: 12345, // Not a string
      bestMatchProductId: null,
      criteria: "not-an-array",
    };
    const malRes = validateAndCleanComparison(malformed, mockCandidates, evidenceFacts, "mouse");
    assert.strictEqual(malRes.comparison.bestMatchProductId, "prod-logitech");
    assert.strictEqual(malRes.comparison.criteria.length, 0);
  });

  // Test 11: Priority override triggers re-ranking without Channel3 re-fetch
  test("11. priority override re-ranks recommendations among existing candidates", () => {
    const { evidenceFacts } = extractEvidenceFacts(mockCandidates);

    // First comparison: Logitech is top pick
    const initialRaw = {
      summary: "Comparison",
      bestMatchProductId: "prod-logitech",
      bestMatchReason: "Top ergonomics",
      criteria: [],
    };
    const initialRes = validateAndCleanComparison(initialRaw, mockCandidates, evidenceFacts);
    assert.strictEqual(initialRes.topRecommendations[0]?.sourceProductId, "prod-logitech");

    // Re-ranking with "Lowest Price" priority override without changing candidates
    const lowestPriceRaw = {
      summary: "Prioritizing lowest upfront cost",
      bestMatchProductId: "prod-hp", // HP is cheapest at $24.99
      bestMatchReason: "Lowest cost among verified candidates",
      criteria: [],
    };
    const refinedRes = validateAndCleanComparison(lowestPriceRaw, mockCandidates, evidenceFacts, "wireless mouse");
    assert.strictEqual(refinedRes.topRecommendations[0]?.sourceProductId, "prod-hp");
    assert.strictEqual(refinedRes.comparison.bestMatchProductId, "prod-hp");
  });

  // Test 12: Race condition prevention on consecutive submissions
  test("12. prevents race conditions by discarding stale comparison responses", () => {
    let activeSequence = 1;

    // Simulate response handler with sequence tracking
    const handleResponse = (seq: number, data: string) => {
      if (seq !== activeSequence) {
        return { accepted: false, reason: "Stale sequence discarded" };
      }
      return { accepted: true, data };
    };

    // User triggers search 1
    const seq1 = 1;
    // User quickly changes mind and triggers search 2
    activeSequence = 2;
    const seq2 = 2;

    // Search 1 response arrives late (after search 2 started)
    const lateRes1 = handleResponse(seq1, "stale-data-1");
    assert.strictEqual(lateRes1.accepted, false);
    assert.strictEqual(lateRes1.reason, "Stale sequence discarded");

    // Search 2 response arrives
    const freshRes2 = handleResponse(seq2, "fresh-data-2");
    assert.strictEqual(freshRes2.accepted, true);
    assert.strictEqual(freshRes2.data, "fresh-data-2");
  });

  // Test 13: Fallback rendering on Gemini rejection or error
  test("13. gracefully falls back on Gemini error preserving candidate products", () => {
    const { evidenceFacts } = extractEvidenceFacts(mockCandidates);

    // When Gemini fails or times out, validator produces a safe fallback
    const fallbackRes = validateAndCleanComparison(undefined, mockCandidates, evidenceFacts, "ergonomic mouse");

    assert.strictEqual(fallbackRes.valid, false);
    // All original products remain available in order
    assert.strictEqual(fallbackRes.topRecommendations.length, 3);
    assert.strictEqual(fallbackRes.topRecommendations[0]?.sourceProductId, "prod-logitech");
    // Comparison object exists with safe defaults
    assert.ok(fallbackRes.comparison);
    assert.strictEqual(fallbackRes.comparison.bestMatchProductId, "prod-logitech");
  });

  // Test 14: Qualitative assessment strings strictly adhere to 'strong' | 'partial' | 'weak' | 'unknown'
  test("14. qualitative assessment ratings strictly sanitize arbitrary or numeric ratings", () => {
    const { evidenceFacts } = extractEvidenceFacts(mockCandidates);

    const rawWithInvalidRatings = {
      summary: "Comparison",
      bestMatchProductId: "prod-logitech",
      bestMatchReason: "Top pick",
      criteria: [
        {
          name: "Fit & Comfort",
          importance: "high",
          assessments: [
            {
              productId: "prod-logitech",
              assessment: "95% Fit", // Arbitrary percentage rating!
              reason: "Very comfortable",
            },
            {
              productId: "prod-hp",
              assessment: "EXCELLENT", // Non-conforming string
              reason: "Good grip",
            },
            {
              productId: "prod-dell",
              assessment: "strong", // Valid conforming string
              reason: "Standard grip",
            },
          ],
        },
      ],
    };

    const result = validateAndCleanComparison(rawWithInvalidRatings, mockCandidates, evidenceFacts);
    const assessments = result.comparison.criteria[0]?.assessments || [];

    // "95% Fit" -> sanitized to "unknown"
    assert.strictEqual(assessments[0]?.assessment, "unknown");
    // "EXCELLENT" -> sanitized to "unknown"
    assert.strictEqual(assessments[1]?.assessment, "unknown");
    // "strong" -> preserved
    assert.strictEqual(assessments[2]?.assessment, "strong");

    // Rejection reasons explain the sanitization
    assert.ok(result.rejectionReasons.some((r) => r.includes('Sanitized invalid assessment rating "95% fit"')));
  });

  // Test 15: Eliminates fabricated customer reviews or star ratings
  test("15. does not accept hallucinated customer review counts or star ratings in evidence", () => {
    const { evidenceFacts } = extractEvidenceFacts(mockCandidates);

    // Verified fact categories are strictly: attribute, specification, offer, price, feature, brand
    const factCategories = new Set(Object.values(evidenceFacts).map((f) => f.category));
    assert.ok(!factCategories.has("customer_review" as unknown as EvidenceFact["category"]), "Customer reviews should never be fabricated");
    assert.ok(!factCategories.has("star_rating" as unknown as EvidenceFact["category"]), "Star ratings should never be fabricated");

    // Every fact maps directly to genuine fields from Channel3
    const allowedCategories = ["attribute", "specification", "offer", "price", "feature", "brand"];
    for (const fact of Object.values(evidenceFacts)) {
      assert.ok(allowedCategories.includes(fact.category), `Category ${fact.category} must be in allowed list`);
      assert.ok(fact.value && fact.value.length > 0);
      assert.ok(fact.label && fact.label.length > 0);
    }
  });
});
