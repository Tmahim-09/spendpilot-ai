import crypto from "crypto";
import {
  getPayPalCredentials,
  createCheckoutContextToken,
  verifyCheckoutContextToken,
  getRegisteredSellers,
} from "./config.ts";
import { validateDemoCart } from "./demo-catalog.ts";
import type {
  CreateOrderCartItem,
  CreateOrderResponsePayload,
  CaptureOrderResponsePayload,
  SellerCaptureResult,
  DemoSellerId,
  CaptureStatus,
} from "./types.ts";

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

// In-memory idempotency store to prevent duplicate captures across concurrent or repeated requests
const captureRecords = new Map<string, CaptureOrderResponsePayload>();
const inFlightCaptures = new Set<string>();

/**
 * Resets in-memory caches (used primarily during automated test suites).
 */
export function resetOrdersServiceState(): void {
  cachedToken = null;
  captureRecords.clear();
  inFlightCaptures.clear();
}

/**
 * Obtains an OAuth 2.0 access token from PayPal Sandbox using client credentials.
 * Caches token in memory until 60 seconds before expiration.
 */
export async function getPayPalAccessToken(
  customFetch: typeof fetch = fetch
): Promise<string> {
  const { clientId, clientSecret, apiBase } = getPayPalCredentials();

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing PayPal Sandbox credentials. Set NEXT_PUBLIC_PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.local."
    );
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.accessToken;
  }

  const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;

  const response = await customFetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    // Redact sensitive details from logs/errors
    throw new Error(
      `PayPal OAuth authentication failed (status: ${response.status}). Verify Sandbox Client ID and Client Secret.`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in || 3600) * 1000,
  };

  return cachedToken.accessToken;
}

export interface CreateOrderParams {
  items: CreateOrderCartItem[];
  idempotencyKey?: string;
  customFetch?: typeof fetch;
}

/**
 * Creates a PayPal multi-seller order with one purchase unit per configured Sandbox seller.
 */
export async function createMultiSellerOrder({
  items,
  idempotencyKey,
  customFetch = fetch,
}: CreateOrderParams): Promise<CreateOrderResponsePayload> {
  const { apiBase, partnerAttributionId } = getPayPalCredentials();
  const token = await getPayPalAccessToken(customFetch);

  // Authoritative server-side validation: resolves products, groups by seller, computes totals
  const { sellerGroups, grandTotalMinor } = validateDemoCart(items);

  const purchaseUnits = Array.from(sellerGroups.entries()).map(
    ([sellerId, group], index) => {
      const seller = group.seller;
      const subtotalMajor = (group.subtotalMinor / 100).toFixed(2);
      const referenceId = `${sellerId}_ref_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 7)}`;

      return {
        reference_id: referenceId,
        description: `SpendPilot Order - ${seller.displayName}`,
        payee: {
          merchant_id: seller.merchantId,
          ...(seller.email ? { email_address: seller.email } : {}),
        },
        amount: {
          currency_code: "USD",
          value: subtotalMajor,
          breakdown: {
            item_total: {
              currency_code: "USD",
              value: subtotalMajor,
            },
          },
        },
        items: group.items.map((item) => ({
          name: item.product.title,
          sku: item.product.skuId,
          quantity: String(item.quantity),
          unit_amount: {
            currency_code: "USD",
            value: (item.product.priceMinor / 100).toFixed(2),
          },
        })),
        payment_instruction: {
          disbursement_mode: "INSTANT",
        },
      };
    }
  );

  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "PayPal-Request-Id": idempotencyKey || crypto.randomUUID(),
  };

  if (partnerAttributionId) {
    requestHeaders["PayPal-Partner-Attribution-Id"] = partnerAttributionId;
  }

  const payload = {
    intent: "CAPTURE",
    purchase_units: purchaseUnits,
    application_context: {
      brand_name: "SpendPilot AI",
      landing_page: "NO_PREFERENCE",
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
    },
  };

  const response = await customFetch(`${apiBase}/v2/checkout/orders`, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let message = `PayPal Orders API error (${response.status})`;
    try {
      const json = JSON.parse(errorBody);
      if (json.message) message = json.message;
      if (json.details && Array.isArray(json.details) && json.details[0]?.description) {
        message = `${message}: ${json.details[0].description}`;
      }
    } catch {
      // Use fallback message
    }
    throw new Error(message);
  }

  const orderData = (await response.json()) as { id: string };
  const sellerMerchantIds = Array.from(sellerGroups.values()).map(
    (g) => g.seller.merchantId
  );

  const checkoutToken = createCheckoutContextToken({
    orderId: orderData.id,
    sellerMerchantIds,
    totalMinor: grandTotalMinor,
    currency: "USD",
  });

  return {
    success: true,
    orderId: orderData.id,
    checkoutToken,
    sellerMerchantIds,
    totalMinor: grandTotalMinor,
    currency: "USD",
  };
}

