import { Channel3, Channel3Error, Channel3TimeoutError } from "@channel3/sdk";
import type { Channel3Api } from "@channel3/sdk";

// In-memory cache entry with TTL to conserve hackathon credits
interface CacheEntry {
  timestamp: number;
  data: Channel3Api.Product[];
}

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const searchCache = new Map<string, CacheEntry>();

/**
 * Returns an authenticated Channel3 client instance.
 * Throws a descriptive configuration error if CHANNEL3_API_KEY is not defined.
 */
export function getChannel3Client(): Channel3 {
  const apiKey = process.env.CHANNEL3_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "Missing CHANNEL3_API_KEY environment variable. Please set CHANNEL3_API_KEY in .env.local to enable live product searches."
    );
  }

  return new Channel3({
    apiKey,
    timeoutInSeconds: 15,
  });
}

export interface Channel3SearchOptions {
  query: string;
  maxPrice?: number | null;
  currency?: string;
  limit?: number;
}

export interface Channel3SearchResult {
  products: Channel3Api.Product[];
  cached: boolean;
}

/**
 * Executes a Channel3 product search with caching and error normalization.
 */
export async function searchChannel3Products({
  query,
  maxPrice,
  currency = "USD",
  limit = 8,
}: Channel3SearchOptions): Promise<Channel3SearchResult> {
  const normalizedQuery = query.trim().toLowerCase();
  const cacheKey = `${normalizedQuery}|${maxPrice ?? "all"}|${currency}|${limit}`;

  // Check cache
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      products: cached.data,
      cached: true,
    };
  }

  const client = getChannel3Client();

  const searchFilters: Channel3Api.SearchFilters = {};

  if (typeof maxPrice === "number" && maxPrice > 0) {
    searchFilters.price = {
      max_price: maxPrice,
    };
  }

  // Pass validated configuration
  const searchConfig: Channel3Api.SearchConfig = {
    currency: currency as Channel3Api.CurrencyCode,
  };

  try {
    const page = await client.products.search({
      query: normalizedQuery,
      limit: Math.min(Math.max(limit, 1), 20),
      filters: Object.keys(searchFilters).length > 0 ? searchFilters : undefined,
      config: searchConfig,
    });

    // Page object returns products under .response.products or .data
    const products: Channel3Api.Product[] =
      (page as unknown as { response?: { products?: Channel3Api.Product[] } }).response?.products ??
      page.data ??
      [];

    // Store in cache (bounded to 50 items)
    if (searchCache.size > 50) {
      const oldestKey = searchCache.keys().next().value;
      if (oldestKey) searchCache.delete(oldestKey);
    }
    searchCache.set(cacheKey, { timestamp: Date.now(), data: products });

    return {
      products,
      cached: false,
    };
  } catch (err: unknown) {
    if (err instanceof Channel3TimeoutError) {
      throw new Error("Channel3 product search timed out after 15 seconds. Please try again.");
    }

    if (err instanceof Channel3Error) {
      if (err.statusCode === 401 || err.statusCode === 403) {
        throw new Error("Invalid or unauthorized Channel3 API key. Please check your credentials in .env.local.");
      }
      if (err.statusCode === 402) {
        throw new Error("Channel3 API credits or quota exhausted. Please check your Channel3 dashboard.");
      }
      if (err.statusCode === 429) {
        throw new Error("Channel3 rate limit exceeded. Please wait a moment before trying again.");
      }
      throw new Error(`Channel3 API error (${err.statusCode}): ${err.message || "Search failed"}`);
    }

    const message = err instanceof Error ? err.message : "Unknown Channel3 connection error";
    throw new Error(message);
  }
}

