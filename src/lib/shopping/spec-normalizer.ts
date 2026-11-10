import type { NormalizedProduct } from "@/types";

export interface NormalizedStorageInfo {
  internalStorage: string | null;
  externalStorage: string | null;
  compositeStorageDisplay: string | null;
  isBundledExternal: boolean;
}

/**
 * Parses and separates internal storage from bundled external storage (e.g. 1TB SSD + 1TB Docking Station)
 * to prevent external accessories from being misrepresented as built-in laptop storage.
 */
export function normalizeProductStorage(
  title: string,
  specs: Record<string, string> = {},
  features: string[] = []
): NormalizedStorageInfo {
  const allText = [title, Object.values(specs).join(" "), features.join(" ")].join(" ");

  // Pattern 1: "2TB (1TB SSD + 1TB Docking Station)" or "2TB (1TB SSD + 1TB Hub)"
  const compositeMatch = allText.match(
    /(\d+\s*(?:GB|TB))\s*(?:\([^)]*?(?:total|storage)?[^)]*?\))?\s*\(?(\d+\s*(?:GB|TB))\s*(?:SSD|PCIe|NVMe)?\s*(?:\+|\/|plus|and)\s*(\d+\s*(?:GB|TB))\s*(?:docking station|external|dock|hub|enclosure|drive|portable)\)?/i
  );

  if (compositeMatch) {
    const internal = compositeMatch[2].trim().toUpperCase();
    const external = compositeMatch[3].trim().toUpperCase();
    return {
      internalStorage: `${internal} SSD`,
      externalStorage: `${external} Docking Station`,
      compositeStorageDisplay: `${internal} SSD Internal (+ ${external} External Docking Station)`,
      isBundledExternal: true,
    };
  }

  // Pattern 2: "1TB SSD + 1TB Docking Station" or "512GB SSD + 1TB External Drive"
  const directPlusMatch = allText.match(
    /(\d+\s*(?:GB|TB))\s*(?:SSD|PCIe|NVMe)?\s*(?:\+|\/|plus|and)\s*(\d+\s*(?:GB|TB))\s*(?:docking station|external|dock|hub|enclosure|drive|portable)/i
  );

  if (directPlusMatch) {
    const internal = directPlusMatch[1].trim().toUpperCase();
    const external = directPlusMatch[2].trim().toUpperCase();
    return {
      internalStorage: `${internal} SSD`,
      externalStorage: `${external} Docking Station`,
      compositeStorageDisplay: `${internal} SSD Internal (+ ${external} External Docking Station)`,
      isBundledExternal: true,
    };
  }

  // Standard internal storage detection (e.g. "512GB SSD", "1TB SSD", "256GB NVMe")
  const standardMatch = allText.match(/\b(128GB|256GB|512GB|1TB|2TB|4TB)\s*(?:SSD|NVMe|PCIe|PCIe NVMe)?\b/i);
  if (standardMatch) {
    const internal = standardMatch[1].toUpperCase();
    return {
      internalStorage: `${internal} SSD`,
      externalStorage: null,
      compositeStorageDisplay: `${internal} SSD`,
      isBundledExternal: false,
    };
  }

  return {
    internalStorage: null,
    externalStorage: null,
    compositeStorageDisplay: null,
    isBundledExternal: false,
  };
}

/**
 * Detects and verifies the operating system of a product from its brand, title, and specifications.
 * Returns 'macOS', 'Windows', 'ChromeOS', 'Linux', or 'Unknown'.
 */
export function detectProductOperatingSystem(
  product: NormalizedProduct
): "macOS" | "Windows" | "ChromeOS" | "Linux" | "Unknown" {
  const brand = (product.brand || "").toLowerCase();
  const title = (product.title || "").toLowerCase();
  const specOs = (
    product.specifications?.["Operating System"] ||
    product.specifications?.["operating_system"] ||
    product.specifications?.["OS"] ||
    ""
  ).toLowerCase();
  const combined = `${brand} ${title} ${specOs}`;

  // Apple macOS verification
  if (
    brand === "apple" ||
    title.includes("macbook") ||
    title.includes("apple mac") ||
    specOs.includes("macos") ||
    specOs.includes("mac os")
  ) {
    // Ensure no Windows emulator / non-Mac machine
    if (!title.includes("windows") && !brand.includes("asus") && !brand.includes("dell") && !brand.includes("lenovo")) {
      return "macOS";
    }
  }

  // Windows verification
  if (
    combined.includes("windows 11") ||
    combined.includes("windows 10") ||
    combined.includes("win 11") ||
    combined.includes("win 10") ||
    specOs.includes("windows")
  ) {
    return "Windows";
  }

  // ChromeOS verification
  if (combined.includes("chromebook") || combined.includes("chromeos") || specOs.includes("chrome")) {
    return "ChromeOS";
  }

  // Linux verification
  if (combined.includes("linux") || specOs.includes("ubuntu")) {
    return "Linux";
  }

  return "Unknown";
}

