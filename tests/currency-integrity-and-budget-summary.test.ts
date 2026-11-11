import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMajorToMinor,
  formatMajorUnits,
  formatMinorUnits,
  formatBudgetMinor,
  formatBudgetMajor,
  formatCurrencyTotals,
  getCurrencySymbol,
  minorToMajorUnits,
} from "../src/lib/money";
import { normalizeChannel3Product } from "../src/lib/channel3/normalize-products";
import {
  createInitialWorkspace,
  addIndependentItem,
  createCoordinatedSetupGroup,
  selectProductForItem,
  selectOfferForItem,
  updateVariantForItem,
  calculateWorkspaceBudgetSummary,
  compareItemBudget,
} from "../src/lib/workspace/workspace-manager";
import type { NormalizedProduct, ProductOfferItem, ProductVariantSelection, CurrencyCode } from "../src/types";

// ─────────────────────────────────────────────────────────────────────────────
// SpendPilot Phase 2: Currency Integrity, Accurate Budgets & Verified Retailer Pricing
// ─────────────────────────────────────────────────────────────────────────────

test("Test A: Single currency ($950 + $180 = $1,130 USD) with normal budget comparison", () => {
  let ws = createInitialWorkspace({ currency: "USD" });
  ws = {
    ...ws,
    overallBudget: { amountMinor: 120000, currency: "USD", strict: true },
  };

  ws = addIndependentItem(ws, { productRequest: "MacBook Pro M3" });
  const macbookItemId = ws.groups[0].items[0].id;
  const macbookProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "mbp_m3_14",
    title: "Apple MacBook Pro 14 M3",
    imageUrl: null,
    priceMinor: 95000, // $950.00
    currency: "USD",
    retailerName: "Best Buy",
    retailerUrl: "https://bestbuy.com/mbp-m3",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [
      {
        id: "off_bb_1",
        domain: "Best Buy",
        url: "https://bestbuy.com/mbp-m3",
        priceMinor: 95000,
        currency: "USD",
        availability: "in_stock",
      },
    ],
  };
  ws = selectProductForItem(ws, macbookItemId, macbookProduct, macbookProduct.offers![0]);

  ws = addIndependentItem(ws, { productRequest: "Sony WH-1000XM5 Headphones" });
  const headphonesItemId = ws.groups[0].items[1].id;
  const headphonesProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "sony_xm5",
    title: "Sony WH-1000XM5 Noise-Canceling Headphones",
    imageUrl: null,
    priceMinor: 18000, // $180.00
    currency: "USD",
    retailerName: "Amazon",
    retailerUrl: "https://amazon.com/sony-xm5",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [
      {
        id: "off_amz_1",
        domain: "Amazon",
        url: "https://amazon.com/sony-xm5",
        priceMinor: 18000,
        currency: "USD",
        availability: "in_stock",
      },
    ],
  };
  ws = selectProductForItem(ws, headphonesItemId, headphonesProduct, headphonesProduct.offers![0]);

  const summary = calculateWorkspaceBudgetSummary(ws, "USD");

  assert.strictEqual(summary.totalsByCurrency["USD"], 113000, "USD total must be 113000 cents ($1,130.00)");
  assert.strictEqual(summary.totalSelectedMinor, 113000);
  assert.strictEqual(summary.selectedTotalInBudgetCurrencyMinor, 113000);
  assert.strictEqual(summary.remainingMinor, 7000, "Remaining budget must be 7000 cents ($70.00)");
  assert.strictEqual(summary.status, "within_budget");
  assert.strictEqual(summary.isOverBudget, false);
  assert.strictEqual(Object.keys(summary.foreignCurrencyTotals).length, 0);
  assert.strictEqual(summary.unpricedCount, 0);
  assert.strictEqual(summary.unsupportedCurrencyCount, 0);
});

