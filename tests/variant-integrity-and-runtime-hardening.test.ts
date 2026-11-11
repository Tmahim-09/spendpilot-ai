import test from "node:test";
import assert from "node:assert/strict";
import {
  retrieveProductVariants,
  synthesizeRetailerOptions,
  normalizeVariantAvailability,
} from "../src/lib/channel3/variants";
import {
  createInitialWorkspace,
  addIndependentItem,
  selectProductForItem,
  selectOfferForItem,
  updateVariantForItem,
  calculateWorkspaceBudgetSummary,
} from "../src/lib/workspace/workspace-manager";
import type {
  NormalizedProduct,
  ProductOfferItem,
  ProductVariantSelection,
} from "../src/types";

// ─────────────────────────────────────────────────────────────────────────────
// SpendPilot AI: Variant Integrity and Runtime Hardening Regression Suite
// ─────────────────────────────────────────────────────────────────────────────

test("Scenario 1: Channel3 retrieval fails and no fabricated options or prices are produced", async () => {
  // Test retrieval failure with empty/missing product
  const unavailableResult = await retrieveProductVariants({
    productId: "non_existent_item_999",
    retailerUrl: "https://unknown-shop.com/missing-item",
    selectedOptions: { RAM: "64GB" },
    currency: "USD",
  });

  assert.strictEqual(
    unavailableResult.status,
    "unavailable",
    "Failed retrieval must report status 'unavailable'"
  );
  assert.deepStrictEqual(
    unavailableResult.options,
    [],
    "Must not fabricate option dimensions on retrieval failure"
  );
  assert.strictEqual(
    unavailableResult.verifiedPriceMinor,
    null,
    "Price must be null when verification fails"
  );
  assert.strictEqual(
    unavailableResult.availability,
    "Unknown",
    "Availability must be 'Unknown' when retrieval fails"
  );

  // Test synthesizeRetailerOptions does not fabricate prices or assume stock
  const sampleProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "sample_laptop_1",
    title: "Pro Developer Laptop",
    imageUrl: null,
    priceMinor: 120000,
    currency: "USD",
    retailerName: "TechStore",
    retailerUrl: "https://techstore.com/dev-laptop",
    availability: "unknown",
    specifications: {
      RAM: "16GB, 32GB",
      Storage: "512GB, 1TB",
      Color: "Space Gray, Silver",
    },
    sourceFacts: [],
    offers: [],
  };

  const synthesized = synthesizeRetailerOptions(sampleProduct.title, sampleProduct.priceMinor);
  for (const dim of synthesized) {
    for (const val of dim.values) {
      assert.strictEqual(
        val.priceMinor,
        null,
        `Option value '${val.label}' in '${dim.name}' must have null priceMinor (no fabricated prices)`
      );
      assert.strictEqual(
        val.available,
        "Unknown",
        `Option value '${val.label}' in '${dim.name}' must have 'Unknown' availability`
      );
    }
  }
});

test("Scenario 2: Missing retailer availability remains Unknown", () => {
  assert.strictEqual(
    normalizeVariantAvailability(null),
    "Unknown",
    "null availability must normalize to 'Unknown'"
  );
  assert.strictEqual(
    normalizeVariantAvailability(undefined),
    "Unknown",
    "undefined availability must normalize to 'Unknown'"
  );
  assert.strictEqual(
    normalizeVariantAvailability(""),
    "Unknown",
    "empty string availability must normalize to 'Unknown'"
  );
  assert.strictEqual(
    normalizeVariantAvailability("unspecified"),
    "Unknown",
    "unspecified availability must normalize to 'Unknown'"
  );
  assert.strictEqual(
    normalizeVariantAvailability("InStock"),
    "InStock",
    "InStock must remain InStock"
  );
  assert.strictEqual(
    normalizeVariantAvailability("out_of_stock"),
    "OutOfStock",
    "out_of_stock must normalize to OutOfStock"
  );
});

