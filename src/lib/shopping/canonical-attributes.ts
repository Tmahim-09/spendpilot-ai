import type { AttributeOrigin, CanonicalShoppingAttribute } from "@/types";

/**
 * Normalizes any attribute key string (e.g. "shoe-size", "shoe_size", "Shoe Size", "form-factor")
 * into its canonical snake_case identifier.
 */
export function canonicalizeAttributeKey(key: string): string {
  const clean = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^q_/, "");
  if (clean === "shoesize" || clean === "shoe_size" || clean === "shoe_sizes") return "shoe_size";
  if (clean === "sizesystem" || clean === "size_system") return "size_system";
  if (clean === "formfactor" || clean === "form_factor") return "form_factor";
  if (clean === "noisecancellation" || clean === "noise_cancellation" || clean === "anc") return "noise_cancellation";
  if (clean === "operatingsystem" || clean === "operating_system" || clean === "os") return "operating_system";
  if (clean === "primaryuse" || clean === "primary_use" || clean === "intended_use") return "intended_use";
  if (clean === "screensize" || clean === "screen_size") return "screen_size";
  if (clean === "memoryram" || clean === "memory_ram" || clean === "ram") return "memory_ram";
  if (clean === "storagecapacity" || clean === "storage_capacity" || clean === "storage") return "storage";
  if (clean === "furnituretype" || clean === "furniture_type" || clean === "piece_type") return "furniture_type";
  return clean;
}

/**
 * Maps a canonical attribute key to its human-readable display label.
 */
export function getAttributeDisplayLabel(canonicalKey: string): string {
  const map: Record<string, string> = {
    shoe_size: "Shoe Size",
    size_system: "Sizing System",
    form_factor: "Form Factor",
    connectivity: "Connectivity",
    noise_cancellation: "Active Noise Cancellation",
    intended_use: "Intended Use",
    operating_system: "Operating System",
    screen_size: "Screen Size",
    memory_ram: "Memory (RAM)",
    storage: "Storage Capacity",
    color: "Color",
    brand: "Brand",
    gender: "Gender / Fit",
    furniture_type: "Piece Type",
    product_type: "Product Type",
  };
  return map[canonicalKey] || canonicalKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Formats an attribute's value for clean, user-friendly reading without technical jargon.
 */
export function formatAttributeDisplayValue(canonicalKey: string, value: string | string[]): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  const valStr = String(value).trim();
  const lower = valStr.toLowerCase();

  if (canonicalKey === "connectivity") {
    if (lower.includes("wireless") || lower === "wireless") return "Wireless (Bluetooth)";
    if (lower.includes("wired") || lower === "wired") return "Wired (3.5mm / USB)";
    if (lower.includes("dual") || lower.includes("both")) return "Dual-Mode (Wireless + Wired)";
  }

  if (canonicalKey === "form_factor") {
    if (lower.includes("over") || lower === "over_ear") return "Over-Ear";
    if (lower.includes("in-ear") || lower.includes("earbud") || lower === "in_ear") return "In-Ear / Earbuds";
    if (lower.includes("on-ear") || lower === "on_ear") return "On-Ear";
  }

  if (canonicalKey === "noise_cancellation") {
    if (lower.includes("yes") || lower.includes("anc") || lower.includes("active") || lower === "active_noise_cancellation") {
      return "Active Noise Cancellation (ANC)";
    }
    if (lower.includes("no") || lower.includes("standard") || lower.includes("passive")) {
      return "Standard / Passive";
    }
    if (lower.includes("no preference")) return "No preference";
  }

  if (canonicalKey === "operating_system") {
    if (lower.includes("mac") || lower.includes("apple")) return "macOS";
    if (lower.includes("win")) return "Windows 11";
    if (lower.includes("chrome")) return "ChromeOS";
    if (lower.includes("linux")) return "Linux";
  }

  return valStr;
}

/**
 * Deterministically upserts an attribute into the canonical attribute map.
 * Enforces provenance rules:
 * - `user_explicit` and `user_confirmed` cannot be overwritten by `ai_suggested`.
 * - `user_explicit` updates any previous value.
 * - Deduplicates repeated keys.
 */
export function upsertCanonicalAttribute(
  map: Record<string, CanonicalShoppingAttribute>,
  key: string,
  value: string | string[],
  source: AttributeOrigin = "user_explicit",
  status: "confirmed" | "suggested" | "skipped" = "confirmed"
): Record<string, CanonicalShoppingAttribute> {
  const canonicalKey = canonicalizeAttributeKey(key);
  if (!canonicalKey || value === undefined || value === null) {
    return map;
  }

  const valStr = Array.isArray(value) ? value.join(", ").trim() : String(value).trim();
  if (!valStr) return map;

  const existing = map[canonicalKey];

  // Prevent ai_suggested from overwriting user_explicit or user_confirmed
  if (existing && source === "ai_suggested") {
    if (existing.source === "user_explicit" || existing.source === "user_confirmed") {
      return map;
    }
  }

  const isSkipped = status === "skipped" || /\b(?:no preference|any|skip)\b/i.test(valStr);
  const displayVal = isSkipped ? "No preference" : formatAttributeDisplayValue(canonicalKey, value);

  return {
    ...map,
    [canonicalKey]: {
      key: canonicalKey,
      label: getAttributeDisplayLabel(canonicalKey),
      value,
      displayValue: displayVal,
      source,
      status: isSkipped ? "skipped" : status,
      updatedAt: Date.now(),
    },
  };
}
