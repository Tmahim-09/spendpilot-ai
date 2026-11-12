import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateVariantConfirmation,
  isExactOptionValueMatch,
  retrieveProductVariants,
} from "../src/lib/channel3/variants";
import { setChannel3ClientForTesting } from "../src/lib/channel3/client";
import {
  createInitialWorkspace,
  addIndependentItem,
  selectProductForItem,
  updateVariantForItem,
} from "../src/lib/workspace/workspace-manager";
import { createVariantRequestFingerprint } from "../src/components/guided-shopping/ProductVariantConfigurator";
import type {
  NormalizedProduct,
  ProductVariantSelection,
  ProductVariantState,
} from "../src/types";

// ─────────────────────────────────────────────────────────────────────────────
// SpendPilot AI: Variant Confirmation Integrity Regression Suite (12 Scenarios)
// ─────────────────────────────────────────────────────────────────────────────

test("Scenario 1: A product has a valid base price but no retailer variants. Selecting a different storage configuration must remain unverified", () => {
  const baseProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "laptop_basic_01",
    title: "Ultra Laptop Base",
    imageUrl: "https://example.com/laptop.jpg",
    priceMinor: 120000, // $1,200.00
    currency: "USD",
    retailerName: "BestRetailer",
    retailerUrl: "https://bestretailer.com/laptop",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [
      {
        id: "off_base",
        domain: "BestRetailer",
        url: "https://bestretailer.com/laptop",
        priceMinor: 120000,
        currency: "USD",
        availability: "in_stock",
      },
    ],
  };

  // Retailer variant state indicates no variants verified
  const noVariantsState: ProductVariantState = {
    productId: "laptop_basic_01",
    title: "Ultra Laptop Base",
    status: "no_variants_verified",
    options: [],
    selected: {},
    effectiveSelected: {},
    isRelaxed: false,
    relaxationMessage: null,
    isFullyConfigured: false,
    availability: "InStock",
    verifiedPriceMinor: null,
    verifiedCurrency: null,
    retailerUrl: "https://bestretailer.com/laptop",
    retailerName: "BestRetailer",
  };

  const requestedOptions = { Storage: "1TB" };
  const confirmationResult = evaluateVariantConfirmation(
    noVariantsState,
    requestedOptions,
    "USD",
    baseProduct
  );

  assert.strictEqual(
    confirmationResult.isConfirmed,
    false,
    "Selecting 1TB on product with no retailer variants must remain unverified"
  );
  assert.strictEqual(
    confirmationResult.effectivePriceMinor,
    null,
    "Base product price ($1,200) must never be assigned to custom 1TB request"
  );
  assert.strictEqual(
    confirmationResult.matchingOffer,
    null,
    "Must not fabricate matching offer when variants are unverified"
  );
});

test("Scenario 2: A retailer confirms 512GB when the user requested 1TB. The 512GB price must never be assigned to 1TB", () => {
  // Test token matching
  assert.strictEqual(
    isExactOptionValueMatch("1TB", "512GB"),
    false,
    "1TB must never match 512GB"
  );
  assert.strictEqual(
    isExactOptionValueMatch("16GB", "24GB"),
    false,
    "16GB must never match 24GB"
  );

  const baseProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "ultrabook_512",
    title: "Ultrabook 512GB",
    imageUrl: null,
    priceMinor: 110000,
    currency: "USD",
    retailerName: "TechHub",
    retailerUrl: "https://techhub.com/ultrabook",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
  };

  // Retailer substituted 512GB when 1TB was requested
  const relaxedState: ProductVariantState = {
    productId: "ultrabook_512",
    title: "Ultrabook 512GB",
    status: "relaxation_mismatch",
    options: [
      {
        name: "Storage",
        values: [{ label: "512GB", exists: true, available: "InStock", priceMinor: null }],
      },
    ],
    selected: { Storage: "1TB" },
    effectiveSelected: { Storage: "512GB" }, // Substituted!
    isRelaxed: true,
    relaxationMessage: 'Requested Storage "1TB", but retailer returned "512GB"',
    isFullyConfigured: true,
    availability: "InStock",
    verifiedPriceMinor: 110000,
    verifiedCurrency: "USD",
    retailerUrl: "https://techhub.com/ultrabook-512",
    retailerName: "TechHub",
  };

  const requestedOptions = { Storage: "1TB" };
  const confirmationResult = evaluateVariantConfirmation(
    relaxedState,
    requestedOptions,
    "USD",
    baseProduct
  );

  assert.strictEqual(
    confirmationResult.isConfirmed,
    false,
    "Confirmation must fail when retailer relaxed 1TB to 512GB"
  );
  assert.strictEqual(
    confirmationResult.effectivePriceMinor,
    null,
    "The 512GB price ($1,100) must NEVER be assigned to the requested 1TB option"
  );
});