test("Scenario 3: Missing configuration price cannot be confirmed", () => {
  let ws = createInitialWorkspace({ currency: "USD" });
  ws = addIndependentItem(ws, { productRequest: "Developer Laptop" });
  const itemId = ws.groups[0].items[0].id;

  const baseProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "laptop_dev_01",
    title: "Developer Laptop 16-inch",
    imageUrl: null,
    priceMinor: 180000,
    currency: "USD",
    retailerName: "BestRetailer",
    retailerUrl: "https://bestretailer.com/laptop-16",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [
      {
        id: "off_base_1",
        domain: "BestRetailer",
        url: "https://bestretailer.com/laptop-16",
        priceMinor: 180000,
        currency: "USD",
        availability: "in_stock",
      },
    ],
  };

  ws = selectProductForItem(ws, itemId, baseProduct, baseProduct.offers![0]);
  const initialRevision = ws.revision;

  // Attempting to confirm with null price must be rejected
  const missingPriceSelection: ProductVariantSelection = {
    productId: "laptop_dev_01",
    selectedOptions: { RAM: "32GB" },
    title: "Developer Laptop 16-inch 32GB",
    confirmedPriceMinor: null,
    confirmedCurrency: "USD",
    confirmedRetailerUrl: "https://bestretailer.com/laptop-16-32gb",
    isConfirmed: true,
  };

  const wsAfterMissingPrice = updateVariantForItem(ws, itemId, missingPriceSelection);
  assert.strictEqual(
    wsAfterMissingPrice.revision,
    initialRevision,
    "Missing configuration price must be rejected without incrementing revision"
  );
  assert.strictEqual(
    wsAfterMissingPrice.groups[0].items[0].selectedProduct?.priceMinor,
    180000,
    "Selected product price must remain the initial verified price"
  );

  // Attempting to confirm with negative or non-safe-integer price must be rejected
  const negativePriceSelection: ProductVariantSelection = {
    productId: "laptop_dev_01",
    selectedOptions: { RAM: "32GB" },
    title: "Developer Laptop 16-inch 32GB",
    confirmedPriceMinor: -5000,
    confirmedCurrency: "USD",
    confirmedRetailerUrl: "https://bestretailer.com/laptop-16-32gb",
    isConfirmed: true,
  };

  const wsAfterNegativePrice = updateVariantForItem(ws, itemId, negativePriceSelection);
  assert.strictEqual(
    wsAfterNegativePrice.revision,
    initialRevision,
    "Negative configuration price must be rejected"
  );
});

test("Scenario 4: Selecting 1TB while Channel3 confirms 512GB must not update selected price", () => {
  let ws = createInitialWorkspace({ currency: "USD" });
  ws = addIndependentItem(ws, { productRequest: "Ultrabook" });
  const itemId = ws.groups[0].items[0].id;

  const baseProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "ultrabook_512",
    title: "Ultrabook Pro 512GB",
    imageUrl: null,
    priceMinor: 120000,
    currency: "USD",
    retailerName: "TechHub",
    retailerUrl: "https://techhub.com/ultrabook-512",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [
      {
        id: "off_u512",
        domain: "TechHub",
        url: "https://techhub.com/ultrabook-512",
        priceMinor: 120000,
        currency: "USD",
        availability: "in_stock",
      },
    ],
  };

  ws = selectProductForItem(ws, itemId, baseProduct, baseProduct.offers![0]);
  const initialRevision = ws.revision;

  // User requested 1TB, but Channel3 could not confirm 1TB (relaxation or unconfirmed state).
  // The selection payload therefore has isConfirmed: false.
  const unconfirmed1TBSelection: ProductVariantSelection = {
    productId: "ultrabook_512",
    selectedOptions: { Storage: "1TB" },
    title: "Ultrabook Pro 1TB",
    confirmedPriceMinor: null,
    confirmedCurrency: null,
    confirmedRetailerUrl: "https://techhub.com/ultrabook-512",
    isConfirmed: false,
  };

  const wsResult = updateVariantForItem(ws, itemId, unconfirmed1TBSelection);
  assert.strictEqual(
    wsResult.revision,
    initialRevision,
    "Unconfirmed 1TB selection must preserve workspace revision"
  );
  assert.strictEqual(
    wsResult.groups[0].items[0].selectedProduct?.priceMinor,
    120000,
    "Selected price must NOT be changed when 1TB was not confirmed by retailer"
  );
  assert.strictEqual(
    wsResult.groups[0].items[0].selectedProduct?.title,
    "Ultrabook Pro 512GB",
    "Product title must remain the verified configuration"
  );
});

