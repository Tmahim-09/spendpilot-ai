import {
  ShoppingWorkspace,
  NormalizedProduct,
  AiComparisonResult,
  EvidenceFact,
  CanonicalShoppingAttribute,
  CurrencyCode,
  ItemSearchStatus,
} from "../../types";
import {
  findItemInWorkspace,
  buildItemSearchFingerprint,
  deriveItemCanonicalAttributes,
  updateItemSearchResults,
} from "./workspace-manager";
import { minorToMajorUnits } from "../money";
import { getProgressMessage } from "../shopping/search-progress";

export interface SearchOrchestratorDependencies {
  searchProducts: (params: {
    query: string;
    budget: number | null;
    currency: CurrencyCode;
    canonicalAttributes?: Record<string, CanonicalShoppingAttribute>;
  }) => Promise<{
    success: boolean;
    products?: NormalizedProduct[];
    error?: string;
  }>;
  recommendProducts?: (params: {
    query: string;
    products: NormalizedProduct[];
    budget: number | null;
    currency: CurrencyCode;
    canonicalAttributes?: Record<string, CanonicalShoppingAttribute>;
  }) => Promise<{
    success: boolean;
    comparison?: AiComparisonResult | null;
    evidenceFacts?: Record<string, EvidenceFact>;
    allProducts?: NormalizedProduct[];
    error?: string;
  }>;
}

export interface ExecuteItemSearchOptions {
  workspace: ShoppingWorkspace;
  itemId: string;
  searchQuery: string;
  budgetMinor?: number | null;
  currency?: CurrencyCode;
  canonicalAttributes?: Record<string, CanonicalShoppingAttribute>;
  explicitSearchId?: string;
  category?: string;
  isWinter?: boolean;
  getCurrentWorkspace?: () => ShoppingWorkspace;
  onProgress?: (stage: "searching" | "comparing" | "completed" | "error", message: string) => void;
}

export interface SearchLifecycleResult {
  accepted: boolean;
  status: "completed" | "error" | "rejected";
  workspace: ShoppingWorkspace;
  searchId: string;
  originatingItemId: string;
  candidates: NormalizedProduct[];
  comparison: AiComparisonResult | null;
  evidenceFacts: Record<string, EvidenceFact>;
  error?: string | null;
  completionMessage?: string | null;
}

/**
 * Prepares and registers a new search ID on a specific workspace item.
 */
