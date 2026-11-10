"use client";

import React from "react";
import Image from "next/image";
import { ProductCard } from "./ProductCard";
import { AiComparisonWorkspace } from "@/components/comparison/AiComparisonWorkspace";
import type {
  NormalizedProduct,
  ProductOfferItem,
  CurrencyCode,
  AiProcessingStatus,
  AiComparisonResult,
  EvidenceFact,
} from "@/types";
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
  ArrowRight,
} from "lucide-react";
import { formatSafeBudget } from "@/lib/utils";

interface LiveProductResultsProps {
  query: string | null;
  budget: number | null;
  currency: CurrencyCode;
  products: NormalizedProduct[];
  comparison?: AiComparisonResult | null;
  evidenceFacts?: Record<string, EvidenceFact>;
  topRecommendations?: NormalizedProduct[];
  otherMatches?: NormalizedProduct[];
  isSearchingProducts: boolean;
  isRankingAi: boolean;
  isRefining?: boolean;
  aiStatus: AiProcessingStatus;
  aiMessage?: string | null;
  playfulNotice?: {
    message: string;
    suggestedProducts: string[];
  } | null;
  emptyInPreferredRange?: boolean;
  preferredRangeText?: string | null;
  isRangeExpanded?: boolean;
  onExpandRange?: () => void;
  error: string | null;
  onRetry?: () => void;
  onSearchAgain?: () => void;
  onRetryComparison?: () => void;
  onRefinePriority?: (priority: string) => void;
  onSelectPrompt?: (promptText: string) => void;
  cached?: boolean;
  onConfigureProduct?: (product: NormalizedProduct) => void;
  onSelectOffer?: (product: NormalizedProduct, offer: ProductOfferItem) => void;
  onSelectProduct?: (product: NormalizedProduct) => void;
  configuredProductIds?: Set<string>;
  selectedProductIds?: Set<string>;
}