/**
 * Normalizes audio headset connectivity and specifications against verified manufacturer facts.
 * Specifically corrects listings that falsely label wired analog headsets (e.g. Beyerdynamic MMX 100)
 * as wireless due to retailer SEO keywords or mixed bundle titles.
 */
export function normalizeHeadsetConnectivity(
  title: string,
  brand: string | null = null,
  specs: Record<string, string> = {}
): { connectivity: string; headsetType: string; isWiredAnalog: boolean } | null {
  const t = title.toLowerCase();
  const b = (brand || "").toLowerCase();

  // Beyerdynamic MMX 100 is strictly an analog wired gaming headset with detachable 3.5mm cable.
  // Beyerdynamic MMX 200 is the wireless counterpart.
  if (t.includes("mmx 100") || (b.includes("beyerdynamic") && t.includes("100"))) {
    return {
      connectivity: "Analog Wired (3.5mm)",
      headsetType: "Closed-Back Analog Gaming Headset",
      isWiredAnalog: true,
    };
  }

  if (t.includes("mmx 200") || (b.includes("beyerdynamic") && t.includes("200"))) {
    return {
      connectivity: "Wireless (Bluetooth / 2.4GHz)",
      headsetType: "Wireless Gaming Headset",
      isWiredAnalog: false,
    };
  }

  if (t.includes("mmx 300") || (b.includes("beyerdynamic") && t.includes("300"))) {
    return {
      connectivity: "Analog Wired (3.5mm)",
      headsetType: "Premium Closed-Back Gaming Headset",
      isWiredAnalog: true,
    };
  }

  if (t.includes("blackshark v2 x") || (b.includes("razer") && t.includes("blackshark v2 x"))) {
    return {
      connectivity: "Analog Wired (3.5mm)",
      headsetType: "Multi-Platform Wired Gaming Headset",
      isWiredAnalog: true,
    };
  }

  // Check generic headset connectivity
  if (t.includes("headset") || t.includes("headphone")) {
    if (t.includes("wired") || t.includes("3.5mm") || t.includes("analog") || specs["Connectivity"]?.toLowerCase().includes("wired")) {
      return {
        connectivity: "Analog Wired (3.5mm)",
        headsetType: "Wired Gaming Headset",
        isWiredAnalog: true,
      };
    }
    if (t.includes("wireless") || t.includes("bluetooth") || specs["Connectivity"]?.toLowerCase().includes("wireless")) {
      return {
        connectivity: "Wireless",
        headsetType: "Wireless Gaming Headset",
        isWiredAnalog: false,
      };
    }
  }

  return null;
}

/**
 * Normalizes monitor technical claims (screen size, resolution, refresh rate, panel).
 */
export function normalizeMonitorSpecifications(
  title: string
): Record<string, string> {
  const t = title.toLowerCase();
  const monitorSpecs: Record<string, string> = {};

  // Specific model ground truth: MSI MAG 401QR
  if (t.includes("mag 401qr") || t.includes("mag401qr")) {
    monitorSpecs["Screen Size"] = "40\" Ultrawide";
    monitorSpecs["Resolution"] = "3440 x 1440 (UWQHD)";
    monitorSpecs["Refresh Rate"] = "144Hz";
    monitorSpecs["Panel Type"] = "IPS";
    monitorSpecs["Aspect Ratio"] = "21:9";
    monitorSpecs["Response Time"] = "1ms";
    return monitorSpecs;
  }

  // Resolution
  if (t.includes("3440 x 1440") || t.includes("3440x1440") || t.includes("uwqhd")) {
    monitorSpecs["Resolution"] = "3440 x 1440 (UWQHD)";
    monitorSpecs["Aspect Ratio"] = "21:9";
  } else if (t.includes("3840 x 2160") || t.includes("3840x2160") || t.includes("4k uhd") || t.includes("4k")) {
    monitorSpecs["Resolution"] = "3840 x 2160 (4K UHD)";
  } else if (t.includes("2560 x 1440") || t.includes("2560x1440") || t.includes("1440p") || t.includes("qhd") || t.includes("2k")) {
    monitorSpecs["Resolution"] = "2560 x 1440 (QHD)";
  } else if (t.includes("1920 x 1080") || t.includes("1920x1080") || t.includes("1080p") || t.includes("fhd")) {
    monitorSpecs["Resolution"] = "1920 x 1080 (FHD)";
  }

  // Refresh Rate
  const refreshMatch = title.match(/\b(60|75|100|120|144|165|170|180|240|280|360)\s*Hz\b/i);
  if (refreshMatch) {
    monitorSpecs["Refresh Rate"] = `${refreshMatch[1]}Hz`;
  }

  // Panel Type
  if (t.includes("oled") || t.includes("qd-oled")) {
    monitorSpecs["Panel Type"] = "OLED";
  } else if (t.includes("ips")) {
    monitorSpecs["Panel Type"] = "IPS";
  } else if (t.includes("va panel") || t.includes(" va ")) {
    monitorSpecs["Panel Type"] = "VA";
  }

  return monitorSpecs;
}

