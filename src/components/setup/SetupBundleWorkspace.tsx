"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Layers,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  ArrowRightLeft,
  BookmarkCheck,
  Bookmark,
  Check,
  Cpu,
  Info,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";
import type {
  CurrencyCode,
  RecommendedBundle,
  SetupCategorySearchResult,
  SetupComparisonCategoryResult,
  SetupRequirementItem,
} from "@/types";

interface SetupBundleWorkspaceProps {
  bundle: RecommendedBundle;
  requirements: SetupRequirementItem[];
  categories: SetupCategorySearchResult[];
  comparisons: SetupComparisonCategoryResult[];
  onSelectProduct: (requirementId: string, productId: string) => void;
  onExpandCategoryRange?: (requirementId: string) => void;
  onAdjustRequirements?: () => void;
  currency?: CurrencyCode;
}

export function SetupBundleWorkspace({
  bundle,
  requirements = [],
  categories = [],
  comparisons = [],
  onSelectProduct,
  onExpandCategoryRange,
  onAdjustRequirements,
  currency = "USD",
}: SetupBundleWorkspaceProps) {
  const [savedSuccess, setSavedSuccess] = useState(false);

  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  const formatMoney = (minor: number) =>
    `${symbol}${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleSavePlan = () => {
    try {
      const planToSave = {
        timestamp: new Date().toISOString(),
        totalBudgetMinor: bundle.totalBudgetMinor,
        productSubtotalMinor: bundle.productSubtotalMinor,
        items: bundle.items.map((i) => ({
          requirementName: i.requirementName,
          title: i.selectedProduct.title,
          priceMinor: i.selectedProduct.priceMinor,
          retailerUrl: i.selectedProduct.retailerUrl,
        })),
      };
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("spendpilot_saved_setup", JSON.stringify(planToSave));
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch {
      // Ignore session storage errors
    }
  };

  const handleOpenAllOffers = () => {
    const urls = bundle.items
      .map((i) => i.selectedProduct.retailerUrl)
      .filter((url): url is string => Boolean(url && url.startsWith("http")));

    urls.forEach((url) => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
  };

  const getSubtleBadgeStyles = (outcome?: string) => {
    switch (outcome) {
      case "verified_same_franchise_substitute":
      case "verified_substitute":
        return "text-[#7BB0FF] bg-[#4B90FF]/10 border border-[#4B90FF]/25";
      case "general_anime_theme":
        return "text-[#C084FC] bg-[#A855F7]/10 border border-[#A855F7]/25";
      case "uncertain":
      case "unrelated":
        return "text-[#F5B942] bg-[#F5B942]/10 border border-[#F5B942]/25";
      case "direct_franchise_match":
      case "verified_character_match":
      case "verified_franchise_alias_match":
      case "direct_match":
      default:
        return "text-[#35C979] bg-[#35C979]/10 border border-[#35C979]/25";
    }
  };

  return (
    <div id="setup-workspace" className="w-full max-w-5xl mx-auto my-10 animate-fadeIn">
      {/* Workspace Container */}
      <div className="rounded-3xl border border-[#2b2b2b] bg-[#0c0c0c] p-6 sm:p-8 shadow-2xl">
        
        {/* Workspace Banner & Status */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pb-6 border-b border-[#222222]">
          <div className="flex items-center gap-3.5">
            <div className="rounded-2xl bg-[#FF6A00] p-3 text-white shadow-lg shadow-[#FF6A00]/25">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-bold text-[#F5F5F5] tracking-tight">
                  Recommended Multi-Product Setup
                </h2>
                {bundle.isComplete ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#35C979]/15 border border-[#35C979]/30 px-2.5 py-0.5 text-xs font-semibold text-[#35C979]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Complete Setup
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F5B942]/15 border border-[#F5B942]/30 px-2.5 py-0.5 text-xs font-semibold text-[#F5B942]">
                    <Info className="h-3.5 w-3.5" />
                    {bundle.items.length} of {bundle.items.length + bundle.missingRequirements.length} Matched
                  </span>
                )}
              </div>
              <p className="text-xs text-[#8E8E8E] mt-1">
                Every item is grounded in authentic retailer data. Switch alternatives below to tailor your setup.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {onAdjustRequirements && (
              <button
                type="button"
                onClick={onAdjustRequirements}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#303030] bg-[#141414] px-3.5 py-2 text-xs font-medium text-[#D4D4D4] hover:border-[#FF6A00]/60 hover:text-white transition-all focus:outline-none"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#A3A3A3]" />
                <span>Adjust requirements</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSavePlan}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#303030] bg-[#141414] px-3.5 py-2 text-xs font-medium text-[#D4D4D4] hover:border-[#FF6A00]/60 hover:text-white transition-all focus:outline-none"
            >
              {savedSuccess ? (
                <>
                  <BookmarkCheck className="h-3.5 w-3.5 text-[#35C979]" />
                  <span className="text-[#35C979]">Plan Saved</span>
                </>
              ) : (
                <>
                  <Bookmark className="h-3.5 w-3.5 text-[#FF6A00]" />
                  <span>Save setup</span>
                </>
              )}
            </button>

            {bundle.items.length > 0 && (
              <button
                type="button"
                onClick={handleOpenAllOffers}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF6A00] px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-[#FF8126] transition-all focus:outline-none"
              >
                <span>Open all retailer links</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Budget Financials Summary Cards */}
        <div className="my-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl border border-[#222222] bg-[#121212]">
            <span className="text-xs font-medium text-[#8E8E8E]">Total Setup Budget</span>
            <div className="text-2xl font-bold text-[#F5F5F5] mt-1 tabular-nums">
              {formatMoney(bundle.totalBudgetMinor)}
            </div>
            <div className="text-[11px] text-[#737373] mt-0.5">Enforced maximum limit</div>
          </div>

          <div className="p-4 rounded-2xl border border-[#2b2b2b] bg-[#141414]">
            <span className="text-xs font-medium text-[#8E8E8E]">Product Subtotal</span>
            <div className="text-2xl font-bold text-[#FF6A00] mt-1 tabular-nums">
              {formatMoney(bundle.productSubtotalMinor)}
            </div>
            <div className="text-[11px] text-[#35C979] mt-0.5 font-medium">
              Verified ({bundle.items.length} active item{bundle.items.length === 1 ? "" : "s"})
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-[#222222] bg-[#121212]">
            <span className="text-xs font-medium text-[#8E8E8E]">Remaining Budget</span>
            <div className="text-2xl font-bold text-[#35C979] mt-1 tabular-nums">
              {formatMoney(bundle.remainingBudgetMinor)}
            </div>
            <div className="text-[11px] text-[#737373] mt-0.5">Available for shipping / taxes</div>
          </div>
        </div>

        {/* Visual Budget Breakdown Indicator */}
        {bundle.largestBudgetItemName && (
          <div className="mb-8 p-3.5 rounded-xl border border-[#242424] bg-[#0f0f0f] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-[#A3A3A3]">
              <Info className="h-4 w-4 text-[#69A8FF] shrink-0" />
              <span>
                <strong>Budget Distribution:</strong> The largest allocation is{" "}
                <span className="text-white font-semibold">&ldquo;{bundle.largestBudgetItemName}&rdquo;</span> at{" "}
                <span className="text-[#FF6A00] font-bold tabular-nums">
                  {bundle.largestBudgetItemPercentage}%
                </span>{" "}
                of the total budget.
              </span>
            </div>
          </div>
        )}

        {/* Diversity Warnings Advisory (if any) */}
        {bundle.diversityWarnings && bundle.diversityWarnings.length > 0 && (
          <div className="mb-6 p-4 rounded-2xl border border-[#2a2a2a] bg-[#121212] text-xs text-[#D4D4D4] flex items-start gap-3">
            <Info className="h-4 w-4 text-[#69A8FF] shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-xs text-white">Bundle theme &amp; diversity note</div>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-[#A3A3A3]">
                {bundle.diversityWarnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Clean, Non-Alarming Incomplete Bundle State */}
        {!bundle.isComplete && bundle.missingRequirements.length > 0 && (
          <div className="mb-8 p-5 rounded-2xl border border-[#332b22] bg-[#14120f] text-xs text-[#D4D4D4] flex items-start gap-3.5">
            <div className="rounded-lg bg-[#FF6A00]/15 p-2 text-[#FF6A00] border border-[#FF6A00]/30 shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="font-semibold text-sm text-[#F5F5F5]">Some items still need a match.</div>
              <p className="text-xs text-[#A3A3A3] leading-relaxed">
                SpendPilot prioritized authentic, thematic matches and excluded unrelated generic items for:{" "}
                <span className="text-[#FF8126] font-medium">
                  {bundle.missingRequirements.join(", ")}
                </span>
                .
              </p>
              <div className="pt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="text-[#8E8E8E] py-1">Suggested steps:</span>
                <button
                  type="button"
                  onClick={onAdjustRequirements}
                  className="rounded-lg border border-[#333333] bg-[#1c1814] px-2.5 py-1 text-[#D4D4D4] hover:text-white hover:border-[#FF6A00]/50 transition-colors"
                >
                  Reallocate budget between items
                </button>
                <span className="rounded-lg border border-[#333333] bg-[#1c1814] px-2.5 py-1 text-[#A3A3A3]">
                  Search item individually in Single Product mode
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Category by Category Recommendations */}
        <div className="space-y-8">
          {(requirements.length > 0
            ? requirements
            : bundle.items.map((i) => ({
                id: i.requirementId,
                name: i.requirementName,
                allocatedAmountMinor: i.allocatedAmountMinor,
                requiredFranchises: undefined,
              }))
          ).map((req, catIdx) => {
            const item = bundle.items.find((i) => i.requirementId === req.id);
            const cat = categories.find((c) => c.requirementId === req.id);
            const comp = item?.comparison || comparisons.find((c) => c.requirementId === req.id);
            const alternatives = cat?.products || [];
            const isUnfulfilled = !item || comp?.unfulfilled || alternatives.length === 0;

            if (isUnfulfilled) {
              return (
                <div
                  key={req.id}
                  className="rounded-2xl border border-[#2b251f] bg-[#12100e] p-5 sm:p-6 transition-all"
                >
                  {/* Category Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#221c16]">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-5 w-5 rounded-full bg-[#FF6A00]/20 text-[#FF8126] flex items-center justify-center text-xs font-semibold">
                          {catIdx + 1}
                        </span>
                        <h3 className="text-base sm:text-lg font-bold text-[#F5F5F5]">
                          {req.name}
                        </h3>
                      </div>
                      <p className="text-xs text-[#8E8E8E] mt-0.5">
                        Target Allocation: {formatMoney(req.allocatedAmountMinor)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#A3A3A3] bg-[#1a1714] border border-[#2d241c] px-2.5 py-1 rounded-full">
                        Pending Match
                      </span>
                    </div>
                  </div>

                  {/* Clean Unfulfilled Explanation */}
                  <div className="my-4 p-4 rounded-xl border border-[#2d241c] bg-[#16120e] text-xs">
                    <p className="text-[#D4D4D4] leading-relaxed">
                      {comp?.recommendedReason ||
                        `No verified ${req.requiredFranchises?.join(" / ") || "matching"} ${req.name} items found within the ${formatMoney(req.allocatedAmountMinor)} allocation.`}
                    </p>
                    <p className="mt-2 text-[#8E8E8E] text-[11px]">
                      SpendPilot avoided generic substitutes to preserve your setup criteria.
                    </p>
                  </div>

                  {/* Actionable Suggestions */}
                  <div className="mt-4 pt-4 border-t border-[#221c16] flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-[#737373]">Actions:</span>
                    {onExpandCategoryRange && (
                      <button
                        type="button"
                        onClick={() => onExpandCategoryRange(req.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#333333] bg-[#1a1714] px-3 py-1.5 text-xs font-medium text-[#D4D4D4] hover:border-[#FF6A00] hover:text-white transition-all"
                      >
                        <span>Search with broader terms</span>
                      </button>
                    )}
                    {onAdjustRequirements && (
                      <button
                        type="button"
                        onClick={onAdjustRequirements}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#333333] bg-[#1a1714] px-3 py-1.5 text-xs font-medium text-[#D4D4D4] hover:border-[#FF6A00] hover:text-white transition-all"
                      >
                        <span>Reallocate budget</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={item.requirementId}
                className="rounded-2xl border border-[#242424] bg-[#101010] p-5 sm:p-6 transition-all hover:border-[#383838]"
              >
                {/* Category Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#1f1f1f]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-[#FF6A00]/20 text-[#FF6A00] flex items-center justify-center text-xs font-bold">
                        {catIdx + 1}
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-[#F5F5F5]">
                        {item.requirementName}
                      </h3>
                    </div>
                    <p className="text-xs text-[#737373] mt-0.5">
                      Budget Allocation: {formatMoney(item.allocatedAmountMinor)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Subtle Relevance Pill */}
                    {item.relevanceBadge && (
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full ${getSubtleBadgeStyles(
                          item.relevanceOutcome
                        )}`}
                      >
                        <Sparkles className="h-3 w-3" />
                        {item.relevanceBadge}
                      </span>
                    )}

                    {/* PC Build Compatibility Badge */}
                    {comp?.compatibilityStatus === "unverified" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#F5B942] bg-[#F5B942]/10 border border-[#F5B942]/30 px-2 py-0.5 rounded-full">
                        <Cpu className="h-3 w-3" />
                        Compatibility: Unverified Specs
                      </span>
                    )}
                    {comp?.compatibilityStatus === "verified" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#35C979] bg-[#35C979]/10 border border-[#35C979]/30 px-2 py-0.5 rounded-full">
                        <Check className="h-3 w-3" />
                        Socket &amp; Form Factor Verified
                      </span>
                    )}
                  </div>
                </div>

                {/* AI Rationale & Trade-offs */}
                <div className="my-4 p-3.5 rounded-xl border border-[#1d1d1d] bg-[#0c0c0c] text-xs">
                  <div className="text-[#D4D4D4] font-medium leading-relaxed">
                    <span className="text-[#FF6A00] font-semibold">Why Recommended: </span>
                    {comp?.recommendedReason}
                  </div>

                  {item.evidenceQuote && (
                    <div className="mt-2 text-[11px] text-[#A3A3A3] italic flex items-center gap-1.5">
                      <span className="text-[#35C979] font-medium not-italic">Verified evidence:</span>
                      &ldquo;{item.evidenceQuote}&rdquo; {item.evidenceField ? `(in ${item.evidenceField})` : ""}
                    </div>
                  )}

                  {comp?.tradeoffs && comp.tradeoffs.length > 0 && (
                    <div className="mt-2 text-[#8E8E8E] flex items-start gap-1.5">
                      <span className="text-[#F5B942] font-semibold shrink-0">Trade-offs:</span>
                      <span>{comp.tradeoffs.join("; ")}</span>
                    </div>
                  )}

                  {comp?.compatibilityNotes && (
                    <div className="mt-2 text-[#69A8FF] flex items-start gap-1.5">
                      <span className="font-semibold shrink-0">Compatibility note:</span>
                      <span>{comp.compatibilityNotes}</span>
                    </div>
                  )}
                </div>

                {/* The 2 Alternatives Side-by-Side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {alternatives.map((product) => {
                    const prodId = product.sourceProductId || product.title;
                    const isSelected = item.selectedProductId === prodId;
                    const isAiRecommended = comp?.recommendedProductId === prodId;

                    return (
                      <div
                        key={prodId}
                        className={`relative rounded-xl border p-4 transition-all flex flex-col justify-between ${
                          isSelected
                            ? "border-[#FF6A00] bg-[#161616] shadow-lg shadow-[#FF6A00]/10"
                            : "border-[#222222] bg-[#0c0c0c] hover:border-[#333333]"
                        }`}
                      >
                        {/* Top Product Badges */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-1.5">
                            {isSelected && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-[#FF6A00] px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                                <Check className="h-3 w-3" />
                                Selected Choice
                              </span>
                            )}
                            {isAiRecommended && !isSelected && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-[#FF6A00]/15 border border-[#FF6A00]/30 px-2 py-0.5 text-[11px] font-medium text-[#FF8126]">
                                Top AI Match
                              </span>
                            )}
                            {!isAiRecommended && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-[#222] border border-[#333] px-2 py-0.5 text-[11px] text-[#A3A3A3]">
                                Alternative Option
                              </span>
                            )}
                          </div>

                          <div className="text-right">
                            <span className="text-sm font-bold text-white tabular-nums">
                              {product.priceMinor !== null ? formatMoney(product.priceMinor) : "Unlisted"}
                            </span>
                          </div>
                        </div>

                        {/* Image & Title */}
                        <div className="flex gap-3 mb-3">
                          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[#2b2b2b] bg-[#111] p-1">
                            {product.imageUrl ? (
                              <Image
                                src={product.imageUrl}
                                alt={product.title}
                                fill
                                sizes="64px"
                                className="object-contain p-0.5"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-[#444] text-[10px]">
                                No Image
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-semibold text-[#F5F5F5] line-clamp-2 leading-snug">
                              {product.title}
                            </h4>
                            <p className="text-[11px] text-[#737373] mt-1">
                              Merchant: <span className="text-[#A3A3A3] font-medium">{product.retailerName}</span>
                            </p>
                          </div>
                        </div>

                        {/* Key Specs */}
                        {product.specifications && Object.keys(product.specifications).length > 0 && (
                          <div className="my-2 p-2 rounded-lg bg-[#111] border border-[#1e1e1e] text-[11px] text-[#8E8E8E] space-y-0.5">
                            {Object.entries(product.specifications).slice(0, 2).map(([k, v]) => (
                              <div key={k} className="flex justify-between">
                                <span className="text-[#666]">{k}:</span>
                                <span className="text-[#D4D4D4] font-medium truncate max-w-[180px]">{v}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Switch Action & Merchant Link */}
                        <div className="mt-3 pt-3 border-t border-[#1e1e1e] flex items-center justify-between gap-2">
                          {isSelected ? (
                            <span className="text-xs text-[#35C979] font-medium inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Active in Bundle
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSelectProduct(item.requirementId, prodId)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-1.5 text-xs font-medium text-[#D4D4D4] hover:border-[#FF6A00] hover:text-white transition-all"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5 text-[#FF6A00]" />
                              <span>Switch to this option</span>
                            </button>
                          )}

                          <a
                            href={product.retailerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-[#8E8E8E] hover:text-[#FF6A00] transition-colors"
                          >
                            <span>View retailer offer</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Disclosures */}
        <div className="mt-8 rounded-2xl border border-[#242424] bg-[#0e0e0e] p-4 text-xs text-[#8E8E8E] space-y-2">
          <div className="flex items-center gap-2 text-[#D4D4D4] font-semibold">
            <ShieldAlert className="h-4 w-4 text-[#F5B942] shrink-0" />
            <span>Shipping &amp; Tax Disclosures</span>
          </div>
          <p>{bundle.shippingNotice}</p>
          <p>{bundle.taxNotice}</p>
          <p className="text-[11px] text-[#666]">
            Every merchant link directs to the verified retailer. Prices and stock availability are confirmed on the retailer&apos;s site.
          </p>
        </div>
      </div>
    </div>
  );
}
