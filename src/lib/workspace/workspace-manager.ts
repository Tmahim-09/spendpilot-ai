import type {
  ShoppingWorkspace,
  ShoppingGroup,
  ShoppingItem,
  ShoppingItemPriority,
  WorkspaceBudgetSummary,
  GroupBudgetSummary,
  ItemSearchStatus,
  CurrencyTotals,
  BudgetComparisonStatus,
} from "./types.ts";
import type {
  NormalizedProduct,
  ProductOfferItem,
  CurrencyCode,
  AiComparisonResult,
  EvidenceFact,
  ProductVariantSelection,
  CanonicalShoppingAttribute,
} from "../../types/index.ts";
import { isSupportedCurrency } from "../money.ts";
import { revalidateGroupCompatibility } from "./compatibility-engine.ts";

/**
 * Creates an empty, initial shopping workspace.
 */
export function createInitialWorkspace(options?: {
  id?: string;
  currency?: CurrencyCode;
  timestamp?: number;
}): ShoppingWorkspace {
  const now = options?.timestamp ?? 0;
  return {
    id: options?.id || "ws_initial",
    revision: 1,
    activeGroupId: null,
    activeItemId: null,
    groups: [],
    overallBudget: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Finds a group and item by itemId in the workspace.
 */
export function findItemInWorkspace(
  workspace: ShoppingWorkspace,
  itemId: string
): { group: ShoppingGroup; item: ShoppingItem } | null {
  for (const group of workspace.groups) {
    const item = group.items.find((i) => i.id === itemId);
    if (item) {
      return { group, item };
    }
  }
  return null;
}

/**
 * Retrieves the currently active shopping item in the workspace.
 */
export function getActiveWorkspaceItem(
  workspace: ShoppingWorkspace | undefined | null
): ShoppingItem | null {
  if (!workspace || !workspace.activeItemId) return null;
  const found = findItemInWorkspace(workspace, workspace.activeItemId);
  return found?.item || null;
}

/**
 * Sets the active shopping item and activates its parent group.
 */
export function setActiveWorkspaceItem(
  workspace: ShoppingWorkspace,
  itemId: string
): ShoppingWorkspace {
  const found = findItemInWorkspace(workspace, itemId);
  if (!found) return workspace;
  return {
    ...workspace,
    activeItemId: itemId,
    activeGroupId: found.group.id,
    updatedAt: Date.now(),
  };
}

/**
 * Appends an independent shopping item.
 * If an active independent group exists, it appends to it; otherwise it creates one.
 */
export function addIndependentItem(
  workspace: ShoppingWorkspace,
  params: {
    productRequest: string;
    category?: string;
    displayName?: string;
    requirementId?: string;
    hardConstraints?: Record<string, string | number | boolean>;
    preferences?: Record<string, string | number | boolean>;
    individualBudget?: { amountMinor: number; currency: CurrencyCode; strict: boolean };
    priority?: ShoppingItemPriority;
    groupId?: string;
  }
): ShoppingWorkspace {
  const now = Date.now();
  const itemId = `item_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const newItem: ShoppingItem = {
    id: itemId,
    productRequest: params.productRequest,
    category: params.category || "general",
    displayName: params.displayName || params.productRequest,
    requirementId: params.requirementId || itemId,
    hardConstraints: params.hardConstraints || {},
    preferences: params.preferences || {},
    individualBudget: params.individualBudget,
    priority: params.priority || "essential",
    status: "ready_to_search",
    candidates: [],
    dependencies: [],
    answeredQuestionIds: [],
    searchQuery: params.productRequest,
  };

  // Find target group or create an independent one
  let targetGroupId = params.groupId;
  let targetGroup = targetGroupId
    ? workspace.groups.find((g) => g.id === targetGroupId)
    : workspace.groups.find((g) => g.type === "independent" && g.id === workspace.activeGroupId);

  if (!targetGroup) {
    // If no active independent group, find the first independent group or create a new one
    targetGroup = workspace.groups.find((g) => g.type === "independent");
  }

  let updatedGroups: ShoppingGroup[];

  if (targetGroup) {
    const updatedGroup: ShoppingGroup = {
      ...targetGroup,
      items: [...targetGroup.items, newItem],
      updatedAt: now,
    };
    updatedGroups = workspace.groups.map((g) => (g.id === targetGroup!.id ? updatedGroup : g));
    targetGroupId = targetGroup.id;
  } else {
    const newGroup: ShoppingGroup = {
      id: `grp_${now}_${Math.random().toString(36).substring(2, 7)}`,
      type: "independent",
      title: "My Shopping List",
      sharedRequirements: {},
      items: [newItem],
      status: "searching",
      createdAt: now,
      updatedAt: now,
    };
    updatedGroups = [...workspace.groups, newGroup];
    targetGroupId = newGroup.id;
  }

  return {
    ...workspace,
    revision: workspace.revision + 1,
    activeGroupId: targetGroupId,
    activeItemId: itemId,
    groups: updatedGroups,
    updatedAt: now,
  };
}

/**
 * Creates a coordinated setup group in the workspace (e.g. gaming setup, PC build, home office).
 */
export function createCoordinatedSetupGroup(
  workspace: ShoppingWorkspace,
  params: {
    title: string;
    sharedBudget?: { amountMinor: number; currency: CurrencyCode; strict: boolean };
    sharedRequirements?: Record<string, unknown>;
    items: Array<{
      productRequest: string;
      category: string;
      displayName?: string;
      requirementId?: string;
      hardConstraints?: Record<string, string | number | boolean>;
      preferences?: Record<string, string | number | boolean>;
      priority?: ShoppingItemPriority;
      dependencies?: string[];
      individualBudget?: { amountMinor: number; currency: CurrencyCode; strict: boolean };
    }>;
  }
): ShoppingWorkspace {
  const now = Date.now();
  const groupId = `grp_setup_${now}_${Math.random().toString(36).substring(2, 7)}`;

  const createdItems: ShoppingItem[] = params.items.map((itemParams, idx) => ({
    id: `item_${groupId}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
    productRequest: itemParams.productRequest,
    category: itemParams.category,
    displayName: itemParams.displayName || itemParams.productRequest,
    requirementId: itemParams.requirementId,
    hardConstraints: itemParams.hardConstraints || {},
    preferences: itemParams.preferences || {},
    individualBudget: itemParams.individualBudget,
    priority: itemParams.priority || (idx === 0 ? "essential" : "preferred"),
    status: "ready_to_search",
    candidates: [],
    dependencies: itemParams.dependencies || [],
    answeredQuestionIds: [],
    searchQuery: itemParams.productRequest,
  }));

  const setupGroup: ShoppingGroup = {
    id: groupId,
    type: "coordinated_setup",
    title: params.title,
    sharedRequirements: params.sharedRequirements || {},
    budget: params.sharedBudget
      ? {
          amountMinor: params.sharedBudget.amountMinor,
          currency: params.sharedBudget.currency,
          scope: "group",
          strict: params.sharedBudget.strict,
        }
      : undefined,
    items: createdItems,
    status: "searching",
    createdAt: now,
    updatedAt: now,
  };

  return {
    ...workspace,
    revision: workspace.revision + 1,
    activeGroupId: groupId,
    activeItemId: createdItems[0]?.id || null,
    groups: [...workspace.groups, setupGroup],
    updatedAt: now,
  };
}

