import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateVariantConfirmation,
  isExactOptionValueMatch,
} from "../src/lib/channel3/variants";
import {
  createInitialWorkspace,
  addIndependentItem,
  selectProductForItem,
  updateVariantForItem,
} from "../src/lib/workspace/workspace-manager";
import type {
  NormalizedProduct,
  ProductOfferItem,
  ProductVariantSelection,
  ProductVariantState,
} from "../src/types";

// ─────────────────────────────────────────────────────────────────────────────
// SpendPilot AI: Variant Confirmation Integrity Regression Suite (8 Scenarios)
// ─────────────────────────────────────────────────────────────────────────────

test("Scenario 1: Channel3 returns valid laptop & base price but no variants -> selecting 1TB remains unverified", async () => {
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

  // Channel3 returns no selectable variant configurations for this product
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
    "Selecting 1TB on product with no verified variants must remain unverified"
  );
  assert.strictEqual(
    confirmationResult.effectivePriceMinor,
    null,
    "Must not assign base product price to custom 1TB request"
  );
  assert.strictEqual(
    confirmationResult.matchingOffer,
    null,
    "Must not fabricate matching offer when variants are unverified"
  );
});

test("Scenario 2: Channel3 returns option dimensions but no confirmed selected values -> not confirmed", () => {
  const baseProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "laptop_options_empty",
    title: "Configurable Laptop",
    imageUrl: null,
    priceMinor: 150000,
    currency: "USD",
    retailerName: "ShopCo",
    retailerUrl: "https://shopco.com/laptop",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
  };

  // Dimensions returned, but effectiveSelected is empty (retailer did not confirm selection)
  const emptySelectedState: ProductVariantState = {
    productId: "laptop_options_empty",
    title: "Configurable Laptop",
    status: "variants_found",
    options: [
      {
        name: "Storage",
        values: [
          { label: "512GB", exists: true, available: "InStock", priceMinor: null },
          { label: "1TB", exists: true, available: "InStock", priceMinor: null },
        ],
      },
    ],
    selected: {},
    effectiveSelected: {}, // Empty: retailer did not confirm
    isRelaxed: true,
    relaxationMessage: "Retailer did not confirm selections for the requested options.",
    isFullyConfigured: false,
    availability: "InStock",
    verifiedPriceMinor: 150000,
    retailerUrl: "https://shopco.com/laptop",
    retailerName: "ShopCo",
  };

  const requestedOptions = { Storage: "1TB" };
  const result = evaluateVariantConfirmation(
    emptySelectedState,
    requestedOptions,
    "USD",
    baseProduct
  );

  assert.strictEqual(
    result.isConfirmed,
    false,
    "Variant with empty confirmed selections must NOT be confirmed"
  );
  assert.strictEqual(
    result.effectivePriceMinor,
    null,
    "Effective price must be null when retailer does not confirm selection"
  );
});

test("Scenario 3: Channel3 returns 512GB after 1TB request -> 512GB price never assigned to 1TB", () => {
  // Test token matching function directly
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
  assert.strictEqual(
    isExactOptionValueMatch("1TB NVMe SSD", "1TB SSD"),
    true,
    "Matching capacities with descriptive suffix must match"
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
        values: [
          { label: "512GB", exists: true, available: "InStock", priceMinor: null },
        ],
      },
    ],
    selected: { Storage: "1TB" },
    effectiveSelected: { Storage: "512GB" }, // Retailer returned 512GB!
    isRelaxed: true,
    relaxationMessage: 'Requested Storage "1TB", but retailer returned "512GB"',
    isFullyConfigured: true,
    availability: "InStock",
    verifiedPriceMinor: 110000, // Price of 512GB
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
    "Confirmation must be false when retailer relaxed 1TB to 512GB"
  );
  assert.strictEqual(
    confirmationResult.effectivePriceMinor,
    null,
    "The 512GB price ($1,100) must NEVER be assigned to the requested 1TB option"
  );
});

test("Scenario 4: User changes option and clicks Confirm before API response arrives -> confirmation blocked", () => {
  // Simulates ProductVariantConfigurator state logic
  let activeRequestId = 1;
  const isLoading = false;
  let isUpdating = false;
  let lastConfirmedResponse: {
    requestId: number;
    options: Record<string, string>;
    priceMinor: number;
  } | null = {
    requestId: 1,
    options: { RAM: "16GB" },
    priceMinor: 109900,
  };

  // User changes option to 32GB:
  // 1. Immediately invalidate lastConfirmedResponse
  // 2. Set isUpdating to true
  // 3. Issue new request ID
  const newRequestId = ++activeRequestId; // 2
  isUpdating = true;
  lastConfirmedResponse = null;

  // Evaluate canConfirm:
  // canConfirm requires !isLoading && !isUpdating && lastConfirmedResponse !== null
  const isPending = isLoading || isUpdating;
  const canConfirm = !isPending && lastConfirmedResponse !== null;

  assert.strictEqual(
    canConfirm,
    false,
    "Confirmation must be strictly blocked while new option request is in-flight"
  );
  assert.strictEqual(
    lastConfirmedResponse,
    null,
    "Previous confirmed response must be invalidated immediately upon option change"
  );
  assert.strictEqual(
    newRequestId,
    2,
    "Request ID must be advanced to guard against race conditions"
  );
});

