import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseMajorToMinor,
  formatMinorMoney,
  toChannel3Price,
  toGeminiMoneyContext,
  formatSafeBudget,
} from "../src/lib/money.ts";
import {
  extractAttributesFromText,
} from "../src/lib/shopping/requirement-engine.ts";
import {
  upsertCanonicalAttribute,
  isHardRequirement,
} from "../src/lib/shopping/canonical-attributes.ts";
import {
  processUserMessage,
  createInitialSession,
} from "../src/lib/ai/conversation-engine.ts";
import {
  filterEligibleCandidates,
  buildConstrainedSearchQuery,
} from "../src/lib/shopping/eligibility-gate.ts";
import {
  normalizeProductStorage,
  detectProductOperatingSystem,
  normalizeProductTechnicalClaims,
} from "../src/lib/shopping/spec-normalizer.ts";
import { validateAndCleanComparison } from "../src/lib/ai/comparison-validator.ts";
import type { NormalizedProduct } from "../src/types/index.ts";

function createMockProduct(partial: Partial<NormalizedProduct>): NormalizedProduct {
  return {
    source: "channel3",
    sourceProductId: partial.sourceProductId || `prod-${Math.random().toString(36).substring(2, 7)}`,
    title: partial.title || "Untitled Product",
    brand: partial.brand || null,
    imageUrl: partial.imageUrl || null,
    priceMinor: partial.priceMinor ?? 99900,
    currency: partial.currency || "USD",
    retailerName: partial.retailerName || "Verified Retailer",
    retailerUrl: partial.retailerUrl || "https://merchant.com",
    availability: partial.availability || "in_stock",
    offersCount: partial.offersCount || 1,
    specifications: partial.specifications || {},
    sourceFacts: partial.sourceFacts || [],
    ...partial,
  };
}