/**
 * Saves a product selection to a shopping item.
 * Preserves all other selections, re-evaluates compatibility, and calculates updated budget.
 * Keeps selectedProduct and selectedOffer in lockstep with verified offer price and currency.
 */
export function selectProductForItem(
  workspace: ShoppingWorkspace,
  itemId: string,
  product: NormalizedProduct,
  offer?: ProductOfferItem | null,
  variant?: Record<string, string>
): ShoppingWorkspace {
  const now = Date.now();
  const activeOffer = offer || product.selectedOffer || product.offers?.[0] || null;

  // Synchronize resolved product attributes with active verified offer
  const resolvedProduct: NormalizedProduct = {
    ...product,
    selectedOffer: activeOffer,
    priceMinor: activeOffer?.priceMinor ?? product.priceMinor,
    currency: activeOffer?.currency ?? product.currency,
    retailerUrl: activeOffer?.url ?? product.retailerUrl,
    retailerName: activeOffer?.domain ?? product.retailerName,
    availability: activeOffer?.availability ?? product.availability,
  };

  const updatedGroups = workspace.groups.map((group) => {
    const hasItem = group.items.some((i) => i.id === itemId);
    if (!hasItem) return group;

    const updatedItems = group.items.map((item) => {
      if (item.id !== itemId) return item;

      // Synchronize candidate in list if present
      const updatedCandidates = item.candidates.map((c) => {
        const cId = c.sourceProductId || c.title;
        const pId = resolvedProduct.sourceProductId || resolvedProduct.title;
        if (cId === pId) {
          return {
            ...c,
            selectedOffer: activeOffer,
            priceMinor: activeOffer?.priceMinor ?? c.priceMinor,
            currency: activeOffer?.currency ?? c.currency,
            retailerUrl: activeOffer?.url ?? c.retailerUrl,
            retailerName: activeOffer?.domain ?? c.retailerName,
            availability: activeOffer?.availability ?? c.availability,
          };
        }
        return c;
      });

      return {
        ...item,
        status: "selected" as const,
        selectedProductId: resolvedProduct.sourceProductId || resolvedProduct.title,
        selectedProduct: resolvedProduct,
        selectedOffer: activeOffer,
        selectedVariant: variant || item.selectedVariant,
        candidates: updatedCandidates,
      };
    });

    const updatedGroup: ShoppingGroup = {
      ...group,
      items: updatedItems,
      updatedAt: now,
    };

    // Revalidate compatibility for dependent items
    return revalidateGroupCompatibility(updatedGroup);
  });

  return {
    ...workspace,
    revision: workspace.revision + 1,
    groups: updatedGroups,
    updatedAt: now,
  };
}

/**
 * Replaces a selected product on an item (clears selection so it can be re-searched or changed).
 */
export function replaceProductForItem(
  workspace: ShoppingWorkspace,
  itemId: string
): ShoppingWorkspace {
  const now = Date.now();

  const updatedGroups = workspace.groups.map((group) => {
    const hasItem = group.items.some((i) => i.id === itemId);
    if (!hasItem) return group;

    const updatedItems = group.items.map((item) => {
      if (item.id !== itemId) return item;

      return {
        ...item,
        status: (item.candidates.length > 0 ? "results_ready" : "ready_to_search") as ShoppingItem["status"],
        selectedProductId: undefined,
        selectedProduct: null,
        selectedOffer: null,
        selectedVariant: undefined,
      };
    });

    const updatedGroup: ShoppingGroup = {
      ...group,
      items: updatedItems,
      updatedAt: now,
    };

    return revalidateGroupCompatibility(updatedGroup);
  });

  return {
    ...workspace,
    revision: workspace.revision + 1,
    activeItemId: itemId,
    groups: updatedGroups,
    updatedAt: now,
  };
}

/**
 * Removes an item from the workspace.
 * Also cleans up any dependencies pointing to this item.
 */
export function removeItemFromWorkspace(
  workspace: ShoppingWorkspace,
  itemId: string
): ShoppingWorkspace {
  const now = Date.now();

  const updatedGroups = workspace.groups
    .map((group) => {
      const hasItem = group.items.some((i) => i.id === itemId);
      if (!hasItem) return group;

      const filteredItems = group.items
        .filter((i) => i.id !== itemId)
        .map((i) => ({
          ...i,
          dependencies: i.dependencies.filter((d) => d !== itemId),
        }));

      const updatedGroup: ShoppingGroup = {
        ...group,
        items: filteredItems,
        updatedAt: now,
      };

      return revalidateGroupCompatibility(updatedGroup);
    })
    .filter((group) => group.items.length > 0); // Keep groups with remaining items

  const nextActiveItem = updatedGroups[0]?.items[0]?.id || null;

  return {
    ...workspace,
    revision: workspace.revision + 1,
    activeItemId: workspace.activeItemId === itemId ? nextActiveItem : workspace.activeItemId,
    groups: updatedGroups,
    updatedAt: now,
  };
}

