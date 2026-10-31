import { getChannel3Client } from "./client.ts";
import type { Channel3Api } from "@channel3/sdk";
import type {
  ProductVariantState,
  ProductVariantDimension,
  ProductVariantOptionValue,
  CurrencyCode,
} from "@/types";

/**
 * Normalizes an raw availability status into our standard verified domain status.
 * Search results return `null` for option availability, which is strictly treated as "Unknown"
 * until hydrated by product detail retrieval.
 */
export function normalizeVariantAvailability(
  rawStatus?: string | null
): ProductVariantOptionValue["available"] {
  if (!rawStatus) return "Unknown";

  const upper = String(rawStatus).toUpperCase();
  if (upper === "INSTOCK" || upper === "IN_STOCK") return "InStock";
  if (upper === "LIMITEDAVAILABILITY" || upper === "LIMITED_AVAILABILITY" || upper === "LOW_STOCK")
    return "LimitedAvailability";
  if (upper === "PREORDER" || upper === "PRE_ORDER") return "PreOrder";
  if (upper === "BACKORDER" || upper === "BACK_ORDER") return "BackOrder";
  if (upper === "SOLDOUT" || upper === "SOLD_OUT") return "SoldOut";
  if (upper === "OUTOFSTOCK" || upper === "OUT_OF_STOCK") return "OutOfStock";
  if (upper === "DISCONTINUED") return "Discontinued";

  return "Unknown";
}

/**
 * Retrieves full Channel3 product detail with variant options and active selections.
 * Detects server relaxation by comparing requested selectedOptions against variants.selected.
 */
export async function retrieveProductVariants(
  productId: string,
  selectedOptions?: Record<string, string>,
  currency: CurrencyCode = "USD"
): Promise<ProductVariantState> {
  const client = getChannel3Client();

  try {
    const rawResponse = await client.products.retrieve({
      product_id: productId,
      selected_options: selectedOptions && Object.keys(selectedOptions).length > 0 ? selectedOptions : undefined,
      currency: currency as Channel3Api.CurrencyCode,
    });

    const product: Channel3Api.Product =
      (rawResponse as unknown as { response?: Channel3Api.Product }).response ?? rawResponse;

    const variantsData = product.variants;
    const rawOptions = variantsData?.options || [];
    const rawSelected = variantsData?.selected || [];

    // Map effective selected options returned by Channel3
    const effectiveSelected: Record<string, string> = {};
    for (const sel of rawSelected) {
      if (sel.name && sel.label) {
        effectiveSelected[sel.name] = sel.label;
      }
    }

    // Detect server relaxation: Did the server return different option values than what was requested?
    let isRelaxed = false;
    let relaxationMessage: string | null = null;

    if (selectedOptions && Object.keys(selectedOptions).length > 0) {
      const relaxedFields: string[] = [];
      for (const [reqKey, reqVal] of Object.entries(selectedOptions)) {
        // Case-insensitive match on option dimension names
        const matchingEffectiveKey = Object.keys(effectiveSelected).find(
          (k) => k.toLowerCase() === reqKey.toLowerCase()
        );
        const effectiveVal = matchingEffectiveKey ? effectiveSelected[matchingEffectiveKey] : null;

        if (effectiveVal && effectiveVal.toLowerCase() !== reqVal.toLowerCase()) {
          relaxedFields.push(`requested ${reqKey}: "${reqVal}", but merchant substituted "${effectiveVal}"`);
        }
      }

      if (relaxedFields.length > 0) {
        isRelaxed = true;
        relaxationMessage = `Selection was modified by retailer: ${relaxedFields.join("; ")}. Please choose from available stock below.`;
      }
    }

    // Transform options into structured dimensions
    const dimensions: ProductVariantDimension[] = rawOptions.map((opt) => {
      const optName = opt.name || "Option";
      const matchingSelected = Object.entries(effectiveSelected).find(
        ([k]) => k.toLowerCase() === optName.toLowerCase()
      );
      const currentSelectedVal = matchingSelected ? matchingSelected[1] : null;

      const values: ProductVariantOptionValue[] = (opt.values || []).map((val) => ({
        label: val.label,
        exists: typeof val.exists === "boolean" ? val.exists : true,
        available: normalizeVariantAvailability(val.available),
        thumbnailUrl: val.thumbnail_url || null,
        productId: val.product_id || null,
      }));

      return {
        name: optName,
        values,
        selectedValue: currentSelectedVal,
      };
    });

    // Check overall availability
    const primaryOffer = product.offers?.[0];
    const overallAvailability = normalizeVariantAvailability(
      (primaryOffer as unknown as { availability?: string })?.availability || "InStock"
    );

    const rawPrice = primaryOffer?.price?.price;
    const priceMinor =
      typeof rawPrice === "number" && !isNaN(rawPrice) && rawPrice > 0
        ? Math.round(rawPrice * 100)
        : null;

    // Check if fully configured (every dimension has a selected value)
    const isFullyConfigured =
      dimensions.length > 0 &&
      dimensions.every((dim) => Boolean(effectiveSelected[dim.name] || dim.selectedValue));

    const imageUrl =
      product.images?.[0]?.url ||
      product.images?.[0]?.cleaned_url ||
      (product as unknown as { image_url?: string })?.image_url ||
      null;

    const retailerUrl = primaryOffer?.url || "";
    const retailerName =
      primaryOffer?.domain ||
      product.brands?.[0]?.name ||
      "Verified Retailer";

    return {
      productId: product.id || productId,
      title: product.title || "Selected Product",
      imageUrl,
      options: dimensions,
      selected: selectedOptions || {},
      effectiveSelected,
      isRelaxed,
      relaxationMessage,
      isFullyConfigured,
      availability: overallAvailability,
      verifiedPriceMinor: priceMinor,
      retailerUrl,
      retailerName,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to retrieve product variants";
    throw new Error(errorMsg);
  }
}
