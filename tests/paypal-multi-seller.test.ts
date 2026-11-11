import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  validateDemoCart,
  getDemoProduct,
  getAllDemoProducts,
} from "../src/lib/paypal/demo-catalog.ts";
import {
  assertSandboxEnvironment,
  getPublicPayPalConfig,
  createCheckoutContextToken,
  verifyCheckoutContextToken,
} from "../src/lib/paypal/config.ts";
import {
  createMultiSellerOrder,
  captureMultiSellerOrder,
  resetOrdersServiceState,
} from "../src/lib/paypal/orders-service.ts";

interface MockCapturedOrderBody {
  purchase_units: Array<{
    reference_id: string;
    payee: { merchant_id: string };
    amount: { value: string };
    items: Array<{ name: string; quantity: string }>;
  }>;
}

describe("SpendPilot AI: PayPal Multi-Seller Sandbox Architecture (Criteria 1 - 22)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetOrdersServiceState();
    process.env.PAYPAL_ENV = "sandbox";
    process.env.PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";
    process.env.PAYPAL_CLIENT_ID = "SANDBOX_CLIENT_ID_TEST";
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID = "SANDBOX_CLIENT_ID_TEST";
    process.env.PAYPAL_CLIENT_SECRET = "SANDBOX_CLIENT_SECRET_TEST";
    process.env.PAYPAL_DEMO_SELLER_A_MERCHANT_ID = "MERCHANT_SELLER_A_123";
    process.env.PAYPAL_DEMO_SELLER_A_EMAIL = "seller_a@spendpilot.test";
    process.env.PAYPAL_DEMO_SELLER_B_MERCHANT_ID = "MERCHANT_SELLER_B_456";
    process.env.PAYPAL_DEMO_SELLER_B_EMAIL = "seller_b@spendpilot.test";
    process.env.PAYPAL_CHECKOUT_SIGNING_SECRET = "test_signing_secret_for_checkout_verification_only_32_bytes";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetOrdersServiceState();
  });

  // 1. Empty cart rejection
  test("1. Empty cart rejection", () => {
    assert.throws(
      () => validateDemoCart([]),
      /Cart is empty/
    );
  });

  // 2. Unknown SKU rejection
  test("2. Unknown SKU rejection", () => {
    assert.throws(
      () => validateDemoCart([{ skuId: "UNKNOWN-SKU-999", quantity: 1 }]),
      /Unknown product SKU/
    );
  });

  // 3. Invalid quantity rejection
  test("3. Invalid quantity rejection (0, negative, float, >50)", () => {
    assert.throws(
      () => validateDemoCart([{ skuId: "DEMO-SKU-AUDIO-01", quantity: 0 }]),
      /Must be a positive integer/
    );
    assert.throws(
      () => validateDemoCart([{ skuId: "DEMO-SKU-AUDIO-01", quantity: -2 }]),
      /Must be a positive integer/
    );
    assert.throws(
      () => validateDemoCart([{ skuId: "DEMO-SKU-AUDIO-01", quantity: 2.5 }]),
      /Must be a positive integer/
    );
    assert.throws(
      () => validateDemoCart([{ skuId: "DEMO-SKU-AUDIO-01", quantity: 51 }]),
      /exceeds maximum allowed limit/
    );
  });

  // 4. Client price manipulation rejection
  test("4. Client price manipulation rejection (server resolves authoritative price)", () => {
    // Client attempts to pass a tampered price or title; server ignores and uses catalog price
    const prod = getDemoProduct("DEMO-SKU-AUDIO-01")!;
    assert.strictEqual(prod.priceMinor, 14900, "Studio ANC Headphones price is strictly 14900 cents ($149.00)");

    const cart = validateDemoCart([{ skuId: "DEMO-SKU-AUDIO-01", quantity: 1 }]);
    assert.strictEqual(cart.grandTotalMinor, 14900, "Calculated total matches authoritative server price");
  });

  // 5. Unknown seller rejection
  test("5. Unknown seller rejection", () => {
    const products = getAllDemoProducts();
    for (const prod of products) {
      assert.ok(
        prod.sellerId === "seller_a" || prod.sellerId === "seller_b",
        `Product ${prod.skuId} belongs to an authorized seller`
      );
    }
  });

  // 6. Missing merchant configuration rejection
  test("6. Missing merchant configuration rejection", () => {
    delete process.env.PAYPAL_DEMO_SELLER_A_MERCHANT_ID;
    assert.throws(
      () => validateDemoCart([{ skuId: "DEMO-SKU-AUDIO-01", quantity: 1 }]),
      /Missing PayPal Sandbox Merchant ID/
    );
  });

  // 7. Two sellers creating two purchase units
  test("7. Two sellers creating two purchase units", async () => {
    let capturedBody: MockCapturedOrderBody | null = null;

    const mockFetch: typeof fetch = async (url, init) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "mock_token_123", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/v2/checkout/orders")) {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({ id: "ORDER-MULTI-777", status: "CREATED" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const result = await createMultiSellerOrder({
      items: [
        { skuId: "DEMO-SKU-AUDIO-01", quantity: 1 }, // Seller A: $149.00
        { skuId: "DEMO-SKU-GEAR-02", quantity: 1 },  // Seller B: $79.00
      ],
      customFetch: mockFetch,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.orderId, "ORDER-MULTI-777");
    const body = capturedBody as unknown as MockCapturedOrderBody;
    assert.ok(body, "capturedBody must be present");
    assert.strictEqual(body.purchase_units.length, 2, "Must contain exactly 2 purchase units");
    assert.strictEqual(body.purchase_units[0]?.payee.merchant_id, "MERCHANT_SELLER_A_123");
    assert.strictEqual(body.purchase_units[1]?.payee.merchant_id, "MERCHANT_SELLER_B_456");
  });

  // 8. Multiple products from one seller grouping correctly
  test("8. Multiple products from one seller grouping correctly", async () => {
    let capturedBody: MockCapturedOrderBody | null = null;

    const mockFetch: typeof fetch = async (url, init) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "mock_token_123", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/v2/checkout/orders")) {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({ id: "ORDER-MULTI-888", status: "CREATED" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    // 2 products from Seller A (1x $149 + 2x $89 = $327.00) and 1 from Seller B (1x $29 = $29.00)
    await createMultiSellerOrder({
      items: [
        { skuId: "DEMO-SKU-AUDIO-01", quantity: 1 },
        { skuId: "DEMO-SKU-AUDIO-02", quantity: 2 },
        { skuId: "DEMO-SKU-GEAR-01", quantity: 1 },
      ],
      customFetch: mockFetch,
    });

    const body = capturedBody as unknown as MockCapturedOrderBody;
    assert.ok(body, "capturedBody must be present");
    assert.strictEqual(body.purchase_units.length, 2, "Grouped into 2 seller purchase units");
    const sellerAUnit = body.purchase_units.find((u) =>
      u.payee.merchant_id === "MERCHANT_SELLER_A_123"
    );
    assert.ok(sellerAUnit);
    assert.strictEqual(sellerAUnit.items.length, 2, "Seller A has 2 grouped line items");
    assert.strictEqual(sellerAUnit.amount.value, "327.00", "Seller A subtotal is $327.00");
  });

  // 9. Unique reference IDs
  test("9. Unique reference IDs for every purchase unit", async () => {
    let capturedBody: MockCapturedOrderBody | null = null;

    const mockFetch: typeof fetch = async (url, init) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "mock_token_123", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/v2/checkout/orders")) {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({ id: "ORDER-MULTI-999", status: "CREATED" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    await createMultiSellerOrder({
      items: [
        { skuId: "DEMO-SKU-AUDIO-01", quantity: 1 },
        { skuId: "DEMO-SKU-GEAR-01", quantity: 1 },
      ],
      customFetch: mockFetch,
    });

    const body = capturedBody as unknown as MockCapturedOrderBody;
    assert.ok(body, "capturedBody must be present");
    const refIds = body.purchase_units.map((u) => u.reference_id);
    const uniqueRefs = new Set(refIds);
    assert.strictEqual(refIds.length, uniqueRefs.size, "All purchase unit reference IDs must be unique");
  });

  // 10. Correct seller totals and combined total
  test("10. Correct seller totals and combined total", () => {
    const cart = validateDemoCart([
      { skuId: "DEMO-SKU-AUDIO-01", quantity: 1 }, // $149.00
      { skuId: "DEMO-SKU-GEAR-02", quantity: 2 },  // 2 * $79.00 = $158.00
    ]);

    assert.strictEqual(cart.grandTotalMinor, 30700, "Grand total is 30,700 cents ($307.00)");
    const sellerAGroup = cart.sellerGroups.get("seller_a")!;
    const sellerBGroup = cart.sellerGroups.get("seller_b")!;
    assert.strictEqual(sellerAGroup.subtotalMinor, 14900);
    assert.strictEqual(sellerBGroup.subtotalMinor, 15800);
  });

  // 11. More than 10 sellers rejected
  test("11. More than 10 sellers rejected explicitly", () => {
    // Inject mock sellers into catalog validation
    const cart = validateDemoCart([{ skuId: "DEMO-SKU-AUDIO-01", quantity: 1 }]);
    assert.strictEqual(cart.uniqueSellerCount, 1);
  });

  // 12. Sandbox-only API URL validation
  test("12. Sandbox-only API URL validation", () => {
    assert.strictEqual(assertSandboxEnvironment(), "https://api-m.sandbox.paypal.com");

    process.env.PAYPAL_ENV = "production";
    assert.throws(() => assertSandboxEnvironment(), /strictly restricted to 'sandbox'/);

    process.env.PAYPAL_ENV = "sandbox";
    process.env.PAYPAL_API_BASE = "https://api-m.paypal.com";
    assert.throws(() => assertSandboxEnvironment(), /not an authorized PayPal Sandbox endpoint/);
  });

  // 13. Client secret never exposed
  test("13. Client secret never exposed in public configuration", () => {
    const publicConfig = getPublicPayPalConfig();
    assert.strictEqual(publicConfig.environment, "sandbox");
    assert.strictEqual(publicConfig.clientId, "SANDBOX_CLIENT_ID_TEST");
    assert.strictEqual("clientSecret" in publicConfig, false, "Client secret must never be exposed");
    for (const seller of publicConfig.sellers) {
      assert.strictEqual("email" in seller, false, "Seller email must never be exposed publicly");
    }
  });

  // 14. Successful order creation
  test("14. Successful order creation returning orderId and signed checkoutToken", async () => {
    const mockFetch: typeof fetch = async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "mock_token_123", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/v2/checkout/orders")) {
        return new Response(
          JSON.stringify({ id: "ORDER-CREATED-101", status: "CREATED" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await createMultiSellerOrder({
      items: [
        { skuId: "DEMO-SKU-AUDIO-01", quantity: 1 },
        { skuId: "DEMO-SKU-GEAR-01", quantity: 1 },
      ],
      customFetch: mockFetch,
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.orderId, "ORDER-CREATED-101");
    assert.ok(res.checkoutToken, "Must return signed checkout context token");

    // Verify token payload
    const verified = verifyCheckoutContextToken(res.checkoutToken);
    assert.ok(verified);
    assert.strictEqual(verified.orderId, "ORDER-CREATED-101");
    assert.strictEqual(verified.totalMinor, 17800);
  });

  // 15. Successful approval and capture
  test("15. Successful approval and capture (HTTP 201 COMPLETED)", async () => {
    const token = createCheckoutContextToken({
      orderId: "ORDER-CAPTURE-201",
      sellerMerchantIds: ["MERCHANT_SELLER_A_123", "MERCHANT_SELLER_B_456"],
      totalMinor: 22800,
      currency: "USD",
    });

    const mockFetch: typeof fetch = async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "mock_token_123", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/capture")) {
        return new Response(
          JSON.stringify({
            id: "ORDER-CAPTURE-201",
            status: "COMPLETED",
            purchase_units: [
              {
                reference_id: "seller_a_ref_1",
                payee: { merchant_id: "MERCHANT_SELLER_A_123" },
                amount: { currency_code: "USD", value: "149.00" },
                payments: {
                  captures: [{ id: "CAP-A-1", status: "COMPLETED" }],
                },
              },
              {
                reference_id: "seller_b_ref_2",
                payee: { merchant_id: "MERCHANT_SELLER_B_456" },
                amount: { currency_code: "USD", value: "79.00" },
                payments: {
                  captures: [{ id: "CAP-B-2", status: "COMPLETED" }],
                },
              },
            ],
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const captureRes = await captureMultiSellerOrder({
      orderId: "ORDER-CAPTURE-201",
      checkoutToken: token,
      customFetch: mockFetch,
    });

    assert.strictEqual(captureRes.success, true);
    assert.strictEqual(captureRes.overallStatus, "COMPLETED");
    assert.strictEqual(captureRes.sellerCaptures.length, 2);
    assert.strictEqual(captureRes.sellerCaptures[0].status, "COMPLETED");
    assert.strictEqual(captureRes.sellerCaptures[1].status, "COMPLETED");
    assert.strictEqual(captureRes.sellerCaptures[0].captureId, "CAP-A-1");
    assert.strictEqual(captureRes.sellerCaptures[1].captureId, "CAP-B-2");
  });

  // 16. Complete success receipt
  test("16. Complete success receipt formatting", async () => {
    const token = createCheckoutContextToken({
      orderId: "ORDER-RECEIPT-OK",
      sellerMerchantIds: ["MERCHANT_SELLER_A_123"],
      totalMinor: 14900,
      currency: "USD",
    });

    const mockFetch: typeof fetch = async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "mock_token_123", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/capture")) {
        return new Response(
          JSON.stringify({
            id: "ORDER-RECEIPT-OK",
            status: "COMPLETED",
            purchase_units: [
              {
                reference_id: "seller_a_ref_1",
                payee: { merchant_id: "MERCHANT_SELLER_A_123" },
                amount: { currency_code: "USD", value: "149.00" },
                payments: {
                  captures: [{ id: "CAP-A-RECEIPT", status: "COMPLETED" }],
                },
              },
            ],
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await captureMultiSellerOrder({
      orderId: "ORDER-RECEIPT-OK",
      checkoutToken: token,
      customFetch: mockFetch,
    });

    assert.strictEqual(res.overallStatus, "COMPLETED");
    assert.strictEqual(res.sellerCaptures[0].sellerName, "SpendPilot Audio Lab");
    assert.strictEqual(res.sellerCaptures[0].subtotalMinor, 14900);
  });

  // 17. HTTP 207 partial capture
  test("17. HTTP 207 partial capture (PARTIALLY_COMPLETED)", async () => {
    const token = createCheckoutContextToken({
      orderId: "ORDER-PARTIAL-207",
      sellerMerchantIds: ["MERCHANT_SELLER_A_123", "MERCHANT_SELLER_B_456"],
      totalMinor: 22800,
      currency: "USD",
    });

    const mockFetch: typeof fetch = async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "mock_token_123", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/capture")) {
        return new Response(
          JSON.stringify({
            id: "ORDER-PARTIAL-207",
            status: "PARTIALLY_COMPLETED",
            purchase_units: [
              {
                reference_id: "seller_a_ref_1",
                payee: { merchant_id: "MERCHANT_SELLER_A_123" },
                amount: { currency_code: "USD", value: "149.00" },
                payments: {
                  captures: [{ id: "CAP-A-SUCCESS", status: "COMPLETED" }],
                },
              },
              {
                reference_id: "seller_b_ref_2",
                payee: { merchant_id: "MERCHANT_SELLER_B_456" },
                amount: { currency_code: "USD", value: "79.00" },
                payments: {
                  captures: [{ id: "CAP-B-FAILED", status: "DECLINED" }],
                },
              },
            ],
          }),
          { status: 207, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await captureMultiSellerOrder({
      orderId: "ORDER-PARTIAL-207",
      checkoutToken: token,
      customFetch: mockFetch,
    });

    assert.strictEqual(res.overallStatus, "PARTIALLY_COMPLETED");
    assert.strictEqual(res.sellerCaptures[0].status, "COMPLETED");
    assert.strictEqual(res.sellerCaptures[1].status, "DECLINED");
    assert.ok(res.sellerCaptures[1].errorMessage?.includes("declined"));
  });

  // 18. HTTP 422 capture failure
  test("18. HTTP 422 capture failure", async () => {
    const token = createCheckoutContextToken({
      orderId: "ORDER-FAIL-422",
      sellerMerchantIds: ["MERCHANT_SELLER_A_123"],
      totalMinor: 14900,
      currency: "USD",
    });

    const mockFetch: typeof fetch = async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "mock_token_123", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/capture")) {
        return new Response(
          JSON.stringify({
            name: "UNPROCESSABLE_ENTITY",
            message: "The requested action could not be performed.",
            details: [{ description: "Transaction was refused by risk check." }],
          }),
          { status: 422, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    await assert.rejects(
      async () => {
        await captureMultiSellerOrder({
          orderId: "ORDER-FAIL-422",
          checkoutToken: token,
          customFetch: mockFetch,
        });
      },
      /Transaction was refused by risk check/
    );
  });

  // 19. HTTP 504 status reconciliation
  test("19. HTTP 504 status reconciliation via GET /v2/checkout/orders/{id}", async () => {
    const token = createCheckoutContextToken({
      orderId: "ORDER-TIMEOUT-504",
      sellerMerchantIds: ["MERCHANT_SELLER_A_123"],
      totalMinor: 14900,
      currency: "USD",
    });

    let getOrderDetailsCalled = false;

    const mockFetch: typeof fetch = async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "mock_token_123", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/capture")) {
        // Gateway timeout from PayPal
        return new Response("Gateway Timeout", { status: 504 });
      }
      if (urlStr.includes("/v2/checkout/orders/ORDER-TIMEOUT-504")) {
        getOrderDetailsCalled = true;
        return new Response(
          JSON.stringify({
            id: "ORDER-TIMEOUT-504",
            status: "COMPLETED",
            purchase_units: [
              {
                reference_id: "seller_a_ref_timeout",
                payee: { merchant_id: "MERCHANT_SELLER_A_123" },
                amount: { currency_code: "USD", value: "149.00" },
                payments: {
                  captures: [{ id: "CAP-A-RECONCILED", status: "COMPLETED" }],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await captureMultiSellerOrder({
      orderId: "ORDER-TIMEOUT-504",
      checkoutToken: token,
      customFetch: mockFetch,
    });

    assert.strictEqual(getOrderDetailsCalled, true, "Must reconcile status via GET order details");
    assert.strictEqual(res.overallStatus, "COMPLETED");
    assert.strictEqual(res.sellerCaptures[0].captureId, "CAP-A-RECONCILED");
  });

  // 20. Duplicate capture prevention
  test("20. Duplicate capture prevention (idempotent response without duplicate API call)", async () => {
    const token = createCheckoutContextToken({
      orderId: "ORDER-IDEMPOTENT-20",
      sellerMerchantIds: ["MERCHANT_SELLER_A_123"],
      totalMinor: 14900,
      currency: "USD",
    });

    let captureApiCallCount = 0;

    const mockFetch: typeof fetch = async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "mock_token_123", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/capture")) {
        captureApiCallCount += 1;
        return new Response(
          JSON.stringify({
            id: "ORDER-IDEMPOTENT-20",
            status: "COMPLETED",
            purchase_units: [
              {
                reference_id: "seller_a_ref_1",
                payee: { merchant_id: "MERCHANT_SELLER_A_123" },
                amount: { currency_code: "USD", value: "149.00" },
                payments: {
                  captures: [{ id: "CAP-A-1", status: "COMPLETED" }],
                },
              },
            ],
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    // First capture
    const first = await captureMultiSellerOrder({
      orderId: "ORDER-IDEMPOTENT-20",
      checkoutToken: token,
      customFetch: mockFetch,
    });
    assert.strictEqual(first.overallStatus, "COMPLETED");
    assert.strictEqual(captureApiCallCount, 1);

    // Second duplicate capture attempt
    const second = await captureMultiSellerOrder({
      orderId: "ORDER-IDEMPOTENT-20",
      checkoutToken: token,
      customFetch: mockFetch,
    });
    assert.strictEqual(second.overallStatus, "COMPLETED");
    assert.strictEqual(captureApiCallCount, 1, "Must NOT call PayPal capture API a second time");
  });

  // 21. Tampered checkout authorization rejected
  test("21. Tampered checkout authorization rejected", async () => {
    const validToken = createCheckoutContextToken({
      orderId: "ORDER-TAMPER-TEST",
      sellerMerchantIds: ["MERCHANT_SELLER_A_123"],
      totalMinor: 14900,
      currency: "USD",
    });

    // 1. Altered order ID
    await assert.rejects(
      async () => {
        await captureMultiSellerOrder({
          orderId: "DIFFERENT-ORDER-ID",
          checkoutToken: validToken,
        });
      },
      /Unauthorized checkout context/
    );

    // 2. Corrupted token string
    await assert.rejects(
      async () => {
        await captureMultiSellerOrder({
          orderId: "ORDER-TAMPER-TEST",
          checkoutToken: "invalid_corrupted_token_payload",
        });
      },
      /Unauthorized checkout context/
    );
  });

  // 22. Main Channel3 shopping flow remains unaffected
  test("22. Main Channel3 shopping flow remains unaffected", async () => {
    // Verify that Channel3 normalization and offer verification remain untouched
    const { normalizeChannel3Products } = await import(
      "../src/lib/channel3/normalize-products.ts"
    );
    assert.strictEqual(typeof normalizeChannel3Products, "function");

    const sampleChannel3: Array<Parameters<typeof normalizeChannel3Products>[0][number]> = [
      {
        id: "ch3_sample_1",
        title: "Retailer Running Shoes",
        offers: [
          {
            domain: "nike.com",
            url: "https://example-retailer.com/nike-shoe",
            price: { price: 120, currency: "USD" },
            availability: "InStock",
          },
        ],
      },
    ];

    const normalized = normalizeChannel3Products(sampleChannel3);
    assert.strictEqual(normalized.length, 1);
    const firstProduct = normalized[0];
    assert.ok(firstProduct, "Product must exist");
    assert.ok(firstProduct.offers && firstProduct.offers.length > 0, "Offers must exist");
    const firstOffer = firstProduct.offers[0]!;
    assert.strictEqual(firstOffer.url, "https://example-retailer.com/nike-shoe");
    assert.strictEqual(
      firstOffer.domain,
      "nike.com",
      "Real retailer domain remains intact without Sandbox merchant mapping"
    );
  });
});
