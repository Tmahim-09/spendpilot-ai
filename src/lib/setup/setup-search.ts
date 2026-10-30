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

function getRelevanceRank(outcome?: string): number {
  switch (outcome) {
    case "direct_franchise_match":
      return 100;
    case "verified_character_match":
      return 95;
    case "verified_franchise_alias_match":
      return 90;
    case "direct_match":
      return 85;
    case "verified_same_franchise_substitute":
    case "verified_substitute":
      return 80;
    case "general_anime_theme":
      return 60;
    default:
      return 10;
  }
}

/**
 * Searches Channel3 for each requirement in a multi-product setup with bounded concurrency (default: 2).
 * Enforces:
 * 1. Progressive search: Tier 1 (Franchise + Category), Tier 2 (Targeted Fallback), Tier 3 (General Theme if allowed).
 * 2. Multi-product setup budget is a ceiling, NOT a floor (no 90% floor in setup mode).
 * 3. Strict progressive relevance verification (classifying into 7 tiers, ranking highest relevance first).
 * 4. Maximum 2 distinct eligible alternatives per category.
 * 5. Honest unfulfilled state with actionable fallbacks when no authentic items survive.
 */
export async function executeSetupSearch({
  items,
  currency = "USD",
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

    // Multi-Product Setup enforces budget ceiling, NOT a 90% floor.
    // A $25 figurine with a $45 allocation is completely valid.
    const effectiveMinPrice: number | null = null;
    const effectivePricePreference: PricePreference = "best_value";

    let totalCandidatesFound = 0;
    let totalRejected = 0;
    let fallbackQueryUsed: string | undefined;

    try {
      // ─────────────────────────────────────────────────────────────
      // Pass 1: Primary Franchise/Category Query (fetch up to 30 products)
      // ─────────────────────────────────────────────────────────────
      const primaryQuery = item.searchQuery || item.name;
      let primaryNormalized: NormalizedProduct[];

      if (searchFn) {
        primaryNormalized = await searchFn(
          primaryQuery,
          effectiveMinPrice,
          itemBudget,
          currency
        );
      } else {
        const primaryRes = await searchChannel3Products({
          query: primaryQuery,
          minPrice: effectiveMinPrice,
          maxPrice: itemBudget,
          currency,
          limit: 30,
        });
        primaryNormalized = normalizeChannel3Products(primaryRes.products, currency);
      }

      totalCandidatesFound += primaryNormalized.length;

      // Run progressive relevance evaluation on primary candidates
      const primaryRelevance = filterEligibleCandidates(primaryNormalized, item);
      totalRejected += primaryRelevance.rejectedCount;

      const eligibleCandidates = [...primaryRelevance.eligibleProducts];
      const combinedRelevanceMap: Record<string, RelevanceEvaluationResult> = {
        ...primaryRelevance.relevanceMap,
      };

      // ─────────────────────────────────────────────────────────────
      // Pass 2: Targeted Fallback / Character Query (Only if eligible < 2)
      // ─────────────────────────────────────────────────────────────
      if (eligibleCandidates.length < 2 && item.fallbackQuery && item.fallbackQuery !== primaryQuery) {
        let safeFallback = item.fallbackQuery;
        const targetFranchises = item.requiredFranchises?.length
          ? item.requiredFranchises
          : item.preferredFranchises || [];

        if (targetFranchises.length > 0) {
          const franchise = targetFranchises[0];
          if (!safeFallback.toLowerCase().includes(franchise.toLowerCase())) {
            safeFallback = `${franchise} ${safeFallback}`;
          }
        }

        fallbackQueryUsed = safeFallback;

        let fallbackNormalized: NormalizedProduct[];
        if (searchFn) {
          fallbackNormalized = await searchFn(
            safeFallback,
            effectiveMinPrice,
            itemBudget,
            currency
          );
        } else {
          const fallbackRes = await searchChannel3Products({
            query: safeFallback,
            minPrice: effectiveMinPrice,
            maxPrice: itemBudget,
            currency,
            limit: 20,
          });
          fallbackNormalized = normalizeChannel3Products(fallbackRes.products, currency);
        }

        totalCandidatesFound += fallbackNormalized.length;

        const fallbackRelevance = filterEligibleCandidates(fallbackNormalized, item);
        totalRejected += fallbackRelevance.rejectedCount;

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
      // Pass 3: General Theme Fallback (Only if eligible < 2 and general anime allowed)
      // ─────────────────────────────────────────────────────────────
      if (eligibleCandidates.length < 2 && item.allowGeneralAnimeFallback) {
        const generalThemeQuery = `Japanese anime manga ${item.productCategory || item.name}`;
        if (generalThemeQuery !== primaryQuery && generalThemeQuery !== fallbackQueryUsed) {
          let generalNormalized: NormalizedProduct[];
          if (searchFn) {
            generalNormalized = await searchFn(
              generalThemeQuery,
              effectiveMinPrice,
              itemBudget,
              currency
            );
          } else {
            const generalRes = await searchChannel3Products({
              query: generalThemeQuery,
              minPrice: effectiveMinPrice,
              maxPrice: itemBudget,
              currency,
              limit: 15,
            });
            generalNormalized = normalizeChannel3Products(generalRes.products, currency);
          }

          totalCandidatesFound += generalNormalized.length;

          const generalRelevance = filterEligibleCandidates(generalNormalized, item);
          totalRejected += generalRelevance.rejectedCount;

          for (const [pid, evalRes] of Object.entries(generalRelevance.relevanceMap)) {
            if (!combinedRelevanceMap[pid]) {
              combinedRelevanceMap[pid] = evalRes;
            }
          }

          const existingIds = new Set(eligibleCandidates.map((p) => p.sourceProductId || p.title));
          for (const gProduct of generalRelevance.eligibleProducts) {
            const pid = gProduct.sourceProductId || gProduct.title;
            if (!existingIds.has(pid)) {
              existingIds.add(pid);
              eligibleCandidates.push(gProduct);
            }
          }
        }
      }

      // Sort eligible candidates by progressive relevance tier first, then price
      eligibleCandidates.sort((a, b) => {
        const idA = a.sourceProductId || a.title;
        const idB = b.sourceProductId || b.title;
        const rankA = getRelevanceRank(combinedRelevanceMap[idA]?.outcome);
        const rankB = getRelevanceRank(combinedRelevanceMap[idB]?.outcome);
        if (rankA !== rankB) {
          return rankB - rankA;
        }
        return (b.priceMinor || 0) - (a.priceMinor || 0);
      });

      // ─────────────────────────────────────────────────────────────
      // Pass 4: Price Policy Checks on Eligible Candidates (Budget ceiling)
      // ─────────────────────────────────────────────────────────────
      const { qualifyingProducts, emptyInPreferredRange } = filterQualifyingProducts({
        products: eligibleCandidates,
        budget: itemBudget,
        currency,
        pricePreference: effectivePricePreference,
        expandRange: isExpanded,
      });

      // ─────────────────────────────────────────────────────────────
      // Pass 5: Deduplicate Distinct Products (Max 2 alternatives)
      // ─────────────────────────────────────────────────────────────
      const maxAlts = item.maximumAlternatives || item.maxAlternatives || 2;
      const distinctProducts: NormalizedProduct[] = [];
      const seenProductIds = new Set<string>();

      for (const prod of qualifyingProducts) {
        const id = prod.sourceProductId || prod.title;
        if (!seenProductIds.has(id)) {
          seenProductIds.add(id);
          distinctProducts.push(prod);
        }
        if (distinctProducts.length >= maxAlts) {
          break;
        }
      }

      const status: SetupCategorySearchResult["status"] =
        distinctProducts.length >= 2
          ? "fulfilled"
          : distinctProducts.length === 1
          ? "partial"
          : "unavailable";

      const targetFranchises = item.requiredFranchises?.length
        ? item.requiredFranchises
        : item.preferredFranchises || [];

      const unfulfilledReason =
        distinctProducts.length === 0
          ? targetFranchises.length > 0
            ? `No verified ${targetFranchises.join(" / ")} ${item.name} products were found in current retailer stock.`
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
