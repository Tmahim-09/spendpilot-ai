import { Channel3 } from "@channel3/sdk";
import type { Channel3Api } from "@channel3/sdk";
import * as fs from "node:fs";
import * as path from "node:path";

// Load environment variables from .env.local safely
if (process.loadEnvFile) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Ignore if file cannot be read
  }
}

function sanitizeUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "[invalid-url]";
  }
}

function sanitizeOffer(offer: NonNullable<Channel3Api.Product["offers"]>[number]) {
  return {
    domain: offer.domain || "Unknown Domain",
    price: offer.price?.price ?? null,
    compareAtPrice: offer.price?.compare_at_price ?? null,
    currency: offer.price?.currency ?? "USD",
    availability: offer.availability ?? "unknown",
    condition: offer.condition ?? null,
    sanitizedUrl: sanitizeUrl(offer.url),
    isAttributedRedirect: (offer.url || "").includes("buy.trychannel3.com"),
  };
}

function sanitizeProduct(prod: Channel3Api.Product) {
  return {
    id: prod.id,
    title: prod.title,
    brand: prod.brands?.[0]?.name || null,
    structuredAttributes: prod.structured_attributes || {},
    variants: prod.variants
      ? {
          optionsCount: prod.variants.options?.length ?? 0,
          options: (prod.variants.options || []).map((opt) => ({
            name: opt.name,
            values: (opt.values || []).map((v) => ({
              label: v.label,
              exists: v.exists,
              available: v.available,
              hasSeparateProductId: Boolean(v.product_id),
              productId: v.product_id || null,
            })),
          })),
          selected: prod.variants.selected || [],
        }
      : null,
    offersCount: prod.offers?.length ?? 0,
    offers: (prod.offers || []).map(sanitizeOffer),
  };
}