export interface CaptureOrderParams {
  orderId: string;
  checkoutToken: string;
  customFetch?: typeof fetch;
}

/**
 * Captures a multi-seller PayPal order.
 * Handles HTTP 201 (full capture), HTTP 207 (partial multi-status capture),
 * HTTP 422 (unprocessable entity), and HTTP 504 (timeout reconciliation).
 */
export async function captureMultiSellerOrder({
  orderId,
  checkoutToken,
  customFetch = fetch,
}: CaptureOrderParams): Promise<CaptureOrderResponsePayload> {
  // 1. Verify checkout token integrity
  const verifiedContext = verifyCheckoutContextToken(checkoutToken);
  if (!verifiedContext || verifiedContext.orderId !== orderId) {
    throw new Error(
      "Unauthorized checkout context: Token is invalid, expired, or tampered."
    );
  }

  // 2. Prevent duplicate in-flight capture or duplicate calls
  if (captureRecords.has(orderId)) {
    return captureRecords.get(orderId)!;
  }

  if (inFlightCaptures.has(orderId)) {
    throw new Error(
      `Capture for order '${orderId}' is already in progress. Please wait.`
    );
  }

  inFlightCaptures.add(orderId);

  try {
    const { apiBase, partnerAttributionId } = getPayPalCredentials();
    const token = await getPayPalAccessToken(customFetch);

    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "PayPal-Request-Id": `capture_${orderId}`,
    };

    if (partnerAttributionId) {
      requestHeaders["PayPal-Partner-Attribution-Id"] = partnerAttributionId;
    }

    const response = await customFetch(`${apiBase}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: requestHeaders,
    });

    // 3. Handle Gateway Timeout (HTTP 504): Reconcile with GET order details
    if (response.status === 504) {
      const reconciled = await getOrderDetails(orderId, customFetch);
      if (reconciled && (reconciled.status === "COMPLETED" || reconciled.status === "PARTIALLY_COMPLETED")) {
        const normalized = normalizeOrderCaptures(reconciled, verifiedContext.totalMinor);
        captureRecords.set(orderId, normalized);
        return normalized;
      }
      throw new Error(
        "Capture request timed out. Please refresh to check final transaction status."
      );
    }

    // 4. Handle HTTP 201 (COMPLETED) and HTTP 207 (PARTIALLY_COMPLETED)
    if (response.status === 201 || response.status === 207) {
      const data = (await response.json()) as PayPalOrderResponse;
      const normalized = normalizeOrderCaptures(data, verifiedContext.totalMinor);
      captureRecords.set(orderId, normalized);
      return normalized;
    }

    // 5. Handle HTTP 422 and other failure statuses
    const errorBody = await response.text();
    let errorMessage = `Payment capture failed (HTTP ${response.status})`;
    try {
      const errJson = JSON.parse(errorBody);
      if (errJson.message) errorMessage = errJson.message;
      if (errJson.details && Array.isArray(errJson.details) && errJson.details[0]?.description) {
        errorMessage = `${errorMessage}: ${errJson.details[0].description}`;
      }
    } catch {
      // Fallback message
    }

    throw new Error(errorMessage);
  } finally {
    inFlightCaptures.delete(orderId);
  }
}

export interface PayPalOrderResponse {
  id: string;
  status: string;
  purchase_units?: Array<{
    reference_id?: string;
    payee?: {
      merchant_id?: string;
      email_address?: string;
    };
    amount?: {
      currency_code?: string;
      value?: string;
    };
    payments?: {
      captures?: Array<{
        id?: string;
        status?: string;
        amount?: {
          currency_code?: string;
          value?: string;
        };
      }>;
    };
  }>;
}

/**
 * Retrieves the current status of an order via GET /v2/checkout/orders/{id}.
 */
export async function getOrderDetails(
  orderId: string,
  customFetch: typeof fetch = fetch
): Promise<PayPalOrderResponse | null> {
  const { apiBase } = getPayPalCredentials();
  const token = await getPayPalAccessToken(customFetch);

  const response = await customFetch(`${apiBase}/v2/checkout/orders/${orderId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as PayPalOrderResponse;
}

/**
 * Normalizes multi-seller purchase unit capture results.
 * Distinguishes full capture from partial multi-status capture.
 */
function normalizeOrderCaptures(
  orderData: PayPalOrderResponse,
  totalMinor: number
): CaptureOrderResponsePayload {
  const registeredSellers = getRegisteredSellers();
  const rawUnits = orderData.purchase_units || [];
  const sellerCaptures: SellerCaptureResult[] = [];

  for (const unit of rawUnits) {
    const referenceId: string = unit.reference_id || "";
    const merchantId: string = unit.payee?.merchant_id || "";

    // Strictly reconcile seller identity against order context and registered sellers
    let matchedSellerId: DemoSellerId | null = null;
    let mismatchError: string | null = null;

    if (referenceId.startsWith("seller_a")) {
      if (merchantId && merchantId !== registeredSellers.seller_a.merchantId) {
        mismatchError = `Payee merchant ID mismatch for Seller A (expected ${registeredSellers.seller_a.merchantId}, received ${merchantId}).`;
      } else {
        matchedSellerId = "seller_a";
      }
    } else if (referenceId.startsWith("seller_b")) {
      if (merchantId && merchantId !== registeredSellers.seller_b.merchantId) {
        mismatchError = `Payee merchant ID mismatch for Seller B (expected ${registeredSellers.seller_b.merchantId}, received ${merchantId}).`;
      } else {
        matchedSellerId = "seller_b";
      }
    } else if (merchantId === registeredSellers.seller_a.merchantId) {
      matchedSellerId = "seller_a";
    } else if (merchantId === registeredSellers.seller_b.merchantId) {
      matchedSellerId = "seller_b";
    } else {
      mismatchError = `Unknown purchase unit reference '${referenceId}' and unregistered payee merchant ID '${merchantId}'.`;
    }

    const sellerConfig = matchedSellerId ? registeredSellers[matchedSellerId] : null;
    const unitAmountMinor = Math.round(parseFloat(unit.amount?.value || "0") * 100);

    const captureItem = unit.payments?.captures?.[0];
    let captureStatus: CaptureStatus = "FAILED";
    let captureId: string | undefined = undefined;
    let errorMessage: string | undefined = mismatchError || undefined;

    if (mismatchError) {
      captureStatus = "FAILED";
      if (captureItem?.id) {
        captureId = captureItem.id;
      }
    } else if (captureItem) {
      captureId = captureItem.id;
      const rawStatus = (captureItem.status || "").toUpperCase();
      if (rawStatus === "COMPLETED") {
        captureStatus = "COMPLETED";
      } else if (rawStatus === "PARTIALLY_REFUNDED" || rawStatus === "PENDING") {
        captureStatus = "PENDING";
      } else if (rawStatus === "DECLINED") {
        captureStatus = "DECLINED";
        errorMessage = "Seller capture was declined by payment network.";
      } else {
        captureStatus = "FAILED";
        errorMessage = "Seller payment capture failed.";
      }
    } else {
      captureStatus = "FAILED";
      errorMessage = "No capture record emitted for this purchase unit.";
    }

    sellerCaptures.push({
      sellerId: matchedSellerId || "unknown",
      sellerName: sellerConfig?.displayName || `Unknown Seller (${referenceId || merchantId || "N/A"})`,
      merchantId: merchantId || sellerConfig?.merchantId || "unknown",
      referenceId,
      subtotalMinor: unitAmountMinor,
      currency: unit.amount?.currency_code || "USD",
      status: captureStatus,
      captureId,
      errorMessage,
    });
  }

  const allCompleted =
    sellerCaptures.length > 0 &&
    sellerCaptures.every((c) => c.status === "COMPLETED");
  const anyCompleted = sellerCaptures.some((c) => c.status === "COMPLETED");

  let overallStatus: "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED" = "FAILED";
  if (allCompleted) {
    overallStatus = "COMPLETED";
  } else if (anyCompleted) {
    overallStatus = "PARTIALLY_COMPLETED";
  } else {
    overallStatus = "FAILED";
  }

  return {
    success: overallStatus !== "FAILED",
    orderId: orderData.id,
    overallStatus,
    sellerCaptures,
    totalMinor,
    currency: "USD",
  };
}
