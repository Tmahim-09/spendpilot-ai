import type {
  ShoppingItem,
  ShoppingGroup,
  ItemCompatibilityReport,
  CompatibilityStatus,
} from "./types.ts";

/**
 * Extracts a normalized attribute from product specifications, hard constraints, or source facts.
 */
function extractAttribute(
  item: ShoppingItem,
  keys: string[]
): string | number | boolean | undefined {
  const normKeys = keys.map((k) => k.toLowerCase().replace(/[\s\-_]/g, ""));

  // 1. Check hardConstraints
  for (const [cKey, cVal] of Object.entries(item.hardConstraints)) {
    const normCKey = cKey.toLowerCase().replace(/[\s\-_]/g, "");
    if (normKeys.some((k) => normCKey === k || normCKey.includes(k) || k.includes(normCKey))) {
      return cVal;
    }
  }

  // 2. Check selected product specifications
  if (item.selectedProduct?.specifications) {
    const specs = item.selectedProduct.specifications;
    for (const [sKey, sVal] of Object.entries(specs)) {
      const normSKey = sKey.toLowerCase().replace(/[\s\-_]/g, "");
      if (normKeys.some((k) => normSKey === k || normSKey.includes(k) || k.includes(normSKey))) {
        return sVal;
      }
    }
  }

  // 3. Check selected offer configuration attributes
  if (item.selectedOffer?.configurationAttributes) {
    const cfg = item.selectedOffer.configurationAttributes;
    for (const [cKey, cVal] of Object.entries(cfg)) {
      const normCKey = cKey.toLowerCase().replace(/[\s\-_]/g, "");
      if (normKeys.some((k) => normCKey === k || normCKey.includes(k) || k.includes(normCKey))) {
        return cVal;
      }
    }
  }

  // 4. Search in title/facts if explicit pattern matches
  const textToScan = [
    item.selectedProduct?.title || "",
    item.productRequest,
    ...(item.selectedProduct?.sourceFacts || []),
  ].join(" ").toLowerCase();

  // Socket pattern check
  if (keys.includes("socket")) {
    const amMatch = textToScan.match(/\b(am4|am5|lga1700|lga1851|lga1200|tr4|sstrx4)\b/i);
    if (amMatch && amMatch[1]) return amMatch[1].toUpperCase();
  }

  // RAM generation pattern check
  if (keys.includes("memory_type") || keys.includes("ram_type")) {
    const ramMatch = textToScan.match(/\b(ddr4|ddr5|lpddr5x|lpddr5|ddr3)\b/i);
    if (ramMatch && ramMatch[1]) return ramMatch[1].toUpperCase();
  }

  // Wattage pattern check
  if (keys.includes("wattage") || keys.includes("power")) {
    const wattMatch = textToScan.match(/\b(\d{3,4})\s*w\b/i);
    if (wattMatch && wattMatch[1]) return parseInt(wattMatch[1], 10);
  }

  return undefined;
}

/**
 * Normalizes string values for comparison (removes whitespace, dashes, lowercase).
 */
function normalizeString(val: unknown): string {
  if (typeof val !== "string" && typeof val !== "number") return "";
  return String(val).toLowerCase().replace(/[\s\-_]/g, "");
}

/**
 * Evaluates compatibility of a dependent item against its parent items in a group.
 */
