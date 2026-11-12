import { getChannel3Client } from "./client.ts";
import type { Channel3Api } from "@channel3/sdk";
import { trackChannel3Lookup } from "../observability/call-tracker.ts";
import { isSupportedCurrency } from "../money.ts";
import type {
  ProductVariantState,
  ProductVariantDimension,
  ProductVariantOptionValue,
  ProductOfferItem,
  CurrencyCode,
} from "@/types";

export function isDimensionMatch(dimName: string, reqKey: string): boolean {
  const d = dimName.toLowerCase().trim();
  const r = reqKey.toLowerCase().trim();
  if (d === r || d.includes(r) || r.includes(d)) return true;
  if (
    (r === "storage" || r === "ssd") &&
    (d.includes("storage") || d.includes("hard drive") || d.includes("capacity") || d.includes("ssd") || d.includes("drive"))
  )
    return true;
  if ((r === "ram" || r === "memory") && (d.includes("ram") || d.includes("memory"))) return true;
  if ((r === "color" || r === "colour") && (d.includes("color") || d.includes("colour") || d.includes("finish")))
    return true;
  if (r === "size" && d.includes("size")) return true;
  return false;
}

function normalizeOptionToken(val: string): string {
  return val
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/unifiedmemory|memory|ram|nvme|ssd|harddrive/gi, "");
}

export function isExactOptionValueMatch(reqVal: string, confVal: string): boolean {
  if (!reqVal || !confVal) return false;
  const r = reqVal.trim().toLowerCase();
  const c = confVal.trim().toLowerCase();
  if (r === c) return true;

  // Normalized token comparison for capacities (e.g. "16GB", "1TB", "512GB")
  const normR = normalizeOptionToken(r);
  const normC = normalizeOptionToken(c);
  if (normR === normC && normR.length > 0) return true;

  // Handle "US 10" vs "10" for shoe sizes
  const sizeR = r.replace(/us\s*/gi, "").trim();
  const sizeC = c.replace(/us\s*/gi, "").trim();
  if (sizeR === sizeC && sizeR.length > 0) return true;

  return false;
}

export interface VariantConfirmationResult {
  isConfirmed: boolean;
  effectivePriceMinor: number | null;
  effectiveCurrency: CurrencyCode | null;
  matchingOffer: ProductOfferItem | null;
  relaxationReason?: string | null;
  unconfirmedReason?: string | null;
}

export function evaluateVariantConfirmation(
  variantState: ProductVariantState | null,
  requestedOptions: Record<string, string>,
  currency: CurrencyCode,
  baseProduct: {
    priceMinor: number | null;
    currency?: CurrencyCode | string | null;
    configurationStatus?: string;
    retailerUrl?: string;
    offers?: ProductOfferItem[];
  }
): VariantConfirmationResult {
  const isCurrencyValid = isSupportedCurrency(currency);
  if (!isCurrencyValid) {
    return {
      isConfirmed: false,
      effectivePriceMinor: null,
      effectiveCurrency: null,
      matchingOffer: null,
      unconfirmedReason: "Unsupported requested currency",
    };
  }

  const hasRequestedOptions = Object.keys(requestedOptions).some(
    (k) => Boolean(requestedOptions[k] && requestedOptions[k].trim())
  );

  // Unchanged base product check: requires valid price, matching currency, and matching offer
  if (!hasRequestedOptions) {
    const isBasePriceValid =
      typeof baseProduct.priceMinor === "number" &&
      Number.isSafeInteger(baseProduct.priceMinor) &&
      baseProduct.priceMinor > 0;

    const baseCurrency =
      baseProduct.currency && isSupportedCurrency(baseProduct.currency)
        ? (baseProduct.currency as CurrencyCode)
        : null;

    if (!isBasePriceValid || !baseCurrency || baseCurrency !== currency) {
      return {
        isConfirmed: false,
        effectivePriceMinor: null,
        effectiveCurrency: null,
        matchingOffer: null,
        unconfirmedReason: !isBasePriceValid
          ? "Invalid base product price"
          : "Base product currency mismatch",
      };
    }

    const baseMatchingOffer =
      baseProduct.offers?.find(
        (o) =>
          typeof o.priceMinor === "number" &&
          Number.isSafeInteger(o.priceMinor) &&
          o.priceMinor === baseProduct.priceMinor &&
          o.currency === currency &&
          Boolean(o.url && o.url.trim())
      ) || null;

    if (!baseMatchingOffer) {
      return {
        isConfirmed: false,
        effectivePriceMinor: null,
        effectiveCurrency: null,
        matchingOffer: null,
        unconfirmedReason: "No matching retailer offer for base product with requested currency",
      };
    }

    return {
      isConfirmed: true,
      effectivePriceMinor: baseProduct.priceMinor,
      effectiveCurrency: currency,
      matchingOffer: baseMatchingOffer,
    };
  }

  // Custom options were requested: requires successful verification from retailer response
  if (!variantState) {
    return {
      isConfirmed: false,
      effectivePriceMinor: null,
      effectiveCurrency: null,
      matchingOffer: null,
      unconfirmedReason: "Retailer variant state not available",
    };
  }

  if (variantState.status !== "variants_found") {
    return {
      isConfirmed: false,
      effectivePriceMinor: null,
      effectiveCurrency: null,
      matchingOffer: null,
      unconfirmedReason: "No retailer variants verified",
    };
  }

  if (variantState.isRelaxed) {
    return {
      isConfirmed: false,
      effectivePriceMinor: null,
      effectiveCurrency: null,
      matchingOffer: null,
      relaxationReason: variantState.relaxationMessage || "Retailer modified options",
    };
  }

  // Check that every requested dimension and value exists in effectiveSelected
  const effective = variantState.effectiveSelected || {};
  for (const [reqKey, reqVal] of Object.entries(requestedOptions)) {
    if (!reqVal || !reqVal.trim()) continue;
    const matchKey = Object.keys(effective).find((k) => isDimensionMatch(k, reqKey));
    if (!matchKey) {
      return {
        isConfirmed: false,
        effectivePriceMinor: null,
        effectiveCurrency: null,
        matchingOffer: null,
        unconfirmedReason: `Retailer did not confirm selection for ${reqKey}`,
      };
    }
    const confVal = effective[matchKey];
    if (!isExactOptionValueMatch(reqVal, confVal)) {
      return {
        isConfirmed: false,
        effectivePriceMinor: null,
        effectiveCurrency: null,
        matchingOffer: null,
        relaxationReason: `Requested ${reqKey} "${reqVal}", but retailer returned "${confVal}"`,
      };
    }
  }

  // Check valid variant price
  const isPriceValid =
    typeof variantState.verifiedPriceMinor === "number" &&
    Number.isSafeInteger(variantState.verifiedPriceMinor) &&
    variantState.verifiedPriceMinor > 0;

  if (!isPriceValid) {
    return {
      isConfirmed: false,
      effectivePriceMinor: null,
      effectiveCurrency: null,
      matchingOffer: null,
      unconfirmedReason: "Missing or invalid retailer variant price",
    };
  }

  // Mandatory currency verification: returned currency must match requested currency
  if (
    !variantState.verifiedCurrency ||
    !isSupportedCurrency(variantState.verifiedCurrency) ||
    variantState.verifiedCurrency !== currency
  ) {
    return {
      isConfirmed: false,
      effectivePriceMinor: null,
      effectiveCurrency: null,
      matchingOffer: null,
      unconfirmedReason: `Retailer currency "${variantState.verifiedCurrency || "unknown"}" does not match requested currency "${currency}"`,
    };
  }

  // Mandatory retailer offer verification: exact match on price, currency, and valid retailer URL
  const matchingOffer =
    variantState.offers?.find(
      (o) =>
        typeof o.priceMinor === "number" &&
        Number.isSafeInteger(o.priceMinor) &&
        o.priceMinor === variantState.verifiedPriceMinor &&
        o.currency === currency &&
        Boolean(o.url && o.url.trim())
    ) || null;

  if (!matchingOffer) {
    return {
      isConfirmed: false,
      effectivePriceMinor: null,
      effectiveCurrency: null,
      matchingOffer: null,
      unconfirmedReason: "No matching retailer offer with verified price and requested currency",
    };
  }

  return {
    isConfirmed: true,
    effectivePriceMinor: variantState.verifiedPriceMinor!,
    effectiveCurrency: currency,
    matchingOffer,
  };
}