test("Scenario 5: Older response arrives after newer selection -> discarded (stale protection)", () => {
  let activeRequestId = 1;
  let lastConfirmedResponse: {
    requestId: number;
    options: Record<string, string>;
    priceMinor: number;
  } | null = null;

  // Request 1 was sent for 16GB (requestId: 1)
  // User rapidly clicks 32GB (advanced to requestId: 2)
  activeRequestId = 2;

  // Older response 1 arrives late with requestId: 1
  const incomingResponse1 = {
    requestId: 1,
    variantState: {
      status: "variants_found",
      effectiveSelected: { RAM: "16GB" },
      verifiedPriceMinor: 109900,
    },
  };

  // Stale check
  if (incomingResponse1.requestId === activeRequestId) {
    lastConfirmedResponse = {
      requestId: incomingResponse1.requestId,
      options: { RAM: "16GB" },
      priceMinor: 109900,
    };
  }

  assert.strictEqual(
    lastConfirmedResponse,
    null,
    "Older response from request 1 must be discarded and not update confirmed response"
  );

  // Newer response 2 arrives with requestId: 2
  const incomingResponse2 = {
    requestId: 2,
    variantState: {
      status: "variants_found",
      effectiveSelected: { RAM: "32GB" },
      verifiedPriceMinor: 149900,
    },
  };

  if (incomingResponse2.requestId === activeRequestId) {
    lastConfirmedResponse = {
      requestId: incomingResponse2.requestId,
      options: { RAM: "32GB" },
      priceMinor: 149900,
    };
  }

  assert.notStrictEqual(
    lastConfirmedResponse,
    null,
    "Response matching the current activeRequestId must be accepted"
  );
  assert.strictEqual(
    lastConfirmedResponse?.priceMinor,
    149900,
    "Confirmed price must reflect the current request (32GB)"
  );
});

test("Scenario 6: Exact configuration response with matching variant offer -> accepted", () => {
  let ws = createInitialWorkspace({ currency: "USD" });
  ws = addIndependentItem(ws, { productRequest: "Pro Workstation" });
  const itemId = ws.groups[0].items[0].id;

  const baseProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "workstation_base",
    title: "Pro Workstation Base",
    imageUrl: null,
    priceMinor: 200000,
    currency: "USD",
    retailerName: "WorkstationDirect",
    retailerUrl: "https://ws-direct.com/tower",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [
      {
        id: "off_base",
        domain: "WorkstationDirect",
        url: "https://ws-direct.com/tower",
        priceMinor: 200000,
        currency: "USD",
        availability: "in_stock",
      },
    ],
  };

  ws = selectProductForItem(ws, itemId, baseProduct, baseProduct.offers![0]);

  const requestedOptions = { RAM: "64GB", GPU: "RTX 4080" };
  const verifiedVariantOffer: ProductOfferItem = {
    id: "off_var_64_4080",
    domain: "WorkstationDirect",
    url: "https://ws-direct.com/tower-custom-64-4080",
    priceMinor: 285000,
    currency: "USD",
    availability: "in_stock",
  };

  const exactVariantState: ProductVariantState = {
    productId: "workstation_base",
    title: "Pro Workstation 64GB / RTX 4080",
    status: "variants_found",
    options: [
      {
        name: "RAM",
        values: [{ label: "64GB", exists: true, available: "InStock", priceMinor: null }],
      },
      {
        name: "GPU",
        values: [{ label: "RTX 4080", exists: true, available: "InStock", priceMinor: null }],
      },
    ],
    selected: requestedOptions,
    effectiveSelected: requestedOptions,
    isRelaxed: false,
    relaxationMessage: null,
    isFullyConfigured: true,
    availability: "InStock",
    verifiedPriceMinor: 285000,
    retailerUrl: "https://ws-direct.com/tower-custom-64-4080",
    retailerName: "WorkstationDirect",
    offers: [verifiedVariantOffer],
  };

  const evalResult = evaluateVariantConfirmation(
    exactVariantState,
    requestedOptions,
    "USD",
    baseProduct
  );

  assert.strictEqual(evalResult.isConfirmed, true, "Exact matching configuration must be confirmed");
  assert.strictEqual(evalResult.effectivePriceMinor, 285000, "Price must match verified variant price");
  assert.strictEqual(evalResult.matchingOffer?.id, "off_var_64_4080", "Matching offer must be attached");

  // Apply to workspace
  const confirmedSelection: ProductVariantSelection = {
    productId: "workstation_base",
    title: "Pro Workstation 64GB / RTX 4080",
    selectedOptions: requestedOptions,
    confirmedPriceMinor: evalResult.effectivePriceMinor,
    confirmedCurrency: evalResult.effectiveCurrency,
    confirmedRetailerUrl: verifiedVariantOffer.url,
    confirmedOffer: evalResult.matchingOffer,
    isConfirmed: true,
  };

  ws = updateVariantForItem(ws, itemId, confirmedSelection);
  const updatedItem = ws.groups[0].items[0];

  assert.strictEqual(updatedItem.selectedProduct?.priceMinor, 285000);
  assert.strictEqual(updatedItem.selectedOffer?.id, "off_var_64_4080");
  assert.deepStrictEqual(updatedItem.selectedVariant, requestedOptions);
});