test("Test B: Mixed currencies ($950 USD, €180 EUR, £75 GBP) -> Separate totals, no combined sum", () => {
  let ws = createInitialWorkspace({ currency: "USD" });

  // 1. USD item
  ws = addIndependentItem(ws, { productRequest: "Laptop" });
  const laptopId = ws.groups[0].items[0].id;
  const laptop: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "laptop_usd",
    title: "US Laptop",
    imageUrl: null,
    priceMinor: 95000,
    currency: "USD",
    retailerName: "Best Buy",
    retailerUrl: "https://bestbuy.com/laptop",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [
      {
        id: "off_usd",
        domain: "Best Buy",
        url: "https://bestbuy.com/laptop",
        priceMinor: 95000,
        currency: "USD",
        availability: "in_stock",
      },
    ],
  };
  ws = selectProductForItem(ws, laptopId, laptop, laptop.offers![0]);

  // 2. EUR item
  ws = addIndependentItem(ws, { productRequest: "Monitor" });
  const monitorId = ws.groups[0].items[1].id;
  const monitor: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "monitor_eur",
    title: "EU Monitor",
    imageUrl: null,
    priceMinor: 18000,
    currency: "EUR",
    retailerName: "FNAC",
    retailerUrl: "https://fnac.com/monitor",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [
      {
        id: "off_eur",
        domain: "FNAC",
        url: "https://fnac.com/monitor",
        priceMinor: 18000,
        currency: "EUR",
        availability: "in_stock",
      },
    ],
  };
  ws = selectProductForItem(ws, monitorId, monitor, monitor.offers![0]);

  // 3. GBP item
  ws = addIndependentItem(ws, { productRequest: "Mechanical Keyboard" });
  const kbId = ws.groups[0].items[2].id;
  const kb: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "kb_gbp",
    title: "UK Mechanical Keyboard",
    imageUrl: null,
    priceMinor: 7500,
    currency: "GBP",
    retailerName: "Currys",
    retailerUrl: "https://currys.co.uk/keyboard",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [
      {
        id: "off_gbp",
        domain: "Currys",
        url: "https://currys.co.uk/keyboard",
        priceMinor: 7500,
        currency: "GBP",
        availability: "in_stock",
      },
    ],
  };
  ws = selectProductForItem(ws, kbId, kb, kb.offers![0]);

  const summary = calculateWorkspaceBudgetSummary(ws, "USD");

  assert.strictEqual(summary.totalsByCurrency["USD"], 95000);
  assert.strictEqual(summary.totalsByCurrency["EUR"], 18000);
  assert.strictEqual(summary.totalsByCurrency["GBP"], 7500);

  // Must NEVER combine 950 + 180 + 75 = 1205
  assert.notStrictEqual(summary.totalSelectedMinor, 95000 + 18000 + 7500);
  assert.strictEqual(summary.totalSelectedMinor, 95000); // USD items only in primary currency

  const formattedTotals = formatCurrencyTotals(summary.totalsByCurrency);
  assert.match(formattedTotals, /\$950\.00/);
  assert.match(formattedTotals, /€180\.00/);
  assert.match(formattedTotals, /£75\.00/);
});

test("Test C: Overall USD budget ($1,000 budget, $950 USD + €180 EUR -> partially comparable)", () => {
  let ws = createInitialWorkspace({ currency: "USD" });
  ws = {
    ...ws,
    overallBudget: { amountMinor: 100000, currency: "USD", strict: true },
  };

  ws = addIndependentItem(ws, { productRequest: "Laptop" });
  const laptopId = ws.groups[0].items[0].id;
  const laptop: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "laptop_usd",
    title: "US Laptop",
    imageUrl: null,
    priceMinor: 95000,
    currency: "USD",
    retailerName: "Best Buy",
    retailerUrl: "https://bestbuy.com/laptop",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [
      {
        id: "off_usd",
        domain: "Best Buy",
        url: "https://bestbuy.com/laptop",
        priceMinor: 95000,
        currency: "USD",
        availability: "in_stock",
      },
    ],
  };
  ws = selectProductForItem(ws, laptopId, laptop, laptop.offers![0]);

  ws = addIndependentItem(ws, { productRequest: "Desk Lamp" });
  const lampId = ws.groups[0].items[1].id;
  const lamp: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "lamp_eur",
    title: "French Desk Lamp",
    imageUrl: null,
    priceMinor: 18000,
    currency: "EUR",
    retailerName: "FNAC",
    retailerUrl: "https://fnac.com/lamp",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [
      {
        id: "off_eur",
        domain: "FNAC",
        url: "https://fnac.com/lamp",
        priceMinor: 18000,
        currency: "EUR",
        availability: "in_stock",
      },
    ],
  };
  ws = selectProductForItem(ws, lampId, lamp, lamp.offers![0]);

  const summary = calculateWorkspaceBudgetSummary(ws, "USD");

  assert.strictEqual(summary.overallBudgetMinor, 100000);
  assert.strictEqual(summary.budgetCurrency, "USD");
  assert.strictEqual(summary.selectedTotalInBudgetCurrencyMinor, 95000);
  assert.strictEqual(summary.remainingMinor, 5000, "USD remaining budget is $50.00 (5000 cents)");
  assert.strictEqual(summary.status, "partially_comparable");
  assert.strictEqual(summary.isOverBudget, false);
  assert.strictEqual(summary.foreignCurrencyTotals["EUR"], 18000);
});

