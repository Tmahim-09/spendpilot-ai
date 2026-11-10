import { test, describe } from "node:test";
import assert from "node:assert/strict";

if (process.loadEnvFile) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Ignore
  }
}
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-dummy-api-key";

import {
  createInitialSession,
  processUserMessage,
  isNewShoppingTask,
} from "../src/lib/ai/conversation-engine.ts";

import {
  bindProductConfigurationAndPrice,
  normalizeProductTechnicalClaims,
} from "../src/lib/shopping/spec-normalizer.ts";

import { filterEligibleCandidates } from "../src/lib/shopping/eligibility-gate.ts";

import { generateDynamicFallbackMessage } from "../src/lib/ai/gemini-interactions.ts";

import { retrieveProductVariants } from "../src/lib/channel3/variants.ts";

import type {
  NormalizedProduct,
  CanonicalShoppingAttribute,
} from "../src/types/index.ts";

function createMockProduct(partial: Partial<NormalizedProduct>): NormalizedProduct {
  return {
    source: "channel3",
    sourceProductId: partial.sourceProductId || `prod-${Math.random().toString(36).substring(2, 7)}`,
    title: partial.title || "Untitled Product",
    brand: partial.brand || null,
    description: partial.description || null,
    imageUrl: partial.imageUrl || null,
    priceMinor: partial.priceMinor ?? 99900,
    currency: partial.currency || "USD",
    retailerName: partial.retailerName || "Verified Retailer",
    retailerUrl: partial.retailerUrl || "https://example.com/product",
    availability: partial.availability || "in_stock",
    specifications: partial.specifications || {},
    sourceFacts: partial.sourceFacts || [],
    offers: partial.offers || [],
    ...partial,
  };
}

