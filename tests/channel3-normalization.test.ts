import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeChannel3Product, normalizeChannel3Products } from "../src/lib/channel3/normalize-products.ts";
import type { Channel3Api } from "@channel3/sdk";

describe("Channel3 Product Normalization", () => {
  test("normalizes a complete Channel3 product with multiple offers", () => {
    const rawFixture: Channel3Api.Product = {
      id: "prod-101",
      title: "Logitech MX Master 3S Wireless Mouse",
      description: "Ergonomic high-precision performance wireless mouse.",
      brands: [{ id: "b1", name: "Logitech" }],
      images: [
        {
          url: "https://cdn.trychannel3.com/images/raw.jpg",
          cleaned_url: "https://cdn.trychannel3.com/cleaned/clean.png",
          is_main_image: true,
        },
      ],
      offers: [
        {
          domain: "bestbuy.com",
          url: "https://buy.trychannel3.com/p101-bestbuy-affiliate?tag=sp",
          price: { price: 99.99, compare_at_price: 109.99, currency: "USD" },
          availability: "InStock" as Channel3Api.OfferAvailabilityStatus,
          condition: "new" as Channel3Api.Condition,
        },
        {
          domain: "amazon.com",
          url: "https://buy.trychannel3.com/p101-amazon-affiliate?tag=sp",
          price: { price: 89.99, compare_at_price: null, currency: "USD" },
          availability: "InStock" as Channel3Api.OfferAvailabilityStatus,
          condition: "new" as Channel3Api.Condition,
        },
      ],
      structured_attributes: {
        connectivity: ["Bluetooth", "2.4GHz USB"],
        hand_orientation: ["Right"],
      },
      key_features: ["8000 DPI Darkfield sensor", "Quiet clicks"],
    };

    const normalized = normalizeChannel3Product(rawFixture, "USD");
    assert.ok(normalized !== null);
    assert.strictEqual(normalized.sourceProductId, "prod-101");
    assert.strictEqual(normalized.title, "Logitech MX Master 3S Wireless Mouse");
    assert.strictEqual(normalized.brand, "Logitech");
    // Preferred cleaned image
    assert.strictEqual(normalized.imageUrl, "https://cdn.trychannel3.com/cleaned/clean.png");
    // Preserves offer order without blind cheapest-first sorting
    assert.strictEqual(normalized.priceMinor, 9999);
    assert.strictEqual(normalized.retailerName, "bestbuy.com");
    assert.strictEqual(normalized.retailerUrl, "https://buy.trychannel3.com/p101-bestbuy-affiliate?tag=sp");
    assert.strictEqual(normalized.offersCount, 2);
    assert.strictEqual(normalized.offers?.[0]?.priceMinor, 9999);
    assert.strictEqual(normalized.offers?.[1]?.priceMinor, 8999);
    // Specifications extracted
    assert.strictEqual(normalized.specifications["Connectivity"], "Bluetooth, 2.4GHz USB");
    assert.strictEqual(normalized.specifications["Hand Orientation"], "Right");
  });

  test("gracefully handles products with missing images and unavailable prices", () => {
    const rawFixture: Channel3Api.Product = {
      id: "prod-102",
      title: "Generic Keyboard Without Price",
      images: [],
      offers: [],
    };

    const normalized = normalizeChannel3Product(rawFixture, "USD");
    assert.ok(normalized !== null);
    assert.strictEqual(normalized.imageUrl, null);
    assert.strictEqual(normalized.priceMinor, null);
    assert.strictEqual(normalized.offersCount, 0);
    assert.strictEqual(normalized.availability, "unknown");
  });

  test("filters out invalid or non-HTTP URLs safely", () => {
    const rawFixture: Channel3Api.Product = {
      id: "prod-103",
      title: "Item with Malformed URL",
      images: [{ url: "javascript:alert(1)" }],
      offers: [
        {
          domain: "bad-actor.com",
          url: "ftp://invalid-url.com",
          price: { price: 25.0, currency: "USD" },
          availability: "InStock" as Channel3Api.OfferAvailabilityStatus,
        },
      ],
    };

    const normalized = normalizeChannel3Product(rawFixture, "USD");
    assert.ok(normalized !== null);
    // Invalid image URL should be ignored
    assert.strictEqual(normalized.imageUrl, null);
    // FTP offer is rejected as invalid HTTP URL
    assert.strictEqual(normalized.offersCount, 0);
    assert.strictEqual(normalized.priceMinor, null);
  });

  test("preserves tracking parameters and redirect links without alteration", () => {
    const originalUrl = "https://buy.trychannel3.com/item-123?aid=affiliate456&mid=merchant789&signature=xyz";
    const rawFixture: Channel3Api.Product = {
      id: "prod-104",
      title: "Preserved Tracking Item",
      offers: [
        {
          domain: "target.com",
          url: originalUrl,
          price: { price: 49.5, currency: "USD" },
          availability: "InStock" as Channel3Api.OfferAvailabilityStatus,
        },
      ],
    };

    const normalized = normalizeChannel3Product(rawFixture, "USD");
    assert.ok(normalized !== null);
    assert.strictEqual(normalized.retailerUrl, originalUrl);
  });

  test("normalizeChannel3Products filters nulls and returns array", () => {
    const list = normalizeChannel3Products([
      null as unknown as Channel3Api.Product,
      { id: "p1", title: "Valid Item", offers: [] },
    ]);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0]?.title, "Valid Item");
  });
});