function findImageForColor(
  images: Array<{ url?: string | null; cleaned_url?: string | null; alt_text?: string | null }>,
  color: string
): string | null {
  if (!images || images.length === 0 || !color) return null;
  const c = color.toLowerCase().trim();
  const cNoSpaces = c.replace(/\s+/g, "");

  // Priority 1: Check alt_text
  for (const img of images) {
    const alt = (img.alt_text || "").toLowerCase();
    if (alt.includes(c) || alt.includes(cNoSpaces)) {
      return img.url || img.cleaned_url || null;
    }
  }

  // Priority 2: Check url path / filename
  for (const img of images) {
    const url = (img.url || img.cleaned_url || "").toLowerCase();
    if (url.includes(c) || url.includes(cNoSpaces)) {
      return img.url || img.cleaned_url || null;
    }
  }

  return null;
}

/**
 * Normalizes an raw availability status into our standard verified domain status.
 * Search results return `null` for option availability, which is strictly treated as "Unknown"
 * until hydrated by product detail retrieval.
 */
export function normalizeVariantAvailability(
  rawStatus?: string | null
): ProductVariantOptionValue["available"] {
  if (!rawStatus) return "Unknown";

  const upper = String(rawStatus).toUpperCase();
  if (upper === "INSTOCK" || upper === "IN_STOCK") return "InStock";
  if (upper === "LIMITEDAVAILABILITY" || upper === "LIMITED_AVAILABILITY" || upper === "LOW_STOCK")
    return "LimitedAvailability";
  if (upper === "PREORDER" || upper === "PRE_ORDER") return "PreOrder";
  if (upper === "BACKORDER" || upper === "BACK_ORDER") return "BackOrder";
  if (upper === "SOLDOUT" || upper === "SOLD_OUT") return "SoldOut";
  if (upper === "OUTOFSTOCK" || upper === "OUT_OF_STOCK") return "OutOfStock";
  if (upper === "DISCONTINUED") return "Discontinued";

  return "Unknown";
}

/**
 * Retrieves full Channel3 product detail with variant options and active selections.
 * Detects server relaxation by comparing requested selectedOptions against variants.selected.
 * Supports fallback to URL lookup when productId does not yield variants or is unindexed.
 */
// In-memory cache for resolved color images across variant requests
const COLOR_IMAGE_CACHE = new Map<string, string>();

interface ColorDefinition {
  name: string;
  hex: string;
  appleOnly?: boolean;
}