export function evaluateItemCompatibility(
  item: ShoppingItem,
  group: ShoppingGroup
): ItemCompatibilityReport {
  // If item has no dependencies, compatibility checks are not applicable
  if (!item.dependencies || item.dependencies.length === 0) {
    return {
      status: "not_applicable",
      summary: "No dependencies declared for this item.",
      evaluatedAttributes: [],
    };
  }

  // If item is not yet selected, we evaluate based on requirements and available candidate specs
  const evaluatedAttributes: ItemCompatibilityReport["evaluatedAttributes"] = [];
  let hasIncompatible = false;
  let hasUnverified = false;
  let hasCompatible = false;

  for (const depId of item.dependencies) {
    const parentItem = group.items.find((i) => i.id === depId);
    if (!parentItem) {
      evaluatedAttributes.push({
        attributeKey: "dependency_existence",
        parentValue: undefined,
        itemValue: undefined,
        isMatch: null,
        reason: `Parent dependency ${depId} not found in shopping group.`,
      });
      hasUnverified = true;
      continue;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. CPU <-> Motherboard: Socket Check
    // ─────────────────────────────────────────────────────────────────────────
    const isCpuMb =
      (item.category.includes("cpu") && parentItem.category.includes("motherboard")) ||
      (item.category.includes("motherboard") && parentItem.category.includes("cpu"));

    if (isCpuMb) {
      const socketA = extractAttribute(item, ["socket", "cpu_socket"]);
      const socketB = extractAttribute(parentItem, ["socket", "cpu_socket"]);

      if (socketA && socketB) {
        const match = normalizeString(socketA) === normalizeString(socketB);
        if (match) {
          hasCompatible = true;
          evaluatedAttributes.push({
            attributeKey: "socket",
            parentValue: socketB,
            itemValue: socketA,
            isMatch: true,
            reason: `Verified socket match: ${socketA} is compatible with ${socketB}.`,
          });
        } else {
          hasIncompatible = true;
          evaluatedAttributes.push({
            attributeKey: "socket",
            parentValue: socketB,
            itemValue: socketA,
            isMatch: false,
            reason: `Verified socket mismatch: CPU socket ${socketA} does not fit Motherboard socket ${socketB}.`,
          });
        }
      } else {
        hasUnverified = true;
        evaluatedAttributes.push({
          attributeKey: "socket",
          parentValue: socketB,
          itemValue: socketA,
          isMatch: null,
          reason: `Insufficient specification data to verify socket compatibility between ${item.displayName || item.productRequest} and ${parentItem.displayName || parentItem.productRequest}.`,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. RAM <-> Motherboard: Memory Generation Check (DDR4 vs DDR5)
    // ─────────────────────────────────────────────────────────────────────────
    const isRamMb =
      (item.category.includes("ram") && parentItem.category.includes("motherboard")) ||
      (item.category.includes("motherboard") && parentItem.category.includes("ram"));

    if (isRamMb) {
      const ramTypeA = extractAttribute(item, ["memory_type", "ram_type", "generation"]);
      const ramTypeB = extractAttribute(parentItem, ["memory_type", "ram_type", "supported_memory"]);

      if (ramTypeA && ramTypeB) {
        const normA = normalizeString(ramTypeA);
        const normB = normalizeString(ramTypeB);
        const match = normB.includes(normA) || normA.includes(normB);
        if (match) {
          hasCompatible = true;
          evaluatedAttributes.push({
            attributeKey: "memory_type",
            parentValue: ramTypeB,
            itemValue: ramTypeA,
            isMatch: true,
            reason: `Verified RAM generation match: ${ramTypeA} is supported by ${ramTypeB}.`,
          });
        } else {
          hasIncompatible = true;
          evaluatedAttributes.push({
            attributeKey: "memory_type",
            parentValue: ramTypeB,
            itemValue: ramTypeA,
            isMatch: false,
            reason: `Verified memory mismatch: ${ramTypeA} cannot be installed in a ${ramTypeB} motherboard.`,
          });
        }
      } else {
        hasUnverified = true;
        evaluatedAttributes.push({
          attributeKey: "memory_type",
          parentValue: ramTypeB,
          itemValue: ramTypeA,
          isMatch: null,
          reason: `Memory generation (DDR4/DDR5) is unverified between components.`,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Motherboard <-> Case: Form Factor Check
    // ─────────────────────────────────────────────────────────────────────────
    const isMbCase =
      (item.category.includes("motherboard") && parentItem.category.includes("case")) ||
      (item.category.includes("case") && parentItem.category.includes("motherboard"));

    if (isMbCase) {
      const ffItem = extractAttribute(item, ["form_factor"]);
      const ffParent = extractAttribute(parentItem, ["form_factor", "supported_motherboards"]);

      if (ffItem && ffParent) {
        const normItem = normalizeString(ffItem);
        const normParent = normalizeString(ffParent);
        // E.g. Mini-ITX into ATX case is fine, but ATX into Mini-ITX case is incompatible
        if (normParent.includes(normItem) || normItem === normParent) {
          hasCompatible = true;
          evaluatedAttributes.push({
            attributeKey: "form_factor",
            parentValue: ffParent,
            itemValue: ffItem,
            isMatch: true,
            reason: `Form factor ${ffItem} fits within ${ffParent}.`,
          });
        } else {
          hasIncompatible = true;
          evaluatedAttributes.push({
            attributeKey: "form_factor",
            parentValue: ffParent,
            itemValue: ffItem,
            isMatch: false,
            reason: `Form factor mismatch: ${ffItem} does not fit inside ${ffParent}.`,
          });
        }
      } else {
        hasUnverified = true;
        evaluatedAttributes.push({
          attributeKey: "form_factor",
          parentValue: ffParent,
          itemValue: ffItem,
          isMatch: null,
          reason: `Form factor compatibility is unverified due to missing specifications.`,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. GPU <-> PSU: Power Supply Wattage Check
    // ─────────────────────────────────────────────────────────────────────────
    const isGpuPsu =
      (item.category.includes("gpu") && parentItem.category.includes("psu")) ||
      (item.category.includes("psu") && parentItem.category.includes("gpu"));

    if (isGpuPsu) {
      const gpuItem = item.category.includes("gpu") ? item : parentItem;
      const psuItem = item.category.includes("psu") ? item : parentItem;

      const psuWatts = extractAttribute(psuItem, ["wattage", "power"]);
      const recGpuWatts = extractAttribute(gpuItem, ["recommended_psu", "recommended_wattage", "tdp"]);

      if (typeof psuWatts === "number" && typeof recGpuWatts === "number") {
        if (psuWatts >= recGpuWatts) {
          hasCompatible = true;
          evaluatedAttributes.push({
            attributeKey: "psu_wattage",
            parentValue: `${psuWatts}W`,
            itemValue: `Requires ${recGpuWatts}W`,
            isMatch: true,
            reason: `PSU capacity (${psuWatts}W) meets or exceeds recommended GPU power (${recGpuWatts}W).`,
          });
        } else {
          hasIncompatible = true;
          evaluatedAttributes.push({
            attributeKey: "psu_wattage",
            parentValue: `${psuWatts}W`,
            itemValue: `Requires ${recGpuWatts}W`,
            isMatch: false,
            reason: `PSU wattage (${psuWatts}W) is insufficient for GPU recommendation (${recGpuWatts}W).`,
          });
        }
      } else {
        hasUnverified = true;
        evaluatedAttributes.push({
          attributeKey: "psu_wattage",
          parentValue: psuWatts,
          itemValue: recGpuWatts,
          isMatch: null,
          reason: `Insufficient wattage details to verify power supply compatibility.`,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Generic Dimension / Mount / VESA Matching
    // ─────────────────────────────────────────────────────────────────────────
    const vesaA = extractAttribute(item, ["vesa", "mount"]);
    const vesaB = extractAttribute(parentItem, ["vesa", "mount"]);
    if (vesaA && vesaB) {
      const match = normalizeString(vesaA) === normalizeString(vesaB);
      if (match) {
        hasCompatible = true;
        evaluatedAttributes.push({
          attributeKey: "vesa_mount",
          parentValue: vesaB,
          itemValue: vesaA,
          isMatch: true,
          reason: `VESA pattern ${vesaA} matches mount pattern ${vesaB}.`,
        });
      } else {
        hasIncompatible = true;
        evaluatedAttributes.push({
          attributeKey: "vesa_mount",
          parentValue: vesaB,
          itemValue: vesaA,
          isMatch: false,
          reason: `VESA pattern mismatch: ${vesaA} does not match mount ${vesaB}.`,
        });
      }
    }
  }

  // Derive final status
  let finalStatus: CompatibilityStatus = "not_enough_info";
  let summary = "Not enough verified specifications to confirm compatibility.";

  if (hasIncompatible) {
    finalStatus = "verified_incompatible";
    summary = "Compatibility issue detected with dependent components.";
  } else if (hasCompatible && !hasUnverified) {
    finalStatus = "verified_compatible";
    summary = "All checked attributes are verified compatible.";
  } else if (hasCompatible && hasUnverified) {
    finalStatus = "not_enough_info";
    summary = "Partially compatible, but some critical specifications remain unverified.";
  }

  return {
    status: finalStatus,
    summary,
    evaluatedAttributes,
  };
}

/**
 * Revalidates only the items affected when an item or dependency changes.
 */
export function revalidateGroupCompatibility(group: ShoppingGroup): ShoppingGroup {
  if (group.type !== "coordinated_setup") {
    return group;
  }

  const updatedItems = group.items.map((item) => {
    if (!item.dependencies || item.dependencies.length === 0) {
      return item;
    }
    const report = evaluateItemCompatibility(item, group);
    return {
      ...item,
      compatibility: report,
    };
  });

  return {
    ...group,
    items: updatedItems,
    updatedAt: Date.now(),
  };
}
