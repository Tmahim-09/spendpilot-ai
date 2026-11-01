import { getChannel3Client } from "./client.ts";
import type { Channel3Api } from "@channel3/sdk";
import type { QuestionOption } from "@/types";

export interface CategoryAttributeSchema {
  slug: string;
  name: string;
  values: string[];
}

export interface CategoryMetadata {
  slug: string;
  title: string;
  description?: string | null;
  attributes: CategoryAttributeSchema[];
}

// In-memory category cache to prevent redundant API queries
const categoryCache = new Map<string, { timestamp: number; data: CategoryMetadata }>();
const CATEGORY_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Validated authentic attribute templates for high-frequency commerce domains
// (Matches Channel3 category attribute taxonomies and standard retailer specifications)
export const VERIFIED_CATEGORY_TAXONOMY: Record<string, CategoryMetadata> = {
  sneakers: {
    slug: "sneakers",
    title: "Sneakers & Athletic Shoes",
    description: "Athletic, lifestyle, and running sneakers with sizing and color variants.",
    attributes: [
      {
        slug: "shoe-size",
        name: "Shoe Size",
        values: [
          "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5",
          "10", "10.5", "11", "11.5", "12", "12.5", "13", "14"
        ],
      },
      {
        slug: "size-system",
        name: "Sizing System",
        values: ["US Men's", "US Women's", "UK", "EU"],
      },
      {
        slug: "color",
        name: "Color",
        values: ["Black", "White", "Grey", "Blue", "Red", "Green", "Beige / Cream", "Multicolor"],
      },
      {
        slug: "intended-use",
        name: "Intended Use",
        values: ["Everyday Lifestyle", "Running & Jogging", "Gym & Training", "Basketball", "Walking / Work"],
      },
    ],
  },
  headphones: {
    slug: "headphones",
    title: "Headphones & Earbuds",
    description: "Over-ear, on-ear, and true wireless in-ear audio equipment.",
    attributes: [
      {
        slug: "form-factor",
        name: "Form Factor",
        values: ["Over-Ear", "In-Ear / Earbuds", "On-Ear"],
      },
      {
        slug: "connectivity",
        name: "Connectivity",
        values: ["Wireless (Bluetooth)", "Wired (3.5mm / USB)", "Dual-Mode (Wireless + Wired)"],
      },
      {
        slug: "noise-cancellation",
        name: "Noise Cancellation",
        values: ["Active Noise Cancelling (ANC)", "Standard / Passive"],
      },
      {
        slug: "primary-use",
        name: "Primary Use",
        values: ["Commuting & Travel", "Gaming & Discord", "Study & Office", "Gym & Running"],
      },
    ],
  },
  laptops: {
    slug: "laptops",
    title: "Laptops & Notebooks",
    description: "Portable computers for work, school, programming, and gaming.",
    attributes: [
      {
        slug: "operating-system",
        name: "Operating System",
        values: ["macOS", "Windows 11", "ChromeOS", "Linux Friendly"],
      },
      {
        slug: "primary-use",
        name: "Primary Use",
        values: ["Programming & Software Dev", "University & General Productivity", "Gaming", "Video Editing & Creative Work"],
      },
      {
        slug: "screen-size",
        name: "Screen Size",
        values: ["13-14 inch (Ultraportable)", "15-16 inch (Standard)", "17+ inch (Desktop Replacement)"],
      },
      {
        slug: "memory-ram",
        name: "Memory (RAM)",
        values: ["16GB (Recommended)", "32GB (Heavy Multi-tasking)", "8GB (Basic tasks)"],
      },
      {
        slug: "storage-capacity",
        name: "Storage (SSD)",
        values: ["512GB SSD", "1TB SSD", "2TB SSD", "256GB SSD"],
      },
    ],
  },
  smartphones: {
    slug: "smartphones",
    title: "Smartphones & Mobile Phones",
    description: "Smartphones running iOS and Android with cellular connectivity.",
    attributes: [
      {
        slug: "operating-system",
        name: "Operating System",
        values: ["iOS (iPhone)", "Android"],
      },
      {
        slug: "storage",
        name: "Storage Capacity",
        values: ["128GB", "256GB", "512GB", "1TB"],
      },
      {
        slug: "color",
        name: "Colorway",
        values: ["Black / Midnight", "White / Starlight", "Blue", "Titanium / Grey", "Green"],
      },
    ],
  },
  clothing: {
    slug: "clothing",
    title: "Apparel & Clothing",
    description: "Garments including shirts, hoodies, jackets, pants, and sportswear.",
    attributes: [
      {
        slug: "size",
        name: "Size",
        values: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
      },
      {
        slug: "fit",
        name: "Fit Style",
        values: ["Regular Fit", "Relaxed / Oversized", "Slim Fit", "Athletic"],
      },
      {
        slug: "color",
        name: "Color",
        values: ["Black", "White", "Navy Blue", "Heather Grey", "Olive Green", "Beige"],
      },
      {
        slug: "material",
        name: "Material",
        values: ["100% Cotton", "Fleece / Heavy Cotton", "Polyester / Moisture-Wicking", "Wool / Blend"],
      },
    ],
  },
  furniture: {
    slug: "furniture",
    title: "Furniture & Room Decor",
    description: "Desks, chairs, shelving, and home decorative accents.",
    attributes: [
      {
        slug: "furniture-type",
        name: "Piece Type",
        values: ["Ergonomic Desk Chair", "Study / Computer Desk", "Bookshelf / Storage", "Wall Decor & Art", "Floor Rug"],
      },
      {
        slug: "material",
        name: "Material / Finish",
        values: ["Solid Wood / Walnut", "Engineered Wood / Oak", "Metal & Steel", "Breathable Mesh", "Upholstered Fabric"],
      },
      {
        slug: "color-finish",
        name: "Color & Finish",
        values: ["Matte Black", "White", "Natural Wood", "Dark Walnut", "Grey"],
      },
    ],
  },
};

