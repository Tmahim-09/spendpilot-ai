import { searchChannel3Products } from "../channel3/client.ts";
import { normalizeChannel3Products } from "../channel3/normalize-products.ts";
import { filterQualifyingProducts } from "../shopping/price-policy.ts";
import { filterEligibleCandidates, type RelevanceEvaluationResult } from "../relevance/relevance-evaluator.ts";
import type {
  CurrencyCode,
  NormalizedProduct,
  PricePreference,
  SetupRequirementItem,
  SetupCategorySearchResult,
} from "../../types/index.ts";

export interface ExecuteSetupSearchOptions {
  items: SetupRequirementItem[];
  totalBudget?: number;
  currency?: CurrencyCode;
  pricePreference?: PricePreference;
  expandRequirementIds?: string[];
  concurrencyLimit?: number;
  searchFn?: (query: string, minPrice: number | null, maxPrice: number, currency: CurrencyCode) => Promise<NormalizedProduct[]>;
}

export interface SetupSearchDiagnostics {
  totalSearches: number;
  fallbackSearches: number;
  totalCandidates: number;
  rejectedCandidates: number;
  directMatches: number;
  verifiedSubstitutes: number;
  unresolvedRequirements: number;
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
 * Enforces:
 * 1. High-specificity primary query with a 20-candidate pool.
 * 2. Strict server-side relevance verification (rejecting non-matching franchises, characters, or categories).
 * 3. At most one targeted fallback query IF eligible candidates < 2 (preserving the mandatory franchise).
 * 4. Price policy checks (budget ceiling & near-budget targeting).
 * 5. Strictly caps at 2 distinct eligible alternatives per category.
 * 6. Honest unfilled category state when no authentic items survive relevance checks.
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

    let totalCandidatesFound = 0;
    let totalRejected = 0;
    let fallbackQueryUsed: string | undefined;

    try {
      // ─────────────────────────────────────────────────────────────
      // Pass 1: Primary Franchise-Aware Query (fetch up to 20 products)
      // ─────────────────────────────────────────────────────────────
      let primaryNormalized: NormalizedProduct[];

      if (searchFn) {
        primaryNormalized = await searchFn(
          item.searchQuery || item.name,
          preferredMin,
          itemBudget,
          currency
        );
      } else {
        const primaryRes = await searchChannel3Products({
          query: item.searchQuery || item.name,
          minPrice: preferredMin,
          maxPrice: itemBudget,
          currency,
          limit: 20,
        });
        primaryNormalized = normalizeChannel3Products(primaryRes.products, currency);
      }

      totalCandidatesFound += primaryNormalized.length;

      // Run strict relevance evaluation on primary candidates
      const primaryRelevance = filterEligibleCandidates(primaryNormalized, item);
      totalRejected += primaryRelevance.rejectedCount;

      const eligibleCandidates = [...primaryRelevance.eligibleProducts];
      const combinedRelevanceMap: Record<string, RelevanceEvaluationResult> = {
        ...primaryRelevance.relevanceMap,
      };

      // ─────────────────────────────────────────────────────────────
      // Pass 2: Targeted Fallback Query (Only if eligible < 2)
      // ─────────────────────────────────────────────────────────────
      if (eligibleCandidates.length < 2 && item.fallbackQuery && item.fallbackQuery !== item.searchQuery) {
        // Fallback query MUST preserve mandatory franchise!
        let safeFallback = item.fallbackQuery;
        if (item.requiredFranchises && item.requiredFranchises.length > 0) {
          const franchise = item.requiredFranchises[0];
          if (!safeFallback.toLowerCase().includes(franchise.toLowerCase())) {
            safeFallback = `${franchise} ${safeFallback}`;
          }
        }

        fallbackQueryUsed = safeFallback;

        let fallbackNormalized: NormalizedProduct[];
        if (searchFn) {
          fallbackNormalized = await searchFn(
            safeFallback,
            preferredMin,
            itemBudget,
            currency
          );
        } else {
          const fallbackRes = await searchChannel3Products({
            query: safeFallback,
            minPrice: preferredMin,
            maxPrice: itemBudget,
            currency,
            limit: 15,
          });
          fallbackNormalized = normalizeChannel3Products(fallbackRes.products, currency);
        }

        totalCandidatesFound += fallbackNormalized.length;

        // Evaluate relevance of fallback products
        const fallbackRelevance = filterEligibleCandidates(fallbackNormalized, item);
        totalRejected += fallbackRelevance.rejectedCount;

        // Merge maps and deduplicate candidates
        for (const [pid, evalRes] of Object.entries(fallbackRelevance.relevanceMap)) {
          if (!combinedRelevanceMap[pid]) {
            combinedRelevanceMap[pid] = evalRes;
          }
        }

        const existingIds = new Set(eligibleCandidates.map((p) => p.sourceProductId || p.title));
        for (const fbProduct of fallbackRelevance.eligibleProducts) {
          const pid = fbProduct.sourceProductId || fbProduct.title;
          if (!existingIds.has(pid)) {
            existingIds.add(pid);
            eligibleCandidates.push(fbProduct);
          }
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Pass 3: Price Policy Checks on Eligible Candidates
      // ─────────────────────────────────────────────────────────────
      const { qualifyingProducts, emptyInPreferredRange } = filterQualifyingProducts({
        products: eligibleCandidates,
        budget: itemBudget,
        currency,
        pricePreference,
        expandRange: isExpanded,
      });

      // ─────────────────────────────────────────────────────────────
      // Pass 4: Deduplicate Distinct Products (Max 2 alternatives)
      // ─────────────────────────────────────────────────────────────
      const distinctProducts: NormalizedProduct[] = [];
      const seenProductIds = new Set<string>();

      for (const prod of qualifyingProducts) {
        const id = prod.sourceProductId || prod.title;
        if (!seenProductIds.has(id)) {
          seenProductIds.add(id);
          distinctProducts.push(prod);
        }
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

      const unfulfilledReason =
        distinctProducts.length === 0
          ? item.requiredFranchises && item.requiredFranchises.length > 0
            ? `No verified ${item.requiredFranchises.join(" / ")} ${item.name} products were found in current retailer stock.`
            : `No matching products found for ${item.name} within budget.`
          : undefined;

      return {
        requirementId: item.id,
        requirementName: item.name,
        searchQuery: item.searchQuery,
        fallbackQueryUsed,
        allocatedAmountMinor: item.allocatedAmountMinor,
        products: distinctProducts,
        status,
        emptyInPreferredRange,
        isRangeExpanded: isExpanded,
        unfulfilledReason,
        relevanceMap: combinedRelevanceMap as unknown as Record<string, unknown>,
        totalCandidatesFound,
        rejectedCount: totalRejected,
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
        unfulfilledReason: `Search error: ${errorMsg}`,
        totalCandidatesFound,
        rejectedCount: totalRejected,
      };
    }
  };

  return asyncPool(concurrencyLimit, items, searchCategory);
}