test("Test D: Mixed-currency group budgets (USD group and EUR group calculated independently)", () => {
  let ws = createInitialWorkspace({ currency: "USD" });

  // Group 1: USD Setup
  ws = createCoordinatedSetupGroup(ws, {
    title: "US Office Setup",
    sharedBudget: { amountMinor: 100000, currency: "USD", strict: true },
    items: [
      { productRequest: "Office Laptop", category: "computing" },
    ],
  });
  const g1Id = ws.groups[0].id;
  const g1Item = ws.groups[0].items[0];
  const prodUSD: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "p_usd",
    title: "US Laptop",
    imageUrl: null,
    priceMinor: 95000,
    currency: "USD",
    retailerName: "Best Buy",
    retailerUrl: "https://bestbuy.com/p",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [{ id: "o1", domain: "Best Buy", url: "https://bestbuy.com/p", priceMinor: 95000, currency: "USD", availability: "in_stock" }],
  };
  ws = selectProductForItem(ws, g1Item.id, prodUSD, prodUSD.offers![0]);

  // Group 2: EUR Setup
  ws = createCoordinatedSetupGroup(ws, {
    title: "EU Studio Setup",
    sharedBudget: { amountMinor: 50000, currency: "EUR", strict: true },
    items: [
      { productRequest: "Studio Monitor", category: "audio" },
    ],
  });
  const g2 = ws.groups.find((g) => g.title === "EU Studio Setup")!;
  const g2Item = g2.items[0];
  const prodEUR: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "p_eur",
    title: "EU Studio Monitor",
    imageUrl: null,
    priceMinor: 18000,
    currency: "EUR",
    retailerName: "Thomann",
    retailerUrl: "https://thomann.de/p",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [{ id: "o2", domain: "Thomann", url: "https://thomann.de/p", priceMinor: 18000, currency: "EUR", availability: "in_stock" }],
  };
  ws = selectProductForItem(ws, g2Item.id, prodEUR, prodEUR.offers![0]);

  const summary = calculateWorkspaceBudgetSummary(ws, "USD");

  // No aggregate budget obtained by combining USD $1000 and EUR €500
  assert.strictEqual(summary.overallBudgetMinor, null);

  const group1Summary = summary.groups.find((g) => g.groupId === g1Id)!;
  assert.strictEqual(group1Summary.currency, "USD");
  assert.strictEqual(group1Summary.allocatedBudgetMinor, 100000);
  assert.strictEqual(group1Summary.selectedTotalMinor, 95000);
  assert.strictEqual(group1Summary.remainingBudgetMinor, 5000);
  assert.strictEqual(group1Summary.status, "within_budget");

  const group2Summary = summary.groups.find((g) => g.groupId === g2.id)!;
  assert.strictEqual(group2Summary.currency, "EUR");
  assert.strictEqual(group2Summary.allocatedBudgetMinor, 50000);
  assert.strictEqual(group2Summary.selectedTotalMinor, 18000);
  assert.strictEqual(group2Summary.remainingBudgetMinor, 32000);
  assert.strictEqual(group2Summary.status, "within_budget");
});