/**
 * Calculates budget summaries across all groups and items.
 * Currency-aware: never sums amounts of different currencies together.
 * Groups and workspace summaries expose totalsByCurrency, budget comparison status,
 * and individual budget currency tracking.
 */
export function calculateWorkspaceBudgetSummary(
  workspace: ShoppingWorkspace,
  defaultCurrency: CurrencyCode = "USD"
): WorkspaceBudgetSummary {
  const wsCurrency: CurrencyCode = workspace.overallBudget?.currency || defaultCurrency;
  const overallBudgetMinor = workspace.overallBudget?.amountMinor ?? null;
  const overallBudgetCurrency = workspace.overallBudget?.currency ?? null;

  const workspaceTotalsByCurrency: CurrencyTotals = {};
  let workspaceUnpricedCount = 0;
  let workspaceUnsupportedCurrencyCount = 0;

  const groupSummaries: GroupBudgetSummary[] = workspace.groups.map((group) => {
    const groupTotalsByCurrency: CurrencyTotals = {};
    let groupUnpricedCount = 0;
    let groupUnsupportedCurrencyCount = 0;
    let selectedCount = 0;

    for (const item of group.items) {
      if (item.status === "selected") {
        selectedCount += 1;
        const activeOffer = item.selectedOffer || item.selectedProduct?.selectedOffer || null;
        const priceMinor = activeOffer?.priceMinor ?? item.selectedProduct?.priceMinor ?? null;
        const rawCurr = activeOffer?.currency ?? item.selectedProduct?.currency ?? null;

        const isValidPrice =
          typeof priceMinor === "number" &&
          Number.isFinite(priceMinor) &&
          Number.isSafeInteger(priceMinor) &&
          priceMinor > 0;
        const isSupported = isSupportedCurrency(rawCurr);

        if (!isValidPrice) {
          groupUnpricedCount += 1;
        }

        if (!isSupported || !rawCurr) {
          groupUnsupportedCurrencyCount += 1;
        }

        // Only include in monetary totals if price is valid and currency is supported
        if (isValidPrice && isSupported && rawCurr) {
          const currCode = rawCurr.toUpperCase() as CurrencyCode;
          groupTotalsByCurrency[currCode] = (groupTotalsByCurrency[currCode] || 0) + priceMinor;
        }
      }
    }

    // Merge into workspace totals
    for (const [curr, total] of Object.entries(groupTotalsByCurrency)) {
      const c = curr as CurrencyCode;
      workspaceTotalsByCurrency[c] = (workspaceTotalsByCurrency[c] || 0) + (total || 0);
    }
    workspaceUnpricedCount += groupUnpricedCount;
    workspaceUnsupportedCurrencyCount += groupUnsupportedCurrencyCount;

    const groupBudgetMinor = group.budget?.amountMinor ?? null;
    const groupBudgetCurrency = group.budget?.currency ?? null;
    const primaryCurrency: CurrencyCode = groupBudgetCurrency || wsCurrency;

    // Foreign currency totals: any currency in groupTotalsByCurrency other than primaryCurrency
    const foreignCurrencyTotals: CurrencyTotals = {};
    for (const [curr, total] of Object.entries(groupTotalsByCurrency)) {
      const c = curr as CurrencyCode;
      if (c !== primaryCurrency && (total || 0) > 0) {
        foreignCurrencyTotals[c] = total;
      }
    }

    const selectedTotalInBudgetCurrencyMinor = groupBudgetCurrency
      ? (groupTotalsByCurrency[groupBudgetCurrency] ?? 0)
      : null;

    // selectedTotalMinor: if budget currency specified, total in that currency; otherwise total in primary currency
    const selectedTotalMinor = groupBudgetCurrency
      ? (selectedTotalInBudgetCurrencyMinor ?? 0)
      : (groupTotalsByCurrency[primaryCurrency] ?? 0);

    // Group comparison status
    let status: BudgetComparisonStatus;
    let isOverBudget = false;
    let remainingBudgetMinor: number | null = null;

    if (groupBudgetMinor === null || groupBudgetCurrency === null) {
      status = "no_budget";
      remainingBudgetMinor = null;
      isOverBudget = false;
    } else {
      const targetCurr = groupBudgetCurrency;
      const totalInTargetCurr = groupTotalsByCurrency[targetCurr] ?? 0;
      const hasForeignItems = Object.keys(foreignCurrencyTotals).length > 0 || groupUnsupportedCurrencyCount > 0;
      const hasUnpricedItems = groupUnpricedCount > 0;
      const hasTargetItems = groupTotalsByCurrency[targetCurr] !== undefined && groupTotalsByCurrency[targetCurr]! > 0;

      if (totalInTargetCurr > groupBudgetMinor) {
        status = "over_budget";
        isOverBudget = true;
        remainingBudgetMinor = groupBudgetMinor - totalInTargetCurr;
      } else {
        remainingBudgetMinor = groupBudgetMinor - totalInTargetCurr;
        isOverBudget = false;
        if (hasForeignItems || hasUnpricedItems) {
          status = hasTargetItems ? "partially_comparable" : "not_comparable";
        } else {
          status = "within_budget";
        }
      }
    }

    return {
      groupId: group.id,
      groupTitle: group.title,
      currency: primaryCurrency,
      allocatedBudgetMinor: groupBudgetMinor,
      budgetCurrency: groupBudgetCurrency,
      totalsByCurrency: groupTotalsByCurrency,
      selectedTotalInBudgetCurrencyMinor,
      selectedTotalMinor,
      remainingBudgetMinor,
      status,
      isOverBudget,
      isStrict: group.budget?.strict ?? false,
      itemCount: group.items.length,
      selectedCount,
      foreignCurrencyTotals,
      unpricedCount: groupUnpricedCount,
      unsupportedCurrencyCount: groupUnsupportedCurrencyCount,
    };
  });

  // Workspace-level foreign currency totals
  const wsForeignCurrencyTotals: CurrencyTotals = {};
  const wsPrimaryBudgetCurr = overallBudgetCurrency || wsCurrency;
  for (const [curr, total] of Object.entries(workspaceTotalsByCurrency)) {
    const c = curr as CurrencyCode;
    if (c !== wsPrimaryBudgetCurr && (total || 0) > 0) {
      wsForeignCurrencyTotals[c] = total;
    }
  }

  const selectedTotalInBudgetCurrencyMinor = overallBudgetCurrency
    ? (workspaceTotalsByCurrency[overallBudgetCurrency] ?? 0)
    : null;

  const totalSelectedMinor = overallBudgetCurrency
    ? (selectedTotalInBudgetCurrencyMinor ?? 0)
    : (workspaceTotalsByCurrency[wsCurrency] ?? 0);

  // Workspace status
  let status: BudgetComparisonStatus;
  let isOverBudget = false;
  let remainingMinor: number | null = null;

  if (overallBudgetMinor === null || overallBudgetCurrency === null) {
    const anyGroupOver = groupSummaries.some((g) => g.isOverBudget);
    status = anyGroupOver ? "over_budget" : "no_budget";
    isOverBudget = anyGroupOver;
    remainingMinor = null;
  } else {
    const targetCurr = overallBudgetCurrency;
    const totalInTargetCurr = workspaceTotalsByCurrency[targetCurr] ?? 0;
    const hasForeignItems = Object.keys(wsForeignCurrencyTotals).length > 0 || workspaceUnsupportedCurrencyCount > 0;
    const hasUnpricedItems = workspaceUnpricedCount > 0;
    const hasTargetItems = workspaceTotalsByCurrency[targetCurr] !== undefined && workspaceTotalsByCurrency[targetCurr]! > 0;

    if (totalInTargetCurr > overallBudgetMinor) {
      status = "over_budget";
      isOverBudget = true;
      remainingMinor = overallBudgetMinor - totalInTargetCurr;
    } else {
      remainingMinor = overallBudgetMinor - totalInTargetCurr;
      isOverBudget = false;
      if (hasForeignItems || hasUnpricedItems) {
        status = hasTargetItems ? "partially_comparable" : "not_comparable";
      } else {
        status = "within_budget";
      }
    }

    if (groupSummaries.some((g) => g.isOverBudget)) {
      isOverBudget = true;
    }
  }

  return {
    currency: wsCurrency,
    overallBudgetMinor,
    budgetCurrency: overallBudgetCurrency,
    totalsByCurrency: workspaceTotalsByCurrency,
    selectedTotalInBudgetCurrencyMinor,
    totalSelectedMinor,
    remainingMinor,
    status,
    isOverBudget,
    foreignCurrencyTotals: wsForeignCurrencyTotals,
    unpricedCount: workspaceUnpricedCount,
    unsupportedCurrencyCount: workspaceUnsupportedCurrencyCount,
    groups: groupSummaries,
  };
}