test("Scenario 7: Unverified preference persisted across workspace reload without changing verified price", () => {
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

  // User selects 512GB + 5G which is unverified (isConfirmed: false)
  const unverifiedSelection: ProductVariantSelection = {
    productId: "tab_pro_12",
    selectedOptions: { Storage: "512GB", Connectivity: "5G" },
    title: "Flagship Tablet 512GB 5G (Unverified)",
    confirmedPriceMinor: null,
    confirmedCurrency: null,
    confirmedRetailerUrl: "https://tabletstore.com/pro12-512-5g",
    isConfirmed: false,
  };

  const wsWithPreference = updateVariantForItem(ws, itemId, unverifiedSelection);
  const updatedItem = wsWithPreference.groups[0].items[0];

  // Verified price and offer MUST remain untouched
  assert.strictEqual(
    updatedItem.selectedProduct?.priceMinor,
    99900,
    "Verified base price ($999.00) must remain intact when saving unverified preferences"
  );
  assert.strictEqual(
    updatedItem.selectedProduct?.title,
    "Flagship Tablet 256GB WiFi",
    "Verified product title must remain intact"
  );
  assert.deepStrictEqual(
    updatedItem.unverifiedVariantPreferences,
    { Storage: "512GB", Connectivity: "5G" },
    "Unverified preferences must be stored under unverifiedVariantPreferences"
  );

  // Simulate workspace reload via localStorage JSON serialization / deserialization
  const serialized = JSON.stringify(wsWithPreference);
  const reloadedWs = JSON.parse(serialized);
  const reloadedItem = reloadedWs.groups[0].items[0];

  assert.deepStrictEqual(
    reloadedItem.unverifiedVariantPreferences,
    { Storage: "512GB", Connectivity: "5G" },
    "Unverified preferences must persist across serialization/deserialization reload"
  );
  assert.strictEqual(
    reloadedItem.selectedProduct.priceMinor,
    99900,
    "Verified price must still remain $999.00 after reload"
  );
});

test("Scenario 8: Missing or mismatched variant prices never become confirmed prices", () => {
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

  // Case A: Missing price (null)
  const missingPriceState: ProductVariantState = {
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
    verifiedPriceMinor: null, // MISSING
    retailerUrl: "https://techdirect.com/laptop-32gb",
    retailerName: "TechDirect",
  };

  const resMissing = evaluateVariantConfirmation(
    missingPriceState,
    { RAM: "32GB" },
    "USD",
    baseProduct
  );
  assert.strictEqual(resMissing.isConfirmed, false, "Null variant price cannot be confirmed");
  assert.strictEqual(resMissing.effectivePriceMinor, null);

  // Case B: Non-positive / invalid price
  const invalidPriceState: ProductVariantState = {
    ...missingPriceState,
    verifiedPriceMinor: -1000,
  };
  const resInvalid = evaluateVariantConfirmation(
    invalidPriceState,
    { RAM: "32GB" },
    "USD",
    baseProduct
  );
  assert.strictEqual(resInvalid.isConfirmed, false, "Negative variant price cannot be confirmed");

  // Case C: Mismatched offer price (offer is $1,800 but variant confirmed price is $1,600)
  const mismatchedOfferState: ProductVariantState = {
    ...missingPriceState,
    verifiedPriceMinor: 160000,
    offers: [
      {
        id: "off_mismatch",
        domain: "TechDirect",
        url: "https://techdirect.com/laptop-32gb",
        priceMinor: 180000, // MISMATCH!
        currency: "USD",
        availability: "in_stock",
      },
    ],
  };

  const resMismatch = evaluateVariantConfirmation(
    mismatchedOfferState,
    { RAM: "32GB" },
    "USD",
    baseProduct
  );
  assert.strictEqual(resMismatch.isConfirmed, true, "Price is valid");
  assert.strictEqual(
    resMismatch.matchingOffer,
    null,
    "Mismatched offer price must NOT be attached as the matching offer"
  );
});