test("Test E: Offer change (USD offer switched to EUR offer -> price, currency, URL update in lockstep)", () => {
  let ws = createInitialWorkspace({ currency: "USD" });
  ws = addIndependentItem(ws, { productRequest: "Ultrabook" });
  const itemId = ws.groups[0].items[0].id;

  const initialProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "ultrabook_global",
    title: "Global Ultrabook 14",
    imageUrl: null,
    priceMinor: 95000,
    currency: "USD",
    retailerName: "Best Buy US",
    retailerUrl: "https://bestbuy.com/ultrabook",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [
      {
        id: "off_us",
        domain: "bestbuy.com",
        url: "https://bestbuy.com/ultrabook",
        priceMinor: 95000,
        currency: "USD",
        availability: "in_stock",
      },
      {
        id: "off_fr",
        domain: "fnac.com",
        url: "https://fnac.com/ultrabook-fr",
        priceMinor: 85000,
        currency: "EUR",
        availability: "in_stock",
      },
    ],
  };

  // Initially selected with US offer
  ws = selectProductForItem(ws, itemId, initialProduct, initialProduct.offers![0]);
  let item = ws.groups[0].items[0];
  assert.strictEqual(item.selectedOffer?.currency, "USD");
  assert.strictEqual(item.selectedOffer?.priceMinor, 95000);

  // User selects the French EUR offer
  ws = selectOfferForItem(ws, itemId, "ultrabook_global", initialProduct.offers![1]);
  item = ws.groups[0].items[0];

  assert.strictEqual(item.selectedOffer?.currency, "EUR");
  assert.strictEqual(item.selectedOffer?.priceMinor, 85000);
  assert.strictEqual(item.selectedOffer?.url, "https://fnac.com/ultrabook-fr");
  assert.strictEqual(item.selectedProduct?.currency, "EUR");
  assert.strictEqual(item.selectedProduct?.priceMinor, 85000);
  assert.strictEqual(item.selectedProduct?.retailerUrl, "https://fnac.com/ultrabook-fr");
  assert.strictEqual(item.selectedProduct?.retailerName, "fnac.com");

  // Invalid offer rejection test: an offer from an unrelated product must be rejected
  const fakeOffer: ProductOfferItem = {
    id: "fake_off",
    domain: "scam.com",
    url: "https://scam.com/fake",
    priceMinor: 1000,
    currency: "USD",
    availability: "in_stock",
  };
  const prevRevision = ws.revision;
  const unchangedWs = selectOfferForItem(ws, itemId, "ultrabook_global", fakeOffer);
  assert.strictEqual(unchangedWs.revision, prevRevision, "Rejected invalid offer must return unchanged revision");
});

test("Test F: Variant price change (verified variant updates price, currency, URL in lockstep)", () => {
  let ws = createInitialWorkspace({ currency: "USD" });
  ws = addIndependentItem(ws, { productRequest: "Custom PC" });
  const itemId = ws.groups[0].items[0].id;

  const baseProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "dell_xps_15",
    title: "Dell XPS 15 (Base)",
    imageUrl: null,
    priceMinor: 120000,
    currency: "USD",
    retailerName: "Dell US",
    retailerUrl: "https://dell.com/base",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
    offers: [
      {
        id: "dell_base_off",
        domain: "dell.com",
        url: "https://dell.com/base",
        priceMinor: 120000,
        currency: "USD",
        availability: "in_stock",
      },
    ],
  };

  ws = selectProductForItem(ws, itemId, baseProduct, baseProduct.offers![0]);

  // Verified variant upgrade to 32GB RAM / 1TB SSD ($1,550.00 USD)
  const variantSelection: ProductVariantSelection = {
    productId: "dell_xps_15",
    title: "Dell XPS 15 (32GB RAM, 1TB SSD)",
    isConfirmed: true,
    confirmedPriceMinor: 155000,
    confirmedCurrency: "USD",
    confirmedRetailerUrl: "https://dell.com/upgraded-32gb",
    retailerName: "Dell US Official",
    selectedOptions: { RAM: "32GB", Storage: "1TB" },
  };

  ws = updateVariantForItem(ws, itemId, variantSelection);
  const updatedItem = ws.groups[0].items[0];

  assert.strictEqual(updatedItem.selectedProduct?.priceMinor, 155000);
  assert.strictEqual(updatedItem.selectedProduct?.currency, "USD");
  assert.strictEqual(updatedItem.selectedProduct?.title, "Dell XPS 15 (32GB RAM, 1TB SSD)");
  assert.strictEqual(updatedItem.selectedProduct?.retailerUrl, "https://dell.com/upgraded-32gb");
  assert.strictEqual(updatedItem.selectedOffer?.priceMinor, 155000);
  assert.strictEqual(updatedItem.selectedOffer?.currency, "USD");
  assert.strictEqual(updatedItem.selectedOffer?.url, "https://dell.com/upgraded-32gb");
});

