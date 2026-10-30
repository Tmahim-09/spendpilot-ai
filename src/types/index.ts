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

export type ShoppingMode = "single" | "setup";
export type PricePreference = "near_budget" | "best_value";

/**
 * Request payload for POST /api/products/search & /api/shopping/plan
 */
export interface SearchProductsRequestPayload {
  query: string;
  budget?: number | null;
  currency?: CurrencyCode;
  mode?: ShoppingMode;
  pricePreference?: PricePreference;
  expandRange?: boolean;
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
  isUnrelated?: boolean;
  playfulMessage?: string;
  suggestedProducts?: string[];
  mode?: ShoppingMode;
  pricePreference?: PricePreference;
  preferredRange?: {
    min: number;
    max: number;
  } | null;
  preferredRangeText?: string | null;
  emptyInPreferredRange?: boolean;
  isRangeExpanded?: boolean;
  timings?: {
    durationMs: number;
    requestId?: string;
  };
  error?: string;
}

/**
 * An individual item requirement inside a multi-product setup (Mode B)
 */
export interface SetupRequirementItem {
  id: string; // e.g. "req-desktop", "req-monitor"
  name: string; // e.g. "Gaming desktop PC"
  searchQuery: string; // e.g. "gaming desktop PC RTX"
  allocationPercentage: number; // e.g. 60
  allocatedAmountMinor: number; // integer cents (e.g. 180000 for $1,800.00)
  allocatedAmount: number; // dollar representation (e.g. 1800)
  requirements: string[];
  priority: "high" | "medium" | "low";
}

/**
 * Gemini decomposition result of a multi-product setup request
 */
export interface SetupDecompositionResult {
  currency: CurrencyCode;
  totalBudget: number;
  totalBudgetMinor: number;
  allocatedTotalMinor: number;
  remainingUnallocatedMinor: number;
  items: SetupRequirementItem[];
  summary: string;
  isPrebuiltVsCustom?: "prebuilt" | "custom_pc" | "standard";
}

/**
 * Channel3 discovery result for one requirement category in a setup (max 2 distinct products)
 */
export interface SetupCategorySearchResult {
  requirementId: string;
  requirementName: string;
  searchQuery: string;
  allocatedAmountMinor: number;
  products: NormalizedProduct[]; // At most 2 distinct products
  status: "fulfilled" | "partial" | "unavailable";
  emptyInPreferredRange?: boolean;
  isRangeExpanded?: boolean;
  errorMessage?: string;
}

/**
 * AI comparison for a specific setup requirement category
 */
export interface SetupComparisonCategoryResult {
  requirementId: string;
  requirementName: string;
  candidateProductIds: string[];
  recommendedProductId: string | null;
  alternativeProductId: string | null;
  recommendedReason: string;
  keyDifferences: string[];
  tradeoffs: string[];
  missingSpecs: string[];
  compatibilityNotes?: string;
  compatibilityStatus?: "verified" | "unverified" | "not_applicable";
}

/**
 * Item in the final recommended bundle
 */
export interface RecommendedBundleItem {
  requirementId: string;
  requirementName: string;
  allocatedAmountMinor: number;
  selectedProductId: string;
  selectedProduct: NormalizedProduct;
  alternativeProduct?: NormalizedProduct | null;
  comparison: SetupComparisonCategoryResult;
  isOverCategoryBudget: boolean;
}

/**
 * Recommended multi-product bundle guaranteed by server calculations
 */
export interface RecommendedBundle {
  currency: CurrencyCode;
  totalBudgetMinor: number;
  productSubtotalMinor: number;
  remainingBudgetMinor: number;
  isComplete: boolean;
  missingRequirements: string[];
  items: RecommendedBundleItem[];
  shippingNotice: string;
  taxNotice: string;
  largestBudgetItemName?: string;
  largestBudgetItemPercentage?: number;
}

/**
 * API Payloads for Multi-product Setup
 */
export interface SetupDecomposeRequestPayload {
  query: string;
  budget?: number;
  totalBudget?: number;
  currency?: CurrencyCode;
}

export interface SetupDecomposeResponsePayload {
  success: boolean;
  decomposition?: SetupDecompositionResult | null;
  error?: string;
  timings?: {
    durationMs: number;
    requestId?: string;
  };
}

export interface SetupSearchRequestPayload {
  items: SetupRequirementItem[];
  totalBudget: number;
  currency?: CurrencyCode;
  pricePreference?: PricePreference;
  expandRequirementIds?: string[];
}

