import { searchChannel3Products } from "../channel3/client.ts";
import { normalizeChannel3Products } from "../channel3/normalize-products.ts";
import { filterQualifyingProducts } from "../shopping/price-policy.ts";
import type {
  CurrencyCode,
  NormalizedProduct,
  PricePreference,
  SetupRequirementItem,
  SetupCategorySearchResult,
} from "../../types/index.ts";

export interface ExecuteSetupSearchOptions {
  items: SetupRequirementItem[];
  totalBudget: number;
  currency?: CurrencyCode;
  pricePreference?: PricePreference;
  expandRequirementIds?: string[];
  concurrencyLimit?: number;
  searchFn?: (query: string, minPrice: number | null, maxPrice: number, currency: CurrencyCode) => Promise<NormalizedProduct[]>;
}

/**
 * Executes a worker pool with bounded concurrency to process an array of async tasks.
 */
async function asyncPool<T, R>(
  concurrency: number,
  items: T[],
  iteratorFn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      try {
        results[index] = await iteratorFn(items[index], index);
      } catch (err: unknown) {
        // Fallback catch to ensure the pool never rejects unexpectedly
        results[index] = err as R;
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Searches Channel3 for each requirement in a multi-product setup with bounded concurrency (default: 2).
 * Strictly enforces:
 * - At most 2 distinct product alternatives per requirement.
 * - Multiple offers for one product are attached to that product, not counted as separate products.
 * - Item allocation budget is the hard max.
 * - 90% preferred min in Near Budget mode (unless expanded or best value).
 * - Individual failures do not erase remaining results.
 */
export async function executeSetupSearch({
  items,
  currency = "USD",
  pricePreference = "near_budget",
  expandRequirementIds = [],
  concurrencyLimit = 2,
  searchFn,
}: ExecuteSetupSearchOptions): Promise<SetupCategorySearchResult[]> {
  if (!items || items.length === 0) {
    return [];
  }

  const expandSet = new Set(expandRequirementIds);

  const searchCategory = async (
    item: SetupRequirementItem
  ): Promise<SetupCategorySearchResult> => {
    const isExpanded = expandSet.has(item.id);
    const itemBudget = item.allocatedAmount;
    const isNearBudget = pricePreference === "near_budget" && !isExpanded;

    const preferredMin = isNearBudget ? Math.round(itemBudget * 0.9 * 100) / 100 : null;

    try {
      let normalized: NormalizedProduct[];

      if (searchFn) {
        normalized = await searchFn(
          item.searchQuery || item.name,
          preferredMin,
          itemBudget,
          currency
        );
      } else {
        // Fetch up to 4 candidates from Channel3 so we can deduplicate products and pick at most 2 distinct ones
        const searchRes = await searchChannel3Products({
          query: item.searchQuery || item.name,
          minPrice: preferredMin,
          maxPrice: itemBudget,
          currency,
          limit: 4,
        });

        normalized = normalizeChannel3Products(searchRes.products, currency);
      }

      // Filter products strictly based on item budget & preferred range
      const { qualifyingProducts, emptyInPreferredRange } = filterQualifyingProducts({
        products: normalized,
        budget: itemBudget,
        currency,
        pricePreference,
        expandRange: isExpanded,
      });

      // Deduplicate distinct products (never treat multiple merchant offers as separate products)
      const distinctProducts: NormalizedProduct[] = [];
      const seenProductIds = new Set<string>();

      for (const prod of qualifyingProducts) {
        const id = prod.sourceProductId || prod.title;
        if (!seenProductIds.has(id)) {
          seenProductIds.add(id);
          distinctProducts.push(prod);
        }
        // Strictly cap at 2 distinct product alternatives per requirement!
        if (distinctProducts.length >= 2) {
          break;
        }
      }

      const status: SetupCategorySearchResult["status"] =
        distinctProducts.length >= 2
          ? "fulfilled"
          : distinctProducts.length === 1
          ? "partial"
          : "unavailable";

      return {
        requirementId: item.id,
        requirementName: item.name,
        searchQuery: item.searchQuery,
        allocatedAmountMinor: item.allocatedAmountMinor,
        products: distinctProducts,
        status,
        emptyInPreferredRange,
        isRangeExpanded: isExpanded,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Search failed for category";
      return {
        requirementId: item.id,
        requirementName: item.name,
        searchQuery: item.searchQuery,
        allocatedAmountMinor: item.allocatedAmountMinor,
        products: [],
        status: "unavailable",
        errorMessage: errorMsg,
      };
    }
  };

  return asyncPool(concurrencyLimit, items, searchCategory);
}
