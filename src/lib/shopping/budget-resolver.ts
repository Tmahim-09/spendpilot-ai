import type {
  ShoppingItem,
  ShoppingGroup,
  ShoppingWorkspace,
} from "../workspace/types.ts";
import type { CurrencyCode } from "../../types/index.ts";
import type { ShoppingBrief } from "../orchestrator/types.ts";
import { isSupportedCurrency } from "../money.ts";

export type BudgetScopeType =
  | "item_ceiling"
  | "shared_setup_remaining"
  | "group_ceiling"
  | "brief_ceiling"
  | "session_ceiling"
  | "none";

export interface ResolvedAuthoritativeBudget {
  /** The effective budget ceiling in integer minor units (cents) */
  budgetMinor: number | null;
  /** The resolved currency for this budget */
  currency: CurrencyCode;
  /** What rule / scope resolved this budget */
  scopeType: BudgetScopeType;
  /** Whether the budget ceiling is strict (no over-budget allowed) */
  isStrict: boolean;
  /** If part of a coordinated setup, the total setup budget */
  setupTotalMinor?: number | null;
  /** If part of a coordinated setup, amount spent by other selected items */
  setupSpentMinor?: number | null;
  /** If part of a coordinated setup, the remaining unspent budget for this item */
  setupRemainingMinor?: number | null;
}

export interface BudgetResolutionOptions {
  /** Target shopping item */
  item: ShoppingItem;
  /** The group containing this item */
  group?: ShoppingGroup | null;
  /** The full workspace */
  workspace?: ShoppingWorkspace | null;
  /** Central Shopping Brief */
  brief?: ShoppingBrief | null;
  /** Session-level budget (in cents or major units) */
  sessionBudget?: number | null;
  /** Session currency */
  sessionCurrency?: CurrencyCode;
  /** Explicit requested budget from direct call */
  requestedBudgetMinor?: number | null;
  /** Explicit requested currency from direct call */
  requestedCurrency?: CurrencyCode;
}

/**
 * Normalizes an unknown budget number into integer minor units (cents).
 * Handles inputs in major units ($1,200) or minor units (120,000 cents).
 */
export function normalizeToMinorUnits(
  value: number | null | undefined
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  // If it's already an integer > 10,000 and not divisible by 100, or explicitly cents
  // Standard heuristic: SpendPilot treats budget > 0 as either major or minor.
  // In SpendPilot session state, session.budget is explicitly documented as integer minor units (cents).
  // But if callers pass e.g. 1200, we check if it is already in cents or major units.
  return Math.round(value);
}

/**
 * Authoritatively resolves the active budget ceiling and currency for a shopping item
 * using the strict hierarchical resolution policy:
 *
 * Hierarchy:
 * 1. Explicit individual product budget (`item.individualBudget`)
 * 2. Applicable coordinated setup remaining shared budget
 * 3. Applicable group budget (`group.budget`)
 * 4. Shopping brief budget ceiling (`brief.budget.maximum` or requirement suggested budget)
 * 5. Current chat session budget (`chatSession.budget` or requested options)
 * 6. None (null)
 */
