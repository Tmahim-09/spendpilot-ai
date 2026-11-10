import type { RecommendedBundleItem, SetupRequirementItem } from "../../types/index.ts";

export type DiversityGroup =
  | "wall-art"
  | "wall-lighting"
  | "bedding"
  | "figurine"
  | "rug"
  | "pillows"
  | "desk-mat"
  | "pc"
  | "monitor"
  | "keyboard"
  | "mouse"
  | "headset"
  | "speakers"
  | "chair"
  | "electronics"
  | "apparel"
  | "furniture"
  | "hardware"
  | "general";

/**
 * Maps common category descriptions to a canonical diversity group.
 */
export function inferDiversityGroup(categoryOrName: string): DiversityGroup {
  const lower = categoryOrName.toLowerCase();

  // 1. Specific PC Peripherals and Hardware (Check before generic accessories or pads)
  if (lower.includes("chair") || lower.includes("seating")) {
    return "chair";
  }
  if (
    lower.includes("desktop") ||
    lower.includes("tower") ||
    lower.includes("prebuilt") ||
    lower.includes("gaming pc") ||
    lower.includes("computer build") ||
    lower.includes("gaming system")
  ) {
    return "pc";
  }
  if (lower.includes("monitor") || lower.includes("display") || lower.includes("screen")) {
    return "monitor";
  }
  if (lower.includes("keyboard") || lower.includes("keycap")) {
    return "keyboard";
  }
  if (
    (lower.includes("headset") || lower.includes("headphone") || lower.includes("earphone") || lower.includes("earbuds"))
  ) {
    return "headset";
  }
  if (lower.includes("speaker") || lower.includes("soundbar") || lower.includes("audio monitor")) {
    return "speakers";
  }
  // Check mouse before desk mat / mouse pad, but if it explicitly targets the mat, categorize as desk-mat
  if (
    lower.includes("desk mat") ||
    lower.includes("desk-mat") ||
    lower.includes("mouse pad") ||
    lower.includes("mouse-pad") ||
    lower.includes("mousepad") ||
    lower.includes("playmat") ||
    lower.includes("desk pad") ||
    lower.includes("mouse mat")
  ) {
    return "desk-mat";
  }
  if (lower.includes("mouse") || lower.includes("pointer") || lower.includes("trackball")) {
    return "mouse";
  }
  if (
    lower.includes("cpu") ||
    lower.includes("gpu") ||
    lower.includes("motherboard") ||
    lower.includes("ram") ||
    lower.includes("power supply") ||
    lower.includes("psu") ||
    lower.includes("graphics card") ||
    lower.includes("processor")
  ) {
    return "hardware";
  }

  // 2. Room Decor and Merchandise
  if (lower.includes("neon") || lower.includes("led") || lower.includes("light") || lower.includes("lamp")) {
    return "wall-lighting";
  }
  if (
    lower.includes("canvas") ||
    lower.includes("poster") ||
    lower.includes("scroll") ||
    lower.includes("wall art") ||
    lower.includes("print") ||
    lower.includes("tapestry") ||
    lower.includes("wall flag")
  ) {
    return "wall-art";
  }
  if (lower.includes("bedding") || lower.includes("duvet") || lower.includes("comforter") || lower.includes("sheet") || lower.includes("blanket")) {
    return "bedding";
  }
  if (lower.includes("figure") || lower.includes("figurine") || lower.includes("statue") || lower.includes("collectible") || lower.includes("toy")) {
    return "figurine";
  }
  if (lower.includes("rug") || lower.includes("carpet") || lower.includes("floor mat")) {
    return "rug";
  }
  if (lower.includes("pillow") || lower.includes("cushion") || lower.includes("pillowcase")) {
    return "pillows";
  }

  return "general";
}

/**
 * Computes Jaccard word-token similarity between two titles to detect near-duplicates.
 */
export function calculateTitleSimilarity(titleA: string, titleB: string): number {
  if (!titleA || !titleB) return 0;

  const tokenize = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );

  const setA = tokenize(titleA);
  const setB = tokenize(titleB);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) {
      intersection++;
    }
  }

  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export interface BundleDiversityReport {
  isDiverse: boolean;
  duplicateProductIds: string[];
  nearDuplicatePairs: Array<{ productA: string; productB: string; similarity: number }>;
  groupCounts: Record<DiversityGroup, number>;
  redundantGroups: DiversityGroup[];
  warnings: string[];
}

/**
 * Analyzes a proposed bundle to verify diversity across visual form factors and item roles.
 */
export function evaluateBundleDiversity(
  items: RecommendedBundleItem[],
  requirements: SetupRequirementItem[],
  options: { allowUserRequestedDuplicates?: boolean } = {}
): BundleDiversityReport {
  const duplicateProductIds: string[] = [];
  const nearDuplicatePairs: Array<{ productA: string; productB: string; similarity: number }> = [];
  const groupCounts: Record<DiversityGroup, number> = {
    "wall-art": 0,
    "wall-lighting": 0,
    bedding: 0,
    figurine: 0,
    rug: 0,
    pillows: 0,
    "desk-mat": 0,
    pc: 0,
    monitor: 0,
    keyboard: 0,
    mouse: 0,
    headset: 0,
    speakers: 0,
    chair: 0,
    electronics: 0,
    apparel: 0,
    furniture: 0,
    hardware: 0,
    general: 0,
  };
  const warnings: string[] = [];

  const seenIds = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prod = item.selectedProduct;
    const pid = prod.sourceProductId || prod.title;

    // 1. Exact ID duplicates
    if (seenIds.has(pid)) {
      duplicateProductIds.push(pid);
      warnings.push(`Duplicate product ID detected in multiple items: "${prod.title}"`);
    } else {
      seenIds.add(pid);
    }

    // 2. Near-duplicate title comparisons
    for (let j = i + 1; j < items.length; j++) {
      const otherProd = items[j].selectedProduct;
      const sim = calculateTitleSimilarity(prod.title, otherProd.title);
      if (sim >= 0.65) {
        nearDuplicatePairs.push({
          productA: prod.title,
          productB: otherProd.title,
          similarity: Math.round(sim * 100) / 100,
        });
        warnings.push(`Near-duplicate product listing detected: "${prod.title}" and "${otherProd.title}" (similarity: ${Math.round(sim * 100)}%)`);
      }
    }

    // 3. Count diversity groups strictly based on canonical requirement record, NEVER product listing title
    const req = requirements.find((r) => r.id === item.requirementId);
    let group: DiversityGroup;
    if (req?.diversityGroup && req.diversityGroup !== "general") {
      group = req.diversityGroup as DiversityGroup;
    } else {
      const categorySource = req?.productCategory || req?.name || item.requirementName || "general";
      group = inferDiversityGroup(categorySource);
    }
    groupCounts[group] = (groupCounts[group] || 0) + 1;
  }

  // Identify redundant groups (e.g. multiple items in the same physical category when not requested)
  const redundantGroups: DiversityGroup[] = [];
  if (!options.allowUserRequestedDuplicates) {
    for (const [group, count] of Object.entries(groupCounts)) {
      if (count > 1 && group !== "general" && group !== "hardware") {
        redundantGroups.push(group as DiversityGroup);
        warnings.push(`Bundle contains ${count} items in the "${group}" category; consider diversifying.`);
      }
    }
  }

  const isDiverse = duplicateProductIds.length === 0 && nearDuplicatePairs.length === 0 && redundantGroups.length === 0;

  return {
    isDiverse,
    duplicateProductIds,
    nearDuplicatePairs,
    groupCounts,
    redundantGroups,
    warnings,
  };
}
