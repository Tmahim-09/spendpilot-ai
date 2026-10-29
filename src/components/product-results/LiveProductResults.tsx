"use client";

import React from "react";
import { ProductCard } from "./ProductCard";
import type { NormalizedProduct, CurrencyCode, AiProcessingStatus } from "@/types";
import {
  ShieldAlert,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Check,
  AlertCircle,
  Search,
  Bot,
  Layers,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface LiveProductResultsProps {
  query: string | null;
  budget: number | null;
  currency: CurrencyCode;
  products: NormalizedProduct[];
  topRecommendations?: NormalizedProduct[];
  otherMatches?: NormalizedProduct[];
  comparisonOverview?: string | null;
  isSearchingProducts: boolean;
  isRankingAi: boolean;
  aiStatus: AiProcessingStatus;
  aiMessage?: string | null;
  playfulNotice?: {
    message: string;
    suggestedProducts: string[];
  } | null;
  error: string | null;
  onRetry?: () => void;
  onSelectPrompt?: (promptText: string) => void;
  cached?: boolean;
}

export function LiveProductResults({
  query,
  budget,
  currency,
  products,
  topRecommendations = [],
  otherMatches = [],
  comparisonOverview = null,
  isSearchingProducts,
  isRankingAi,
  aiStatus,
  aiMessage = null,
  playfulNotice = null,
  error,
  onRetry,
  onSelectPrompt,
  cached = false,
}: LiveProductResultsProps) {
  // State 1: Clearly Unrelated Prompt (Zero API calls made, instant witty response)
  if (playfulNotice) {
    return (
      <section
        id="search-results"
        aria-label="Assistant Response"
        className="py-10 sm:py-14 border-b border-[#242424] bg-[#090909]"
      >
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-[#FF6A00]/30 bg-[#12100e] p-6 sm:p-8 shadow-xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#FF6A00]/40 bg-[#FF6A00]/15 text-[#FF8126]">
                <Bot className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-3 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#FF8126]">
                    SpendPilot Shopping Assistant
                  </span>
                  <span className="text-[10px] text-[#737373] bg-[#1a1714] px-2 py-0.5 rounded border border-[#2d241c]">
                    Commerce Mode
                  </span>
                </div>

                <p className="text-base sm:text-lg font-medium text-[#F5F5F5] leading-snug">
                  &ldquo;{playfulNotice.message}&rdquo;
                </p>

                {playfulNotice.suggestedProducts.length > 0 && (
                  <div className="pt-3 border-t border-[#231e18]">
                    <span className="text-xs text-[#A3A3A3] block mb-2 font-medium">
                      Try asking for real products within budget:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {playfulNotice.suggestedProducts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => onSelectPrompt?.(prompt)}
                          className="rounded-lg border border-[#332b22] bg-[#1a1612] px-3 py-1.5 text-xs text-[#D4D4D4] hover:border-[#FF6A00]/50 hover:text-[#FF8126] transition-colors"
                        >
                          &ldquo;{prompt}&rdquo;
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // State 2: Distinctive Single Animated Search-in-Progress (Replaces the 4 repetitive skeletons)
  if (isSearchingProducts) {
    return (
      <section
        id="search-results"
        aria-label="Searching catalog"
        className="py-14 sm:py-20 border-b border-[#242424] bg-[#090909]"
      >
        <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="rounded-2xl border border-[#242424] bg-[#0e0e0e] p-8 sm:p-12 shadow-2xl relative overflow-hidden">
            {/* Subtle background radar pulse */}
            <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF6A00]/15 motion-reduce:animate-none" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[#FF6A00]/40 bg-[#161310] text-[#FF8126] shadow-lg shadow-[#FF6A00]/10">
                <Search className="h-7 w-7 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
              </div>
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6A00]/30 bg-[#FF6A00]/10 px-3 py-0.5 text-xs font-semibold text-[#FF8126]">
                <Sparkles className="h-3 w-3" />
                Live Channel3 Discovery
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F5F5]">
                Scanning the product catalog...
              </h2>
              <p className="text-xs sm:text-sm text-[#888888] max-w-md mx-auto">
                Discovering authentic merchant offers and pricing for &ldquo;{query}&rdquo;
              </p>
            </div>

            {/* Restrained animated progress shimmer */}
            <div className="mt-8 h-1 w-full overflow-hidden rounded-full bg-[#1c1c1c]">
              <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-[#FF6A00]/20 via-[#FF6A00] to-[#FF6A00]/20 animate-pulse motion-reduce:animate-none mx-auto" />
            </div>

            <div className="mt-4 text-[11px] text-[#737373]">
              Direct retailer indexing &bull; Real-time price verification
            </div>
          </div>
        </div>
      </section>
    );
  }

  // State 3: Search error state
  if (error) {
    return (
      <section id="search-results" className="py-12 sm:py-16 border-b border-[#242424] bg-[#090909]">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-[#F05B5B]/30 bg-[#F05B5B]/10 p-6 text-sm">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-[#F05B5B] shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1 space-y-2">
                <h3 className="font-semibold text-[#F5F5F5] text-base">
                  Product Search Unavailable
                </h3>
                <p className="text-xs text-[#D4D4D4] leading-relaxed">
                  {error}
                </p>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#F05B5B] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#ff7070] transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Retry Search</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // State 4: No active search yet
  if (!query) {
    return null;
  }

  // State 5: Zero results matching
  if (products.length === 0) {
    return (
      <section id="search-results" className="py-12 sm:py-16 border-b border-[#242424] bg-[#090909]">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="rounded-2xl border border-[#262626] bg-[#101010] p-8 sm:p-12">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[#303030] bg-[#171717] text-[#737373] mb-4">
              <ShoppingBag className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-bold text-[#F5F5F5] mb-2">
              No matching products found
            </h3>
            <p className="text-xs sm:text-sm text-[#A3A3A3] max-w-md mx-auto mb-6">
              We couldn&apos;t find any products on Channel3 matching &ldquo;{query}&rdquo;
              {budget ? ` under ${formatCurrency(budget * 100, currency)}` : ""}. Try using broader terms or increasing your budget limit.
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#303030] bg-[#171717] px-4 py-2 text-xs font-medium text-[#F5F5F5] hover:bg-[#202020] transition-colors"
              >
                <span>Edit your request</span>
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // State 6: Genuine Products Rendered (Instant Channel3 Discovery + Asynchronous AI Ranking)
  const hasRecommendations = topRecommendations.length > 0;
  const secondaryProducts = otherMatches.length > 0 ? otherMatches : (hasRecommendations ? [] : products);

  return (
    <section id="search-results" className="py-12 sm:py-16 border-b border-[#242424] bg-[#080808]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Results Header with Live Lifecycle Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-8 pb-4 border-b border-[#222222] gap-4">
          <div className="space-y-2">
            {/* Real Lifecycle Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#35C979]/40 bg-[#35C979]/10 px-2.5 py-0.5 text-xs font-semibold text-[#35C979]">
                <Check className="h-3 w-3" />
                Live Channel3 Results
              </span>

              {/* Meaningful Asynchronous AI State */}
              {isRankingAi ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6A00]/40 bg-[#FF6A00]/10 px-2.5 py-0.5 text-xs font-semibold text-[#FF8126]">
                  <Sparkles className="h-3 w-3 animate-spin text-[#FF6A00] motion-reduce:animate-none" />
                  <span>Comparing your best matches...</span>
                </span>
              ) : aiStatus === "complete" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6A00]/40 bg-[#FF6A00]/10 px-2.5 py-0.5 text-xs font-semibold text-[#FF8126]">
                  <Sparkles className="h-3 w-3 text-[#FF6A00]" />
                  <span>AI Ranked &amp; Compared</span>
                </span>
              ) : aiStatus === "unavailable" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#2b2b2b] bg-[#141414] px-2.5 py-0.5 text-[11px] text-[#888888]">
                  <span>Catalog View</span>
                </span>
              ) : null}

              {cached && (
                <span className="text-[10px] text-[#737373] font-mono bg-[#141414] px-2 py-0.5 rounded border border-[#222222]">
                  Cached Result
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F5F5]">
              Results for &ldquo;{query}&rdquo;
            </h2>

            <p className="text-xs text-[#A3A3A3]">
              Found {products.length} verified products
              {budget ? (
                <>
                  {" "}with starting prices under{" "}
                  <strong className="text-[#35C979] tabular-nums">
                    {formatCurrency(budget * 100, currency)}
                  </strong>
                </>
              ) : ""}
            </p>
          </div>

          <div className="shrink-0 text-left sm:text-right">
            <span className="text-[11px] text-[#737373] block">
              Direct Retailer Referral Flow
            </span>
            <span className="text-xs font-medium text-[#D4D4D4]">
              Authentic destination links &bull; No middleman fees
            </span>
          </div>
        </div>

        {/* Small non-blocking AI status message if Gemini was unavailable */}
        {aiStatus === "unavailable" && aiMessage && (
          <div className="mb-6 rounded-xl border border-[#282828] bg-[#121212] p-3 text-xs text-[#A3A3A3] flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-[#F5B942] shrink-0" />
            <span>{aiMessage}</span>
          </div>
        )}

        {/* AI Comparison Overview Banner (if provided by Gemini) */}
        {comparisonOverview && (
          <div className="mb-8 rounded-xl border border-[#FF6A00]/25 bg-[#12100e] p-4 text-xs text-[#D4D4D4] leading-relaxed flex items-start gap-3">
            <Sparkles className="h-4 w-4 text-[#FF8126] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-[#FF8126] block mb-0.5">SpendPilot Comparison:</span>
              <p>{comparisonOverview}</p>
            </div>
          </div>
        )}

        {/* Top AI Recommendations Section */}
        {hasRecommendations && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-5 pb-2.5 border-b border-[#222222]">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#FF8126]" />
                <h3 className="text-lg font-bold text-[#F5F5F5]">
                  Top AI Picks
                </h3>
                <span className="text-xs text-[#888888] hidden sm:inline">
                  &bull; Ranked by intent fit, verified specs, and budget value
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {topRecommendations.map((product) => (
                <ProductCard
                  key={product.sourceProductId || product.title}
                  product={product}
                />
              ))}
            </div>
          </div>
        )}

        {/* Other Matching Catalog Options / Standard Grid */}
        {secondaryProducts.length > 0 && (
          <div>
            {hasRecommendations && (
              <div className="flex items-center justify-between mb-5 pb-2.5 border-b border-[#222222]">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[#888888]" />
                  <h3 className="text-base sm:text-lg font-bold text-[#F5F5F5]">
                    Other Matching Options
                  </h3>
                </div>
                <span className="text-xs text-[#737373]">
                  {secondaryProducts.length} additional authentic catalog items
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {secondaryProducts.map((product) => (
                <ProductCard
                  key={product.sourceProductId || product.title}
                  product={product}
                />
              ))}
            </div>
          </div>
        )}

        {/* Transparent Policy & Merchant Notice */}
        <div className="mt-10 rounded-xl border border-[#222222] bg-[#0e0e0e] p-4 text-xs text-[#888888] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[#F5B942] shrink-0" />
            <span>
              Prices and merchant stock availability are retrieved via Channel3 and confirmed directly on each retailer&apos;s site.
            </span>
          </div>
          <span className="shrink-0 text-[11px] text-[#737373]">
            PayPal Sandbox checkout is reserved for the Demo Store catalog.
          </span>
        </div>
      </div>
    </section>
  );
}
