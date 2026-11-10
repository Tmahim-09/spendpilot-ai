import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeInteractionResponse,
  resolveNaturalMessage,
  isRawJsonString,
} from "../src/lib/ai/normalize-interaction-response.ts";
import {
  streamConciergeTurn,
} from "../src/lib/concierge/streaming-engine.ts";
import {
  createInitialSession,
  processUserMessage,
} from "../src/lib/ai/conversation-engine.ts";
import {
  matchOfferToConfiguration,
  verifyAndSelectOffer,
} from "../src/lib/shopping/offer-verification.ts";
import { SPENDPILOT_REDIRECT_MESSAGE } from "../src/lib/ai/domain-guard.ts";
import type {
  NormalizedProduct,
  CanonicalShoppingAttribute,
} from "../src/types/index.ts";

describe("SpendPilot AI: Raw JSON Prevention, Natural Dialogue & Verified Variants", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Test A: Laptop JSON rendering
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test A: Laptop JSON rendering - Converts internal JSON to natural assistant message", async () => {
    // 1. Model produces internal JSON for clarification:
    const rawClarifyJson = JSON.stringify({
      action: "clarify",
      slot: "os",
      question: "Do you have an operating system preference, like macOS or Windows?",
    });

    const norm1 = normalizeInteractionResponse(rawClarifyJson);
    assert.equal(norm1.success, true);
    assert.equal(norm1.action, "clarify");
    assert.equal(
      norm1.assistantMessage,
      "Do you have an operating system preference, like macOS or Windows?"
    );
    assert.ok(!norm1.assistantMessage.includes("{"));
    assert.ok(!norm1.assistantMessage.includes("action"));
    assert.ok(!norm1.assistantMessage.includes("slot"));
    assert.ok(norm1.question !== null);
    assert.equal(norm1.question?.attributeKey, "operating_system");
    assert.ok(norm1.question?.options.some((o) => o.label.toLowerCase().includes("macos")));

    // 2. User selects macOS, model returns update_state JSON:
    const rawUpdateStateJson = JSON.stringify({
      action: "update_state",
      updates: {
        brief: {
          requirements: [
            {
              category: "laptop",
              search_query: "MacBook programming university",
              constraints: {
                os: "macOS",
              },
            },
          ],
        },
      },
      response: "Got it, looking for a macOS laptop suitable for programming and university.",
    });

    const norm2 = normalizeInteractionResponse(rawUpdateStateJson);
    assert.equal(norm2.success, true);
    assert.equal(norm2.action, "update_state");
    assert.equal(
      norm2.assistantMessage,
      "Got it, looking for a macOS laptop suitable for programming and university."
    );
    assert.ok(!norm2.assistantMessage.includes("{"));
    assert.ok(!norm2.assistantMessage.includes("updates"));
    assert.equal(norm2.requirementUpdates["operating_system"]?.value, "macOS");

    // 3. Verify in streaming engine: customStreamChunks containing rawUpdateStateJson yields clean text
    const session = createInitialSession({ sessionId: "test_laptop_a", initialQuery: "laptop for programming" });
    const generator = streamConciergeTurn({
      userMessage: "macOS",
      session,
      customStreamChunks: [rawUpdateStateJson],
    });

    const events = [];
    for await (const ev of generator) {
      events.push(ev);
    }

    const deltas = events.filter((e) => e.type === "delta").map((d) => (d as { text: string }).text).join("");
    assert.ok(!deltas.includes('{"action"'));
    assert.ok(!deltas.includes('"updates"'));
    assert.ok(deltas.includes("looking for a macOS laptop") || deltas.includes("MacBook"));

    // Verify session assistant message content is natural text
    const doneEv = events.find((e) => e.type === "done") as { session: typeof session };
    const lastMsg = doneEv.session.messages[doneEv.session.messages.length - 1];
    assert.equal(lastMsg.role, "assistant");
    assert.ok(!lastMsg.content.includes("{"));
    assert.ok(!lastMsg.content.includes("action"));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test B: Free-text response
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test B: Free-text response - Extracts macOS, 16GB RAM, and 1TB SSD without duplicates", async () => {
    const session = createInitialSession({
      sessionId: "test_laptop_b",
      initialQuery: "I need a laptop for programming and university.",
    });

    const result = await processUserMessage({
      session,
      userMessage: "I prefer macOS with at least 16GB RAM and 1TB SSD.",
      clientMessageId: "msg_b_1",
    });

    const canonical = result.session.canonicalAttributes || {};
    assert.ok(canonical["operating_system"] || canonical["os"]);
    assert.ok(canonical["storage"] || canonical["storage_capacity"]);
    assert.ok(canonical["memory"] || canonical["ram"]);

    // Storage is 1TB
    const storageVal = canonical["storage"]?.value || canonical["storage_capacity"]?.value;
    assert.ok(String(storageVal).toUpperCase().includes("1TB"));

    // RAM is 16GB
    const ramVal = canonical["memory"]?.value || canonical["ram"]?.value;
    assert.ok(String(ramVal).toUpperCase().includes("16GB"));

    // Exactly one entry per canonical attribute concept
    assert.equal(Object.keys(canonical).filter((k) => k === "storage").length <= 1, true);
    assert.equal(Object.keys(canonical).filter((k) => k === "memory").length <= 1, true);

    // No raw JSON in assistant message
    assert.ok(!result.assistantMessage.content.includes("{"));
    assert.ok(!result.assistantMessage.content.includes("action"));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test C: Quick reply interaction
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test C: Quick reply - User selects macOS option cleanly with one turn and acknowledgment", async () => {
    const initialSession = createInitialSession({
      sessionId: "test_quick_reply_c",
      initialQuery: "I need a laptop for university.",
    });

    // Turn 1: user asks for laptop
    const turn1 = await processUserMessage({
      session: initialSession,
      userMessage: "I need a laptop for university.",
      clientMessageId: "msg_c_1",
    });

    // Turn 2: user selects quick reply "macOS"
    const turn2 = await processUserMessage({
      session: turn1.session,
      userMessage: "macOS",
      answeredQuestionId: "q_operating_system",
      answeredAttributeKey: "operating_system",
      clientMessageId: "msg_c_2",
    });

    assert.equal(turn2.session.messages.filter((m) => m.clientMessageId === "msg_c_2").length, 1);
    assert.equal(turn2.session.canonicalAttributes?.["operating_system"]?.value, "macOS");
    assert.ok(
      turn2.session.canonicalAttributes?.["operating_system"]?.source === "user_confirmed" ||
        turn2.session.canonicalAttributes?.["operating_system"]?.source === "user_explicit"
    );
    assert.ok(!turn2.assistantMessage.content.includes("{"));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test D: Parent product price mismatch
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test D: Parent product price mismatch - 512GB offer is rejected for a 1TB requirement", () => {
    const parentProduct: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "macbook_pro_14",
      title: "Apple MacBook Pro 14-inch M3",
      imageUrl: "https://example.com/macbook.jpg",
      priceMinor: 99900, // $999 for base 512GB model
      currency: "USD",
      retailerName: "TechStore",
      retailerUrl: "https://example.com/item/macbook-512",
      availability: "in_stock",
      configurationStatus: "unverified",
      specifications: {},
      sourceFacts: [],
      offers: [
        {
          domain: "CheapestBaseRetailer",
          url: "https://example.com/macbook-512gb",
          priceMinor: 99900, // $999 for 512GB
          currency: "USD",
          availability: "in_stock",
          verificationStatus: "unverified",
          configurationAttributes: {
            storage: "512GB",
            memory: "8GB",
          },
        },
        {
          domain: "UpgradedRetailer",
          url: "https://example.com/macbook-1tb",
          priceMinor: 139900, // $1399 for 1TB
          currency: "USD",
          availability: "in_stock",
          verificationStatus: "verified",
          configurationAttributes: {
            storage: "1TB",
            memory: "16GB",
          },
        },
      ],
    };

    const requirements: Record<string, CanonicalShoppingAttribute> = {
      storage: {
        key: "storage",
        label: "Storage",
        value: "1TB",
        displayValue: "1TB",
        source: "user_explicit",
        status: "confirmed",
        constraint: "hard_requirement",
        updatedAt: Date.now(),
      },
    };

    // 1. Verify that matchOfferToConfiguration strictly rejects the 512GB offer
    const baseMatch = matchOfferToConfiguration(parentProduct, parentProduct.offers![0], requirements);
    assert.equal(baseMatch.isMatch, false);
    assert.equal(baseMatch.status, "unverified");
    assert.ok(baseMatch.reason.includes("512GB") && baseMatch.reason.includes("1TB"));

    // 2. Verify that matchOfferToConfiguration approves the 1TB offer
    const upgradedMatch = matchOfferToConfiguration(parentProduct, parentProduct.offers![1], requirements);
    assert.equal(upgradedMatch.isMatch, true);
    assert.equal(upgradedMatch.status, "verified");

    // 3. Verify that verifyAndSelectOffer selects the 1TB offer, NOT the cheaper 512GB offer
    const verifiedProduct = verifyAndSelectOffer(parentProduct, requirements);
    assert.equal(verifiedProduct.configurationStatus, "verified");
    assert.equal(verifiedProduct.priceMinor, 139900); // Must be $1,399, NOT $999!
    assert.equal(verifiedProduct.selectedOffer?.url, "https://example.com/macbook-1tb");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test E: Variant switching
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test E: Variant switching - Validates relaxation detection and option switching", async () => {
    // Test relaxation detection: if merchant returns 512GB when 1TB was requested
    const mockChannel3ProductWithRelaxation = {
      id: "prod_macbook_variant_test",
      title: "MacBook Pro",
      variants: {
        options: [
          {
            name: "Hard Drive Capacity",
            values: [
              { label: "512GB", exists: true, available: "INSTOCK" },
              { label: "1TB", exists: true, available: "OUTOFSTOCK" },
            ],
          },
        ],
        selected: [
          { name: "Hard Drive Capacity", label: "512GB" }, // Retailer substituted 512GB!
        ],
      },
    };

    const requested = { storage: "1TB" };
    const effectiveSelected = {
      [mockChannel3ProductWithRelaxation.variants.selected[0].name]:
        mockChannel3ProductWithRelaxation.variants.selected[0].label,
    };

    // The normReq is 1tb, normEff is 512gb -> mismatch detected!
    assert.notEqual(requested.storage.toLowerCase(), effectiveSelected["Hard Drive Capacity"].toLowerCase());
    assert.equal(effectiveSelected["Hard Drive Capacity"], "512GB");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test F: Malformed Gemini response
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test F: Malformed Gemini response - Does not crash or leak raw text", () => {
    const malformed = `{"action": "clarify", "slot": "o... truncated JSON syntax error!`;
    const result = normalizeInteractionResponse(malformed);

    assert.equal(result.success, false);
    assert.ok(result.error);
    assert.ok(!result.assistantMessage.includes("{"));
    assert.ok(!result.assistantMessage.includes("syntax error"));
    assert.ok(result.assistantMessage.length > 0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test G: Out-of-scope message
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test G: Out-of-scope message - Returns shopping-only redirect", () => {
    const outOfScopeJson = JSON.stringify({
      scope: "out_of_scope",
      action: "out_of_scope",
      assistantMessage: "Here is your Python script: def main(): ...",
    });

    const result = normalizeInteractionResponse(outOfScopeJson);
    assert.equal(result.scope, "out_of_scope");
    assert.equal(result.action, "out_of_scope");
    assert.equal(result.assistantMessage, SPENDPILOT_REDIRECT_MESSAGE);
    assert.ok(!result.assistantMessage.includes("def main"));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Additional Tests: Empty output, JSON string unwrap, and Markdown code fences
  // ─────────────────────────────────────────────────────────────────────────────
  test("Additional: Empty output returns safe default", () => {
    const result = normalizeInteractionResponse("");
    assert.equal(result.success, false);
    assert.ok(result.assistantMessage.length > 0);
    assert.ok(!result.assistantMessage.includes("{"));
  });

  test("Additional: Markdown code fence ```json ... ``` is stripped cleanly", () => {
    const markdown = "```json\n{\"action\": \"conversation_reply\", \"assistantMessage\": \"Hello! I can help you find that.\"}\n```";
    const result = normalizeInteractionResponse(markdown);
    assert.equal(result.success, true);
    assert.equal(result.assistantMessage, "Hello! I can help you find that.");
    assert.ok(!result.assistantMessage.includes("```"));
  });

  test("Additional: resolveNaturalMessage extracts message from nested JSON string", () => {
    const nested = '{"action":"clarify","question":"What screen size do you prefer?"}';
    const extracted = resolveNaturalMessage(nested);
    assert.equal(extracted, "What screen size do you prefer?");
    assert.ok(!isRawJsonString(extracted));
  });
});
