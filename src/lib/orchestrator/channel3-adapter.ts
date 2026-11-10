import type { ShoppingBrief, Channel3AdaptedSearchRequest } from "./types.ts";
import type { Channel3SearchOptions } from "../channel3/client.ts";

export interface ReadinessCheckResult {
  isReady: boolean;
  reasons: string[];
}

/**
 * Checks whether a Shopping Brief is ready to execute product discovery via Channel3.
 */
export function checkBriefReadinessForSearch(brief: ShoppingBrief): ReadinessCheckResult {
  const reasons: string[] = [];

  if (brief.productRequirements.length === 0) {
    reasons.push("No product requirements defined in Shopping Brief.");
  }

  for (const req of brief.productRequirements) {
    if (!req.searchQuery || req.searchQuery.trim().length < 2) {
      reasons.push(`Requirement '${req.displayName || req.id}' lacks a valid search query.`);
    }
  }

  // If status is needs_clarification or collecting with missing info
  if (brief.status === "needs_clarification" || brief.status === "collecting") {
    reasons.push(`Brief has status '${brief.status}'. Information collection is still in progress.`);
  }

  return {
    isReady: reasons.length === 0,
    reasons,
  };
}

/**
 * Builds adapted search requests from a Shopping Brief for the Channel3 discovery service.
 * Supports both single-product and multi-product mode:
 * - Generates individual search requests per product requirement
 * - Properly allocates budgets rather than assigning the total budget to every component
 * - Maps hard constraints into search query keywords and attribute filters
 */
export function buildChannel3SearchRequests(
  brief: ShoppingBrief
): Channel3AdaptedSearchRequest[] {
  const currency = brief.budget?.maximum?.currency || brief.budget?.minimum?.currency || "USD";
  const totalMaxBudgetMinor = brief.budget?.maximum?.amountMinor ?? null;

  const count = brief.productRequirements.length;
  if (count === 0) return [];

  return brief.productRequirements.map((req) => {
    // Collect hard constraints
    const hardConstraints: Record<string, string | number | boolean> = {};
    for (const c of req.constraints) {
      if (c.strength === "hard") {
        hardConstraints[c.key] = c.value;
      }
    }

    // Determine query enhancement based on hard constraints (e.g. "Apple MacBook", "1TB SSD")
    const queryParts = [req.searchQuery];
    if (hardConstraints["os"] && /macos/i.test(String(hardConstraints["os"]))) {
      if (!queryParts[0].toLowerCase().includes("macbook") && !queryParts[0].toLowerCase().includes("apple")) {
        queryParts.push("Apple MacBook");
      }
    }
    if (hardConstraints["storage"] && !queryParts[0].toLowerCase().includes(String(hardConstraints["storage"]).toLowerCase())) {
      queryParts.push(String(hardConstraints["storage"]));
    }
    const finalSearchQuery = queryParts.join(" ");

    // Budget allocation:
    // If requirement has a dedicated suggested budget, use it.
    // Otherwise, in single-product mode, use the full budget.
    // In multi-product mode without explicit per-item allocation, divide proportionally or leave unconstrained.
    let maxPriceMinor: number | null = null;
    let minPriceMinor: number | null = null;

    if (req.suggestedBudgetMinor && req.suggestedBudgetMinor > 0) {
      maxPriceMinor = req.suggestedBudgetMinor;
    } else if (brief.mode === "single_product" && totalMaxBudgetMinor) {
      maxPriceMinor = totalMaxBudgetMinor;
      if (brief.budget?.minimum?.amountMinor) {
        minPriceMinor = brief.budget.minimum.amountMinor;
      }
    } else if (brief.mode === "multi_product" && totalMaxBudgetMinor) {
      // In multi-product mode, ceiling is bounded by total budget, but each item is allocated a fraction
      maxPriceMinor = Math.round(totalMaxBudgetMinor / count);
    }

    return {
      requirementId: req.id,
      category: req.category,
      searchQuery: finalSearchQuery,
      minPriceMinor,
      maxPriceMinor,
      currency,
      hardConstraints,
      excludedAttributes: req.excludedAttributes || [],
    };
  });
}

/**
 * Transforms adapted search requests into existing Channel3 SDK options.
 */
export function toChannel3SearchOptions(
  adapted: Channel3AdaptedSearchRequest,
  limit: number = 8
): Channel3SearchOptions {
  return {
    query: adapted.searchQuery,
    currency: adapted.currency,
    minPrice: adapted.minPriceMinor !== null && adapted.minPriceMinor !== undefined
      ? adapted.minPriceMinor / 100
      : undefined,
    maxPrice: adapted.maxPriceMinor !== null && adapted.maxPriceMinor !== undefined
      ? adapted.maxPriceMinor / 100
      : undefined,
    limit,
  };
}
