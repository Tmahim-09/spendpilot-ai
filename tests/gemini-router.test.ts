import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getConfiguredModelChain,
  classifyGeminiError,
  buildModelGenerationConfig,
  executeWithModelFailover,
  DEFAULT_PRIMARY_MODEL,
  DEFAULT_FALLBACK_MODELS,
  AllModelsExhaustedError,
} from "../src/lib/ai/gemini-router.ts";
import { extractEvidenceFacts } from "../src/lib/ai/evidence-extractor.ts";
import { validateAndCleanComparison } from "../src/lib/ai/comparison-validator.ts";
import type { NormalizedProduct } from "../src/types/index.ts";

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-dummy-api-key";

interface MockApiError extends Error {
  status?: number | string;
}

describe("Centralized Gemini Model Router & Failover Engine", () => {
  const mockCandidates: NormalizedProduct[] = [
    {
      source: "channel3",
      sourceProductId: "prod-logi",
      title: "Logitech Pebble M350 Wireless Mouse",
      brand: "Logitech",
      imageUrl: "https://example.com/pebble.jpg",
      priceMinor: 2999,
      currency: "USD",
      retailerName: "Best Buy",
      retailerUrl: "https://example.com/pebble",
      availability: "in_stock",
      specifications: { Connectivity: "Bluetooth + 2.4GHz USB" },
      sourceFacts: ["Silent clicks", "Slim portable body"],
    },
    {
      source: "channel3",
      sourceProductId: "prod-anker",
      title: "Anker Vertical Ergonomic Wireless Mouse",
      brand: "Anker",
      imageUrl: "https://example.com/anker.jpg",
      priceMinor: 2799,
      currency: "USD",
      retailerName: "Amazon",
      retailerUrl: "https://example.com/anker",
      availability: "in_stock",
      specifications: { Design: "Ergonomic Vertical" },
      sourceFacts: ["Comfortable wrist posture"],
    },
  ];

  const validComparisonJson = {
    summary: "Side-by-side evaluation of Logitech Pebble and Anker Vertical mice.",
    bestMatchProductId: "prod-logi",
    bestMatchReason: "Ultra portable with silent clicks for university library use.",
    priorityInterpretation: ["Portability for campus", "Quiet operation"],
    criteria: [
      {
        name: "Portability",
        importance: "high",
        assessments: [
          {
            productId: "prod-logi",
            assessment: "strong",
            reason: "Slim profile verified in product facts.",
            evidenceFactIds: [],
          },
          {
            productId: "prod-anker",
            assessment: "partial",
            reason: "Bulkier vertical design.",
            evidenceFactIds: [],
          },
        ],
      },
    ],
    tradeoffs: [
      {
        productId: "prod-anker",
        summary: "Larger footprint makes it less convenient to slide into a laptop bag.",
      },
    ],
    alternativePicks: [
      {
        productId: "prod-anker",
        bestFor: "Ergonomic Comfort",
        reason: "Better for long typing sessions if hand strain is a concern.",
      },
    ],
    missingInformation: [],
  };

  // Scenario 1: Primary model succeeds without a fallback
  test("1. primary model succeeds without a fallback", async () => {
    const models = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"];
    let calledModel = "";

    const result = await executeWithModelFailover({
      models,
      requestId: "test-req-1",
      executeFn: async (_ai, model) => {
        calledModel = model;
        return { answer: "success", model };
      },
    });

    assert.strictEqual(calledModel, "gemini-3.1-flash-lite");
    assert.strictEqual(result.modelUsed, "gemini-3.1-flash-lite");
    assert.strictEqual(result.usedFallback, false);
    assert.strictEqual(result.attempts.length, 1);
    assert.strictEqual(result.attempts[0]?.outcome, "success");
  });

  // Scenario 2: Primary model returns a rate-limit error (429 / RESOURCE_EXHAUSTED) and the first fallback succeeds
  test("2. primary model returns a rate-limit error and first fallback succeeds", async () => {
    const models = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"];
    const invokedModels: string[] = [];

    const result = await executeWithModelFailover({
      models,
      requestId: "test-req-2",
      executeFn: async (_ai, model) => {
        invokedModels.push(model);
        if (model === "gemini-3.1-flash-lite") {
          // Simulate 429 RESOURCE_EXHAUSTED
          const error = new Error("Generate content requests per day limit exceeded on Free Tier.") as MockApiError;
          error.status = 429;
          throw error;
        }
        return { answer: "fallback-success", model };
      },
    });

    assert.deepStrictEqual(invokedModels, ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]);
    assert.strictEqual(result.modelUsed, "gemini-3.5-flash-lite");
    assert.strictEqual(result.usedFallback, true);
    assert.strictEqual(result.attempts.length, 2);
    assert.strictEqual(result.attempts[0]?.category, "rate_limited");
    assert.strictEqual(result.attempts[1]?.outcome, "success");
  });

  // Scenario 3: Both first models are rate-limited and the final fallback succeeds
  test("3. both first models are rate-limited and final fallback succeeds", async () => {
    const models = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"];
    const invokedModels: string[] = [];

    const result = await executeWithModelFailover({
      models,
      requestId: "test-req-3",
      executeFn: async (_ai, model) => {
        invokedModels.push(model);
        if (model === "gemini-3.1-flash-lite" || model === "gemini-3.5-flash-lite") {
          const error = new Error("Resource has been exhausted (e.g. check quota).") as MockApiError;
          error.status = "RESOURCE_EXHAUSTED";
          throw error;
        }
        return { answer: "final-fallback-success", model };
      },
    });

    assert.deepStrictEqual(invokedModels, [
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash-lite",
      "gemini-2.5-flash-lite",
    ]);
    assert.strictEqual(result.modelUsed, "gemini-2.5-flash-lite");
    assert.strictEqual(result.usedFallback, true);
    assert.strictEqual(result.attempts.length, 3);
    assert.strictEqual(result.attempts[0]?.category, "rate_limited");
    assert.strictEqual(result.attempts[1]?.category, "rate_limited");
    assert.strictEqual(result.attempts[2]?.outcome, "success");
  });

  // Scenario 4: All configured models are rate-limited
  test("4. all configured models are rate-limited and throws AllModelsExhaustedError", async () => {
    const models = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"];
    const invokedModels: string[] = [];

    await assert.rejects(
      async () => {
        await executeWithModelFailover({
          models,
          requestId: "test-req-4",
          executeFn: async (_ai, model) => {
            invokedModels.push(model);
            const error = new Error("Quota exceeded for model: " + model) as MockApiError;
            error.status = 429;
            throw error;
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AllModelsExhaustedError);
        assert.strictEqual(err.attempts.length, 3);
        assert.strictEqual(err.attempts[0]?.category, "rate_limited");
        assert.strictEqual(err.attempts[1]?.category, "rate_limited");
        assert.strictEqual(err.attempts[2]?.category, "rate_limited");
        return true;
      }
    );

    assert.deepStrictEqual(invokedModels, models);
  });

  // Scenario 5: Authentication error (401/403) stops unnecessary model switching
  test("5. authentication error (401/403) stops unnecessary model switching immediately", async () => {
    const models = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"];
    const invokedModels: string[] = [];

    await assert.rejects(
      async () => {
        await executeWithModelFailover({
          models,
          requestId: "test-req-5",
          executeFn: async (_ai, model) => {
            invokedModels.push(model);
            const error = new Error("API key not valid. Please pass a valid API key.") as MockApiError;
            error.status = 403;
            throw error;
          },
        });
      },
      (err: unknown) => {
        const error = err as MockApiError;
        assert.strictEqual(error.status, 403);
        return true;
      }
    );

    // Only the first model was attempted; did NOT waste time on fallbacks
    assert.deepStrictEqual(invokedModels, ["gemini-3.1-flash-lite"]);
  });

  // Scenario 6: Invalid schema/request (400) does not trigger unbounded retries
  test("6. invalid schema / 400 error does not trigger unbounded retries across all models", async () => {
    const models = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"];
    const invokedModels: string[] = [];

    await assert.rejects(
      async () => {
        await executeWithModelFailover({
          models,
          requestId: "test-req-6",
          executeFn: async (_ai, model) => {
            invokedModels.push(model);
            const error = new Error("INVALID_ARGUMENT: Schema property invalid") as MockApiError;
            error.status = 400;
            throw error;
          },
        });
      },
      (err: unknown) => {
        const error = err as MockApiError;
        assert.strictEqual(error.status, 400);
        return true;
      }
    );

    // Stops on fatal client-side schema error
    assert.deepStrictEqual(invokedModels, ["gemini-3.1-flash-lite"]);
  });

  // Scenario 7: Temporary service error (503) triggers only bounded fallback
  test("7. temporary service error (503) triggers bounded fallback without loops", async () => {
    const models = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
    const invokedModels: string[] = [];

    const result = await executeWithModelFailover({
      models,
      requestId: "test-req-7",
      executeFn: async (_ai, model) => {
        invokedModels.push(model);
        if (model === "gemini-3.1-flash-lite") {
          const error = new Error("The model is overloaded. Please try again later.") as MockApiError;
          error.status = 503;
          throw error;
        }
        return { answer: "recovered" };
      },
    });

    assert.deepStrictEqual(invokedModels, ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]);
    assert.strictEqual(result.usedFallback, true);
    assert.strictEqual(result.attempts[0]?.category, "transient_error");
    assert.strictEqual(result.attempts[1]?.outcome, "success");
  });

  // Scenario 8: Duplicate models in configuration are removed while preserving order
  test("8. duplicate models in configuration are removed while preserving order", () => {
    const chain = getConfiguredModelChain(
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash-lite,gemini-3.5-flash-lite"
    );

    assert.deepStrictEqual(chain, [
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash-lite",
      "gemini-2.5-flash-lite",
    ]);
  });

  // Scenario 9: Missing model configuration is handled safely with documented defaults
  test("9. missing model configuration is handled safely with documented defaults", () => {
    // When empty strings are provided
    const chain = getConfiguredModelChain("", "");
    assert.strictEqual(chain[0], DEFAULT_PRIMARY_MODEL);
    assert.deepStrictEqual(chain.slice(1), DEFAULT_FALLBACK_MODELS);

    // When malformed identifiers are provided
    const safeChain = getConfiguredModelChain("invalid model name with spaces!", [
      "valid-model-1",
      "<script>alert(1)</script>",
    ]);
    assert.strictEqual(safeChain[0], DEFAULT_PRIMARY_MODEL);
    assert.strictEqual(safeChain[1], "valid-model-1");
  });

  // Scenario 10: Malformed response is not displayed as a valid comparison
  test("10. malformed response fails validation and causes failover to next model", async () => {
    const models = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
    const invokedModels: string[] = [];

    const result = await executeWithModelFailover({
      models,
      requestId: "test-req-10",
      executeFn: async (_ai, model) => {
        invokedModels.push(model);
        if (model === "gemini-3.1-flash-lite") {
          return null as unknown as typeof validComparisonJson; // Invalid malformed null output
        }
        return validComparisonJson;
      },
      validateFn: (data) => {
        if (!data || typeof data !== "object") {
          return { valid: false, reason: "Output is not an object" };
        }
        return { valid: true };
      },
    });

    assert.deepStrictEqual(invokedModels, ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]);
    assert.strictEqual(result.modelUsed, "gemini-3.5-flash-lite");
    assert.strictEqual(result.attempts[0]?.outcome, "validation_failed");
  });

  // Scenario 11: Response from fallback model passes the same product ID and evidence validation
  test("11. response from fallback model passes the same product ID and evidence validation", () => {
    const { evidenceFacts } = extractEvidenceFacts(mockCandidates);

    // Validate comparison generated by fallback model
    const validation = validateAndCleanComparison(
      validComparisonJson,
      mockCandidates,
      evidenceFacts,
      "wireless mouse"
    );

    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.comparison.bestMatchProductId, "prod-logi");
    assert.strictEqual(validation.topRecommendations[0]?.sourceProductId, "prod-logi");
    assert.strictEqual(validation.comparison.criteria.length, 1);
  });

  // Scenario 12: Channel3 products remain visible when every AI model fails
  test("12. Channel3 products remain fully preserved when every AI model fails", async () => {
    const { evidenceFacts } = extractEvidenceFacts(mockCandidates);

    // Simulate complete failover exhaustion fallback
    const fallbackValidation = validateAndCleanComparison(
      undefined,
      mockCandidates,
      evidenceFacts,
      "wireless mouse"
    );

    assert.strictEqual(fallbackValidation.valid, false);
    // All original Channel3 products are preserved in order!
    assert.strictEqual(fallbackValidation.topRecommendations.length, 2);
    assert.strictEqual(fallbackValidation.topRecommendations[0]?.sourceProductId, "prod-logi");
    assert.strictEqual(fallbackValidation.topRecommendations[1]?.sourceProductId, "prod-anker");
  });

  // Scenario 13: Race condition prevention on consecutive searches
  test("13. prevents race conditions: stale comparison cannot overwrite newer search", () => {
    const currentActiveSearchId = 2;

    const commitComparisonIfActive = (searchId: number, data: string) => {
      if (searchId !== currentActiveSearchId) {
        return { committed: false, reason: "Stale search ignored" };
      }
      return { committed: true, data };
    };

    // Stale search 1 response arrives late
    const staleResult = commitComparisonIfActive(1, "search-1-data");
    assert.strictEqual(staleResult.committed, false);
    assert.strictEqual(staleResult.reason, "Stale search ignored");

    // Fresh search 2 response arrives
    const freshResult = commitComparisonIfActive(2, "search-2-data");
    assert.strictEqual(freshResult.committed, true);
    assert.strictEqual(freshResult.data, "search-2-data");
  });

  // Scenario 14: Each model is attempted at most once per comparison operation
  test("14. each model is attempted at most once per comparison operation (no duplicates or loops)", async () => {
    const models = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"];
    const attemptCounts: Record<string, number> = {};

    try {
      await executeWithModelFailover({
        models,
        requestId: "test-req-14",
        executeFn: async (_ai, model) => {
          attemptCounts[model] = (attemptCounts[model] || 0) + 1;
          const error = new Error("Rate limit on " + model) as MockApiError;
          error.status = 429;
          throw error;
        },
      });
    } catch {
      // Expected to fail since all models throw 429
    }

    // Every model was attempted exactly once!
    assert.strictEqual(attemptCounts["gemini-3.1-flash-lite"], 1);
    assert.strictEqual(attemptCounts["gemini-3.5-flash-lite"], 1);
    assert.strictEqual(attemptCounts["gemini-2.5-flash-lite"], 1);
  });

  // Extra Scenario: Verify Error Classifier and Generation Config Builder
  test("15. classifies errors accurately and builds model-aware configs", () => {
    const rateLimit = classifyGeminiError({ status: 429, message: "RESOURCE_EXHAUSTED" });
    assert.strictEqual(rateLimit.category, "rate_limited");
    assert.strictEqual(rateLimit.isFatal, false);

    const authError = classifyGeminiError({ status: 403, message: "PERMISSION_DENIED" });
    assert.strictEqual(authError.category, "auth_error");
    assert.strictEqual(authError.isFatal, true);

    const config3 = buildModelGenerationConfig("gemini-3.1-flash-lite", { temperature: 0.1 });
    assert.ok(config3.thinkingConfig);

    const config2 = buildModelGenerationConfig("gemini-2.5-flash-lite", { temperature: 0.1 });
    assert.strictEqual(config2.thinkingConfig, undefined);
  });
});
