import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { filterQualifyingProducts } from "../src/lib/shopping/price-policy.ts";
import { filterEligibleCandidates } from "../src/lib/shopping/eligibility-gate.ts";
import { resolveAuthoritativeBudget } from "../src/lib/shopping/budget-resolver.ts";
import { selectRetailerOffer } from "../src/lib/shopping/offer-verification.ts";
import { extractEvidenceFacts } from "../src/lib/ai/evidence-extractor.ts";
import { validateAndCleanComparison } from "../src/lib/ai/comparison-validator.ts";
import { isConversationalAcknowledgement, analyzeUserShoppingIntent } from "../src/lib/orchestrator/intent-analyzer.ts";
import {
  createInitialWorkspace,
  addIndependentItem,
  selectProductForItem,
  updateItemSearchResults,
  calculateWorkspaceBudgetSummary,
} from "../src/lib/workspace/workspace-manager.ts";
import { minorToMajorUnits } from "../src/lib/money.ts";
import type { NormalizedProduct, ProductOfferItem, EvidenceFact } from "../src/types/index.ts";
import type { ShoppingBrief } from "../src/lib/orchestrator/types.ts";

describe("SpendPilot AI: Shopping Pipeline Root-Cause Repair & Integrity Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.PAYPAL_ENV = "sandbox";
    process.env.PAYPAL_CLIENT_ID = "SANDBOX_CLIENT_ID_TEST";
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID = "SANDBOX_CLIENT_ID_TEST";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario A: Qualifying offer selected over above-budget offer
  // ─────────────────────────────────────────────────────────────────────────────
  test("Scenario A: filterQualifyingProducts must select $1,149 offer, discard $2,133 offer, and update product attributes", () => {
    const offerBestBuy: ProductOfferItem = {
      id: "off_bestbuy",
      domain: "bestbuy.com",
      url: "https://www.bestbuy.com/site/macbook-air-m3/1149",
      priceMinor: 114900,
      currency: "USD",
      availability: "in_stock",
      verificationStatus: "verified",
    };

    const offerAppleStore: ProductOfferItem = {
      id: "off_apple",
      domain: "apple.com",
      url: "https://www.apple.com/shop/buy-mac/macbook-air/2133",
      priceMinor: 213300,
      currency: "USD",
      availability: "in_stock",
      verificationStatus: "verified",
    };

    const productWithAboveBudgetSelection: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "macbook_air_m3_1",
      title: "Apple MacBook Air 13.6-inch M3 Chip",
      brand: "Apple",
      priceMinor: 213300,
      currency: "USD",
      retailerName: "apple.com",
      retailerUrl: "https://www.apple.com/shop/buy-mac/macbook-air/2133",
      availability: "in_stock",
      configurationStatus: "verified",
      selectedOffer: offerAppleStore,
      offers: [offerBestBuy, offerAppleStore],
      offersCount: 2,
      specifications: { "RAM": "16GB", "Storage": "512GB SSD" },
      sourceFacts: ["M3 Chip", "Retina Display"],
      imageUrl: null,
    };

    const result = filterQualifyingProducts({
      products: [productWithAboveBudgetSelection],
      budget: 1200, // $1,200 budget (hard ceiling = $1,200)
      currency: "USD",
      pricePreference: "near_budget",
      expandRange: false,
    });

    assert.equal(result.qualifyingProducts.length, 1, "Should retain 1 qualifying product");
    const qualified = result.qualifyingProducts[0]!;

    assert.equal(
      qualified.priceMinor,
      114900,
      "Product priceMinor must be updated to qualifying $1,149 offer, never $2,133"
    );
    assert.equal(
      qualified.selectedOffer?.priceMinor,
      114900,
      "Selected offer price must be $1,149"
    );
    assert.equal(
      qualified.selectedOffer?.domain,
      "bestbuy.com",
      "Selected offer retailer must be Best Buy"
    );
    assert.equal(
      qualified.retailerName,
      "bestbuy.com",
      "Product top-level retailerName must be updated to bestbuy.com"
    );
    assert.equal(
      qualified.offers?.length,
      1,
      "Qualifying offers array must discard the $2,133 offer"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario B: Strict budget ceiling check with NO 5% tolerance bypass
  // ─────────────────────────────────────────────────────────────────────────────
  test("Scenario B: Eligibility gate strictly excludes $1,250 product under $1,200 budget (no 5% bypass)", () => {
    const productsOverBudget: NormalizedProduct[] = [
      {
        source: "channel3",
        sourceProductId: "prod_1250",
        title: "Apple MacBook Air 13 - $1,250",
        priceMinor: 125000, // $1,250.00
        currency: "USD",
        retailerName: "retailer.com",
        retailerUrl: "https://retailer.com/item1",
        availability: "in_stock",
        specifications: {},
        sourceFacts: [],
        imageUrl: null,
      },
      {
        source: "channel3",
        sourceProductId: "prod_1399",
        title: "Apple MacBook Air 13 - $1,399",
        priceMinor: 139900, // $1,399.00
        currency: "USD",
        retailerName: "retailer.com",
        retailerUrl: "https://retailer.com/item2",
        availability: "in_stock",
        specifications: {},
        sourceFacts: [],
        imageUrl: null,
      },
    ];

    const eligibility = filterEligibleCandidates({
      products: productsOverBudget,
      budgetCents: 120000, // $1,200.00 strict ceiling
      currency: "USD",
    });

    assert.equal(
      eligibility.eligibleProducts.length,
      0,
      "No product over $1,200 may be considered eligible"
    );
    assert.equal(
      eligibility.isNoMatch,
      true,
      "System must honestly report no-match when all products exceed budget"
    );
    assert.equal(
      eligibility.disqualifiedProducts.length,
      2,
      "Both products must be disqualified"
    );
    assert.match(
      eligibility.disqualifiedProducts[0]!.reason,
      /exceeds maximum budget/i,
      "Disqualification reason must clearly cite exceeding maximum budget"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario C: Authoritative Budget Resolution hierarchy
  // ─────────────────────────────────────────────────────────────────────────────
  test("Scenario C: Authoritative budget resolver correctly extracts $1,200 from brief when item has no individual budget", () => {
    const mockBrief: ShoppingBrief = {
      schemaVersion: 1,
      taskId: "task_macbook_search",
      mode: "single_product",
      userGoal: "Find a MacBook for programming under $1,200",
      budget: {
        maximum: {
          amountMinor: 120000,
          currency: "USD",
        },
      },
      productRequirements: [
        {
          id: "req_mb_1",
          category: "laptop",
          displayName: "MacBook",
          searchQuery: "MacBook",
          quantity: 1,
          purpose: ["programming"],
          constraints: [],
          excludedAttributes: [],
        },
      ],
      missingInformation: [],
      status: "searching",
      updatedAt: new Date().toISOString(),
    };

    const itemWithoutBudget = {
      id: "item_mb_1",
      productRequest: "MacBook",
      category: "laptop",
      hardConstraints: {},
      preferences: {},
      priority: "essential" as const,
      status: "ready_to_search" as const,
      candidates: [],
      dependencies: [],
      answeredQuestionIds: [],
    };

    const resolved = resolveAuthoritativeBudget({
      item: itemWithoutBudget,
      brief: mockBrief,
      sessionBudget: null,
      sessionCurrency: "USD",
    });

    assert.equal(resolved.budgetMinor, 120000, "Must resolve 120,000 cents ($1,200)");
    assert.equal(resolved.currency, "USD", "Currency must match USD");
    assert.equal(resolved.scopeType, "brief_ceiling", "Scope type must be brief_ceiling");
    assert.equal(
      minorToMajorUnits(resolved.budgetMinor),
      1200,
      "Search API will receive major budget = 1200"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario D: Multiple offers with different specs maintain price-spec link
  // ─────────────────────────────────────────────────────────────────────────────
  test("Scenario D: Selecting distinct retailer offers updates both price and configuration attributes without cross-attribution", () => {
    const offer8GB: ProductOfferItem = {
      id: "off_8gb",
      domain: "retailer-a.com",
      url: "https://retailer-a.com/mb-8gb",
      priceMinor: 89900,
      currency: "USD",
      availability: "in_stock",
      verificationStatus: "verified",
      configurationAttributes: { "RAM": "8GB", "Storage": "256GB SSD" },
    };

    const offer16GB: ProductOfferItem = {
      id: "off_16gb",
      domain: "retailer-b.com",
      url: "https://retailer-b.com/mb-16gb",
      priceMinor: 114900,
      currency: "USD",
      availability: "in_stock",
      verificationStatus: "verified",
      configurationAttributes: { "RAM": "16GB", "Storage": "512GB SSD" },
    };

    const baseProduct: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "mb_air_m3",
      title: "Apple MacBook Air M3",
      priceMinor: 89900,
      currency: "USD",
      retailerName: "retailer-a.com",
      retailerUrl: "https://retailer-a.com/mb-8gb",
      availability: "in_stock",
      selectedOffer: offer8GB,
      offers: [offer8GB, offer16GB],
      offersCount: 2,
      specifications: {},
      sourceFacts: [],
      imageUrl: null,
    };

    // Initial state: Offer 1 (8GB @ $899)
    assert.equal(baseProduct.priceMinor, 89900);
    assert.equal(baseProduct.selectedOffer?.configurationAttributes?.["RAM"], "8GB");

    // User selects Offer 2 (16GB @ $1,149)
    const updatedProduct = selectRetailerOffer(baseProduct, "https://retailer-b.com/mb-16gb");

    assert.equal(
      updatedProduct.priceMinor,
      114900,
      "Price must update to $1,149 when 16GB offer is selected"
    );
    assert.equal(
      updatedProduct.selectedOffer?.domain,
      "retailer-b.com",
      "Selected retailer must update to retailer-b.com"
    );
    assert.equal(
      updatedProduct.selectedOffer?.configurationAttributes?.["RAM"],
      "16GB",
      "Configuration must reflect 16GB RAM for the $1,149 offer"
    );
    assert.notEqual(
      updatedProduct.priceMinor,
      89900,
      "System must NEVER claim 16GB RAM at $899"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario E: Ungrounded specifications downgraded to unknown
  // ─────────────────────────────────────────────────────────────────────────────
  test("Scenario E: comparison-validator downgrades ungrounded RAM assessment to unknown and records missing info", () => {
    const candidate: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "prod_no_specs",
      title: "Laptop with No Stated RAM",
      priceMinor: 99900,
      currency: "USD",
      retailerName: "retailer.com",
      retailerUrl: "https://retailer.com/item",
      availability: "in_stock",
      specifications: {}, // No RAM spec!
      sourceFacts: [], // No RAM feature!
      imageUrl: null,
    };

    // Server-extracted evidence facts has NO RAM fact for this product
    const evidenceFacts: Record<string, EvidenceFact> = {
      "fact-prod-0": {
        id: "fact-prod-0",
        productId: "prod_no_specs",
        category: "price",
        label: "Starting Price",
        value: "$999.00",
        sourceField: "priceMinor",
      },
    };

    // Raw Gemini response hallucinates RAM assessment as "strong" with no fact citation
    const rawComparisonFromGemini = {
      summary: "Comparison of laptop options.",
      bestMatchProductId: "prod_no_specs",
      bestMatchReason: "Matches requirements.",
      criteria: [
        {
          name: "RAM Performance",
          importance: "high",
          assessments: [
            {
              productId: "prod_no_specs",
              assessment: "strong", // Hallucinated rating!
              reason: "Equipped with fast 16GB unified memory",
              evidenceFactIds: [], // Zero citations!
            },
          ],
        },
      ],
      tradeoffs: [],
      alternativePicks: [],
      missingInformation: [],
    };

    const validation = validateAndCleanComparison(
      rawComparisonFromGemini,
      [candidate],
      evidenceFacts,
      "laptop"
    );

    assert.equal(validation.valid, true);
    const ramCriterion = validation.comparison.criteria.find(
      (c) => c.name === "RAM Performance"
    );
    assert.ok(ramCriterion, "RAM Performance criterion must exist");

    const assessment = ramCriterion.assessments[0]!;
    assert.equal(
      assessment.assessment,
      "unknown",
      "Assessment rating must be downgraded to 'unknown' when no evidence fact is cited"
    );

    const hasMissingRamInfo = validation.comparison.missingInformation.some(
      (m) => m.productId === "prod_no_specs" && m.field === "RAM Performance"
    );
    assert.equal(
      hasMissingRamInfo,
      true,
      "Missing information array must document the lack of verified RAM data"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario F: Transient search & ranking progress indicators cleanly cleared
  // ─────────────────────────────────────────────────────────────────────────────
  test("Scenario F: Terminal workspace update registers completed searchId and clears transient state", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "MacBook",
      category: "laptop",
    });

    const itemId = ws.groups[0]!.items[0]!.id;
    const searchId = `search_${itemId}_1`;

    // 1. Mark as searching
    ws = updateItemSearchResults(ws, itemId, {
      searchId,
      searchFingerprint: "fp_test",
      searchStatus: "searching",
      searchError: null,
    });
    assert.equal(ws.groups[0]!.items[0]!.searchStatus, "searching");

    // 2. Mark as completed
    const product: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "mb_1",
      title: "MacBook Air",
      priceMinor: 114900,
      currency: "USD",
      retailerName: "Best Buy",
      retailerUrl: "https://bestbuy.com",
      availability: "in_stock",
      specifications: {},
      sourceFacts: [],
      imageUrl: null,
    };

    ws = updateItemSearchResults(ws, itemId, {
      searchId,
      searchFingerprint: "fp_test",
      searchStatus: "completed",
      candidates: [product],
      searchError: null,
    });

    const completedItem = ws.groups[0]!.items[0]!;
    assert.equal(completedItem.searchStatus, "completed");
    assert.equal(completedItem.candidates.length, 1);
    assert.equal(completedItem.searchError, null);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario G: AI recommend timeout gracefully leaves catalog visible
  // ─────────────────────────────────────────────────────────────────────────────
  test("Scenario G: AI recommendation timeout leaves Channel3 catalog visible and transitions item to completed", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "MacBook",
      category: "laptop",
    });

    const itemId = ws.groups[0]!.items[0]!.id;
    const searchId = `search_${itemId}_timeout_test`;

    const rawCatalogProduct: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "mb_catalog_1",
      title: "MacBook Pro 14",
      priceMinor: 119900,
      currency: "USD",
      retailerName: "B&H Photo",
      retailerUrl: "https://bhphoto.com/mb",
      availability: "in_stock",
      specifications: {},
      sourceFacts: [],
      imageUrl: null,
    };

    // First register search in searching state (registering searchId)
    ws = updateItemSearchResults(ws, itemId, {
      searchId,
      searchFingerprint: "fp_timeout",
      searchStatus: "searching",
      searchError: null,
    });

    // When Gemini recommend endpoint times out, comparison is null, but candidates remain!
    ws = updateItemSearchResults(ws, itemId, {
      searchId,
      searchFingerprint: "fp_timeout",
      searchStatus: "completed",
      candidates: [rawCatalogProduct],
      comparison: null, // Gracefully omitted comparison
      searchError: null,
    });

    const updatedItem = ws.groups[0]!.items[0]!;
    assert.equal(updatedItem.searchStatus, "completed", "Status must be completed, not comparing");
    assert.equal(updatedItem.candidates.length, 1, "Catalog product must remain visible");
    assert.equal(updatedItem.comparison, null, "Comparison is gracefully null");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario H: Conversational acknowledgements do NOT trigger search
  // ─────────────────────────────────────────────────────────────────────────────
  test("Scenario H: Typing 'ok', 'great', or 'thanks' does not re-trigger product search", () => {
    assert.equal(isConversationalAcknowledgement("ok"), true);
    assert.equal(isConversationalAcknowledgement("okay"), true);
    assert.equal(isConversationalAcknowledgement("thanks!"), true);
    assert.equal(isConversationalAcknowledgement("great"), true);
    assert.equal(isConversationalAcknowledgement("cool, thanks"), false); // Multi-word query
    assert.equal(isConversationalAcknowledgement("Find me a MacBook"), false);

    const mockBrief: ShoppingBrief = {
      schemaVersion: 1,
      taskId: "task_123",
      mode: "single_product",
      userGoal: "Find a MacBook",
      productRequirements: [
        {
          id: "req_1",
          category: "laptop",
          displayName: "MacBook",
          searchQuery: "MacBook",
          quantity: 1,
          purpose: [],
          constraints: [],
          excludedAttributes: [],
        },
      ],
      missingInformation: [],
      status: "results_ready",
      updatedAt: new Date().toISOString(),
    };

    const intent = analyzeUserShoppingIntent({
      userMessage: "ok",
      activeBrief: mockBrief,
    });

    assert.equal(
      intent.type,
      "unrelated_query",
      "Acknowledgement must be identified as conversational message rather than new task or search"
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario I: Store offers selection respects active budget ceiling
  // ─────────────────────────────────────────────────────────────────────────────
  test("Scenario I: Select offer rejects offers exceeding budget ceiling", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = {
      ...ws,
      overallBudget: {
        amountMinor: 120000,
        currency: "USD",
        strict: true,
      },
    };
    ws = addIndependentItem(ws, {
      productRequest: "MacBook",
      category: "laptop",
      individualBudget: {
        amountMinor: 120000, // $1,200 ceiling
        currency: "USD",
        strict: true,
      },
    });

    const itemId = ws.groups[0]!.items[0]!.id;

    const offerUnderBudget: ProductOfferItem = {
      id: "off_1149",
      domain: "bestbuy.com",
      url: "https://bestbuy.com/mb",
      priceMinor: 114900, // $1,149
      currency: "USD",
      availability: "in_stock",
      verificationStatus: "verified",
    };

    const offerOverBudget: ProductOfferItem = {
      id: "off_1350",
      domain: "apple.com",
      url: "https://apple.com/mb",
      priceMinor: 135000, // $1,350
      currency: "USD",
      availability: "in_stock",
      verificationStatus: "verified",
    };

    const product: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "mb_card",
      title: "MacBook Air M3",
      priceMinor: 114900,
      currency: "USD",
      retailerName: "bestbuy.com",
      retailerUrl: "https://bestbuy.com/mb",
      availability: "in_stock",
      selectedOffer: offerUnderBudget,
      offers: [offerUnderBudget, offerOverBudget],
      offersCount: 2,
      specifications: {},
      sourceFacts: [],
      imageUrl: null,
    };

    // Add candidate to item
    const searchId = `search_${itemId}_1`;
    ws = updateItemSearchResults(ws, itemId, {
      searchId,
      searchFingerprint: "fp_i",
      searchStatus: "searching",
    });
    ws = updateItemSearchResults(ws, itemId, {
      searchId,
      searchFingerprint: "fp_i",
      searchStatus: "completed",
      candidates: [product],
    });

    // Select product with $1,149 offer
    ws = selectProductForItem(ws, itemId, product);
    assert.equal(ws.groups[0]!.items[0]!.status, "selected");
    assert.equal(ws.groups[0]!.items[0]!.selectedOffer?.priceMinor, 114900);

    const summary = calculateWorkspaceBudgetSummary(ws, "USD");
    assert.equal(summary.status, "within_budget");
    assert.equal(summary.isOverBudget, false);
    assert.equal(summary.remainingMinor, 5100); // $1,200 - $1,149 = $51 (5,100 cents)
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario J: Full pipeline integration test
  // ─────────────────────────────────────────────────────────────────────────────
  test("Scenario J: End-to-end shopping pipeline consistency from search to cart", () => {
    // 1. User searches 'MacBook under $1,200'
    const brief: ShoppingBrief = {
      schemaVersion: 1,
      taskId: "task_e2e",
      mode: "single_product",
      userGoal: "MacBook under $1,200",
      budget: {
        maximum: {
          amountMinor: 120000,
          currency: "USD",
        },
      },
      productRequirements: [
        {
          id: "req_e2e_1",
          category: "laptop",
          displayName: "MacBook",
          searchQuery: "MacBook",
          quantity: 1,
          purpose: [],
          constraints: [],
          excludedAttributes: [],
        },
      ],
      missingInformation: [],
      status: "ready_to_search",
      updatedAt: new Date().toISOString(),
    };

    let ws = createInitialWorkspace({ currency: "USD" });
    ws = {
      ...ws,
      overallBudget: {
        amountMinor: 120000,
        currency: "USD",
        strict: true,
      },
    };
    ws = addIndependentItem(ws, {
      productRequest: "MacBook",
      category: "laptop",
      requirementId: "req_e2e_1",
    });

    const item = ws.groups[0]!.items[0]!;

    // 2. Budget resolved to $1,200
    const resolvedBudget = resolveAuthoritativeBudget({
      item,
      group: ws.groups[0],
      workspace: ws,
      brief,
      sessionCurrency: "USD",
    });

    assert.equal(resolvedBudget.budgetMinor, 120000);
    assert.equal(minorToMajorUnits(resolvedBudget.budgetMinor), 1200);

    // 3. Channel3 returns candidate with $1,149 and $2,133 offers
    const offerBestBuy: ProductOfferItem = {
      id: "off_bb",
      domain: "bestbuy.com",
      url: "https://bestbuy.com/mb-e2e",
      priceMinor: 114900,
      currency: "USD",
      availability: "in_stock",
      verificationStatus: "verified",
      configurationAttributes: { "RAM": "16GB", "Storage": "512GB SSD" },
    };

    const offerApple: ProductOfferItem = {
      id: "off_apple",
      domain: "apple.com",
      url: "https://apple.com/mb-e2e",
      priceMinor: 213300,
      currency: "USD",
      availability: "in_stock",
      verificationStatus: "verified",
      configurationAttributes: { "RAM": "24GB", "Storage": "1TB SSD" },
    };

    const rawCandidate: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "macbook_e2e",
      title: "Apple MacBook Air 13 M3",
      brand: "Apple",
      priceMinor: 213300, // Previous or raw offer
      currency: "USD",
      retailerName: "apple.com",
      retailerUrl: "https://apple.com/mb-e2e",
      availability: "in_stock",
      configurationStatus: "verified",
      selectedOffer: offerApple,
      offers: [offerBestBuy, offerApple],
      offersCount: 2,
      specifications: { "RAM": "16GB", "Storage": "512GB SSD" },
      sourceFacts: ["M3 Chip"],
      imageUrl: "https://bestbuy.com/img.jpg",
    };

    // 4. Price policy selects $1,149 qualifying offer
    const { qualifyingProducts } = filterQualifyingProducts({
      products: [rawCandidate],
      budget: minorToMajorUnits(resolvedBudget.budgetMinor),
      currency: "USD",
      pricePreference: "near_budget",
      expandRange: false,
    });

    assert.equal(qualifyingProducts.length, 1);
    const qualifyingProduct = qualifyingProducts[0]!;
    assert.equal(qualifyingProduct.priceMinor, 114900);
    assert.equal(qualifyingProduct.selectedOffer?.domain, "bestbuy.com");

    // 5. Eligibility gate enforces strict ceiling
    const eligibility = filterEligibleCandidates({
      products: [qualifyingProduct],
      budgetCents: resolvedBudget.budgetMinor,
      currency: "USD",
    });
    assert.equal(eligibility.eligibleProducts.length, 1);

    // 6. Evidence facts extraction
    const { evidenceFacts } = extractEvidenceFacts(eligibility.eligibleProducts);
    assert.ok(Object.keys(evidenceFacts).length > 0);

    // 7. Store candidate in workspace
    const searchId = `search_${item.id}_e2e`;
    ws = updateItemSearchResults(ws, item.id, {
      searchId,
      searchFingerprint: "fp_e2e",
      searchStatus: "searching",
    });
    ws = updateItemSearchResults(ws, item.id, {
      searchId,
      searchFingerprint: "fp_e2e",
      searchStatus: "completed",
      candidates: eligibility.eligibleProducts,
      evidenceFacts,
    });

    // 8. User selects product for purchase
    ws = selectProductForItem(ws, item.id, qualifyingProduct);

    // 9. Workspace budget summary calculates exact financial status
    const cartSummary = calculateWorkspaceBudgetSummary(ws, "USD");
    assert.equal(cartSummary.totalSelectedMinor, 114900);
    assert.equal(cartSummary.status, "within_budget");
    assert.equal(cartSummary.isOverBudget, false);
    assert.equal(cartSummary.unpricedCount, 0);

    const selectedItem = ws.groups[0]!.items[0]!;
    assert.equal(selectedItem.status, "selected");
    assert.equal(selectedItem.selectedProduct?.priceMinor, 114900);
    assert.equal(selectedItem.selectedOffer?.domain, "bestbuy.com");
  });
});
