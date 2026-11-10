import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Channel3Api } from "@channel3/sdk";
import { normalizeChannel3Product } from "../src/lib/channel3/normalize-products.ts";
import {
  matchOfferToConfiguration,
  verifyAndSelectOffer,
  selectRetailerOffer,
} from "../src/lib/shopping/offer-verification.ts";
import {
  bindProductConfigurationAndPrice,
  normalizeProductTechnicalClaims,
} from "../src/lib/shopping/spec-normalizer.ts";
import { filterEligibleCandidates } from "../src/lib/shopping/eligibility-gate.ts";
import { calculateRecommendedBundle } from "../src/lib/setup/bundle-calculator.ts";
import type {
  NormalizedProduct,
  CanonicalShoppingAttribute,
  ProductOfferItem,
  SetupCategorySearchResult,
  SetupRequirementItem,
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

function createMockAttribute(
  partial: Partial<CanonicalShoppingAttribute> & { key: string; value: string | string[] }
): CanonicalShoppingAttribute {
  return {
    label: partial.label || partial.key,
    displayValue: partial.displayValue || String(partial.value),
    status: partial.status || "confirmed",
    constraint: partial.constraint || "hard_requirement",
    source: partial.source || "user_explicit",
    updatedAt: partial.updatedAt ?? Date.now(),
    ...partial,
    key: partial.key,
    value: partial.value,
  };
}

describe("SpendPilot Stage 2A: Exact Product & Retailer Offer Pricing (Tests 1 - 7)", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Test 1: Parent product specifies 1TB and cheapest offer has no storage metadata
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test 1: When a parent product specifies 1TB and the cheapest offer does not provide storage metadata, the offer is not automatically verified for 1TB and its price is not displayed as a confirmed 1TB offer", () => {
    const rawFixture: Channel3Api.Product = {
      id: "prod-macbook-1tb",
      title: "Apple MacBook Air 13.6-Inch M3 Chip 16GB RAM 1TB SSD",
      description: "Apple MacBook Air with M3 chip, 16GB unified memory, and 1TB SSD storage.",
      brands: [{ id: "b-apple", name: "Apple" }],
      images: [{ url: "https://cdn.example.com/macbook.jpg", is_main_image: true }],
      structured_attributes: {
        "storage-capacity": ["1 TB"],
        "ram": ["16 GB"],
        "operating-system": ["macOS"],
      },
      offers: [
        {
          domain: "abt.com",
          url: "https://buy.trychannel3.com/macbook-abt-deal",
          price: { price: 1149.0, currency: "USD" },
          availability: "InStock" as Channel3Api.OfferAvailabilityStatus,
          condition: "new" as Channel3Api.Condition,
        },
      ],
    };

    const normalized = normalizeChannel3Product(rawFixture, "USD");
    assert.ok(normalized);
    const normalizedClaims = normalizeProductTechnicalClaims(normalized);
    assert.ok(normalizedClaims);

    // Active user requirement: 1TB SSD
    const requirements: Record<string, CanonicalShoppingAttribute> = {
      storage: createMockAttribute({
        key: "storage",
        label: "Storage Capacity",
        value: "1TB",
      }),
    };

    // 1. Verify offer matching directly
    const offer = normalized.offers![0];
    const match = matchOfferToConfiguration(normalized, offer, requirements);
    assert.strictEqual(match.status, "unverified");
    assert.strictEqual(match.isMatch, false);
    assert.ok(match.reason.includes("does not provide verified evidence"));

    // 2. verifyAndSelectOffer must mark configurationStatus as unverified and not display price as confirmed 1TB
    const evaluatedProduct = verifyAndSelectOffer(normalized, requirements);
    assert.strictEqual(evaluatedProduct.configurationStatus, "unverified");
    assert.strictEqual(evaluatedProduct.priceMinor, null, "Confirmed price must be null when unverified");
    assert.strictEqual(evaluatedProduct.selectedOffer?.verificationStatus, "unverified");
    assert.ok(evaluatedProduct.configurationNotice?.includes("not price-verified"));

    // 3. Technical claim binding must also refuse to confirm 1TB price
    const boundProduct = bindProductConfigurationAndPrice(normalized, "1TB");
    assert.strictEqual(boundProduct.configurationStatus, "unverified");
    assert.strictEqual(boundProduct.priceMinor, null);
    assert.strictEqual(boundProduct.selectedOffer?.verificationStatus, "unverified");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 2: Two offers with different prices and no configuration metadata
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test 2: Two offers with different prices and no configuration metadata are not automatically assigned to the parent's specifications", () => {
    const rawFixture: Channel3Api.Product = {
      id: "prod-macbook-multi-offer",
      title: "MacBook Air Laptop 13.6-Inch",
      description: "Apple MacBook Air laptop with various configuration options.",
      brands: [{ id: "b-apple", name: "Apple" }],
      structured_attributes: {
        "storage-capacity": ["512 GB", "1 TB", "2 TB"],
        "ram": ["8 GB", "16 GB", "24 GB"],
      },
      offers: [
        {
          domain: "cheapest-retailer.com",
          url: "https://buy.trychannel3.com/cheap-offer",
          price: { price: 1149.0, currency: "USD" },
          availability: "InStock" as Channel3Api.OfferAvailabilityStatus,
          condition: "new" as Channel3Api.Condition,
        },
        {
          domain: "expensive-retailer.com",
          url: "https://buy.trychannel3.com/expensive-offer",
          price: { price: 1499.0, currency: "USD" },
          availability: "InStock" as Channel3Api.OfferAvailabilityStatus,
          condition: "new" as Channel3Api.Condition,
        },
      ],
    };

    const normalized = normalizeChannel3Product(rawFixture, "USD");
    assert.ok(normalized);
    const normalizedClaims = normalizeProductTechnicalClaims(normalized);
    assert.ok(normalizedClaims);

    // Initial normalization must preserve original offer order and not sort cheapest-first
    assert.strictEqual(normalized.offers?.length, 2);
    assert.strictEqual(normalized.offers?.[0]?.domain, "cheapest-retailer.com");
    assert.strictEqual(normalized.offers?.[1]?.domain, "expensive-retailer.com");
    assert.strictEqual(normalized.offers?.[0]?.verificationStatus, "unverified");
    assert.strictEqual(normalized.offers?.[1]?.verificationStatus, "unverified");

    // Neither offer has metadata verifying 1TB or 2TB
    const req1TB: Record<string, CanonicalShoppingAttribute> = {
      storage: createMockAttribute({
        key: "storage",
        label: "Storage",
        value: "1TB",
      }),
    };

    const matchA = matchOfferToConfiguration(normalized, normalized.offers![0], req1TB);
    const matchB = matchOfferToConfiguration(normalized, normalized.offers![1], req1TB);

    assert.strictEqual(matchA.status, "unverified");
    assert.strictEqual(matchB.status, "unverified");
    assert.strictEqual(matchA.isMatch, false);
    assert.strictEqual(matchB.isMatch, false);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 3: Exact variant resolution succeeds
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test 3: If an exact variant resolution succeeds, only offers associated with that resolved configuration are eligible", () => {
    const rawFixture: Channel3Api.Product = {
      id: "prod-macbook-with-variants",
      title: "Apple MacBook Air 13-inch",
      description: "Apple MacBook Air in multiple storage sizes.",
      brands: [{ id: "b-apple", name: "Apple" }],
      structured_attributes: {
        "storage-capacity": ["512 GB", "1 TB"],
      },
      offers: [
        {
          domain: "bestbuy.com",
          url: "https://buy.trychannel3.com/macbook-air-m3-512gb-ssd",
          price: { price: 1099.0, currency: "USD" },
          availability: "InStock" as Channel3Api.OfferAvailabilityStatus,
          condition: "new" as Channel3Api.Condition,
        },
        {
          domain: "bhphoto.com",
          url: "https://buy.trychannel3.com/macbook-air-m3-1tb-ssd",
          price: { price: 1399.0, currency: "USD" },
          availability: "InStock" as Channel3Api.OfferAvailabilityStatus,
          condition: "new" as Channel3Api.Condition,
        },
      ],
    };

    const normalized = normalizeChannel3Product(rawFixture, "USD");
    assert.ok(normalized);
    const normalizedClaims = normalizeProductTechnicalClaims(normalized);
    assert.ok(normalizedClaims);

    const req1TB: Record<string, CanonicalShoppingAttribute> = {
      storage: createMockAttribute({
        key: "storage",
        label: "Storage",
        value: "1TB",
      }),
    };

    // Evaluate offers: Best Buy (512gb URL) is unverified/mismatched, B&H (1tb URL) is verified
    const offerBestBuy = normalized.offers![0];
    const offerBhPhoto = normalized.offers![1];

    const match512 = matchOfferToConfiguration(normalized, offerBestBuy, req1TB);
    const match1TB = matchOfferToConfiguration(normalized, offerBhPhoto, req1TB);

    assert.strictEqual(match512.status, "unverified");
    assert.strictEqual(match1TB.status, "verified");

    // verifyAndSelectOffer must strictly select B&H Photo ($1,399) and reject the $1,099 512GB offer
    const selectedProduct = verifyAndSelectOffer(normalized, req1TB);
    assert.strictEqual(selectedProduct.configurationStatus, "verified");
    assert.strictEqual(selectedProduct.priceMinor, 139900);
    assert.strictEqual(selectedProduct.retailerName, "bhphoto.com");
    assert.strictEqual(selectedProduct.selectedOffer?.domain, "bhphoto.com");
    assert.strictEqual(selectedProduct.selectedOffer?.priceMinor, 139900);
    assert.strictEqual(selectedProduct.selectedOffer?.verificationStatus, "verified");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 4: Different retailer selected updates price and offer identity
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test 4: When a user selects a different retailer, the selected price and offer identity update correctly", () => {
    const product = createMockProduct({
      title: "Apple MacBook Air 13-inch M3 1TB SSD",
      priceMinor: 139900,
      retailerName: "bestbuy.com",
      retailerUrl: "https://buy.trychannel3.com/bestbuy-1tb",
      configurationStatus: "verified",
      offers: [
        {
          id: "offer-bb",
          domain: "bestbuy.com",
          url: "https://buy.trychannel3.com/bestbuy-1tb",
          priceMinor: 139900,
          currency: "USD",
          availability: "in_stock",
          condition: "new",
          verificationStatus: "verified",
        },
        {
          id: "offer-bh",
          domain: "bhphoto.com",
          url: "https://buy.trychannel3.com/bhphoto-1tb",
          priceMinor: 144900,
          currency: "USD",
          availability: "in_stock",
          condition: "new",
          verificationStatus: "verified",
        },
      ],
      selectedOffer: {
        id: "offer-bb",
        domain: "bestbuy.com",
        url: "https://buy.trychannel3.com/bestbuy-1tb",
        priceMinor: 139900,
        currency: "USD",
        availability: "in_stock",
        condition: "new",
        verificationStatus: "verified",
      },
    });

    // User selects B&H Photo offer
    const updated = selectRetailerOffer(product, "https://buy.trychannel3.com/bhphoto-1tb");

    assert.strictEqual(updated.selectedOffer?.domain, "bhphoto.com");
    assert.strictEqual(updated.selectedOffer?.priceMinor, 144900);
    assert.strictEqual(updated.priceMinor, 144900);
    assert.strictEqual(updated.retailerName, "bhphoto.com");
    assert.strictEqual(updated.retailerUrl, "https://buy.trychannel3.com/bhphoto-1tb");
    assert.strictEqual(updated.configurationStatus, "verified");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 5: Several spec values are not combined into unverified phantom configuration
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test 5: If a product has several specification values, the UI does not combine unrelated values into a configuration that no actual offer confirms", () => {
    const rawFixture: Channel3Api.Product = {
      id: "prod-aggregated-specs",
      title: "MacBook Pro Laptop",
      description: "Apple MacBook Pro series.",
      brands: [{ id: "b-apple", name: "Apple" }],
      structured_attributes: {
        "processor-family": ["Apple M2 Pro", "Apple M3 Max"],
        "storage-capacity": ["512 GB", "1 TB", "4 TB"],
        "ram": ["16 GB", "36 GB", "96 GB"],
      },
      offers: [
        {
          domain: "adorama.com",
          url: "https://buy.trychannel3.com/adorama-base",
          price: { price: 1599.0, currency: "USD" },
          availability: "InStock" as Channel3Api.OfferAvailabilityStatus,
          condition: "new" as Channel3Api.Condition,
        },
      ],
    };

    const normalized = normalizeChannel3Product(rawFixture, "USD");
    assert.ok(normalized);
    const normalizedClaims = normalizeProductTechnicalClaims(normalized);
    assert.ok(normalizedClaims);

    // If a user requires a 4TB SSD configuration:
    const req4TB: Record<string, CanonicalShoppingAttribute> = {
      storage: createMockAttribute({
        key: "storage",
        label: "Storage",
        value: "4TB",
      }),
    };

    const verified = verifyAndSelectOffer(normalized, req4TB);

    // Must NOT synthesize a "M3 Max + 96GB RAM + 4TB SSD at $1,599" confirmed product
    assert.strictEqual(verified.configurationStatus, "unverified");
    assert.strictEqual(verified.priceMinor, null, "Must not attribute $1,599 offer to unverified 4TB spec");
    assert.ok(verified.configurationNotice?.includes("not price-verified"));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 6: No verified price available -> no fabricated price or false verified badge
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test 6: When no verified price is available, no fabricated price or false verified-match badge is shown", () => {
    const product = createMockProduct({
      title: "Apple MacBook Air 13-inch M3",
      specifications: {
        Storage: "1TB SSD",
        "Configuration Status": "Configuration not price-verified",
      },
      configurationStatus: "unverified",
      configurationNotice: "Configuration not price-verified",
      priceMinor: null,
      offers: [
        {
          id: "off-unverified",
          domain: "unverified-retailer.com",
          url: "https://example.com/unverified",
          priceMinor: 114900,
          currency: "USD",
          availability: "in_stock",
          condition: "new",
          verificationStatus: "unverified",
        },
      ],
      selectedOffer: {
        id: "off-unverified",
        domain: "unverified-retailer.com",
        url: "https://example.com/unverified",
        priceMinor: 114900,
        currency: "USD",
        availability: "in_stock",
        condition: "new",
        verificationStatus: "unverified",
      },
    });

    const eligibility = filterEligibleCandidates({
      products: [product],
      canonicalAttributes: {
        storage: createMockAttribute({
          key: "storage",
          label: "Storage",
          value: "1TB",
        }),
        os: createMockAttribute({
          key: "os",
          label: "Operating System",
          value: "macOS",
        }),
      },
      budgetCents: 120000,
      currency: "USD",
    });

    // Unverified candidate must be disqualified from being a confirmed top recommendation
    assert.strictEqual(eligibility.eligibleProducts.length, 0);
    assert.strictEqual(eligibility.isNoMatch, true);
    assert.ok(
      eligibility.noMatchMessage?.includes("could not price-verify a 1TB SSD configuration"),
      "Must provide honest no-match message"
    );
    assert.ok(eligibility.suggestedAlternatives.length > 0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 7: Budget calculation uses only valid selected offer prices within max budget
  // ─────────────────────────────────────────────────────────────────────────────
  test("Test 7: Budget calculation uses only valid selected offer prices, and the total remains within the user's max budget", () => {
    const laptopOffers: ProductOfferItem[] = [
      {
        id: "laptop-off-a",
        domain: "merchant-a.com",
        url: "https://merchant-a.com/laptop",
        priceMinor: 75000, // $750.00
        currency: "USD",
        availability: "in_stock",
        condition: "new",
        verificationStatus: "verified",
      },
      {
        id: "laptop-off-b",
        domain: "merchant-b.com",
        url: "https://merchant-b.com/laptop",
        priceMinor: 90000, // $900.00
        currency: "USD",
        availability: "in_stock",
        condition: "new",
        verificationStatus: "verified",
      },
    ];

    const headphoneOffers: ProductOfferItem[] = [
      {
        id: "hp-off-a",
        domain: "merchant-a.com",
        url: "https://merchant-a.com/headphones",
        priceMinor: 15000, // $150.00
        currency: "USD",
        availability: "in_stock",
        condition: "new",
        verificationStatus: "verified",
      },
    ];

    const initialLaptop = createMockProduct({
      sourceProductId: "prod-laptop",
      title: "Standard Work Laptop",
      priceMinor: 75000,
      retailerName: "merchant-a.com",
      retailerUrl: "https://merchant-a.com/laptop",
      offers: laptopOffers,
      selectedOffer: laptopOffers[0],
      configurationStatus: "verified",
    });

    const initialHeadphones = createMockProduct({
      sourceProductId: "prod-hp",
      title: "Noise Cancelling Headphones",
      priceMinor: 15000,
      retailerName: "merchant-a.com",
      retailerUrl: "https://merchant-a.com/headphones",
      offers: headphoneOffers,
      selectedOffer: headphoneOffers[0],
      configurationStatus: "verified",
    });

    const categories: SetupCategorySearchResult[] = [
      {
        requirementId: "req-laptop",
        requirementName: "Laptop",
        searchQuery: "laptop",
        allocatedAmountMinor: 80000,
        status: "fulfilled",
        products: [initialLaptop],
      },
      {
        requirementId: "req-hp",
        requirementName: "Headphones",
        searchQuery: "headphones",
        allocatedAmountMinor: 20000,
        status: "fulfilled",
        products: [initialHeadphones],
      },
    ];

    const requirements: SetupRequirementItem[] = [
      {
        id: "req-laptop",
        name: "Laptop",
        searchQuery: "laptop",
        allocationPercentage: 80,
        allocatedAmountMinor: 80000,
        allocatedAmount: 800,
        requirements: ["1TB SSD"],
        priority: "high",
      },
      {
        id: "req-hp",
        name: "Headphones",
        searchQuery: "headphones",
        allocationPercentage: 20,
        allocatedAmountMinor: 20000,
        allocatedAmount: 200,
        requirements: ["Noise cancelling"],
        priority: "medium",
      },
    ];

    // 1. Initial bundle with selected offers ($750 + $150 = $900 <= $1,000)
    const bundle1 = calculateRecommendedBundle({
      totalBudget: 1000,
      currency: "USD",
      requirements,
      categories,
    });

    assert.strictEqual(bundle1.productSubtotalMinor, 90000);
    assert.strictEqual(bundle1.totalBudgetMinor, 100000);
    assert.strictEqual(bundle1.remainingBudgetMinor, 10000);
    assert.ok(bundle1.productSubtotalMinor <= bundle1.totalBudgetMinor);

    // 2. User switches Laptop offer to Merchant B ($900)
    const updatedLaptop = selectRetailerOffer(initialLaptop, "https://merchant-b.com/laptop");
    assert.strictEqual(updatedLaptop.priceMinor, 90000);
    assert.strictEqual(updatedLaptop.retailerName, "merchant-b.com");

    const updatedCategories: SetupCategorySearchResult[] = [
      {
        ...categories[0],
        products: [updatedLaptop],
      },
      categories[1],
    ];

    // 3. Recomputed bundle: $900 + $150 = $1,050 > $1,000 (Exceeds budget)
    const bundle2 = calculateRecommendedBundle({
      totalBudget: 1000,
      currency: "USD",
      requirements,
      categories: updatedCategories,
    });

    assert.strictEqual(bundle2.productSubtotalMinor, 105000);
    assert.strictEqual(bundle2.totalBudgetMinor, 100000);
    assert.strictEqual(bundle2.remainingBudgetMinor, 0);
    assert.ok(bundle2.productSubtotalMinor > bundle2.totalBudgetMinor, "Must exceed total budget");
  });
});
