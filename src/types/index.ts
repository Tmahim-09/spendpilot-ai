export type CurrencyCode = "USD" | "EUR" | "GBP";

/**
 * Validated structured shopping intent parsed from user request (PRD Section 11)
 */
export interface ShoppingIntent {
  query: string;
  categories: string[];
  budgetMinor: number | null;
  currency: CurrencyCode;
  maxItemPriceMinor: number | null;
  mustHave: string[];
  preferences: string[];
  excluded: string[];
}

/**
 * Normalized product schema for Channel3 / provider discovery (PRD Section 11)
 */
export interface NormalizedProduct {
  source: string;
  sourceProductId: string | null;
  title: string;
  imageUrl: string | null;
  priceMinor: number | null;
  currency: CurrencyCode | null;
  retailerName: string | null;
  retailerUrl: string;
  availability: "in_stock" | "out_of_stock" | "unknown";
  specifications: Record<string, string>;
  sourceFacts: string[];
  explanation?: string;
  fitScore?: number;
}

/**
 * Demo catalog item used for controlled PayPal Sandbox checkout (PRD Section 11)
 */
export interface DemoCatalogItem {
  id: string;
  title: string;
  description: string;
  unitAmountMinor: number;
  currency: CurrencyCode;
  active: boolean;
  imageUrl: string;
  category: string;
}

/**
 * Purchase Policy Engine evaluation state (PRD Section 10 & 11)
 */
export interface PolicyEvaluation {
  isApproved: boolean;
  budgetCapMinor: number;
  currentTotalMinor: number;
  remainingMinor: number;
  itemCapMinor: number | null;
  violations: string[];
  notes: string[];
}

/**
 * Interactive prompt scenario for user quick start
 */
export interface ExamplePromptItem {
  id: string;
  title: string;
  prompt: string;
  budgetAmount: number;
  currency: CurrencyCode;
  category: string;
}