test("Scenario 5: Valid retailer response for exact configuration updates selected offer and price correctly", () => {
  let ws = createInitialWorkspace({ currency: "USD" });
  ws = addIndependentItem(ws, { productRequest: "Pro Workstation" });
  const itemId = ws.groups[0].items[0].id;

  const baseProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "ws_station_01",
    title: "Workstation Tower Base",
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
  const prevRevision = ws.revision;

  // Exact configuration confirmed by retailer
  const confirmedVariantSelection: ProductVariantSelection = {
    productId: "ws_station_01",
    selectedOptions: { RAM: "64GB", GPU: "RTX 4080" },
    title: "Workstation Tower 64GB / RTX 4080",
    confirmedPriceMinor: 285000,
    confirmedCurrency: "USD",
    confirmedRetailerUrl: "https://ws-direct.com/tower-custom-64-4080",
    confirmedOffer: {
      id: "off_var_64_4080",
      domain: "WorkstationDirect",
      url: "https://ws-direct.com/tower-custom-64-4080",
      priceMinor: 285000,
      currency: "USD",
      availability: "in_stock",
    },
    isConfirmed: true,
  };

  const wsUpdated = updateVariantForItem(ws, itemId, confirmedVariantSelection);
  assert.strictEqual(
    wsUpdated.revision,
    prevRevision + 1,
    "Confirmed selection must increment revision"
  );

  const updatedItem = wsUpdated.groups[0].items[0];
  assert.strictEqual(
    updatedItem.selectedProduct?.priceMinor,
    285000,
    "Price must update to confirmed variant price"
  );
  assert.strictEqual(
    updatedItem.selectedProduct?.currency,
    "USD",
    "Currency must match confirmed currency"
  );
  assert.strictEqual(
    updatedItem.selectedProduct?.retailerUrl,
    "https://ws-direct.com/tower-custom-64-4080",
    "Retailer URL must update in lockstep"
  );
  assert.strictEqual(
    updatedItem.selectedOffer?.id,
    "off_var_64_4080",
    "Selected offer must match confirmed offer"
  );
  assert.strictEqual(
    updatedItem.selectedOffer?.priceMinor,
    285000,
    "Selected offer price must be synchronized"
  );
  assert.deepStrictEqual(
    updatedItem.selectedVariant,
    { RAM: "64GB", GPU: "RTX 4080" },
    "Selected variant options must be recorded"
  );
});

test("Scenario 6: Modified offer with same URL/ID cannot override canonical stored price", () => {
  let ws = createInitialWorkspace({ currency: "USD" });
  ws = addIndependentItem(ws, { productRequest: "Gaming Monitor" });
  const itemId = ws.groups[0].items[0].id;

  const monitorProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "mon_4k_144",
    title: "4K 144Hz Gaming Monitor",
    imageUrl: null,
    priceMinor: 65000,
    currency: "USD",
    retailerName: "DisplayWorld",
    retailerUrl: "https://displayworld.com/4k-144",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [
      {
        id: "off_display_canonical",
        offerId: "off_display_canonical",
        domain: "DisplayWorld",
        url: "https://displayworld.com/4k-144",
        priceMinor: 65000, // Canonical price is $650.00
        currency: "USD",
        availability: "in_stock",
      },
    ],
  };

  ws = selectProductForItem(ws, itemId, monitorProduct, monitorProduct.offers![0]);
  const initialRev = ws.revision;

  // Attacker or client tampering: caller passes same ID and URL, but modified priceMinor of $50.00
  const tamperedOffer: ProductOfferItem = {
    id: "off_display_canonical",
    offerId: "off_display_canonical",
    domain: "DisplayWorld",
    url: "https://displayworld.com/4k-144",
    priceMinor: 5000, // Altered price!
    currency: "USD",
    availability: "in_stock",
  };

  const wsTampered = selectOfferForItem(ws, itemId, "mon_4k_144", tamperedOffer);
  assert.strictEqual(
    wsTampered.revision,
    initialRev,
    "Tampered offer with altered price must be rejected and leave workspace unchanged"
  );
  assert.strictEqual(
    wsTampered.groups[0].items[0].selectedProduct?.priceMinor,
    65000,
    "Canonical stored price ($650.00) must NOT be overwritten by tampered price"
  );
  assert.strictEqual(
    wsTampered.groups[0].items[0].selectedOffer?.priceMinor,
    65000,
    "Selected offer price must remain canonical"
  );
});