/**
 * Compares an individual shopping item against its configured individual budget.
 * Returns not_comparable if currencies differ or price is unavailable.
 */
export function compareItemBudget(
  item: ShoppingItem,
  defaultCurrency: CurrencyCode = "USD"
): {
  status: BudgetComparisonStatus;
  budgetMinor: number | null;
  budgetCurrency: CurrencyCode | null;
  priceMinor: number | null;
  itemCurrency: string | null;
  remainingMinor: number | null;
  isOverBudget: boolean;
  message?: string;
} {
  const budgetMinor = item.individualBudget?.amountMinor ?? null;
  const budgetCurrency = item.individualBudget?.currency ?? (budgetMinor !== null ? defaultCurrency : null);

  const activeOffer = item.selectedOffer || item.selectedProduct?.selectedOffer || null;
  const priceMinor = activeOffer?.priceMinor ?? item.selectedProduct?.priceMinor ?? null;
  const itemCurrency = activeOffer?.currency ?? item.selectedProduct?.currency ?? null;

  if (budgetMinor === null || budgetCurrency === null) {
    return {
      status: "no_budget",
      budgetMinor: null,
      budgetCurrency: null,
      priceMinor,
      itemCurrency,
      remainingMinor: null,
      isOverBudget: false,
    };
  }

  if (item.status !== "selected") {
    return {
      status: "within_budget",
      budgetMinor,
      budgetCurrency,
      priceMinor: null,
      itemCurrency: null,
      remainingMinor: budgetMinor,
      isOverBudget: false,
      message: "No product selected yet for this item.",
    };
  }

  // Once an item is selected, strictly validate safe integer positive price
  const isValidPrice =
    typeof priceMinor === "number" &&
    Number.isFinite(priceMinor) &&
    Number.isSafeInteger(priceMinor) &&
    priceMinor > 0;

  if (!isValidPrice) {
    return {
      status: "not_comparable",
      budgetMinor,
      budgetCurrency,
      priceMinor,
      itemCurrency,
      remainingMinor: null,
      isOverBudget: false,
      message:
        priceMinor === null || priceMinor === undefined
          ? "Item price is missing or unavailable. Monetary comparison cannot be verified."
          : priceMinor <= 0
          ? "Item price must be a positive amount to verify budget compliance."
          : "Item price is not a safe finite integer in minor units.",
    };
  }

  // Strictly validate supported currency
  if (!itemCurrency || itemCurrency === "UNKNOWN" || !isSupportedCurrency(itemCurrency)) {
    return {
      status: "not_comparable",
      budgetMinor,
      budgetCurrency,
      priceMinor,
      itemCurrency,
      remainingMinor: null,
      isOverBudget: false,
      message: `Item currency (${itemCurrency || "UNKNOWN"}) is missing or unsupported.`,
    };
  }

  // If item currency differs from budget currency, cannot compare without exchange rates
  if (itemCurrency !== budgetCurrency) {
    return {
      status: "not_comparable",
      budgetMinor,
      budgetCurrency,
      priceMinor,
      itemCurrency,
      remainingMinor: null,
      isOverBudget: false,
      message: `Item currency (${itemCurrency}) differs from individual budget currency (${budgetCurrency}). Monetary comparison requires an explicit conversion.`,
    };
  }

  const remaining = budgetMinor - priceMinor;
  const isOver = priceMinor > budgetMinor;

  return {
    status: isOver ? "over_budget" : "within_budget",
    budgetMinor,
    budgetCurrency,
    priceMinor,
    itemCurrency,
    remainingMinor: remaining,
    isOverBudget: isOver,
  };
}

