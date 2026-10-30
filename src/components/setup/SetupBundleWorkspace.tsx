"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  ArrowRightLeft,
  BookmarkCheck,
  Bookmark,
  Check,
  Cpu,
  Info,
  Sparkles,
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
  currency?: CurrencyCode;
}

export function SetupBundleWorkspace({
  bundle,
  requirements = [],
  categories = [],
  comparisons = [],
  onSelectProduct,
  onExpandCategoryRange,
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

  return (
    <div id="bundle-workspace" className="w-full max-w-5xl mx-auto my-10 animate-fadeIn">
      {/* Workspace Container */}
      <div className="rounded-3xl border border-[#303030] bg-[#0c0c0c] p-6 sm:p-8 shadow-2xl">
        
        {/* Workspace Banner & Status */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pb-6 border-b border-[#222222]">
          <div className="flex items-center gap-3.5">
            <div className="rounded-2xl bg-[#FF6A00] p-3 text-white shadow-lg shadow-[#FF6A00]/25">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-black text-[#F5F5F5] tracking-tight">
                  Recommended Multi-Product Setup
                </h2>
                {bundle.isComplete ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#35C979]/15 border border-[#35C979]/30 px-2.5 py-0.5 text-xs font-semibold text-[#35C979]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Complete Setup
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F5B942]/15 border border-[#F5B942]/30 px-2.5 py-0.5 text-xs font-semibold text-[#F5B942]">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Partially matched setup ({bundle.missingRequirements.length} Unfilled)
                  </span>
                )}
              </div>
              <p className="text-xs text-[#8E8E8E] mt-1">
                Every product is grounded in genuine Channel3 data. Switch alternatives to tailor your setup.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSavePlan}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#303030] bg-[#141414] px-4 py-2.5 text-xs font-semibold text-[#D4D4D4] hover:border-[#FF6A00]/60 hover:text-white transition-all focus:outline-none"
            >
              {savedSuccess ? (
                <>
                  <BookmarkCheck className="h-4 w-4 text-[#35C979]" />
                  <span className="text-[#35C979]">Plan Saved to Session</span>
                </>
              ) : (
                <>
                  <Bookmark className="h-4 w-4 text-[#FF6A00]" />
                  <span>Save Setup Plan</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Budget Financials Summary Cards */}
        <div className="my-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl border border-[#222222] bg-[#121212]">
            <span className="text-xs font-medium text-[#8E8E8E]">Total Setup Budget</span>
            <div className="text-2xl font-black text-[#F5F5F5] mt-1 tabular-nums">
              {formatMoney(bundle.totalBudgetMinor)}
            </div>
            <div className="text-[11px] text-[#555] mt-0.5">Enforced upper limit</div>
          </div>

          <div className="p-4 rounded-2xl border border-[#262626] bg-[#141414]">
            <span className="text-xs font-medium text-[#8E8E8E]">Product Subtotal</span>
            <div className="text-2xl font-black text-[#FF6A00] mt-1 tabular-nums">
              {formatMoney(bundle.productSubtotalMinor)}
            </div>
            <div className="text-[11px] text-[#35C979] mt-0.5 font-medium">
              Calculated on server ({bundle.items.length} items)
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-[#222222] bg-[#121212]">
            <span className="text-xs font-medium text-[#8E8E8E]">Remaining Budget</span>
            <div className="text-2xl font-black text-[#35C979] mt-1 tabular-nums">
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

        {/* Diversity Warnings Advisory */}
        {bundle.diversityWarnings && bundle.diversityWarnings.length > 0 && (
          <div className="mb-6 p-4 rounded-2xl border border-[#2a2a2a] bg-[#121212] text-xs text-[#D4D4D4] flex items-start gap-3">
            <Info className="h-4 w-4 text-[#69A8FF] shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-xs text-white">Bundle Theme &amp; Diversity Advisory</div>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-[#A3A3A3]">
                {bundle.diversityWarnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Missing Requirements Callout if Incomplete */}
        {!bundle.isComplete && bundle.missingRequirements.length > 0 && (
          <div className="mb-8 p-4 rounded-2xl border border-[#F5B942]/30 bg-[#F5B942]/10 text-xs text-[#F5B942] flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm">Partially Matched Setup Notice</div>
              <p className="mt-1 text-[#D4D4D4]">
                To maintain strict thematic fidelity, SpendPilot refused to substitute unrelated generic items for the following:
              </p>
              <ul className="list-disc list-inside mt-1.5 space-y-0.5 font-semibold text-[#F5B942]">
                {bundle.missingRequirements.map((reqName) => (
                  <li key={reqName}>{reqName}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Category by Category Recommendations & Unfulfilled Requirements */}
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
                  className="rounded-2xl border border-[#3a2818] bg-[#140f09] p-5 sm:p-6 transition-all"
                >
                  {/* Category Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#291b10]">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-5 w-5 rounded-full bg-[#F5B942]/20 text-[#F5B942] flex items-center justify-center text-xs font-bold">
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
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#F5B942] bg-[#F5B942]/10 border border-[#F5B942]/30 px-2.5 py-1 rounded-full">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        No Verified Theme Match
                      </span>
                    </div>
                  </div>

                  {/* Honest Unfulfilled Reason Callout */}
                  <div className="my-4 p-4 rounded-xl border border-[#443015] bg-[#1a1208] text-xs">
                    <p className="text-[#E5E5E5] leading-relaxed">
                      {comp?.recommendedReason ||
                        `No verified ${req.requiredFranchises?.join(" / ") || "thematic"} ${req.name} products were found within the ${formatMoney(req.allocatedAmountMinor)} allocation.`}
                    </p>
                    <p className="mt-2 text-[#A3A3A3] text-[11px]">
                      SpendPilot AI strict relevance gate refused unrelated items (e.g. generic solid colors or unrelated franchises) to protect your room theme.
                    </p>
                  </div>

                  {/* Explicit User Actions */}
                  <div className="mt-4 pt-4 border-t border-[#291b10]">
                    <div className="text-[11px] font-bold text-[#8E8E8E] uppercase tracking-wider mb-2.5">
                      Available Actions:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onExpandCategoryRange?.(req.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#383838] bg-[#1e1913] px-3 py-1.5 text-xs font-medium text-[#D4D4D4] hover:border-[#F5B942] hover:text-white transition-all"
                      >
                        <span>Search with alternative keywords</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onExpandCategoryRange?.(req.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#383838] bg-[#1e1913] px-3 py-1.5 text-xs font-medium text-[#D4D4D4] hover:border-[#F5B942] hover:text-white transition-all"
                      >
                        <span>Explore in another format</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onExpandCategoryRange?.(req.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#383838] bg-[#1e1913] px-3 py-1.5 text-xs font-medium text-[#D4D4D4] hover:border-[#F5B942] hover:text-white transition-all"
                      >
                        <span>Allow general anime decoration</span>
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#383838] bg-[#141414] px-3 py-1.5 text-xs font-medium text-[#8E8E8E] hover:text-white transition-all"
                      >
                        <span>Leave requirement unfilled</span>
                      </button>
                    </div>
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
                    {/* Relevance Badge */}
                    {item.relevanceBadge && (
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                          item.relevanceOutcome === "verified_substitute"
                            ? "text-[#38BDF8] bg-[#38BDF8]/10 border border-[#38BDF8]/30"
                            : "text-[#35C979] bg-[#35C979]/10 border border-[#35C979]/30"
                        }`}
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
                    <span className="text-[#FF6A00] font-bold">Why Recommended: </span>
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

                {/* The 2 Alternatives Side-by-Side (Max 2 distinct products) */}
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
                              <span className="inline-flex items-center gap-1 rounded-md bg-[#FF6A00] px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                                <Check className="h-3 w-3" />
                                Selected Choice
                              </span>
                            )}
                            {isAiRecommended && !isSelected && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-[#FF6A00]/20 border border-[#FF6A00]/40 px-2 py-0.5 text-[11px] font-semibold text-[#FF6A00]">
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
                            <span className="text-sm font-extrabold text-white tabular-nums">
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
                            <h4 className="text-xs font-bold text-[#F5F5F5] line-clamp-2 leading-snug">
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
                            <span className="text-xs text-[#35C979] font-semibold inline-flex items-center gap-1">
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
                              <span>Switch to this Option</span>
                            </button>
                          )}

                          <a
                            href={product.retailerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-[#8E8E8E] hover:text-[#FF6A00] transition-colors"
                          >
                            <span>View Store</span>
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

        {/* Footer Disclosures (Prompt Section 7) */}
        <div className="mt-8 rounded-2xl border border-[#242424] bg-[#0e0e0e] p-4 text-xs text-[#8E8E8E] space-y-2">
          <div className="flex items-center gap-2 text-[#D4D4D4] font-semibold">
            <ShieldAlert className="h-4 w-4 text-[#F5B942] shrink-0" />
            <span>Shipping & Tax Disclosures</span>
          </div>
          <p>{bundle.shippingNotice}</p>
          <p>{bundle.taxNotice}</p>
          <p className="text-[11px] text-[#666]">
            Every merchant link directs to the authorized vendor with genuine Channel3 tracking links. Prices and availability are re-confirmed on merchant checkout.
          </p>
        </div>
      </div>
    </div>
  );
}
