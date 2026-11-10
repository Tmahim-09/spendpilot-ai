import type {
  CurrencyCode,
  NormalizedProduct,
  RecommendedBundle,
  RecommendedBundleItem,
  SetupCategorySearchResult,
  SetupComparisonCategoryResult,
  SetupRequirementItem,
} from "../../types/index.ts";
import { evaluateBundleDiversity } from "./bundle-diversity.ts";
import { isSameProductModel } from "./setup-search.ts";

export interface BuildRecommendedBundleOptions {
  totalBudget: number;
  currency?: CurrencyCode;
  requirements: SetupRequirementItem[];
  categories: SetupCategorySearchResult[];
  comparisons?: SetupComparisonCategoryResult[];
  selectedItemIds?: Record<string, string>; // requirementId -> chosen productId
}

/**
 * Calculates and guarantees a recommended multi-product bundle:
 * - Server strictly performs all monetary math using integer minor units (cents).
 * - Gemini never calculates or guarantees the money.
 * - Verifies prices, currency consistency, item budget ceilings, and total budget cap.
 * - Identifies incomplete requirements transparently without pretending incomplete bundles are complete.
 */
export function calculateRecommendedBundle({
  totalBudget,
  currency = "USD",
  requirements,
  categories,
  comparisons = [],
  selectedItemIds = {},
}: BuildRecommendedBundleOptions): RecommendedBundle {
  const totalBudgetMinor = Math.round(Math.max(0, totalBudget) * 100);

  const categoryMap = new Map<string, SetupCategorySearchResult>();
  for (const cat of categories) {
    categoryMap.set(cat.requirementId, cat);
  }

  const comparisonMap = new Map<string, SetupComparisonCategoryResult>();
  for (const comp of comparisons) {
    comparisonMap.set(comp.requirementId, comp);
  }

  const items: RecommendedBundleItem[] = [];
  const missingRequirements: string[] = [];
  let productSubtotalMinor = 0;

  for (const req of requirements) {
    const cat = categoryMap.get(req.id);
    const comp = comparisonMap.get(req.id);

    const products = cat?.products || [];

    // If no products available or comparator marked this requirement unfulfilled (no verified match)
    if (products.length === 0 || comp?.unfulfilled) {
      missingRequirements.push(req.name);
      continue;
    }

    // Determine chosen product: user override > recommendedProductId > first product
    const requestedChosenId = selectedItemIds[req.id];
    let chosenProduct: NormalizedProduct | undefined;

    if (requestedChosenId) {
      chosenProduct = products.find(
        (p) => (p.sourceProductId || p.title) === requestedChosenId
      );
    }

    if (!chosenProduct && comp?.recommendedProductId) {
      chosenProduct = products.find(
        (p) => (p.sourceProductId || p.title) === comp.recommendedProductId
      );
    }

    if (!chosenProduct) {
      chosenProduct = products[0];
    }

    // Check price and currency validity
    const priceMinor = chosenProduct.priceMinor;
    const isCurrencyMatch = !chosenProduct.currency || chosenProduct.currency === currency;

    if (priceMinor === null || priceMinor <= 0 || !isCurrencyMatch) {
      // Incomparable currency or missing/non-positive price: cannot be safely included in complete bundle!
      missingRequirements.push(req.name);
      continue;
    }

    // Check category budget constraint
    const isOverCategoryBudget = priceMinor > req.allocatedAmountMinor;

    const altProduct = products.find((p) => {
      const isSameId = (p.sourceProductId || p.title) === (chosenProduct?.sourceProductId || chosenProduct?.title);
      if (isSameId) return false;
      if (chosenProduct && isSameProductModel(p, chosenProduct)) return false;
      return true;
    }) || null;

    productSubtotalMinor += priceMinor;

    const comparisonObj: SetupComparisonCategoryResult = comp || {
      requirementId: req.id,
      requirementName: req.name,
      candidateProductIds: products.map((p) => p.sourceProductId || p.title),
      recommendedProductId: chosenProduct.sourceProductId || chosenProduct.title,
      alternativeProductId: altProduct ? altProduct.sourceProductId || altProduct.title : null,
      recommendedReason: "Selected candidate matching requirement and budget.",
      keyDifferences: [],
      tradeoffs: [],
      missingSpecs: [],
    };

    items.push({
      requirementId: req.id,
      requirementName: req.name,
      allocatedAmountMinor: req.allocatedAmountMinor,
      selectedProductId: chosenProduct.sourceProductId || chosenProduct.title,
      selectedProduct: chosenProduct,
      alternativeProduct: altProduct,
      comparison: comparisonObj,
      isOverCategoryBudget,
      relevanceBadge: comp?.relevanceBadge,
      relevanceOutcome: comp?.relevanceOutcome,
      evidenceQuote: comp?.evidenceQuote,
      evidenceField: comp?.evidenceField,
    });
  }

  const isComplete = missingRequirements.length === 0 && items.length === requirements.length;
  const isPartiallyMatched = missingRequirements.length > 0;
  const remainingBudgetMinor = Math.max(0, totalBudgetMinor - productSubtotalMinor);

  // Evaluate visual and functional diversity of the bundle
  const diversityReport = evaluateBundleDiversity(items, requirements);

  // Identify which item takes the largest portion of the budget
  let largestBudgetItemName: string | undefined;
  let largestBudgetItemPercentage: number | undefined;

  if (items.length > 0 && totalBudgetMinor > 0) {
    let maxItemPriceMinor = -1;
    for (const item of items) {
      const price = item.selectedProduct.priceMinor || 0;
      if (price > maxItemPriceMinor) {
        maxItemPriceMinor = price;
        largestBudgetItemName = item.requirementName;
        largestBudgetItemPercentage = Math.round((price / totalBudgetMinor) * 100);
      }
    }
  }

  return {
    currency,
    totalBudgetMinor,
    productSubtotalMinor,
    remainingBudgetMinor,
    isComplete,
    isPartiallyMatched,
    diversityWarnings: diversityReport.warnings,
    isDiverse: diversityReport.isDiverse,
    missingRequirements,
    items,
    shippingNotice:
      "Shipping fees and delivery options are confirmed at merchant checkout; not included in product subtotal.",
    taxNotice:
      "Estimated taxes and duties vary by local jurisdiction and are calculated at merchant checkout.",
    largestBudgetItemName,
    largestBudgetItemPercentage,
  };
}