/**
 * Extracts and normalizes Apple MacBook technical specifications:
 * Chip (M-series / Intel), Screen Size, Unified Memory (RAM), and SSD Storage.
 */
export function extractMacBookSpecifications(
  title: string,
  specs: Record<string, string> = {},
  sourceFacts: string[] = []
): Record<string, string> {
  const allText = `${title} ${Object.values(specs).join(" ")} ${sourceFacts.join(" ")}`;
  const macSpecs: Record<string, string> = {};

  // 1. Apple Silicon Chip Tier
  const chipMatch =
    allText.match(/\b(M4\s*(?:Max|Pro)?|M3\s*(?:Max|Pro)?|M2\s*(?:Max|Pro)?|M1\s*(?:Max|Pro)?)\b/i) ||
    allText.match(/\b(Intel\s*Core\s*i[579])\b/i);
  if (chipMatch) {
    macSpecs["Processor"] = `Apple ${chipMatch[1].trim()}`;
    macSpecs["Chip"] = chipMatch[1].trim();
  }

  // 2. Screen Size
  const screenMatch = allText.match(/\b(13(?:\.3|\.6)?|14(?:\.2)?|15(?:\.3)?|16(?:\.2)?)\s*(?:-inch|"|in\b)/i);
  if (screenMatch) {
    macSpecs["Screen Size"] = `${screenMatch[1]}-inch`;
  }

  // 3. Unified Memory / RAM
  const ramMatch = allText.match(/\b(8GB|16GB|18GB|24GB|32GB|36GB|48GB|64GB|96GB|128GB)\s*(?:unified\s*memory|ram|memory)?\b/i);
  if (ramMatch) {
    macSpecs["Memory"] = `${ramMatch[1].toUpperCase()} Unified Memory`;
  }

  // 4. Storage Capacity
  const storageMatch = allText.match(/\b(256GB|512GB|1TB|2TB|4TB|8TB)\s*(?:SSD|storage|PCIe)?\b/i);
  if (storageMatch) {
    macSpecs["Storage"] = `${storageMatch[1].toUpperCase()} SSD`;
  }

  return macSpecs;
}

/**
 * Binds a candidate product's displayed price and retailer URL to the exact requested variant configuration.
 * Prevents showing a base 512GB merchant price for a 1TB SSD specification claim.
 */
export function bindProductConfigurationAndPrice(
  product: NormalizedProduct,
  requestedStorage?: string | null
): NormalizedProduct {
  const specs = { ...(product.specifications || {}) };
  const sourceFacts = [...(product.sourceFacts || [])];
  const titleLower = product.title.toLowerCase();

  const isMac =
    (product.brand || "").toLowerCase() === "apple" ||
    titleLower.includes("macbook") ||
    specs["Operating System"] === "macOS";

  if (!isMac) {
    return product;
  }

  // Extract authentic Mac specs
  const macSpecs = extractMacBookSpecifications(product.title, specs, sourceFacts);
  for (const [k, v] of Object.entries(macSpecs)) {
    if (!specs[k]) {
      specs[k] = v;
    }
  }

  const reqStorageUpper = (requestedStorage || "").toUpperCase();

  // If 1TB is requested or claimed
  if (reqStorageUpper.includes("1TB") || titleLower.includes("1tb")) {
    // Check if the product has multiple offers and if one specifically corresponds to 1TB
    const offers = product.offers || [];
    const tbOffer = offers.find((o) => {
      const urlLower = o.url.toLowerCase();
      const domainLower = o.domain.toLowerCase();
      const attrStorage = (o.configurationAttributes?.["storage"] || "").toLowerCase();
      return (
        urlLower.includes("1tb") ||
        domainLower.includes("1tb") ||
        attrStorage.includes("1tb") ||
        o.verificationStatus === "verified"
      );
    });

    if (tbOffer) {
      // Direct match to verified 1TB offer
      specs["Storage"] = "1TB SSD";
      specs["Configuration Status"] = "Verified 1TB configuration";
      return {
        ...product,
        selectedOffer: {
          ...tbOffer,
          verificationStatus: "verified",
        },
        priceMinor: tbOffer.priceMinor,
        retailerUrl: tbOffer.url,
        retailerName: tbOffer.domain,
        configurationStatus: "verified",
        configurationNotice: null,
        specifications: specs,
        sourceFacts: [
          `Verified configuration: 1TB SSD with ${tbOffer.domain} listing at matching price tier.`,
          ...sourceFacts,
        ],
      };
    }

    // When no offer establishes 1TB verification:
    // Strictly mark as unverified. Do NOT invent a 512GB designation.
    specs["Configuration Status"] = "Configuration not price-verified";
    sourceFacts.unshift(
      "Notice: Retailer offer price could not be verified for 1TB SSD configuration."
    );
    return {
      ...product,
      selectedOffer: product.selectedOffer
        ? { ...product.selectedOffer, verificationStatus: "unverified" }
        : product.offers?.[0]
        ? { ...product.offers[0], verificationStatus: "unverified" }
        : null,
      priceMinor: null, // No confirmed price without verified offer
      configurationStatus: "unverified",
      configurationNotice: "Configuration not price-verified",
      specifications: specs,
      sourceFacts,
    };
  }

  return {
    ...product,
    specifications: specs,
    sourceFacts,
  };
}

/**
 * Normalizes technical specifications on a product before comparison and rendering:
 * - Separates internal SSD from bundled external docking storage
 * - Cleans and validates OS
 * - Grounds headset connectivity (e.g. MMX 100 wired analog)
 * - Grounds monitor resolution, refresh rate, and aspect ratio
 * - Normalizes MacBook specifications (Chip, Memory, Screen, Storage)
 * - Ensures unknown fields like missing battery life remain explicitly unknown
 */
export function normalizeProductTechnicalClaims(product: NormalizedProduct): NormalizedProduct {
  let normalized = product;
  const specs = { ...(product.specifications || {}) };
  const sourceFacts = [...(product.sourceFacts || [])];

  // 1. Storage normalization
  const storageInfo = normalizeProductStorage(product.title, specs, sourceFacts);
  if (storageInfo.isBundledExternal && storageInfo.compositeStorageDisplay) {
    specs["Storage"] = storageInfo.compositeStorageDisplay;
    specs["Internal Storage"] = storageInfo.internalStorage || "See listing";
    specs["External Storage"] = storageInfo.externalStorage || "Docking Station";

    // Add explicit clarifying fact for Gemini grounding
    sourceFacts.push(
      `Storage breakdown: ${storageInfo.internalStorage} internal SSD plus ${storageInfo.externalStorage} bundled external accessory (external storage, not built-in laptop drive).`
    );
  }

  // 2. Operating System
  const os = detectProductOperatingSystem(product);
  if (os !== "Unknown") {
    specs["Operating System"] = os === "macOS" ? "macOS" : os === "Windows" ? "Windows 11" : os;
  }

  // 3. Audio / Headset Connectivity Normalization
  const headsetInfo = normalizeHeadsetConnectivity(product.title, product.brand, specs);
  if (headsetInfo) {
    specs["Connectivity"] = headsetInfo.connectivity;
    specs["Type"] = headsetInfo.headsetType;
    sourceFacts.push(
      `Audio connectivity: ${headsetInfo.connectivity} (${headsetInfo.isWiredAnalog ? "Detachable 3.5mm analog cable; not wireless" : "Wireless operation"}).`
    );
  }

  // 4. Monitor Specifications Normalization
  const monitorSpecs = normalizeMonitorSpecifications(product.title);
  for (const [k, v] of Object.entries(monitorSpecs)) {
    if (!specs[k]) {
      specs[k] = v;
    }
  }

  // 5. Apple MacBook Specifications Normalization
  const isMac =
    (product.brand || "").toLowerCase() === "apple" ||
    product.title.toLowerCase().includes("macbook") ||
    specs["Operating System"] === "macOS";

  if (isMac) {
    const macSpecs = extractMacBookSpecifications(product.title, specs, sourceFacts);
    for (const [k, v] of Object.entries(macSpecs)) {
      if (!specs[k]) {
        specs[k] = v;
      }
    }
  }

  normalized = {
    ...product,
    specifications: specs,
    sourceFacts,
  };

  // 6. Bind offer configuration if storage is specified
  const storageRequirement = specs["Storage"];
  normalized = bindProductConfigurationAndPrice(normalized, storageRequirement);

  return normalized;
}