async function runAudit() {
  console.log("================================================================================");
  console.log(" SpendPilot Channel3 Forensic Audit (Stage 1 Diagnostic)");
  console.log("================================================================================\n");

  const apiKey = process.env.CHANNEL3_API_KEY?.trim();
  if (!apiKey) {
    console.error("❌ ERROR: CHANNEL3_API_KEY is not defined in environment or .env.local.");
    process.exit(1);
  }
  console.log("✔ CHANNEL3_API_KEY found in environment (length: %d chars, redacted).", apiKey.length);

  const client = new Channel3({
    apiKey,
    timeoutInSeconds: 20,
  });

  const diagnosticResults: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    sdkVersion: "4.6.0",
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Search Query: "Apple MacBook laptop 1TB SSD"
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- [Step 1] Executing Channel3 Product Search for: 'Apple MacBook laptop 1TB SSD' ---");
  let searchProducts: Channel3Api.Product[] = [];
  try {
    const page = await client.products.search({
      query: "Apple MacBook laptop 1TB SSD",
      limit: 5,
    });
    searchProducts =
      (page as unknown as { response?: { products?: Channel3Api.Product[] } }).response?.products ??
      page.data ??
      [];
    console.log("✔ Search completed. Products returned: %d", searchProducts.length);
  } catch (err: unknown) {
    console.error("❌ Search failed:", err instanceof Error ? err.message : String(err));
  }

  const sanitizedSearchResults = searchProducts.map(sanitizeProduct);
  diagnosticResults["searchQuery"] = "Apple MacBook laptop 1TB SSD";
  diagnosticResults["searchResults"] = sanitizedSearchResults;

  searchProducts.forEach((p, idx) => {
    console.log(`\nCandidate #${idx + 1}:`);
    console.log(`  ID: ${p.id}`);
    console.log(`  Title: ${p.title}`);
    console.log(`  Brand: ${p.brands?.[0]?.name || "N/A"}`);
    console.log(`  Structured Attrs: ${JSON.stringify(p.structured_attributes || {})}`);
    console.log(`  Variants exposed in search: ${p.variants ? `${p.variants.options?.length || 0} options` : "null"}`);
    console.log(`  Offers count: ${p.offers?.length ?? 0}`);
    if (p.offers && p.offers.length > 0) {
      p.offers.forEach((o, oIdx) => {
        console.log(`    Offer [${oIdx + 1}]: domain=${o.domain}, price=${o.price?.currency} ${o.price?.price}, avail=${o.availability}, url=${sanitizeUrl(o.url)}`);
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Product Detail Retrieval on Best Candidate
  // ─────────────────────────────────────────────────────────────────────────────
  const topCandidate = searchProducts[0];
  if (topCandidate && topCandidate.id) {
    console.log(`\n--- [Step 2] Executing Product Detail Retrieval for ID: ${topCandidate.id} ---`);
    try {
      const retrieveRes = await client.products.retrieve({
        product_id: topCandidate.id,
      });
      const detailProduct = (retrieveRes as unknown as { response?: Channel3Api.Product }).response ?? retrieveRes;
      console.log("✔ Product detail retrieved successfully.");
      console.log(`  ID: ${detailProduct.id}`);
      console.log(`  Title: ${detailProduct.title}`);
      console.log(`  Variants in detail: ${detailProduct.variants ? JSON.stringify(detailProduct.variants) : "null"}`);
      console.log(`  Offers in detail: ${detailProduct.offers?.length ?? 0}`);
      if (detailProduct.offers && detailProduct.offers.length > 0) {
        detailProduct.offers.forEach((o, oIdx) => {
          console.log(`    Offer [${oIdx + 1}]: domain=${o.domain}, price=${o.price?.currency} ${o.price?.price}, avail=${o.availability}`);
        });
      }

      diagnosticResults["topCandidateDetail"] = sanitizeProduct(detailProduct);

      // ─────────────────────────────────────────────────────────────────────────
      // 3. Variant Resolution Attempt on MacBook
      // ─────────────────────────────────────────────────────────────────────────
      console.log("\n--- [Step 3] Testing Variant Selection on MacBook Candidate ---");
      if (detailProduct.variants?.options && detailProduct.variants.options.length > 0) {
        console.log("MacBook exposes variant options:");
        detailProduct.variants.options.forEach((opt) => {
          console.log(`  Option: "${opt.name}", values: ${opt.values?.map((v) => v.label).join(", ")}`);
        });

        // Test passing option
        const firstOpt = detailProduct.variants.options[0];
        const firstVal = firstOpt.values?.[0]?.label;
        if (firstOpt.name && firstVal) {
          console.log(`Attempting retrieve with selected_options: { "${firstOpt.name}": "${firstVal}" }`);
          const optRes = await client.products.retrieve({
            product_id: detailProduct.id,
            selected_options: { [firstOpt.name]: firstVal },
          });
          const optProd = (optRes as unknown as { response?: Channel3Api.Product }).response ?? optRes;
          console.log("Resulting variants.selected:", JSON.stringify(optProd.variants?.selected));
        }
      } else {
        console.log("ℹ Note: Channel3 did NOT expose variant metadata (variants: null) for this MacBook product.");
        console.log("Testing whether passing selected_options: { 'Storage': '1TB' } on a product without variants does anything:");
        try {
          const blindOptRes = await client.products.retrieve({
            product_id: detailProduct.id,
            selected_options: { Storage: "1TB" },
          });
          const blindProd = (blindOptRes as unknown as { response?: Channel3Api.Product }).response ?? blindOptRes;
          console.log("Response with selected_options on un-varianted product:");
          console.log("  variants:", JSON.stringify(blindProd.variants));
          console.log("  primary offer price:", blindProd.offers?.[0]?.price?.price);
        } catch (err: unknown) {
          console.log("  Call with arbitrary option failed:", err instanceof Error ? err.message : String(err));
        }
      }
    } catch (err: unknown) {
      console.error("❌ Product detail retrieval failed:", err instanceof Error ? err.message : String(err));
      diagnosticResults["topCandidateDetailError"] = err instanceof Error ? err.message : String(err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Variant Investigation on a Known Multi-Variant Product (e.g., Sneakers)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- [Step 4] Searching for a Known Variant-Enabled Category (Sneakers) to Test Channel3 Variant Mechanics ---");
  try {
    const sneakerPage = await client.products.search({
      query: "Nike Air Max running shoes",
      limit: 3,
    });
    const sneakerProds: Channel3Api.Product[] =
      (sneakerPage as unknown as { response?: { products?: Channel3Api.Product[] } }).response?.products ??
      sneakerPage.data ??
      [];
    console.log("Found %d sneaker products. Checking for variant metadata...", sneakerProds.length);

    let variantEnabledProduct: Channel3Api.Product | null = null;
    for (const p of sneakerProds) {
      if (p.id) {
        const detailRes = await client.products.retrieve({ product_id: p.id });
        const detail = (detailRes as unknown as { response?: Channel3Api.Product }).response ?? detailRes;
        if (detail.variants?.options && detail.variants.options.length > 0) {
          variantEnabledProduct = detail;
          break;
        }
      }
    }

    if (variantEnabledProduct) {
      console.log("✔ Found variant-enabled product: ID=%s, Title='%s'", variantEnabledProduct.id, variantEnabledProduct.title);
      console.log("Options count: %d", variantEnabledProduct.variants?.options?.length ?? 0);
      variantEnabledProduct.variants?.options?.forEach((opt) => {
        console.log(`  Dimension: "${opt.name}" (total values: ${opt.values?.length})`);
        console.log(`    Sample values: ${opt.values?.slice(0, 5).map((v) => `${v.label} (avail: ${v.available}, pid: ${v.product_id || "none"})`).join(", ")}`);
      });
      console.log("Active variants.selected:", JSON.stringify(variantEnabledProduct.variants?.selected));

      // Test selection of a valid option
      const firstDim = variantEnabledProduct.variants!.options![0];
      const testVal = firstDim.values?.[0]?.label;
      if (firstDim.name && testVal) {
        console.log(`\nTesting API variant selection: { "${firstDim.name}": "${testVal}" }`);
        const selRes = await client.products.retrieve({
          product_id: variantEnabledProduct.id,
          selected_options: { [firstDim.name]: testVal },
        });
        const selProduct = (selRes as unknown as { response?: Channel3Api.Product }).response ?? selRes;
        console.log("Resolved variants.selected:", JSON.stringify(selProduct.variants?.selected));
        console.log("Resolved primary offer price:", selProduct.offers?.[0]?.price?.currency, selProduct.offers?.[0]?.price?.price);
      }

      diagnosticResults["variantProductSample"] = sanitizeProduct(variantEnabledProduct);
    } else {
      console.log("ℹ Neither of the sample products returned variants.options.");
    }
  } catch (err: unknown) {
    console.log("Sneaker variant test error:", err instanceof Error ? err.message : String(err));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. URL Lookup Test: buy.trychannel3.com vs Real Retailer URL
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- [Step 5] Testing Channel3 URL Lookup API with Attributed Redirect vs Merchant URL ---");
  const sampleOfferUrl = topCandidate?.offers?.[0]?.url;
  if (sampleOfferUrl) {
    console.log("Sample offer URL from Channel3:", sanitizeUrl(sampleOfferUrl));
    console.log("Testing client.products.lookup({ url: sampleOfferUrl }) [attributed redirect]:");
    try {
      const lookupAttributed = await client.products.lookup({ url: sampleOfferUrl });
      console.log("✔ Attributed lookup succeeded! Product ID:", (lookupAttributed as unknown as { product?: { id: string } }).product?.id);
      diagnosticResults["lookupAttributedResult"] = "success";
    } catch (err: unknown) {
      console.log("❌ Attributed lookup failed as expected:", err instanceof Error ? err.message : String(err));
      diagnosticResults["lookupAttributedError"] = err instanceof Error ? err.message : String(err);
    }
  }

  // Write sanitized results to docs/diagnostics/sanitized-channel3-sample.json
  const outPath = path.join(process.cwd(), "docs/diagnostics/sanitized-channel3-sample.json");
  fs.writeFileSync(outPath, JSON.stringify(diagnosticResults, null, 2), "utf-8");
  console.log("\n✔ Diagnostic data written to %s", outPath);
  console.log("================================================================================");
}

runAudit().catch((err) => {
  console.error("Fatal audit script error:", err);
  process.exit(1);
});