export function prepareItemSearch(
  workspace: ShoppingWorkspace,
  options: {
    itemId: string;
    searchQuery: string;
    budgetMinor?: number | null;
    currency?: CurrencyCode;
    canonicalAttributes?: Record<string, CanonicalShoppingAttribute>;
    explicitSearchId?: string;
  }
): {
  workspace: ShoppingWorkspace;
  searchId: string;
  searchFingerprint: string;
  itemCanonicalAttrs: Record<string, CanonicalShoppingAttribute>;
  majorBudget: number | null;
  searchCurrency: CurrencyCode;
} | null {
  const itemRecord = findItemInWorkspace(workspace, options.itemId);
  if (!itemRecord) return null;

  const searchId =
    options.explicitSearchId ||
    `search_${options.itemId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const effectiveBudgetMinor =
    itemRecord.item.individualBudget?.amountMinor ??
    (itemRecord.group.type === "coordinated_setup" ? itemRecord.group.budget?.amountMinor : null) ??
    options.budgetMinor ??
    null;

  const searchCurrency =
    itemRecord.item.individualBudget?.currency ??
    (itemRecord.group.type === "coordinated_setup" ? itemRecord.group.budget?.currency : null) ??
    options.currency ??
    workspace.overallBudget?.currency ??
    "USD";

  const majorBudget = minorToMajorUnits(effectiveBudgetMinor);

  const itemCanonicalAttrs = deriveItemCanonicalAttributes(
    itemRecord.item,
    itemRecord.group,
    options.canonicalAttributes
  );

  const searchFingerprint = buildItemSearchFingerprint({
    itemId: options.itemId,
    searchQuery: options.searchQuery,
    budgetMinor: effectiveBudgetMinor,
    currency: searchCurrency,
    hardConstraints: itemRecord.item.hardConstraints,
    preferences: itemRecord.item.preferences,
    groupRequirements:
      itemRecord.group.type === "coordinated_setup" ? itemRecord.group.sharedRequirements : undefined,
  });

  const nextWs = updateItemSearchResults(workspace, options.itemId, {
    searchId,
    searchFingerprint,
    searchStatus: "searching",
    searchError: null,
  });

  if (nextWs === workspace || nextWs.revision <= workspace.revision) {
    return null;
  }

  return {
    workspace: nextWs,
    searchId,
    searchFingerprint,
    itemCanonicalAttrs,
    majorBudget,
    searchCurrency,
  };
}

/**
 * Executes full search lifecycle with strict search ID verification and item-scoped state isolation.
 */
export function executeItemSearchLifecycle(
  options: ExecuteItemSearchOptions,
  dependencies: SearchOrchestratorDependencies
): Promise<SearchLifecycleResult> {
  return (async (): Promise<SearchLifecycleResult> => {
    const curWs = options.getCurrentWorkspace ? options.getCurrentWorkspace() : options.workspace;
    const itemRecord = findItemInWorkspace(curWs, options.itemId);
    if (!itemRecord) {
      return {
        accepted: false,
        status: "rejected",
        workspace: curWs,
        searchId: options.explicitSearchId || "",
        originatingItemId: options.itemId,
        candidates: [],
        comparison: null,
        evidenceFacts: {},
        error: `Item ${options.itemId} not found in workspace`,
        completionMessage: null,
      };
    }

    const prepared = prepareItemSearch(curWs, {
      itemId: options.itemId,
      searchQuery: options.searchQuery,
      budgetMinor: options.budgetMinor,
      currency: options.currency,
      canonicalAttributes: options.canonicalAttributes,
      explicitSearchId: options.explicitSearchId,
    });

    if (!prepared) {
      return {
        accepted: false,
        status: "rejected",
        workspace: curWs,
        searchId: options.explicitSearchId || "",
        originatingItemId: options.itemId,
        candidates: [],
        comparison: null,
        evidenceFacts: {},
        error: "Failed to initialize search in workspace",
        completionMessage: null,
      };
    }

    const { searchId, searchFingerprint, itemCanonicalAttrs, majorBudget, searchCurrency } = prepared;
    let activeWs = prepared.workspace;

    const category = options.category || itemRecord.item.category || "";
    const isWinter = Boolean(options.isWinter);

    // Progress: searching
    const searchingMsg = getProgressMessage("searching", options.searchQuery, category, { isWinter });
    options.onProgress?.("searching", searchingMsg);

    let searchResult: {
      success: boolean;
      products?: NormalizedProduct[];
      error?: string;
    };

    try {
      searchResult = await dependencies.searchProducts({
        query: options.searchQuery,
        budget: majorBudget,
        currency: searchCurrency,
        canonicalAttributes: itemCanonicalAttrs,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Search call failed";
      searchResult = { success: false, error: errMsg };
    }

    // Refresh current workspace before applying search results
    activeWs = options.getCurrentWorkspace ? options.getCurrentWorkspace() : activeWs;

    if (!searchResult.success) {
      const errorMsg = searchResult.error || "Unable to retrieve products";
      const nextWs = updateItemSearchResults(activeWs, options.itemId, {
        searchId,
        searchStatus: "error",
        searchError: errorMsg,
      });
      const accepted = nextWs !== activeWs && nextWs.revision > activeWs.revision;
      options.onProgress?.("error", errorMsg);
      return {
        accepted,
        status: accepted ? "error" : "rejected",
        workspace: nextWs,
        searchId,
        originatingItemId: options.itemId,
        candidates: [],
        comparison: null,
        evidenceFacts: {},
        error: errorMsg,
        completionMessage: null,
      };
    }

    const retrievedProducts = searchResult.products || [];

    if (retrievedProducts.length === 0) {
      const nextWs = updateItemSearchResults(activeWs, options.itemId, {
        searchId,
        searchStatus: "completed",
        candidates: [],
        searchError: null,
      });
      const accepted = nextWs !== activeWs && nextWs.revision > activeWs.revision;
      return {
        accepted,
        status: accepted ? "completed" : "rejected",
        workspace: nextWs,
        searchId,
        originatingItemId: options.itemId,
        candidates: [],
        comparison: null,
        evidenceFacts: {},
        error: null,
        completionMessage: null,
      };
    }

    // Progress: comparing
    const comparingMsg = getProgressMessage("comparing", options.searchQuery, category, { isWinter });
    options.onProgress?.("comparing", comparingMsg);

    activeWs = updateItemSearchResults(activeWs, options.itemId, {
      searchId,
      searchStatus: "comparing",
      candidates: retrievedProducts,
    });

    let finalComparison: AiComparisonResult | null = null;
    let finalEvidenceFacts: Record<string, EvidenceFact> = {};
    let finalProducts: NormalizedProduct[] = retrievedProducts;

    if (dependencies.recommendProducts) {
      try {
        const recResult = await dependencies.recommendProducts({
          query: options.searchQuery,
          products: retrievedProducts,
          budget: majorBudget,
          currency: searchCurrency,
          canonicalAttributes: itemCanonicalAttrs,
        });
        if (recResult.success && recResult.comparison) {
          finalComparison = recResult.comparison;
          finalEvidenceFacts = recResult.evidenceFacts || {};
          if (recResult.allProducts && recResult.allProducts.length > 0) {
            finalProducts = recResult.allProducts;
          }
        }
      } catch {
        finalComparison = null;
      }
    }

    // Refresh current workspace before final completion update
    activeWs = options.getCurrentWorkspace ? options.getCurrentWorkspace() : activeWs;

    const completedWs = updateItemSearchResults(activeWs, options.itemId, {
      searchId,
      searchFingerprint,
      searchStatus: "completed",
      candidates: finalProducts,
      comparison: finalComparison,
      evidenceFacts: finalEvidenceFacts,
      searchError: null,
    });

    const isAccepted = completedWs !== activeWs && completedWs.revision > activeWs.revision;

    if (!isAccepted) {
      return {
        accepted: false,
        status: "rejected",
        workspace: activeWs,
        searchId,
        originatingItemId: options.itemId,
        candidates: [],
        comparison: null,
        evidenceFacts: {},
        error: "Stale or mismatched search ID; update was rejected",
        completionMessage: null,
      };
    }

    const completionMsg = getProgressMessage("completed", options.searchQuery, category, { isWinter });
    options.onProgress?.("completed", completionMsg);

    return {
      accepted: true,
      status: "completed",
      workspace: completedWs,
      searchId,
      originatingItemId: options.itemId,
      candidates: finalProducts,
      comparison: finalComparison,
      evidenceFacts: finalEvidenceFacts,
      error: null,
      completionMessage: completionMsg,
    };
  })();
}

/**
 * Derives item display state strictly from the active item, with no global progress leakage.
 */
export function deriveItemDisplayState(params: {
  workspace: ShoppingWorkspace;
  targetItemId?: string | null;
  searchingItemIds?: Set<string>;
  rankingItemIds?: Set<string>;
  itemProgressMap?: Map<string, { stage: string; message: string }>;
  itemStatusTextMap?: Map<string, string>;
}): {
  item: ShoppingWorkspace["groups"][0]["items"][0] | null;
  isSearching: boolean;
  isComparing: boolean;
  searchProgress: { stage: string; message: string } | null;
  statusText: string | null;
  candidates: NormalizedProduct[];
  comparison: AiComparisonResult | null;
  evidenceFacts: Record<string, EvidenceFact>;
  searchError: string | null;
  searchStatus: ItemSearchStatus;
} {
  const targetId = params.targetItemId || params.workspace.activeItemId;
  if (!targetId) {
    return {
      item: null,
      isSearching: false,
      isComparing: false,
      searchProgress: null,
      statusText: null,
      candidates: [],
      comparison: null,
      evidenceFacts: {},
      searchError: null,
      searchStatus: "idle",
    };
  }

  const record = findItemInWorkspace(params.workspace, targetId);
  const item = record?.item ?? null;

  if (!item) {
    return {
      item: null,
      isSearching: false,
      isComparing: false,
      searchProgress: null,
      statusText: null,
      candidates: [],
      comparison: null,
      evidenceFacts: {},
      searchError: null,
      searchStatus: "idle",
    };
  }

  const isSearching =
    (params.searchingItemIds?.has(item.id) ?? false) || item.searchStatus === "searching";
  const isComparing =
    (params.rankingItemIds?.has(item.id) ?? false) || item.searchStatus === "comparing";
  const searchProgress = params.itemProgressMap?.get(item.id) ?? null;
  const statusText = params.itemStatusTextMap?.get(item.id) ?? null;

  return {
    item,
    isSearching,
    isComparing,
    searchProgress,
    statusText,
    candidates: item.candidates ?? [],
    comparison: item.comparison ?? null,
    evidenceFacts: item.evidenceFacts ?? {},
    searchError: item.searchError ?? null,
    searchStatus: item.searchStatus ?? "idle",
  };
}
