import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveShoppingIntent } from "../src/lib/ai/gemini-intent.ts";

describe("Gemini Shopping Intent Parser & Normalization", () => {
  test("enforces form budget precedence over natural language budget", () => {
    const rawParsed = {
      isShoppingRequest: true,
      searchQuery: "wireless mouse",
      category: "Peripherals",
      userStatedTotalBudget: 150, // Stated in text
      userStatedMaxItemPrice: 75,
      currency: "USD",
      mustHave: ["Bluetooth"],
      preferences: ["black"],
      excluded: [],
      summary: "Looking for wireless mouse under $150",
      needsClarification: false,
    };

    // User explicitly set budget in form to 40
    const resolved = resolveShoppingIntent(rawParsed, "I want a mouse under 150", 40, "USD");

    assert.strictEqual(resolved.isShoppingRequest, true);
    assert.strictEqual(resolved.searchQuery, "wireless mouse");
    assert.strictEqual(resolved.totalBudget, 40, "Form budget must override natural language budget");
    assert.strictEqual(resolved.maxItemPrice, 75);
    assert.strictEqual(resolved.currency, "USD");
    assert.deepStrictEqual(resolved.mustHave, ["Bluetooth"]);
  });

  test("extracts natural language budget when form budget is null", () => {
    const rawParsed = {
      isShoppingRequest: true,
      searchQuery: "mechanical keyboard",
      category: "Keyboards",
      userStatedTotalBudget: 80,
      userStatedMaxItemPrice: null,
      currency: "USD",
      mustHave: ["quiet switches"],
      preferences: [],
      excluded: ["RGB"],
      summary: "Mechanical keyboard under $80",
      needsClarification: false,
    };

    const resolved = resolveShoppingIntent(rawParsed, "mechanical keyboard under $80", null, "USD");

    assert.strictEqual(resolved.totalBudget, 80);
    assert.strictEqual(resolved.currency, "USD");
    assert.deepStrictEqual(resolved.excluded, ["RGB"]);
    assert.strictEqual(resolved.needsClarification, false);
  });

  test("handles non-shopping queries and greetings with polite clarification", () => {
    const rawParsed = {
      isShoppingRequest: false,
      searchQuery: "",
      category: "",
      userStatedTotalBudget: null,
      userStatedMaxItemPrice: null,
      currency: "USD",
      mustHave: [],
      preferences: [],
      excluded: [],
      summary: "User said hello",
      needsClarification: true,
      clarificationMessage: "Hello! SpendPilot AI can help you find products within your budget.",
    };

    const resolved = resolveShoppingIntent(rawParsed, "Hello how are you doing", null, "USD");

    assert.strictEqual(resolved.isShoppingRequest, false);
    assert.strictEqual(resolved.needsClarification, true);
    assert.ok(resolved.clarificationMessage?.includes("SpendPilot AI"));
    // Fallback searchQuery does not crash
    assert.ok(resolved.searchQuery.length > 0);
  });

  test("sanitizes invalid or excessive numbers and non-array fields", () => {
    const malformed = {
      isShoppingRequest: true,
      searchQuery: "   ",
      category: null,
      userStatedTotalBudget: 999999999, // Exceeds ceiling
      userStatedMaxItemPrice: -50, // Negative
      mustHave: "not-an-array",
      preferences: [null, 123, "ergonomic"],
      excluded: undefined,
    };

    const resolved = resolveShoppingIntent(malformed, "ergonomic office chair", null, "USD");

    assert.strictEqual(resolved.totalBudget, null, "Extreme budget over 1,000,000 must be ignored");
    assert.strictEqual(resolved.maxItemPrice, null, "Negative item price must be ignored");
    assert.strictEqual(resolved.searchQuery, "ergonomic office chair", "Should fallback to trimmed input");
    assert.deepStrictEqual(resolved.mustHave, []);
    assert.deepStrictEqual(resolved.preferences, ["ergonomic"], "Should filter non-string items");
    assert.deepStrictEqual(resolved.excluded, []);
    assert.strictEqual(resolved.category, "General Products");
  });
});

