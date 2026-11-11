import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  createCheckoutContextToken,
  verifyCheckoutContextToken,
  assertSandboxEnvironment,
  getPayPalCredentials,
} from "../src/lib/paypal/config.ts";
import {
  captureMultiSellerOrder,
  resetOrdersServiceState,
} from "../src/lib/paypal/orders-service.ts";
import {
  createInitialWorkspace,
  addIndependentItem,
  selectProductForItem,
  getActiveWorkspaceItem,
  setActiveWorkspaceItem,
  calculateWorkspaceBudgetSummary,
} from "../src/lib/workspace/workspace-manager.ts";
import { shoppingRecommendRequestSchema } from "../src/app/api/shopping/recommend/route.ts";
import { selectRetailerOffer } from "../src/lib/shopping/offer-verification.ts";
import type { NormalizedProduct } from "../src/types/index.ts";

describe("SpendPilot AI: Release-Hardening Automated Regression Suite", () => {
  const originalEnv = { ...process.env };
  const TEST_SIGNING_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    resetOrdersServiceState();
    process.env.PAYPAL_ENV = "sandbox";
    process.env.PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";
    process.env.PAYPAL_CLIENT_ID = "SANDBOX_CLIENT_ID_TEST";
    process.env.PAYPAL_CLIENT_SECRET = "SANDBOX_CLIENT_SECRET_TEST";
    process.env.PAYPAL_CHECKOUT_SIGNING_SECRET = TEST_SIGNING_SECRET;
    process.env.PAYPAL_DEMO_SELLER_A_MERCHANT_ID = "MERCHANT_SELLER_A_123";
    process.env.PAYPAL_DEMO_SELLER_A_EMAIL = "seller_a@spendpilot.test";
    process.env.PAYPAL_DEMO_SELLER_B_MERCHANT_ID = "MERCHANT_SELLER_B_456";
    process.env.PAYPAL_DEMO_SELLER_B_EMAIL = "seller_b@spendpilot.test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetOrdersServiceState();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. PayPal Signing Secret & Cryptographic Verification
  // ─────────────────────────────────────────────────────────────────────────────

  test("1.1 Missing signing secret throws configuration error and refuses to sign", () => {
    delete process.env.PAYPAL_CHECKOUT_SIGNING_SECRET;
    assert.throws(
      () => {
        createCheckoutContextToken({
          orderId: "ORD-TEST-1",
          sellerMerchantIds: ["MERCHANT_SELLER_A_123"],
          totalMinor: 10000,
          currency: "USD",
        });
      },
      (err: Error) => {
        return (
          err.message.includes("PAYPAL_CHECKOUT_SIGNING_SECRET") &&
          err.message.includes("Refusing to sign checkout tokens")
        );
      }
    );
  });

  test("1.2 Valid signing secret creates token that verifies accurately", () => {
    const token = createCheckoutContextToken({
      orderId: "ORD-TEST-VALID",
      sellerMerchantIds: ["MERCHANT_SELLER_A_123", "MERCHANT_SELLER_B_456"],
      totalMinor: 23800,
      currency: "USD",
    });

    assert.ok(token);
    assert.strictEqual(typeof token, "string");

    const verified = verifyCheckoutContextToken(token);
    assert.ok(verified);
    assert.strictEqual(verified.orderId, "ORD-TEST-VALID");
    assert.strictEqual(verified.totalMinor, 23800);
    assert.strictEqual(verified.currency, "USD");
    assert.deepStrictEqual(verified.sellerMerchantIds, [
      "MERCHANT_SELLER_A_123",
      "MERCHANT_SELLER_B_456",
    ]);
  });

  test("1.3 Tampered tokens with altered payloads or invalid HMAC fail verification", () => {
    const token = createCheckoutContextToken({
      orderId: "ORD-TEST-TAMPER",
      sellerMerchantIds: ["MERCHANT_SELLER_A_123"],
      totalMinor: 10000,
      currency: "USD",
    });

    const [payloadB64, sig] = token.split(".");

    // Alter the payload: change totalMinor from 10000 to 100
    const rawPayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    rawPayload.totalMinor = 100;
    const alteredPayloadB64 = Buffer.from(JSON.stringify(rawPayload)).toString("base64url");
    const tamperedToken = `${alteredPayloadB64}.${sig}`;

    assert.strictEqual(verifyCheckoutContextToken(tamperedToken), null);

    // Alter the signature
    const corruptSigToken = `${payloadB64}.corrupted_signature_xyz`;
    assert.strictEqual(verifyCheckoutContextToken(corruptSigToken), null);

    // Completely bogus token
    assert.strictEqual(verifyCheckoutContextToken("bogus.token"), null);
    assert.strictEqual(verifyCheckoutContextToken(""), null);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. PayPal Endpoint & Sandbox Domain Validation
  // ─────────────────────────────────────────────────────────────────────────────

  test("2.1 Non-HTTPS and non-sandbox PayPal endpoints are strictly rejected", () => {
    // Non-https
    assert.throws(
      () => assertSandboxEnvironment("http://api-m.sandbox.paypal.com"),
      /HTTPS/
    );

    // Production PayPal domain
    assert.throws(
      () => assertSandboxEnvironment("https://api-m.paypal.com"),
      /Sandbox/
    );

    // Third-party or phishing domain
    assert.throws(
      () => assertSandboxEnvironment("https://api-m.sandbox.paypal.com.evil.com"),
      /Sandbox/
    );

    // Exact sandbox endpoint passes without throwing
    assert.doesNotThrow(() =>
      assertSandboxEnvironment("https://api-m.sandbox.paypal.com")
    );
  });

  test("2.2 Mismatched PAYPAL_CLIENT_ID and NEXT_PUBLIC_PAYPAL_CLIENT_ID are strictly rejected", () => {
    process.env.PAYPAL_CLIENT_ID = "SERVER_SANDBOX_ID_1";
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID = "DIFFERENT_PUBLIC_SANDBOX_ID_2";

    assert.throws(
      () => getPayPalCredentials(),
      /Configuration Error: PAYPAL_CLIENT_ID and NEXT_PUBLIC_PAYPAL_CLIENT_ID do not match/
    );

    // When identical, it passes safely
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID = "SERVER_SANDBOX_ID_1";
    assert.doesNotThrow(() => getPayPalCredentials());
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. PayPal Seller Reconciliation & Partial Captures
  // ─────────────────────────────────────────────────────────────────────────────

  test("3.1 Reconciles Seller A and Seller B with verified merchant IDs", async () => {
    const orderId = "ORD-SPLIT-SUCCESS";
    const checkoutToken = createCheckoutContextToken({
      orderId,
      sellerMerchantIds: ["MERCHANT_SELLER_A_123", "MERCHANT_SELLER_B_456"],
      totalMinor: 23800,
      currency: "USD",
    });

    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          id: orderId,
          status: "COMPLETED",
          purchase_units: [
            {
              reference_id: "seller_a_ref_123",
              payee: { merchant_id: "MERCHANT_SELLER_A_123" },
              amount: { currency_code: "USD", value: "149.00" },
              payments: { captures: [{ id: "CAP-A", status: "COMPLETED" }] },
            },
            {
              reference_id: "seller_b_ref_456",
              payee: { merchant_id: "MERCHANT_SELLER_B_456" },
              amount: { currency_code: "USD", value: "89.00" },
              payments: { captures: [{ id: "CAP-B", status: "COMPLETED" }] },
            },
          ],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    const result = await captureMultiSellerOrder({
      orderId,
      checkoutToken,
      customFetch: mockFetch as unknown as typeof fetch,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.overallStatus, "COMPLETED");
    assert.strictEqual(result.sellerCaptures.length, 2);
    assert.strictEqual(result.sellerCaptures[0].sellerId, "seller_a");
    assert.strictEqual(result.sellerCaptures[0].status, "COMPLETED");
    assert.strictEqual(result.sellerCaptures[1].sellerId, "seller_b");
    assert.strictEqual(result.sellerCaptures[1].status, "COMPLETED");
  });

  test("3.2 Unknown purchase unit reference is NOT attributed to Seller A and marks unit as FAILED", async () => {
    const orderId = "ORD-UNKNOWN-UNIT";
    const checkoutToken = createCheckoutContextToken({
      orderId,
      sellerMerchantIds: ["MERCHANT_SELLER_A_123"],
      totalMinor: 10000,
      currency: "USD",
    });

    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          id: orderId,
          status: "COMPLETED",
          purchase_units: [
            {
              reference_id: "corrupted_or_attacker_unit_999",
              payee: { merchant_id: "UNREGISTERED_ROGUE_MERCHANT" },
              amount: { currency_code: "USD", value: "100.00" },
              payments: { captures: [{ id: "CAP-ROGUE", status: "COMPLETED" }] },
            },
          ],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    const result = await captureMultiSellerOrder({
      orderId,
      checkoutToken,
      customFetch: mockFetch as unknown as typeof fetch,
    });

    assert.strictEqual(result.sellerCaptures.length, 1);
    const unit = result.sellerCaptures[0];

    // Must NOT be attributed to seller_a
    assert.notStrictEqual(unit.sellerId, "seller_a");
    assert.strictEqual(unit.sellerId, "unknown");
    assert.strictEqual(unit.status, "FAILED");
    assert.ok(unit.errorMessage?.includes("unregistered"));
    assert.strictEqual(result.overallStatus, "FAILED");
    assert.strictEqual(result.success, false);
  });

  test("3.3 Mismatched payee merchant ID marks unit as FAILED without attributing to Seller A", async () => {
    const orderId = "ORD-PAYEE-MISMATCH";
    const checkoutToken = createCheckoutContextToken({
      orderId,
      sellerMerchantIds: ["MERCHANT_SELLER_A_123"],
      totalMinor: 14900,
      currency: "USD",
    });

    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          id: orderId,
          status: "COMPLETED",
          purchase_units: [
            {
              reference_id: "seller_a_ref_123",
              payee: { merchant_id: "DIFFERENT_HIJACKED_MERCHANT_ID" },
              amount: { currency_code: "USD", value: "149.00" },
              payments: { captures: [{ id: "CAP-A", status: "COMPLETED" }] },
            },
          ],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    const result = await captureMultiSellerOrder({
      orderId,
      checkoutToken,
      customFetch: mockFetch as unknown as typeof fetch,
    });

    assert.strictEqual(result.sellerCaptures.length, 1);
    const unit = result.sellerCaptures[0];
    assert.strictEqual(unit.status, "FAILED");
    assert.ok(unit.errorMessage?.includes("Payee merchant ID mismatch"));
    assert.strictEqual(result.overallStatus, "FAILED");
  });

  test("3.4 HTTP 207 returns PARTIALLY_COMPLETED when one seller succeeds and another fails", async () => {
    const orderId = "ORD-PARTIAL-SPLIT";
    const checkoutToken = createCheckoutContextToken({
      orderId,
      sellerMerchantIds: ["MERCHANT_SELLER_A_123", "MERCHANT_SELLER_B_456"],
      totalMinor: 23800,
      currency: "USD",
    });

    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          id: orderId,
          status: "PARTIALLY_COMPLETED",
          purchase_units: [
            {
              reference_id: "seller_a_ref_ok",
              payee: { merchant_id: "MERCHANT_SELLER_A_123" },
              amount: { currency_code: "USD", value: "149.00" },
              payments: { captures: [{ id: "CAP-A-OK", status: "COMPLETED" }] },
            },
            {
              reference_id: "seller_b_ref_declined",
              payee: { merchant_id: "MERCHANT_SELLER_B_456" },
              amount: { currency_code: "USD", value: "89.00" },
              payments: { captures: [{ id: "CAP-B-FAIL", status: "DECLINED" }] },
            },
          ],
        }),
        { status: 207, headers: { "Content-Type": "application/json" } }
      );
    };

    const result = await captureMultiSellerOrder({
      orderId,
      checkoutToken,
      customFetch: mockFetch as unknown as typeof fetch,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.overallStatus, "PARTIALLY_COMPLETED");
    assert.strictEqual(result.sellerCaptures[0].status, "COMPLETED");
    assert.strictEqual(result.sellerCaptures[1].status, "DECLINED");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Product Search State & Multi-Item Workspace Isolation
  // ─────────────────────────────────────────────────────────────────────────────

  test("4.1 Searching for Item A and Item B maintains isolated candidates per item", () => {
    let ws = createInitialWorkspace({ currency: "USD" });

    // Add Item A (Ergonomic Chair)
    ws = addIndependentItem(ws, {
      productRequest: "Ergonomic Office Chair",
      category: "furniture",
      displayName: "Ergonomic Office Chair",
    });
    const itemAId = ws.activeItemId!;
    assert.ok(itemAId);

    // Mock candidates for Item A
    const chairCandidates: NormalizedProduct[] = [
      {
        sourceProductId: "CHAIR-1",
        title: "Steelcase Gesture Chair",
        priceMinor: 120000,
        currency: "USD",
        source: "channel3",
        sourceFacts: [],
        availability: "in_stock",
        imageUrl: "https://example.com/chair.jpg",
        retailerName: "Steelcase",
        retailerUrl: "https://steelcase.com/chair",
        specifications: {},
      },
    ];

    // Assign candidates to Item A
    ws = {
      ...ws,
      groups: ws.groups.map((g) => ({
        ...g,
        items: g.items.map((i) =>
          i.id === itemAId
            ? { ...i, candidates: chairCandidates, searchStatus: "completed" as const }
            : i
        ),
      })),
    };

    // Add Item B (Wireless Headphones)
    ws = addIndependentItem(ws, {
      productRequest: "Noise Cancelling Headphones",
      category: "electronics",
      displayName: "Noise Cancelling Headphones",
    });
    const itemBId = ws.activeItemId!;
    assert.notStrictEqual(itemAId, itemBId);

    // Mock candidates for Item B
    const headphoneCandidates: NormalizedProduct[] = [
      {
        sourceProductId: "HEADPHONE-1",
        title: "Sony WH-1000XM5",
        priceMinor: 34900,
        currency: "USD",
        source: "channel3",
        sourceFacts: [],
        availability: "in_stock",
        imageUrl: "https://example.com/sony.jpg",
        retailerName: "Sony",
        retailerUrl: "https://sony.com/xm5",
        specifications: {},
      },
    ];

    ws = {
      ...ws,
      groups: ws.groups.map((g) => ({
        ...g,
        items: g.items.map((i) =>
          i.id === itemBId
            ? { ...i, candidates: headphoneCandidates, searchStatus: "completed" as const }
            : i
        ),
      })),
    };

    // Verify Item A still holds only chair candidates
    const itemA = ws.groups[0].items.find((i) => i.id === itemAId);
    assert.strictEqual(itemA?.candidates.length, 1);
    assert.strictEqual(itemA?.candidates[0].sourceProductId, "CHAIR-1");

    // Verify Item B holds only headphone candidates
    const itemB = ws.groups[0].items.find((i) => i.id === itemBId);
    assert.strictEqual(itemB?.candidates.length, 1);
    assert.strictEqual(itemB?.candidates[0].sourceProductId, "HEADPHONE-1");

    // Switching active item to Item A scopes active workspace item to Item A
    ws = setActiveWorkspaceItem(ws, itemAId);
    assert.strictEqual(ws.activeItemId, itemAId);
    const activeItemA = getActiveWorkspaceItem(ws);
    assert.strictEqual(activeItemA?.id, itemAId);
    assert.strictEqual(activeItemA?.candidates[0].sourceProductId, "CHAIR-1");

    // Switching active item to Item B scopes active workspace item to Item B
    ws = setActiveWorkspaceItem(ws, itemBId);
    assert.strictEqual(ws.activeItemId, itemBId);
    const activeItemB = getActiveWorkspaceItem(ws);
    assert.strictEqual(activeItemB?.id, itemBId);
    assert.strictEqual(activeItemB?.candidates[0].sourceProductId, "HEADPHONE-1");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Selected Offer & Variant Persistence
  // ─────────────────────────────────────────────────────────────────────────────

  test("5.1 Selected offer and variant persist accurately into workspace item and calculate totals", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, {
      productRequest: "MacBook Air M2",
      category: "computers",
    });
    const itemId = ws.activeItemId!;

    const mockProduct: NormalizedProduct = {
      sourceProductId: "MAC-1",
      title: "Apple MacBook Air M2",
      priceMinor: 119900,
      currency: "USD",
      source: "channel3",
      sourceFacts: [],
      availability: "in_stock",
      imageUrl: "https://example.com/mac.jpg",
      retailerName: "Best Buy",
      retailerUrl: "https://bestbuy.com/macbook",
      specifications: {},
      offers: [
        {
          domain: "bestbuy.com",
          url: "https://bestbuy.com/macbook",
          priceMinor: 119900,
          currency: "USD",
          availability: "in_stock",
        },
        {
          domain: "bhphotovideo.com",
          url: "https://bhphotovideo.com/macbook-sale",
          priceMinor: 109900,
          currency: "USD",
          availability: "in_stock",
        },
      ],
    };

    // User selects the lower priced B&H offer ($1,099.00)
    const selectedOffer = mockProduct.offers![1];
    const selectedVariant = { Color: "Midnight", Storage: "512GB" };

    ws = selectProductForItem(ws, itemId, mockProduct, selectedOffer, selectedVariant);

    const updatedItem = getActiveWorkspaceItem(ws);
    assert.ok(updatedItem);
    assert.strictEqual(updatedItem.status, "selected");
    assert.strictEqual(updatedItem.selectedOffer?.domain, "bhphotovideo.com");
    assert.strictEqual(updatedItem.selectedOffer?.priceMinor, 109900);
    assert.deepStrictEqual(updatedItem.selectedVariant, selectedVariant);

    // Workspace budget summary derives subtotal from the selected offer ($1,099.00)
    const summary = calculateWorkspaceBudgetSummary(ws, "USD");
    assert.strictEqual(summary.totalSelectedMinor, 109900);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Shopping Recommend API Zod Validation
  // ─────────────────────────────────────────────────────────────────────────────

  test("6.1 Recommend API rejects empty queries or missing products", () => {
    // Missing query
    const invalidQuery = shoppingRecommendRequestSchema.safeParse({
      query: "   ",
      products: [{ title: "Product 1" }],
    });
    assert.strictEqual(invalidQuery.success, false);

    // Empty products array
    const emptyProducts = shoppingRecommendRequestSchema.safeParse({
      query: "laptop",
      products: [],
    });
    assert.strictEqual(emptyProducts.success, false);

    // Non-array products
    const invalidProducts = shoppingRecommendRequestSchema.safeParse({
      query: "laptop",
      products: "not-an-array",
    });
    assert.strictEqual(invalidProducts.success, false);

    // Valid recommend payload passes
    const valid = shoppingRecommendRequestSchema.safeParse({
      query: "ergonomic office chair",
      products: [
        {
          title: "Steelcase Gesture",
          priceMinor: 120000,
          currency: "USD",
        },
      ],
      budget: 1300,
      currency: "USD",
    });
    assert.strictEqual(valid.success, true);
    if (valid.success) {
      assert.strictEqual(valid.data.query, "ergonomic office chair");
      assert.strictEqual(valid.data.products.length, 1);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Offer Selection Mutation Helper
  // ─────────────────────────────────────────────────────────────────────────────

  test("7.1 selectRetailerOffer updates product selectedOffer and binds confirmed price", () => {
    const product: NormalizedProduct = {
      sourceProductId: "PROD-1",
      title: "Test Running Shoe",
      priceMinor: 14000,
      currency: "USD",
      source: "channel3",
      sourceFacts: [],
      availability: "in_stock",
      imageUrl: "https://example.com/shoe.jpg",
      retailerName: "Nike",
      retailerUrl: "https://nike.com/shoe-1",
      specifications: {},
      offers: [
        {
          domain: "nike.com",
          url: "https://nike.com/shoe-1",
          priceMinor: 14000,
          currency: "USD",
          availability: "in_stock",
          verificationStatus: "verified",
        },
        {
          domain: "dickssportinggoods.com",
          url: "https://dickssportinggoods.com/shoe-1",
          priceMinor: 12500,
          currency: "USD",
          availability: "in_stock",
          verificationStatus: "verified",
        },
      ],
    };

    const updated = selectRetailerOffer(product, "https://dickssportinggoods.com/shoe-1");
    assert.strictEqual(updated.selectedOffer?.domain, "dickssportinggoods.com");
    assert.strictEqual(updated.selectedOffer?.priceMinor, 12500);
    assert.strictEqual(updated.priceMinor, 12500);
  });
});