/**
 * Identifies the next unresolved shopping item across the workspace in order.
 */
export function getNextUnresolvedItem(
  workspace: ShoppingWorkspace
): { group: ShoppingGroup; item: ShoppingItem } | null {
  // 1. Check active group first
  if (workspace.activeGroupId) {
    const activeGroup = workspace.groups.find((g) => g.id === workspace.activeGroupId);
    if (activeGroup) {
      const unresolved = activeGroup.items.find(
        (i) => i.status !== "selected" && i.status !== "skipped"
      );
      if (unresolved) {
        return { group: activeGroup, item: unresolved };
      }
    }
  }

  // 2. Check other groups in order
  for (const group of workspace.groups) {
    const unresolved = group.items.find(
      (i) => i.status !== "selected" && i.status !== "skipped"
    );
    if (unresolved) {
      return { group, item: unresolved };
    }
  }

  return null;
}

/**
 * Canonical serializer for dictionary attributes to ensure stable key ordering.
 */
function stableSerializeDictionary(obj: Record<string, unknown> | undefined | null): string {
  if (!obj || typeof obj !== "object") return "";
  const sortedKeys = Object.keys(obj).sort();
  const entries: string[] = [];
  for (const k of sortedKeys) {
    const val = obj[k];
    if (val !== undefined && val !== null && val !== "") {
      entries.push(`${k}:${typeof val === "object" ? JSON.stringify(val) : String(val)}`);
    }
  }
  return entries.join(";");
}

/**
 * Builds a deterministic, requirements-sensitive search fingerprint for an item.
 * Includes product identity, query, budget, currency, hard constraints, preferences,
 * and coordinated setup group shared requirements.
 */
export function buildItemSearchFingerprint(params: {
  itemId: string;
  searchQuery: string;
  budgetMinor?: number | null;
  currency?: CurrencyCode;
  hardConstraints?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  groupRequirements?: Record<string, unknown>;
}): string {
  const normQuery = (params.searchQuery || "").trim().toLowerCase();
  const budget = params.budgetMinor ?? 0;
  const curr = params.currency || "USD";
  const hcStr = stableSerializeDictionary(params.hardConstraints);
  const prefStr = stableSerializeDictionary(params.preferences);
  const grpStr = stableSerializeDictionary(params.groupRequirements);

  return `fp_${params.itemId}_q=${normQuery}_b=${budget}_c=${curr}_hc=[${hcStr}]_pref=[${prefStr}]_grp=[${grpStr}]`;
}

/**
 * Derives item-specific canonical shopping attributes strictly from that item's
 * own hard constraints, preferences, and parent group shared requirements (if coordinated setup).
 * Never leaks attributes from other independent items or global session attributes.
 */
export function deriveItemCanonicalAttributes(
  item: ShoppingItem,
  group?: ShoppingGroup | null,
  explicitOverrides?: Record<string, CanonicalShoppingAttribute>
): Record<string, CanonicalShoppingAttribute> {
  const result: Record<string, CanonicalShoppingAttribute> = {};
  const now = Date.now();

  // 1. If in a coordinated setup, inherit group-level shared requirements
  if (group && group.type === "coordinated_setup" && group.sharedRequirements) {
    for (const [key, val] of Object.entries(group.sharedRequirements)) {
      if (val !== undefined && val !== null && val !== "") {
        result[key] = {
          key,
          label: key,
          value: Array.isArray(val) ? val.map(String) : String(val),
          displayValue: Array.isArray(val) ? val.join(", ") : String(val),
          source: "ai_suggested",
          status: "confirmed",
          updatedAt: now,
        };
      }
    }
  }

  // 2. Add item preferences (soft constraints)
  if (item.preferences) {
    for (const [key, val] of Object.entries(item.preferences)) {
      if (val !== undefined && val !== null && val !== "") {
        result[key] = {
          key,
          label: key,
          value: Array.isArray(val) ? val.map(String) : String(val),
          displayValue: Array.isArray(val) ? val.join(", ") : String(val),
          source: "user_explicit",
          constraint: "soft_preference",
          status: "confirmed",
          updatedAt: now,
        };
      }
    }
  }

  // 3. Add item hard constraints (hard requirements take precedence)
  if (item.hardConstraints) {
    for (const [key, val] of Object.entries(item.hardConstraints)) {
      if (val !== undefined && val !== null && val !== "") {
        result[key] = {
          key,
          label: key,
          value: Array.isArray(val) ? val.map(String) : String(val),
          displayValue: Array.isArray(val) ? val.join(", ") : String(val),
          source: "user_explicit",
          constraint: "hard_requirement",
          status: "confirmed",
          updatedAt: now,
        };
      }
    }
  }

  // 4. Apply any explicit overrides strictly provided for this item
  if (explicitOverrides) {
    for (const [key, attr] of Object.entries(explicitOverrides)) {
      if (attr) {
        result[key] = attr;
      }
    }
  }

  return result;
}

/**
 * Updates search results and status strictly on a single item.
 * 
 * Rules:
 * - A new search must explicitly register a non-empty search ID.
 * - Every completion, error, comparison or evidence update must supply its expected search ID.
 * - The expected ID must exactly match the item's currently registered search ID.
 * - If the current search ID is missing, reject a completion update.
 * - If the supplied ID is missing, reject it.
 * - If the supplied ID differs, reject it.
 * - A rejected update must return the unchanged workspace without incrementing its revision.
 * - A new search may replace the previous search ID only through an explicit search-start operation.
 */
