/**
 * SpendPilot Search Progress & Comparison Messaging
 *
 * Provides curated, product-aware temporary progress messages across search & comparison stages.
 * Guaranteed NOT to become permanent chat messages: used strictly for transient animated UI states.
 */

export type SearchProgressStage =
  | "understanding"
  | "searching"
  | "search_completed"
  | "comparing"
  | "completed";

export interface SearchProgressState {
  stage: SearchProgressStage;
  message: string;
  subtext?: string;
}

export interface ProgressContext {
  productName?: string;
  category?: string;
  isWinter?: boolean;
  skinType?: string;
  constraints?: Record<string, string | number | boolean>;
}

/**
 * Returns a category-specific progress message for each stage of the discovery pipeline.
 */
export function getProgressMessage(
  stage: SearchProgressStage,
  query: string = "",
  category: string = "",
  context?: ProgressContext
): string {
  const lower = query.toLowerCase();
  const catLower = category.toLowerCase();
  const isWinter = context?.isWinter ?? (lower.includes("winter") || lower.includes("cold"));
  const isLotion =
    lower.includes("lotion") ||
    lower.includes("body cream") ||
    lower.includes("moisturizer") ||
    catLower.includes("skincare") ||
    catLower.includes("beauty");
  const isLaptop =
    lower.includes("laptop") ||
    lower.includes("macbook") ||
    catLower.includes("laptop") ||
    catLower.includes("computer");
  const isHeadphone =
    lower.includes("headphone") ||
    lower.includes("earbuds") ||
    catLower.includes("audio") ||
    catLower.includes("headphones");
  const isShoe =
    lower.includes("shoe") ||
    lower.includes("sneaker") ||
    lower.includes("running") ||
    catLower.includes("shoes");
  const isChair =
    lower.includes("chair") ||
    lower.includes("desk") ||
    catLower.includes("furniture");
  const isGamingSetup =
    lower.includes("gaming setup") ||
    lower.includes("pc build") ||
    (lower.includes("setup") && lower.includes("gaming"));

  switch (stage) {
    case "understanding": {
      if (isLotion && isWinter) {
        return "Understanding your winter body care routine...";
      }
      if (isLaptop) {
        return "Understanding your laptop workload requirements...";
      }
      if (isHeadphone) {
        return "Understanding your audio and fit preferences...";
      }
      if (isShoe) {
        return "Understanding your running and terrain needs...";
      }
      return "Understanding what you're looking for...";
    }

    case "searching": {
      if (isLotion) {
        return isWinter
          ? "Finding suitable body lotions for your winter routine..."
          : "Searching for moisturizing body lotions that match your skin...";
      }
      if (isLaptop) {
        return "Searching for verified laptops suited to your workload...";
      }
      if (isHeadphone) {
        return "Searching for top headphones matching your sound profile...";
      }
      if (isShoe) {
        return "Finding running shoes suited for your terrain...";
      }
      if (isChair) {
        return "Searching for ergonomic seating options for your space...";
      }
      if (isGamingSetup) {
        return "Searching for compatible gaming setup components...";
      }
      const displayName = context?.productName || "products";
      return `Searching for verified ${displayName} matching your preferences...`;
    }

    case "search_completed": {
      if (isLotion) {
        return isWinter
          ? "I've found some body lotion options for your winter shopping. Let's see which ones fit you best."
          : "Your body lotion options are ready. I'm checking the strongest matches.";
      }
      if (isLaptop) {
        return "Your laptop options are ready. Checking the strongest configurations...";
      }
      if (isHeadphone) {
        return "Found matching headphone options for your shopping list. Let's compare them.";
      }
      if (isShoe) {
        return "Found matching running shoes. Checking cushioning and support...";
      }
      if (isChair) {
        return "Seating options retrieved. Checking ergonomics and build quality...";
      }
      if (isGamingSetup) {
        return "Setup components found. Checking system compatibility and balance...";
      }
      return "Found matching options for your shopping list. Let's compare them.";
    }

    case "comparing": {
      if (isLotion) {
        return "Comparing hydration, ingredients, and value...";
      }
      if (isLaptop) {
        return "Comparing performance, configuration, and price...";
      }
      if (isHeadphone) {
        return "Comparing sound quality, noise cancellation, and comfort...";
      }
      if (isShoe) {
        return "Comparing cushioning, grip, and durability...";
      }
      if (isChair) {
        return "Comparing ergonomic support, materials, and value...";
      }
      if (isGamingSetup) {
        return "Comparing gaming performance, refresh rates, and budget allocation...";
      }
      return "Checking which options match your preferences best...";
    }

    case "completed": {
      if (isLotion) {
        return isWinter
          ? "I've compared the available options. Here are the strongest matches for your winter body lotion."
          : "I've compared the available options. Here are the best matches for your skin.";
      }
      if (isLaptop) {
        return "I've compared the top configurations. Here are the best laptop options for your needs.";
      }
      if (isHeadphone) {
        return "I've compared the top audio gear. Here are the strongest matches for your preferences.";
      }
      if (isShoe) {
        return "I've compared the available running shoes. Here are the top recommendations for you.";
      }
      if (isGamingSetup) {
        return "Found some promising choices for your gaming setup. Here's what I'd recommend.";
      }
      return "I've compared the available options. Here are the strongest matches for you.";
    }

    default:
      return "Looking for products that match your preferences...";
  }
}

