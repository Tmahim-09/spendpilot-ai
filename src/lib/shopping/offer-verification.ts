import type {
  NormalizedProduct,
  ProductOfferItem,
  CanonicalShoppingAttribute,
  ConfigurationVerificationStatus,
} from "@/types";

export interface ConfigurationMatchResult {
  isMatch: boolean;
  status: ConfigurationVerificationStatus;
  reason: string;
  matchedAttributes: Record<string, string>;
  unverifiedAttributes: string[];
}

/**
 * Normalizes a string attribute value for comparison (e.g. "1TB SSD" -> "1tb", "16 GB" -> "16gb").
 */
function normalizeAttrValue(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, "").replace(/ssd|unifiedmemory|ram/gi, "");
}

/**
 * Decides whether an individual retailer offer belongs to the requested configuration.
 *
 * An offer is considered configuration-verified ONLY when actual provider data
 * establishes the relationship between the exact offer and the exact product configuration.
 *
 * Rules:
 * 1. Do NOT treat parent-level aggregated specifications as proof that every retailer offer has those specifications.
 * 2. Do NOT infer configuration from price (e.g. assuming the cheapest offer is the base tier).
 * 3. Do NOT assume a retailer offer belongs to the configuration in the canonical title unless the offer itself confirms it.
 * 4. Acceptable evidence:
 *    - Explicit offer-level configuration attributes (e.g. from resolved variants or offer dimensions).
 *    - Resolved Channel3 variant offers where the variant selection matches the requirement.
 *    - An unambiguous SKU/model token in the offer URL (e.g., "1tb" or specific model number).
 */
export function matchOfferToConfiguration(
  product: NormalizedProduct,
  offer: ProductOfferItem,
  requirements?: Record<string, CanonicalShoppingAttribute> | null
): ConfigurationMatchResult {
  // If no requirements were provided, an offer has no hard constraints to fail against
  if (!requirements || Object.keys(requirements).length === 0) {
    return {
      isMatch: true,
      status: offer.verificationStatus || "unverified",
      reason: "No specific configuration requested; listing offer accepted for standard exploration.",
      matchedAttributes: {},
      unverifiedAttributes: [],
    };
  }

  const matchedAttributes: Record<string, string> = {};
  const unverifiedAttributes: string[] = [];
  const offerAttrs = offer.configurationAttributes || {};
  const offerUrlLower = (offer.url || "").toLowerCase();

  // Inspect each hard requirement
  for (const [key, req] of Object.entries(requirements)) {
    if (req.status === "skipped" || req.constraint !== "hard_requirement") {
      continue;
    }

    const reqVal = Array.isArray(req.value) ? req.value.join(", ") : String(req.value);
    const reqNorm = normalizeAttrValue(reqVal);

    // Skip generic values
    if (!reqNorm || reqNorm === "nopreference" || reqNorm === "any") {
      continue;
    }

    // 1. Check if offer has explicit configuration attribute
    const offerAttrVal = offerAttrs[key] || offerAttrs[req.label] || offerAttrs[req.key];
    if (offerAttrVal) {
      const offerNorm = normalizeAttrValue(offerAttrVal);
      if (offerNorm === reqNorm || offerNorm.includes(reqNorm) || reqNorm.includes(offerNorm)) {
        matchedAttributes[key] = offerAttrVal;
        continue;
      } else {
        // Explicit attribute mismatch
        return {
          isMatch: false,
          status: "unverified",
          reason: `Offer from ${offer.domain} explicitly states ${key}="${offerAttrVal}", which does not match requested "${reqVal}".`,
          matchedAttributes,
          unverifiedAttributes: [key],
        };
      }
    }

    // 2. Check if the offer URL contains a verified configuration token
    // (e.g. a direct merchant landing URL ending with "/macbook-pro-1tb" or "1tb-ssd")
    if (offerUrlLower.includes(reqNorm) && reqNorm.length >= 3) {
      matchedAttributes[key] = `URL Token (${reqVal})`;
      continue;
    }

    // 3. For hardware constraints (storage, RAM, chip):
    // If the canonical product aggregated this spec, but the offer has NO offer-level metadata,
    // the offer CANNOT be verified for this constraint.
    const isHardwareConstraint =
      key.includes("storage") ||
      key.includes("ram") ||
      key.includes("memory") ||
      key.includes("chip") ||
      key.includes("size") ||
      key.includes("capacity");

    if (isHardwareConstraint) {
      unverifiedAttributes.push(`${req.label || key}: "${reqVal}"`);
    }
  }

  if (unverifiedAttributes.length > 0) {
    return {
      isMatch: false,
      status: "unverified",
      reason: `Offer from ${offer.domain} does not provide verified evidence for: ${unverifiedAttributes.join(", ")}.`,
      matchedAttributes,
      unverifiedAttributes,
    };
  }

  return {
    isMatch: true,
    status: "verified",
    reason: `Offer from ${offer.domain} is verified for requested configuration.`,
    matchedAttributes,
    unverifiedAttributes: [],
  };
}

/**
 * Resolves and establishes the authoritative selected offer for a product
 * based on the active shopping requirements.
 *
 * Never blindly picks the cheapest offer as a verified match.
 */
