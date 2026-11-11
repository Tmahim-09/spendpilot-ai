import type { NormalizedProduct, CanonicalShoppingAttribute, CurrencyCode } from "@/types";
import { detectProductOperatingSystem, normalizeProductTechnicalClaims } from "./spec-normalizer.ts";
import { formatMinorMoney } from "../money.ts";

export interface CandidateEligibilityResult {
  eligibleProducts: NormalizedProduct[];
  disqualifiedProducts: Array<{ product: NormalizedProduct; reason: string }>;
  isNoMatch: boolean;
  noMatchMessage: string | null;
  suggestedAlternatives: string[];
}

/**
 * Builds an enhanced Channel3 search query targeting verified hard requirements
 * (such as "Apple MacBook" when macOS is confirmed) rather than generic keywords.
 */
export function buildConstrainedSearchQuery(
  baseQuery: string,
  canonicalAttributes?: Record<string, CanonicalShoppingAttribute>
): string {
  if (!canonicalAttributes) return baseQuery;

  const osAttr = canonicalAttributes["operating_system"] || canonicalAttributes["os"];
  const mfrAttr = canonicalAttributes["manufacturer"];
  const familyAttr = canonicalAttributes["product_family"];

  const isMacOsHard =
    (osAttr?.constraint === "hard_requirement" && /\b(?:mac|macos|macbook|apple)\b/i.test(String(osAttr.value))) ||
    (mfrAttr?.constraint === "hard_requirement" && /\bapple\b/i.test(String(mfrAttr.value))) ||
    (familyAttr?.constraint === "hard_requirement" && /\bmacbook\b/i.test(String(familyAttr.value)));

  if (isMacOsHard) {
    const lower = baseQuery.toLowerCase();
    if (lower.includes("macbook")) {
      return baseQuery;
    }
    return "Apple MacBook";
  }

  return baseQuery;
}

/**
 * Deterministic Eligibility Gate:
 * Evaluates candidates against active hard requirements.
 * Disqualifies any candidate that violates an explicit hard requirement
 * (e.g., Windows laptops when macOS was selected).
 */