/**
 * Searches and resolves a category's metadata and attribute definitions.
 * Checks memory cache first, attempts live Channel3 category API, and falls back to
 * verified taxonomy mappings.
 */
export async function resolveCategoryMetadata(
  queryOrSlug: string
): Promise<CategoryMetadata | null> {
  const normalized = queryOrSlug.trim().toLowerCase();
  
  // 1. Direct match in verified taxonomy
  for (const [key, meta] of Object.entries(VERIFIED_CATEGORY_TAXONOMY)) {
    if (
      normalized === key ||
      normalized.includes(key) ||
      key.includes(normalized) ||
      meta.title.toLowerCase().includes(normalized)
    ) {
      return meta;
    }
  }

  // 2. Check in-memory cache
  const cached = categoryCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < CATEGORY_CACHE_TTL_MS) {
    return cached.data;
  }

  // 3. Keyword heuristic matching across taxonomy before external search
  if (
    normalized.includes("shoe") ||
    normalized.includes("sneak") ||
    normalized.includes("boot") ||
    normalized.includes("footwear") ||
    normalized.includes("air max") ||
    normalized.includes("air force") ||
    normalized.includes("jordan") ||
    normalized.includes("yeezy")
  ) {
    return VERIFIED_CATEGORY_TAXONOMY.sneakers;
  }
  if (normalized.includes("headphone") || normalized.includes("earbud") || normalized.includes("headset") || normalized.includes("audio")) {
    return VERIFIED_CATEGORY_TAXONOMY.headphones;
  }
  if (normalized.includes("laptop") || normalized.includes("macbook") || normalized.includes("notebook") || normalized.includes("thinkpad")) {
    return VERIFIED_CATEGORY_TAXONOMY.laptops;
  }
  if (normalized.includes("phone") || normalized.includes("iphone") || normalized.includes("android") || normalized.includes("samsung")) {
    return VERIFIED_CATEGORY_TAXONOMY.smartphones;
  }
  if (normalized.includes("cloth") || normalized.includes("shirt") || normalized.includes("hoodie") || normalized.includes("jacket") || normalized.includes("pant")) {
    return VERIFIED_CATEGORY_TAXONOMY.clothing;
  }
  if (normalized.includes("desk") || normalized.includes("chair") || normalized.includes("decor") || normalized.includes("room") || normalized.includes("furniture")) {
    return VERIFIED_CATEGORY_TAXONOMY.furniture;
  }

  // 4. Attempt Channel3 Category Search API
  try {
    const client = getChannel3Client();
    const searchRes = await client.categories.search({ query: normalized });
    const categories: Channel3Api.CategorySummary[] =
      searchRes?.categories ??
      (searchRes as unknown as { response?: { categories?: Channel3Api.CategorySummary[] } }).response?.categories ??
      [];

    if (categories.length > 0 && categories[0].slug) {
      const topSlug = categories[0].slug;
      
      // Check if top slug maps to our verified template
      if (VERIFIED_CATEGORY_TAXONOMY[topSlug]) {
        return VERIFIED_CATEGORY_TAXONOMY[topSlug];
      }
      if (topSlug.includes("shoe") || topSlug.includes("sneak") || topSlug.includes("footwear")) {
        return VERIFIED_CATEGORY_TAXONOMY.sneakers;
      }
      if (topSlug.includes("audio") || topSlug.includes("headphone") || topSlug.includes("earphone")) {
        return VERIFIED_CATEGORY_TAXONOMY.headphones;
      }
      if (topSlug.includes("laptop") || topSlug.includes("computer")) {
        return VERIFIED_CATEGORY_TAXONOMY.laptops;
      }
      if (topSlug.includes("phone")) {
        return VERIFIED_CATEGORY_TAXONOMY.smartphones;
      }

      // Retrieve full category details
      const detail = await client.categories.retrieve({ slug: topSlug });
      const fullCategory: Channel3Api.Category =
        (detail as unknown as { response?: Channel3Api.Category }).response ?? detail;

      const attrs: CategoryAttributeSchema[] = (fullCategory.attributes || []).map((a) => ({
        slug: a.slug,
        name: a.name,
        values: a.values || [],
      }));

      const resultMeta: CategoryMetadata = {
        slug: fullCategory.slug,
        title: fullCategory.title || categories[0].title || topSlug,
        description: fullCategory.description,
        attributes: attrs,
      };

      categoryCache.set(normalized, { timestamp: Date.now(), data: resultMeta });
      return resultMeta;
    }
  } catch {
    // If Channel3 category call times out or is restricted, fallback
  }

  return null;
}

/**
 * Converts category attribute values into selectable QuestionOptions
 */
export function formatAttributeOptions(
  attribute: CategoryAttributeSchema,
  maxOptions = 10
): QuestionOption[] {
  return (attribute.values || []).slice(0, maxOptions).map((val) => ({
    id: `${attribute.slug}-${val.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label: val,
    value: val,
    isCommon: true,
  }));
}