export function verifyAndSelectOffer(
  product: NormalizedProduct,
  requirements?: Record<string, CanonicalShoppingAttribute> | null
): NormalizedProduct {
  const offers = product.offers || [];
  if (offers.length === 0) {
    return {
      ...product,
      selectedOffer: null,
      priceMinor: null,
      configurationStatus: "unavailable",
      configurationNotice: "No retailer offers available for this listing.",
    };
  }

  // Evaluate each offer against requirements
  const evaluatedOffers: ProductOfferItem[] = offers.map((offer) => {
    const match = matchOfferToConfiguration(product, offer, requirements);
    return {
      ...offer,
      verificationStatus: match.status,
      verificationReason: match.reason,
    };
  });

  // Check if any offer is verified for the configuration
  const verifiedOffers = evaluatedOffers.filter((o) => o.verificationStatus === "verified");

  if (verifiedOffers.length > 0) {
    // Select the best verified offer (prefer in-stock verified offer, then lowest verified price)
    const sortedVerified = [...verifiedOffers].sort((a, b) => {
      if (a.availability === "in_stock" && b.availability !== "in_stock") return -1;
      if (b.availability === "in_stock" && a.availability !== "in_stock") return 1;
      return a.priceMinor - b.priceMinor;
    });

    const selected = sortedVerified[0];
    return {
      ...product,
      offers: evaluatedOffers,
      selectedOffer: selected,
      priceMinor: selected.priceMinor,
      compareAtPriceMinor: selected.compareAtPriceMinor ?? product.compareAtPriceMinor ?? null,
      currency: selected.currency || product.currency,
      retailerName: selected.domain,
      retailerUrl: selected.url,
      availability: selected.availability,
      configurationStatus: "verified",
      configurationNotice: null,
    };
  }

  // If no offer is verified for the requested configuration
  const hasSpecificHardRequirements =
    requirements &&
    Object.values(requirements).some(
      (r) =>
        r.status === "confirmed" &&
        r.constraint === "hard_requirement" &&
        r.value !== "No preference" &&
        normalizeAttrValue(String(r.value)).length > 0
    );

  if (hasSpecificHardRequirements) {
    // Honest unverified configuration state:
    // Do NOT display the unverified offer price as a confirmed product price.
    // Set configurationStatus to "unverified".
    const firstOffer = evaluatedOffers[0];
    return {
      ...product,
      offers: evaluatedOffers,
      selectedOffer: {
        ...firstOffer,
        verificationStatus: "unverified",
      },
      // Confirmed price is null because no verified offer exists for the requirement
      priceMinor: null,
      compareAtPriceMinor: null,
      currency: firstOffer.currency || product.currency,
      retailerName: firstOffer.domain,
      retailerUrl: firstOffer.url,
      availability: firstOffer.availability,
      configurationStatus: "unverified",
      configurationNotice: "Configuration not price-verified with retailer offer",
    };
  }

  // Generic requirement (no specific custom configuration requested):
  // Preserve listing exploration price, but mark status as unverified custom configuration
  const sortedOffers = [...evaluatedOffers].sort((a, b) => {
    if (a.availability === "in_stock" && b.availability !== "in_stock") return -1;
    if (b.availability === "in_stock" && a.availability !== "in_stock") return 1;
    return a.priceMinor - b.priceMinor;
  });
  const provisional = sortedOffers[0];

  return {
    ...product,
    offers: evaluatedOffers,
    selectedOffer: provisional,
    priceMinor: provisional.priceMinor,
    compareAtPriceMinor: provisional.compareAtPriceMinor ?? null,
    currency: provisional.currency || product.currency,
    retailerName: provisional.domain,
    retailerUrl: provisional.url,
    availability: provisional.availability,
    configurationStatus: "unverified",
    configurationNotice: null,
  };
}

/**
 * Authoritatively switches a product's selected retailer offer to a different merchant offer.
 * Updates selected offer, displayed price, availability, retailer link, and verification status.
 */
export function selectRetailerOffer(
  product: NormalizedProduct,
  targetOfferUrlOrDomain: string,
  requirements?: Record<string, CanonicalShoppingAttribute> | null
): NormalizedProduct {
  const offers = product.offers || [];
  if (offers.length === 0) return product;

  // Find target offer by URL exact match, then domain match
  const target =
    offers.find((o) => o.url === targetOfferUrlOrDomain) ||
    offers.find((o) => o.domain.toLowerCase() === targetOfferUrlOrDomain.toLowerCase()) ||
    offers[0];

  const match = matchOfferToConfiguration(product, target, requirements);

  const updatedTarget: ProductOfferItem = {
    ...target,
    verificationStatus: match.status,
    verificationReason: match.reason,
  };

  const isVerified = match.status === "verified";

  return {
    ...product,
    selectedOffer: updatedTarget,
    priceMinor: isVerified ? updatedTarget.priceMinor : product.priceMinor ?? updatedTarget.priceMinor,
    compareAtPriceMinor: updatedTarget.compareAtPriceMinor ?? null,
    currency: updatedTarget.currency,
    retailerName: updatedTarget.domain,
    retailerUrl: updatedTarget.url,
    availability: updatedTarget.availability,
    configurationStatus: match.status,
    configurationNotice: isVerified ? null : "Configuration not price-verified",
  };
}

