import type {
  ShoppingMode,
  CurrencyCode,
  GuidedQuestion,
  StructuredRequirement,
  CollectedAnswer,
} from "@/types";
import { resolveCategoryMetadata, formatAttributeOptions } from "../channel3/categories.ts";

export interface RequirementAnalysisResult {
  intentSummary: string;
  category: string;
  categorySlug?: string;
  extractedAttributes: Record<string, string | number | boolean>;
  requiredMissing: string[];
  optionalMissing: string[];
  questions: GuidedQuestion[];
  canSearch: boolean;
  requirements: StructuredRequirement[];
}

/**
 * Extracts explicit attributes directly mentioned in the user's raw prompt text
 * so we NEVER ask questions for information the user already provided.
 */
export function extractAttributesFromText(text: string): Record<string, string> {
  const lower = text.toLowerCase();
  const extracted: Record<string, string> = {};

  // 1. Shoe Size extraction (e.g., "size 10", "size 10.5", "11.5 US", "size 9.5 mens", "shoe size is 10.5")
  const shoeSizeMatch =
    lower.match(/\b(?:size|sz)(?:\s*(?:is|:))?\s*([0-9]{1,2}(?:\.[0-9])?)\b/i) ||
    lower.match(/\b([0-9]{1,2}(?:\.[0-9])?)\s*(?:us|uk|eu)\b/i);
  if (shoeSizeMatch) {
    extracted["shoe-size"] = shoeSizeMatch[1];
    extracted["shoe_size"] = shoeSizeMatch[1];
    extracted["size"] = shoeSizeMatch[1];
  }

  // 2. Sizing System extraction
  if (lower.includes("women's") || lower.includes("womens") || lower.includes("women")) {
    extracted["size-system"] = "US Women's";
    extracted["size_system"] = "US Women's";
    extracted["gender"] = "female";
  } else if (lower.includes("men's") || lower.includes("mens") || lower.includes("men")) {
    extracted["size-system"] = "US Men's";
    extracted["size_system"] = "US Men's";
    extracted["gender"] = "male";
  } else if (lower.includes("uk size") || lower.includes(" uk")) {
    extracted["size-system"] = "UK";
    extracted["size_system"] = "UK";
  } else if (lower.includes("eu size") || lower.includes(" eu")) {
    extracted["size-system"] = "EU";
    extracted["size_system"] = "EU";
  }

  // 3. Color extraction
  const commonColors = [
    "black", "white", "grey", "gray", "blue", "red", "green",
    "yellow", "pink", "purple", "orange", "beige", "brown", "navy"
  ];
  for (const c of commonColors) {
    if (new RegExp(`\\b${c}\\b`, "i").test(lower)) {
      extracted["color"] = c.charAt(0).toUpperCase() + c.slice(1);
      break;
    }
  }

  // 4. Operating System & Ecosystem (for Laptops / Tech)
  if (lower.includes("macbook") || lower.includes("macos") || lower.includes("apple mac") || lower.includes("apple")) {
    extracted["operating-system"] = "macOS";
    extracted["operating_system"] = "macOS";
    extracted["manufacturer"] = "Apple";
    extracted["brand"] = "Apple";
    extracted["product-family"] = "MacBook";
    extracted["product_family"] = "MacBook";
  } else if (lower.includes("windows") || lower.includes("pc")) {
    extracted["operating-system"] = "Windows 11";
    extracted["operating_system"] = "Windows 11";
  } else if (lower.includes("chromebook") || lower.includes("chromeos")) {
    extracted["operating-system"] = "ChromeOS";
    extracted["operating_system"] = "ChromeOS";
  } else if (lower.includes("linux")) {
    extracted["operating-system"] = "Linux Friendly";
    extracted["operating_system"] = "Linux Friendly";
  }

  // 4b. Primary and Secondary Laptop Use Case
  const isDev = /\b(?:programming|coding|software|developer|dev|engineer|development)\b/i.test(lower);
  const isStudy = /\b(?:university|college|student|study|studying|school|academic|productivity)\b/i.test(lower);
  const isGaming = /\b(?:gaming|gamer|games)\b/i.test(lower);
  const isCreative = /\b(?:video editing|photo editing|graphic design|creative|rendering)\b/i.test(lower);

  if (isDev && isStudy) {
    extracted["primary-use"] = "Programming & Software Dev";
    extracted["primary_use"] = "Programming & Software Dev";
    extracted["secondary-use"] = "University & General Productivity";
    extracted["secondary_use"] = "University & General Productivity";
  } else if (isDev) {
    extracted["primary-use"] = "Programming & Software Dev";
    extracted["primary_use"] = "Programming & Software Dev";
  } else if (isStudy) {
    extracted["primary-use"] = "University & General Productivity";
    extracted["primary_use"] = "University & General Productivity";
  } else if (isGaming) {
    extracted["primary-use"] = "Gaming";
    extracted["primary_use"] = "Gaming";
  } else if (isCreative) {
    extracted["primary-use"] = "Video Editing & Creative Work";
    extracted["primary_use"] = "Video Editing & Creative Work";
  }

  // 5. Connectivity (for Headphones)
  if (lower.includes("wireless") || lower.includes("bluetooth")) {
    extracted["connectivity"] = "Wireless (Bluetooth)";
  } else if (lower.includes("wired") || lower.includes("3.5mm")) {
    extracted["connectivity"] = "Wired (3.5mm / USB)";
  }

  // 6. Noise Cancellation
  if (lower.includes("noise cancel") || lower.includes("anc") || lower.includes("active noise")) {
    extracted["noise-cancellation"] = "Active Noise Cancelling (ANC)";
    extracted["noise_cancellation"] = "Active Noise Cancelling (ANC)";
  } else if (lower.includes("not necessary") || lower.includes("no anc") || lower.includes("passive")) {
    extracted["noise-cancellation"] = "Standard / Passive";
    extracted["noise_cancellation"] = "Standard / Passive";
  }

  // 7. Form factor (Headphones)
  if (lower.includes("over-ear") || lower.includes("over ear") || lower.includes("overear")) {
    extracted["form-factor"] = "Over-Ear";
    extracted["form_factor"] = "Over-Ear";
  } else if (lower.includes("earbud") || lower.includes("in-ear") || lower.includes("in ear") || lower.includes("inear")) {
    extracted["form-factor"] = "In-Ear / Earbuds";
    extracted["form_factor"] = "In-Ear / Earbuds";
  }

  // 8. Storage capacity
  const storageMatch = lower.match(/\b(128gb|256gb|512gb|1tb|2tb)\b/i);
  if (storageMatch) {
    extracted["storage"] = storageMatch[1].toUpperCase();
    extracted["storage-capacity"] = storageMatch[1].toUpperCase();
  }

  // 8b. Memory / RAM capacity (e.g., "16GB RAM", "16 GB", "32GB memory", "8GB unified memory")
  const ramMatch =
    lower.match(/\b(8gb|16gb|24gb|32gb|64gb)(?:\s*(?:ram|memory|unified\s*memory))?\b/i) ||
    lower.match(/\b(?:ram|memory)(?:\s*(?:is|of|:))?\s*(8gb|16gb|24gb|32gb|64gb)\b/i);
  if (ramMatch) {
    const val = (ramMatch[1] || ramMatch[2]).toUpperCase();
    extracted["memory"] = val;
    extracted["ram"] = val;
  }

  // 9. Gaming PC Setup resolution target
  if (lower.includes("4k")) {
    extracted["target-resolution"] = "4K Ultra HD";
  } else if (lower.includes("1440p") || lower.includes("2k")) {
    extracted["target-resolution"] = "1440p (QHD)";
  } else if (lower.includes("1080p")) {
    extracted["target-resolution"] = "1080p (FHD)";
  }

  // 10. Clothing Size
  const clothSizeMatch = lower.match(/\b(?:size|sz)\s*(xs|s|m|l|xl|xxl|2xl|3xl)\b/i);
  if (clothSizeMatch) {
    extracted["size"] = clothSizeMatch[1].toUpperCase();
  }

  return extracted;
}