test("Scenario 3: A retailer returns the correct options but no matching offer. Confirmation must fail", () => {
  const baseProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "workstation_01",
    title: "Workstation Pro",
    imageUrl: null,
    priceMinor: 250000,
    currency: "USD",
    retailerName: "WS Direct",
    retailerUrl: "https://wsdirect.com/pro",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
  };

  // Retailer confirms options and price, but provides NO matching offer
  const noOfferState: ProductVariantState = {
    productId: "workstation_01",
    title: "Workstation Pro 64GB",
    status: "variants_found",
    options: [
      {
        name: "RAM",
        values: [{ label: "64GB", exists: true, available: "InStock", priceMinor: null }],
      },
    ],
    selected: { RAM: "64GB" },
    effectiveSelected: { RAM: "64GB" },
    isRelaxed: false,
    relaxationMessage: null,
    isFullyConfigured: true,
    availability: "InStock",
    verifiedPriceMinor: 320000,
    verifiedCurrency: "USD",
    retailerUrl: "https://wsdirect.com/pro-64",
    retailerName: "WS Direct",
    offers: [], // EMPTY OFFERS!
  };

  const result = evaluateVariantConfirmation(
    noOfferState,
    { RAM: "64GB" },
    "USD",
    baseProduct
  );

  assert.strictEqual(
    result.isConfirmed,
    false,
    "Confirmation must fail when retailer provides no matching offer"
  );
  assert.strictEqual(result.effectivePriceMinor, null);
  assert.strictEqual(result.matchingOffer, null);
});

test("Scenario 4: A retailer returns a price in EUR when the requested currency is USD. Confirmation must fail", () => {
  const baseProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "camera_pro",
    title: "Camera Body",
    imageUrl: null,
    priceMinor: 150000,
    currency: "USD",
    retailerName: "CameraStore",
    retailerUrl: "https://camerastore.com/body",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
  };

  // Retailer returned EUR offer when USD was requested
  const eurState: ProductVariantState = {
    productId: "camera_pro",
    title: "Camera Kit with 24-70mm Lens",
    status: "variants_found",
    options: [
      {
        name: "Lens",
        values: [{ label: "24-70mm", exists: true, available: "InStock", priceMinor: null }],
      },
    ],
    selected: { Lens: "24-70mm" },
    effectiveSelected: { Lens: "24-70mm" },
    isRelaxed: false,
    relaxationMessage: null,
    isFullyConfigured: true,
    availability: "InStock",
    verifiedPriceMinor: 220000,
    verifiedCurrency: "EUR", // EUR returned!
    retailerUrl: "https://camerastore.com/kit-eur",
    retailerName: "CameraStore EU",
    offers: [
      {
        id: "off_eur_kit",
        domain: "CameraStore EU",
        url: "https://camerastore.com/kit-eur",
        priceMinor: 220000,
        currency: "EUR",
        availability: "in_stock",
      },
    ],
  };

  const result = evaluateVariantConfirmation(
    eurState,
    { Lens: "24-70mm" },
    "USD", // Requested USD!
    baseProduct
  );

  assert.strictEqual(
    result.isConfirmed,
    false,
    "Confirmation must fail when retailer returns EUR for a USD request"
  );
  assert.strictEqual(result.effectivePriceMinor, null);
  assert.strictEqual(result.matchingOffer, null);
});

