import type { Channel3Api } from "@channel3/sdk";
import type { NormalizedProduct, ProductOfferItem, CurrencyCode } from "@/types";
import { isSupportedCurrency } from "@/lib/money";

/**
 * Validates whether a given URL is a syntactically valid HTTP/HTTPS URL.
 */
function isValidHttpUrl(urlStr: string | null | undefined): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normalizes availability status string into application enum.
 */
function normalizeAvailability(status?: string | null): "in_stock" | "out_of_stock" | "unknown" {
  if (!status) return "unknown";
  const s = status.toLowerCase();
  if (s.includes("in") || s === "instock") return "in_stock";
  if (s.includes("out") || s === "outofstock") return "out_of_stock";
  return "unknown";
}

/**
 * Generates a stable deterministic fallback ID based on title and brand when raw.id is missing.
 */
function deterministicFallbackId(title: string, brand?: string | null): string {
  const base = `${brand || ""}_${title || "item"}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `prod_${base || "item"}`;
}

/**
 * Normalizes a raw Channel3 API Product into the application-owned NormalizedProduct type.
 * Never throws — gracefully degrades if fields are missing or malformed.
 */
export function normalizeChannel3Product(
  raw: Channel3Api.Product,
  fallbackCurrency: CurrencyCode = "USD"
): NormalizedProduct | null {
  if (!raw || typeof raw !== "object") return null;

  const title = (raw.title && typeof raw.title === "string" ? raw.title.trim() : "") || "Untitled Product";

  // Brand resolution
  let brand: string | null = null;
  if (raw.brands && Array.isArray(raw.brands) && raw.brands.length > 0) {
    brand = raw.brands[0]?.name || null;
  }

  const id = raw.id || deterministicFallbackId(title, brand);

  // Description
  const description =
    raw.description && typeof raw.description === "string" ? raw.description.trim() : null;

  // Image resolution (prefer cleaned_url for clean product presentation, fall back to url)
  let imageUrl: string | null = null;
  let cleanedImageUrl: string | null = null;

  if (raw.images && Array.isArray(raw.images) && raw.images.length > 0) {
    // Find main image or first valid
    const mainImg = raw.images.find((img) => img.is_main_image) || raw.images[0];
    if (mainImg) {
      if (isValidHttpUrl(mainImg.url)) {
        imageUrl = mainImg.url;
      }
      if (isValidHttpUrl(mainImg.cleaned_url)) {
        cleanedImageUrl = mainImg.cleaned_url || null;
      }
    }
  }

  // Offers normalization
  const normalizedOffers: ProductOfferItem[] = [];
  const seenOfferUrls = new Set<string>();

  if (raw.offers && Array.isArray(raw.offers)) {
    for (const offer of raw.offers) {
      if (!offer || !offer.url || !isValidHttpUrl(offer.url)) {
        continue;
      }

      if (seenOfferUrls.has(offer.url)) {
        continue;
      }
      seenOfferUrls.add(offer.url);

      const domain = (offer.domain && typeof offer.domain === "string" ? offer.domain.trim() : "") || "Verified Retailer";

      // Price extraction: validate raw prices are finite positive numbers
      const rawPrice = offer.price?.price;
      const isValidPrice = typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 0;
      const priceMinor = isValidPrice ? Math.round(rawPrice * 100) : 0;

      const rawCompare = offer.price?.compare_at_price;
      const isValidCompare = typeof rawCompare === "number" && Number.isFinite(rawCompare) && rawCompare > 0;
      const compareAtPriceMinor = isValidCompare ? Math.round(rawCompare * 100) : null;

      // Currency extraction & validation against supported currencies (USD, EUR, GBP)
      const rawCurr = typeof offer.price?.currency === "string" ? offer.price.currency.trim().toUpperCase() : "";
      let offerCurrency: string;
      let isSupported = false;
      let monetaryStatus: "valid" | "unsupported_currency" | "missing_currency" | "invalid_price";

      if (!rawCurr) {
        // Never guess when currency is omitted by provider
        offerCurrency = "UNKNOWN";
        isSupported = false;
        monetaryStatus = "missing_currency";
      } else if (isSupportedCurrency(rawCurr)) {
        offerCurrency = rawCurr;
        isSupported = true;
        monetaryStatus = isValidPrice ? "valid" : "invalid_price";
      } else {
        // Preserve actual unsupported currency code (e.g. JPY, CAD) without casting to CurrencyCode
        offerCurrency = rawCurr;
        isSupported = false;
        monetaryStatus = "unsupported_currency";
      }

      // If price is invalid and currency was supported, mark invalid_price
      if (!isValidPrice && isSupported) {
        monetaryStatus = "invalid_price";
      }

      // Extract offer-level dimensions if present in Channel3 response
      const offerDims: Record<string, string> = {};
      const rawDims = (offer as unknown as { dimensions?: Record<string, string> }).dimensions;
      if (rawDims && typeof rawDims === "object") {
        for (const [k, v] of Object.entries(rawDims)) {
          if (typeof v === "string" && v.trim()) {
            offerDims[k] = v.trim();
          }
        }
      }

      const offerId = (offer as unknown as { id?: string }).id || `offer_${id}_${domain}_${priceMinor}`;

      normalizedOffers.push({
        id: offerId,
        domain,
        url: offer.url, // Preserves authentic Channel3 redirect and tracking parameters intact
        priceMinor,
        compareAtPriceMinor,
        currency: offerCurrency,
        isSupportedCurrency: isSupported,
        monetaryStatus,
        availability: normalizeAvailability(offer.availability),
        condition: offer.condition || null,
        verificationStatus: Object.keys(offerDims).length > 0 ? "verified" : "unverified",
        configurationAttributes: Object.keys(offerDims).length > 0 ? offerDims : undefined,
      });
    }
  }

  // Authoritative selected offer resolution:
  // Do NOT sort offers ascending by price and blindly treat the cheapest offer as the product's confirmed price.
  // Preserve stable offer order and mark initial configuration status as unverified.
  const initialOffer = normalizedOffers[0] || null;
  const initialPriceMinor = initialOffer ? initialOffer.priceMinor : null;
  const compareAtPriceMinor = initialOffer?.compareAtPriceMinor ?? null;
  const currency = initialOffer
    ? (isSupportedCurrency(initialOffer.currency) ? (initialOffer.currency as CurrencyCode) : initialOffer.currency)
    : fallbackCurrency;
  const isSupportedProductCurrency = initialOffer ? Boolean(initialOffer.isSupportedCurrency) : false;
  const monetaryStatus = initialOffer ? initialOffer.monetaryStatus : "missing_currency";
  const retailerName = initialOffer ? initialOffer.domain : (brand ? `${brand} Retailer` : "Retailer Partner");
  const retailerUrl = initialOffer ? initialOffer.url : "#";
  const overallAvailability = initialOffer ? initialOffer.availability : "unknown";

  // Extract structured specifications from canonical catalog
  const specifications: Record<string, string> = {};
  if (raw.structured_attributes && typeof raw.structured_attributes === "object") {
    for (const [key, values] of Object.entries(raw.structured_attributes)) {
      if (Array.isArray(values) && values.length > 0) {
        const formattedKey = key
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        specifications[formattedKey] = values.join(", ");
      }
    }
  }

  // Key features as source facts
  const sourceFacts: string[] = [];
  if (raw.key_features && Array.isArray(raw.key_features)) {
    for (const feat of raw.key_features) {
      if (typeof feat === "string" && feat.trim()) {
        sourceFacts.push(feat.trim());
      }
    }
  }

  // Add offer fact if available (honest labeling)
  if (initialOffer) {
    sourceFacts.unshift(`Offered by ${retailerName} (${initialOffer.availability === "in_stock" ? "In stock" : "Check availability"})`);
  }

  return {
    source: "channel3",
    sourceProductId: id,
    title,
    brand,
    description,
    imageUrl: cleanedImageUrl || imageUrl,
    cleanedImageUrl,
    selectedOffer: initialOffer,
    priceMinor: initialPriceMinor,
    compareAtPriceMinor,
    currency,
    isSupportedCurrency: isSupportedProductCurrency,
    monetaryStatus,
    retailerName,
    retailerUrl,
    availability: overallAvailability,
    configurationStatus: "unverified",
    configurationNotice: null,
    offers: normalizedOffers,
    offersCount: normalizedOffers.length,
    specifications,
    sourceFacts,
  };
}

/**
 * Normalizes an array of raw Channel3 products and discards any that are invalid.
 * Deduplicates identical products by sourceProductId while merging legitimate separate retailer offers.
 */
export function normalizeChannel3Products(
  products: Channel3Api.Product[],
  fallbackCurrency: CurrencyCode = "USD"
): NormalizedProduct[] {
  if (!Array.isArray(products)) return [];

  const productMap = new Map<string, NormalizedProduct>();

  for (const raw of products) {
    const normalized = normalizeChannel3Product(raw, fallbackCurrency);
    if (!normalized) continue;

    const key = normalized.sourceProductId || normalized.title;
    const existing = productMap.get(key);
    if (!existing) {
      productMap.set(key, normalized);
    } else {
      // Merge unique retailer offers into the existing canonical product entry
      const existingOfferUrls = new Set((existing.offers || []).map((o) => o.url));
      const mergedOffers: ProductOfferItem[] = [...(existing.offers || [])];

      for (const off of normalized.offers || []) {
        if (!existingOfferUrls.has(off.url)) {
          existingOfferUrls.add(off.url);
          mergedOffers.push(off);
        }
      }

      existing.offers = mergedOffers;
      existing.offersCount = mergedOffers.length;
    }
  }

  return Array.from(productMap.values());
}
