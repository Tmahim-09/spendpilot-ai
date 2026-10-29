"use client";

import React from "react";
import { ProductCard } from "./ProductCard";
import type { NormalizedProduct, CurrencyCode } from "@/types";
import { ShieldAlert, RefreshCw, ShoppingBag, Sparkles } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface LiveProductResultsProps {
  query: string | null;
  budget: number | null;
  currency: CurrencyCode;
  products: NormalizedProduct[];
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
  cached?: boolean;
}

export function LiveProductResults({
  query,
  budget,
  currency,
  products,
  isLoading,
  error,
  onRetry,
  cached = false,
}: LiveProductResultsProps) {
  // Skeleton loader cards
  if (isLoading) {
    return (
      <section id="search-results" className="py-12 sm:py-16 border-b border-[#242424] bg-[#090909]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-center justify-between pb-4 border-b border-[#222222]">
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#FF6A00] flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Searching Channel3 Product Catalog...
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-[#F5F5F5]">
                Finding products matching &ldquo;{query}&rdquo;
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="flex flex-col justify-between rounded-xl border border-[#222222] bg-[#101010] p-5 animate-pulse"
              >
                <div>
                  <div className="h-3 w-20 bg-[#1e1e1e] rounded mb-3" />
                  <div className="h-44 w-full bg-[#141414] rounded-lg mb-4" />
                  <div className="h-4 w-4/5 bg-[#1e1e1e] rounded mb-2" />
                  <div className="h-4 w-2/5 bg-[#1e1e1e] rounded mb-4" />
                  <div className="h-6 w-24 bg-[#262626] rounded mb-2" />
                </div>
                <div className="mt-6 pt-3 border-t border-[#1c1c1c]">
                  <div className="h-8 w-full bg-[#1e1e1e] rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Error state
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

  // No active search conducted yet
  if (!query) {
    return null;
  }

  // Zero results matching
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

  return (
    <section id="search-results" className="py-12 sm:py-16 border-b border-[#242424] bg-[#080808]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Results Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-8 pb-4 border-b border-[#222222] gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-[#35C979]/40 bg-[#35C979]/10 px-2.5 py-0.5 text-xs font-semibold text-[#35C979]">
                <Sparkles className="h-3 w-3" />
                Live Channel3 Discovery
              </span>
              {cached && (
                <span className="text-[10px] text-[#737373] font-mono bg-[#141414] px-2 py-0.5 rounded border border-[#222222]">
                  Cached Result
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F5F5]">
              Results for &ldquo;{query}&rdquo;
            </h2>

            <p className="mt-1 text-xs text-[#A3A3A3]">
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

          <div className="shrink-0 text-right">
            <span className="text-[11px] text-[#737373] block">
              Direct Retailer Referral Flow
            </span>
            <span className="text-xs font-medium text-[#D4D4D4]">
              Authentic destination links &bull; No middleman fees
            </span>
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {products.map((product) => (
            <ProductCard key={product.sourceProductId || product.title} product={product} />
          ))}
        </div>

        {/* Transparent Policy & Merchant Notice */}
        <div className="mt-8 rounded-xl border border-[#222222] bg-[#0e0e0e] p-4 text-xs text-[#888888] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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