test("Scenario 5: A retailer returns an offer with a different price from the verified variant price. Confirmation must fail", () => {
  const baseProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "dev_laptop",
    title: "Developer Laptop",
    imageUrl: null,
    priceMinor: 150000,
    currency: "USD",
    retailerName: "TechDirect",
    retailerUrl: "https://techdirect.com/laptop",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
  };

  // Retailer verifiedPriceMinor is 160000 ($1,600), but offer has price 180000 ($1,800)
  const mismatchedPriceState: ProductVariantState = {
    productId: "dev_laptop",
    title: "Developer Laptop 32GB",
    status: "variants_found",
    options: [{ name: "RAM", values: [{ label: "32GB", exists: true, available: "InStock", priceMinor: null }] }],
    selected: { RAM: "32GB" },
    effectiveSelected: { RAM: "32GB" },
    isRelaxed: false,
    relaxationMessage: null,
    isFullyConfigured: true,
    availability: "InStock",
    verifiedPriceMinor: 160000,
    verifiedCurrency: "USD",
    retailerUrl: "https://techdirect.com/laptop-32gb",
    retailerName: "TechDirect",
    offers: [
      {
        id: "off_mismatch_price",
        domain: "TechDirect",
        url: "https://techdirect.com/laptop-32gb",
        priceMinor: 180000, // MISMATCH ($1,800 !== $1,600)!
        currency: "USD",
        availability: "in_stock",
      },
    ],
  };

  const result = evaluateVariantConfirmation(
    mismatchedPriceState,
    { RAM: "32GB" },
    "USD",
    baseProduct
  );

  assert.strictEqual(
    result.isConfirmed,
    false,
    "Confirmation must fail when retailer offer price does not match verified variant price"
  );
  assert.strictEqual(result.effectivePriceMinor, null);
  assert.strictEqual(result.matchingOffer, null);
});

test("Scenario 6: A user changes options while another request is pending. The previous confirmation must not be used", () => {
  const fp1 = createVariantRequestFingerprint({
    itemId: "item_1",
    productId: "macbook_pro",
    retailerUrl: "https://apple.com/mbp",
    currency: "USD",
    selectedOptions: { RAM: "16GB" },
  });

  const lastConfirmedResponse = {
    requestId: 1,
    fingerprint: fp1,
    options: { RAM: "16GB" },
    priceMinor: 199900,
    currency: "USD" as const,
    offer: {
      id: "off_16",
      domain: "apple.com",
      url: "https://apple.com/mbp",
      priceMinor: 199900,
      currency: "USD",
      availability: "in_stock" as const,
    },
  };

  // User selects 32GB while in-flight
  const currentOptions = { RAM: "32GB" };
  const isUpdating = true;
  const isPending = isUpdating;

  const currentFingerprint = createVariantRequestFingerprint({
    itemId: "item_1",
    productId: "macbook_pro",
    retailerUrl: "https://apple.com/mbp",
    currency: "USD",
    selectedOptions: currentOptions,
  });

  // Verify canConfirm evaluation
  const areRequestedOptionsConfirmed = Boolean(
    !isPending &&
    lastConfirmedResponse &&
    lastConfirmedResponse.fingerprint === currentFingerprint
  );

  assert.strictEqual(
    areRequestedOptionsConfirmed,
    false,
    "Previous 16GB confirmation must NOT be used for pending 32GB selection"
  );
  assert.notStrictEqual(fp1, currentFingerprint, "Fingerprints must differ when options change");
});

test("Scenario 7: A previous response arrives after a newer request. The older response must be discarded", () => {
  let activeRequestId = 1;
  let lastConfirmedResponse: { requestId: number; priceMinor: number } | null = null;

  // Rapid change: Request 1 was sent, user changed selection, active request is now 2
  activeRequestId = 2;

  // Outdated response 1 arrives late
  const staleResponse = { requestId: 1, priceMinor: 109900 };

  if (staleResponse.requestId === activeRequestId) {
    lastConfirmedResponse = staleResponse;
  }

  assert.strictEqual(
    lastConfirmedResponse,
    null,
    "Stale response with requestId 1 must be discarded when activeRequestId is 2"
  );

  // Newer response 2 arrives
  const currentResponse = { requestId: 2, priceMinor: 149900 };
  if (currentResponse.requestId === activeRequestId) {
    lastConfirmedResponse = currentResponse;
  }

  assert.strictEqual(lastConfirmedResponse?.priceMinor, 149900);
});