export function updateItemSearchResults(
  workspace: ShoppingWorkspace,
  itemId: string,
  updates: {
    searchId?: string;
    searchFingerprint?: string;
    searchStatus?: ItemSearchStatus;
    candidates?: NormalizedProduct[];
    comparison?: AiComparisonResult | null;
    evidenceFacts?: Record<string, EvidenceFact>;
    searchError?: string | null;
  }
): ShoppingWorkspace {
  const now = Date.now();
  let wasRejected = false;
  let didUpdate = false;

  const suppliedSearchId = typeof updates.searchId === "string" ? updates.searchId.trim() : "";
  const isStartingNewSearch = updates.searchStatus === "searching";

  const updatedGroups = workspace.groups.map((group) => {
    const hasItem = group.items.some((i) => i.id === itemId);
    if (!hasItem) return group;

    const updatedItems = group.items.map((item) => {
      if (item.id !== itemId) return item;

      if (isStartingNewSearch) {
        // A new search must explicitly register a non-empty search ID.
        if (!suppliedSearchId) {
          wasRejected = true;
          return item;
        }
      } else {
        // Non-search-start update (completion, error, comparing, evidence, etc.):
        // Every completion, error, comparison or evidence update must supply its expected search ID.
        // If current search ID is missing, reject.
        // If supplied ID is missing, reject.
        // If supplied ID differs, reject.
        if (!suppliedSearchId || !item.searchId || suppliedSearchId !== item.searchId) {
          wasRejected = true;
          return item;
        }
      }

      didUpdate = true;
      const nextSearchId = isStartingNewSearch ? suppliedSearchId : item.searchId;

      return {
        ...item,
        searchId: nextSearchId,
        searchFingerprint: updates.searchFingerprint ?? item.searchFingerprint,
        searchStatus: updates.searchStatus !== undefined ? updates.searchStatus : item.searchStatus,
        candidates: updates.candidates !== undefined ? updates.candidates : item.candidates,
        comparison: updates.comparison !== undefined ? updates.comparison : item.comparison,
        evidenceFacts: updates.evidenceFacts !== undefined ? updates.evidenceFacts : item.evidenceFacts,
        searchError: updates.searchError !== undefined ? updates.searchError : null,
        status:
          item.status === "selected"
            ? ("selected" as const)
            : (updates.candidates && updates.candidates.length > 0)
            ? ("results_ready" as const)
            : item.status,
      };
    });

    return {
      ...group,
      items: updatedItems,
      updatedAt: didUpdate ? now : group.updatedAt,
    };
  });

  if (wasRejected || !didUpdate) {
    return workspace;
  }

  return {
    ...workspace,
    revision: workspace.revision + 1,
    groups: updatedGroups,
    updatedAt: now,
  };
}

/**
 * Updates AI comparison and evidence facts on a specific item.
 *
 * Rules:
 * - Every comparison or evidence update must supply its expected search ID.
 * - The expected ID must exactly match the item's currently registered search ID.
 * - If the current search ID is missing, reject.
 * - If the supplied ID is missing, reject.
 * - If the supplied ID differs, reject.
 * - A rejected update must return the unchanged workspace without incrementing its revision.
 */
export function updateItemComparison(
  workspace: ShoppingWorkspace,
  itemId: string,
  comparison: AiComparisonResult | null,
  evidenceFacts?: Record<string, EvidenceFact>,
  candidates?: NormalizedProduct[],
  searchId?: string
): ShoppingWorkspace {
  const now = Date.now();
  let wasRejected = false;
  let didUpdate = false;

  const suppliedSearchId = typeof searchId === "string" ? searchId.trim() : "";

  const updatedGroups = workspace.groups.map((group) => {
    const hasItem = group.items.some((i) => i.id === itemId);
    if (!hasItem) return group;

    const updatedItems = group.items.map((item) => {
      if (item.id !== itemId) return item;

      // Comparison updates must enforce the same ownership rules:
      // Must supply expected search ID matching the item's registered search ID.
      if (!suppliedSearchId || !item.searchId || suppliedSearchId !== item.searchId) {
        wasRejected = true;
        return item;
      }

      didUpdate = true;
      return {
        ...item,
        comparison,
        evidenceFacts: evidenceFacts ?? item.evidenceFacts,
        candidates: candidates && candidates.length > 0 ? candidates : item.candidates,
      };
    });

    return {
      ...group,
      items: updatedItems,
      updatedAt: didUpdate ? now : group.updatedAt,
    };
  });

  if (wasRejected || !didUpdate) {
    return workspace;
  }

  return {
    ...workspace,
    revision: workspace.revision + 1,
    groups: updatedGroups,
    updatedAt: now,
  };
}

/**
 * Updates selected offer for a product under a specific item.
 * Validates offer belongs to product, synchronizes exact offer ID, domain, URL,
 * priceMinor, currency, availability, and selectedOffer on candidate and item.
 * If invalid (e.g. offer doesn't belong to product), rejects and returns unchanged workspace.
 */
