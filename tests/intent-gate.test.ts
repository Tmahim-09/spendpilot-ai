import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluateShoppingIntentGate } from "../src/lib/validation/intent-gate.ts";

describe("Deterministic Lightweight Intent Gate", () => {
  describe("Clearly Unrelated Prompts (Zero API calls)", () => {
    test("rejects code generation prompts with playful witty message", () => {
      const inputs = [
        "Write a Python program.",
        "write a python script to scrape web pages",
        "generate javascript function to sort array",
        "debug this code for me",
      ];

      for (const input of inputs) {
        const res = evaluateShoppingIntentGate(input);
        assert.strictEqual(res.isShopping, false, `Should reject "${input}" as non-shopping`);
        assert.strictEqual(res.category, "code_generation");
        assert.ok(typeof res.playfulResponse === "string" && res.playfulResponse.length > 20);
        assert.ok(res.suggestedProducts && res.suggestedProducts.length > 0);
      }
    });

    test("rejects math and homework prompts with playful witty message", () => {
      const inputs = [
        "Solve my calculus homework.",
        "solve this math equation",
        "calculate derivative of x^2",
        "help with geometry homework",
      ];

      for (const input of inputs) {
        const res = evaluateShoppingIntentGate(input);
        assert.strictEqual(res.isShopping, false, `Should reject "${input}" as non-shopping`);
        assert.strictEqual(res.category, "math_homework");
        assert.ok(typeof res.playfulResponse === "string" && res.playfulResponse.length > 20);
      }
    });

    test("rejects joke requests with witty response", () => {
      const inputs = [
        "Tell me a random joke.",
        "tell me a joke",
        "say something funny",
        "make me laugh",
      ];

      for (const input of inputs) {
        const res = evaluateShoppingIntentGate(input);
        assert.strictEqual(res.isShopping, false, `Should reject "${input}" as non-shopping`);
        assert.strictEqual(res.category, "jokes_humor");
        assert.ok(typeof res.playfulResponse === "string");
      }
    });

    test("rejects creative writing and poetry requests", () => {
      const inputs = [
        "Write me a poem.",
        "write a story about cats",
        "compose a haiku for me",
      ];

      for (const input of inputs) {
        const res = evaluateShoppingIntentGate(input);
        assert.strictEqual(res.isShopping, false, `Should reject "${input}" as non-shopping`);
        assert.strictEqual(res.category, "creative_writing");
      }
    });

    test("rejects trivia and science queries", () => {
      const inputs = [
        "Explain quantum mechanics.",
        "explain the theory of relativity",
        "who was the first president",
      ];

      for (const input of inputs) {
        const res = evaluateShoppingIntentGate(input);
        assert.strictEqual(res.isShopping, false, `Should reject "${input}" as non-shopping`);
        assert.strictEqual(res.category, "science_trivia");
      }
    });

    test("handles simple greetings gracefully", () => {
      const inputs = ["hi", "hello", "hey", "who are you"];
      for (const input of inputs) {
        const res = evaluateShoppingIntentGate(input);
        assert.strictEqual(res.isShopping, false);
        assert.strictEqual(res.category, "general_chit_chat");
      }
    });
  });

  describe("Legitimate Shopping Queries containing Programming or Academic terms", () => {
    test("accepts shopping requests that mention programming or coding", () => {
      const validSearches = [
        "A laptop for Python programming under $800",
        "A mechanical keyboard suitable for programming",
        "High resolution monitor for coding",
        "Ergonomic developer chair",
      ];

      for (const query of validSearches) {
        const res = evaluateShoppingIntentGate(query);
        assert.strictEqual(res.isShopping, true, `Should accept "${query}" as valid shopping request`);
      }
    });

    test("accepts shopping requests that mention math or calculus tools", () => {
      const validSearches = [
        "Scientific calculator for calculus homework under $30",
        "Graphing calculator for college math",
        "Desk lamp for studying calculus",
      ];

      for (const query of validSearches) {
        const res = evaluateShoppingIntentGate(query);
        assert.strictEqual(res.isShopping, true, `Should accept "${query}" as valid shopping request`);
      }
    });

    test("accepts standard consumer product searches", () => {
      const normalSearches = [
        "Wireless headphones under $100",
        "A reliable wireless mouse for university",
        "An adjustable laptop stand under $40",
        "Noise cancelling earbuds with mic",
        "USB-C multiport hub adapter",
      ];

      for (const query of normalSearches) {
        const res = evaluateShoppingIntentGate(query);
        assert.strictEqual(res.isShopping, true, `Should accept "${query}" as valid shopping request`);
      }
    });
  });
});

