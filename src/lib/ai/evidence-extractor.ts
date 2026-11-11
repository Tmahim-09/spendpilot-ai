import type { NormalizedProduct, EvidenceFact } from "../../types/index.ts";
import { formatCurrency } from "../utils.ts";

export interface ExtractedEvidence {
  evidenceFacts: Record<string, EvidenceFact>;
  factsByProduct: Record<string, EvidenceFact[]>;
  candidateSummariesForPrompt: Array<{
    productId: string;
    title: string;
    brand: string;
    startingPrice: string;
    primaryRetailer: string;
    offersCount: number;
    verifiedFacts: Array<{ id: string; label: string; text: string }>;
  }>;
}

/**
 * Extracts normalized, verifiable evidence facts from genuine Channel3 products.
 * Each fact receives a stable, product-scoped ID (e.g. `fact-prod123-0`)
 * so Gemini can cite exact facts without hallucinating unverified attributes.
 */
export function extractEvidenceFacts(products: NormalizedProduct[]): ExtractedEvidence {
  const evidenceFacts: Record<string, EvidenceFact> = {};
  const factsByProduct: Record<string, EvidenceFact[]> = {};
  const candidateSummariesForPrompt: ExtractedEvidence["candidateSummariesForPrompt"] = [];

  for (const product of products) {
    const rawId = product.sourceProductId || product.title;
    // Clean ID for token and JSON safety
    const cleanId = rawId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    const productFactList: EvidenceFact[] = [];
    let factCounter = 0;

    const addFact = (
      category: EvidenceFact["category"],
      label: string,
      value: string,
      sourceField: string
    ) => {
      const factId = `fact-${cleanId}-${factCounter++}`;
      const fact: EvidenceFact = {
        id: factId,
        productId: rawId,
        category,
        label,
        value,
        sourceField,
      };
      evidenceFacts[factId] = fact;
      productFactList.push(fact);
      return fact;
    };

    // 1. Starting Price
    const startingPriceStr =
      product.priceMinor !== null
        ? formatCurrency(product.priceMinor, product.currency || "USD")
        : "Price not listed";
    addFact("price", "Starting Price", startingPriceStr, "priceMinor");

    // 2. Retailer & Offers
    const offersDesc = `${product.offersCount || 1} offer(s) available; primary retailer: ${
      product.retailerName || "Verified Retailer"
    }`;
    addFact("offer", "Retailer Offers", offersDesc, "offers");

    // 3. Brand
    if (product.brand) {
      addFact("brand", "Brand", product.brand, "brand");
    }

    // 4. Availability
    addFact(
      "attribute",
      "Stock Status",
      product.availability === "in_stock" ? "In stock at retailer" : "Availability to be confirmed at merchant",
      "availability"
    );

    // 5. Verified Specifications
    if (product.specifications && typeof product.specifications === "object") {
      for (const [specKey, specVal] of Object.entries(product.specifications).slice(0, 8)) {
        if (specVal && typeof specVal === "string" && specVal.trim().length > 0) {
          addFact("specification", specKey, specVal.trim(), `specifications.${specKey}`);
        }
      }
    }

    // 5b. Selected Offer Configuration Attributes (strictly tied to selected offer)
    if (product.selectedOffer?.configurationAttributes && typeof product.selectedOffer.configurationAttributes === "object") {
      for (const [cfgKey, cfgVal] of Object.entries(product.selectedOffer.configurationAttributes).slice(0, 5)) {
        if (cfgVal && typeof cfgVal === "string" && cfgVal.trim().length > 0) {
          addFact("specification", cfgKey, cfgVal.trim(), `selectedOffer.configurationAttributes.${cfgKey}`);
        }
      }
    }

    // 6. Source Facts / Features
    if (Array.isArray(product.sourceFacts)) {
      for (const feat of product.sourceFacts.slice(0, 5)) {
        if (feat && typeof feat === "string" && feat.trim().length > 0) {
          addFact("feature", "Verified Feature", feat.trim(), "sourceFacts");
        }
      }
    }

    factsByProduct[rawId] = productFactList;

    // Compact summary formatted for Gemini prompt
    candidateSummariesForPrompt.push({
      productId: rawId,
      title: product.title,
      brand: product.brand || "Not specified",
      startingPrice: startingPriceStr,
      primaryRetailer: product.retailerName || "Verified Retailer",
      offersCount: product.offersCount || 1,
      verifiedFacts: productFactList.map((f) => ({
        id: f.id,
        label: f.label,
        text: f.value,
      })),
    });
  }

  return {
    evidenceFacts,
    factsByProduct,
    candidateSummariesForPrompt,
  };
}