export function selectOfferForItem(
  workspace: ShoppingWorkspace,
  itemId: string,
  productId: string,
  offer: ProductOfferItem
): ShoppingWorkspace {
  if (!offer || typeof offer !== "object") {
    return workspace;
  }

  // Find item and candidate in workspace
  let itemFound: ShoppingItem | null = null;
  for (const group of workspace.groups) {
    const found = group.items.find((i) => i.id === itemId);
    if (found) {
      itemFound = found;
      break;
    }
  }

  if (!itemFound) {
    return workspace;
  }

  const targetCandidate =
    itemFound.candidates.find((p) => (p.sourceProductId || p.title) === productId) ||
    (itemFound.selectedProduct &&
    ((itemFound.selectedProduct.sourceProductId && itemFound.selectedProduct.sourceProductId === productId) ||
      itemFound.selectedProduct.title === productId ||
      itemFound.selectedProductId === productId)
      ? itemFound.selectedProduct
      : null);

  if (!targetCandidate) {
    return workspace;
  }

  const hasAuthoritativeOffers = Array.isArray(targetCandidate.offers) && targetCandidate.offers.length > 0;
  let canonicalOffer: ProductOfferItem | null = null;

  if (hasAuthoritativeOffers) {
    canonicalOffer =
      targetCandidate.offers!.find(
        (o) =>
          (offer.offerId && o.offerId === offer.offerId) ||
          (offer.id && o.id === offer.id) ||
          (offer.url && o.url === offer.url) ||
          (o.domain === offer.domain && o.priceMinor === offer.priceMinor)
      ) || null;

    if (!canonicalOffer) {
      // Reject invalid offer not belonging to product
      return workspace;
    }
  } else {
    // For products without verifiable offers, do not accept a newly supplied arbitrary retailer offer as verified.
    // Preserve a previously verified selected offer only when its identity matches.
    const existingOffer = targetCandidate.selectedOffer || itemFound.selectedOffer || null;
    if (!existingOffer) {
      return workspace;
    }
    const matchesExisting =
      (offer.offerId && existingOffer.offerId === offer.offerId) ||
      (offer.id && existingOffer.id === offer.id) ||
      (offer.url && existingOffer.url === offer.url) ||
      (offer.domain === existingOffer.domain && offer.priceMinor === existingOffer.priceMinor);

    if (!matchesExisting) {
      return workspace;
    }
    canonicalOffer = existingOffer;
  }

  // Reject altered prices or currencies: cannot override canonical stored price
  if (
    typeof offer.priceMinor === "number" &&
    offer.priceMinor !== canonicalOffer.priceMinor
  ) {
    return workspace;
  }
  if (
    offer.currency &&
    canonicalOffer.currency &&
    offer.currency !== canonicalOffer.currency
  ) {
    return workspace;
  }

  // Reject non-safe-integer or non-positive price on canonical offer
  if (
    typeof canonicalOffer.priceMinor !== "number" ||
    !Number.isSafeInteger(canonicalOffer.priceMinor) ||
    canonicalOffer.priceMinor <= 0
  ) {
    return workspace;
  }

  // Reject unsupported currency on canonical offer
  if (!canonicalOffer.currency || !isSupportedCurrency(canonicalOffer.currency)) {
    return workspace;
  }

  const now = Date.now();
  let updatedAny = false;

  const updatedGroups = workspace.groups.map((group) => {
    const hasItem = group.items.some((i) => i.id === itemId);
    if (!hasItem) return group;

    const updatedItems = group.items.map((item) => {
      if (item.id !== itemId) return item;

      // Update offer in candidates list with canonical offer
      const updatedCandidates = item.candidates.map((p) => {
        const pid = p.sourceProductId || p.title;
        if (pid === productId) {
          updatedAny = true;
          return {
            ...p,
            selectedOffer: canonicalOffer,
            priceMinor: canonicalOffer!.priceMinor,
            currency: canonicalOffer!.currency,
            retailerUrl: canonicalOffer!.url,
            retailerName: canonicalOffer!.domain || p.retailerName,
            availability: canonicalOffer!.availability || p.availability,
          };
        }
        return p;
      });

      // Update selectedProduct if matching
      const isSelectedProduct =
        item.selectedProduct &&
        ((item.selectedProduct.sourceProductId && item.selectedProduct.sourceProductId === productId) ||
          item.selectedProduct.title === productId ||
          item.selectedProductId === productId);

      const updatedSelectedProduct = isSelectedProduct && item.selectedProduct
        ? {
            ...item.selectedProduct,
            selectedOffer: canonicalOffer,
            priceMinor: canonicalOffer!.priceMinor,
            currency: canonicalOffer!.currency,
            retailerUrl: canonicalOffer!.url,
            retailerName: canonicalOffer!.domain || item.selectedProduct.retailerName,
            availability: canonicalOffer!.availability || item.selectedProduct.availability,
          }
        : item.selectedProduct;

      if (isSelectedProduct) {
        updatedAny = true;
      }

      return {
        ...item,
        candidates: updatedCandidates,
        selectedOffer: isSelectedProduct ? canonicalOffer : item.selectedOffer,
        selectedProduct: updatedSelectedProduct,
      };
    });

    return {
      ...group,
      items: updatedItems,
      updatedAt: now,
    };
  });

  if (!updatedAny) {
    return workspace;
  }

  return {
    ...workspace,
    revision: workspace.revision + 1,
    groups: updatedGroups,
    updatedAt: now,
  };
}

/**
 * Updates selected variant and price/url/currency for a product under a specific item.
 * Ensures confirmed price, currency, and retailer offer remain in lockstep.
 */
