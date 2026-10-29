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
 * Parsed Shopping Intent from Gemini Natural Language Interpretation (Phase 3)
 */
export interface ParsedShoppingIntent {
  isShoppingRequest: boolean;
  searchQuery: string;
  category: string;
  totalBudget: number | null;
  maxItemPrice: number | null;
  currency: CurrencyCode;
  mustHave: string[];
  preferences: string[];
  excluded: string[];
  summary: string;
  needsClarification: boolean;
  clarificationMessage?: string | null;
}

/**
 * An individual retailer offer associated with a product
 */
export interface ProductOfferItem {
  domain: string;
  url: string;
  priceMinor: number;
  compareAtPriceMinor?: number | null;
  currency: CurrencyCode;
  availability: "in_stock" | "out_of_stock" | "unknown";
  condition?: string | null;
}

/**
 * Normalized product schema for Channel3 / provider discovery (PRD Section 11)
 */
export interface NormalizedProduct {
  source: string;
  sourceProductId: string | null;
  title: string;
  brand?: string | null;
  description?: string | null;
  imageUrl: string | null;
  cleanedImageUrl?: string | null;
  priceMinor: number | null;
  compareAtPriceMinor?: number | null;
  currency: CurrencyCode | null;
  retailerName: string | null;
  retailerUrl: string;
  availability: "in_stock" | "out_of_stock" | "unknown";
  offers?: ProductOfferItem[];
  offersCount?: number;
  specifications: Record<string, string>;
  sourceFacts: string[];
  explanation?: string;
  fitScore?: number;
  rank?: number;
  keyTradeOffs?: string;
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

/**
 * Request payload for POST /api/products/search & /api/shopping/plan
 */
export interface SearchProductsRequestPayload {
  query: string;
  budget?: number | null;
  currency?: CurrencyCode;
}

/**
 * Response payload for POST /api/products/search (Direct Channel3 search)
 */
export interface SearchProductsResponsePayload {
  success: boolean;
  query: string;
  budgetApplied?: number | null;
  currency: CurrencyCode;
  count: number;
  products: NormalizedProduct[];
  cached?: boolean;
  error?: string;
}

export type AiProcessingStatus = "complete" | "partial" | "unavailable";

/**
 * Response payload for POST /api/shopping/plan (Gemini + Channel3 Orchestration)
 */
export interface ShoppingPlanResponsePayload {
  success: boolean;
  aiStatus: AiProcessingStatus;
  aiMessage?: string | null;
  intent: ParsedShoppingIntent | null;
  topRecommendations: NormalizedProduct[];
  otherMatches: NormalizedProduct[];
  allProducts: NormalizedProduct[];
  comparisonOverview?: string | null;
  query: string;
  budgetApplied?: number | null;
  currency: CurrencyCode;
  count: number;
  cached?: boolean;
  error?: string;
}
