import type {
  DemoProduct,
  DemoSellerConfig,
  DemoSellerId,
  CreateOrderCartItem,
} from "./types.ts";
import { getRegisteredSellers } from "./config.ts";

export const DEMO_PRODUCTS: DemoProduct[] = [
  // ── Seller A: SpendPilot Audio Lab ──────────────────────────────────────────
  {
    skuId: "DEMO-SKU-AUDIO-01",
    sellerId: "seller_a",
    title: "SpendPilot Studio ANC Headphones",
    description:
      "Active noise-cancelling wireless headphones with 40mm beryllium drivers and low-latency Bluetooth 5.4.",
    priceMinor: 14900, // $149.00
    imageUrl:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80",
    badge: "Audiophile Pick",
  },
  {
    skuId: "DEMO-SKU-AUDIO-02",
    sellerId: "seller_a",
    title: "SpendPilot Wireless Desktop Soundbar",
    description:
      "Compact dual-driver soundbar with USB-C DAC, custom EQ presets, and magnetic under-monitor mounting.",
    priceMinor: 8900, // $89.00
    imageUrl:
      "https://images.unsplash.com/photo-1545454675-3531b543be5d?w=600&auto=format&fit=crop&q=80",
    badge: "Desk Favorite",
  },

  // ── Seller B: SpendPilot Workspace Gear ────────────────────────────────────
  {
    skuId: "DEMO-SKU-GEAR-01",
    sellerId: "seller_b",
    title: "SpendPilot Ergonomic Wrist Rest & Mat",
    description:
      "High-density cooling gel wrist rest with water-resistant micro-weave desk surface and anti-fray stitching.",
    priceMinor: 2900, // $29.00
    imageUrl:
      "https://images.unsplash.com/photo-1616440347437-b1c73416efc2?w=600&auto=format&fit=crop&q=80",
    badge: "Ergonomics",
  },
  {
    skuId: "DEMO-SKU-GEAR-02",
    sellerId: "seller_b",
    title: "SpendPilot Aluminium Dual Monitor Arm",
    description:
      "Heavy-duty gas-spring dual articulating arm supporting monitors up to 34-inch with integrated cable routing.",
    priceMinor: 7900, // $79.00
    imageUrl:
      "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600&auto=format&fit=crop&q=80",
    badge: "Clean Setup",
  },
];

export function getAllDemoProducts(): DemoProduct[] {
  return DEMO_PRODUCTS;
}

export function getDemoProduct(skuId: string): DemoProduct | null {
  return DEMO_PRODUCTS.find((p) => p.skuId === skuId) || null;
}

export interface ValidatedSellerGroup {
  seller: DemoSellerConfig;
  items: Array<{
    product: DemoProduct;
    quantity: number;
    subtotalMinor: number;
  }>;
  subtotalMinor: number;
}

export interface ValidatedCartResult {
  sellerGroups: Map<DemoSellerId, ValidatedSellerGroup>;
  grandTotalMinor: number;
  currency: "USD";
  uniqueSellerCount: number;
}

/**
 * Validates cart items against the authoritative server catalog.
 * Completely ignores client-supplied prices, totals, or seller IDs.
 * Enforces decimal-safe integer math and rejects unknown SKUs, invalid quantities, or misconfigured sellers.
 */
export function validateDemoCart(items: CreateOrderCartItem[]): ValidatedCartResult {
  if (!items || items.length === 0) {
    throw new Error("Cart is empty. At least one product is required to checkout.");
  }

  const registeredSellers = getRegisteredSellers();
  const sellerGroups = new Map<DemoSellerId, ValidatedSellerGroup>();
  let grandTotalMinor = 0;

  for (const item of items) {
    if (!item.skuId || typeof item.skuId !== "string") {
      throw new Error("Invalid cart item: SKU identifier is missing or invalid.");
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error(`Invalid quantity for SKU '${item.skuId}'. Must be a positive integer.`);
    }

    if (item.quantity > 50) {
      throw new Error(`Quantity for SKU '${item.skuId}' exceeds maximum allowed limit of 50.`);
    }

    const product = getDemoProduct(item.skuId);
    if (!product) {
      throw new Error(`Unknown product SKU '${item.skuId}'. Not found in server catalog.`);
    }

    const sellerConfig = registeredSellers[product.sellerId];
    if (!sellerConfig) {
      throw new Error(`Unknown seller for product '${product.skuId}'.`);
    }

    if (!sellerConfig.merchantId) {
      throw new Error(
        `Seller configuration error: Missing PayPal Sandbox Merchant ID for '${sellerConfig.displayName}'.`
      );
    }

    const itemSubtotalMinor = product.priceMinor * item.quantity;
    grandTotalMinor += itemSubtotalMinor;

    if (!sellerGroups.has(product.sellerId)) {
      sellerGroups.set(product.sellerId, {
        seller: sellerConfig,
        items: [],
        subtotalMinor: 0,
      });
    }

    const group = sellerGroups.get(product.sellerId)!;
    group.items.push({
      product,
      quantity: item.quantity,
      subtotalMinor: itemSubtotalMinor,
    });
    group.subtotalMinor += itemSubtotalMinor;
  }

  const uniqueSellerCount = sellerGroups.size;

  // PayPal Orders v2 supports up to 10 purchase units.
  if (uniqueSellerCount > 10) {
    throw new Error(
      `Multi-seller checkout limit exceeded: PayPal allows up to 10 sellers per order, received ${uniqueSellerCount}.`
    );
  }

  return {
    sellerGroups,
    grandTotalMinor,
    currency: "USD",
    uniqueSellerCount,
  };
}
