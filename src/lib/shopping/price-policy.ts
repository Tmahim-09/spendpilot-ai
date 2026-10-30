import type { CurrencyCode, NormalizedProduct, PricePreference } from "../../types/index.ts";

export interface BudgetRange {
  hardMax: number;
  preferredMin: number;
  targetPrice: number;
  hardMaxMinor: number;
  preferredMinMinor: number;
  targetPriceMinor: number;
  rangeText: string;
}

/**
 * Calculates near-budget price targets for budget B:
 * - Hard max: B
 * - Preferred min: 90% of B
 * - Preferred target: ~95% of B
 */
export function calculateBudgetRange(
  budget: number,
  currency: CurrencyCode = "USD"
): BudgetRange {
  const hardMax = Math.max(0, budget);
  const preferredMin = Math.round(hardMax * 0.9 * 100) / 100;
  const targetPrice = Math.round(hardMax * 0.95 * 100) / 100;

  const hardMaxMinor = Math.round(hardMax * 100);
  const preferredMinMinor = Math.round(preferredMin * 100);
  const targetPriceMinor = Math.round(targetPrice * 100);

  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  const formatNum = (val: number) =>
    Number.isInteger(val) ? val.toString() : val.toFixed(2);

  const rangeText = `${symbol}${formatNum(preferredMin)}–${symbol}${formatNum(hardMax)}`;

  return {
    hardMax,
    preferredMin,
    targetPrice,
    hardMaxMinor,
    preferredMinMinor,
    targetPriceMinor,
    rangeText,
  };
}

const BEST_VALUE_KEYWORDS = [
  "cheap",
  "cheapest",
  "budget",
  "budget-friendly",
  "affordable",
  "lowest price",
  "low cost",
  "inexpensive",
  "best value",
  "value for money",
  "economical",
];

/**
 * Detects whether the user's natural language query explicitly asks for cheap/best-value options.
 */
export function detectPricePreferenceFromQuery(query: string): PricePreference | null {
  const lower = query.toLowerCase();
  for (const kw of BEST_VALUE_KEYWORDS) {
    // Word boundary or phrase check
    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (regex.test(lower)) {
      return "best_value";
    }
  }
  return null;
}

/**
 * Resolves the effective price preference considering explicit user toggle and natural language intent.
 */
export function resolvePricePreference(
  explicitPreference?: PricePreference,
  query?: string
): PricePreference {
  if (explicitPreference) {
    return explicitPreference;
  }
  if (query) {
    const detected = detectPricePreferenceFromQuery(query);
    if (detected) return detected;
  }
  return "near_budget";
}

export interface FilterQualifyingProductsOptions {
  products: NormalizedProduct[];
  budget: number | null;
  currency?: CurrencyCode;
  pricePreference?: PricePreference;
  expandRange?: boolean;
}

/**
 * Filters and validates genuine products based on the price preference:
 * - Checks offers matching the requested currency.
 * - In Near Budget mode (and not expanded): keeps products with offers in [preferredMinMinor, hardMaxMinor].
 * - In Best Value mode (or expanded): keeps products with offers <= hardMaxMinor.
 * - Incomparable currencies are strictly excluded.
 * - Multiple offers for one product are preserved without creating duplicate products.
 */
export function filterQualifyingProducts({
  products,
  budget,
  currency = "USD",
  pricePreference = "near_budget",
  expandRange = false,
}: FilterQualifyingProductsOptions): {
  qualifyingProducts: NormalizedProduct[];
  emptyInPreferredRange: boolean;
  preferredRange: { min: number; max: number } | null;
  preferredRangeText: string | null;
} {
  if (!products || products.length === 0) {
    const range = budget ? calculateBudgetRange(budget, currency) : null;
    return {
      qualifyingProducts: [],
      emptyInPreferredRange: Boolean(budget && pricePreference === "near_budget" && !expandRange),
      preferredRange: range ? { min: range.preferredMin, max: range.hardMax } : null,
      preferredRangeText: range ? range.rangeText : null,
    };
  }

  if (budget === null || budget <= 0) {
    // No budget constraint: return products with matching currency or valid starting price
    const matched = products.filter(
      (p) => !p.currency || p.currency === currency
    );
    return {
      qualifyingProducts: matched,
      emptyInPreferredRange: false,
      preferredRange: null,
      preferredRangeText: null,
    };
  }

  const range = calculateBudgetRange(budget, currency);
  const isNearBudget = pricePreference === "near_budget" && !expandRange;

  const qualifyingProducts: NormalizedProduct[] = [];

  for (const product of products) {
    // Find valid qualifying offers in the requested currency
    const matchingCurrencyOffers = (product.offers || []).filter(
      (offer) =>
        offer &&
        offer.currency === currency &&
        typeof offer.priceMinor === "number" &&
        offer.priceMinor > 0
    );

    // If product has explicit offers, check if any offer qualifies
    if (matchingCurrencyOffers.length > 0) {
      const qualifyingOffers = matchingCurrencyOffers.filter((offer) => {
        if (offer.priceMinor > range.hardMaxMinor) {
          return false; // Hard maximum strictly enforced!
        }
        if (isNearBudget && offer.priceMinor < range.preferredMinMinor) {
          return false; // Below 90% in Near Budget mode!
        }
        return true;
      });

      if (qualifyingOffers.length > 0) {
        // Clone product and keep its qualifying primary offer
        const primaryOffer = qualifyingOffers[0];
        qualifyingProducts.push({
          ...product,
          priceMinor: primaryOffer.priceMinor,
          compareAtPriceMinor: primaryOffer.compareAtPriceMinor ?? null,
          currency: primaryOffer.currency,
          retailerName: primaryOffer.domain,
          retailerUrl: primaryOffer.url,
          availability: primaryOffer.availability,
          offers: qualifyingOffers,
          offersCount: qualifyingOffers.length,
        });
      }
    } else if (
      product.priceMinor !== null &&
      (!product.currency || product.currency === currency)
    ) {
      // Fallback to top-level price if individual offers array is not detailed
      const price = product.priceMinor;
      if (price <= range.hardMaxMinor) {
        if (!isNearBudget || price >= range.preferredMinMinor) {
          qualifyingProducts.push(product);
        }
      }
    }
  }

  const emptyInPreferredRange = isNearBudget && qualifyingProducts.length === 0;

  return {
    qualifyingProducts,
    emptyInPreferredRange,
    preferredRange: { min: range.preferredMin, max: range.hardMax },
    preferredRangeText: range.rangeText,
  };
}
