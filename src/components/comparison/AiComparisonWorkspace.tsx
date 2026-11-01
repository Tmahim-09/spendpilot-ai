"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  Tag,
  ArrowRight,
  RefreshCw,
  SlidersHorizontal,
  Info,
  Check,
  ShoppingBag,
  Award,
} from "lucide-react";
import type {
  AiComparisonResult,
  NormalizedProduct,
  EvidenceFact,
  CurrencyCode,
  AssessmentRating,
} from "@/types";
import { formatCurrency, formatSafeBudget } from "@/lib/utils";

interface AiComparisonWorkspaceProps {
  query: string;
  budget: number | null;
  currency: CurrencyCode;
  comparison: AiComparisonResult;
  evidenceFacts?: Record<string, EvidenceFact>;
  products: NormalizedProduct[];
  isRefining?: boolean;
  onRefinePriority: (priorityText: string) => void;
  onResetSearch?: () => void;
  onConfigureProduct?: (product: NormalizedProduct) => void;
  configuredProductIds?: Set<string>;
}

export function AiComparisonWorkspace({
  query,
  budget,
  currency,
  comparison,
  evidenceFacts = {},
  products,
  isRefining = false,
  onRefinePriority,
  onConfigureProduct,
  configuredProductIds = new Set(),
}: AiComparisonWorkspaceProps) {
  const [customPriority, setCustomPriority] = useState("");
  const [activePriority, setActivePriority] = useState<string | null>(null);

  // Map products by ID for fast lookup
  const productMap = new Map<string, NormalizedProduct>();
  products.forEach((p) => {
    const id = p.sourceProductId || p.title;
    productMap.set(id, p);
  });

  // Shortlist of candidate products evaluated in comparison (up to 6)
  const candidateIds = Array.from(
    new Set([
      comparison.bestMatchProductId,
      ...comparison.criteria.flatMap((c) => c.assessments.map((a) => a.productId)),
      ...comparison.alternativePicks.map((a) => a.productId),
    ])
  ).filter(Boolean);

  const comparedProducts = candidateIds
    .map((id) => productMap.get(id))
    .filter((p): p is NormalizedProduct => Boolean(p));

  const bestMatch = productMap.get(comparison.bestMatchProductId) || comparedProducts[0];

  // Best match trade-off
  const bestMatchTradeoff = comparison.tradeoffs.find(
    (t) => t.productId === comparison.bestMatchProductId
  );

  // Cited evidence facts for the best match
  const bestMatchFactIds = new Set<string>();
  comparison.criteria.forEach((c) => {
    c.assessments
      .filter((a) => a.productId === comparison.bestMatchProductId)
      .forEach((a) => {
        a.evidenceFactIds.forEach((fId) => bestMatchFactIds.add(fId));
      });
  });

  const bestMatchEvidence = Array.from(bestMatchFactIds)
    .map((fId) => evidenceFacts[fId])
    .filter(Boolean);

  // Natural priority refinement presets
  const refinementPresets = [
    { label: "Lowest Price", value: "Prioritize lowest verified offer price" },
    { label: "Comfort & Quality", value: "Prioritize build quality, materials, and comfort" },
    { label: "Battery & Efficiency", value: "Prioritize long battery life and energy efficiency" },
    { label: "Portability & Travel", value: "Prioritize lightweight compact design for travel" },
  ];

  const handleApplyPriority = (val: string) => {
    setActivePriority(val);
    onRefinePriority(val);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customPriority.trim()) {
      handleApplyPriority(customPriority.trim());
      setCustomPriority("");
    }
  };

  return (
    <div className="space-y-10">
      {/* ─────────────────────────────────────────────────────────────
          SECTION A: USER REQUIREMENT & INTERACTIVE REFINEMENT PANEL
         ───────────────────────────────────────────────────────────── */}
      <section
        aria-label="Comparison summary and priority controls"
        className="rounded-2xl border border-[#2b2b2b] bg-[#0d0d0d] p-6 shadow-xl"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-6 border-b border-[#202020]">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6A00]/40 bg-[#FF6A00]/10 px-3 py-1 text-xs font-semibold text-[#FF8126]">
                <Sparkles className="h-3.5 w-3.5 text-[#FF6A00]" />
                AI Comparison Workspace
              </span>
              {budget && (
                <span className="text-xs text-[#35C979] bg-[#141c14] border border-[#35C979]/30 px-2.5 py-0.5 rounded-full font-mono font-medium">
                  Budget: {formatSafeBudget(budget, currency)}
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F5F5]">
              {comparison.summary}
            </h2>

            {comparison.priorityInterpretation.length > 0 && (
              <p className="text-xs sm:text-sm text-[#A3A3A3]">
                Evaluated for &ldquo;{query}&rdquo; &bull; Key criteria:{" "}
                <span className="text-[#D4D4D4] font-medium">
                  {comparison.priorityInterpretation.join(" • ")}
                </span>
              </p>
            )}
          </div>

          {/* Interactive Priority Refinement Controls */}
          <div className="shrink-0 space-y-2">
            <span className="text-xs font-medium text-[#737373] flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#FF6A00]" />
              Refine comparison priorities without searching again:
            </span>

            <div className="flex flex-wrap gap-2">
              {refinementPresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={isRefining}
                  onClick={() => handleApplyPriority(preset.value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                    activePriority === preset.value
                      ? "border-[#FF6A00] bg-[#FF6A00]/20 text-[#FF8126] ring-1 ring-[#FF6A00]"
                      : "border-[#2b2b2b] bg-[#141414] text-[#D4D4D4] hover:border-[#FF6A00]/50 hover:text-[#F5F5F5]"
                  } disabled:opacity-50`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleCustomSubmit} className="flex gap-2 pt-1">
              <input
                type="text"
                value={customPriority}
                onChange={(e) => setCustomPriority(e.target.value)}
                placeholder="Or enter a custom priority (e.g. 'durability')..."
                className="flex-1 rounded-lg border border-[#2b2b2b] bg-[#141414] px-3 py-1.5 text-xs text-[#F5F5F5] placeholder-[#666666] focus:border-[#FF6A00] focus:outline-none"
                disabled={isRefining}
              />
              <button
                type="submit"
                disabled={isRefining || !customPriority.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-[#242424] px-3 py-1.5 text-xs font-semibold text-[#F5F5F5] hover:bg-[#333333] hover:text-[#FF8126] transition-colors disabled:opacity-40"
              >
                {isRefining ? <RefreshCw className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                <span>Re-evaluate</span>
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION B: TOP RECOMMENDATION VERDICT PANEL
         ───────────────────────────────────────────────────────────── */}
      {bestMatch && (
        <section
          aria-label="Top recommendation verdict"
          className="rounded-2xl border border-[#FF6A00]/50 bg-gradient-to-b from-[#14110e] to-[#0d0d0d] p-6 sm:p-8 shadow-2xl shadow-[#FF6A00]/10 ring-1 ring-[#FF6A00]/20"
        >
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#29221b]">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FF6A00] text-black">
                <Award className="h-4 w-4" />
              </span>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF8126] block">
                  Top Recommendation
                </span>
                <span className="text-xs text-[#A3A3A3]">
                  Selected as the strongest overall fit based on verified merchant specifications and price
                </span>
              </div>
            </div>

            <span className="rounded-full border border-[#35C979]/40 bg-[#35C979]/10 px-3 py-1 text-xs font-semibold text-[#35C979] flex items-center gap-1">
              <Check className="h-3.5 w-3.5" />
              Best Overall Match
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Product hero */}
            <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-[#2b251f] bg-[#100e0c] p-5 shadow-lg">
              <div>
                <div className="relative mb-4 flex h-52 w-full items-center justify-center overflow-hidden rounded-lg bg-[#080808] p-3 border border-[#201c18]">
                  {bestMatch.imageUrl ? (
                    <Image
                      src={bestMatch.imageUrl}
                      alt={bestMatch.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 40vw"
                      className="object-contain p-2"
                      loading="lazy"
                    />
                  ) : (
                    <ShoppingBag className="h-12 w-12 text-[#444444]" />
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-[#A3A3A3] mb-1">
                  <Tag className="h-3 w-3 text-[#FF6A00]" />
                  <span>{bestMatch.brand || bestMatch.retailerName || "Verified Brand"}</span>
                </div>

                <h3 className="text-base sm:text-lg font-bold text-[#F5F5F5] leading-snug mb-3">
                  {bestMatch.title}
                </h3>

                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-2xl font-bold text-[#F5F5F5] tabular-nums">
                    {bestMatch.priceMinor !== null
                      ? formatCurrency(bestMatch.priceMinor, bestMatch.currency || currency)
                      : "Price at merchant"}
                  </span>
                  <span className="text-xs text-[#737373]">
                    sold by {bestMatch.retailerName || "Verified Retailer"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {onConfigureProduct && (
                  <button
                    type="button"
                    onClick={() => onConfigureProduct(bestMatch)}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                      configuredProductIds.has(bestMatch.sourceProductId || bestMatch.title)
                        ? "border border-[#35C979]/40 bg-[#35C979]/15 text-[#35C979] hover:bg-[#35C979]/20"
                        : "border border-[#FF6A00]/50 bg-[#161310] text-[#FF8126] hover:bg-[#FF6A00]/20"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>
                      {configuredProductIds.has(bestMatch.sourceProductId || bestMatch.title)
                        ? "Configuration Verified ✓"
                        : "Configure Options (Size / Color)"}
                    </span>
                  </button>
                )}

                <a
                  href={bestMatch.retailerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#FF6A00] px-4 py-2.5 text-xs font-semibold text-white shadow hover:bg-[#FF8126] transition-all focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
                >
                  <span>View retailer offer</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            {/* Right Column: Grounded Decision Rationale */}
            <div className="lg:col-span-7 space-y-6">
              {/* Why it matches better than alternatives */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-[#FF8126] flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#35C979]" />
                  Why SpendPilot recommends this option
                </h4>
                <p className="text-sm text-[#D4D4D4] leading-relaxed bg-[#161310] p-4 rounded-xl border border-[#2b241c]">
                  {comparison.bestMatchReason}
                </p>
              </div>

              {/* Verified Evidence Claims Cited */}
              {bestMatchEvidence.length > 0 && (
                <div className="space-y-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#888888] block">
                    Verified features &amp; specs:
                  </span>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {bestMatchEvidence.slice(0, 6).map((fact) => (
                      <li
                        key={fact.id}
                        className="flex items-start gap-2 rounded-lg border border-[#242424] bg-[#121212] p-2.5"
                      >
                        <Check className="h-3.5 w-3.5 text-[#35C979] shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-[#F5F5F5] block font-medium">{fact.label}</strong>
                          <span className="text-[#A3A3A3] line-clamp-2">{fact.value}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Trade-off Warning / Considerations */}
              {bestMatchTradeoff && (
                <div className="rounded-xl border border-[#F5B942]/30 bg-[#161410] p-4 text-xs text-[#D4D4D4]">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-[#F5B942] shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-[#F5B942] font-semibold block mb-0.5">
                        Trade-off to consider:
                      </strong>
                      <p className="leading-relaxed">{bestMatchTradeoff.summary}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION C: RESPONSIVE SIDE-BY-SIDE COMPARISON TABLE
         ───────────────────────────────────────────────────────────── */}
      {comparison.criteria.length > 0 && comparedProducts.length >= 2 && (
        <section
          aria-label="Side-by-side comparison matrix"
          className="rounded-2xl border border-[#2b2b2b] bg-[#0d0d0d] p-6 shadow-xl space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-[#202020]">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-[#F5F5F5]">
                Side-by-side comparison
              </h3>
              <p className="text-xs text-[#888888]">
                Comparing verified features and prices across {comparedProducts.length} candidate options
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#737373]">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#35C979]" /> Strong
              </span>
              <span className="flex items-center gap-1">
                <Info className="h-3.5 w-3.5 text-[#69A8FF]" /> Partial
              </span>
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-[#F5B942]" /> Weak
              </span>
              <span className="flex items-center gap-1">
                <HelpCircle className="h-3.5 w-3.5 text-[#737373]" /> Unspecified
              </span>
            </div>
          </div>

          {/* Accessible Table Wrapper with Horizontal Scroll */}
          <div
            tabIndex={0}
            role="region"
            aria-label="Product comparison table"
            className="overflow-x-auto rounded-xl border border-[#222222] bg-[#0a0a0a] focus:outline-none focus:ring-1 focus:ring-[#FF6A00]"
          >
            <table className="w-full text-left border-collapse text-xs">
              <caption className="sr-only">
                Comparison of candidate products across key criteria
              </caption>
              <thead>
                <tr className="border-b border-[#222222] bg-[#121212]">
                  <th
                    scope="col"
                    className="p-4 font-semibold text-[#888888] uppercase tracking-wider min-w-[180px] w-1/4 sticky left-0 bg-[#121212] z-10 border-r border-[#222222]"
                  >
                    Criteria / Specifications
                  </th>
                  {comparedProducts.map((p) => {
                    const id = p.sourceProductId || p.title;
                    const isWinner = id === comparison.bestMatchProductId;
                    return (
                      <th
                        key={id}
                        scope="col"
                        className={`p-4 min-w-[220px] align-top ${
                          isWinner ? "bg-[#181410] border-t-2 border-t-[#FF6A00]" : ""
                        }`}
                      >
                        <div className="space-y-1.5">
                          {isWinner && (
                            <span className="inline-flex items-center gap-1 rounded bg-[#FF6A00]/20 text-[#FF8126] px-2 py-0.5 text-[10px] font-bold uppercase">
                              <Award className="h-3 w-3" /> Best Match
                            </span>
                          )}
                          <div className="font-bold text-[#F5F5F5] line-clamp-2 leading-snug">
                            {p.title}
                          </div>
                          <div className="font-mono text-sm text-[#35C979] font-bold">
                            {p.priceMinor !== null
                              ? formatCurrency(p.priceMinor, p.currency || currency)
                              : "Check merchant"}
                          </div>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c1c1c]">
                {/* Row 1: Objective Starting Price & Retailer */}
                <tr className="hover:bg-[#111111] transition-colors">
                  <th
                    scope="row"
                    className="p-4 font-medium text-[#D4D4D4] sticky left-0 bg-[#0a0a0a] z-10 border-r border-[#222222]"
                  >
                    Verified Starting Price
                  </th>
                  {comparedProducts.map((p) => {
                    const id = p.sourceProductId || p.title;
                    return (
                      <td key={id} className="p-4 align-top">
                        <span className="font-semibold text-[#F5F5F5] block">
                          {p.priceMinor !== null
                            ? formatCurrency(p.priceMinor, p.currency || currency)
                            : "At retailer"}
                        </span>
                        <span className="text-[#737373] text-[11px]">
                          via {p.retailerName || "Merchant"} ({p.offersCount || 1} offer{p.offersCount === 1 ? "" : "s"})
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Rows 2..N: Dynamic Evaluated Criteria */}
                {comparison.criteria.map((criterion, idx) => (
                  <tr key={idx} className="hover:bg-[#111111] transition-colors">
                    <th
                      scope="row"
                      className="p-4 font-medium text-[#D4D4D4] sticky left-0 bg-[#0a0a0a] z-10 border-r border-[#222222]"
                    >
                      <div className="space-y-1">
                        <span className="block font-semibold text-[#F5F5F5]">{criterion.name}</span>
                        <span className="text-[10px] uppercase font-bold text-[#737373] px-1.5 py-0.5 rounded bg-[#161616] inline-block">
                          {criterion.importance} Priority
                        </span>
                      </div>
                    </th>
                    {comparedProducts.map((p) => {
                      const id = p.sourceProductId || p.title;
                      const assessmentObj = criterion.assessments.find((a) => a.productId === id);
                      return (
                        <td key={id} className="p-4 align-top">
                          {assessmentObj ? (
                            <div className="space-y-1.5">
                              <AssessmentBadge rating={assessmentObj.assessment} />
                              <p className="text-[#A3A3A3] text-xs leading-relaxed">
                                {assessmentObj.reason}
                              </p>
                              {assessmentObj.evidenceFactIds.length > 0 && (
                                <div className="space-y-1 pt-1">
                                  {assessmentObj.evidenceFactIds.map((fId) => {
                                    const fact = evidenceFacts[fId];
                                    if (!fact) return null;
                                    return (
                                      <span
                                        key={fId}
                                        className="inline-block text-[10px] text-[#888888] bg-[#141414] border border-[#242424] px-1.5 py-0.5 rounded"
                                      >
                                        Fact: {fact.label}: {fact.value}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[#555555]">Not evaluated</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Trade-offs Row */}
                <tr className="hover:bg-[#111111] transition-colors bg-[#0e0c0a]">
                  <th
                    scope="row"
                    className="p-4 font-medium text-[#F5B942] sticky left-0 bg-[#0e0c0a] z-10 border-r border-[#222222]"
                  >
                    Key trade-offs &amp; considerations
                  </th>
                  {comparedProducts.map((p) => {
                    const id = p.sourceProductId || p.title;
                    const tradeoff = comparison.tradeoffs.find((t) => t.productId === id);
                    return (
                      <td key={id} className="p-4 align-top text-xs text-[#D4D4D4]">
                        {tradeoff ? (
                          <div className="flex items-start gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-[#F5B942] shrink-0 mt-0.5" />
                            <span>{tradeoff.summary}</span>
                          </div>
                        ) : (
                          <span className="text-[#737373]">No notable trade-offs logged</span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* Missing Information Row */}
                <tr className="hover:bg-[#111111] transition-colors">
                  <th
                    scope="row"
                    className="p-4 font-medium text-[#737373] sticky left-0 bg-[#0a0a0a] z-10 border-r border-[#222222]"
                  >
                    Not specified in listing
                  </th>
                  {comparedProducts.map((p) => {
                    const id = p.sourceProductId || p.title;
                    const missingItems = comparison.missingInformation.filter((m) => m.productId === id);
                    return (
                      <td key={id} className="p-4 align-top text-xs text-[#737373]">
                        {missingItems.length > 0 ? (
                          <ul className="space-y-1">
                            {missingItems.map((m, mIdx) => (
                              <li key={mIdx}>
                                <strong>{m.field}:</strong> {m.explanation}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span>All key specs available</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION D: ALTERNATIVE RECOMMENDATIONS BY PRIORITY
         ───────────────────────────────────────────────────────────── */}
      {comparison.alternativePicks.length > 0 && (
        <section
          aria-label="Alternative recommendations by priority"
          className="rounded-2xl border border-[#2b2b2b] bg-[#0d0d0d] p-6 shadow-xl space-y-4"
        >
          <div className="space-y-1 pb-3 border-b border-[#202020]">
            <h3 className="text-base sm:text-lg font-bold text-[#F5F5F5]">
              Alternative options by priority
            </h3>
            <p className="text-xs text-[#888888]">
              Options that may suit you better if your priorities differ from the primary verdict
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {comparison.alternativePicks.map((alt, idx) => {
              const product = productMap.get(alt.productId);
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-[#242424] bg-[#121212] p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <span className="inline-flex items-center gap-1 rounded bg-[#69A8FF]/15 border border-[#69A8FF]/30 px-2 py-0.5 text-[11px] font-semibold text-[#69A8FF]">
                      Best for: {alt.bestFor}
                    </span>
                    <h4 className="font-semibold text-[#F5F5F5] text-sm line-clamp-2">
                      {product?.title || alt.productId}
                    </h4>
                    <p className="text-xs text-[#A3A3A3] leading-relaxed">{alt.reason}</p>
                  </div>

                  {product && (
                    <div className="pt-3 border-t border-[#1c1c1c] flex items-center justify-between">
                      <span className="font-mono font-bold text-sm text-[#F5F5F5]">
                        {product.priceMinor !== null
                          ? formatCurrency(product.priceMinor, product.currency || currency)
                          : "Price at merchant"}
                      </span>
                      <a
                        href={product.retailerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#FF8126] hover:underline"
                      >
                        <span>View retailer offer</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function AssessmentBadge({ rating }: { rating: AssessmentRating }) {
  switch (rating) {
    case "strong":
      return (
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold text-[#35C979] bg-[#35C979]/15 border border-[#35C979]/30">
          <CheckCircle2 className="h-3 w-3" />
          Strong Match
        </span>
      );
    case "partial":
      return (
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold text-[#69A8FF] bg-[#69A8FF]/15 border border-[#69A8FF]/30">
          <Info className="h-3 w-3" />
          Partial Match
        </span>
      );
    case "weak":
      return (
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold text-[#F5B942] bg-[#F5B942]/15 border border-[#F5B942]/30">
          <AlertTriangle className="h-3 w-3" />
          Weak Match
        </span>
      );
    case "unknown":
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-[#888888] bg-[#1a1a1a] border border-[#2b2b2b]">
          <HelpCircle className="h-3 w-3" />
          Not Specified
        </span>
      );
  }
}