export function resolveAuthoritativeBudget(
  options: BudgetResolutionOptions
): ResolvedAuthoritativeBudget {
  const {
    item,
    group,
    brief,
    sessionBudget,
    sessionCurrency = "USD",
    requestedBudgetMinor,
    requestedCurrency,
  } = options;

  const fallbackCurrency: CurrencyCode =
    requestedCurrency && isSupportedCurrency(requestedCurrency)
      ? requestedCurrency
      : sessionCurrency && isSupportedCurrency(sessionCurrency)
      ? sessionCurrency
      : "USD";

  // 1. Explicit Individual Product Budget
  if (
    item.individualBudget &&
    typeof item.individualBudget.amountMinor === "number" &&
    item.individualBudget.amountMinor > 0
  ) {
    const itemCurr = isSupportedCurrency(item.individualBudget.currency)
      ? item.individualBudget.currency
      : fallbackCurrency;
    return {
      budgetMinor: Math.round(item.individualBudget.amountMinor),
      currency: itemCurr,
      scopeType: "item_ceiling",
      isStrict: item.individualBudget.strict ?? true,
    };
  }

  // 2. Applicable Coordinated Setup Item Allocation / Remaining Shared Budget
  if (group && group.type === "coordinated_setup" && group.budget && group.budget.amountMinor > 0) {
    const groupCurr = isSupportedCurrency(group.budget.currency)
      ? group.budget.currency
      : fallbackCurrency;
    const totalSetupMinor = Math.round(group.budget.amountMinor);

    // Calculate sum of already-selected other items in this group with matching currency
    let spentMinor = 0;
    for (const otherItem of group.items) {
      if (otherItem.id === item.id) continue;
      if (otherItem.status === "selected" || otherItem.selectedProductId) {
        const offerPrice =
          otherItem.selectedOffer?.priceMinor ??
          otherItem.selectedProduct?.priceMinor ??
          null;
        const offerCurr =
          otherItem.selectedOffer?.currency ??
          otherItem.selectedProduct?.currency ??
          groupCurr;

        if (
          typeof offerPrice === "number" &&
          offerPrice > 0 &&
          offerCurr === groupCurr
        ) {
          spentMinor += Math.round(offerPrice);
        }
      }
    }

    const remainingMinor = Math.max(0, totalSetupMinor - spentMinor);

    return {
      budgetMinor: remainingMinor,
      currency: groupCurr,
      scopeType: "shared_setup_remaining",
      isStrict: group.budget.strict ?? true,
      setupTotalMinor: totalSetupMinor,
      setupSpentMinor: spentMinor,
      setupRemainingMinor: remainingMinor,
    };
  }

  // 3. Applicable Group Budget (for non-setup groups with an allocated budget)
  if (group && group.budget && typeof group.budget.amountMinor === "number" && group.budget.amountMinor > 0) {
    const groupCurr = isSupportedCurrency(group.budget.currency)
      ? group.budget.currency
      : fallbackCurrency;
    return {
      budgetMinor: Math.round(group.budget.amountMinor),
      currency: groupCurr,
      scopeType: "group_ceiling",
      isStrict: group.budget.strict ?? true,
    };
  }

  // 4. Shopping Brief Budget Ceiling
  // Check if brief has a matching product requirement with a suggested budget
  if (brief) {
    const matchingReq = brief.productRequirements?.find(
      (r) => r.id === item.requirementId || r.id === item.id
    );
    if (
      matchingReq &&
      typeof matchingReq.suggestedBudgetMinor === "number" &&
      matchingReq.suggestedBudgetMinor > 0
    ) {
      const briefCurr =
        brief.budget?.maximum?.currency && isSupportedCurrency(brief.budget.maximum.currency)
          ? (brief.budget.maximum.currency as CurrencyCode)
          : fallbackCurrency;
      return {
        budgetMinor: Math.round(matchingReq.suggestedBudgetMinor),
        currency: briefCurr,
        scopeType: "brief_ceiling",
        isStrict: true,
      };
    }

    if (
      brief.budget?.maximum &&
      typeof brief.budget.maximum.amountMinor === "number" &&
      brief.budget.maximum.amountMinor > 0
    ) {
      const briefCurr = isSupportedCurrency(brief.budget.maximum.currency)
        ? (brief.budget.maximum.currency as CurrencyCode)
        : fallbackCurrency;
      return {
        budgetMinor: Math.round(brief.budget.maximum.amountMinor),
        currency: briefCurr,
        scopeType: "brief_ceiling",
        isStrict: true,
      };
    }
  }

  // 5. Explicit Requested Budget or Current Chat Session Budget
  if (typeof requestedBudgetMinor === "number" && requestedBudgetMinor > 0) {
    const reqCurr = requestedCurrency && isSupportedCurrency(requestedCurrency)
      ? requestedCurrency
      : fallbackCurrency;
    return {
      budgetMinor: Math.round(requestedBudgetMinor),
      currency: reqCurr,
      scopeType: "session_ceiling",
      isStrict: true,
    };
  }

  if (typeof sessionBudget === "number" && sessionBudget > 0) {
    return {
      budgetMinor: Math.round(sessionBudget),
      currency: fallbackCurrency,
      scopeType: "session_ceiling",
      isStrict: true,
    };
  }

  // 6. No Budget Specified
  return {
    budgetMinor: null,
    currency: fallbackCurrency,
    scopeType: "none",
    isStrict: false,
  };
}
