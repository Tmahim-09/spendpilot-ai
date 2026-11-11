import type {
  NormalizedProduct,
  ProductOfferItem,
  CurrencyCode,
  AiComparisonResult,
  EvidenceFact,
} from "../../types/index.ts";

export type ShoppingGroupType = "independent" | "coordinated_setup";

export type ShoppingGroupStatus =
  | "planning"
  | "clarifying"
  | "searching"
  | "selecting"
  | "complete";

export type ShoppingItemPriority = "essential" | "preferred" | "optional";

export type ShoppingItemStatus =
  | "needs_clarification"
  | "ready_to_search"
  | "searching"
  | "results_ready"
  | "selected"
  | "skipped"
  | "unavailable";

export type CompatibilityStatus =
  | "verified_compatible"
  | "verified_incompatible"
  | "not_enough_info"
  | "not_applicable";

export interface ItemCompatibilityReport {
  status: CompatibilityStatus;
  summary: string;
  evaluatedAttributes: Array<{
    attributeKey: string;
    parentValue?: string | number | boolean;
    itemValue?: string | number | boolean;
    isMatch: boolean | null; // null = not enough info
    reason: string;
  }>;
}

export interface ShoppingItemBudget {
  amountMinor: number;
  currency: CurrencyCode;
  strict: boolean;
}

export interface ShoppingGroupBudget {
  amountMinor: number;
  currency: CurrencyCode;
  scope: "group";
  strict: boolean;
}

export type ItemSearchStatus =
  | "idle"
  | "understanding"
  | "searching"
  | "results_ready"
  | "comparing"
  | "completed"
  | "error";

export interface ShoppingItem {
  id: string;
  productRequest: string;
  category: string;
  displayName?: string;
  requirementId?: string; // Explicit 1-to-1 link to ShoppingBrief ProductRequirement.id
  hardConstraints: Record<string, string | number | boolean>;
  preferences: Record<string, string | number | boolean>;
  individualBudget?: ShoppingItemBudget;
  priority: ShoppingItemPriority;
  status: ShoppingItemStatus;
  searchId?: string;
  searchFingerprint?: string;
  searchStatus?: ItemSearchStatus;
  candidates: NormalizedProduct[];
  comparison?: AiComparisonResult | null;
  evidenceFacts?: Record<string, EvidenceFact>;
  selectedProductId?: string;
  selectedProduct?: NormalizedProduct | null;
  selectedOffer?: ProductOfferItem | null;
  selectedVariant?: Record<string, string>;
  dependencies: string[]; // List of ShoppingItem IDs this item depends on
  compatibility?: ItemCompatibilityReport;
  answeredQuestionIds: string[];
  searchQuery?: string;
  searchError?: string | null;
}

export interface ShoppingGroup {
  id: string;
  type: ShoppingGroupType;
  title: string;
  sharedRequirements: Record<string, unknown>;
  budget?: ShoppingGroupBudget;
  items: ShoppingItem[];
  status: ShoppingGroupStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ShoppingWorkspace {
  id: string;
  revision: number;
  activeGroupId: string | null;
  activeItemId: string | null;
  groups: ShoppingGroup[];
  overallBudget?: {
    amountMinor: number;
    currency: CurrencyCode;
    strict: boolean;
  };
  createdAt: number;
  updatedAt: number;
}

export type CurrencyTotals = Partial<Record<CurrencyCode, number>>;

export type BudgetComparisonStatus =
  | "no_budget"
  | "within_budget"
  | "over_budget"
  | "partially_comparable"
  | "not_comparable";

export interface GroupBudgetSummary {
  groupId: string;
  groupTitle: string;
  currency: CurrencyCode;
  allocatedBudgetMinor: number | null;
  budgetCurrency: CurrencyCode | null;
  totalsByCurrency: CurrencyTotals;
  selectedTotalInBudgetCurrencyMinor: number | null;
  selectedTotalMinor: number;
  remainingBudgetMinor: number | null;
  status: BudgetComparisonStatus;
  isOverBudget: boolean;
  isStrict: boolean;
  itemCount: number;
  selectedCount: number;
  foreignCurrencyTotals: CurrencyTotals;
  unpricedCount: number;
  unsupportedCurrencyCount: number;
}

export interface WorkspaceBudgetSummary {
  currency: CurrencyCode;
  overallBudgetMinor: number | null;
  budgetCurrency: CurrencyCode | null;
  totalsByCurrency: CurrencyTotals;
  selectedTotalInBudgetCurrencyMinor: number | null;
  totalSelectedMinor: number;
  remainingMinor: number | null;
  status: BudgetComparisonStatus;
  isOverBudget: boolean;
  foreignCurrencyTotals: CurrencyTotals;
  unpricedCount: number;
  unsupportedCurrencyCount: number;
  groups: GroupBudgetSummary[];
}