export interface SetupSearchResponsePayload {
  success: boolean;
  currency: CurrencyCode;
  totalBudget: number;
  categories: SetupCategorySearchResult[];
  totalCandidates: number;
  error?: string;
  timings?: {
    durationMs: number;
    requestId?: string;
  };
}

export interface SetupCompareRequestPayload {
  query: string;
  totalBudget: number;
  currency?: CurrencyCode;
  requirements: SetupRequirementItem[];
  categories: SetupCategorySearchResult[];
  selectedItemIds?: Record<string, string>; // requirementId -> chosen productId
}

export interface SetupCompareResponsePayload {
  success: boolean;
  aiStatus: AiProcessingStatus;
  aiMessage?: string | null;
  bundle: RecommendedBundle;
  comparisons: SetupComparisonCategoryResult[];
  modelUsed?: string;
  usedFallback?: boolean;
  error?: string;
  timings?: {
    durationMs: number;
    requestId?: string;
  };
}

export type AiProcessingStatus = "complete" | "partial" | "unavailable";

export type AssessmentRating = "strong" | "partial" | "weak" | "unknown";

/**
 * Normalized evidence fact extracted from genuine Channel3 data
 */
export interface EvidenceFact {
  id: string; // e.g. "fact-prod1-0"
  productId: string;
  category: "attribute" | "specification" | "offer" | "price" | "feature" | "brand";
  label: string;
  value: string;
  sourceField: string;
}

/**
 * Assessment of a product against a specific comparison criterion
 */
export interface CriterionAssessment {
  productId: string;
  assessment: AssessmentRating;
  reason: string;
  evidenceFactIds: string[];
}

/**
 * A relevant comparison criterion evaluated across candidate products
 */
export interface ComparisonCriterion {
  name: string;
  importance: "high" | "medium" | "low";
  assessments: CriterionAssessment[];
}

/**
 * A notable trade-off or limitation for a candidate product
 */
export interface ProductTradeOff {
  productId: string;
  summary: string;
}

/**
 * An alternative product pick tailored to a specific user priority
 */
export interface AlternativePick {
  productId: string;
  bestFor: string;
  reason: string;
}

/**
 * An important requested specification that was not provided in the listing
 */
export interface MissingInformation {
  productId: string;
  field: string;
  explanation: string;
}

/**
 * Structured AI Comparison Contract (Section 4)
 */
export interface AiComparisonResult {
  summary: string;
  bestMatchProductId: string;
  bestMatchReason: string;
  priorityInterpretation: string[];
  criteria: ComparisonCriterion[];
  tradeoffs: ProductTradeOff[];
  alternativePicks: AlternativePick[];
  missingInformation: MissingInformation[];
}

/**
 * Request payload for POST /api/shopping/recommend (Asynchronous Gemini AI ranking & comparison)
 */
export interface ShoppingRecommendRequestPayload {
  query: string;
  products: NormalizedProduct[];
  budget?: number | null;
  currency?: CurrencyCode;
  intent?: ParsedShoppingIntent;
  priorityOverride?: string;
}

export type GeminiErrorCategory =
  | "rate_limited"
  | "transient_error"
  | "auth_error"
  | "invalid_request"
  | "model_not_found"
  | "timeout"
  | "validation_error"
  | "unknown";

export interface ModelAttemptDiagnostic {
  requestId: string;
  model: string;
  attemptNumber: number;
  durationMs: number;
  outcome:
    | "success"
    | "rate_limited"
    | "transient_error"
    | "auth_error"
    | "invalid_request"
    | "model_not_found"
    | "timeout"
    | "validation_failed";
  category: GeminiErrorCategory;
  errorSummary?: string;
}

/**
 * Response payload for POST /api/shopping/recommend (Asynchronous Gemini AI ranking & comparison)
 */
export interface ShoppingRecommendResponsePayload {
  success: boolean;
  aiStatus: AiProcessingStatus;
  aiMessage?: string | null;
  comparison?: AiComparisonResult | null;
  evidenceFacts?: Record<string, EvidenceFact>;
  topRecommendations: NormalizedProduct[];
  otherMatches: NormalizedProduct[];
  allProducts: NormalizedProduct[];
  comparisonOverview?: string | null;
  modelUsed?: string;
  usedFallback?: boolean;
  timings?: {
    geminiDurationMs: number;
    requestId?: string;
  };
  error?: string;
}

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