/**
 * Analyzes a shopping request, checks category attributes, cross-references existing answers,
 * and generates appropriate questions.
 */
export async function analyzeShoppingRequirements(params: {
  originalRequest: string;
  mode: ShoppingMode;
  budget: number | null;
  currency: CurrencyCode;
  existingAnswers?: Record<string, CollectedAnswer>;
}): Promise<RequirementAnalysisResult> {
  const { originalRequest, mode, budget, currency, existingAnswers = {} } = params;
  const textAttrs = extractAttributesFromText(originalRequest);

  // Combine extracted text attributes with user-answered answers
  const allKnownAttrs: Record<string, string> = { ...textAttrs };
  for (const [k, ans] of Object.entries(existingAnswers)) {
    if (ans && !ans.isSkipped && ans.value !== undefined && ans.value !== null) {
      const val = String(ans.value ?? ans.displayValue);
      const attr = ans.attribute || k;
      allKnownAttrs[attr] = val;
      allKnownAttrs[attr.replace(/-/g, "_")] = val;
      allKnownAttrs[attr.replace(/_/g, "-")] = val;
      allKnownAttrs[k] = val;
      allKnownAttrs[k.replace(/-/g, "_")] = val;
      allKnownAttrs[k.replace(/_/g, "-")] = val;
    }
  }

  // Cross-alias primary use and intended use
  const knownUse =
    allKnownAttrs["primary-use"] ||
    allKnownAttrs["primary_use"] ||
    allKnownAttrs["intended-use"] ||
    allKnownAttrs["intended_use"];
  if (knownUse) {
    allKnownAttrs["primary-use"] = knownUse;
    allKnownAttrs["primary_use"] = knownUse;
    allKnownAttrs["intended-use"] = knownUse;
    allKnownAttrs["intended_use"] = knownUse;
  }

  // Cross-alias operating system
  const knownOs =
    allKnownAttrs["operating-system"] ||
    allKnownAttrs["operating_system"] ||
    allKnownAttrs["os"];
  if (knownOs) {
    allKnownAttrs["operating-system"] = knownOs;
    allKnownAttrs["operating_system"] = knownOs;
    allKnownAttrs["os"] = knownOs;
    if (/\b(?:mac|macos|macbook|apple)\b/i.test(knownOs)) {
      allKnownAttrs["manufacturer"] = "Apple";
      allKnownAttrs["product-family"] = "MacBook";
      allKnownAttrs["product_family"] = "MacBook";
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BRANCH 1: MULTI-PRODUCT SETUP MODE
  // ─────────────────────────────────────────────────────────────────────────────
  if (mode === "setup") {
    return analyzeSetupModeRequirements({
      originalRequest,
      budget,
      currency,
      allKnownAttrs,
      existingAnswers,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BRANCH 2: SINGLE PRODUCT MODE
  // ─────────────────────────────────────────────────────────────────────────────
  return analyzeSingleProductRequirements({
    originalRequest,
    budget,
    currency,
    allKnownAttrs,
    existingAnswers,
  });
}

/**
 * Generates requirement specification and missing questions for Single Product Mode
 */
async function analyzeSingleProductRequirements(params: {
  originalRequest: string;
  budget: number | null;
  currency: CurrencyCode;
  allKnownAttrs: Record<string, string>;
  existingAnswers: Record<string, CollectedAnswer>;
}): Promise<RequirementAnalysisResult> {
  const { originalRequest, budget, currency, allKnownAttrs, existingAnswers } = params;
  const categoryMeta = await resolveCategoryMetadata(originalRequest);
  const questions: GuidedQuestion[] = [];
  const requiredMissing: string[] = [];
  const optionalMissing: string[] = [];

  const categoryName = categoryMeta?.title || "Product";
  const categorySlug = categoryMeta?.slug || "general";

  // Category specific logic
  if (categorySlug === "sneakers") {
    // 1. Shoe Size (Essential / Required for search)
    if (!allKnownAttrs["shoe-size"]) {
      requiredMissing.push("shoe-size");
      const sizeAttr = categoryMeta?.attributes.find((a) => a.slug === "shoe-size");
      const options = sizeAttr
        ? formatAttributeOptions(sizeAttr, 14)
        : [
            { id: "size-8", label: "8", value: "8" },
            { id: "size-8.5", label: "8.5", value: "8.5" },
            { id: "size-9", label: "9", value: "9" },
            { id: "size-9.5", label: "9.5", value: "9.5" },
            { id: "size-10", label: "10", value: "10" },
            { id: "size-10.5", label: "10.5", value: "10.5" },
            { id: "size-11", label: "11", value: "11" },
            { id: "size-11.5", label: "11.5", value: "11.5" },
            { id: "size-12", label: "12", value: "12" },
          ];

      questions.push({
        id: "q-shoe-size",
        attribute: "shoe-size",
        label: "What shoe size do you wear?",
        description: "Selecting your size ensures we only show pairs currently in stock in your fit.",
        inputType: "size_selector",
        options,
        importance: "required_before_search",
        allowSkip: true,
        allowCustom: true,
        categorySlug,
      });
    }

    // 2. Sizing System (if size is known or being asked, but system is not specified)
    if (!allKnownAttrs["size-system"]) {
      optionalMissing.push("size-system");
      questions.push({
        id: "q-size-system",
        attribute: "size-system",
        label: "Which sizing system do you use?",
        description: "Specify standard sizing convention.",
        inputType: "single_select",
        options: [
          { id: "sys-us-men", label: "US Men's", value: "US Men's" },
          { id: "sys-us-women", label: "US Women's", value: "US Women's" },
          { id: "sys-uk", label: "UK", value: "UK" },
          { id: "sys-eu", label: "EU", value: "EU" },
          { id: "sys-not-sure", label: "Not sure", value: "Not sure" },
        ],
        importance: "optional_preference",
        allowSkip: true,
        categorySlug,
      });
    }

    // 3. Preferred Color (Optional preference)
    if (!allKnownAttrs["color"]) {
      optionalMissing.push("color");
      const colorAttr = categoryMeta?.attributes.find((a) => a.slug === "color");
      const colorOptions = colorAttr
        ? formatAttributeOptions(colorAttr, 8)
        : [
            { id: "c-black", label: "Black", value: "Black" },
            { id: "c-white", label: "White", value: "White" },
            { id: "c-grey", label: "Grey", value: "Grey" },
            { id: "c-blue", label: "Blue", value: "Blue" },
          ];

      colorOptions.push({ id: "c-any", label: "No preference", value: "No preference" });

      questions.push({
        id: "q-color",
        attribute: "color",
        label: "Any preferred color?",
        description: "Choose a primary color or select no preference.",
        inputType: "color_swatch",
        options: colorOptions,
        importance: "optional_preference",
        allowSkip: true,
        categorySlug,
      });
    }
  } else if (categorySlug === "headphones") {
    // 1. Form factor
    if (!allKnownAttrs["form-factor"] && !allKnownAttrs["form_factor"]) {
      optionalMissing.push("form_factor");
      questions.push({
        id: "q-form-factor",
        attribute: "form_factor",
        label: "Do you prefer over-ear headphones or earbuds?",
        description: "Choose your preferred fit.",
        inputType: "single_select",
        options: [
          { id: "ff-overear", label: "Over-ear", value: "Over-Ear" },
          { id: "ff-inear", label: "In-ear / Earbuds", value: "In-Ear / Earbuds" },
          { id: "ff-any", label: "No preference", value: "No preference" },
        ],
        importance: "optional_preference",
        allowSkip: true,
        categorySlug,
      });
    }

    // 2. Connectivity
    if (!allKnownAttrs["connectivity"]) {
      optionalMissing.push("connectivity");
      questions.push({
        id: "q-connectivity",
        attribute: "connectivity",
        label: "Do you prefer wireless or wired?",
        description: "Select connection method.",
        inputType: "single_select",
        options: [
          { id: "conn-wireless", label: "Wireless (Bluetooth)", value: "Wireless (Bluetooth)" },
          { id: "conn-wired", label: "Wired (3.5mm / USB)", value: "Wired (3.5mm / USB)" },
          { id: "conn-any", label: "No preference", value: "No preference" },
        ],
        importance: "optional_preference",
        allowSkip: true,
        categorySlug,
      });
    }

    // 3. Noise Cancellation
    if (!allKnownAttrs["noise-cancellation"] && !allKnownAttrs["noise_cancellation"]) {
      optionalMissing.push("noise_cancellation");
      questions.push({
        id: "q-noise-cancellation",
        attribute: "noise_cancellation",
        label: "Would you like Active Noise Cancellation (ANC)?",
        description: "ANC helps block background ambient chatter and commuting noise.",
        inputType: "single_select",
        options: [
          { id: "anc-yes", label: "Yes, ANC is important", value: "Active Noise Cancelling (ANC)" },
          { id: "anc-no", label: "Not necessary", value: "Standard / Passive" },
          { id: "anc-any", label: "No preference", value: "No preference" },
        ],
        importance: "optional_preference",
        allowSkip: true,
        categorySlug,
      });
    }
  } else if (categorySlug === "laptops") {
    // 1. Operating System
    const hasOs = Boolean(
      allKnownAttrs["operating-system"] ||
      allKnownAttrs["operating_system"] ||
      allKnownAttrs["os"] ||
      existingAnswers["q-operating-system"] ||
      existingAnswers["operating-system"] ||
      existingAnswers["operating_system"]
    );
    if (!hasOs) {
      requiredMissing.push("operating-system");
      questions.push({
        id: "q-operating-system",
        attribute: "operating-system",
        label: "Which operating system do you prefer?",
        description: "Select your preferred software environment.",
        inputType: "single_select",
        options: [
          { id: "os-macos", label: "macOS (Apple MacBook)", value: "macOS" },
          { id: "os-windows", label: "Windows 11", value: "Windows 11" },
          { id: "os-chromeos", label: "ChromeOS", value: "ChromeOS" },
          { id: "os-any", label: "No preference / Either", value: "No preference" },
        ],
        importance: "required_before_search",
        allowSkip: true,
        categorySlug,
      });
    }

    // 2. Primary Use
    const hasUse = Boolean(
      allKnownAttrs["primary-use"] ||
      allKnownAttrs["primary_use"] ||
      allKnownAttrs["intended-use"] ||
      allKnownAttrs["intended_use"] ||
      existingAnswers["q-primary-use"] ||
      existingAnswers["primary-use"] ||
      existingAnswers["primary_use"] ||
      existingAnswers["intended-use"] ||
      existingAnswers["intended_use"]
    );
    if (!hasUse) {
      optionalMissing.push("primary-use");
      questions.push({
        id: "q-primary-use",
        attribute: "primary-use",
        label: "What will you mainly use it for?",
        description: "Helps target optimal CPU and battery specifications.",
        inputType: "single_select",
        options: [
          { id: "use-dev", label: "Programming & Development", value: "Programming & Software Dev" },
          { id: "use-study", label: "University & Office Work", value: "University & General Productivity" },
          { id: "use-gaming", label: "Gaming", value: "Gaming" },
          { id: "use-video", label: "Video & Graphic Editing", value: "Video Editing & Creative Work" },
        ],
        importance: "optional_preference",
        allowSkip: true,
        categorySlug,
      });
    }
  } else if (categorySlug === "smartphones") {
    if (!allKnownAttrs["operating-system"]) {
      requiredMissing.push("operating-system");
      questions.push({
        id: "q-operating-system",
        attribute: "operating-system",
        label: "Do you prefer Apple iOS or Android?",
        description: "Choose your mobile ecosystem.",
        inputType: "single_select",
        options: [
          { id: "os-ios", label: "Apple iOS (iPhone)", value: "iOS (iPhone)" },
          { id: "os-android", label: "Android", value: "Android" },
          { id: "os-any", label: "Open to either", value: "No preference" },
        ],
        importance: "required_before_search",
        allowSkip: true,
        categorySlug,
      });
    }
    if (!allKnownAttrs["storage"]) {
      optionalMissing.push("storage");
      questions.push({
        id: "q-storage",
        attribute: "storage",
        label: "What storage capacity do you need?",
        description: "Target onboard phone storage.",
        inputType: "single_select",
        options: [
          { id: "st-128", label: "128GB (Standard)", value: "128GB" },
          { id: "st-256", label: "256GB (Recommended)", value: "256GB" },
          { id: "st-512", label: "512GB (Power user)", value: "512GB" },
          { id: "st-any", label: "No preference", value: "No preference" },
        ],
        importance: "optional_preference",
        allowSkip: true,
        categorySlug,
      });
    }
  } else if (categorySlug === "clothing") {
    if (!allKnownAttrs["size"]) {
      requiredMissing.push("size");
      questions.push({
        id: "q-size",
        attribute: "size",
        label: "What apparel size do you wear?",
        description: "Select your standard clothing size.",
        inputType: "single_select",
        options: [
          { id: "sz-s", label: "Small (S)", value: "S" },
          { id: "sz-m", label: "Medium (M)", value: "M" },
          { id: "sz-l", label: "Large (L)", value: "L" },
          { id: "sz-xl", label: "Extra Large (XL)", value: "XL" },
        ],
        importance: "required_before_search",
        allowSkip: true,
        categorySlug,
      });
    }
  } else if (categorySlug === "furniture") {
    if (!allKnownAttrs["furniture-type"]) {
      optionalMissing.push("furniture-type");
      questions.push({
        id: "q-furniture-type",
        attribute: "furniture-type",
        label: "Which type of furniture or room decor do you need?",
        description: "Specify the item to find.",
        inputType: "single_select",
        options: [
          { id: "fn-chair", label: "Ergonomic Desk Chair", value: "Ergonomic Desk Chair" },
          { id: "fn-desk", label: "Study / Computer Desk", value: "Study / Computer Desk" },
          { id: "fn-art", label: "Wall Decor / Canvas", value: "Wall Decor & Art" },
          { id: "fn-any", label: "Other / Show options", value: "No preference" },
        ],
        importance: "optional_preference",
        allowSkip: true,
        categorySlug,
      });
    }
  }

  const isAmbiguousQuery =
    (categorySlug === "other" || categoryName === "Product") &&
    Object.keys(allKnownAttrs).length === 0 &&
    originalRequest.trim().split(/\s+/).length <= 2 &&
    !/\b(buy|laptop|phone|shoe|shoes|sneaker|headphones?|monitor|watch|tv|tablet|charger|case|bag)\b/i.test(originalRequest);

  if (isAmbiguousQuery && questions.length === 0) {
    questions.push({
      id: "q-product-type",
      attribute: "product-type",
      label: `What kind of ${originalRequest.trim()} product are you looking for?`,
      description: "Specify a product type such as phone, laptop, tablet, or accessories.",
      inputType: "single_select",
      options: [
        { id: "opt-1", label: "Phone / Smartphone", value: "phone" },
        { id: "opt-2", label: "Laptop / Computer", value: "laptop" },
        { id: "opt-3", label: "Tablet", value: "tablet" },
        { id: "opt-4", label: "Accessories", value: "accessories" },
      ],
      importance: "required_before_search",
      allowSkip: false,
    });
  }

  // Filter out questions that have already been answered or skipped by the user
  const remainingQuestions = questions
    .filter((q) => {
      const normAttr = q.attribute.replace(/-/g, "_");
      const hyphenAttr = q.attribute.replace(/_/g, "-");
      const existing =
        existingAnswers[q.id] ||
        existingAnswers[q.attribute] ||
        existingAnswers[normAttr] ||
        existingAnswers[hyphenAttr] ||
        existingAnswers[`q-${q.attribute}`] ||
        existingAnswers[`q-${normAttr}`] ||
        existingAnswers[`q-${hyphenAttr}`];
      if (existing && (existing.isSkipped || existing.value !== undefined)) {
        return false;
      }
      return true;
    });

  // Check if search can begin:
  // Can search if there are NO required_before_search questions remaining,
  // or if the user has explicitly skipped or answered them.
  const hasUnansweredRequired = remainingQuestions.some(
    (q) => q.importance === "required_before_search"
  );
  const canSearch = !hasUnansweredRequired;

  // Construct Channel3 search filters
  const channel3Filters: Record<string, string[]> = {};
  if (allKnownAttrs["shoe-size"]) {
    channel3Filters["shoe-size"] = [allKnownAttrs["shoe-size"]];
  }
  if (allKnownAttrs["color"] && allKnownAttrs["color"] !== "No preference") {
    channel3Filters["color"] = [allKnownAttrs["color"]];
  }
  if (allKnownAttrs["size"]) {
    channel3Filters["size"] = [allKnownAttrs["size"]];
  }

  const singleRequirement: StructuredRequirement = {
    id: "req-single-1",
    name: originalRequest.trim(),
    category: categoryName,
    categorySlug,
    budget,
    currency,
    attributes: allKnownAttrs,
    confirmed: canSearch,
    searchFilters: {
      categorySlug,
      attributes: Object.keys(channel3Filters).length > 0 ? channel3Filters : undefined,
      gender: allKnownAttrs["gender"],
      price: budget ? { max_price: budget } : undefined,
    },
  };

  const intentSummary = `Find ${categoryName.toLowerCase()}${budget ? ` under $${budget}` : ""}`;

  return {
    intentSummary,
    category: categoryName,
    categorySlug,
    extractedAttributes: allKnownAttrs,
    requiredMissing,
    optionalMissing,
    questions: remainingQuestions,
    canSearch,
    requirements: [singleRequirement],
  };
}

/**
 * Generates requirement specification and missing questions for Multi-Product Setup Mode
 */
function analyzeSetupModeRequirements(params: {
  originalRequest: string;
  budget: number | null;
  currency: CurrencyCode;
  allKnownAttrs: Record<string, string>;
  existingAnswers: Record<string, CollectedAnswer>;
}): RequirementAnalysisResult {
  const { originalRequest, budget, currency, allKnownAttrs, existingAnswers } = params;
  const questions: GuidedQuestion[] = [];
  const lower = originalRequest.toLowerCase();

  const isGamingSetup =
    lower.includes("gaming") || lower.includes("pc build") || lower.includes("computer setup");
  const isRoomSetup =
    lower.includes("room") || lower.includes("bedroom") || lower.includes("decor") || lower.includes("anime");

  if (isGamingSetup) {
    // Question 1: Scope of Setup (Tower only vs Complete setup)
    if (!allKnownAttrs["setup-scope"]) {
      questions.push({
        id: "q-setup-scope",
        attribute: "setup-scope",
        label: "What components do you need included?",
        description: "Choose whether you need just the PC tower or the complete desk setup.",
        inputType: "single_select",
        options: [
          { id: "sc-complete", label: "Complete Setup (PC, Monitor & Peripherals)", value: "Complete Setup" },
          { id: "sc-tower-only", label: "PC Tower Only", value: "PC Tower Only" },
          { id: "sc-tower-monitor", label: "PC Tower + High Refresh Monitor", value: "Tower + Monitor" },
        ],
        importance: "required_before_search",
        allowSkip: true,
      });
    }

    // Question 2: Target Performance / Resolution
    if (!allKnownAttrs["target-resolution"]) {
      questions.push({
        id: "q-target-resolution",
        attribute: "target-resolution",
        label: "What gaming resolution are you targeting?",
        description: "Determines GPU and monitor requirements.",
        inputType: "single_select",
        options: [
          { id: "res-1440p", label: "1440p (QHD) - Sweet Spot", value: "1440p (QHD)" },
          { id: "res-4k", label: "4K Ultra HD (High-End)", value: "4K Ultra HD" },
          { id: "res-1080p", label: "1080p (Competitive High FPS)", value: "1080p (FHD)" },
          { id: "res-any", label: "Best available within budget", value: "No preference" },
        ],
        importance: "required_before_search",
        allowSkip: true,
      });
    }

    // Question 3: Primary Use Case
    if (!allKnownAttrs["primary-use"]) {
      questions.push({
        id: "q-primary-use",
        attribute: "primary-use",
        label: "What will you mainly use this build for?",
        description: "Allocates budget balance between CPU and GPU.",
        inputType: "single_select",
        options: [
          { id: "use-aaa", label: "AAA Cinematic Gaming", value: "AAA Gaming" },
          { id: "use-esports", label: "Esports & Competitive FPS", value: "Competitive Gaming" },
          { id: "use-streaming", label: "Gaming + Live Streaming / Editing", value: "Streaming & Gaming" },
        ],
        importance: "optional_preference",
        allowSkip: true,
      });
    }
  } else if (isRoomSetup) {
    if (!allKnownAttrs["room-style"]) {
      questions.push({
        id: "q-room-style",
        attribute: "room-style",
        label: "What style or vibe do you envision for your room?",
        description: "Helps target cohesive wall art, lighting, and decor.",
        inputType: "single_select",
        options: [
          { id: "st-ambient", label: "Modern Ambient (LEDs & Wall Art)", value: "Modern Ambient" },
          { id: "st-cozy", label: "Cozy & Minimalist", value: "Cozy & Minimalist" },
          { id: "st-collector", label: "Showcase & Figurines Display", value: "Showcase Display" },
          { id: "st-any", label: "Balanced mix / You decide", value: "No preference" },
        ],
        importance: "optional_preference",
        allowSkip: true,
      });
    }
  }

  const remainingQuestions = questions
    .filter((q) => {
      const existing = existingAnswers[q.id] || existingAnswers[q.attribute];
      return !(existing && (existing.isSkipped || existing.value !== undefined));
    })
    .slice(0, 3);

  const hasUnansweredRequired = remainingQuestions.some(
    (q) => q.importance === "required_before_search"
  );
  const canSearch = !hasUnansweredRequired;

  const requirements: StructuredRequirement[] = [
    {
      id: "req-setup-core",
      name: originalRequest.trim(),
      category: isGamingSetup ? "Gaming Setup" : isRoomSetup ? "Room Decor Setup" : "Multi-Product Setup",
      budget,
      currency,
      attributes: allKnownAttrs,
      confirmed: canSearch,
    },
  ];

  return {
    intentSummary: `Plan ${isGamingSetup ? "gaming PC setup" : "multi-product setup"}${budget ? ` under $${budget}` : ""}`,
    category: isGamingSetup ? "Gaming Setup" : "Setup",
    extractedAttributes: allKnownAttrs,
    requiredMissing: remainingQuestions.filter((q) => q.importance === "required_before_search").map((q) => q.attribute),
    optionalMissing: remainingQuestions.filter((q) => q.importance === "optional_preference").map((q) => q.attribute),
    questions: remainingQuestions,
    canSearch,
    requirements,
  };
}
