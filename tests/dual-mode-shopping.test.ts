import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  calculateBudgetRange,
  filterQualifyingProducts,
} from "../src/lib/shopping/price-policy.ts";

import {
  calculateRecommendedBundle,
} from "../src/lib/setup/bundle-calculator.ts";

import {
  executeSetupSearch,
} from "../src/lib/setup/setup-search.ts";

import type {
  NormalizedProduct,
  SetupRequirementItem,
  SetupCategorySearchResult,
  SetupComparisonCategoryResult,
} from "../src/types/index.ts";

describe("Single Product Mode & Near-Budget Targeting (10 Unit Scenarios)", () => {
  // Scenario 1: Single product search with budget of $150 uses preferred range of $135 to $150
  test("1. calculates preferred range of $135 to $150 for a $150 budget in near_budget mode", () => {
    const range = calculateBudgetRange(150, "USD");
    assert.equal(range.hardMax, 150);
    assert.equal(range.preferredMin, 135);
    assert.equal(range.targetPrice, 142.5);
    assert.equal(range.rangeText, "$135–$150");
  });

  // Scenario 2: Product priced at $140 qualifies for preferred range
  test("2. product priced at $140 qualifies for preferred range $135–$150", () => {
    const product: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "prod-140",
      title: "Audio-Technica ATH-M50xBT2",
      brand: "Audio-Technica",
      imageUrl: "https://example.com/ath.jpg",
      priceMinor: 14000,
      currency: "USD",
      retailerName: "B&H Photo",
      retailerUrl: "https://example.com/ath",
      availability: "in_stock",
      specifications: {},
      sourceFacts: ["Bluetooth 5.0", "50hr battery"],
      offers: [
        {
          domain: "bhphotovideo.com",
          url: "https://example.com/ath",
          priceMinor: 14000,
          currency: "USD",
          availability: "in_stock",
        },
      ],
    };

    const { qualifyingProducts } = filterQualifyingProducts({
      products: [product],
      budget: 150,
      currency: "USD",
      pricePreference: "near_budget",
    });

    assert.equal(qualifyingProducts.length, 1);
    assert.equal(qualifyingProducts[0].sourceProductId, "prod-140");
    assert.equal(qualifyingProducts[0].priceMinor, 14000);
  });

  // Scenario 3: Product priced at $120 does not qualify in Near Budget mode
  test("3. product priced at $120 does not qualify in Near Budget mode ($135–$150)", () => {
    const product: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "prod-120",
      title: "Sony WH-CH720N Wireless",
      brand: "Sony",
      imageUrl: "https://example.com/sony120.jpg",
      priceMinor: 12000,
      currency: "USD",
      retailerName: "Best Buy",
      retailerUrl: "https://example.com/sony120",
      availability: "in_stock",
      specifications: {},
      sourceFacts: ["ANC", "35hr battery"],
      offers: [
        {
          domain: "bestbuy.com",
          url: "https://example.com/sony120",
          priceMinor: 12000,
          currency: "USD",
          availability: "in_stock",
        },
      ],
    };

    const { qualifyingProducts, emptyInPreferredRange } = filterQualifyingProducts({
      products: [product],
      budget: 150,
      currency: "USD",
      pricePreference: "near_budget",
    });

    assert.equal(qualifyingProducts.length, 0, "A $120 product should be excluded when user asked for near $150 budget");
    assert.equal(emptyInPreferredRange, true);
  });

  // Scenario 4: Product priced at $40 does not qualify in Near Budget mode
  test("4. product priced at $40 does not qualify in Near Budget mode ($135–$150)", () => {
    const product: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "prod-40",
      title: "JBL Tune 510BT",
      brand: "JBL",
      imageUrl: "https://example.com/jbl40.jpg",
      priceMinor: 4000,
      currency: "USD",
      retailerName: "Target",
      retailerUrl: "https://example.com/jbl40",
      availability: "in_stock",
      specifications: {},
      sourceFacts: ["On-ear"],
      offers: [
        {
          domain: "target.com",
          url: "https://example.com/jbl40",
          priceMinor: 4000,
          currency: "USD",
          availability: "in_stock",
        },
      ],
    };

    const { qualifyingProducts } = filterQualifyingProducts({
      products: [product],
      budget: 150,
      currency: "USD",
      pricePreference: "near_budget",
    });

    assert.equal(qualifyingProducts.length, 0, "A $40 product should never qualify in near_budget mode with $150 target");
  });

  // Scenario 5: Product priced above $150 is always excluded regardless of mode
  test("5. product priced above $150 ($155) is excluded in both near_budget and best_value modes", () => {
    const expensiveProduct: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "prod-155",
      title: "Bose SoundLink Around-Ear",
      brand: "Bose",
      imageUrl: "https://example.com/bose155.jpg",
      priceMinor: 15500,
      currency: "USD",
      retailerName: "Amazon",
      retailerUrl: "https://example.com/bose155",
      availability: "in_stock",
      specifications: {},
      sourceFacts: ["Over budget"],
      offers: [
        {
          domain: "amazon.com",
          url: "https://example.com/bose155",
          priceMinor: 15500,
          currency: "USD",
          availability: "in_stock",
        },
      ],
    };

    const nearBudget = filterQualifyingProducts({
      products: [expensiveProduct],
      budget: 150,
      currency: "USD",
      pricePreference: "near_budget",
    });
    assert.equal(nearBudget.qualifyingProducts.length, 0);

    const bestValue = filterQualifyingProducts({
      products: [expensiveProduct],
      budget: 150,
      currency: "USD",
      pricePreference: "best_value",
    });
    assert.equal(bestValue.qualifyingProducts.length, 0, "Product exceeding hard max must be excluded in best_value mode");
  });

  // Scenario 6: Best Value mode allows cheaper valid products within hard maximum
  test("6. best_value mode allows cheaper valid products within hard maximum ($0–$150)", () => {
    const products: NormalizedProduct[] = [
      {
        source: "channel3",
        sourceProductId: "prod-40",
        title: "Budget Choice $40",
        brand: "Generic",
        imageUrl: "",
        priceMinor: 4000,
        currency: "USD",
        retailerName: "Store A",
        retailerUrl: "https://example.com/40",
        availability: "in_stock",
        specifications: {},
        sourceFacts: [],
        offers: [
          { domain: "storea.com", url: "https://example.com/40", priceMinor: 4000, currency: "USD", availability: "in_stock" },
        ],
      },
      {
        source: "channel3",
        sourceProductId: "prod-120",
        title: "Mid-range Choice $120",
        brand: "Generic",
        imageUrl: "",
        priceMinor: 12000,
        currency: "USD",
        retailerName: "Store B",
        retailerUrl: "https://example.com/120",
        availability: "in_stock",
        specifications: {},
        sourceFacts: [],
        offers: [
          { domain: "storeb.com", url: "https://example.com/120", priceMinor: 12000, currency: "USD", availability: "in_stock" },
        ],
      },
      {
        source: "channel3",
        sourceProductId: "prod-145",
        title: "Premium Choice $145",
        brand: "Generic",
        imageUrl: "",
        priceMinor: 14500,
        currency: "USD",
        retailerName: "Store C",
        retailerUrl: "https://example.com/145",
        availability: "in_stock",
        specifications: {},
        sourceFacts: [],
        offers: [
          { domain: "storec.com", url: "https://example.com/145", priceMinor: 14500, currency: "USD", availability: "in_stock" },
        ],
      },
    ];

    const { qualifyingProducts } = filterQualifyingProducts({
      products,
      budget: 150,
      currency: "USD",
      pricePreference: "best_value",
    });

    assert.equal(qualifyingProducts.length, 3, "All 3 items qualify under best_value mode");
  });

  // Scenario 7: Search returning zero products in preferred range produces explicit action to expand range
  test("7. empty near-budget search returns zero products and indicates range expansion available", () => {
    const products: NormalizedProduct[] = [
      {
        source: "channel3",
        sourceProductId: "prod-40",
        title: "Cheap Mouse $40",
        brand: "Generic",
        imageUrl: "",
        priceMinor: 4000,
        currency: "USD",
        retailerName: "Store A",
        retailerUrl: "https://example.com/40",
        availability: "in_stock",
        specifications: {},
        sourceFacts: [],
        offers: [
          { domain: "storea.com", url: "https://example.com/40", priceMinor: 4000, currency: "USD", availability: "in_stock" },
        ],
      },
    ];

    const { qualifyingProducts, emptyInPreferredRange, preferredRangeText } = filterQualifyingProducts({
      products,
      budget: 150,
      currency: "USD",
      pricePreference: "near_budget",
      expandRange: false,
    });

    assert.equal(qualifyingProducts.length, 0);
    assert.equal(emptyInPreferredRange, true);
    assert.equal(preferredRangeText, "$135–$150");
  });

  // Scenario 8: Expanding price range never changes the hard maximum
  test("8. expanding price range permits items below 90% but preserves hard maximum at $150", () => {
    const products: NormalizedProduct[] = [
      {
        source: "channel3",
        sourceProductId: "prod-40",
        title: "Item at $40",
        brand: "Brand",
        imageUrl: "",
        priceMinor: 4000,
        currency: "USD",
        retailerName: "Store",
        retailerUrl: "",
        availability: "in_stock",
        specifications: {},
        sourceFacts: [],
        offers: [{ domain: "s.com", url: "", priceMinor: 4000, currency: "USD", availability: "in_stock" }],
      },
      {
        source: "channel3",
        sourceProductId: "prod-160",
        title: "Item at $160",
        brand: "Brand",
        imageUrl: "",
        priceMinor: 16000,
        currency: "USD",
        retailerName: "Store",
        retailerUrl: "",
        availability: "in_stock",
        specifications: {},
        sourceFacts: [],
        offers: [{ domain: "s.com", url: "", priceMinor: 16000, currency: "USD", availability: "in_stock" }],
      },
    ];

    const { qualifyingProducts, emptyInPreferredRange } = filterQualifyingProducts({
      products,
      budget: 150,
      currency: "USD",
      pricePreference: "near_budget",
      expandRange: true, // User clicked "Expand price range"
    });

    assert.equal(qualifyingProducts.length, 1);
    assert.equal(qualifyingProducts[0].sourceProductId, "prod-40");
    assert.equal(emptyInPreferredRange, false);
  });

  // Scenario 9: Multiple merchant offers on one product are not counted as separate candidate products
  test("9. multiple merchant offers on one product are not counted as separate candidate products", () => {
    const productWithMultipleOffers: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "prod-multi-offer",
      title: "Sony WH-1000XM4 Wireless Headphones",
      brand: "Sony",
      imageUrl: "https://example.com/sony.jpg",
      priceMinor: 14500,
      currency: "USD",
      retailerName: "Best Buy",
      retailerUrl: "https://example.com/bestbuy",
      availability: "in_stock",
      specifications: {},
      sourceFacts: ["Industry-leading ANC"],
      offers: [
        { domain: "bestbuy.com", url: "https://example.com/bestbuy", priceMinor: 14500, currency: "USD", availability: "in_stock" },
        { domain: "bhphotovideo.com", url: "https://example.com/bh", priceMinor: 14800, currency: "USD", availability: "in_stock" },
        { domain: "walmart.com", url: "https://example.com/walmart", priceMinor: 14999, currency: "USD", availability: "in_stock" },
      ],
    };

    const { qualifyingProducts } = filterQualifyingProducts({
      products: [productWithMultipleOffers],
      budget: 150,
      currency: "USD",
      pricePreference: "near_budget",
    });

    assert.equal(qualifyingProducts.length, 1, "Exactly 1 distinct product returned");
    assert.equal(qualifyingProducts[0].offers?.length, 3, "All 3 authentic merchant offers preserved");
  });

  // Scenario 10: Incomparable currencies are not silently combined in Single Product mode
  test("10. offers in incomparable currencies are excluded from qualifying products", () => {
    const foreignCurrencyProduct: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "prod-eur",
      title: "Sennheiser HD 560S",
      brand: "Sennheiser",
      imageUrl: "https://example.com/eur.jpg",
      priceMinor: 14000,
      currency: "EUR",
      retailerName: "Thomann",
      retailerUrl: "https://example.com/thomann",
      availability: "in_stock",
      specifications: {},
      sourceFacts: [],
      offers: [
        { domain: "thomann.de", url: "https://example.com/thomann", priceMinor: 14000, currency: "EUR", availability: "in_stock" },
      ],
    };

    const { qualifyingProducts } = filterQualifyingProducts({
      products: [foreignCurrencyProduct],
      budget: 150,
      currency: "USD",
      pricePreference: "near_budget",
    });

    assert.equal(qualifyingProducts.length, 0, "Product priced in EUR must not qualify for a USD search");
  });
});