export function LiveProductResults({
  query,
  budget,
  currency,
  products,
  comparison = null,
  evidenceFacts = {},
  topRecommendations = [],
  otherMatches = [],
  isSearchingProducts,
  isRankingAi,
  isRefining = false,
  aiStatus,
  aiMessage = null,
  playfulNotice = null,
  emptyInPreferredRange = false,
  preferredRangeText = null,
  isRangeExpanded = false,
  onExpandRange,
  error,
  onRetry,
  onSearchAgain,
  onRetryComparison,
  onRefinePriority,
  onSelectPrompt,
  cached = false,
  onConfigureProduct,
  onSelectOffer,
  onSelectProduct,
  configuredProductIds = new Set(),
  selectedProductIds = new Set(),
}: LiveProductResultsProps) {
  // State 1: Clearly Unrelated Prompt (Zero API calls made, instant witty response)
  if (playfulNotice) {
    return (
      <section
        id="products-showcase"
        aria-label="Assistant Response"
        className="py-10 sm:py-14 border-b border-orange-200/60 dark:border-[#221c29] bg-transparent scroll-mt-6"
      >
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-orange-300 dark:border-[#FF6A00]/40 bg-[#FFF8F2] dark:bg-[#121015] p-6 sm:p-8 shadow-xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#FF6A00]/40 bg-[#FF6A00]/15 text-[#FF8126]">
                <Bot className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-3 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#FF8126]">
                    SpendPilot Shopping Assistant
                  </span>
                  <span className="text-[10px] font-bold text-zinc-600 dark:text-[#A3A3A3] bg-white dark:bg-[#1a1622] px-2 py-0.5 rounded border border-orange-200 dark:border-[#2d241c]">
                    Commerce Mode
                  </span>
                </div>

                <p className="text-base sm:text-lg font-bold text-zinc-900 dark:text-[#F5F5F5] leading-snug">
                  &ldquo;{playfulNotice.message}&rdquo;
                </p>

                {playfulNotice.suggestedProducts.length > 0 && (
                  <div className="pt-3 border-t border-orange-200/60 dark:border-[#231e18]">
                    <span className="text-xs text-zinc-600 dark:text-[#A3A3A3] block mb-2 font-bold">
                      Try asking for real products within budget:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {playfulNotice.suggestedProducts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => onSelectPrompt?.(prompt)}
                          className="btn-3d-pill rounded-lg px-3 py-1.5 text-xs font-bold transition-colors"
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

  // State 2: Distinctive Single Animated Search-in-Progress (Clean purpose-built indicator)
  if (isSearchingProducts) {
    return (
      <section
        id="products-showcase"
        aria-label="Searching catalog"
        className="py-14 sm:py-20 border-b border-orange-200/60 dark:border-[#221c29] bg-transparent scroll-mt-6"
      >
        <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="rounded-3xl border border-orange-200 dark:border-[#2b2438] bg-white dark:bg-[#121015] p-8 sm:p-12 shadow-2xl relative overflow-hidden">
            <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF6A00]/15 motion-reduce:animate-none" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[#FF6A00]/40 bg-[#FFF8F2] dark:bg-[#161310] text-[#FF8126] shadow-lg shadow-[#FF6A00]/15">
                <Search className="h-7 w-7 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
              </div>
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6A00]/40 bg-[#FF6A00]/10 px-3 py-0.5 text-xs font-bold text-[#FF8126]">
                <Sparkles className="h-3 w-3" />
                Live Channel3 Discovery
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#F5F5F5]">
                Finding products that match your request...
              </h2>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-[#A1A1AA] max-w-md mx-auto">
                Discovering authentic merchant offers and pricing for &ldquo;{query}&rdquo;
              </p>
            </div>

            <div className="mt-8 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-[#1c1c1c]">
              <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-[#FF6A00]/20 via-[#FF6A00] to-[#FF6A00]/20 animate-pulse motion-reduce:animate-none mx-auto" />
            </div>

            <div className="mt-4 text-[11px] font-bold text-zinc-500 dark:text-[#888888]">
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
      <section id="products-showcase" className="py-12 sm:py-16 border-b border-orange-200/60 dark:border-[#221c29] bg-transparent scroll-mt-6">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-[#F05B5B]/30 bg-[#F05B5B]/10 p-6 text-sm">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-[#F05B5B] shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1 space-y-2">
                <h3 className="font-bold text-zinc-900 dark:text-[#F5F5F5] text-base">
                  Product Search Unavailable
                </h3>
                <p className="text-xs text-zinc-600 dark:text-[#D4D4D4]">{error}</p>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="btn-3d-secondary px-4 py-2 text-xs font-bold rounded-xl mt-2"
                  >
                    <span>Try again</span>
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
    if (emptyInPreferredRange) {
      return (
        <section id="products-showcase" className="py-12 sm:py-16 border-b border-orange-200/60 dark:border-[#221c29] bg-transparent scroll-mt-6">
          <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 text-center">
            <div className="rounded-3xl border border-orange-300 dark:border-[#FF6A00]/40 bg-[#FFF8F2] dark:bg-[#121015] p-8 sm:p-12 shadow-2xl relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(255,106,0,0.12),rgba(0,0,0,0))]"
                aria-hidden="true"
              />
              <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#FF6A00]/40 bg-[#FFF3E8] dark:bg-[#1e150f] text-[#FF8126] mb-4 shadow-lg shadow-[#FF6A00]/15">
                <ShoppingBag className="h-7 w-7" aria-hidden="true" />
              </div>
              <span className="relative inline-flex items-center gap-1.5 rounded-full border border-[#FF6A00]/40 bg-[#FF6A00]/10 px-3 py-1 text-xs font-bold text-[#FF8126] mb-3">
                <Sparkles className="h-3 w-3" />
                Budget Targeting
              </span>
              <h3 className="relative text-xl sm:text-2xl font-bold text-zinc-900 dark:text-[#F5F5F5] mb-2">
                No suitable products found in your preferred {preferredRangeText || "near-budget"} range
              </h3>
              <p className="relative text-xs sm:text-sm text-zinc-600 dark:text-[#A3A3A3] max-w-md mx-auto mb-6 leading-relaxed">
                SpendPilot prioritizes quality products near your budget limit. If you want to see all verified options under your maximum budget, expand the range below.
              </p>
              <div className="relative flex flex-wrap items-center justify-center gap-3">
                {onExpandRange && (
                  <button
                    type="button"
                    onClick={onExpandRange}
                    className="btn-3d-primary px-5 py-2.5 text-xs sm:text-sm font-bold rounded-xl"
                  >
                    <span>Expand price range</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="btn-3d-secondary px-4 py-2.5 text-xs font-bold rounded-xl"
                  >
                    <span>Edit your request</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section id="products-showcase" className="py-12 sm:py-16 border-b border-orange-200/60 dark:border-[#221c29] bg-transparent scroll-mt-6">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="rounded-3xl border border-orange-200 dark:border-[#2a2436] bg-white dark:bg-[#121015] p-8 sm:p-12 shadow-md">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-orange-200 dark:border-[#30283c] bg-[#FFF8F2] dark:bg-[#1a1622] text-[#FF8126] mb-4">
              <ShoppingBag className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-[#F5F5F5] mb-2">
              No matching products found
            </h3>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-[#A3A3A3] max-w-md mx-auto mb-6">
              We couldn&apos;t find verified products matching &ldquo;{query}&rdquo;
              {budget ? ` under ${formatSafeBudget(budget, currency)}` : ""}. Try using broader search terms or increasing your budget limit.
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="btn-3d-secondary px-4 py-2 text-xs font-bold rounded-xl"
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
  const rawProducts =
    products.length > 0
      ? products
      : topRecommendations.length > 0
      ? [...topRecommendations, ...otherMatches]
      : [];

  // Strict deduplication by canonical identity to prevent duplicate React keys
  const seenIds = new Set<string>();
  const displayProducts = rawProducts.filter((product) => {
    const id = product.sourceProductId || product.title;
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  return (
    <section id="products-showcase" aria-label="Products Showcase" className="py-12 sm:py-16 border-b border-orange-200/60 dark:border-[#221c29] bg-transparent scroll-mt-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Results Header with Live Lifecycle Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between pb-4 border-b border-orange-200/80 dark:border-[#222222] gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#35C979]/40 bg-[#35C979]/10 px-2.5 py-0.5 text-xs font-semibold text-[#35C979]">
                <Check className="h-3 w-3" />
                Live Channel3 Results
              </span>

              {/* Asynchronous AI State Badge */}
              {isRankingAi ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6A00]/40 bg-[#FF6A00]/10 px-2.5 py-0.5 text-xs font-semibold text-[#FF8126]">
                  <div className="relative h-3.5 w-3.5 shrink-0">
                    <Image
                      src="/logo/SpendPilotLOGO.png"
                      alt=""
                      width={14}
                      height={14}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <span>Comparing your best matches across key criteria...</span>
                </span>
              ) : comparison && aiStatus === "complete" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6A00]/40 bg-[#FF6A00]/10 px-2.5 py-0.5 text-xs font-semibold text-[#FF8126]">
                  <Sparkles className="h-3 w-3 text-[#FF6A00]" />
                  <span>AI Comparison Ready</span>
                </span>
              ) : aiStatus === "unavailable" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 dark:border-[#2b2b2b] bg-orange-50 dark:bg-[#141414] px-2.5 py-0.5 text-[11px] text-zinc-600 dark:text-[#888888]">
                  <span>Catalog View</span>
                </span>
              ) : null}

              {cached && (
                <span className="text-[10px] text-zinc-500 dark:text-[#737373] font-mono bg-orange-50/70 dark:bg-[#141414] px-2 py-0.5 rounded border border-orange-200 dark:border-[#222222]">
                  Cached Result
                </span>
              )}

              {isRangeExpanded && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6A00]/40 bg-[#FF6A00]/10 px-2.5 py-0.5 text-xs font-semibold text-[#FF8126]">
                  <span>Expanded Price Range (All items &le; {formatSafeBudget(budget, currency)})</span>
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#F5F5F5]">
              Your best matches for &ldquo;{query}&rdquo;
            </h2>

            <p className="text-xs text-zinc-600 dark:text-[#A3A3A3]">
              Found {products.length} verified products
              {budget ? (
                <>
                  {" "}with starting prices under{" "}
                  <strong className="text-[#35C979] tabular-nums">
                    {formatSafeBudget(budget, currency)}
                  </strong>
                </>
              ) : ""}
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("spendpilot-chat-workspace");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="btn-3d-secondary px-3.5 py-2 text-xs font-bold rounded-xl"
            >
              <span>Back to Chat &uarr;</span>
            </button>
            {onSearchAgain && (
              <button
                type="button"
                onClick={onSearchAgain}
                className="btn-3d-secondary px-3.5 py-2 text-xs font-bold rounded-xl gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5 text-[#FF6A00]" />
                <span>Search Again</span>
              </button>
            )}
            <div className="hidden sm:block text-right">
              <span className="text-[11px] text-zinc-500 dark:text-[#737373] block">
                Direct Retailer Referral
              </span>
              <span className="text-xs font-bold text-zinc-700 dark:text-[#D4D4D4]">
                Authentic destination links &bull; Real merchant stock
              </span>
            </div>
          </div>
        </div>

        {/* Non-blocking AI status message if Gemini was unavailable */}
        {aiStatus === "unavailable" && (
          <div className="rounded-xl border border-orange-200 dark:border-[#282828] bg-[#FFF9F3] dark:bg-[#121212] p-4 text-xs text-zinc-600 dark:text-[#A3A3A3] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 text-[#F5B942] shrink-0" />
              <span>{aiMessage || "AI comparison is temporarily unavailable. Showing verified catalog matches directly."}</span>
            </div>
            {onRetryComparison && (
              <button
                type="button"
                onClick={onRetryComparison}
                className="btn-3d-secondary px-3 py-1.5 text-xs font-bold rounded-xl gap-1.5"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Retry AI Comparison</span>
              </button>
            )}
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            PRIMARY EXPERIENCE: THE AI COMPARISON WORKSPACE
           ───────────────────────────────────────────────────────────── */}
        {comparison && aiStatus === "complete" && (
          <AiComparisonWorkspace
            query={query}
            budget={budget}
            currency={currency}
            comparison={comparison}
            evidenceFacts={evidenceFacts}
            products={products}
            isRefining={isRefining}
            onRefinePriority={onRefinePriority || (() => {})}
            onConfigureProduct={onConfigureProduct}
            configuredProductIds={configuredProductIds}
          />
        )}

        {/* ─────────────────────────────────────────────────────────────
            SUPPORTING EXPERIENCE: PRODUCT DETAILS & RETAILER OFFERS
           ───────────────────────────────────────────────────────────── */}
        <section aria-label="Product details and retailer offers" className="space-y-6 pt-6 border-t border-orange-200/80 dark:border-[#1e1e1e]">
          <div className="flex items-center justify-between pb-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#FF6A00] dark:text-[#888888]" />
                <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-[#F5F5F5]">
                  {comparison && aiStatus === "complete" ? "Product Details & Retailer Offers" : "Verified Retailer Offers"}
                </h3>
              </div>
              <p className="text-xs text-zinc-500 dark:text-[#737373]">
                Direct links to verified merchant stores &bull; Prices and stock confirmed at merchant checkout
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {displayProducts.map((product) => {
              const id = product.sourceProductId || product.title;
              return (
                <ProductCard
                  key={id}
                  product={product}
                  budget={budget}
                  currency={currency}
                  onConfigure={onConfigureProduct}
                  onSelectOffer={onSelectOffer}
                  onSelectProduct={onSelectProduct}
                  isConfigured={configuredProductIds.has(id)}
                  isSelected={selectedProductIds.has(id)}
                />
              );
            })}
          </div>
        </section>

        {/* Transparent Policy & Merchant Notice */}
        <div className="rounded-xl border border-orange-200 dark:border-[#222222] bg-[#FFF9F3] dark:bg-[#0e0e0e] p-4 text-xs text-zinc-600 dark:text-[#888888] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[#F5B942] shrink-0" />
            <span>
              Prices and merchant stock availability are retrieved via Channel3 and confirmed directly on each retailer&apos;s site.
            </span>
          </div>
          <span className="shrink-0 text-[11px] text-zinc-500 dark:text-[#737373]">
            Direct merchant referral links &bull; No markups or hidden fees
          </span>
        </div>
      </div>
    </section>
  );
}