test("Scenario 7: Unconfirmed selection cannot overwrite existing verified selection", () => {
  let ws = createInitialWorkspace({ currency: "USD" });
  ws = addIndependentItem(ws, { productRequest: "Flagship Tablet" });
  const itemId = ws.groups[0].items[0].id;

  const tabletProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "tab_pro_12",
    title: "Flagship Tablet 256GB WiFi",
    imageUrl: null,
    priceMinor: 99900,
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

  ws = selectProductForItem(ws, itemId, tabletProduct, tabletProduct.offers![0]);
  const prevRev = ws.revision;

  // User configured 512GB + 5G, but retailer could not verify it (isConfirmed: false)
  const unverifiedConfiguration: ProductVariantSelection = {
    productId: "tab_pro_12",
    selectedOptions: { Storage: "512GB", Connectivity: "5G" },
    title: "Flagship Tablet 512GB 5G (Unverified)",
    confirmedPriceMinor: null,
    confirmedCurrency: null,
    confirmedRetailerUrl: "https://tabletstore.com/pro12-512-5g",
    isConfirmed: false,
  };

  const wsAfterUnconfirmed = updateVariantForItem(ws, itemId, unverifiedConfiguration);
  assert.strictEqual(
    wsAfterUnconfirmed.revision,
    prevRev,
    "Unconfirmed selection must preserve workspace revision"
  );
  assert.strictEqual(
    wsAfterUnconfirmed.groups[0].items[0].selectedProduct?.priceMinor,
    99900,
    "Existing verified price ($999.00) must be preserved intact"
  );
  assert.strictEqual(
    wsAfterUnconfirmed.groups[0].items[0].selectedProduct?.retailerUrl,
    "https://tabletstore.com/pro12-256",
    "Existing verified retailer URL must be preserved intact"
  );
  assert.strictEqual(
    wsAfterUnconfirmed.groups[0].items[0].selectedProduct?.title,
    "Flagship Tablet 256GB WiFi",
    "Existing verified title must be preserved intact"
  );
});

test("Scenario 8: Unavailable and unsupported prices remain excluded from budget calculations", () => {
  let ws = createInitialWorkspace({ currency: "USD" });
  ws = {
    ...ws,
    overallBudget: { amountMinor: 250000, currency: "USD", strict: true },
  };

  // Add 1 verified USD product ($1,200.00)
  ws = addIndependentItem(ws, { productRequest: "Office Desk" });
  const deskItemId = ws.groups[0].items[0].id;
  const deskProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "desk_oak",
    title: "Solid Oak Office Desk",
    imageUrl: null,
    priceMinor: 120000,
    currency: "USD",
    retailerName: "FurnitureCo",
    retailerUrl: "https://furniture.com/desk",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [],
  };
  ws = selectProductForItem(ws, deskItemId, deskProduct);

  // Add 1 unpriced / unavailable product (priceMinor: null)
  ws = addIndependentItem(ws, { productRequest: "Custom Ergonomic Chair" });
  const chairItemId = ws.groups[0].items[1].id;
  const chairProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "chair_ergo_custom",
    title: "Custom Ergonomic Chair (Option unpriced)",
    imageUrl: null,
    priceMinor: null, // Unavailable price
    currency: "USD",
    retailerName: "ChairMaker",
    retailerUrl: "https://chairmaker.com/ergo",
    availability: "unknown",
    specifications: {},
    sourceFacts: [],
    offers: [],
  };
  ws = selectProductForItem(ws, chairItemId, chairProduct);

  const summary = calculateWorkspaceBudgetSummary(ws);

  // Total spend must ONLY count verified prices ($1,200.00), excluding unpriced
  assert.strictEqual(
    summary.totalSelectedMinor,
    120000,
    "Total spend must only include valid positive prices ($1,200.00)"
  );
  assert.strictEqual(
    summary.unpricedCount,
    1,
    "Unpriced item must be counted in unpricedCount"
  );
  // Unpriced selections must prevent a complete within-budget claim!
  assert.strictEqual(
    summary.status,
    "partially_comparable",
    "Budget status with unpriced items must be 'partially_comparable', never 'within_budget'"
  );
});