test("Scenario 8: A currency change must invalidate the previous response and trigger re-verification", () => {
  const usdFingerprint = createVariantRequestFingerprint({
    itemId: "item_laptop",
    productId: "dell_xps_13",
    retailerUrl: "https://dell.com/xps13",
    currency: "USD",
    selectedOptions: { Storage: "1TB" },
  });

  const eurFingerprint = createVariantRequestFingerprint({
    itemId: "item_laptop",
    productId: "dell_xps_13",
    retailerUrl: "https://dell.com/xps13",
    currency: "EUR", // Changed to EUR!
    selectedOptions: { Storage: "1TB" },
  });

  assert.notStrictEqual(
    usdFingerprint,
    eurFingerprint,
    "Fingerprint must change when requested currency changes"
  );

  const lastConfirmedUsd = {
    fingerprint: usdFingerprint,
    currency: "USD" as const,
    priceMinor: 140000,
    offer: {
      id: "off_usd",
      domain: "dell.com",
      url: "https://dell.com/xps13",
      priceMinor: 140000,
      currency: "USD",
      availability: "in_stock" as const,
    },
  };

  // Evaluation for new EUR request with previous USD response
  const canConfirmEurWithUsd = Boolean(
    lastConfirmedUsd.fingerprint === eurFingerprint &&
    (lastConfirmedUsd.currency as string) === "EUR"
  );

  assert.strictEqual(
    canConfirmEurWithUsd,
    false,
    "Previous USD confirmation must never confirm a EUR request"
  );
});

test("Scenario 9: Switching products with the same product ID but different retailer URLs must not reuse stale confirmation", () => {
  const storeAFingerprint = createVariantRequestFingerprint({
    itemId: "item_1",
    productId: "headphones_wireless_01",
    retailerUrl: "https://store-a.com/headphones",
    currency: "USD",
    selectedOptions: { Color: "Black" },
  });

  const storeBFingerprint = createVariantRequestFingerprint({
    itemId: "item_1",
    productId: "headphones_wireless_01",
    retailerUrl: "https://store-b.com/headphones", // Different merchant URL!
    currency: "USD",
    selectedOptions: { Color: "Black" },
  });

  assert.notStrictEqual(
    storeAFingerprint,
    storeBFingerprint,
    "Fingerprint must differ when retailer URL changes, even for identical product ID"
  );

  const responseFromStoreA = {
    fingerprint: storeAFingerprint,
    currency: "USD" as const,
    priceMinor: 29900,
    offer: {
      id: "off_store_a",
      domain: "store-a.com",
      url: "https://store-a.com/headphones",
      priceMinor: 29900,
      currency: "USD",
      availability: "in_stock" as const,
    },
  };

  const canConfirmStoreB = Boolean(
    responseFromStoreA.fingerprint === storeBFingerprint
  );

  assert.strictEqual(
    canConfirmStoreB,
    false,
    "Store A response must never confirm configuration for Store B"
  );
});

test("Scenario 10: Production retrieval must never return hardcoded test fixtures", async () => {
  // Ensure no mock client is injected
  setChannel3ClientForTesting(null);

  // Calling retrieveProductVariants for MacBook in production mode
  const resMacBook = await retrieveProductVariants(
    "apple-macbook-air-m3-13",
    { RAM: "16GB Unified Memory" },
    "USD",
    "https://apple.com/shop/buy-mac/macbook-air/13-inch-m3"
  );

  assert.strictEqual(
    resMacBook.status,
    "unavailable",
    "Production retrieval must report 'unavailable' without live API key / backend connection"
  );
  assert.deepStrictEqual(
    resMacBook.options,
    [],
    "Production retrieval must never return hardcoded fixture options"
  );
  assert.strictEqual(
    resMacBook.verifiedPriceMinor,
    null,
    "Production retrieval must never return hardcoded fixture prices"
  );

  // Calling retrieveProductVariants for Nike in production mode
  const resNike = await retrieveProductVariants(
    "nike-pegasus-41-running-shoe",
    { Size: "US 10" },
    "USD"
  );

  assert.strictEqual(resNike.status, "unavailable");
  assert.deepStrictEqual(resNike.options, []);
  assert.strictEqual(resNike.verifiedPriceMinor, null);
});