export function updateVariantForItem(
  workspace: ShoppingWorkspace,
  itemId: string,
  selection: ProductVariantSelection
): ShoppingWorkspace {
  if (selection.isConfirmed === false) {
    // Save unverified variant preferences on the item without altering verified price, offer, or configuration
    const now = Date.now();
    let updatedAny = false;

    const updatedGroups = workspace.groups.map((group) => {
      const hasItem = group.items.some((i) => i.id === itemId);
      if (!hasItem) return group;

      const updatedItems = group.items.map((item) => {
        if (item.id !== itemId) return item;
        updatedAny = true;
        return {
          ...item,
          unverifiedVariantPreferences: (selection.selectedOptions as Record<string, string>) || {},
        };
      });

      return {
        ...group,
        items: updatedItems,
        updatedAt: now,
      };
    });

    if (!updatedAny) {
      return workspace;
    }

    return {
      ...workspace,
      revision: workspace.revision + 1,
      groups: updatedGroups,
      updatedAt: now,
    };
  }

  // Find item and candidate in workspace to verify variant belongs to correct product
  let itemFound: ShoppingItem | null = null;
  for (const group of workspace.groups) {
    const found = group.items.find((i) => i.id === itemId);
    if (found) {
      itemFound = found;
      break;
    }
  }

  if (!itemFound) {
    return workspace;
  }

  const targetCandidate =
    itemFound.candidates.find((p) => (p.sourceProductId || p.title) === selection.productId) ||
    (itemFound.selectedProduct &&
    ((itemFound.selectedProduct.sourceProductId && itemFound.selectedProduct.sourceProductId === selection.productId) ||
      itemFound.selectedProduct.title === selection.productId ||
      itemFound.selectedProductId === selection.productId)
      ? itemFound.selectedProduct
      : null);

  if (!targetCandidate) {
    return workspace;
  }

  // When confirmedOffer is provided, its verified details are authoritative over conflicting top-level fields
  let verifiedOffer = selection.confirmedOffer || null;
  if (verifiedOffer && Array.isArray(targetCandidate.offers) && targetCandidate.offers.length > 0) {
    const matchingCanonical = targetCandidate.offers.find(
      (o) =>
        (verifiedOffer!.offerId && o.offerId === verifiedOffer!.offerId) ||
        (verifiedOffer!.id && o.id === verifiedOffer!.id) ||
        (verifiedOffer!.url && o.url === verifiedOffer!.url)
    );
    if (matchingCanonical) {
      // Reject altered price or currency attempting to override canonical stored price
      if (
        (typeof verifiedOffer.priceMinor === "number" && verifiedOffer.priceMinor !== matchingCanonical.priceMinor) ||
        (verifiedOffer.currency && matchingCanonical.currency && verifiedOffer.currency !== matchingCanonical.currency)
      ) {
        return workspace;
      }
      verifiedOffer = matchingCanonical;
    }
  }

  const authoritativePriceMinor =
    verifiedOffer?.priceMinor != null
      ? verifiedOffer.priceMinor
      : selection.confirmedPriceMinor;

  const authoritativeCurrency =
    verifiedOffer?.currency || selection.confirmedCurrency || targetCandidate.currency;

  const authoritativeRetailerUrl =
    verifiedOffer?.url || selection.confirmedRetailerUrl || targetCandidate.retailerUrl;

  const authoritativeRetailerName =
    verifiedOffer?.domain || selection.retailerName || targetCandidate.retailerName;

  // Reject non-safe-integer or non-positive price
  if (
    typeof authoritativePriceMinor !== "number" ||
    !Number.isSafeInteger(authoritativePriceMinor) ||
    authoritativePriceMinor <= 0
  ) {
    return workspace;
  }

  // Reject unsupported currency
  if (!authoritativeCurrency || !isSupportedCurrency(authoritativeCurrency)) {
    return workspace;
  }

  const now = Date.now();
  let updatedAny = false;

  const updatedGroups = workspace.groups.map((group) => {
    const hasItem = group.items.some((i) => i.id === itemId);
    if (!hasItem) return group;

    const updatedItems = group.items.map((item) => {
      if (item.id !== itemId) return item;

      const updatedCandidates = item.candidates.map((p) => {
        const pid = p.sourceProductId || p.title;
        if (pid === selection.productId) {
          updatedAny = true;
          const updatedOffer: ProductOfferItem | null = verifiedOffer || (p.selectedOffer
            ? {
                ...p.selectedOffer,
                priceMinor: authoritativePriceMinor,
                currency: authoritativeCurrency,
                url: authoritativeRetailerUrl || p.selectedOffer.url,
                domain: authoritativeRetailerName || p.selectedOffer.domain,
              }
            : null);

          return {
            ...p,
            title: selection.title || p.title,
            priceMinor: authoritativePriceMinor,
            currency: authoritativeCurrency,
            retailerUrl: authoritativeRetailerUrl || p.retailerUrl,
            imageUrl: selection.imageUrl || p.imageUrl,
            retailerName: authoritativeRetailerName || p.retailerName,
            selectedOffer: updatedOffer,
          };
        }
        return p;
      });

      const isSelectedMatch =
        item.selectedProduct &&
        (!selection.productId ||
          item.selectedProduct.sourceProductId === selection.productId ||
          item.selectedProduct.title === selection.title ||
          item.selectedProductId === selection.productId);

      const matchingCandidate = updatedCandidates.find(
        (c) => (c.sourceProductId || c.title) === selection.productId
      );

      const baseOffer = item.selectedOffer || item.selectedProduct?.selectedOffer || null;
      const updatedDirectOffer: ProductOfferItem | null = verifiedOffer || (baseOffer
        ? {
            ...baseOffer,
            priceMinor: authoritativePriceMinor,
            currency: authoritativeCurrency,
            url: authoritativeRetailerUrl || baseOffer.url,
            domain: authoritativeRetailerName || baseOffer.domain,
          }
        : null);

      const effectiveVariantOffer = matchingCandidate?.selectedOffer || updatedDirectOffer || item.selectedProduct?.selectedOffer;

      const updatedSelectedProduct = isSelectedMatch && item.selectedProduct
        ? {
            ...item.selectedProduct,
            title: selection.title || item.selectedProduct.title,
            priceMinor: authoritativePriceMinor,
            currency: authoritativeCurrency,
            retailerUrl: authoritativeRetailerUrl || item.selectedProduct.retailerUrl,
            imageUrl: selection.imageUrl || item.selectedProduct.imageUrl,
            retailerName: authoritativeRetailerName || item.selectedProduct.retailerName,
            selectedOffer: effectiveVariantOffer,
          }
        : item.selectedProduct;

      if (isSelectedMatch) {
        updatedAny = true;
      }

      return {
        ...item,
        candidates: updatedCandidates,
        selectedVariant: isSelectedMatch
          ? (selection.selectedOptions as Record<string, string>) || item.selectedVariant
          : item.selectedVariant,
        selectedOffer: isSelectedMatch
          ? (effectiveVariantOffer || item.selectedOffer)
          : item.selectedOffer,
        selectedProduct: updatedSelectedProduct,
      };
    });

    return {
      ...group,
      items: updatedItems,
      updatedAt: now,
    };
  });

  if (!updatedAny) {
    return workspace;
  }

  return {
    ...workspace,
    revision: workspace.revision + 1,
    groups: updatedGroups,
    updatedAt: now,
  };
}
