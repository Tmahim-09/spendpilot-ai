"use client";

import React from "react";
import { ProductCard } from "./ProductCard";
import type { NormalizedProduct, CurrencyCode, ShoppingPlanResponsePayload } from "@/types";
import {
  ShieldAlert,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Check,
  AlertCircle,
  HelpCircle,
  Cpu,
  Layers,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface LiveProductResultsProps {
  query: string | null;
  budget: number | null;
  currency: CurrencyCode;
  plan: ShoppingPlanResponsePayload | null;
  products: NormalizedProduct[];
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
  onSelectPrompt?: (promptText: string) => void;
  cached?: boolean;
}

export function LiveProductResults({
  query,
  budget,
  currency,
  plan,
  products,
  isLoading,
  error,
  onRetry,
  onSelectPrompt,
  cached = false,
}: LiveProductResultsProps) {
  // Skeleton loader cards with multi-step AI progress indicator
  if (isLoading) {
    return (
      <section id="search-results" className="py-12 sm:py-16 border-b border-[#242424] bg-[#090909]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 rounded-2xl border border-[#242424] bg-[#101010] p-6 text-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#1f1f1f]">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF6A00] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF6A00]" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#FF6A00]">
                  SpendPilot AI Engine Active
                </span>
              </div>
              <span className="text-xs text-[#737373]">
                Grounding with Gemini 3.8 &bull; Searching Channel3
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex items-center gap-2.5 rounded-lg bg-[#141414] border border-[#222222] p-3 text-xs">
                <Cpu className="h-4 w-4 text-[#FF8126] shrink-0 animate-pulse" />
                <div>
                  <span className="font-semibold text-[#F5F5F5] block">1. Interpreting Intent</span>
                  <span className="text-[11px] text-[#737373]">Extracting requirements & constraints</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-lg bg-[#141414] border border-[#222222] p-3 text-xs">
                <ShoppingBag className="h-4 w-4 text-[#69A8FF] shrink-0 animate-pulse" />
                <div>
                  <span className="font-semibold text-[#F5F5F5] block">2. Discovering Channel3 Offers</span>
                  <span className="text-[11px] text-[#737373]">Querying live retailer inventory</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-lg bg-[#141414] border border-[#222222] p-3 text-xs">
                <Sparkles className="h-4 w-4 text-[#35C979] shrink-0 animate-pulse" />
                <div>
                  <span className="font-semibold text-[#F5F5F5] block">3. Grounded Candidate Ranking</span>
                  <span className="text-[11px] text-[#737373]">Evaluating specs, fit & trade-offs</span>
                </div>
              </div>
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
                  Shopping Intelligence Unavailable
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
                    <span>Retry Request</span>
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

  // Intent clarification or non-shopping query banner
  const intent = plan?.intent;
  if (intent && (intent.needsClarification || !intent.isShoppingRequest)) {
    return (
      <section id="search-results" className="py-12 sm:py-16 border-b border-[#242424] bg-[#090909]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-[#F5B942]/30 bg-[#14120e] p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#F5B942]/40 bg-[#F5B942]/10 text-[#F5B942]">
                <HelpCircle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#F5B942]">
                    Clarification Needed
                  </span>
                  <h3 className="text-lg font-bold text-[#F5F5F5]">
                    Tell SpendPilot what you&apos;d like to purchase
                  </h3>
                </div>

                <p className="text-sm text-[#D4D4D4] leading-relaxed">
                  {intent.clarificationMessage ||
                    plan?.aiMessage ||
                    "SpendPilot AI helps you discover, compare, and verify real consumer products within your budget limits."}
                </p>

                <div className="pt-3 border-t border-[#24221c]">
                  <span className="text-xs font-medium text-[#A3A3A3] block mb-2">
                    Try starting with an example:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Reliable wireless mouse for university under $40",
                      "Mechanical keyboard with quiet switches under $80",
                      "Adjustable aluminum laptop stand under $35",
                      "Noise cancelling wireless headphones under $100",
                    ].map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => onSelectPrompt?.(example)}
                        className="rounded-lg border border-[#2b2923] bg-[#1a1814] px-3 py-1.5 text-xs text-[#D4D4D4] hover:border-[#FF6A00]/50 hover:text-[#FF8126] transition-colors"
                      >
                        &ldquo;{example}&rdquo;
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Derive products and recommendations
  const topRecommendations = plan?.topRecommendations || [];
  const otherMatches = plan?.otherMatches || (topRecommendations.length === 0 ? products : []);
  const allResultsCount = topRecommendations.length + otherMatches.length;

  // Zero results matching
  if (allResultsCount === 0) {
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

  const aiStatus = plan?.aiStatus || "complete";

  return (
    <section id="search-results" className="py-12 sm:py-16 border-b border-[#242424] bg-[#080808]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Fallback Notice when Gemini was unavailable */}
        {aiStatus === "partial" && plan?.aiMessage && (
          <div className="mb-6 rounded-xl border border-[#F5B942]/30 bg-[#F5B942]/10 p-4 text-xs text-[#D4D4D4] flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-[#F5B942] shrink-0" />
            <span>
              <strong>Direct Catalog Search Active:</strong> {plan.aiMessage} Real product offers and merchant links are fully available below.
            </span>
          </div>
        )}

        {/* AI Shopping Plan Summary Card */}
        <div className="mb-10 rounded-2xl border border-[#262626] bg-[#0e0e0e] p-5 sm:p-7 shadow-xl">
          {/* Top Status Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#1f1f1f]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6A00]/40 bg-[#FF6A00]/10 px-3 py-1 text-xs font-semibold text-[#FF8126]">
                <Sparkles className="h-3.5 w-3.5" />
                Gemini AI Shopping Plan
              </span>

              {aiStatus === "complete" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#35C979]/40 bg-[#35C979]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#35C979]">
                  <Check className="h-3 w-3" />
                  Grounded &amp; Ranked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#F5B942]/40 bg-[#F5B942]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#F5B942]">
                  <AlertCircle className="h-3 w-3" />
                  Channel3 Catalog Match
                </span>
              )}

              {cached && (
                <span className="text-[10px] text-[#737373] font-mono bg-[#141414] px-2 py-0.5 rounded border border-[#222222]">
                  Cached Result
                </span>
              )}
            </div>

            {intent?.category && (
              <span className="text-xs text-[#888888] font-medium">
                Category: <strong className="text-[#D4D4D4]">{intent.category}</strong>
              </span>
            )}
          </div>

          {/* Heading & AI Comparison Overview */}
          <div className="mt-4 space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F5F5]">
              {intent?.summary || `Shopping recommendations for "${query}"`}
            </h2>

            {plan?.comparisonOverview && (
              <p className="text-xs sm:text-sm text-[#A3A3A3] leading-relaxed max-w-4xl">
                {plan.comparisonOverview}
              </p>
            )}
          </div>

          {/* Extracted Constraints & Requirements Pills */}
          {intent && (
            <div className="mt-5 pt-4 border-t border-[#1a1a1a] flex flex-wrap items-center gap-2 text-xs">
              {intent.totalBudget !== null && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[#161616] border border-[#282828] px-2.5 py-1 text-[#D4D4D4]">
                  <span className="text-[#737373]">Budget Cap:</span>
                  <strong className="text-[#35C979] font-mono">
                    {formatCurrency(intent.totalBudget * 100, intent.currency)}
                  </strong>
                </span>
              )}

              {intent.maxItemPrice !== null && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[#161616] border border-[#282828] px-2.5 py-1 text-[#D4D4D4]">
                  <span className="text-[#737373]">Item Cap:</span>
                  <strong className="text-[#35C979] font-mono">
                    {formatCurrency(intent.maxItemPrice * 100, intent.currency)}
                  </strong>
                </span>
              )}

              {intent.mustHave.map((item, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md bg-[#141814] border border-[#35C979]/30 px-2.5 py-1 text-[#35C979]"
                >
                  <Check className="h-3 w-3" />
                  <span>Must have: {item}</span>
                </span>
              ))}

              {intent.preferences.map((item, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md bg-[#181614] border border-[#FF6A00]/30 px-2.5 py-1 text-[#FF8126]"
                >
                  <span>Prefers: {item}</span>
                </span>
              ))}

              {intent.excluded.map((item, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md bg-[#1c1414] border border-[#F05B5B]/30 px-2.5 py-1 text-[#F05B5B]"
                >
                  <span>Excludes: {item}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Section 1: Top AI Recommendations */}
        {topRecommendations.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-[#222222]">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#FF8126]" />
                  <h3 className="text-lg sm:text-xl font-bold text-[#F5F5F5]">
                    Top AI Recommendations
                  </h3>
                </div>
                <p className="text-xs text-[#888888]">
                  Ranked by Gemini against your intent, budget cap, and preferences.
                </p>
              </div>

              <span className="text-xs text-[#737373] hidden sm:block">
                Grounded in verified Channel3 specifications
              </span>
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

        {/* Section 2: Other Matching Catalog Options */}
        {otherMatches.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-[#222222]">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[#A3A3A3]" />
                  <h3 className="text-lg sm:text-xl font-bold text-[#F5F5F5]">
                    {topRecommendations.length > 0
                      ? "Other Matching Catalog Options"
                      : "Verified Channel3 Products"}
                  </h3>
                </div>
                <p className="text-xs text-[#888888]">
                  {topRecommendations.length > 0
                    ? `Showing ${otherMatches.length} additional authentic catalog items.`
                    : `Found ${otherMatches.length} products matching your criteria.`}
                </p>
              </div>

              <span className="text-xs text-[#737373] hidden sm:block">
                Direct Retailer Referral Flow
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {otherMatches.map((product) => (
                <ProductCard
                  key={product.sourceProductId || product.title}
                  product={product}
                />
              ))}
            </div>
          </div>
        )}

        {/* Transparent Policy & Merchant Notice */}
        <div className="mt-12 rounded-xl border border-[#222222] bg-[#0e0e0e] p-4 text-xs text-[#888888] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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
