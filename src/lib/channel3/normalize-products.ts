import type { Channel3Api } from "@channel3/sdk";
import type { NormalizedProduct, ProductOfferItem, CurrencyCode } from "@/types";

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
 * Normalizes a raw Channel3 API Product into the application-owned NormalizedProduct type.
 * Never throws — gracefully degrades if fields are missing or malformed.
 */
export function normalizeChannel3Product(
  raw: Channel3Api.Product,
  fallbackCurrency: CurrencyCode = "USD"
): NormalizedProduct | null {
  if (!raw || typeof raw !== "object") return null;

  const id = raw.id || `unknown-${Math.random().toString(36).substring(2, 9)}`;
  const title = (raw.title && typeof raw.title === "string" ? raw.title.trim() : "") || "Untitled Product";

  // Brand resolution
  let brand: string | null = null;
  if (raw.brands && Array.isArray(raw.brands) && raw.brands.length > 0) {
    brand = raw.brands[0]?.name || null;
  }

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

  if (raw.offers && Array.isArray(raw.offers)) {
    for (const offer of raw.offers) {
      if (!offer || !offer.url || !isValidHttpUrl(offer.url)) {
        continue;
      }

      const domain = (offer.domain && typeof offer.domain === "string" ? offer.domain.trim() : "") || "Verified Retailer";

      // Price extraction
      const rawPrice = offer.price?.price;
      const priceVal = typeof rawPrice === "number" && !isNaN(rawPrice) && rawPrice > 0 ? rawPrice : null;

      if (priceVal === null) {
        continue;
      }

      const priceMinor = Math.round(priceVal * 100);

      const rawCompare = offer.price?.compare_at_price;
      const compareVal = typeof rawCompare === "number" && !isNaN(rawCompare) && rawCompare > 0 ? rawCompare : null;
      const compareAtPriceMinor = compareVal ? Math.round(compareVal * 100) : null;

      const curr = (offer.price?.currency?.toUpperCase() as CurrencyCode) || fallbackCurrency;

      normalizedOffers.push({
        domain,
        url: offer.url, // Preserves authentic Channel3 redirect and tracking parameters intact
        priceMinor,
        compareAtPriceMinor,
        currency: curr,
        availability: normalizeAvailability(offer.availability),
        condition: offer.condition || null,
      });
    }
  }

  // Sort offers by price ascending (cheapest offer first)
  normalizedOffers.sort((a, b) => a.priceMinor - b.priceMinor);

  // Compute starting price and primary offer
  const primaryOffer = normalizedOffers[0] || null;
  const startingPriceMinor = primaryOffer ? primaryOffer.priceMinor : null;
  const compareAtPriceMinor = primaryOffer?.compareAtPriceMinor ?? null;
  const currency = primaryOffer ? primaryOffer.currency : fallbackCurrency;
  const retailerName = primaryOffer ? primaryOffer.domain : (brand ? `${brand} Retailer` : "Retailer Partner");
  const retailerUrl = primaryOffer ? primaryOffer.url : "#";
  const overallAvailability = primaryOffer ? primaryOffer.availability : "unknown";

  // Extract structured specifications
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

  // Add offer fact if available
  if (primaryOffer) {
    sourceFacts.unshift(`Offered by ${retailerName} (${primaryOffer.availability === "in_stock" ? "In stock" : "Check availability"})`);
  }

  return {
    source: "channel3",
    sourceProductId: id,
    title,
    brand,
    description,
    imageUrl: cleanedImageUrl || imageUrl,
    cleanedImageUrl,
    priceMinor: startingPriceMinor,
    compareAtPriceMinor,
    currency,
    retailerName,
    retailerUrl,
    availability: overallAvailability,
    offers: normalizedOffers,
    offersCount: normalizedOffers.length,
    specifications,
    sourceFacts,
  };
}

/**
 * Normalizes an array of raw Channel3 products and discards any that are invalid.
 */
export function normalizeChannel3Products(
  products: Channel3Api.Product[],
  fallbackCurrency: CurrencyCode = "USD"
): NormalizedProduct[] {
  if (!Array.isArray(products)) return [];

  const results: NormalizedProduct[] = [];
  for (const raw of products) {
    const normalized = normalizeChannel3Product(raw, fallbackCurrency);
    if (normalized) {
      results.push(normalized);
    }
  }

  return results;
}