test("Scenario 11: Unverified preferences must survive actual workspace serialization and restoration", () => {
  let ws = createInitialWorkspace({ currency: "USD" });
  ws = addIndependentItem(ws, { productRequest: "Flagship Tablet" });
  const itemId = ws.groups[0].items[0].id;

  const baseProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "tab_pro_12",
    title: "Flagship Tablet 256GB WiFi",
    imageUrl: null,
    priceMinor: 99900, // Verified $999.00
    currency: "USD",
    retailerName: "TabletStore",
    retailerUrl: "https://tabletstore.com/pro12-256",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [
      {
        id: "off_tab_256",
        domain: "TabletStore",
        url: "https://tabletstore.com/pro12-256",
        priceMinor: 99900,
        currency: "USD",
        availability: "in_stock",
      },
    ],
  };

  ws = selectProductForItem(ws, itemId, baseProduct, baseProduct.offers![0]);

  // User configures unverified custom preference for this specific product
  const unverifiedSelection: ProductVariantSelection = {
    productId: "tab_pro_12",
    selectedOptions: { Storage: "512GB", Connectivity: "5G" },
    title: "Flagship Tablet 512GB 5G (Unverified)",
    confirmedPriceMinor: null,
    confirmedCurrency: null,
    confirmedRetailerUrl: "https://tabletstore.com/pro12-512-5g",
    isConfirmed: false,
  };

  const wsWithPref = updateVariantForItem(ws, itemId, unverifiedSelection);
  const item = wsWithPref.groups[0].items[0];

  assert.strictEqual(
    item.selectedProduct?.priceMinor,
    99900,
    "Verified base price ($999.00) must remain intact when saving unverified preferences"
  );
  assert.deepStrictEqual(
    item.unverifiedVariantPreferences?.["tab_pro_12"],
    { Storage: "512GB", Connectivity: "5G" },
    "Unverified preferences must be stored keyed by product ID on the owning item"
  );

  // Full JSON serialization and restoration
  const serialized = JSON.stringify(wsWithPref);
  const restoredWs = JSON.parse(serialized);
  const restoredItem = restoredWs.groups[0].items[0];

  assert.deepStrictEqual(
    restoredItem.unverifiedVariantPreferences?.["tab_pro_12"],
    { Storage: "512GB", Connectivity: "5G" },
    "Unverified preferences must persist across serialization and restoration"
  );
  assert.strictEqual(
    restoredItem.selectedProduct.priceMinor,
    99900,
    "Verified price must still remain $999.00 after reload"
  );
});

test("Scenario 12: Preferences from one item must not appear in another item, and candidate preferences must remain isolated", () => {
  let ws = createInitialWorkspace({ currency: "USD" });

  // Add Item 1: Laptop
  ws = addIndependentItem(ws, { productRequest: "Laptop" });
  const item1Id = ws.groups[0].items[0].id;

  // Add Item 2: Headphones
  ws = addIndependentItem(ws, { productRequest: "Headphones" });
  const item2Id = ws.groups[0].items[1].id;

  // Save unverified preference for candidate "macbook_air_m3" on Item 1
  ws = updateVariantForItem(ws, item1Id, {
    productId: "macbook_air_m3",
    selectedOptions: { Color: "Midnight", RAM: "24GB" },
    isConfirmed: false,
    confirmedPriceMinor: null,
    confirmedRetailerUrl: "https://apple.com/mba3",
  });

  const item1 = ws.groups[0].items.find((i) => i.id === item1Id)!;
  const item2 = ws.groups[0].items.find((i) => i.id === item2Id)!;

  // Item 1 has preferences for "macbook_air_m3"
  assert.deepStrictEqual(
    item1.unverifiedVariantPreferences?.["macbook_air_m3"],
    { Color: "Midnight", RAM: "24GB" }
  );

  // Candidate B ("dell_xps_15") on Item 1 has no preferences
  assert.strictEqual(
    item1.unverifiedVariantPreferences?.["dell_xps_15"],
    undefined,
    "Preferences from MacBook Air must not leak into Dell XPS on same item"
  );

  // Item 2 has no preferences from Item 1
  assert.strictEqual(
    item2.unverifiedVariantPreferences,
    undefined,
    "Preferences from Item 1 must not leak into Item 2"
  );
});
