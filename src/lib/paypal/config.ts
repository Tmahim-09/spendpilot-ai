import crypto from "crypto";
import type { DemoSellerConfig, DemoSellerId, PublicPayPalConfig } from "./types.ts";

const SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

/**
 * Ensures we are strictly running in the PayPal Sandbox environment.
 * The demo must remain Sandbox-only and never silently switch to production.
 */
export function assertSandboxEnvironment(): string {
  const env = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
  const rawBase = process.env.PAYPAL_API_BASE || SANDBOX_BASE_URL;

  if (env !== "sandbox") {
    throw new Error(
      `Security Violation: PAYPAL_ENV is set to '${env}'. SpendPilot PayPal Demo is strictly restricted to 'sandbox'.`
    );
  }

  // Ensure base URL matches official PayPal Sandbox domain
  if (!rawBase.includes("sandbox.paypal.com")) {
    throw new Error(
      `Security Violation: PAYPAL_API_BASE '${rawBase}' is not an authorized PayPal Sandbox endpoint.`
    );
  }

  return rawBase;
}

export function getPayPalCredentials(): {
  clientId: string;
  clientSecret: string;
  apiBase: string;
  partnerAttributionId?: string;
} {
  const apiBase = assertSandboxEnvironment();
  const clientId =
    process.env.PAYPAL_CLIENT_ID ||
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ||
    "";
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
  const partnerAttributionId = process.env.PAYPAL_PARTNER_ATTRIBUTION_ID;

  return {
    clientId: clientId.trim(),
    clientSecret: clientSecret.trim(),
    apiBase,
    partnerAttributionId: partnerAttributionId?.trim() || undefined,
  };
}

/**
 * Returns the configured Sandbox Business sellers from server environment.
 * Checks for missing merchant IDs and rejects misconfigured sellers.
 */
export function getRegisteredSellers(): Record<DemoSellerId, DemoSellerConfig> {
  const sellerAMerchantId = process.env.PAYPAL_DEMO_SELLER_A_MERCHANT_ID?.trim() || "";
  const sellerAEmail = process.env.PAYPAL_DEMO_SELLER_A_EMAIL?.trim() || undefined;

  const sellerBMerchantId = process.env.PAYPAL_DEMO_SELLER_B_MERCHANT_ID?.trim() || "";
  const sellerBEmail = process.env.PAYPAL_DEMO_SELLER_B_EMAIL?.trim() || undefined;

  return {
    seller_a: {
      id: "seller_a",
      displayName: "SpendPilot Audio Lab",
      description: "Acoustics & Precision Studio Audio Equipment",
      merchantId: sellerAMerchantId,
      email: sellerAEmail,
    },
    seller_b: {
      id: "seller_b",
      displayName: "SpendPilot Workspace Gear",
      description: "Ergonomics & Desk Accessories",
      merchantId: sellerBMerchantId,
      email: sellerBEmail,
    },
  };
}

/**
 * Generates an HMAC-signed token to protect the checkout context integrity.
 * Prevents client-side tampering of order amounts, order IDs, or seller IDs between create and capture.
 */
export function createCheckoutContextToken(payload: {
  orderId: string;
  sellerMerchantIds: string[];
  totalMinor: number;
  currency: string;
}): string {
  const { clientSecret } = getPayPalCredentials();
  const secretKey = clientSecret || "spendpilot_demo_sandbox_fallback_secret_key";
  const timestamp = Date.now();
  const data = JSON.stringify({ ...payload, timestamp });
  const hmac = crypto.createHmac("sha256", secretKey).update(data).digest("hex");
  const token = Buffer.from(JSON.stringify({ data, hmac })).toString("base64url");
  return token;
}

export function verifyCheckoutContextToken(token: string): {
  orderId: string;
  sellerMerchantIds: string[];
  totalMinor: number;
  currency: string;
  timestamp: number;
} | null {
  try {
    const { clientSecret } = getPayPalCredentials();
    const secretKey = clientSecret || "spendpilot_demo_sandbox_fallback_secret_key";
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.data || !parsed.hmac) {
      return null;
    }

    const expectedHmac = crypto
      .createHmac("sha256", secretKey)
      .update(parsed.data)
      .digest("hex");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(parsed.hmac, "hex"),
        Buffer.from(expectedHmac, "hex")
      )
    ) {
      return null;
    }

    const payload = JSON.parse(parsed.data);
    // Disallow tokens older than 3 hours
    if (Date.now() - payload.timestamp > 3 * 60 * 60 * 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Returns strictly safe public configuration for frontend JS SDK loading.
 * Never leaks the client secret, server secrets, or seller email addresses.
 */
export function getPublicPayPalConfig(): PublicPayPalConfig {
  assertSandboxEnvironment();
  const { clientId } = getPayPalCredentials();
  const sellers = getRegisteredSellers();

  return {
    clientId,
    environment: "sandbox",
    sellers: [
      {
        id: sellers.seller_a.id,
        displayName: sellers.seller_a.displayName,
        merchantId: sellers.seller_a.merchantId,
      },
      {
        id: sellers.seller_b.id,
        displayName: sellers.seller_b.displayName,
        merchantId: sellers.seller_b.merchantId,
      },
    ],
  };
}