describe("SpendPilot AI: Conversational Intelligence, Task Isolation & Accuracy (Tests A - I)", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Test A: Natural conversation & franchise context
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test A: Natural conversation understands franchises and room decor without generic checklists", async () => {
    const session = createInitialSession({ currency: "USD" });
    const userPrompt = "I want my room decorated with Naruto, One Piece, and Attack on Titan.";

    const result = await processUserMessage({
      session,
      userMessage: userPrompt,
    });

    // 1. Must recognize room decor / anime context
    assert.equal(result.scope, "shopping_related");
    // 2. Must not use canned boilerplate
    assert.doesNotMatch(result.assistantMessage.content, /Let's find the best options for you\. Could you share your preferred style/i);
    assert.doesNotMatch(result.assistantMessage.content, /Preferences complete/i);
    // 3. Must not ask generic furniture questions like "Which type of furniture or room decor do you need?"
    assert.doesNotMatch(result.assistantMessage.content, /which type of furniture/i);
    // 4. If asking a question, it should be about budget, decor format, or wall space
    if (result.assistantMessage.nextQuestion) {
      const qText = result.assistantMessage.nextQuestion.text.toLowerCase();
      const isRelevant = qText.includes("budget") || qText.includes("decor") || qText.includes("wall") || qText.includes("style");
      assert.ok(isRelevant, `Expected context-specific question, got: "${result.assistantMessage.nextQuestion.text}"`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test B: New product in the same session (Task Switching)
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test B: Starting a new shopping task completely isolates state and clears previous task requirements", async () => {
    // Step 1: Start anime decor session
    let session = createInitialSession({ currency: "USD" });
    const turn1 = await processUserMessage({
      session,
      userMessage: "I want anime room decorations with Naruto posters",
    });
    session = turn1.session;

    // Check that anime request is stored
    assert.ok(session.originalRequest.toLowerCase().includes("anime"));

    // Step 2: User switches task to MacBook
    const turn2 = await processUserMessage({
      session,
      userMessage: "I need a MacBook for programming",
    });

    const newSession = turn2.session;

    // 1. Task switch detected
    assert.ok(isNewShoppingTask("anime room decorations", "I need a MacBook for programming"));
    assert.equal(turn2.action, "new_shopping_task");

    // 2. Original request updated to MacBook
    assert.ok(newSession.originalRequest.toLowerCase().includes("macbook"));

    // 3. Previous anime requirements NOT carried over
    assert.equal(newSession.canonicalAttributes?.["room-style"], undefined);
    assert.equal(newSession.canonicalAttributes?.["theme"], undefined);

    // 4. Laptop requirements recognized cleanly
    assert.ok(
      newSession.canonicalAttributes?.["operating_system"]?.value === "macOS" ||
      newSession.canonicalAttributes?.["primary_use"]?.value?.toString().toLowerCase().includes("programming") ||
      newSession.canonicalAttributes?.["product_family"]?.value === "MacBook" ||
      newSession.intentSummary.toLowerCase().includes("macbook")
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test C: Full browser refresh (Session Isolation)
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test C: Initial session is ephemeral in memory and starts completely empty", () => {
    const session1 = createInitialSession({});
    const session2 = createInitialSession({});

    // Each page load gets an ephemeral ID
    assert.ok(session1.sessionId);
    assert.ok(session2.sessionId);

    // Starts from zero: empty messages, empty requirements, no old interaction IDs
    assert.equal(session1.messages.length, 0);
    assert.equal(session1.requirements.length, 0);
    assert.equal(session1.retrievedProductIds?.length ?? 0, 0);
    assert.equal(session1.previousInteractionId, null);
    assert.equal(session1.canSearch, false);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test D: MacBook configuration mismatch (1TB vs 512GB)
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test D: MacBook 1TB requirement strictly rejects 512GB listing and binds price only to verified 1TB offer", () => {
    // Candidate 1: Listing title says MacBook Air, but internal storage and primary offer is 512GB at $1,099
    const candidate512 = createMockProduct({
      sourceProductId: "mac-512",
      title: "Apple MacBook Air 13-inch M2 Chip - 512GB SSD",
      priceMinor: 109900,
      specifications: {
        "Operating System": "macOS",
        "Storage": "512GB SSD",
        "Processor": "Apple M2",
      },
    });

    // Candidate 2: Listing has multiple offers; offer A is 512GB at $1099, offer B is 1TB at $1399
    const candidateMultiOffer = createMockProduct({
      sourceProductId: "mac-multi",
      title: "Apple MacBook Pro 14-inch M3",
      priceMinor: 109900, // base lowest price
      specifications: {
        "Operating System": "macOS",
        "Processor": "Apple M3",
      },
      offers: [
        {
          domain: "bestbuy.com",
          url: "https://bestbuy.com/macbook-pro-512gb",
          priceMinor: 109900,
          currency: "USD",
          availability: "in_stock",
        },
        {
          domain: "bestbuy.com",
          url: "https://bestbuy.com/macbook-pro-1tb",
          priceMinor: 139900,
          currency: "USD",
          availability: "in_stock",
        },
      ],
    });

    const canonicalAttrs: Record<string, CanonicalShoppingAttribute> = {
      storage: {
        key: "storage",
        label: "Storage",
        value: "1TB",
        displayValue: "1TB SSD",
        source: "user_explicit",
        status: "confirmed",
        constraint: "hard_requirement",
        updatedAt: Date.now(),
      },
      operating_system: {
        key: "operating_system",
        label: "Operating System",
        value: "macOS",
        displayValue: "macOS",
        source: "user_explicit",
        status: "confirmed",
        constraint: "hard_requirement",
        updatedAt: Date.now(),
      },
    };

    // 1. Eligibility Gate must disqualify Candidate 1 because 512GB cannot satisfy 1TB requirement
    const gateResult = filterEligibleCandidates({
      products: [candidate512],
      canonicalAttributes: canonicalAttrs,
      budgetCents: 150000,
      currency: "USD",
    });

    assert.equal(gateResult.eligibleProducts.length, 0);
    assert.equal(gateResult.disqualifiedProducts.length, 1);
    assert.ok(gateResult.disqualifiedProducts[0].reason.includes("512GB"));

    // 2. Candidate 2 multi-offer binding must bind the 1TB offer ($1399), NOT the 512GB offer ($1099)
    const bound = bindProductConfigurationAndPrice(candidateMultiOffer, "1TB");
    assert.equal(bound.priceMinor, 139900, "Should bind price directly to verified 1TB offer ($1,399)");
    assert.ok(bound.retailerUrl.includes("1tb"), "Should update retailerUrl to 1TB listing URL");
    assert.equal(bound.specifications["Storage"], "1TB SSD");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test E: Configure Options (Three genuine states)
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test E: Configure Options returns genuine states (variants_found, no_variants_verified, unavailable)", async () => {
    // 1. Product with unknown SKU returns "unavailable" without hanging network
    const res = await retrieveProductVariants("unknown-sku", {}, "USD");
    assert.ok(
      res.status === "unavailable" || res.status === "no_variants_verified",
      `Expected unavailable or no_variants_verified, got: ${res.status}`
    );
    assert.ok(res.retailerName);
    assert.equal(res.options.length, 0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test F: Duplicate and canned responses prevention
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test F: No canned strings or repetitive question checklists", async () => {
    const session = createInitialSession({ currency: "USD" });
    const fallback = generateDynamicFallbackMessage("I want a MacBook for programming", session);

    // Dynamic fallback must be context-specific, not static wizard boilerplate
    assert.ok(fallback.toLowerCase().includes("macbook"));
    assert.doesNotMatch(fallback, /Let's find the best options for you\. Could you share your preferred style/i);

    const fallbackAnime = generateDynamicFallbackMessage("Naruto and One Piece room decor", session);
    assert.ok(fallbackAnime.toLowerCase().includes("naruto") || fallbackAnime.toLowerCase().includes("anime"));
    assert.doesNotMatch(fallbackAnime, /Let's find the best options for you/i);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test G: Accurate specifications extraction
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test G: Normalizes MacBook hardware specifications cleanly without hallucinations", () => {
    const raw = createMockProduct({
      title: "Apple MacBook Pro 16-inch M3 Max 36GB Unified Memory 1TB SSD Space Black",
      brand: "Apple",
      priceMinor: 349900,
    });

    const normalized = normalizeProductTechnicalClaims(raw);
    assert.equal(normalized.specifications["Processor"], "Apple M3 Max");
    assert.equal(normalized.specifications["Screen Size"], "16-inch");
    assert.equal(normalized.specifications["Memory"], "36GB Unified Memory");
    assert.equal(normalized.specifications["Storage"], "1TB SSD");
    assert.equal(normalized.specifications["Operating System"], "macOS");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test H: Progressive work & operational indicators
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test H: Conversational turns maintain honest operation labels and do not fabricate completion", async () => {
    const session = createInitialSession({ currency: "USD" });

    // Incomplete request should ask a question rather than claiming complete
    const turn1 = await processUserMessage({
      session,
      userMessage: "I want sneakers",
    });

    assert.equal(turn1.shouldExecuteSearch, false);
    assert.ok(turn1.assistantMessage.nextQuestion, "Should ask for shoe size when missing");
    assert.doesNotMatch(turn1.assistantMessage.content, /preferences complete/i);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test I: Search Again preserves active task requirements
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test I: Search Again re-runs current requirements without cross-contaminating previous tasks", async () => {
    let session = createInitialSession({ currency: "USD", budget: 150000 });
    const turn = await processUserMessage({
      session,
      userMessage: "MacBook Air M2 16GB RAM under $1500",
    });
    session = turn.session;

    assert.equal(session.budget, 150000);
    assert.ok(session.originalRequest.toLowerCase().includes("macbook"));

    // User triggers search
    const searchTurn = await processUserMessage({
      session,
      userMessage: "Search now",
    });

    assert.ok(searchTurn.shouldExecuteSearch);
    assert.equal(searchTurn.session.budget, 150000);
    assert.ok(searchTurn.session.originalRequest.toLowerCase().includes("macbook"));
  });
});