test("Test G: Unknown currency (JPY/CAD not labeled as USD, excluded from supported totals)", () => {
  const rawChannel3Item = {
    title: "Sony Walkman JPY Edition",
    brand: "Sony",
    category: "audio",
    images: [{ url: "https://example.com/walkman.jpg" }],
    offers: [
      {
        url: "https://amazon.co.jp/walkman",
        domain: "amazon.co.jp",
        price: { price: 35000.0, currency: "JPY" },
        availability: "in_stock",
      },
    ],
  };

  const normalized = normalizeChannel3Product(
    rawChannel3Item as unknown as Parameters<typeof normalizeChannel3Product>[0],
    "USD"
  );
  assert.ok(normalized);
  assert.strictEqual(normalized.currency, "JPY");
  assert.strictEqual(normalized.isSupportedCurrency, false);
  assert.strictEqual(normalized.monetaryStatus, "unsupported_currency");
  assert.strictEqual(normalized.offers![0].currency, "JPY");
  assert.strictEqual(normalized.offers![0].isSupportedCurrency, false);
  assert.strictEqual(normalized.offers![0].monetaryStatus, "unsupported_currency");

  // Symbol for JPY must NEVER be "$" or "€" or "£"
  const symbol = getCurrencySymbol("JPY");
  assert.strictEqual(symbol, "JPY ");
  assert.notStrictEqual(symbol, "$");

  const formatted = formatMinorUnits(3500000, "JPY");
  assert.strictEqual(formatted, "JPY 35,000.00");

  // Add to workspace and calculate budget summary
  let ws = createInitialWorkspace({ currency: "USD" });
  ws = addIndependentItem(ws, { productRequest: "Walkman" });
  const itemId = ws.groups[0].items[0].id;
  ws = selectProductForItem(ws, itemId, normalized, normalized.offers![0]);

  const summary = calculateWorkspaceBudgetSummary(ws, "USD");
  assert.strictEqual(summary.unsupportedCurrencyCount, 1);
  assert.strictEqual(
    summary.totalsByCurrency["JPY" as CurrencyCode],
    undefined,
    "Unsupported currency must not be in supported totals"
  );
});

test("Test H: Currency missing (omitted currency marked missing/unavailable, never guessed)", () => {
  const rawChannel3ItemNoCurr = {
    title: "Mystery Retailer Gadget",
    offers: [
      {
        url: "https://mystery.com/gadget",
        domain: "mystery.com",
        price: { price: 49.99, currency: "" }, // Missing currency
        availability: "in_stock",
      },
    ],
  };

  const normalized = normalizeChannel3Product(
    rawChannel3ItemNoCurr as unknown as Parameters<typeof normalizeChannel3Product>[0],
    "USD"
  );
  assert.ok(normalized);
  assert.strictEqual(normalized.currency, "UNKNOWN");
  assert.strictEqual(normalized.isSupportedCurrency, false);
  assert.strictEqual(normalized.monetaryStatus, "missing_currency");
  assert.strictEqual(normalized.offers![0].currency, "UNKNOWN");
  assert.strictEqual(normalized.offers![0].isSupportedCurrency, false);
  assert.strictEqual(normalized.offers![0].monetaryStatus, "missing_currency");

  let ws = createInitialWorkspace({ currency: "USD" });
  ws = addIndependentItem(ws, { productRequest: "Mystery Gadget" });
  const itemId = ws.groups[0].items[0].id;
  ws = selectProductForItem(ws, itemId, normalized, normalized.offers![0]);

  const summary = calculateWorkspaceBudgetSummary(ws, "USD");
  assert.strictEqual(summary.unsupportedCurrencyCount, 1);
  assert.strictEqual(summary.totalsByCurrency["UNKNOWN" as CurrencyCode], undefined);
});

