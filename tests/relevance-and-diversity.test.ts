import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Channel3Api } from "@channel3/sdk";
import {
  identifyFranchisesInText,
} from "../src/lib/relevance/entity-registry.ts";
import {
  evaluateProductRelevance,
  verifyEvidenceGroundedInProduct,
} from "../src/lib/relevance/relevance-evaluator.ts";
import {
  calculateTitleSimilarity,
  evaluateBundleDiversity,
  inferDiversityGroup,
} from "../src/lib/setup/bundle-diversity.ts";
import { executeSetupSearch } from "../src/lib/setup/setup-search.ts";
import { validateSetupComparisons } from "../src/lib/setup/setup-comparator.ts";
import { calculateRecommendedBundle } from "../src/lib/setup/bundle-calculator.ts";
import { normalizeChannel3Product } from "../src/lib/channel3/normalize-products.ts";
import type {
  NormalizedProduct,
  SetupCategorySearchResult,
  SetupComparisonCategoryResult,
  SetupRequirementItem,
} from "../src/types/index.ts";

describe("Product Relevance, Theme Matching and Bundle Diversity (28 Acceptance Scenarios)", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 1: FRANCHISE MATCHING & NEGATIVE REJECTION (Scenarios 1 - 10)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Suite 1: Franchise Matching & Negative Rejection", () => {
    // Scenario 1: Naruto products are accepted for Naruto requirements
    test("1. Naruto products are accepted for Naruto requirements", () => {
      const requirement: SetupRequirementItem = {
        id: "req-naruto-light",
        name: "Naruto LED Neon Sign",
        productCategory: "wall-lighting",
        searchQuery: "Naruto Uzumaki Shippuden LED Neon Sign",
        allocationPercentage: 20,
        allocatedAmount: 60,
        allocatedAmountMinor: 6000,
        priority: "high",
        requirements: ["LED Neon Sign", "Warm Glow"],
        requiredFranchises: ["Naruto"],
        requiredCharacters: [],
        mustHaveTerms: ["neon"],
        diversityGroup: "wall-lighting",
      };

      const product: NormalizedProduct = {
        source: "channel3",
        sourceProductId: "ch3-naruto-sign-01",
        title: "Official Naruto Shippuden Uzumaki Clan Symbol LED Neon Wall Sign",
        brand: "OtakuLights",
        description: "Bright orange LED neon wall light shaped like the Uzumaki swirl symbol.",
        imageUrl: "https://example.com/naruto.jpg",
        priceMinor: 4500,
        currency: "USD",
        retailerName: "AnimeStore",
        retailerUrl: "https://example.com/item/1",
        availability: "in_stock",
        specifications: { Theme: "Naruto Shippuden", Type: "LED Neon Sign" },
        sourceFacts: ["Official Naruto Shippuden Uzumaki Clan Sign"],
      };

      const result = evaluateProductRelevance(product, requirement);
      assert.equal(result.isEligible, true);
      assert.equal(result.outcome, "direct_match");
      assert(result.matchedFranchises.includes("Naruto"));
      assert(result.evidenceQuote.length > 0);
    });

    // Scenario 2: One Piece products are accepted for One Piece requirements
    test("2. One Piece products are accepted for One Piece requirements", () => {
      const requirement: SetupRequirementItem = {
        id: "req-one-piece-art",
        name: "One Piece Canvas Wall Art",
        productCategory: "wall-art",
        searchQuery: "One Piece Straw Hat Canvas Wall Art",
        allocationPercentage: 20,
        allocatedAmount: 50,
        allocatedAmountMinor: 5000,
        priority: "high",
        requirements: ["Canvas Art", "Framed"],
        requiredFranchises: ["One Piece"],
        requiredCharacters: ["Luffy"],
        diversityGroup: "wall-art",
      };

      const product: NormalizedProduct = {
        source: "channel3",
        sourceProductId: "ch3-op-canvas-01",
        title: "One Piece Monkey D. Luffy Straw Hat Pirates Canvas Wall Art 16x24",
        brand: "Toei Animation Store",
        description: "High definition canvas featuring Captain Luffy with his straw hat.",
        imageUrl: "https://example.com/luffy.jpg",
        priceMinor: 3800,
        currency: "USD",
        retailerName: "Crunchyroll Store",
        retailerUrl: "https://example.com/item/2",
        availability: "in_stock",
        specifications: { Anime: "One Piece", Character: "Monkey D. Luffy" },
        sourceFacts: ["Luffy Straw Hat Canvas"],
      };

      const result = evaluateProductRelevance(product, requirement);
      assert.equal(result.isEligible, true);
      assert.equal(result.outcome, "direct_match");
      assert(result.matchedFranchises.includes("One Piece"));
      assert(result.matchedCharacters.includes("Luffy") || result.matchedCharacters.includes("Monkey D. Luffy"));
    });

    // Scenario 3: Attack on Titan products are accepted for Attack on Titan requirements
    test("3. Attack on Titan products are accepted for Attack on Titan requirements", () => {
      const requirement: SetupRequirementItem = {
        id: "req-aot-bedding",
        name: "Attack on Titan Bedding",
        productCategory: "bedding",
        searchQuery: "Attack on Titan Scout Regiment Wings of Freedom Duvet Cover",
        allocationPercentage: 25,
        allocatedAmount: 70,
        allocatedAmountMinor: 7000,
        priority: "high",
        requirements: ["Bedding Set", "Queen Size"],
        requiredFranchises: ["Attack on Titan"],
        diversityGroup: "bedding",
      };

      const product: NormalizedProduct = {
        source: "channel3",
        sourceProductId: "ch3-aot-duvet-01",
        title: "Attack on Titan Scout Regiment Wings of Freedom 3-Piece Duvet Cover Set",
        brand: "Kodansha Merch",
        description: "Official Shingeki no Kyojin Wings of Freedom emblem bedding.",
        imageUrl: "https://example.com/aot.jpg",
        priceMinor: 6500,
        currency: "USD",
        retailerName: "BeddingDirect",
        retailerUrl: "https://example.com/item/3",
        availability: "in_stock",
        specifications: { Franchise: "Attack on Titan", Pattern: "Wings of Freedom" },
        sourceFacts: ["Attack on Titan Duvet Cover Set"],
      };

      const result = evaluateProductRelevance(product, requirement);
      assert.equal(result.isEligible, true);
      assert.equal(result.outcome, "direct_match");
      assert(result.matchedFranchises.includes("Attack on Titan"));
    });

    // Scenario 4: Demon Slayer products are rejected for the specified anime room request
    test("4. Demon Slayer products are rejected for the specified anime room request", () => {
      const requirement: SetupRequirementItem = {
        id: "req-naruto-figurine",
        name: "Naruto Collectible Figure",
        productCategory: "figurine",
        searchQuery: "Naruto Uzumaki Action Figure",
        allocationPercentage: 15,
        allocatedAmount: 45,
        allocatedAmountMinor: 4500,
        priority: "medium",
        requirements: ["Collectible Figure"],
        requiredFranchises: ["Naruto"],
        diversityGroup: "figurine",
      };

      const demonSlayerProduct: NormalizedProduct = {
        source: "channel3",
        sourceProductId: "ch3-ds-tanjiro-01",
        title: "Demon Slayer Kimetsu no Yaiba Tanjiro Kamado Action Figure",
        brand: "Bandai Spirits",
        description: "Demon Slayer Nichirin blade dynamic pose figurine.",
        imageUrl: "https://example.com/ds.jpg",
        priceMinor: 4000,
        currency: "USD",
        retailerName: "FigureHub",
        retailerUrl: "https://example.com/item/4",
        availability: "in_stock",
        specifications: { Series: "Demon Slayer", Character: "Tanjiro Kamado" },
        sourceFacts: [],
      };

      const result = evaluateProductRelevance(demonSlayerProduct, requirement);
      assert.equal(result.isEligible, false);
      assert.equal(result.outcome, "unrelated");
      assert(result.explanation.toLowerCase().includes("demon slayer"));
    });

    // Scenario 5: Generic wall art is rejected
    test("5. Generic wall art is rejected (e.g. Girl Boss or astronaut)", () => {
      const requirement: SetupRequirementItem = {
        id: "req-naruto-art",
        name: "Naruto Wall Art Canvas",
        searchQuery: "Naruto Wall Canvas",
        allocationPercentage: 20,
        allocatedAmount: 40,
        allocatedAmountMinor: 4000,
        priority: "high",
        requirements: [],
        requiredFranchises: ["Naruto"],
      };

      const girlBossProduct: NormalizedProduct = {
        source: "channel3",
        sourceProductId: "ch3-girl-boss-canvas",
        title: "Girl Boss Hustle Hard Inspirational Canvas Wall Decor",
        brand: "ModernHome",
        description: "Motivational typography canvas print for modern office rooms.",
        imageUrl: "https://example.com/girlboss.jpg",
        priceMinor: 3500,
        currency: "USD",
        retailerName: "WallDeco",
        retailerUrl: "https://example.com/item/5",
        availability: "in_stock",
        specifications: { Theme: "Motivational Quotes" },
        sourceFacts: [],
      };

      const astronautProduct: NormalizedProduct = {
        source: "channel3",
        sourceProductId: "ch3-astronaut-art",
        title: "Astronaut Moon Artwork Spaceman Modern Canvas Poster",
        brand: "SpaceCanvas",
        description: "Sci-fi astronaut floating in deep space wall poster.",
        imageUrl: "https://example.com/astro.jpg",
        priceMinor: 3200,
        currency: "USD",
        retailerName: "PosterShop",
        retailerUrl: "https://example.com/item/6",
        availability: "in_stock",
        specifications: {},
        sourceFacts: [],
      };

      const res1 = evaluateProductRelevance(girlBossProduct, requirement);
      assert.equal(res1.isEligible, false);
      assert.equal(res1.outcome, "unrelated");

      const res2 = evaluateProductRelevance(astronautProduct, requirement);
      assert.equal(res2.isEligible, false);
      assert.equal(res2.outcome, "unrelated");
    });

    // Scenario 6: Generic bedding is rejected
    test("6. Generic bedding is rejected (e.g. solid color duvet)", () => {
      const requirement: SetupRequirementItem = {
        id: "req-aot-bedding",
        name: "Attack on Titan Bedding",
        searchQuery: "Attack on Titan Bedding Duvet Set",
        allocationPercentage: 30,
        allocatedAmount: 80,
        allocatedAmountMinor: 8000,
        priority: "high",
        requirements: [],
        requiredFranchises: ["Attack on Titan"],
      };

      const genericBedding: NormalizedProduct = {
        source: "channel3",
        sourceProductId: "ch3-solid-duvet",
        title: "Modern Solid Charcoal Gray 3-Piece Washed Microfiber Duvet Cover Set",
        brand: "Bedsure",
        description: "Ultra soft solid charcoal gray bedding set with matching pillow shams.",
        imageUrl: "https://example.com/duvet.jpg",
        priceMinor: 5900,
        currency: "USD",
        retailerName: "Amazon",
        retailerUrl: "https://example.com/item/7",
        availability: "in_stock",
        specifications: { Color: "Charcoal Gray", Pattern: "Solid" },
        sourceFacts: [],
      };

      const result = evaluateProductRelevance(genericBedding, requirement);
      assert.equal(result.isEligible, false);
      assert.equal(result.outcome, "unrelated");
      assert(result.explanation.includes("Attack on Titan"));
    });

    // Scenario 7: Generic rugs and pillows are rejected
    test("7. Generic rugs and pillows are rejected (e.g. sports rugs, floral/Christmas pillows)", () => {
      const rugReq: SetupRequirementItem = {
        id: "req-anime-rug",
        name: "Anime Area Rug",
        searchQuery: "Naruto One Piece Anime Area Rug",
        allocationPercentage: 25,
        allocatedAmount: 60,
        allocatedAmountMinor: 6000,
        priority: "medium",
        requirements: [],
        requiredFranchises: ["Naruto"],
      };

      const genericRug: NormalizedProduct = {
        source: "channel3",
        sourceProductId: "ch3-sports-rug",
        title: "Contemporary Sports Stadium Field Green Accent Area Rug 4x6",
        brand: "RugsUSA",
        description: "Green sports stadium field pattern soft plush floor carpet.",
        imageUrl: "https://example.com/rug.jpg",
        priceMinor: 5200,
        currency: "USD",
        retailerName: "RugsUSA",
        retailerUrl: "https://example.com/item/8",
        availability: "in_stock",
        specifications: {},
        sourceFacts: [],
      };

      const pillowReq: SetupRequirementItem = {
        id: "req-anime-pillow",
        name: "Anime Decorative Pillows",
        searchQuery: "One Piece Anime Decorative Pillows",
        allocationPercentage: 15,
        allocatedAmount: 35,
        allocatedAmountMinor: 3500,
        priority: "low",
        requirements: [],
        requiredFranchises: ["One Piece"],
      };

      const genericPillows: NormalizedProduct = {
        source: "channel3",
        sourceProductId: "ch3-christmas-pillows",
        title: "Merry Christmas Holiday Plaid Floral Throw Pillow Covers Set of 2",
        brand: "HomeHoliday",
        description: "Red and green Christmas snowflake pattern holiday cushion covers.",
        imageUrl: "https://example.com/pillow.jpg",
        priceMinor: 2400,
        currency: "USD",
        retailerName: "Target",
        retailerUrl: "https://example.com/item/9",
        availability: "in_stock",
        specifications: { Occasion: "Christmas" },
        sourceFacts: [],
      };

      assert.equal(evaluateProductRelevance(genericRug, rugReq).isEligible, false);
      assert.equal(evaluateProductRelevance(genericPillows, pillowReq).isEligible, false);
    });

    // Scenario 8: Product title alone cannot override conflicting source metadata
    test("8. Product title alone cannot override conflicting source metadata", () => {
      const requirement: SetupRequirementItem = {
        id: "req-naruto-figurine",
        name: "Naruto Figurine",
        searchQuery: "Naruto Collectible Figure",
        allocationPercentage: 20,
        allocatedAmount: 50,
        allocatedAmountMinor: 5000,
        priority: "high",
        requirements: [],
        requiredFranchises: ["Naruto"],
      };

      // Conflicting metadata (The Powerpuff Girls brand & description)
      const contradictoryProduct: NormalizedProduct = {
        source: "channel3",
        sourceProductId: "ch3-powerpuff-spoof",
        title: "Naruto Style Anime Figurine Toy Collectible",
        brand: "The Powerpuff Girls",
        description: "Official Cartoon Network Blossom Powerpuff Girls mini collectible figure.",
        imageUrl: "https://example.com/blossom.jpg",
        priceMinor: 3500,
        currency: "USD",
        retailerName: "CartoonStore",
        retailerUrl: "https://example.com/item/10",
        availability: "in_stock",
        specifications: { Franchise: "The Powerpuff Girls", Character: "Blossom" },
        sourceFacts: ["Official Powerpuff Girls Collectible"],
      };

      // Product mentions unrelated entity (The Powerpuff Girls)
      const allFound = identifyFranchisesInText(
        `${contradictoryProduct.title} ${contradictoryProduct.description} ${contradictoryProduct.brand}`
      );
      assert(allFound.some((f) => f.franchiseId === "powerpuff_girls"));
      assert.equal(evaluateProductRelevance(contradictoryProduct, requirement).isEligible, false);
    });

    // Scenario 9: AI-generated evidence absent from the original Channel3 response is rejected
    test("9. AI-generated evidence absent from the original Channel3 response is rejected", () => {
      const genuineProduct: NormalizedProduct = {
        source: "channel3",
        sourceProductId: "ch3-naruto-poster",
        title: "Naruto Uzumaki Shippuden Wall Scroll Poster 16x24",
        brand: "Great Eastern",
        description: "Fabric wall scroll featuring Naruto in Sage Mode with hanging hooks.",
        imageUrl: "https://example.com/scroll.jpg",
        priceMinor: 2200,
        currency: "USD",
        retailerName: "AnimeStore",
        retailerUrl: "https://example.com/item/11",
        availability: "in_stock",
        specifications: { Material: "Fabric" },
        sourceFacts: ["Fabric wall scroll Sage Mode"],
      };

      const genuineEvidence = "Sage Mode with hanging hooks";
      const fabricatedEvidence = "Verified by Studio Pierrot hologram seal of authenticity certified 2026";

      assert.equal(verifyEvidenceGroundedInProduct(genuineProduct, genuineEvidence, "description"), true);
      assert.equal(verifyEvidenceGroundedInProduct(genuineProduct, fabricatedEvidence, "description"), false);
      assert.equal(verifyEvidenceGroundedInProduct(genuineProduct, fabricatedEvidence, "sourceFacts"), false);
    });

    // Scenario 10: Ambiguous franchise or character references are not treated as verified
    test("10. Ambiguous franchise or character references are not treated as verified", () => {
      const requirement: SetupRequirementItem = {
        id: "req-aot-lamp",
        name: "Attack on Titan Lamp",
        searchQuery: "Attack on Titan Desk Lamp",
        allocationPercentage: 15,
        allocatedAmount: 40,
        allocatedAmountMinor: 4000,
        priority: "medium",
        requirements: [],
        requiredFranchises: ["Attack on Titan"],
      };

      // Mentions word "Titan" in non-franchise commercial context
      const ambiguousProduct: NormalizedProduct = {
        source: "channel3",
        sourceProductId: "ch3-titan-lamp",
        title: "Titan Heavy Duty Industrial Metal LED Desk Lamp",
        brand: "Titan Lighting Co",
        description: "Architect drafting lamp made from heavy gauge titan alloy steel.",
        imageUrl: "https://example.com/titanlamp.jpg",
        priceMinor: 3800,
        currency: "USD",
        retailerName: "HardwareStore",
        retailerUrl: "https://example.com/item/12",
        availability: "in_stock",
        specifications: { Material: "Steel" },
        sourceFacts: [],
      };

      const result = evaluateProductRelevance(ambiguousProduct, requirement);
      // "Titan Lighting Co" does not match "Attack on Titan" or "Shingeki no Kyojin"
      assert.equal(result.isEligible, false);
      assert.equal(result.outcome, "unrelated");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 2: SEARCH QUALITY (Scenarios 11 - 16)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Suite 2: Search Quality", () => {
    // Scenario 11: Primary queries preserve the required franchise
    test("11. Primary queries preserve the required franchise", () => {
      const item: SetupRequirementItem = {
        id: "item-1",
        name: "Naruto LED Neon Sign",
        productCategory: "wall-lighting",
        searchQuery: "Naruto LED Neon Sign",
        allocationPercentage: 25,
        allocatedAmount: 50,
        allocatedAmountMinor: 5000,
        priority: "high",
        requirements: ["Neon light"],
        requiredFranchises: ["Naruto"],
      };

      assert(item.searchQuery.toLowerCase().includes("naruto"));
      assert(item.requiredFranchises?.includes("Naruto"));
    });

    // Scenario 12: Fallback queries preserve the required franchise
    test("12. Fallback queries preserve the required franchise", () => {
      const item: SetupRequirementItem = {
        id: "item-2",
        name: "One Piece Canvas Wall Art",
        productCategory: "wall-art",
        searchQuery: "One Piece canvas wall art print",
        fallbackQuery: "One Piece wall poster banner",
        allocationPercentage: 25,
        allocatedAmount: 40,
        allocatedAmountMinor: 4000,
        priority: "high",
        requirements: [],
        requiredFranchises: ["One Piece"],
      };

      assert(item.fallbackQuery?.toLowerCase().includes("one piece"));
      // Ensure it does not silently strip "One Piece" down to "wall poster banner"
      assert.equal(item.fallbackQuery?.toLowerCase().includes("one piece"), true);
    });

    // Scenario 13: Generic broad search cannot silently replace an exact franchise search
    test("13. Generic broad search cannot silently replace an exact franchise search", async () => {
      const item: SetupRequirementItem = {
        id: "req-aot-bedding",
        name: "Attack on Titan Bedding",
        searchQuery: "Attack on Titan bedding set",
        allocationPercentage: 30,
        allocatedAmount: 80,
        allocatedAmountMinor: 8000,
        priority: "high",
        requirements: [],
        requiredFranchises: ["Attack on Titan"],
      };

      // Mock searchFn that returns only generic solid bedding (no AoT matches in catalog)
      const categories = await executeSetupSearch({
        items: [item],
        totalBudget: 80,
        currency: "USD",
        searchFn: async () => [
          {
            source: "channel3",
            sourceProductId: "gen-bed-1",
            title: "Solid Grey Microfiber Duvet Cover",
            brand: "Bedsure",
            imageUrl: "",
            priceMinor: 6000,
            currency: "USD",
            retailerName: "Amazon",
            retailerUrl: "",
            availability: "in_stock",
            specifications: {},
            sourceFacts: [],
            offers: [{ merchantName: "Amazon", domain: "amazon.com", url: "", priceMinor: 6000, currency: "USD", availability: "in_stock" }],
          },
        ],
      });

      assert.equal(categories.length, 1);
      // Because generic bedding was rejected by relevance gate, zero products qualify
      assert.equal(categories[0].products.length, 0);
      assert.equal(categories[0].status, "unavailable");
      assert(categories[0].unfulfilledReason?.includes("No verified Attack on Titan"));
    });

    // Scenario 14: Channel3 results are normalized correctly
    test("14. Channel3 results are normalized correctly", () => {
      const rawC3 = {
        id: "c3-raw-123",
        title: "Official Naruto Shippuden Keychain",
        brands: [{ id: "b1", name: "Hot Topic" }],
        description: "Metal keychain with Sasuke Uchiha emblem.",
        images: [{ url: "https://example.com/sasuke.jpg", is_main_image: true }],
        offers: [
          {
            domain: "hottopic.com",
            url: "https://buy.trychannel3.com/sasuke-keychain",
            price: { price: 12.99, currency: "USD" },
            availability: "in_stock",
          },
        ],
      };

      const normalized = normalizeChannel3Product(rawC3 as unknown as Channel3Api.Product, "USD");
      assert(normalized !== null);
      assert.equal(normalized.sourceProductId, "c3-raw-123");
      assert.equal(normalized.title, "Official Naruto Shippuden Keychain");
      assert.equal(normalized.priceMinor, 1299);
      assert.equal(normalized.currency, "USD");
      assert.equal(normalized.retailerName, "hottopic.com");
    });

    // Scenario 15: Multiple retailer offers do not create duplicate products
    test("15. Multiple retailer offers do not create duplicate products", () => {
      const rawWithMultipleOffers = {
        id: "prod-multi-offer",
        title: "Naruto Uzumaki Funko Pop Figurine",
        brands: [{ id: "b1", name: "Funko" }],
        offers: [
          { domain: "amazon.com", url: "https://buy.trychannel3.com/amzn", price: { price: 14.99, currency: "USD" }, availability: "in_stock" },
          { domain: "walmart.com", url: "https://buy.trychannel3.com/walmart", price: { price: 15.49, currency: "USD" }, availability: "in_stock" },
          { domain: "target.com", url: "https://buy.trychannel3.com/target", price: { price: 14.99, currency: "USD" }, availability: "in_stock" },
        ],
      };

      const normalized = normalizeChannel3Product(rawWithMultipleOffers as unknown as Channel3Api.Product, "USD");
      assert(normalized !== null);
      assert.equal(normalized.offers?.length, 3);
      assert.equal(normalized.priceMinor, 1499); // Takes best price
    });

    // Scenario 16: Maximum two eligible alternatives are displayed per requirement
    test("16. Maximum two eligible alternatives are displayed per requirement", async () => {
      const item: SetupRequirementItem = {
        id: "req-naruto-stickers",
        name: "Naruto Stickers",
        searchQuery: "Naruto Uzumaki Stickers Pack",
        allocationPercentage: 20,
        allocatedAmount: 30,
        allocatedAmountMinor: 3000,
        priority: "low",
        requirements: [],
        requiredFranchises: ["Naruto"],
      };

      const categories = await executeSetupSearch({
        items: [item],
        totalBudget: 30,
        currency: "USD",
        pricePreference: "best_value",
        searchFn: async () => [
          { source: "channel3", sourceProductId: "n-1", title: "Naruto Shippuden Sticker Pack A", brand: "B", imageUrl: "", priceMinor: 1000, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: ["Naruto Stickers"], offers: [{ merchantName: "R", domain: "r.com", url: "", priceMinor: 1000, currency: "USD", availability: "in_stock" }] },
          { source: "channel3", sourceProductId: "n-2", title: "Naruto Shippuden Sticker Pack B", brand: "B", imageUrl: "", priceMinor: 1200, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: ["Naruto Stickers"], offers: [{ merchantName: "R", domain: "r.com", url: "", priceMinor: 1200, currency: "USD", availability: "in_stock" }] },
          { source: "channel3", sourceProductId: "n-3", title: "Naruto Shippuden Sticker Pack C", brand: "B", imageUrl: "", priceMinor: 1400, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: ["Naruto Stickers"], offers: [{ merchantName: "R", domain: "r.com", url: "", priceMinor: 1400, currency: "USD", availability: "in_stock" }] },
          { source: "channel3", sourceProductId: "n-4", title: "Naruto Shippuden Sticker Pack D", brand: "B", imageUrl: "", priceMinor: 1500, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: ["Naruto Stickers"], offers: [{ merchantName: "R", domain: "r.com", url: "", priceMinor: 1500, currency: "USD", availability: "in_stock" }] },
        ],
      });

      assert.equal(categories.length, 1);
      assert(categories[0].products.length <= 2, "Expected at most 2 candidate products per requirement");
      assert.equal(categories[0].products.length, 2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 3: BUNDLE DIVERSITY (Scenarios 17 - 22)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Suite 3: Bundle Diversity", () => {
    // Scenario 17: Repeated identical product IDs are rejected
    test("17. Repeated identical product IDs are rejected", () => {
      const item1 = {
        requirementId: "req-1",
        requirementName: "Anime Desk Mat",
        allocatedAmountMinor: 3000,
        selectedProductId: "prod-same-id-999",
        selectedProduct: { source: "channel3", sourceProductId: "prod-same-id-999", title: "Naruto Desk Mat", brand: "B", imageUrl: "", priceMinor: 2500, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: [] } as NormalizedProduct,
        comparison: {} as SetupComparisonCategoryResult,
        isOverCategoryBudget: false,
      };

      const item2 = {
        requirementId: "req-2",
        requirementName: "Anime Mouse Pad",
        allocatedAmountMinor: 3000,
        selectedProductId: "prod-same-id-999",
        selectedProduct: { source: "channel3", sourceProductId: "prod-same-id-999", title: "Naruto Desk Mat", brand: "B", imageUrl: "", priceMinor: 2500, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: [] } as NormalizedProduct,
        comparison: {} as SetupComparisonCategoryResult,
        isOverCategoryBudget: false,
      };

      const report = evaluateBundleDiversity([item1, item2], [
        { id: "req-1", name: "Anime Desk Mat", searchQuery: "", allocationPercentage: 50, allocatedAmount: 30, allocatedAmountMinor: 3000, priority: "high", requirements: [] },
        { id: "req-2", name: "Anime Mouse Pad", searchQuery: "", allocationPercentage: 50, allocatedAmount: 30, allocatedAmountMinor: 3000, priority: "high", requirements: [] },
      ]);

      assert.equal(report.isDiverse, false);
      assert(report.duplicateProductIds.includes("prod-same-id-999"));
    });

    // Scenario 18: Near-duplicate product listings are detected
    test("18. Near-duplicate product listings are detected", () => {
      const titleA = "Official Naruto Shippuden Akatsuki Cloud LED Neon Light Wall Decor";
      const titleB = "Official Naruto Shippuden Akatsuki Cloud LED Neon Light USB Powered";
      const similarity = calculateTitleSimilarity(titleA, titleB);

      assert(similarity > 0.6, `Expected high similarity between near-duplicates, got ${similarity}`);

      const item1 = {
        requirementId: "req-1",
        requirementName: "Neon Sign",
        allocatedAmountMinor: 5000,
        selectedProductId: "sign-a",
        selectedProduct: { title: titleA } as NormalizedProduct,
        comparison: {} as SetupComparisonCategoryResult,
        isOverCategoryBudget: false,
      };

      const item2 = {
        requirementId: "req-2",
        requirementName: "Wall Light",
        allocatedAmountMinor: 5000,
        selectedProductId: "sign-b",
        selectedProduct: { title: titleB } as NormalizedProduct,
        comparison: {} as SetupComparisonCategoryResult,
        isOverCategoryBudget: false,
      };

      const report = evaluateBundleDiversity([item1, item2], [
        { id: "req-1", name: "Neon Sign", searchQuery: "", allocationPercentage: 50, allocatedAmount: 50, allocatedAmountMinor: 5000, priority: "high", requirements: [] },
        { id: "req-2", name: "Wall Light", searchQuery: "", allocationPercentage: 50, allocatedAmount: 50, allocatedAmountMinor: 5000, priority: "high", requirements: [] },
      ]);

      assert.equal(report.nearDuplicatePairs.length, 1);
    });

    // Scenario 19: Duplicate product types in separate requirements are flagged where not explicitly requested
    test("19. Duplicate product types in separate requirements are flagged where not explicitly requested", () => {
      const g1 = inferDiversityGroup("Naruto Action Figure");
      const g2 = inferDiversityGroup("One Piece Collectible Statue");
      assert.equal(g1, "figurine");
      assert.equal(g2, "figurine");

      const item1 = {
        requirementId: "req-1",
        requirementName: "Naruto Action Figure",
        allocatedAmountMinor: 4000,
        selectedProductId: "fig-1",
        selectedProduct: { title: "Naruto Shippuden Uzumaki Figure 7 inch" } as NormalizedProduct,
        comparison: {} as SetupComparisonCategoryResult,
        isOverCategoryBudget: false,
      };

      const item2 = {
        requirementId: "req-2",
        requirementName: "One Piece Collectible Statue",
        allocatedAmountMinor: 4000,
        selectedProductId: "fig-2",
        selectedProduct: { title: "One Piece Zoro Pirate Hunter Statue" } as NormalizedProduct,
        comparison: {} as SetupComparisonCategoryResult,
        isOverCategoryBudget: false,
      };

      const report = evaluateBundleDiversity([item1, item2], [
        { id: "req-1", name: "Naruto Action Figure", searchQuery: "", allocationPercentage: 50, allocatedAmount: 40, allocatedAmountMinor: 4000, priority: "high", requirements: [], diversityGroup: "figurine" },
        { id: "req-2", name: "One Piece Collectible Statue", searchQuery: "", allocationPercentage: 50, allocatedAmount: 40, allocatedAmountMinor: 4000, priority: "high", requirements: [], diversityGroup: "figurine" },
      ]);

      assert(report.groupCounts["figurine"] === 2);
      assert(report.redundantGroups.includes("figurine"));
    });

    // Scenario 20: Different decorative product types can coexist in one bundle
    test("20. Different decorative product types can coexist in one bundle", () => {
      const diverseItems = [
        { name: "LED Neon Sign", group: inferDiversityGroup("Naruto LED Neon Sign"), expected: "wall-lighting" },
        { name: "Canvas Wall Art", group: inferDiversityGroup("One Piece Canvas Wall Art"), expected: "wall-art" },
        { name: "Action Figure", group: inferDiversityGroup("Naruto Collectible Figurine"), expected: "figurine" },
        { name: "Bedding Set", group: inferDiversityGroup("Attack on Titan Duvet Bedding"), expected: "bedding" },
        { name: "Area Rug", group: inferDiversityGroup("Anime Floor Carpet Rug"), expected: "rug" },
        { name: "Desk Mat", group: inferDiversityGroup("Anime Extended Mouse Pad Desk Mat"), expected: "desk-mat" },
      ];

      for (const d of diverseItems) {
        assert.equal(d.group, d.expected);
      }
    });

    // Scenario 21: User-requested duplicates are allowed when explicitly specified
    test("21. User-requested duplicates are allowed when explicitly specified", () => {
      const item1 = {
        requirementId: "req-poster-1",
        requirementName: "Naruto Poster Left Wall",
        allocatedAmountMinor: 2000,
        selectedProductId: "poster-1",
        selectedProduct: { title: "Naruto Shippuden Poster A" } as NormalizedProduct,
        comparison: {} as SetupComparisonCategoryResult,
        isOverCategoryBudget: false,
      };
      const item2 = {
        requirementId: "req-poster-2",
        requirementName: "One Piece Poster Right Wall",
        allocatedAmountMinor: 2000,
        selectedProductId: "poster-2",
        selectedProduct: { title: "One Piece Wanted Poster B" } as NormalizedProduct,
        comparison: {} as SetupComparisonCategoryResult,
        isOverCategoryBudget: false,
      };

      const report = evaluateBundleDiversity(
        [item1, item2],
        [
          { id: "req-poster-1", name: "Naruto Poster", searchQuery: "", allocationPercentage: 50, allocatedAmount: 20, allocatedAmountMinor: 2000, priority: "high", requirements: [], diversityGroup: "wall-art" },
          { id: "req-poster-2", name: "One Piece Poster", searchQuery: "", allocationPercentage: 50, allocatedAmount: 20, allocatedAmountMinor: 2000, priority: "high", requirements: [], diversityGroup: "wall-art" },
        ],
        { allowUserRequestedDuplicates: true }
      );

      // Flagging is suppressed when allowUserRequestedDuplicates is true
      assert.equal(report.redundantGroups.length, 0);
    });

    // Scenario 22: Diversity checks do not override mandatory franchise constraints
    test("22. Diversity checks do not override mandatory franchise constraints", () => {
      const req: SetupRequirementItem = {
        id: "req-art",
        name: "Naruto Wall Art",
        searchQuery: "Naruto Wall Art",
        allocationPercentage: 50,
        allocatedAmount: 40,
        allocatedAmountMinor: 4000,
        priority: "high",
        requirements: [],
        requiredFranchises: ["Naruto"],
        diversityGroup: "wall-art",
      };

      // Unrelated franchise (One Piece) product in a different diversity group
      const opRug: NormalizedProduct = {
        source: "channel3",
        sourceProductId: "op-rug",
        title: "One Piece Thousand Sunny Area Rug",
        brand: "Toei",
        imageUrl: "",
        priceMinor: 3500,
        currency: "USD",
        retailerName: "Crunchyroll",
        retailerUrl: "",
        availability: "in_stock",
        specifications: {},
        sourceFacts: [],
      };

      const relevance = evaluateProductRelevance(opRug, req);
      // Must be rejected regardless of diversity
      assert.equal(relevance.isEligible, false);
      assert.equal(relevance.outcome, "unrelated");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 4: RECOMMENDATION INTEGRITY & UI CONTRACT (Scenarios 23 - 28)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Suite 4: Recommendation Integrity & UI Contract", () => {
    // Scenario 23: Gemini cannot select a rejected candidate
    test("23. Gemini cannot select a rejected candidate", () => {
      const candidateIds = ["ch3-naruto-sign-01", "ch3-girl-boss-canvas"];
      const rawComp = {
        comparisons: [
          {
            requirementId: "req-naruto",
            requirementName: "Naruto Wall Art",
            candidateProductIds: candidateIds,
            // Gemini mistakenly tries to recommend the Girl Boss canvas
            recommendedProductId: "ch3-girl-boss-canvas",
            alternativeProductId: "ch3-naruto-sign-01",
            recommendedReason: "Girl Boss canvas has great motivational vibes.",
            keyDifferences: ["Different theme"],
            tradeoffs: ["Not Naruto"],
            missingSpecs: [],
          },
        ],
      };

      const category: SetupCategorySearchResult = {
        requirementId: "req-naruto",
        requirementName: "Naruto Wall Art",
        searchQuery: "Naruto Wall Art",
        allocatedAmountMinor: 5000,
        products: [
          { source: "channel3", sourceProductId: "ch3-naruto-sign-01", title: "Naruto Uzumaki Sign", brand: "B", imageUrl: "", priceMinor: 4000, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: ["Naruto Uzumaki Sign"] },
          { source: "channel3", sourceProductId: "ch3-girl-boss-canvas", title: "Girl Boss Canvas", brand: "B", imageUrl: "", priceMinor: 3500, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: [] },
        ],
        relevanceMap: {
          "ch3-naruto-sign-01": { productId: "ch3-naruto-sign-01", requirementId: "req-naruto", outcome: "direct_match", matchedFranchises: ["Naruto"], matchedCharacters: [], evidenceQuote: "Naruto Uzumaki Sign", evidenceField: "title", isSubstitution: false, explanation: "Matches", isEligible: true },
          "ch3-girl-boss-canvas": { productId: "ch3-girl-boss-canvas", requirementId: "req-naruto", outcome: "unrelated", matchedFranchises: [], matchedCharacters: [], evidenceQuote: "", evidenceField: "none", isSubstitution: false, explanation: "Unrelated", isEligible: false },
        },
        totalCandidatesFound: 2,
        status: "fulfilled",
      };

      const req: SetupRequirementItem = {
        id: "req-naruto",
        name: "Naruto Wall Art",
        searchQuery: "Naruto Wall Art",
        allocationPercentage: 100,
        allocatedAmount: 50,
        allocatedAmountMinor: 5000,
        priority: "high",
        requirements: [],
        requiredFranchises: ["Naruto"],
      };

      const validated = validateSetupComparisons(rawComp, [category], [req]);
      assert.equal(validated.length, 1);
      // Validated comparator rejected the Girl Boss selection and selected the Naruto candidate
      assert.equal(validated[0].recommendedProductId, "ch3-naruto-sign-01");
      assert(validated[0].relevanceBadge?.includes("Naruto"));
    });

    // Scenario 24: A no-match result stays unfilled
    test("24. A no-match result stays unfilled with explicit user actions", () => {
      const req: SetupRequirementItem = {
        id: "req-aot-bedding",
        name: "Attack on Titan Bedding",
        searchQuery: "Attack on Titan Bedding",
        allocationPercentage: 30,
        allocatedAmount: 70,
        allocatedAmountMinor: 7000,
        priority: "high",
        requirements: [],
        requiredFranchises: ["Attack on Titan"],
      };

      const emptyCategory: SetupCategorySearchResult = {
        requirementId: "req-aot-bedding",
        requirementName: "Attack on Titan Bedding",
        searchQuery: "Attack on Titan Bedding",
        allocatedAmountMinor: 7000,
        products: [],
        totalCandidatesFound: 0,
        status: "unavailable",
      };

      const rawComp = { comparisons: [] };

      const validated = validateSetupComparisons(rawComp, [emptyCategory], [req]);
      assert.equal(validated.length, 1);
      assert.equal(validated[0].unfulfilled, true);
      assert.equal(validated[0].recommendedProductId, null);
      assert.equal(validated[0].unfulfilledActions?.length, 4);
      assert(validated[0].unfulfilledActions?.includes("Search with alternative keywords"));
      assert(validated[0].unfulfilledActions?.includes("Explore in another format"));
      assert(validated[0].unfulfilledActions?.includes("Allow general anime decoration"));
      assert(validated[0].unfulfilledActions?.includes("Leave requirement unfilled"));
    });

    // Scenario 25: A generic substitute requires explicit user approval
    test("25. A generic substitute requires explicit user approval", () => {
      const bundle = calculateRecommendedBundle({
        totalBudget: 150,
        currency: "USD",
        requirements: [
          {
            id: "req-aot-bedding",
            name: "Attack on Titan Bedding",
            searchQuery: "Attack on Titan Bedding",
            allocationPercentage: 100,
            allocatedAmount: 150,
            allocatedAmountMinor: 15000,
            priority: "high",
            requirements: [],
            requiredFranchises: ["Attack on Titan"],
          },
        ],
        categories: [
          {
            requirementId: "req-aot-bedding",
            requirementName: "Attack on Titan Bedding",
            searchQuery: "Attack on Titan Bedding",
            allocatedAmountMinor: 15000,
            products: [], // zero eligible AoT products
            totalCandidatesFound: 10,
            status: "unavailable",
            unfulfilledReason: "No qualifying Attack on Titan products found",
          },
        ],
        comparisons: [
          {
            requirementId: "req-aot-bedding",
            requirementName: "Attack on Titan Bedding",
            candidateProductIds: [],
            recommendedProductId: null,
            alternativeProductId: null,
            recommendedReason: "No verified Attack on Titan bedding found.",
            keyDifferences: [],
            tradeoffs: [],
            missingSpecs: [],
            unfulfilled: true,
          },
        ],
      });

      // Does NOT auto-substitute a generic product; leaves requirement unfulfilled
      assert.equal(bundle.items.length, 0);
      assert.equal(bundle.missingRequirements.length, 1);
      assert.equal(bundle.missingRequirements[0], "Attack on Titan Bedding");
    });

    // Scenario 26: Incomplete bundles are never labelled complete
    test("26. Incomplete bundles are never labelled complete", () => {
      const bundle = calculateRecommendedBundle({
        totalBudget: 200,
        currency: "USD",
        requirements: [
          { id: "req-1", name: "Naruto Sign", searchQuery: "", allocationPercentage: 50, allocatedAmount: 100, allocatedAmountMinor: 10000, priority: "high", requirements: [] },
          { id: "req-2", name: "AoT Bedding", searchQuery: "", allocationPercentage: 50, allocatedAmount: 100, allocatedAmountMinor: 10000, priority: "high", requirements: [] },
        ],
        categories: [
          {
            requirementId: "req-1",
            requirementName: "Naruto Sign",
            searchQuery: "",
            allocatedAmountMinor: 10000,
            products: [{ source: "channel3", sourceProductId: "p1", title: "Naruto Neon Sign", brand: "B", imageUrl: "", priceMinor: 8000, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: [] }],
            totalCandidatesFound: 1,
            status: "fulfilled",
          },
          {
            requirementId: "req-2",
            requirementName: "AoT Bedding",
            searchQuery: "",
            allocatedAmountMinor: 10000,
            products: [], // missing AoT
            totalCandidatesFound: 0,
            status: "unavailable",
          },
        ],
        comparisons: [
          { requirementId: "req-1", requirementName: "Naruto Sign", candidateProductIds: ["p1"], recommendedProductId: "p1", alternativeProductId: null, recommendedReason: "Matches", keyDifferences: [], tradeoffs: [], missingSpecs: [] },
          { requirementId: "req-2", requirementName: "AoT Bedding", candidateProductIds: [], recommendedProductId: null, alternativeProductId: null, recommendedReason: "Unfulfilled", keyDifferences: [], tradeoffs: [], missingSpecs: [], unfulfilled: true },
        ],
      });

      assert.equal(bundle.isComplete, false);
      assert.equal(bundle.isPartiallyMatched, true);
      assert.equal(bundle.missingRequirements.length, 1);
      assert.equal(bundle.missingRequirements[0], "AoT Bedding");
    });

    // Scenario 27: Selected alternative changes preserve all hard constraints
    test("27. Selected alternative changes preserve all hard constraints", () => {
      const req: SetupRequirementItem = {
        id: "req-naruto",
        name: "Naruto LED Neon Sign",
        searchQuery: "Naruto LED Neon Sign",
        allocationPercentage: 100,
        allocatedAmount: 100,
        allocatedAmountMinor: 10000,
        priority: "high",
        requirements: [],
        requiredFranchises: ["Naruto"],
      };

      const productA: NormalizedProduct = { source: "channel3", sourceProductId: "n-opt-1", title: "Naruto Shippuden Uzumaki Neon Sign A", brand: "B", imageUrl: "", priceMinor: 4500, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: ["Naruto Sign"] };
      const productB: NormalizedProduct = { source: "channel3", sourceProductId: "n-opt-2", title: "Naruto Shippuden Kakashi Hatake LED Light B", brand: "B", imageUrl: "", priceMinor: 5200, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: ["Naruto Kakashi Light"] };

      // User selects alternative product B
      const bundle = calculateRecommendedBundle({
        totalBudget: 100,
        currency: "USD",
        requirements: [req],
        categories: [{ requirementId: "req-naruto", requirementName: req.name, searchQuery: req.searchQuery, allocatedAmountMinor: 10000, products: [productA, productB], totalCandidatesFound: 2, status: "fulfilled" }],
        comparisons: [{ requirementId: "req-naruto", requirementName: req.name, candidateProductIds: ["n-opt-1", "n-opt-2"], recommendedProductId: "n-opt-1", alternativeProductId: "n-opt-2", recommendedReason: "Option A", keyDifferences: [], tradeoffs: [], missingSpecs: [] }],
        selectedItemIds: { "req-naruto": "n-opt-2" },
      });

      assert.equal(bundle.items.length, 1);
      assert.equal(bundle.items[0].selectedProductId, "n-opt-2");
      assert.equal(bundle.items[0].selectedProduct.title, productB.title);
      // Both product A and product B verify hard Naruto franchise constraint
      assert(evaluateProductRelevance(bundle.items[0].selectedProduct, req).isEligible);
    });

    // Scenario 28: Final budget validation still works correctly
    test("28. Final budget validation still works correctly with integer minor unit math", () => {
      const req1: SetupRequirementItem = { id: "r1", name: "Naruto Sign", searchQuery: "", allocationPercentage: 50, allocatedAmount: 60, allocatedAmountMinor: 6000, priority: "high", requirements: [] };
      const req2: SetupRequirementItem = { id: "r2", name: "One Piece Art", searchQuery: "", allocationPercentage: 50, allocatedAmount: 40, allocatedAmountMinor: 4000, priority: "high", requirements: [] };

      const prod1: NormalizedProduct = { source: "channel3", sourceProductId: "p1", title: "Naruto Sign", brand: "B", imageUrl: "", priceMinor: 4550, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: [] };
      const prod2: NormalizedProduct = { source: "channel3", sourceProductId: "p2", title: "One Piece Canvas", brand: "B", imageUrl: "", priceMinor: 3825, currency: "USD", retailerName: "R", retailerUrl: "", availability: "in_stock", specifications: {}, sourceFacts: [] };

      const bundle = calculateRecommendedBundle({
        totalBudget: 100,
        currency: "USD",
        requirements: [req1, req2],
        categories: [
          { requirementId: "r1", requirementName: "Naruto Sign", searchQuery: "", allocatedAmountMinor: 6000, products: [prod1], totalCandidatesFound: 1, status: "fulfilled" },
          { requirementId: "r2", requirementName: "One Piece Art", searchQuery: "", allocatedAmountMinor: 4000, products: [prod2], totalCandidatesFound: 1, status: "fulfilled" },
        ],
        comparisons: [
          { requirementId: "r1", requirementName: "Naruto Sign", candidateProductIds: ["p1"], recommendedProductId: "p1", alternativeProductId: null, recommendedReason: "Reason 1", keyDifferences: [], tradeoffs: [], missingSpecs: [] },
          { requirementId: "r2", requirementName: "One Piece Art", candidateProductIds: ["p2"], recommendedProductId: "p2", alternativeProductId: null, recommendedReason: "Reason 2", keyDifferences: [], tradeoffs: [], missingSpecs: [] },
        ],
      });

      assert.equal(bundle.isComplete, true);
      assert.equal(bundle.productSubtotalMinor, 4550 + 3825); // 8375 cents ($83.75)
      assert.equal(bundle.remainingBudgetMinor, 10000 - 8375); // 1625 cents ($16.25)
      assert.equal(bundle.totalBudgetMinor, 10000);
      assert(bundle.productSubtotalMinor <= bundle.totalBudgetMinor);
    });
  });
});