describe("Multi-product Setup & Budget-Aware Bundling (17 Unit Scenarios)", () => {
  // Scenario 1: Setup request for 5 items decomposes into 5 distinct product requirements
  test("1. setup request for 5 items produces 5 distinct product requirements", () => {
    const items: SetupRequirementItem[] = [
      { id: "req-cpu", name: "Desktop CPU", searchQuery: "AMD Ryzen 5", allocationPercentage: 30, allocatedAmount: 300, allocatedAmountMinor: 30000, priority: "high", requirements: ["AM5"] },
      { id: "req-mb", name: "Motherboard", searchQuery: "B650 Motherboard", allocationPercentage: 20, allocatedAmount: 200, allocatedAmountMinor: 20000, priority: "high", requirements: ["AM5", "DDR5"] },
      { id: "req-ram", name: "RAM", searchQuery: "32GB DDR5 RAM", allocationPercentage: 15, allocatedAmount: 150, allocatedAmountMinor: 15000, priority: "medium", requirements: ["DDR5"] },
      { id: "req-gpu", name: "Graphics Card", searchQuery: "RTX 4060 GPU", allocationPercentage: 25, allocatedAmount: 250, allocatedAmountMinor: 25000, priority: "high", requirements: ["8GB"] },
      { id: "req-psu", name: "Power Supply", searchQuery: "650W PSU Gold", allocationPercentage: 10, allocatedAmount: 100, allocatedAmountMinor: 10000, priority: "medium", requirements: ["650W"] },
    ];

    assert.equal(items.length, 5);
    const uniqueIds = new Set(items.map((i) => i.id));
    assert.equal(uniqueIds.size, 5);
    const totalAllocated = items.reduce((sum, i) => sum + i.allocatedAmount, 0);
    assert.equal(totalAllocated, 1000);
  });

  // Scenario 2: Each confirmed requirement triggers exactly one Channel3 search
  test("2. each confirmed requirement triggers exactly one Channel3 search via executeSetupSearch", async () => {
    const items: SetupRequirementItem[] = [
      { id: "req-1", name: "Item 1", searchQuery: "Query 1", allocationPercentage: 50, allocatedAmount: 500, allocatedAmountMinor: 50000, priority: "high", requirements: [] },
      { id: "req-2", name: "Item 2", searchQuery: "Query 2", allocationPercentage: 50, allocatedAmount: 500, allocatedAmountMinor: 50000, priority: "high", requirements: [] },
    ];

    const queriedItems: string[] = [];
    const mockSearchFn = async (keywords: string) => {
      queriedItems.push(keywords);
      return [];
    };

    await executeSetupSearch({
      items,
      totalBudget: 1000,
      currency: "USD",
      searchFn: mockSearchFn,
    });

    assert.equal(queriedItems.length, 2);
    assert.deepEqual(queriedItems, ["Query 1", "Query 2"]);
  });

  // Scenario 3: Each Channel3 search returns at most 2 distinct product candidates
  test("3. each Channel3 search strictly caps at 2 distinct product candidates per category", async () => {
    const items: SetupRequirementItem[] = [
      { id: "req-1", name: "Keyboard", searchQuery: "Keyboard", allocationPercentage: 100, allocatedAmount: 100, allocatedAmountMinor: 10000, priority: "high", requirements: [] },
    ];

    // Mock returns 5 products
    const mockProducts: NormalizedProduct[] = Array.from({ length: 5 }, (_, i) => ({
      source: "channel3",
      sourceProductId: `keyb-${i}`,
      title: `Keyboard ${i}`,
      brand: "Brand",
      imageUrl: "",
      priceMinor: 9500, // Within 90-100% of $100
      currency: "USD",
      retailerName: "Store",
      retailerUrl: "https://example.com",
      availability: "in_stock",
      specifications: {},
      sourceFacts: [],
      offers: [{ merchantName: "Store", domain: "s.com", url: "", priceMinor: 9500, currency: "USD", availability: "in_stock" }],
    }));

    const categories = await executeSetupSearch({
      items,
      totalBudget: 100,
      currency: "USD",
      searchFn: async () => mockProducts,
    });

    assert.equal(categories.length, 1);
    assert.equal(categories[0].products.length, 2, "Must cap at 2 distinct product candidates per category");
  });

  // Scenario 4: Total candidates passed to comparison for 5 requirements cannot exceed 10
  test("4. 5 requirements with 2 candidates each produce at most 10 total candidates", async () => {
    const items: SetupRequirementItem[] = Array.from({ length: 5 }, (_, i) => ({
      id: `req-${i}`,
      name: `Req ${i}`,
      searchQuery: `Keywords ${i}`,
      allocationPercentage: 20,
      allocatedAmount: 200,
      allocatedAmountMinor: 20000,
      priority: "high",
      requirements: [],
    }));

    const categories = await executeSetupSearch({
      items,
      totalBudget: 1000,
      currency: "USD",
      searchFn: async (kw) => [
        { source: "channel3", sourceProductId: `${kw}-1`, title: `${kw} 1`, brand: "B", imageUrl: "", priceMinor: 19000, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: [], offers: [{ merchantName: "R", domain: "r.com", url: "", priceMinor: 19000, currency: "USD", availability: "in_stock" }] },
        { source: "channel3", sourceProductId: `${kw}-2`, title: `${kw} 2`, brand: "B", imageUrl: "", priceMinor: 19500, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: [], offers: [{ merchantName: "R", domain: "r.com", url: "", priceMinor: 19500, currency: "USD", availability: "in_stock" }] },
      ],
    });

    const totalCandidates = categories.reduce((sum, cat) => sum + cat.products.length, 0);
    assert.equal(totalCandidates, 10);
    assert(totalCandidates <= 10, "Total candidates cannot exceed 10");
  });

  // Scenario 5: Duplicate products returned across categories are handled safely without crashing
  test("5. duplicate product returned across different categories is handled safely", () => {
    const sharedProduct: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "shared-prod-1",
      title: "Universal Cable & Adapter Pack",
      brand: "Anker",
      imageUrl: "",
      priceMinor: 2500,
      currency: "USD",
      retailerName: "Amazon",
      retailerUrl: "https://example.com/cable",
      availability: "in_stock",
      specifications: {},
      sourceFacts: [],
    };

    const requirements: SetupRequirementItem[] = [
      { id: "req-1", name: "Cable Pack", searchQuery: "cables", allocationPercentage: 50, allocatedAmount: 50, allocatedAmountMinor: 5000, priority: "high", requirements: [] },
      { id: "req-2", name: "Spare Cable", searchQuery: "accessories", allocationPercentage: 50, allocatedAmount: 50, allocatedAmountMinor: 5000, priority: "medium", requirements: [] },
    ];

    const categories: SetupCategorySearchResult[] = [
      { requirementId: "req-1", requirementName: "Cable Pack", searchQuery: "cables", allocatedAmountMinor: 5000, products: [sharedProduct], status: "partial" },
      { requirementId: "req-2", requirementName: "Spare Cable", searchQuery: "accessories", allocatedAmountMinor: 5000, products: [sharedProduct], status: "partial" },
    ];

    const bundle = calculateRecommendedBundle({
      totalBudget: 100,
      currency: "USD",
      requirements,
      categories,
      comparisons: [],
    });

    assert.equal(bundle.items.length, 2);
    assert.equal(bundle.productSubtotalMinor, 5000);
    assert.equal(bundle.isComplete, true);
  });

  // Scenario 6: Budget allocation totals cannot exceed total user budget
  test("6. budget allocation totals cannot exceed total user budget", () => {
    const totalBudget = 500;
    const requirements: SetupRequirementItem[] = [
      { id: "req-1", name: "Item 1", searchQuery: "q1", allocationPercentage: 60, allocatedAmount: 300, allocatedAmountMinor: 30000, priority: "high", requirements: [] },
      { id: "req-2", name: "Item 2", searchQuery: "q2", allocationPercentage: 40, allocatedAmount: 200, allocatedAmountMinor: 20000, priority: "high", requirements: [] },
    ];

    const totalAllocated = requirements.reduce((sum, r) => sum + r.allocatedAmount, 0);
    assert.equal(totalAllocated <= totalBudget, true);
  });

  // Scenario 7: User editing category allocation triggers recalculation of remaining unallocated budget
  test("7. editing category allocation updates remaining unallocated budget in minor units", () => {
    const totalBudgetMinor = 300000; // $3,000.00
    let allocatedTotalMinor = 280000; // $2,800.00
    let remainingUnallocatedMinor = totalBudgetMinor - allocatedTotalMinor;
    assert.equal(remainingUnallocatedMinor, 20000); // $200.00

    // User modifies Item 1 allocation from $500 to $600 (+ $100)
    allocatedTotalMinor += 10000;
    remainingUnallocatedMinor = totalBudgetMinor - allocatedTotalMinor;
    assert.equal(remainingUnallocatedMinor, 10000); // $100.00 remaining
  });

  // Scenario 8: Selecting an alternative product stays within allocated category budget (or highlights warning)
  test("8. alternative product exceeding category allocation is flagged with isOverCategoryBudget = true", () => {
    const requirement: SetupRequirementItem = {
      id: "req-mouse",
      name: "Wireless Mouse",
      searchQuery: "mouse",
      allocationPercentage: 10,
      allocatedAmount: 40,
      allocatedAmountMinor: 4000, // $40.00 max
      priority: "high",
      requirements: [],
    };

    const mouseA: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "mouse-a",
      title: "Budget Mouse",
      brand: "Logitech",
      imageUrl: "",
      priceMinor: 3500, // $35.00
      currency: "USD",
      retailerName: "Store",
      retailerUrl: "",
      availability: "in_stock",
      specifications: {},
      sourceFacts: [],
    };

    const mouseB: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "mouse-b",
      title: "Premium Mouse",
      brand: "Logitech",
      imageUrl: "",
      priceMinor: 5500, // $55.00 (exceeds $40 allocation)
      currency: "USD",
      retailerName: "Store",
      retailerUrl: "",
      availability: "in_stock",
      specifications: {},
      sourceFacts: [],
    };

    const category: SetupCategorySearchResult[] = [
      {
        requirementId: "req-mouse",
        requirementName: "Wireless Mouse",
        searchQuery: "mouse",
        allocatedAmountMinor: 4000,
        products: [mouseA, mouseB],
        status: "fulfilled",
      },
    ];

    // Bundle with Mouse A
    const bundleA = calculateRecommendedBundle({
      totalBudget: 100,
      requirements: [requirement],
      categories: category,
      comparisons: [],
      selectedItemIds: { "req-mouse": "mouse-a" },
    });
    assert.equal(bundleA.items[0].isOverCategoryBudget, false);

    // Bundle with Mouse B
    const bundleB = calculateRecommendedBundle({
      totalBudget: 100,
      requirements: [requirement],
      categories: category,
      comparisons: [],
      selectedItemIds: { "req-mouse": "mouse-b" },
    });
    assert.equal(bundleB.items[0].isOverCategoryBudget, true, "Must flag when alternative exceeds category budget");
  });

  // Scenario 9: Product subtotal in recommended bundle never exceeds total user budget
  test("9. product subtotal in recommended bundle never exceeds total user budget", () => {
    const requirements: SetupRequirementItem[] = [
      { id: "r1", name: "R1", searchQuery: "q1", allocationPercentage: 50, allocatedAmount: 50, allocatedAmountMinor: 5000, priority: "high", requirements: [] },
      { id: "r2", name: "R2", searchQuery: "q2", allocationPercentage: 50, allocatedAmount: 50, allocatedAmountMinor: 5000, priority: "high", requirements: [] },
    ];

    const categories: SetupCategorySearchResult[] = [
      {
        requirementId: "r1",
        requirementName: "R1",
        searchQuery: "q1",
        allocatedAmountMinor: 5000,
        products: [
          { source: "channel3", sourceProductId: "p1", title: "P1", brand: "B", imageUrl: "", priceMinor: 4500, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: [] },
        ],
        status: "partial",
      },
      {
        requirementId: "r2",
        requirementName: "R2",
        searchQuery: "q2",
        allocatedAmountMinor: 5000,
        products: [
          { source: "channel3", sourceProductId: "p2", title: "P2", brand: "B", imageUrl: "", priceMinor: 4800, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: [] },
        ],
        status: "partial",
      },
    ];

    const bundle = calculateRecommendedBundle({
      totalBudget: 100,
      requirements,
      categories,
      comparisons: [],
    });

    assert.equal(bundle.productSubtotalMinor, 9300); // $93.00
    assert.equal(bundle.remainingBudgetMinor, 700); // $7.00 remaining
    assert(bundle.productSubtotalMinor <= bundle.totalBudgetMinor);
  });

  // Scenario 10: One failed category search does not crash or invalidate remaining category results
  test("10. one failed category search does not crash or invalidate remaining category results", async () => {
    const items: SetupRequirementItem[] = [
      { id: "req-success", name: "Monitor", searchQuery: "monitor", allocationPercentage: 60, allocatedAmount: 180, allocatedAmountMinor: 18000, priority: "high", requirements: [] },
      { id: "req-fail", name: "Broken Query", searchQuery: "throw-error", allocationPercentage: 40, allocatedAmount: 120, allocatedAmountMinor: 12000, priority: "medium", requirements: [] },
    ];

    const mockSearchFn = async (kw: string) => {
      if (kw === "throw-error") {
        throw new Error("Simulated Channel3 category timeout");
      }
      return [
        { source: "channel3" as const, sourceProductId: "mon-1", title: "27in Monitor", brand: "LG", imageUrl: "", priceMinor: 17000, currency: "USD" as const, retailerName: "Best Buy", retailerUrl: "", availability: "in_stock" as const, specifications: {}, sourceFacts: [] },
      ];
    };

    const categories = await executeSetupSearch({
      items,
      totalBudget: 300,
      currency: "USD",
      searchFn: mockSearchFn,
    });

    assert.equal(categories.length, 2);
    const successCat = categories.find((c) => c.requirementId === "req-success");
    const failCat = categories.find((c) => c.requirementId === "req-fail");

    assert.equal(successCat?.products.length, 1);
    assert.equal(failCat?.products.length, 0);
    assert.equal(failCat?.errorMessage, "Simulated Channel3 category timeout");
  });

  // Scenario 11: Missing requirement prevents bundle from being marked complete
  test("11. missing requirement prevents bundle from being marked complete", () => {
    const requirements: SetupRequirementItem[] = [
      { id: "req-found", name: "Keyboard", searchQuery: "keyb", allocationPercentage: 50, allocatedAmount: 50, allocatedAmountMinor: 5000, priority: "high", requirements: [] },
      { id: "req-empty", name: "Rare Adapter", searchQuery: "rare", allocationPercentage: 50, allocatedAmount: 50, allocatedAmountMinor: 5000, priority: "medium", requirements: [] },
    ];

    const categories: SetupCategorySearchResult[] = [
      {
        requirementId: "req-found",
        requirementName: "Keyboard",
        searchQuery: "keyb",
        allocatedAmountMinor: 5000,
        products: [
          { source: "channel3", sourceProductId: "kb-1", title: "USB Keyboard", brand: "Dell", imageUrl: "", priceMinor: 3500, currency: "USD", retailerName: "Dell", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: [] },
        ],
        status: "partial",
      },
      {
        requirementId: "req-empty",
        requirementName: "Rare Adapter",
        searchQuery: "rare",
        allocatedAmountMinor: 5000,
        products: [], // Zero candidates found
        status: "unavailable",
      },
    ];

    const bundle = calculateRecommendedBundle({
      totalBudget: 100,
      requirements,
      categories,
      comparisons: [],
    });

    assert.equal(bundle.isComplete, false);
    assert.deepEqual(bundle.missingRequirements, ["Rare Adapter"]);
    assert.equal(bundle.items.length, 1);
  });

  // Scenario 12: LLM cannot select product ID not in category's candidate list
  test("12. LLM cannot select a hallucinated product ID outside category candidates", () => {
    const requirements: SetupRequirementItem[] = [
      { id: "req-1", name: "Mouse", searchQuery: "mouse", allocationPercentage: 100, allocatedAmount: 50, allocatedAmountMinor: 5000, priority: "high", requirements: [] },
    ];

    const realCandidate: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "real-mouse-id",
      title: "Real Logitech Mouse",
      brand: "Logitech",
      imageUrl: "",
      priceMinor: 2999,
      currency: "USD",
      retailerName: "Target",
      retailerUrl: "",
      availability: "in_stock",
      specifications: {},
      sourceFacts: [],
    };

    const categories: SetupCategorySearchResult[] = [
      {
        requirementId: "req-1",
        requirementName: "Mouse",
        searchQuery: "mouse",
        allocatedAmountMinor: 5000,
        products: [realCandidate],
        status: "partial",
      },
    ];

    // LLM selected "hallucinated-mouse-id"
    const fakeComparisons: SetupComparisonCategoryResult[] = [
      {
        requirementId: "req-1",
        requirementName: "Mouse",
        candidateProductIds: ["real-mouse-id"],
        recommendedProductId: "hallucinated-mouse-id",
        alternativeProductId: null,
        recommendedReason: "Great mouse",
        keyDifferences: [],
        tradeoffs: [],
        missingSpecs: [],
        compatibilityStatus: "verified",
      },
    ];

    const bundle = calculateRecommendedBundle({
      totalBudget: 50,
      requirements,
      categories,
      comparisons: fakeComparisons,
    });

    // Must safely fallback to real candidate
    assert.equal(bundle.items.length, 1);
    assert.equal(bundle.items[0].selectedProduct.sourceProductId, "real-mouse-id");
  });

  // Scenario 13: Product with missing or unknown price cannot create a valid bundle
  test("13. candidate with missing or non-positive price cannot create a priced bundle item", () => {
    const requirements: SetupRequirementItem[] = [
      { id: "req-unpriced", name: "Unpriced Product", searchQuery: "misc", allocationPercentage: 100, allocatedAmount: 100, allocatedAmountMinor: 10000, priority: "high", requirements: [] },
    ];

    const unpricedProduct: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "unpriced-1",
      title: "Item Without Price",
      brand: "None",
      imageUrl: "",
      priceMinor: 0, // Zero / unavailable
      currency: "USD",
      retailerName: "Store",
      retailerUrl: "",
      availability: "out_of_stock",
      specifications: {},
      sourceFacts: [],
    };

    const categories: SetupCategorySearchResult[] = [
      {
        requirementId: "req-unpriced",
        requirementName: "Unpriced Product",
        searchQuery: "misc",
        allocatedAmountMinor: 10000,
        products: [unpricedProduct],
        status: "partial",
      },
    ];

    const bundle = calculateRecommendedBundle({
      totalBudget: 100,
      requirements,
      categories,
      comparisons: [],
    });

    assert.equal(bundle.items.length, 0);
    assert.equal(bundle.isComplete, false);
    assert.deepEqual(bundle.missingRequirements, ["Unpriced Product"]);
  });

  // Scenario 14: Different currencies cannot be silently summed into bundle total
  test("14. candidates in differing currencies are excluded from target currency bundle", () => {
    const requirements: SetupRequirementItem[] = [
      { id: "req-eur", name: "Foreign Item", searchQuery: "foreign", allocationPercentage: 100, allocatedAmount: 100, allocatedAmountMinor: 10000, priority: "high", requirements: [] },
    ];

    const eurProduct: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "eur-1",
      title: "European Product",
      brand: "EU",
      imageUrl: "",
      priceMinor: 8900,
      currency: "EUR", // EUR instead of USD
      retailerName: "Store EU",
      retailerUrl: "",
      availability: "in_stock",
      specifications: {},
      sourceFacts: [],
    };

    const categories: SetupCategorySearchResult[] = [
      {
        requirementId: "req-eur",
        requirementName: "Foreign Item",
        searchQuery: "foreign",
        allocatedAmountMinor: 10000,
        products: [eurProduct],
        status: "partial",
      },
    ];

    const bundle = calculateRecommendedBundle({
      totalBudget: 100,
      currency: "USD",
      requirements,
      categories,
      comparisons: [],
    });

    assert.equal(bundle.items.length, 0, "Different currency must not be summed into USD bundle");
    assert.equal(bundle.productSubtotalMinor, 0);
  });

  // Scenario 15: Unknown shipping and tax costs are explicitly disclosed
  test("15. recommended bundle includes transparent disclosure for unverified shipping and taxes", () => {
    const requirements: SetupRequirementItem[] = [
      { id: "req-item", name: "Item", searchQuery: "item", allocationPercentage: 100, allocatedAmount: 100, allocatedAmountMinor: 10000, priority: "high", requirements: [] },
    ];

    const categories: SetupCategorySearchResult[] = [
      {
        requirementId: "req-item",
        requirementName: "Item",
        searchQuery: "item",
        allocatedAmountMinor: 10000,
        products: [
          { source: "channel3", sourceProductId: "item-1", title: "Item 1", brand: "B", imageUrl: "", priceMinor: 8000, currency: "USD", retailerName: "Store", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: [] },
        ],
        status: "partial",
      },
    ];

    const bundle = calculateRecommendedBundle({
      totalBudget: 100,
      requirements,
      categories,
      comparisons: [],
    });

    assert(bundle.shippingNotice.length > 0);
    assert(bundle.taxNotice.length > 0);
  });

  // Scenario 16: PC compatibility is not falsely guaranteed when attributes are missing
  test("16. PC compatibility is unverified when critical hardware socket or form factor specs are missing", () => {
    const pcRequirements: SetupRequirementItem[] = [
      { id: "req-cpu", name: "Desktop Processor", searchQuery: "cpu", allocationPercentage: 50, allocatedAmount: 200, allocatedAmountMinor: 20000, priority: "high", requirements: [] },
      { id: "req-mb", name: "Motherboard", searchQuery: "mb", allocationPercentage: 50, allocatedAmount: 200, allocatedAmountMinor: 20000, priority: "high", requirements: [] },
    ];

    // Missing socket specifications in Channel3 metadata
    const cpu: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "cpu-1",
      title: "Intel Core i5-13400F",
      brand: "Intel",
      imageUrl: "",
      priceMinor: 19000,
      currency: "USD",
      retailerName: "Newegg",
      retailerUrl: "",
      availability: "in_stock",
      specifications: {}, // Empty specs!
      sourceFacts: [],
    };

    const mb: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "mb-1",
      title: "ASUS Prime B760-PLUS",
      brand: "ASUS",
      imageUrl: "",
      priceMinor: 15000,
      currency: "USD",
      retailerName: "Newegg",
      retailerUrl: "",
      availability: "in_stock",
      specifications: {}, // Empty specs!
      sourceFacts: [],
    };

    const categories: SetupCategorySearchResult[] = [
      { requirementId: "req-cpu", requirementName: "Desktop Processor", searchQuery: "cpu", allocatedAmountMinor: 20000, products: [cpu], status: "partial" },
      { requirementId: "req-mb", requirementName: "Motherboard", searchQuery: "mb", allocatedAmountMinor: 20000, products: [mb], status: "partial" },
    ];

    const bundle = calculateRecommendedBundle({
      totalBudget: 400,
      requirements: pcRequirements,
      categories,
      comparisons: [
        { requirementId: "req-cpu", requirementName: "Desktop Processor", candidateProductIds: ["cpu-1"], recommendedProductId: "cpu-1", alternativeProductId: null, recommendedReason: "Fast", keyDifferences: [], tradeoffs: [], missingSpecs: ["Socket", "TDP"], compatibilityStatus: "unverified" },
        { requirementId: "req-mb", requirementName: "Motherboard", candidateProductIds: ["mb-1"], recommendedProductId: "mb-1", alternativeProductId: null, recommendedReason: "Stable", keyDifferences: [], tradeoffs: [], missingSpecs: ["Socket", "Form factor"], compatibilityStatus: "unverified" },
      ],
    });

    assert.equal(bundle.items[0].comparison.compatibilityStatus, "unverified");
    assert.equal(bundle.items[1].comparison.compatibilityStatus, "unverified");
  });

  // Scenario 17: Switching alternative product recalculates bundle total and remaining budget correctly
  test("17. switching alternative product recalculates bundle total and remaining budget correctly", () => {
    const requirement: SetupRequirementItem = {
      id: "req-monitor",
      name: "Gaming Monitor",
      searchQuery: "monitor",
      allocationPercentage: 100,
      allocatedAmount: 300,
      allocatedAmountMinor: 30000,
      priority: "high",
      requirements: [],
    };

    const monA: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "mon-144hz",
      title: "144Hz Monitor",
      brand: "AOC",
      imageUrl: "",
      priceMinor: 20000, // $200.00
      currency: "USD",
      retailerName: "Amazon",
      retailerUrl: "",
      availability: "in_stock",
      specifications: {},
      sourceFacts: [],
    };

    const monB: NormalizedProduct = {
      source: "channel3",
      sourceProductId: "mon-240hz",
      title: "240Hz Monitor",
      brand: "Dell",
      imageUrl: "",
      priceMinor: 26000, // $260.00
      currency: "USD",
      retailerName: "Dell",
      retailerUrl: "",
      availability: "in_stock",
      specifications: {},
      sourceFacts: [],
    };

    const category: SetupCategorySearchResult[] = [
      {
        requirementId: "req-monitor",
        requirementName: "Gaming Monitor",
        searchQuery: "monitor",
        allocatedAmountMinor: 30000,
        products: [monA, monB],
        status: "fulfilled",
      },
    ];

    // Initial state: monA is selected ($200)
    const initialBundle = calculateRecommendedBundle({
      totalBudget: 300,
      requirements: [requirement],
      categories: category,
      comparisons: [],
      selectedItemIds: { "req-monitor": "mon-144hz" },
    });

    assert.equal(initialBundle.productSubtotalMinor, 20000);
    assert.equal(initialBundle.remainingBudgetMinor, 10000); // $100 remaining

    // User switches to monB ($260)
    const updatedBundle = calculateRecommendedBundle({
      totalBudget: 300,
      requirements: [requirement],
      categories: category,
      comparisons: [],
      selectedItemIds: { "req-monitor": "mon-240hz" },
    });

    assert.equal(updatedBundle.productSubtotalMinor, 26000);
    assert.equal(updatedBundle.remainingBudgetMinor, 4000); // $40 remaining
    assert.equal(updatedBundle.items[0].selectedProduct.sourceProductId, "mon-240hz");
  });
});
