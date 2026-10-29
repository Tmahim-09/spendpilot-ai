import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateSearchPayload } from "../src/lib/validation/search.ts";

describe("Search Request Input Validation", () => {
  test("rejects non-object or null payload with 400", () => {
    const res1 = validateSearchPayload(null);
    assert.strictEqual(res1.valid, false);
    if (!res1.valid) {
      assert.strictEqual(res1.status, 400);
      assert.match(res1.error, /Invalid request payload/);
    }

    const res2 = validateSearchPayload("string-payload");
    assert.strictEqual(res2.valid, false);
    if (!res2.valid) {
      assert.strictEqual(res2.status, 400);
    }
  });

  test("rejects missing or non-string query with 400", () => {
    const res = validateSearchPayload({});
    assert.strictEqual(res.valid, false);
    if (!res.valid) {
      assert.strictEqual(res.status, 400);
      assert.match(res.error, /'query' parameter is required/);
    }
  });

  test("rejects empty or whitespace query with 400", () => {
    const res = validateSearchPayload({ query: "   " });
    assert.strictEqual(res.valid, false);
    if (!res.valid) {
      assert.strictEqual(res.status, 400);
      assert.match(res.error, /at least 2 characters/);
    }
  });

  test("rejects short query (<2 chars) with 400", () => {
    const res = validateSearchPayload({ query: "a" });
    assert.strictEqual(res.valid, false);
    if (!res.valid) {
      assert.strictEqual(res.status, 400);
      assert.match(res.error, /at least 2 characters/);
    }
  });

  test("rejects long query (>200 chars) with 400", () => {
    const longQuery = "headphones ".repeat(30);
    const res = validateSearchPayload({ query: longQuery });
    assert.strictEqual(res.valid, false);
    if (!res.valid) {
      assert.strictEqual(res.status, 400);
      assert.match(res.error, /cannot exceed 200 characters/);
    }
  });

  test("rejects negative or zero budget with 400", () => {
    const res1 = validateSearchPayload({ query: "laptop stand", budget: -15 });
    assert.strictEqual(res1.valid, false);
    if (!res1.valid) {
      assert.strictEqual(res1.status, 400);
      assert.match(res1.error, /positive number/);
    }

    const res2 = validateSearchPayload({ query: "laptop stand", budget: 0 });
    assert.strictEqual(res2.valid, false);
    if (!res2.valid) {
      assert.strictEqual(res2.status, 400);
      assert.match(res2.error, /positive number/);
    }
  });

  test("rejects budget over upper ceiling (> 1,000,000) with 400", () => {
    const res = validateSearchPayload({ query: "study desk", budget: 1500000 });
    assert.strictEqual(res.valid, false);
    if (!res.valid) {
      assert.strictEqual(res.status, 400);
      assert.match(res.error, /cannot exceed 1,000,000/);
    }
  });

  test("rejects unsupported currency code with 400", () => {
    const res = validateSearchPayload({ query: "wireless mouse", currency: "JPY" });
    assert.strictEqual(res.valid, false);
    if (!res.valid) {
      assert.strictEqual(res.status, 400);
      assert.match(res.error, /Unsupported currency 'JPY'/);
    }
  });

  test("accepts valid search payload with trimmed query and parsed budget", () => {
    const res = validateSearchPayload({
      query: "  mechanical keyboard under 100  ",
      budget: "100",
      currency: "usd",
    });
    assert.strictEqual(res.valid, true);
    if (res.valid) {
      assert.strictEqual(res.data.query, "mechanical keyboard under 100");
      assert.strictEqual(res.data.budget, 100);
      assert.strictEqual(res.data.currency, "USD");
    }
  });

  test("accepts valid search payload without budget (optional budget)", () => {
    const res = validateSearchPayload({
      query: "ergonomic chair",
    });
    assert.strictEqual(res.valid, true);
    if (res.valid) {
      assert.strictEqual(res.data.query, "ergonomic chair");
      assert.strictEqual(res.data.budget, null);
      assert.strictEqual(res.data.currency, "USD");
    }
  });
});