test("Test I: Money conversion (exact major/minor conversions, formatting, and zero/null handling)", () => {
  // $150 major -> 15000 minor
  assert.strictEqual(parseMajorToMinor(150), 15000);
  assert.strictEqual(parseMajorToMinor("150"), 15000);
  assert.strictEqual(parseMajorToMinor("$150.00"), 15000);

  // 15000 minor -> $150.00
  assert.strictEqual(formatMinorUnits(15000, "USD"), "$150.00");

  // $15,000 major -> 1500000 minor
  assert.strictEqual(parseMajorToMinor(15000), 1500000);
  assert.strictEqual(parseMajorToMinor("$15,000.00"), 1500000);

  // 1500000 minor -> $15,000.00
  assert.strictEqual(formatMinorUnits(1500000, "USD"), "$15,000.00");

  // formatMajorUnits
  assert.strictEqual(formatMajorUnits(150, "USD"), "$150.00");
  assert.strictEqual(formatMajorUnits(15000, "USD"), "$15,000.00");

  // formatBudgetMinor and formatBudgetMajor
  assert.strictEqual(formatBudgetMinor(15000, "USD"), "$150.00");
  assert.strictEqual(formatBudgetMinor(null, "USD"), "No budget limit");
  assert.strictEqual(formatBudgetMajor(150, "USD"), "$150.00");
  assert.strictEqual(formatBudgetMajor(null, "USD"), "No budget limit");

  // EUR conversions
  assert.strictEqual(formatMinorUnits(18000, "EUR"), "€180.00");
  assert.strictEqual(formatMajorUnits(180, "EUR"), "€180.00");
  assert.strictEqual(formatBudgetMinor(18000, "EUR"), "€180.00");

  // GBP conversions
  assert.strictEqual(formatMinorUnits(7500, "GBP"), "£75.00");
  assert.strictEqual(formatMajorUnits(75, "GBP"), "£75.00");
  assert.strictEqual(formatBudgetMinor(7500, "GBP"), "£75.00");

  // Zero / null handling
  assert.strictEqual(formatMinorUnits(0, "USD"), "$0.00");
  assert.strictEqual(formatMinorUnits(null, "USD"), "No budget limit");
  assert.strictEqual(formatMajorUnits(0, "USD"), "$0.00");
  assert.strictEqual(formatMajorUnits(null, "USD"), "No budget limit");

  // No double conversion roundtrip
  const originalMinor = 15000;
  const major = minorToMajorUnits(originalMinor); // 150
  assert.strictEqual(major, 150);
  const roundtripMinor = parseMajorToMinor(major); // 15000
  assert.strictEqual(roundtripMinor, originalMinor);
});

test("Test J: Individual item budget comparison (compareItemBudget handles currency mismatch)", () => {
  let ws = createInitialWorkspace({ currency: "USD" });
  ws = addIndependentItem(ws, { productRequest: "Target Laptop" });
  const item = ws.groups[0].items[0];

  // Configure individual item budget: $1,000 USD
  item.individualBudget = { amountMinor: 100000, currency: "USD", strict: true };

  // 1. Within budget ($950 USD)
  const usdProduct: NormalizedProduct = {
    source: "channel3",
    sourceProductId: "usd_p",
    title: "USD Laptop",
    imageUrl: null,
    priceMinor: 95000,
    currency: "USD",
    retailerName: "Retailer",
    retailerUrl: "https://retailer.com",
    availability: "in_stock",
    specifications: {},
    sourceFacts: [],
  };
  ws = selectProductForItem(ws, item.id, usdProduct);
  let cmp = compareItemBudget(ws.groups[0].items[0], "USD");
  assert.strictEqual(cmp.status, "within_budget");
  assert.strictEqual(cmp.remainingMinor, 5000);
  assert.strictEqual(cmp.isOverBudget, false);

  // 2. Over budget ($1,050 USD)
  const overProduct: NormalizedProduct = {
    ...usdProduct,
    priceMinor: 105000,
  };
  ws = selectProductForItem(ws, item.id, overProduct);
  cmp = compareItemBudget(ws.groups[0].items[0], "USD");
  assert.strictEqual(cmp.status, "over_budget");
  assert.strictEqual(cmp.remainingMinor, -5000);
  assert.strictEqual(cmp.isOverBudget, true);

  // 3. Different currency (€950 EUR) -> not_comparable!
  const eurProduct: NormalizedProduct = {
    ...usdProduct,
    currency: "EUR",
    priceMinor: 95000,
  };
  ws = selectProductForItem(ws, item.id, eurProduct);
  cmp = compareItemBudget(ws.groups[0].items[0], "USD");
  assert.strictEqual(cmp.status, "not_comparable");
  assert.strictEqual(cmp.remainingMinor, null);
  assert.strictEqual(cmp.isOverBudget, false);
  assert.ok(cmp.message?.includes("differs from individual budget currency"));
});