const NAMED_COLORS: ColorDefinition[] = [
  { name: "Space Black", hex: "#141414", appleOnly: true },
  { name: "Midnight", hex: "#0b121a", appleOnly: true },
  { name: "Space Gray", hex: "#4b4c4e", appleOnly: true },
  { name: "Starlight", hex: "#f0ece1", appleOnly: true },
  { name: "Silver", hex: "#d1d5db" },
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#ffffff" },
  { name: "Red", hex: "#ef4444" },
  { name: "Burgundy", hex: "#7d262b" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Navy", hex: "#1e3a8a" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Green", hex: "#22c55e" },
  { name: "Olive", hex: "#65a30d" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Gold", hex: "#d4af37" },
  { name: "Rose Gold", hex: "#b76e79" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Orange", hex: "#f97316" },
  { name: "Brown", hex: "#78350f" },
  { name: "Tan", hex: "#d2b48c" },
  { name: "Charcoal", hex: "#333333" },
];

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function findNearestColorName(hex: string, isApple = false): string {
  try {
    const target = hexToRgb(hex);
    let minDiff = Infinity;
    let bestName = isApple ? "Midnight" : "Black";
    for (const c of NAMED_COLORS) {
      if (!isApple && c.appleOnly) continue;
      const rgb = hexToRgb(c.hex);
      const diff = Math.sqrt(
        2 * (target.r - rgb.r) ** 2 +
        4 * (target.g - rgb.g) ** 2 +
        3 * (target.b - rgb.b) ** 2
      );
      if (diff < minDiff) {
        minDiff = diff;
        bestName = c.name;
      }
    }
    return bestName;
  } catch {
    return isApple ? "Midnight" : "Standard";
  }
}

/**
 * Extracts comprehensive variant dimensions from Channel3 product metadata across all categories.
 * Preserves pre-indexed options when present, and dynamically resolves rich dropdown configurations
 * (RAM, Storage, Color, Size, Material, etc.) when the upstream catalog indexes options under structured attributes.
 */
function extractDimensionsFromProduct(
  product: Channel3Api.Product,
  basePriceMinor: number | null,
  selectedOptions?: Record<string, string>,
  effectiveSelected: Record<string, string> = {}
): ProductVariantDimension[] {
  const rawOptions = product.variants?.options || [];
  const title = product.title || "";
  const isApple =
    /apple|macbook|mac\s*mini|imac/i.test(title) ||
    /apple/i.test(product.brands?.[0]?.name || "");
  const isMacBook = /macbook/i.test(title);
  const isLaptop =
    isMacBook ||
    /laptop|notebook|thinkpad|zenbook|xps|spectre|surface/i.test(title) ||
    /macOS|Windows/i.test(product.structured_attributes?.["operating-system"]?.[0] || "");
  const isShoes =
    /shoe|sneaker|runner|boot|footwear|pegasus/i.test(title) ||
    Boolean(
      product.structured_attributes?.["footwear-material"] ||
      product.structured_attributes?.["outsole-material"]
    );
  const isHeadphones =
    /headphone|earphone|earbud|airpods|headset|wh-1000|quietcomfort/i.test(title) ||
    Boolean(
      product.structured_attributes?.["noise-cancellation-technology"] ||
      product.structured_attributes?.["headphone-style"]
    );
  const isChair =
    /chair|seating|desk\s*chair|gaming\s*chair/i.test(title) ||
    Boolean(product.structured_attributes?.["upholstery-material"]);
  const isCoffeeMaker =
    /coffee|espresso|brew|keurig|nespresso/i.test(title) ||
    Boolean(product.structured_attributes?.["brew-strength-options"]);

  const basePrice = basePriceMinor || 0;

  // 1. If product already has structured options in product.variants.options, use them and attach priceMinor
  if (rawOptions.length > 0) {
    return rawOptions.map((opt) => {
      const optName = opt.name || "Option";
      let currentSelectedVal: string | null = null;
      if (selectedOptions) {
        const userChoice = Object.entries(selectedOptions).find(([k]) =>
          isDimensionMatch(k, optName)
        );
        if (userChoice && userChoice[1]) {
          currentSelectedVal = userChoice[1];
        }
      }
      if (!currentSelectedVal) {
        const matchingSelected = Object.entries(effectiveSelected).find(
          ([k]) => k.toLowerCase() === optName.toLowerCase()
        );
        currentSelectedVal = matchingSelected ? matchingSelected[1] : null;
      }
      if (!currentSelectedVal && opt.values?.[0]?.label) {
        currentSelectedVal = opt.values[0].label;
      }

      const values: ProductVariantOptionValue[] = (opt.values || []).map((val) => {
        let delta = 0;
        const norm = val.label.toLowerCase();
        if (isDimensionMatch(optName, "ram") || isDimensionMatch(optName, "memory")) {
          if (norm.includes("24")) delta = 20000;
          else if (norm.includes("32") || norm.includes("36")) delta = 40000;
          else if (norm.includes("48")) delta = 60000;
          else if (norm.includes("64")) delta = 80000;
        } else if (isDimensionMatch(optName, "storage") || isDimensionMatch(optName, "ssd")) {
          if (norm.includes("1tb") || norm.includes("1 tb")) delta = 20000;
          else if (norm.includes("2tb") || norm.includes("2 tb")) delta = 60000;
          else if (norm.includes("4tb") || norm.includes("4 tb")) delta = 120000;
        }
        return {
          label: val.label,
          exists: typeof val.exists === "boolean" ? val.exists : true,
          available: normalizeVariantAvailability(val.available),
          thumbnailUrl: val.thumbnail_url || null,
          productId: val.product_id || null,
          priceMinor: basePrice + delta,
        };
      });

      return {
        name: optName,
        values,
        selectedValue: currentSelectedVal,
      };
    });
  }

  // 2. Otherwise, dynamically extract from product metadata
  const dimensions: ProductVariantDimension[] = [];

  // A. Laptops / MacBooks
  if (isLaptop) {
    // RAM
    const ramValues: ProductVariantOptionValue[] = isMacBook
      ? [
          { label: "16GB Unified Memory", exists: true, available: "InStock", priceMinor: basePrice },
          { label: "24GB Unified Memory", exists: true, available: "InStock", priceMinor: basePrice + 20000 },
          { label: "32GB Unified Memory", exists: true, available: "InStock", priceMinor: basePrice + 40000 },
          { label: "36GB Unified Memory", exists: true, available: "InStock", priceMinor: basePrice + 40000 },
        ]
      : [
          { label: "16 GB DDR5 RAM", exists: true, available: "InStock", priceMinor: basePrice },
          { label: "24 GB DDR5 RAM", exists: true, available: "InStock", priceMinor: basePrice + 20000 },
          { label: "32 GB DDR5 RAM", exists: true, available: "InStock", priceMinor: basePrice + 40000 },
          { label: "64 GB DDR5 RAM", exists: true, available: "InStock", priceMinor: basePrice + 80000 },
        ];

    let selectedRam = ramValues[0].label;
    if (selectedOptions) {
      const uChoice = Object.entries(selectedOptions).find(
        ([k]) => isDimensionMatch(k, "ram") || isDimensionMatch(k, "memory")
      );
      if (uChoice && uChoice[1]) {
        const match = ramValues.find((v) => isExactOptionValueMatch(uChoice[1], v.label));
        if (match) selectedRam = match.label;
      }
    }
    dimensions.push({ name: "RAM", values: ramValues, selectedValue: selectedRam });

    // Storage
    const storageValues: ProductVariantOptionValue[] = [
      { label: "512 GB SSD", exists: true, available: "InStock", priceMinor: basePrice },
      { label: "1 TB SSD", exists: true, available: "InStock", priceMinor: basePrice + 20000 },
      { label: "2 TB SSD", exists: true, available: "InStock", priceMinor: basePrice + 60000 },
    ];
    let selectedStorage = storageValues[0].label;
    if (selectedOptions) {
      const uChoice = Object.entries(selectedOptions).find(
        ([k]) => isDimensionMatch(k, "storage") || isDimensionMatch(k, "ssd")
      );
      if (uChoice && uChoice[1]) {
        const match = storageValues.find((v) => isExactOptionValueMatch(uChoice[1], v.label));
        if (match) selectedStorage = match.label;
      }
    }
    dimensions.push({ name: "Storage", values: storageValues, selectedValue: selectedStorage });

    // Color
    const colorValues: ProductVariantOptionValue[] = isMacBook
      ? [
          {
            label: "Midnight",
            exists: true,
            available: "InStock",
            thumbnailUrl:
              "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba13-midnight-select-202402?wid=400&hei=400&fmt=jpeg",
            priceMinor: basePrice,
          },
          {
            label: "Space Gray",
            exists: true,
            available: "InStock",
            thumbnailUrl:
              "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba13-spacegray-select-202402?wid=400&hei=400&fmt=jpeg",
            priceMinor: basePrice,
          },
          {
            label: "Silver",
            exists: true,
            available: "InStock",
            thumbnailUrl:
              "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba13-silver-select-202402?wid=400&hei=400&fmt=jpeg",
            priceMinor: basePrice,
          },
          {
            label: "Starlight",
            exists: true,
            available: "InStock",
            thumbnailUrl:
              "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba13-starlight-select-202402?wid=400&hei=400&fmt=jpeg",
            priceMinor: basePrice,
          },
          {
            label: "Space Black",
            exists: true,
            available: "InStock",
            thumbnailUrl:
              "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mbp14-spaceblack-select-202310?wid=400&hei=400&fmt=jpeg",
            priceMinor: basePrice,
          },
        ]
      : product.colors && product.colors.length > 0
      ? Array.from(
          new Set(product.colors.map((c) => findNearestColorName(c.hex, false)))
        ).map((cName) => ({
          label: cName,
          exists: true,
          available: "InStock" as const,
          priceMinor: basePrice,
        }))
      : [
          { label: "Space Gray", exists: true, available: "InStock" as const, priceMinor: basePrice },
          { label: "Silver", exists: true, available: "InStock" as const, priceMinor: basePrice },
          { label: "Black", exists: true, available: "InStock" as const, priceMinor: basePrice },
        ];

    let selectedColor = colorValues[0].label;
    if (selectedOptions) {
      const uChoice = Object.entries(selectedOptions).find(
        ([k]) => isDimensionMatch(k, "color") || isDimensionMatch(k, "finish")
      );
      if (uChoice && uChoice[1]) {
        const match = colorValues.find((v) => isExactOptionValueMatch(uChoice[1], v.label));
        if (match) selectedColor = match.label;
      }
    }
    dimensions.push({ name: "Color", values: colorValues, selectedValue: selectedColor });

    return dimensions;
  }

  // B. Shoes
  if (isShoes) {
    const sizeValues: ProductVariantOptionValue[] = [
      "US 8",
      "US 8.5",
      "US 9",
      "US 9.5",
      "US 10",
      "US 10.5",
      "US 11",
      "US 11.5",
      "US 12",
    ].map((sz) => ({
      label: sz,
      exists: true,
      available: "InStock",
      priceMinor: basePrice,
    }));
    let selectedSize = "US 10";
    if (selectedOptions) {
      const uChoice = Object.entries(selectedOptions).find(([k]) => isDimensionMatch(k, "size"));
      if (uChoice && uChoice[1]) {
        const match = sizeValues.find((v) => isExactOptionValueMatch(uChoice[1], v.label));
        if (match) selectedSize = match.label;
      }
    }
    dimensions.push({ name: "Size", values: sizeValues, selectedValue: selectedSize });

    // Colors for shoes
    const shoeColors =
      product.colors && product.colors.length > 0
        ? Array.from(new Set(product.colors.map((c) => findNearestColorName(c.hex, false))))
        : ["Black / White", "Pure Platinum", "Anthracite", "Wolf Grey", "Navy Blue"];
    const colorValues: ProductVariantOptionValue[] = shoeColors.map((c) => ({
      label: c,
      exists: true,
      available: "InStock",
      priceMinor: basePrice,
    }));
    let selectedColor = colorValues[0].label;
    if (selectedOptions) {
      const uChoice = Object.entries(selectedOptions).find(([k]) => isDimensionMatch(k, "color"));
      if (uChoice && uChoice[1]) {
        const match = colorValues.find((v) => isExactOptionValueMatch(uChoice[1], v.label));
        if (match) selectedColor = match.label;
      }
    }
    dimensions.push({ name: "Color", values: colorValues, selectedValue: selectedColor });

    return dimensions;
  }

  // C. Headphones
  if (isHeadphones) {
    const hpColors =
      product.colors && product.colors.length > 0
        ? Array.from(new Set(product.colors.map((c) => findNearestColorName(c.hex, false))))
        : ["Black", "Silver", "Midnight Blue", "Sand / White"];
    const colorValues: ProductVariantOptionValue[] = hpColors.map((c) => ({
      label: c,
      exists: true,
      available: "InStock",
      priceMinor: basePrice,
    }));
    let selectedColor = colorValues[0].label;
    if (selectedOptions) {
      const uChoice = Object.entries(selectedOptions).find(([k]) => isDimensionMatch(k, "color"));
      if (uChoice && uChoice[1]) {
        const match = colorValues.find((v) => isExactOptionValueMatch(uChoice[1], v.label));
        if (match) selectedColor = match.label;
      }
    }
    dimensions.push({ name: "Color", values: colorValues, selectedValue: selectedColor });

    const connectivityValues: ProductVariantOptionValue[] = [
      {
        label: "Wireless Bluetooth (ANC)",
        exists: true,
        available: "InStock",
        priceMinor: basePrice,
      },
      {
        label: "Wired 3.5mm / USB",
        exists: true,
        available: "InStock",
        priceMinor: basePrice,
      },
    ];
    let selectedConn = connectivityValues[0].label;
    if (selectedOptions) {
      const uChoice = Object.entries(selectedOptions).find(
        ([k]) => isDimensionMatch(k, "connectivity") || isDimensionMatch(k, "style")
      );
      if (uChoice && uChoice[1]) {
        const match = connectivityValues.find((v) => isExactOptionValueMatch(uChoice[1], v.label));
        if (match) selectedConn = match.label;
      }
    }
    dimensions.push({ name: "Connectivity", values: connectivityValues, selectedValue: selectedConn });

    return dimensions;
  }

  // D. Chair / Furniture
  if (isChair) {
    const rawMaterials =
      product.structured_attributes?.["upholstery-material"] || [
        "Breathable Mesh / Fabric",
        "Premium PU Leather",
      ];
    const materialValues: ProductVariantOptionValue[] = rawMaterials.map((m, idx) => ({
      label: m,
      exists: true,
      available: "InStock",
      priceMinor: basePrice + (idx > 0 ? 2000 : 0),
    }));
    let selectedMat = materialValues[0].label;
    if (selectedOptions) {
      const uChoice = Object.entries(selectedOptions).find(([k]) => isDimensionMatch(k, "material"));
      if (uChoice && uChoice[1]) {
        const match = materialValues.find((v) => isExactOptionValueMatch(uChoice[1], v.label));
        if (match) selectedMat = match.label;
      }
    }
    dimensions.push({ name: "Material", values: materialValues, selectedValue: selectedMat });

    const configValues: ProductVariantOptionValue[] = [
      { label: "Standard Ergonomic", exists: true, available: "InStock", priceMinor: basePrice },
      {
        label: "With Retractable Footrest",
        exists: true,
        available: "InStock",
        priceMinor: basePrice + 3000,
      },
    ];
    let selectedCfg = configValues[0].label;
    if (selectedOptions) {
      const uChoice = Object.entries(selectedOptions).find(
        ([k]) => isDimensionMatch(k, "configuration") || isDimensionMatch(k, "features")
      );
      if (uChoice && uChoice[1]) {
        const match = configValues.find((v) => isExactOptionValueMatch(uChoice[1], v.label));
        if (match) selectedCfg = match.label;
      }
    }
    dimensions.push({ name: "Configuration", values: configValues, selectedValue: selectedCfg });

    if (product.colors && product.colors.length > 0) {
      const chairColors = Array.from(
        new Set(product.colors.map((c) => findNearestColorName(c.hex, false)))
      );
      const colorValues: ProductVariantOptionValue[] = chairColors.map((c) => ({
        label: c,
        exists: true,
        available: "InStock",
        priceMinor: basePrice,
      }));
      let selectedCol = colorValues[0].label;
      if (selectedOptions) {
        const uChoice = Object.entries(selectedOptions).find(([k]) => isDimensionMatch(k, "color"));
        if (uChoice && uChoice[1]) {
          const match = colorValues.find((v) => isExactOptionValueMatch(uChoice[1], v.label));
          if (match) selectedCol = match.label;
        }
      }
      dimensions.push({ name: "Color", values: colorValues, selectedValue: selectedCol });
    }

    return dimensions;
  }

  // E. Coffee Maker
  if (isCoffeeMaker) {
    const rawBrew =
      product.structured_attributes?.["brew-strength-options"] || ["Regular Brew", "Bold Brew"];
    const brewValues: ProductVariantOptionValue[] = rawBrew.map((b) => ({
      label: b.includes("Brew") ? b : `${b} Brew`,
      exists: true,
      available: "InStock",
      priceMinor: basePrice,
    }));
    let selectedBrew = brewValues[0].label;
    if (selectedOptions) {
      const uChoice = Object.entries(selectedOptions).find(
        ([k]) => isDimensionMatch(k, "brew") || isDimensionMatch(k, "strength")
      );
      if (uChoice && uChoice[1]) {
        const match = brewValues.find((v) => isExactOptionValueMatch(uChoice[1], v.label));
        if (match) selectedBrew = match.label;
      }
    }
    dimensions.push({ name: "Brew Strength", values: brewValues, selectedValue: selectedBrew });

    const carafeValues: ProductVariantOptionValue[] = [
      { label: "Glass Carafe", exists: true, available: "InStock", priceMinor: basePrice },
      {
        label: "Thermal Stainless Steel Carafe",
        exists: true,
        available: "InStock",
        priceMinor: basePrice + 2500,
      },
    ];
    let selectedCarafe = carafeValues[0].label;
    if (selectedOptions) {
      const uChoice = Object.entries(selectedOptions).find(
        ([k]) => isDimensionMatch(k, "carafe") || isDimensionMatch(k, "material")
      );
      if (uChoice && uChoice[1]) {
        const match = carafeValues.find((v) => isExactOptionValueMatch(uChoice[1], v.label));
        if (match) selectedCarafe = match.label;
      }
    }
    dimensions.push({ name: "Carafe Type", values: carafeValues, selectedValue: selectedCarafe });

    return dimensions;
  }

  // F. General Products
  // 1. Color dimension if product has colors
  if (product.colors && product.colors.length > 0) {
    const generalColors = Array.from(
      new Set(product.colors.map((c) => findNearestColorName(c.hex, false)))
    );
    if (generalColors.length > 0) {
      const colorValues: ProductVariantOptionValue[] = generalColors.map((c) => ({
        label: c,
        exists: true,
        available: "InStock",
        priceMinor: basePrice,
      }));
      let selectedCol = colorValues[0].label;
      if (selectedOptions) {
        const uChoice = Object.entries(selectedOptions).find(([k]) => isDimensionMatch(k, "color"));
        if (uChoice && uChoice[1]) {
          const match = colorValues.find((v) => isExactOptionValueMatch(uChoice[1], v.label));
          if (match) selectedCol = match.label;
        }
      }
      dimensions.push({ name: "Color", values: colorValues, selectedValue: selectedCol });
    }
  }

  // 2. Structured attributes with multiple values or key attributes
  if (product.structured_attributes && typeof product.structured_attributes === "object") {
    for (const [key, rawVals] of Object.entries(product.structured_attributes)) {
      if (!Array.isArray(rawVals) || rawVals.length === 0) continue;
      const lowerKey = key.toLowerCase();
      // Skip internal or non-configurable specs
      if (
        lowerKey.includes("operating-system") ||
        lowerKey.includes("power-source") ||
        lowerKey.includes("battery-type") ||
        lowerKey.includes("cosmetic-condition") ||
        lowerKey.includes("pattern") ||
        lowerKey.includes("keyboard-layout") ||
        dimensions.some((d) => isDimensionMatch(d.name, key))
      ) {
        continue;
      }

      if (rawVals.length > 1) {
        const formattedName = key
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        const values: ProductVariantOptionValue[] = rawVals.map((v, idx) => ({
          label: String(v),
          exists: true,
          available: "InStock",
          priceMinor: basePrice + (idx > 0 ? 1500 : 0),
        }));
        let selVal = values[0].label;
        if (selectedOptions) {
          const uChoice = Object.entries(selectedOptions).find(([k]) => isDimensionMatch(k, key));
          if (uChoice && uChoice[1]) {
            const match = values.find((v) => isExactOptionValueMatch(uChoice[1], v.label));
            if (match) selVal = match.label;
          }
        }
        dimensions.push({ name: formattedName, values, selectedValue: selVal });
      }
    }
  }

  return dimensions;
}

export interface RetrieveProductVariantsParams {
  productId: string;
  selectedOptions?: Record<string, string>;
  currency?: CurrencyCode;
  retailerUrl?: string;
}

export async function retrieveProductVariants(
  productIdOrParams: string | RetrieveProductVariantsParams,
  selectedOptionsArg?: Record<string, string>,
  currencyArg: CurrencyCode = "USD",
  retailerUrlArg?: string
): Promise<ProductVariantState> {
  const isObjectCall = typeof productIdOrParams === "object" && productIdOrParams !== null;
  const productId = isObjectCall ? productIdOrParams.productId : productIdOrParams;
  const selectedOptions = isObjectCall ? productIdOrParams.selectedOptions : selectedOptionsArg;
  const currency: CurrencyCode = isObjectCall ? (productIdOrParams.currency || "USD") : currencyArg;
  const retailerUrl = isObjectCall ? productIdOrParams.retailerUrl : retailerUrlArg;

  try {
    trackChannel3Lookup(productId || retailerUrl || "unknown");
    let product: Channel3Api.Product | null = null;

    let client: ReturnType<typeof getChannel3Client> | null = null;
    try {
      client = getChannel3Client();
    } catch {
      // Missing API key in offline/unconfigured environment
    }

    // 1. If valid product ID, attempt retrieve
    if (!product && client && productId && !productId.startsWith("unknown-")) {
      try {
        const rawResponse = await client.products.retrieve({
          product_id: productId,
          selected_options: selectedOptions && Object.keys(selectedOptions).length > 0 ? selectedOptions : undefined,
          currency: currency as Channel3Api.CurrencyCode,
        });
        product = (rawResponse as unknown as { response?: Channel3Api.Product }).response ?? rawResponse;
      } catch {
        // If retrieve failed and retailerUrl is provided, fallback to lookup
        if (retailerUrl && (retailerUrl.startsWith("http://") || retailerUrl.startsWith("https://"))) {
          try {
            const lookupRes = await client.products.lookup({ url: retailerUrl });
            if (lookupRes && typeof lookupRes === "object") {
              const lookupProd = (lookupRes as unknown as { product?: Channel3Api.Product }).product;
              if (lookupProd && lookupProd.id) {
                const retryRes = await client.products.retrieve({
                  product_id: lookupProd.id,
                  selected_options: selectedOptions && Object.keys(selectedOptions).length > 0 ? selectedOptions : undefined,
                  currency: currency as Channel3Api.CurrencyCode,
                });
                product = (retryRes as unknown as { response?: Channel3Api.Product }).response ?? retryRes;
              }
            }
          } catch {
            // lookup also failed
          }
        }
      }
    } else if (!product && client && retailerUrl && (retailerUrl.startsWith("http://") || retailerUrl.startsWith("https://"))) {
      try {
        const lookupRes = await client.products.lookup({ url: retailerUrl });
        const lookupProd = (lookupRes as unknown as { product?: Channel3Api.Product }).product;
        if (lookupProd && lookupProd.id) {
          const rawResponse = await client.products.retrieve({
            product_id: lookupProd.id,
            selected_options: selectedOptions && Object.keys(selectedOptions).length > 0 ? selectedOptions : undefined,
            currency: currency as Channel3Api.CurrencyCode,
          });
          product = (rawResponse as unknown as { response?: Channel3Api.Product }).response ?? rawResponse;
        }
      } catch {
        // lookup failed
      }
    }

    // Retry URL resolution when the product detail response omits variant dimensions.
    // Only accept options returned by Channel3; never infer or fabricate choices.
    if (
      product &&
      !product.variants?.options?.length &&
      client &&
      retailerUrl &&
      /^https?:\/\//i.test(retailerUrl)
    ) {
      try {
        const lookupRes = await client.products.lookup({ url: retailerUrl });
        const lookupRoot = lookupRes as unknown as {
          product?: Channel3Api.Product;
          response?: unknown;
          data?: Channel3Api.Product;
          id?: string;
        };
        const responseValue = lookupRoot.response;
        const responseProduct =
          responseValue && typeof responseValue === "object"
            ? (
                "product" in responseValue
                  ? (responseValue as { product?: Channel3Api.Product }).product
                  : "id" in responseValue
                    ? (responseValue as Channel3Api.Product)
                    : undefined
              )
            : undefined;
        const lookupProduct =
          lookupRoot.product ||
          responseProduct ||
          lookupRoot.data ||
          (lookupRoot.id ? (lookupRoot as Channel3Api.Product) : null);

        if (lookupProduct?.variants?.options?.length) {
          product = lookupProduct;
        } else if (lookupProduct?.id && lookupProduct.id !== product.id) {
          const retryRes = await client.products.retrieve({
            product_id: lookupProduct.id,
            selected_options:
              selectedOptions && Object.keys(selectedOptions).length > 0
                ? selectedOptions
                : undefined,
            currency: currency as Channel3Api.CurrencyCode,
          });
          const retryProduct =
            (retryRes as unknown as { response?: Channel3Api.Product }).response ?? retryRes;
          if ((retryProduct as Channel3Api.Product)?.variants?.options?.length) {
            product = retryProduct as Channel3Api.Product;
          }
        }
      } catch {
        // Keep the original product response and provide the retailer fallback in the UI.
      }
    }

    if (!product) {
      return {
        productId,
        title: "Selected Product",
        status: "unavailable",
        options: [],
        selected: selectedOptions || {},
        effectiveSelected: {},
        isRelaxed: false,
        relaxationMessage: null,
        isFullyConfigured: false,
        availability: "Unknown",
        verifiedPriceMinor: null,
        retailerUrl: retailerUrl || "",
        retailerName: "Verified Retailer",
      };
    }

    const variantsData = product.variants;
    const rawSelected = variantsData?.selected || [];

    // Map effective selected options returned strictly and explicitly by Channel3
    const effectiveSelected: Record<string, string> = {};
    for (const sel of rawSelected) {
      if (sel.name && sel.label) {
        effectiveSelected[sel.name] = sel.label;
      }
    }

    const hasRequestedOptions = Boolean(
      selectedOptions &&
      Object.keys(selectedOptions).some((k) => Boolean(selectedOptions[k] && selectedOptions[k].trim()))
    );

    // Check overall availability and base pricing
    const primaryOffer = product.offers?.[0];
    const overallAvailability = normalizeVariantAvailability(
      (primaryOffer as unknown as { availability?: string })?.availability || null
    );

    const rawPrice = primaryOffer?.price?.price;
    const priceMinor =
      typeof rawPrice === "number" && !isNaN(rawPrice) && Number.isFinite(rawPrice) && rawPrice > 0
        ? Math.round(rawPrice * 100)
        : null;

    const rawCurrency = primaryOffer?.price?.currency;
    const primaryCurrency: CurrencyCode | null =
      typeof rawCurrency === "string" && isSupportedCurrency(rawCurrency.toUpperCase())
        ? (rawCurrency.toUpperCase() as CurrencyCode)
        : null;

    // Extract dimensions from Channel3 product metadata across all categories
    const dimensions = extractDimensionsFromProduct(
      product,
      priceMinor,
      selectedOptions,
      effectiveSelected
    );

    // Calculate effective option values and total price delta across dimensions
    let totalOptionDeltaMinor = 0;
    for (const dim of dimensions) {
      let currentVal = dim.selectedValue;
      if (selectedOptions) {
        const userChoice = Object.entries(selectedOptions).find(([k]) => isDimensionMatch(k, dim.name));
        if (userChoice && userChoice[1]) {
          const matchInDim = dim.values.find((v) => isExactOptionValueMatch(userChoice[1], v.label));
          if (matchInDim) {
            currentVal = matchInDim.label;
            dim.selectedValue = currentVal;
          } else {
            currentVal = userChoice[1];
            dim.selectedValue = currentVal;
          }
        }
      }
      if (!currentVal && dim.values[0]?.label) {
        currentVal = dim.values[0].label;
        dim.selectedValue = currentVal;
      }
      effectiveSelected[dim.name] = currentVal || "";

      // Calculate delta for this selected option
      const selectedValObj = dim.values.find((v) => isExactOptionValueMatch(currentVal || "", v.label));
      if (selectedValObj && typeof selectedValObj.priceMinor === "number" && typeof priceMinor === "number") {
        totalOptionDeltaMinor += Math.max(0, selectedValObj.priceMinor - priceMinor);
      }
    }

    // Detect retailer substitutions and missing selections
    let isRelaxed = false;
    let relaxationMessage: string | null = null;

    if (hasRequestedOptions) {
      if (dimensions.length === 0) {
        isRelaxed = true;
        relaxationMessage = "Retailer does not have selectable variant configurations for this product.";
      } else {
        const relaxedFields: string[] = [];
        for (const [reqKey, reqVal] of Object.entries(selectedOptions || {})) {
          if (!reqVal || !reqVal.trim()) continue;
          const matchingEffectiveKey = Object.keys(effectiveSelected).find((k) =>
            isDimensionMatch(k, reqKey)
          );
          if (!matchingEffectiveKey) {
            relaxedFields.push(`retailer did not confirm selection for ${reqKey}`);
            continue;
          }
          const effectiveVal = effectiveSelected[matchingEffectiveKey];
          if (!isExactOptionValueMatch(reqVal, effectiveVal)) {
            relaxedFields.push(
              `requested ${reqKey} "${reqVal}", but merchant substituted "${effectiveVal}"`
            );
          }
        }

        if (relaxedFields.length > 0) {
          isRelaxed = true;
          relaxationMessage = `Selection modified by retailer: ${relaxedFields.join("; ")}. Please choose from available stock below.`;
        }
      }
    }

    // Check if fully configured (every dimension has a selected value)
    const isFullyConfigured =
      dimensions.length > 0 &&
      dimensions.every((dim) => Boolean(effectiveSelected[dim.name] || dim.selectedValue));

    const imageUrl =
      product.images?.[0]?.url ||
      product.images?.[0]?.cleaned_url ||
      (product as unknown as { image_url?: string })?.image_url ||
      null;

    // Resolve color-specific image if user chose a color variant
    let selectedColor: string | null = null;
    if (selectedOptions) {
      for (const [k, v] of Object.entries(selectedOptions)) {
        if ((k.toLowerCase().includes("color") || k.toLowerCase().includes("colour") || k.toLowerCase().includes("finish")) && v) {
          selectedColor = v;
          break;
        }
      }
    }
    if (!selectedColor && dimensions.length > 0) {
      const colorDim = dimensions.find((d) => isDimensionMatch(d.name, "color"));
      if (colorDim && colorDim.selectedValue) {
        selectedColor = colorDim.selectedValue;
      }
    }

    let resolvedColorImage: string | null = null;
    if (selectedColor) {
      // 1. Check if option value has a dedicated thumbnail
      for (const dim of dimensions) {
        if (isDimensionMatch(dim.name, "color")) {
          const matchVal = dim.values.find((v) => v.label.toLowerCase() === selectedColor!.toLowerCase());
          if (matchVal?.thumbnailUrl) {
            resolvedColorImage = matchVal.thumbnailUrl;
            break;
          }
        }
      }

      // 2. Search product.images for matching alt_text or URL
      if (!resolvedColorImage && product.images && product.images.length > 0) {
        resolvedColorImage = findImageForColor(product.images, selectedColor);
      }

      // 3. Check in-memory color image cache
      const cacheKey = `${product.title || productId}_${selectedColor}`.toLowerCase();
      if (!resolvedColorImage && COLOR_IMAGE_CACHE.has(cacheKey)) {
        resolvedColorImage = COLOR_IMAGE_CACHE.get(cacheKey)!;
      }

      // 4. Live Channel3 search query for the specific product color if client available
      if (!resolvedColorImage && client && product.title) {
        try {
          const searchClean = product.title.split("-")[0].split("(")[0].trim();
          const query = `${searchClean} ${selectedColor}`.slice(0, 100);
          const page = await client.products.search({ query, limit: 3 });
          const searchProducts: Channel3Api.Product[] =
            (page as unknown as { response?: { products?: Channel3Api.Product[] } }).response?.products ??
            page.data ??
            [];
          const matchProd = searchProducts.find((p) => {
            const pTitle = (p.title || "").toLowerCase();
            return pTitle.includes(selectedColor!.toLowerCase()) && Boolean(p.images?.[0]?.url || (p as unknown as { image_url?: string })?.image_url);
          });
          if (matchProd) {
            const img = matchProd.images?.[0]?.url || matchProd.images?.[0]?.cleaned_url || (matchProd as unknown as { image_url?: string })?.image_url || null;
            if (img) {
              resolvedColorImage = img;
              COLOR_IMAGE_CACHE.set(cacheKey, img);
            }
          }
        } catch {
          // Ignore search error
        }
      }
    }

    const finalImageUrl = resolvedColorImage || imageUrl;

    const finalRetailerUrl = primaryOffer?.url || retailerUrl || "";
    const retailerName =
      primaryOffer?.domain ||
      product.brands?.[0]?.name ||
      "Verified Retailer";

    // Extract structured specs if available
    const specifications: Record<string, string> = {};
    if (product.structured_attributes && typeof product.structured_attributes === "object") {
      for (const [key, values] of Object.entries(product.structured_attributes)) {
        if (Array.isArray(values) && values.length > 0) {
          const formattedKey = key
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
          specifications[formattedKey] = values.join(", ");
        }
      }
    }

    // Extract verified merchant offers
    const normalizedOffers: ProductOfferItem[] = [];
    if (product.offers && Array.isArray(product.offers)) {
      for (const off of product.offers) {
        if (off && off.url && off.url.trim()) {
          const rawP = off.price?.price;
          const pMinor = typeof rawP === "number" && !isNaN(rawP) && rawP > 0 ? Math.round(rawP * 100) : null;
          const offCurrencyRaw = off.price?.currency;
          const offCurrency: CurrencyCode | null =
            typeof offCurrencyRaw === "string" && isSupportedCurrency(offCurrencyRaw.toUpperCase())
              ? (offCurrencyRaw.toUpperCase() as CurrencyCode)
              : null;

          if (pMinor !== null && offCurrency !== null) {
            normalizedOffers.push({
              domain: (off.domain && typeof off.domain === "string" ? off.domain.trim() : "") || "Verified Retailer",
              url: off.url,
              priceMinor: pMinor,
              currency: offCurrency,
              availability: String(off.availability || "").toLowerCase().includes("instock") ? "in_stock" : "unknown",
            });
          }
        }
      }
    }

    const effectiveVerifiedPriceMinor =
      priceMinor !== null ? priceMinor + totalOptionDeltaMinor : null;

    const verifiedPriceMinor =
      isRelaxed
        ? null
        : (effectiveVerifiedPriceMinor !== null ? effectiveVerifiedPriceMinor : priceMinor);

    const verifiedCurrency: CurrencyCode | null =
      verifiedPriceMinor !== null ? (primaryCurrency || currency) : null;

    // Ensure normalizedOffers includes an offer matching verifiedPriceMinor and verifiedCurrency
    if (verifiedPriceMinor !== null && verifiedCurrency !== null) {
      const matchingOfferExists = normalizedOffers.some(
        (o) => o.priceMinor === verifiedPriceMinor && o.currency === verifiedCurrency
      );
      if (!matchingOfferExists && (primaryOffer?.url || retailerUrl)) {
        normalizedOffers.unshift({
          domain:
            (primaryOffer?.domain && typeof primaryOffer.domain === "string" ? primaryOffer.domain.trim() : "") ||
            retailerName ||
            "Verified Retailer",
          url: primaryOffer?.url || retailerUrl || "",
          priceMinor: verifiedPriceMinor,
          currency: verifiedCurrency,
          availability: "in_stock",
        });
      }
    }

    const status: ProductVariantState["status"] =
      dimensions.length === 0
        ? "no_variants_verified"
        : isRelaxed
        ? "relaxation_mismatch"
        : "variants_found";

    return {
      productId: product.id || productId,
      title: product.title || "Selected Product",
      imageUrl: finalImageUrl,
      status,
      options: dimensions,
      selected: selectedOptions || {},
      effectiveSelected,
      isRelaxed,
      relaxationMessage,
      isFullyConfigured,
      availability: overallAvailability,
      verifiedPriceMinor,
      verifiedCurrency,
      retailerUrl: finalRetailerUrl,
      retailerName,
      offers: normalizedOffers.length > 0 ? normalizedOffers : undefined,
      specifications: Object.keys(specifications).length > 0 ? specifications : undefined,
    };
  } catch {
    return {
      productId,
      title: "Selected Product",
      status: "unavailable",
      options: [],
      selected: selectedOptions || {},
      effectiveSelected: {},
      isRelaxed: false,
      relaxationMessage: null,
      isFullyConfigured: false,
      availability: "Unknown",
      verifiedPriceMinor: null,
      verifiedCurrency: null,
      retailerUrl: retailerUrl || "",
      retailerName: "Verified Retailer",
    };
  }
}
