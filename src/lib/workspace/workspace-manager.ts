import type {
  ShoppingWorkspace,
  ShoppingGroup,
  ShoppingItem,
  ShoppingItemPriority,
  WorkspaceBudgetSummary,
  GroupBudgetSummary,
} from "./types.ts";
import type { NormalizedProduct, ProductOfferItem, CurrencyCode } from "../../types/index.ts";
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
 * Appends an independent shopping item.
 * If an active independent group exists, it appends to it; otherwise it creates one.
 */
export function addIndependentItem(
  workspace: ShoppingWorkspace,
  params: {
    productRequest: string;
    category?: string;
    displayName?: string;
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

  const updatedGroups = workspace.groups.map((group) => {
    const hasItem = group.items.some((i) => i.id === itemId);
    if (!hasItem) return group;

    const updatedItems = group.items.map((item) => {
      if (item.id !== itemId) return item;

      return {
        ...item,
        status: "selected" as const,
        selectedProductId: product.sourceProductId || product.title,
        selectedProduct: product,
        selectedOffer: activeOffer,
        selectedVariant: variant || item.selectedVariant,
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
 */
export function calculateWorkspaceBudgetSummary(
  workspace: ShoppingWorkspace,
  defaultCurrency: CurrencyCode = "USD"
): WorkspaceBudgetSummary {
  let overallTotalMinor = 0;
  const currency: CurrencyCode = workspace.overallBudget?.currency || defaultCurrency;

  const groupSummaries: GroupBudgetSummary[] = workspace.groups.map((group) => {
    let groupTotalMinor = 0;
    let selectedCount = 0;

    for (const item of group.items) {
      if (item.status === "selected" && item.selectedOffer?.priceMinor != null) {
        groupTotalMinor += item.selectedOffer.priceMinor;
        selectedCount += 1;
      } else if (item.status === "selected" && item.selectedProduct?.priceMinor != null) {
        groupTotalMinor += item.selectedProduct.priceMinor;
        selectedCount += 1;
      }
    }

    overallTotalMinor += groupTotalMinor;

    const groupBudgetMinor = group.budget?.amountMinor ?? null;
    const isOverBudget = groupBudgetMinor !== null ? groupTotalMinor > groupBudgetMinor : false;
    const remainingBudgetMinor = groupBudgetMinor !== null ? groupBudgetMinor - groupTotalMinor : null;

    return {
      groupId: group.id,
      groupTitle: group.title,
      currency: group.budget?.currency || currency,
      allocatedBudgetMinor: groupBudgetMinor,
      selectedTotalMinor: groupTotalMinor,
      remainingBudgetMinor,
      isOverBudget,
      isStrict: group.budget?.strict ?? false,
      itemCount: group.items.length,
      selectedCount,
    };
  });

  const overallBudgetMinor = workspace.overallBudget?.amountMinor ?? null;
  const totalAllocatedGroupBudgets = groupSummaries.reduce((sum, g) => sum + (g.allocatedBudgetMinor || 0), 0);
  const effectiveBudgetMinor = overallBudgetMinor ?? (totalAllocatedGroupBudgets > 0 ? totalAllocatedGroupBudgets : null);
  const isOverallOverBudget = effectiveBudgetMinor !== null ? overallTotalMinor > effectiveBudgetMinor : false;
  const remainingOverallMinor = effectiveBudgetMinor !== null ? effectiveBudgetMinor - overallTotalMinor : null;

  return {
    currency,
    overallBudgetMinor: effectiveBudgetMinor,
    totalSelectedMinor: overallTotalMinor,
    remainingMinor: remainingOverallMinor,
    isOverBudget: isOverallOverBudget || groupSummaries.some((g) => g.isOverBudget),
    groups: groupSummaries,
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