describe("SpendPilot AI: Critical Laptop Requirement Preservation & Currency Integrity", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // TEST A: MacBook Requirement
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Test A: MacBook requirement", () => {
    test("Initial user request extracts purpose so primary-use is already known and not asked again", async () => {
      const initialText = "I need a laptop for programming and university under $1,200.";
      const extracted = extractAttributesFromText(initialText);

      assert.ok(extracted["primary-use"] || extracted["primary_use"], "Primary use must be extracted");
      assert.match(
        String(extracted["primary-use"] || extracted["primary_use"]),
        /programming/i,
        "Programming should be recognized as primary use"
      );
      assert.match(
        String(extracted["secondary-use"] || extracted["secondary_use"]),
        /university/i,
        "University should be recognized as secondary use"
      );

      // Start session with initial query
      const session = createInitialSession({
        initialQuery: initialText,
        budget: parseMajorToMinor(1200),
        currency: "USD",
        mode: "single",
      });

      const turn1 = await processUserMessage({
        session,
        userMessage: initialText,
      });

      // Turn 1: Because purpose is known, the assistant should ask about OS, NOT primary-use
      assert.ok(turn1.session.activeQuestion, "Active question should be generated");
      assert.equal(
        turn1.session.activeQuestion?.attributeKey,
        "operating_system",
        "Should ask for Operating System, not primary use"
      );
      assert.notEqual(
        turn1.session.activeQuestion?.attributeKey,
        "primary_use",
        "Must NOT ask primary use because programming and university are already known"
      );

      // Follow-up: User selects 'macOS (Apple MacBook)'
      const turn2 = await processUserMessage({
        session: turn1.session,
        userMessage: "macOS (Apple MacBook)",
        answeredQuestionId: "q-operating-system",
        answeredAttributeKey: "operating_system",
      });

      // Operating system becomes a hard requirement
      assert.ok(isHardRequirement(turn2.session.canonicalAttributes, "operating_system"));
      assert.ok(isHardRequirement(turn2.session.canonicalAttributes, "manufacturer"));
      assert.ok(isHardRequirement(turn2.session.canonicalAttributes, "product_family"));

      assert.equal(turn2.session.canonicalAttributes?.["operating_system"]?.value, "macOS");
      assert.equal(turn2.session.canonicalAttributes?.["manufacturer"]?.value, "Apple");
      assert.equal(turn2.session.canonicalAttributes?.["product_family"]?.value, "MacBook");

      // Check that primary-use was NOT asked again
      assert.notEqual(
        turn2.session.activeQuestion?.attributeKey,
        "primary_use",
        "Must not ask primary use again after OS selection"
      );
    });

    test("Candidate filter strictly excludes Windows, ChromeOS, Asus, Dell, and ThinkPad when macOS is required", () => {
      const canonicalAttributes = upsertCanonicalAttribute(
        {},
        "operating_system",
        "macOS",
        "user_explicit",
        "confirmed",
        "hard_requirement"
      );

      const mockProducts: NormalizedProduct[] = [
        createMockProduct({
          sourceProductId: "asus-1",
          title: "ASUS Vivobook 16 WUXGA Laptop",
          brand: "ASUS",
          priceMinor: 89900,
          currency: "USD",
          retailerName: "BestBuy",
          retailerUrl: "https://bestbuy.com/asus",
          availability: "in_stock",
          offersCount: 1,
          specifications: { "Operating System": "Windows 11 Home" },
        }),
        createMockProduct({
          sourceProductId: "dell-1",
          title: "Dell Pro 16 Laptop",
          brand: "Dell",
          priceMinor: 115000,
          currency: "USD",
          retailerName: "Dell Store",
          retailerUrl: "https://dell.com/pro16",
          availability: "in_stock",
          offersCount: 1,
          specifications: { "Operating System": "Windows 11 Pro" },
        }),
        createMockProduct({
          sourceProductId: "thinkpad-1",
          title: "ThinkPad T14 Laptop",
          brand: "Lenovo",
          priceMinor: 119900,
          currency: "USD",
          retailerName: "Lenovo Store",
          retailerUrl: "https://lenovo.com/thinkpad",
          availability: "in_stock",
          offersCount: 1,
          specifications: { "Operating System": "Windows 11 Pro" },
        }),
        createMockProduct({
          sourceProductId: "apple-1",
          title: "Apple MacBook Air 13.6-inch M2",
          brand: "Apple",
          priceMinor: 109900,
          currency: "USD",
          retailerName: "Apple Authorized Retailer",
          retailerUrl: "https://merchant.com/macbook-air",
          availability: "in_stock",
          offersCount: 2,
          specifications: { "Operating System": "macOS" },
        }),
      ];

      const result = filterEligibleCandidates({
        products: mockProducts,
        canonicalAttributes,
        budgetCents: 120000,
        currency: "USD",
      });

      // Only the Apple MacBook may pass
      assert.equal(result.eligibleProducts.length, 1);
      assert.equal(result.eligibleProducts[0].sourceProductId, "apple-1");
      assert.equal(result.disqualifiedProducts.length, 3);
      assert.ok(result.disqualifiedProducts.some((d) => d.product.brand === "ASUS"));
      assert.ok(result.disqualifiedProducts.some((d) => d.product.brand === "Dell"));
      assert.ok(result.disqualifiedProducts.some((d) => d.product.brand === "Lenovo"));
    });

    test("Returns honest no-match state when no MacBook is available under budget", () => {
      const canonicalAttributes = upsertCanonicalAttribute(
        {},
        "operating_system",
        "macOS",
        "user_explicit",
        "confirmed",
        "hard_requirement"
      );

      // Only Windows laptops returned from search
      const mockWindowsOnly: NormalizedProduct[] = [
        createMockProduct({
          sourceProductId: "asus-1",
          title: "ASUS Vivobook 16 Laptop",
          brand: "ASUS",
          priceMinor: 89900,
          currency: "USD",
          retailerName: "Retailer",
          retailerUrl: "#",
          availability: "in_stock",
          offersCount: 1,
          specifications: { "Operating System": "Windows 11" },
        }),
      ];

      const result = filterEligibleCandidates({
        products: mockWindowsOnly,
        canonicalAttributes,
        budgetCents: 120000,
        currency: "USD",
      });

      assert.equal(result.isNoMatch, true, "Should return isNoMatch = true");
      assert.equal(result.eligibleProducts.length, 0, "Zero eligible products");
      assert.ok(result.noMatchMessage, "Should provide an honest explanation");
      assert.match(result.noMatchMessage, /MacBook/i);
      assert.match(result.noMatchMessage, /\$1,200/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST B: Requirement Preservation
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Test B: Requirement preservation", () => {
    test("Multiple conversation turns preserve original budget, purposes, and mandatory macOS", async () => {
      const initialText = "I need a laptop for programming and university under $1,200.";
      let session = createInitialSession({
        initialQuery: initialText,
        budget: parseMajorToMinor(1200),
        currency: "USD",
        mode: "single",
      });

      // Turn 1
      const turn1 = await processUserMessage({ session, userMessage: initialText });
      session = turn1.session;

      // Turn 2: User confirms macOS
      const turn2 = await processUserMessage({
        session,
        userMessage: "macOS (Apple MacBook)",
        answeredQuestionId: "q-operating-system",
        answeredAttributeKey: "operating_system",
      });
      session = turn2.session;

      // Turn 3: User specifies color preference
      const turn3 = await processUserMessage({
        session,
        userMessage: "Space Gray",
      });
      session = turn3.session;

      // Assertions across multiple turns:
      assert.equal(session.budget, 120000, "Budget must remain strictly 120,000 cents");
      assert.ok(
        isHardRequirement(session.canonicalAttributes, "operating_system"),
        "macOS must remain a hard requirement"
      );
      assert.equal(
        session.canonicalAttributes?.["operating_system"]?.value,
        "macOS",
        "macOS must not be replaced"
      );
      assert.equal(
        session.canonicalAttributes?.["manufacturer"]?.value,
        "Apple",
        "Manufacturer must remain Apple"
      );

      // Verify AI suggested attribute cannot overwrite user explicit hard requirement
      const tampered = upsertCanonicalAttribute(
        session.canonicalAttributes || {},
        "operating_system",
        "Windows 11",
        "ai_suggested"
      );
      assert.equal(
        tampered["operating_system"]?.value,
        "macOS",
        "AI suggestion must NEVER overwrite user explicit macOS preference"
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST C: Currency Correctness
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Test C: Currency correctness", () => {
    test("Verifies full money data model without 100x multiplication errors", () => {
      const userInput = 1200;

      // 1. User enters 1200 -> minor units 120,000
      const internalMinor = parseMajorToMinor(userInput);
      assert.equal(internalMinor, 120000, "1200 dollars must convert to 120000 cents");

      // 2. Gemini receives major USD context string
      const geminiContext = toGeminiMoneyContext(internalMinor, "USD");
      assert.equal(geminiContext, "$1,200", "Gemini receives formatted dollar string");

      // 3. Channel3 receives major units for price filter
      const channel3Price = toChannel3Price(internalMinor);
      assert.equal(channel3Price, 1200, "Channel3 receives 1200, NOT 120000 or 12000000");

      // 4. Main summary display
      const mainSummary = formatMinorMoney(internalMinor, "USD");
      assert.equal(mainSummary, "$1,200.00", "Main summary displays $1,200.00");

      // 5. Product details budget display (must never be $120,000.00)
      const productCardBudget = formatSafeBudget(internalMinor, "USD");
      assert.equal(productCardBudget, "$1,200.00", "Product card displays $1,200.00, never $120,000.00");
      assert.notEqual(productCardBudget, "$120,000.00", "Double multiplication bug is eliminated");

      // 6. Remaining budget calculation
      const productPriceMinor = 109900; // $1,099.00
      const remainingMinor = internalMinor - productPriceMinor;
      assert.equal(remainingMinor, 10100, "Remaining budget is 10,100 cents");
      assert.equal(formatMinorMoney(remainingMinor, "USD"), "$101.00", "Formatted remaining budget is $101.00");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST D: Product Identity Consistency
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Test D: Product identity consistency", () => {
    test("Canonical candidate IDs are maintained stably across shortlist, comparison, and product details", () => {
      const candidates: NormalizedProduct[] = [
        createMockProduct({
          sourceProductId: "prod-mb-air",
          title: "Apple MacBook Air M2",
          brand: "Apple",
          priceMinor: 109900,
          currency: "USD",
          retailerName: "Merchant A",
          retailerUrl: "https://merchant.com/a",
          availability: "in_stock",
          offersCount: 1,
        }),
        createMockProduct({
          sourceProductId: "prod-mb-pro",
          title: "Apple MacBook Pro 13-inch",
          brand: "Apple",
          priceMinor: 119900,
          currency: "USD",
          retailerName: "Merchant B",
          retailerUrl: "https://merchant.com/b",
          availability: "in_stock",
          offersCount: 1,
        }),
      ];

      const rawAiJson = {
        summary: "MacBook Air provides superior portability, while MacBook Pro offers sustained performance.",
        bestMatchProductId: "prod-mb-air",
        bestMatchReason: "Under budget with exceptional battery efficiency.",
        priorityInterpretation: ["Programming capability", "University portability"],
        criteria: [
          {
            name: "Portability",
            importance: "high",
            assessments: [
              { productId: "prod-mb-air", assessment: "strong", reason: "Ultra-thin chassis" },
              { productId: "prod-mb-pro", assessment: "partial", reason: "Slightly heavier" },
            ],
          },
        ],
        tradeoffs: [
          { productId: "prod-mb-air", summary: "Fanless design may throttle under heavy renders" },
        ],
        alternativePicks: [],
        missingInformation: [],
      };

      const validated = validateAndCleanComparison(rawAiJson, candidates, {}, "MacBook");

      // The top recommendation is among the candidates
      assert.equal(validated.topRecommendations[0].sourceProductId, "prod-mb-air");
      assert.equal(validated.topRecommendations[0].rank, 1);

      // Comparison best match ID matches top recommendation
      assert.equal(validated.comparison.bestMatchProductId, validated.topRecommendations[0].sourceProductId);

      // Truthful count
      const allDisplayProducts = [...validated.topRecommendations, ...validated.otherMatches];
      assert.equal(allDisplayProducts.length, 2, "Displays exactly 2 verified products");
      assert.ok(allDisplayProducts.some((p) => p.sourceProductId === "prod-mb-air"));
      assert.ok(allDisplayProducts.some((p) => p.sourceProductId === "prod-mb-pro"));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST E: Product Specification Accuracy
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Test E: Product specification accuracy", () => {
    test("Composite storage: 1TB SSD + 1TB Docking Station is NOT counted as 2TB internal storage", () => {
      const rawTitle = "ASUS Vivobook 16 WUXGA Laptop 2TB (1TB SSD + 1TB Docking Station)";
      const storageInfo = normalizeProductStorage(rawTitle);

      assert.equal(storageInfo.isBundledExternal, true, "Must recognize external bundled accessory");
      assert.equal(storageInfo.internalStorage, "1TB SSD", "Internal storage must be 1TB SSD");
      assert.match(storageInfo.externalStorage || "", /1TB Docking Station/i, "External storage must be recognized as Docking Station");
      assert.notEqual(storageInfo.internalStorage, "2TB SSD", "Must NOT claim 2TB internal SSD");

      const normalizedProduct = normalizeProductTechnicalClaims(
        createMockProduct({
          sourceProductId: "asus-dock",
          title: rawTitle,
          brand: "ASUS",
          priceMinor: 99900,
          currency: "USD",
          retailerName: "Retailer",
          retailerUrl: "#",
          availability: "in_stock",
          offersCount: 1,
          specifications: {},
        })
      );

      assert.ok(normalizedProduct.specifications?.["Internal Storage"]);
      assert.match(normalizedProduct.specifications?.["Internal Storage"], /1TB SSD/);
      assert.ok(normalizedProduct.specifications?.["External Storage"]);
      assert.match(normalizedProduct.specifications?.["External Storage"], /Docking Station/i);
    });

    test("Operating system detection correctly identifies macOS vs Windows", () => {
      const macProduct = createMockProduct({
        sourceProductId: "mac-1",
        title: "Apple MacBook Air 15-inch M3 Chip",
        brand: "Apple",
        priceMinor: 119900,
        currency: "USD",
        retailerName: "Apple",
        retailerUrl: "#",
        availability: "in_stock",
        offersCount: 1,
      });

      const winProduct = createMockProduct({
        sourceProductId: "win-1",
        title: "Dell Inspiron 16 Laptop Windows 11",
        brand: "Dell",
        priceMinor: 79900,
        currency: "USD",
        retailerName: "Dell",
        retailerUrl: "#",
        availability: "in_stock",
        offersCount: 1,
      });

      assert.equal(detectProductOperatingSystem(macProduct), "macOS");
      assert.equal(detectProductOperatingSystem(winProduct), "Windows");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST F: Conversation and Search Flow
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Test F: Conversation and search flow", () => {
    test("Initial purpose extracted, questions not repeated, and search query augmented with MacBook", async () => {
      const initialText = "I need a laptop for programming and university under $1,200.";
      const session = createInitialSession({
        initialQuery: initialText,
        budget: parseMajorToMinor(1200),
        currency: "USD",
        mode: "single",
      });

      // Turn 1: Process initial message
      const turn1 = await processUserMessage({ session, userMessage: initialText });
      assert.ok(turn1.session.activeQuestion);
      assert.equal(turn1.session.activeQuestion?.attributeKey, "operating_system");

      // Turn 2: User responds "macOS (Apple MacBook)"
      const turn2 = await processUserMessage({
        session: turn1.session,
        userMessage: "macOS (Apple MacBook)",
        answeredQuestionId: "q-operating-system",
        answeredAttributeKey: "operating_system",
      });

      // Both OS and primary use are now satisfied -> should trigger search
      assert.equal(turn2.shouldExecuteSearch, true, "Search should execute automatically");
      assert.equal(turn2.session.canSearch, true);

      // Search query builder uses hard constraint
      const constrainedQuery = buildConstrainedSearchQuery(
        turn2.session.originalRequest,
        turn2.session.canonicalAttributes
      );
      assert.equal(constrainedQuery, "Apple MacBook", "Search query is targeted to Apple MacBook");
    });
  });
});