export function filterEligibleCandidates(params: {
  products: NormalizedProduct[];
  canonicalAttributes?: Record<string, CanonicalShoppingAttribute>;
  budgetCents?: number | null;
  currency?: CurrencyCode;
}): CandidateEligibilityResult {
  const { products, canonicalAttributes = {}, budgetCents, currency = "USD" } = params;

  const eligibleProducts: NormalizedProduct[] = [];
  const disqualifiedProducts: Array<{ product: NormalizedProduct; reason: string }> = [];

  // Check for active hard requirements
  const osAttr = canonicalAttributes["operating_system"] || canonicalAttributes["os"];
  const mfrAttr = canonicalAttributes["manufacturer"];
  const familyAttr = canonicalAttributes["product_family"];

  const isMacOsHard =
    (osAttr?.constraint === "hard_requirement" &&
      osAttr.status === "confirmed" &&
      /\b(?:mac|macos|macbook|apple)\b/i.test(String(osAttr.value))) ||
    (mfrAttr?.constraint === "hard_requirement" &&
      mfrAttr.status === "confirmed" &&
      /\bapple\b/i.test(String(mfrAttr.value))) ||
    (familyAttr?.constraint === "hard_requirement" &&
      familyAttr.status === "confirmed" &&
      /\bmacbook\b/i.test(String(familyAttr.value)));

  const isWindowsHard =
    osAttr?.constraint === "hard_requirement" &&
    osAttr.status === "confirmed" &&
    /\b(?:windows|win\s*11|pc)\b/i.test(String(osAttr.value));

  for (const rawProduct of products) {
    // 1. Normalize technical specs and storage claims
    const product = normalizeProductTechnicalClaims(rawProduct);

    // 2. Strict OS check
    const detectedOs = detectProductOperatingSystem(product);
    const brand = (product.brand || "").toLowerCase();
    const title = product.title.toLowerCase();

    if (isMacOsHard) {
      if (detectedOs !== "macOS") {
        disqualifiedProducts.push({
          product,
          reason: `Excluded: Candidate runs ${detectedOs} (${product.brand || "PC"}), but macOS (Apple MacBook) is an explicit hard requirement.`,
        });
        continue;
      }
      if (brand !== "apple" && !title.includes("macbook") && !title.includes("apple mac")) {
        disqualifiedProducts.push({
          product,
          reason: `Excluded: Not an authentic Apple MacBook product.`,
        });
        continue;
      }
    }

    if (isWindowsHard) {
      if (detectedOs === "macOS" || brand === "apple") {
        disqualifiedProducts.push({
          product,
          reason: `Excluded: Candidate is an Apple Mac, but Windows was requested.`,
        });
        continue;
      }
    }

    // 3. Storage Capacity Hard Requirement Verification (e.g. 1TB SSD)
    const storageAttr =
      canonicalAttributes["storage"] ||
      canonicalAttributes["storage-capacity"] ||
      canonicalAttributes["internal_storage"];

    if (storageAttr && storageAttr.status === "confirmed") {
      const requiredVal = String(storageAttr.value).toUpperCase();
      const internalStorage = (product.specifications?.["Storage"] || "").toUpperCase();
      const configStatus = product.configurationStatus || product.specifications?.["Configuration Status"] || "";

      if (requiredVal.includes("1TB")) {
        // Disqualify if product internal storage is strictly lower tier (512GB / 256GB / 128GB) and does not offer 1TB
        if (
          (internalStorage.includes("512GB") || internalStorage.includes("256GB") || internalStorage.includes("128GB")) &&
          !internalStorage.includes("1TB")
        ) {
          disqualifiedProducts.push({
            product,
            reason: `Excluded: Listing provides ${product.specifications?.["Storage"] || "512GB SSD"}, but 1TB SSD was explicitly requested.`,
          });
          continue;
        }

        // Disqualify if merchant offer is unverified for the requested 1TB configuration
        if (configStatus === "unverified" || configStatus.includes("Unverified") || configStatus.includes("not price-verified")) {
          disqualifiedProducts.push({
            product,
            reason: `Excluded: Retailer offer price could not be verified for 1TB SSD configuration. Configuration is not price-verified.`,
          });
          continue;
        }
      } else if (requiredVal.includes("512GB")) {
        if (
          (internalStorage.includes("256GB") || internalStorage.includes("128GB")) &&
          !internalStorage.includes("512GB") &&
          !internalStorage.includes("1TB")
        ) {
          disqualifiedProducts.push({
            product,
            reason: `Excluded: Listing provides ${product.specifications?.["Storage"] || "256GB SSD"}, but 512GB SSD was requested.`,
          });
          continue;
        }
      }
    }

    // 4. Strict Budget ceiling check (No 5% tolerance bypass: ceilings are absolute)
    if (budgetCents && budgetCents > 0) {
      const activePrice =
        product.priceMinor !== null && product.priceMinor !== undefined
          ? product.priceMinor
          : product.selectedOffer?.priceMinor ?? null;

      if (activePrice !== null && activePrice > budgetCents) {
        disqualifiedProducts.push({
          product,
          reason: `Excluded: Price ${formatMinorMoney(activePrice, currency)} exceeds maximum budget ${formatMinorMoney(budgetCents, currency)}.`,
        });
        continue;
      }
    }

    eligibleProducts.push(product);
  }

  // Handle honest no-match scenario
  const isNoMatch = eligibleProducts.length === 0 && products.length > 0;
  let noMatchMessage: string | null = null;
  const suggestedAlternatives: string[] = [];

  if (isNoMatch && isMacOsHard) {
    const budgetStr = budgetCents ? ` within your ${formatMinorMoney(budgetCents, currency)} budget` : "";
    const storageAttr =
      canonicalAttributes["storage"] ||
      canonicalAttributes["storage-capacity"] ||
      canonicalAttributes["internal_storage"];
    const is1TB = storageAttr && String(storageAttr.value).toUpperCase().includes("1TB");

    if (is1TB) {
      noMatchMessage = `I found MacBook listings, but could not price-verify a 1TB SSD configuration${budgetStr}. Retailer listings currently observed do not confirm 1TB storage for the advertised price.`;
      suggestedAlternatives.push(
        "Search certified refurbished 1TB MacBooks",
        "Explore 512GB SSD MacBook models",
        "Adjust budget limit"
      );
    } else {
      noMatchMessage = `I couldn't find a suitable MacBook${budgetStr}. Would you consider a refurbished MacBook or a Windows laptop instead?`;
      suggestedAlternatives.push(
        "Search certified refurbished Apple MacBooks",
        "Explore high-performance Windows laptops under budget",
        "Adjust budget limit"
      );
    }
  } else if (isNoMatch) {
    noMatchMessage = "No candidates satisfied your confirmed requirements within your budget.";
    suggestedAlternatives.push("Adjust budget", "Relax specific filter requirements");
  }

  return {
    eligibleProducts,
    disqualifiedProducts,
    isNoMatch,
    noMatchMessage,
    suggestedAlternatives,
  };
}

