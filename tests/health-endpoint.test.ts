import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../src/app/api/health/route.ts";

describe("SpendPilot AI: Health & Deployment Diagnostics Endpoint", () => {
  test("GET /api/health returns safe diagnostic payload with status 200", async () => {
    const response = await GET();
    assert.strictEqual(response.status, 200);

    const headers = response.headers;
    assert.strictEqual(headers.get("Cache-Control"), "no-store, max-age=0");

    const data = await response.json();
    assert.strictEqual(data.status, "ok");
    assert.strictEqual(data.application, "SpendPilot AI");
    assert.strictEqual(data.runtime, process.version);
    assert.ok(typeof data.environment === "string" && data.environment.length > 0);
    assert.ok("commit" in data);
    assert.ok("timestamp" in data);

    // Verify strict security: zero secrets or sensitive keys present
    const keys = Object.keys(data);
    const forbiddenSubstrings = [
      "key",
      "secret",
      "token",
      "password",
      "credential",
      "gemini",
      "channel3",
      "paypal",
      "merchant",
      "email",
    ];
    for (const key of keys) {
      const lower = key.toLowerCase();
      for (const forbidden of forbiddenSubstrings) {
        assert.ok(
          !lower.includes(forbidden),
          `Health payload must not leak key containing '${forbidden}', got '${key}'`
        );
      }
    }
  });
});

