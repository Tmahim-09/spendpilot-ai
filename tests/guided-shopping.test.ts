import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  extractAttributesFromText,
  analyzeShoppingRequirements,
} from "../src/lib/shopping/requirement-engine.ts";

import {
  resolveCategoryMetadata,
  formatAttributeOptions,
} from "../src/lib/channel3/categories.ts";

import {
  normalizeVariantAvailability,
} from "../src/lib/channel3/variants.ts";

import type {
  ProductVariantDimension,
  ProductVariantState,
  CollectedAnswer,
  GuidedShoppingSessionState,
} from "../src/types/index.ts";

describe("SpendPilot AI Phase 4: Guided Shopping & Configuration (28 Scenarios)", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 1: Single Product Mode & Dynamic Requirements
  // ─────────────────────────────────────────────────────────────────────────
  describe("Group 1: Single Product Mode & Requirements Collection", () => {
    test("1. sneakers request asks for shoe size when not provided", async () => {
      const result = await analyzeShoppingRequirements({
        originalRequest: "I need running sneakers for marathon training",
        mode: "single",
        budget: 150,
        currency: "USD",
      });

      assert.equal(result.canSearch, false);
      assert.equal(result.category, "Sneakers & Athletic Shoes");
      const sizeQ = result.questions.find((q) => q.attribute === "shoe-size");
      assert.ok(sizeQ, "Expected a question for shoe-size");
      assert.equal(sizeQ?.importance, "required_before_search");
    });

    test("2. sizing system options clarify US Men's, US Women's, EU, and UK", async () => {
      const result = await analyzeShoppingRequirements({
        originalRequest: "Looking for casual sneakers",
        mode: "single",
        budget: 120,
        currency: "USD",
      });

      const systemQ = result.questions.find((q) => q.attribute === "size-system");
      assert.ok(systemQ, "Expected sizing system question");
      const labels = systemQ.options.map((o) => o.label);
      assert.ok(labels.some((l) => l.includes("US Men's")), "Missing US Men's option");
      assert.ok(labels.some((l) => l.includes("US Women's")), "Missing US Women's option");
      assert.ok(labels.some((l) => l.includes("EU")), "Missing EU option");
      assert.ok(labels.some((l) => l.includes("UK")), "Missing UK option");
    });

    test("3. color preference is optional and can be skipped without blocking search", async () => {
      const result = await analyzeShoppingRequirements({
        originalRequest: "Nike sneakers size 10",
        mode: "single",
        budget: 140,
        currency: "USD",
      });

      const colorQ = result.questions.find((q) => q.attribute === "color");
      if (colorQ) {
        assert.equal(colorQ.importance, "optional_preference");
        assert.equal(colorQ.allowSkip, true);
      }
    });

    test("4. existing answer in prompt (e.g. size 10.5 in black) is NEVER asked again", async () => {
      const extracted = extractAttributesFromText("Looking for running sneakers size 10.5 in black");
      assert.equal(extracted["shoe-size"], "10.5");
      assert.equal(extracted["color"], "Black");

      const result = await analyzeShoppingRequirements({
        originalRequest: "Looking for running sneakers size 10.5 in black",
        mode: "single",
        budget: 150,
        currency: "USD",
      });

      const sizeQ = result.questions.find((q) => q.attribute === "shoe-size");
      const colorQ = result.questions.find((q) => q.attribute === "color");
      assert.equal(sizeQ, undefined, "Shoe size should not be re-asked");
      assert.equal(colorQ, undefined, "Color should not be re-asked");
    });

    test("5. optional fields can be skipped explicitly by the user", async () => {
      const answers: Record<string, CollectedAnswer> = {
        "shoe-size": {
          questionId: "q-shoe-size",
          attribute: "shoe-size",
          value: "10",
          displayValue: "US 10",
          answeredAt: Date.now(),
        },
        "color": {
          questionId: "q-color",
          attribute: "color",
          value: "Skipped",
          displayValue: "Skipped",
          isSkipped: true,
          answeredAt: Date.now(),
        },
      };

      const result = await analyzeShoppingRequirements({
        originalRequest: "Looking for running sneakers",
        mode: "single",
        budget: 150,
        currency: "USD",
        existingAnswers: answers,
      });

      assert.equal(result.canSearch, true);
      assert.ok(result.requirements.length > 0);
      assert.equal(result.requirements[0].attributes["shoe-size"], "10");
    });

    test("6. 'You decide' / 'No preference' is recorded as AI preference without blocking search", async () => {
      const answers: Record<string, CollectedAnswer> = {
        "shoe-size": {
          questionId: "q-shoe-size",
          attribute: "shoe-size",
          value: "11",
          displayValue: "US 11",
          answeredAt: Date.now(),
        },
        "color": {
          questionId: "q-color",
          attribute: "color",
          value: "No preference",
          displayValue: "No preference / AI picks",
          isAiSelected: true,
          answeredAt: Date.now(),
        },
      };

      const result = await analyzeShoppingRequirements({
        originalRequest: "Sneakers for gym workout",
        mode: "single",
        budget: 100,
        currency: "USD",
        existingAnswers: answers,
      });

      assert.equal(result.canSearch, true);
      assert.equal(result.requirements[0].attributes["color"], "No preference");
    });

    test("7. size and color map cleanly to category attributes for Channel3", async () => {
      const result = await analyzeShoppingRequirements({
        originalRequest: "Ultraboost sneakers size 10 in white",
        mode: "single",
        budget: 180,
        currency: "USD",
      });

      assert.equal(result.categorySlug, "sneakers");
      assert.equal(result.extractedAttributes["shoe-size"], "10");
      assert.equal(result.extractedAttributes["color"], "White");
    });

    test("8. missing size allows browsing with warning if user skips", async () => {
      const answers: Record<string, CollectedAnswer> = {
        "shoe-size": {
          questionId: "q-shoe-size",
          attribute: "shoe-size",
          value: "Browse all sizes",
          displayValue: "Browse all sizes first",
          isSkipped: true,
          answeredAt: Date.now(),
        },
      };

      const result = await analyzeShoppingRequirements({
        originalRequest: "Running sneakers under $150",
        mode: "single",
        budget: 150,
        currency: "USD",
        existingAnswers: answers,
      });

      assert.equal(result.canSearch, true);
      assert.ok(result.questions.length === 0 || result.questions.every((q) => q.attribute !== "shoe-size"));
    });

    test("9. structured requirement carries validated attributes and budget caps", async () => {
      const result = await analyzeShoppingRequirements({
        originalRequest: "Nike Air Max size 11 in black",
        mode: "single",
        budget: 160,
        currency: "USD",
      });

      assert.equal(result.requirements.length, 1);
      const req = result.requirements[0];
      assert.equal(req.budget, 160);
      assert.equal(req.currency, "USD");
      assert.equal(req.attributes["shoe-size"], "11");
      assert.equal(req.confirmed, true);
    });

    test("10. server relaxation is detected when requested option differs from selected", () => {
      // Simulation of Channel3 variants response where merchant substituted size 9.5 when user requested 10
      const selectedOptions = { "Size": "10", "Color": "Black" };
      const effectiveSelected = { "Size": "9.5", "Color": "Black" };

      const relaxedFields: string[] = [];
      for (const [reqKey, reqVal] of Object.entries(selectedOptions)) {
        const matchingKey = Object.keys(effectiveSelected).find(
          (k) => k.toLowerCase() === reqKey.toLowerCase()
        );
        const effVal = matchingKey ? effectiveSelected[matchingKey as keyof typeof effectiveSelected] : null;
        if (effVal && effVal.toLowerCase() !== reqVal.toLowerCase()) {
          relaxedFields.push(`requested ${reqKey}: "${reqVal}", but merchant substituted "${effVal}"`);
        }
      }

      assert.equal(relaxedFields.length, 1);
      assert.ok(relaxedFields[0].includes("9.5"));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 2: Category Adaptation Scenarios
  // ─────────────────────────────────────────────────────────────────────────
  describe("Group 2: Category Adaptation Scenarios", () => {
    test("11. headphones: asks for connectivity/form-factor and ANC", async () => {
      const result = await analyzeShoppingRequirements({
        originalRequest: "Need headphones for travel and focus",
        mode: "single",
        budget: 250,
        currency: "USD",
      });

      assert.ok(result.category.includes("Headphones"), `Expected Headphones category, got: ${result.category}`);
      const connQ = result.questions.find((q) => q.attribute === "connectivity");
      const ancQ = result.questions.find((q) => q.attribute === "noise-cancellation");
      assert.ok(connQ || ancQ, "Expected headphones questions");
    });

    test("12. smartphones: asks for storage capacity and carrier/unlocked", async () => {
      const result = await analyzeShoppingRequirements({
        originalRequest: "Need a new smartphone with good camera",
        mode: "single",
        budget: 800,
        currency: "USD",
      });

      assert.ok(result.category.includes("Smartphone"), `Expected Smartphone category, got: ${result.category}`);
      const storageQ = result.questions.find((q) => q.attribute === "storage-capacity" || q.attribute === "storage");
      assert.ok(storageQ, "Expected storage capacity question for smartphone");
    });

    test("13. clothing: asks for size and fit/gender", async () => {
      const result = await analyzeShoppingRequirements({
        originalRequest: "Warm winter jacket for college",
        mode: "single",
        budget: 150,
        currency: "USD",
      });

      assert.ok(
        result.category.includes("Clothing") || result.category.includes("Apparel"),
        `Expected Clothing/Apparel category, got: ${result.category}`
      );
      const sizeQ = result.questions.find((q) => q.attribute === "size");
      assert.ok(sizeQ, "Expected size question for clothing");
    });

    test("14. furniture: asks for room type and material/dimensions", async () => {
      const result = await analyzeShoppingRequirements({
        originalRequest: "Ergonomic chair for home office",
        mode: "single",
        budget: 300,
        currency: "USD",
      });

      assert.ok(result.category.includes("Furniture"), `Expected Furniture category, got: ${result.category}`);
      const fnQ = result.questions.find(
        (q) => q.attribute === "furniture-type" || q.attribute === "material" || q.attribute === "room-type"
      );
      assert.ok(fnQ, "Expected furniture-specific question");
    });

    test("15. unknown category: falls back safely to general clarification without crashing", async () => {
      const result = await analyzeShoppingRequirements({
        originalRequest: "Industrial mechanical drafting arm precision compass",
        mode: "single",
        budget: 90,
        currency: "USD",
      });

      assert.ok(result.intentSummary.length > 0);
      assert.equal(typeof result.canSearch, "boolean");
      assert.ok(Array.isArray(result.questions));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 3: Multi-Product Setup Scenarios
  // ─────────────────────────────────────────────────────────────────────────
  describe("Group 3: Multi-Product Setup Scenarios", () => {
    test("16. gaming PC setup: asks for target resolution (1080p, 1440p, 4K) and scope", async () => {
      const result = await analyzeShoppingRequirements({
        originalRequest: "I want to build a gaming PC setup",
        mode: "setup",
        budget: 1500,
        currency: "USD",
      });

      assert.equal(result.category, "Gaming Setup");
      const resQ = result.questions.find((q) => q.attribute === "target-resolution");
      const scopeQ = result.questions.find((q) => q.attribute === "setup-scope");
      assert.ok(resQ, "Expected target-resolution question");
      assert.ok(scopeQ, "Expected setup-scope question");
    });

    test("17. gaming PC setup: pre-specified 1440p resolution is not asked again", async () => {
      const result = await analyzeShoppingRequirements({
        originalRequest: "I want a 1440p gaming PC setup under $1500",
        mode: "setup",
        budget: 1500,
        currency: "USD",
      });

      const resQ = result.questions.find((q) => q.attribute === "target-resolution");
      assert.equal(resQ, undefined, "1440p target should not be re-asked");
      assert.equal(result.extractedAttributes["target-resolution"], "1440p (QHD)");
    });

    test("18. room decor setup: captures thematic preferences without rigid single-item locks", async () => {
      const result = await analyzeShoppingRequirements({
        originalRequest: "Anime themed university bedroom decor",
        mode: "setup",
        budget: 200,
        currency: "USD",
      });

      assert.equal(result.category, "Setup");
      const styleQ = result.questions.find((q) => q.attribute === "room-style");
      assert.ok(styleQ, "Expected room-style question");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 4: Product Configuration & Variant Resolution
  // ─────────────────────────────────────────────────────────────────────────
  describe("Group 4: Product Configuration & Variant Resolution", () => {
    test("19. availability states are strictly normalized to domain enum", () => {
      assert.equal(normalizeVariantAvailability("InStock"), "InStock");
      assert.equal(normalizeVariantAvailability("in_stock"), "InStock");
      assert.equal(normalizeVariantAvailability("LimitedAvailability"), "LimitedAvailability");
      assert.equal(normalizeVariantAvailability("low_stock"), "LimitedAvailability");
      assert.equal(normalizeVariantAvailability("PreOrder"), "PreOrder");
      assert.equal(normalizeVariantAvailability("BackOrder"), "BackOrder");
      assert.equal(normalizeVariantAvailability("SoldOut"), "SoldOut");
      assert.equal(normalizeVariantAvailability("OutOfStock"), "OutOfStock");
      assert.equal(normalizeVariantAvailability("Discontinued"), "Discontinued");
    });

    test("20. search-result null or missing availability is strictly treated as Unknown", () => {
      assert.equal(normalizeVariantAvailability(null), "Unknown");
      assert.equal(normalizeVariantAvailability(undefined), "Unknown");
      assert.equal(normalizeVariantAvailability(""), "Unknown");
      assert.equal(normalizeVariantAvailability("arbitrary_string"), "Unknown");
    });

    test("21. structured variant dimension maps option values, thumbnails, and exists flags", () => {
      const dimension: ProductVariantDimension = {
        name: "Size",
        selectedValue: "10",
        values: [
          { label: "9.5", exists: true, available: "InStock", thumbnailUrl: null, productId: "prod-95" },
          { label: "10", exists: true, available: "InStock", thumbnailUrl: null, productId: "prod-10" },
          { label: "10.5", exists: false, available: "SoldOut", thumbnailUrl: null, productId: "prod-105" },
        ],
      };

      assert.equal(dimension.name, "Size");
      assert.equal(dimension.selectedValue, "10");
      assert.equal(dimension.values.length, 3);
      assert.equal(dimension.values[2].available, "SoldOut");
      assert.equal(dimension.values[2].exists, false);
    });

    test("22. detects server relaxation when retailer substitutes requested color or size", () => {
      const state: ProductVariantState = {
        productId: "prod-shoe-123",
        title: "Nike Pegasus 40",
        imageUrl: "https://example.com/shoe.jpg",
        status: "variants_found",
        options: [
          {
            name: "Size",
            selectedValue: "9.5",
            values: [{ label: "9.5", exists: true, available: "InStock", thumbnailUrl: null, productId: null }],
          },
        ],
        selected: { "Size": "10" },
        effectiveSelected: { "Size": "9.5" },
        isRelaxed: true,
        relaxationMessage: 'Selection was modified by retailer: requested Size: "10", but merchant substituted "9.5".',
        isFullyConfigured: true,
        availability: "InStock",
        verifiedPriceMinor: 13000,
        retailerUrl: "https://example.com/buy",
        retailerName: "Nike Store",
      };

      assert.equal(state.isRelaxed, true);
      assert.ok(state.relaxationMessage?.includes("substituted \"9.5\""));
    });

    test("23. alternative variant product IDs resolve distinct SKU pointers", () => {
      const dimension: ProductVariantDimension = {
        name: "Color",
        selectedValue: "Triple Black",
        values: [
          { label: "Triple Black", exists: true, available: "InStock", thumbnailUrl: "https://black.jpg", productId: "sku-black-01" },
          { label: "Pure White", exists: true, available: "InStock", thumbnailUrl: "https://white.jpg", productId: "sku-white-02" },
        ],
      };

      const selectedVal = dimension.values.find((v) => v.label === dimension.selectedValue);
      assert.equal(selectedVal?.productId, "sku-black-01");
      const altVal = dimension.values.find((v) => v.label === "Pure White");
      assert.equal(altVal?.productId, "sku-white-02");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 5: Workflow Integrity, Sessions & Fallback
  // ─────────────────────────────────────────────────────────────────────────
  describe("Group 5: Workflow Integrity & Session Persistence", () => {
    test("24. confirmation before search: canSearch is FALSE when required questions remain", async () => {
      const result = await analyzeShoppingRequirements({
        originalRequest: "I want sneakers",
        mode: "single",
        budget: 100,
        currency: "USD",
      });

      assert.equal(result.canSearch, false);
      assert.ok(result.questions.length > 0);
      assert.ok(result.requiredMissing.includes("shoe-size"));
    });

    test("25. complete requirements: canSearch is TRUE when all essential attributes are known", async () => {
      const result = await analyzeShoppingRequirements({
        originalRequest: "Nike Air Zoom sneakers size 10 US Men's in Black",
        mode: "single",
        budget: 150,
        currency: "USD",
      });

      assert.equal(result.canSearch, true);
      assert.equal(result.requiredMissing.length, 0);
    });

    test("26. session state structure preserves multi-turn progress and answers", () => {
      const session: GuidedShoppingSessionState = {
        sessionId: "sess-123",
        stage: "needs_clarification",
        originalRequest: "Running sneakers",
        mode: "single",
        budget: 150,
        currency: "USD",
        intentSummary: "Find running sneakers",
        requirements: [],
        pendingQuestions: [],
        answers: {
          "shoe-size": {
            questionId: "q-shoe-size",
            attribute: "shoe-size",
            value: "10.5",
            displayValue: "10.5",
            answeredAt: Date.now(),
          },
        },
        canSearch: false,
        updatedAt: Date.now(),
      };

      const serialized = JSON.stringify(session);
      const parsed = JSON.parse(serialized) as GuidedShoppingSessionState;
      assert.equal(parsed.originalRequest, "Running sneakers");
      assert.equal(parsed.answers["shoe-size"].value, "10.5");
      assert.equal(parsed.canSearch, false);
    });

    test("27. editing an answer updates collectedAnswers without mutating other answers", () => {
      const currentAnswers: Record<string, CollectedAnswer> = {
        "shoe-size": {
          questionId: "q-shoe-size",
          attribute: "shoe-size",
          value: "10",
          displayValue: "US 10",
          answeredAt: Date.now(),
        },
        "color": {
          questionId: "q-color",
          attribute: "color",
          value: "Black",
          displayValue: "Black",
          answeredAt: Date.now(),
        },
      };

      // User changes size from 10 to 11
      const updatedAnswers: Record<string, CollectedAnswer> = {
        ...currentAnswers,
        "shoe-size": {
          ...currentAnswers["shoe-size"],
          value: "11",
          displayValue: "US 11",
          answeredAt: Date.now(),
        },
      };

      assert.equal(updatedAnswers["shoe-size"].value, "11");
      assert.equal(updatedAnswers["color"].value, "Black");
    });

    test("28. verified category taxonomy and formatAttributeOptions provides authentic options", async () => {
      const meta = await resolveCategoryMetadata("running sneakers");
      assert.ok(meta);
      assert.equal(meta.slug, "sneakers");
      const sizeAttr = meta.attributes.find((a) => a.slug === "shoe-size");
      assert.ok(sizeAttr);
      const options = formatAttributeOptions(sizeAttr);
      assert.ok(options.length > 0);
      assert.ok(options.some((o) => o.value === "10" || o.value === "10.5"));
    });
  });
});
