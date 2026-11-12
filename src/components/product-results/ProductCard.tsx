"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  ExternalLink,
  Tag,
  Check,
  ChevronDown,
  Sparkles,
  ShoppingBag,
  AlertCircle,
  Award,
} from "lucide-react";
import type { NormalizedProduct, ProductOfferItem, CurrencyCode } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface ProductCardProps {
  product: NormalizedProduct;
  budget?: number | null;
  currency?: CurrencyCode;
  onConfigure?: (product: NormalizedProduct) => void;
  onSelectOffer?: (product: NormalizedProduct, offer: ProductOfferItem) => void;
  onSelectProduct?: (product: NormalizedProduct) => void;
  isConfigured?: boolean;
  isSelected?: boolean;
}

export function ProductCard({
  product,
  budget = null,
  currency = "USD",
  onConfigure,
  onSelectOffer,
  onSelectProduct,
  isConfigured = false,
  isSelected = false,
}: ProductCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [imgError, setImgError] = useState(false);

  const productCurrency = product.currency || currency;
  const hasMultipleOffers = product.offers && product.offers.length > 1;

  // Selected Offer is authoritative source of truth for price, URL, and verification
  const activeOffer = product.selectedOffer || product.offers?.[0] || null;
  const isUnverified = product.configurationStatus === "unverified";
  const isVerified = product.configurationStatus === "verified";

  // Confirmed price derived from verified selected offer, or lowest observed listing price if unverified
  const effectivePriceMinor =
    isVerified && product.priceMinor !== null
      ? product.priceMinor
      : activeOffer?.priceMinor ?? product.priceMinor ?? null;

  const startingPrice =
    effectivePriceMinor !== null ? formatCurrency(effectivePriceMinor, productCurrency) : null;
  const compareAtPrice =
    activeOffer?.compareAtPriceMinor || product.compareAtPriceMinor
      ? formatCurrency(activeOffer?.compareAtPriceMinor || product.compareAtPriceMinor!, productCurrency)
      : null;

  // Only verified configuration matches can display as AI confirmed recommendations
  const isRanked = typeof product.rank === "number" && !isUnverified;
  const isTopPick = product.rank === 1 && !isUnverified;

  // Check if within specified budget limit (normalize dollars to minor cents)
  const budgetCents =
    budget !== null && budget !== undefined
      ? budget > 10000
        ? Math.round(budget)
        : Math.round(budget * 100)
      : null;

  const isWithinBudget =
    budgetCents !== null && effectivePriceMinor !== null ? effectivePriceMinor <= budgetCents : null;

  // Extract top 2-3 key specs for quick compact display
  const keySpecs: string[] = [];
  if (product.specifications) {
    const entries = Object.entries(product.specifications);
    for (const [k, v] of entries) {
      if (keySpecs.length >= 3) break;
      if (typeof v === "string" && v.length < 30) {
        keySpecs.push(`${k}: ${v}`);
      }
    }
  }
  if (keySpecs.length === 0 && product.sourceFacts) {
    keySpecs.push(...product.sourceFacts.slice(0, 2));
  }

  return (
    <article
      className={`flex flex-col justify-between rounded-2xl border p-4 sm:p-4.5 transition-all shadow-lg ${
        isTopPick
          ? "border-orange-300 dark:border-[#FF6A00]/60 bg-gradient-to-b from-orange-50/90 via-white to-orange-50/40 dark:from-[#161618] dark:to-[#0e0e10] shadow-[0_8px_30px_-8px_rgba(255,106,0,0.18)] dark:shadow-[0_8px_30px_-8px_rgba(255,106,0,0.25)] ring-1 ring-orange-400/40 dark:ring-[#FF6A00]/30"
          : "border-orange-200/80 dark:border-[#262626] bg-white dark:bg-gradient-to-b dark:from-[#141414] dark:to-[#0e0e0e] hover:border-orange-400 dark:hover:border-[#383838] hover:shadow-md"
      }`}
    >
      <div>
        {/* Top AI Rank Badge or Status Header */}
        <div className="mb-3 flex items-center justify-between gap-2 pb-2 border-b border-orange-100 dark:border-[#202020]">
          {isRanked ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                isTopPick
                  ? "border border-[#FF6A00]/40 bg-[#FF6A00]/15 text-[#FF8126]"
                  : product.rank === 2
                  ? "border border-[#4B90FF]/30 bg-[#4B90FF]/10 text-[#2563EB] dark:text-[#7BB0FF]"
                  : "border border-zinc-200 dark:border-[#303030] bg-zinc-100 dark:bg-[#1a1a1a] text-zinc-700 dark:text-[#A3A3A3]"
              }`}
            >
              <Award className="h-3 w-3 shrink-0" />
              <span>
                {isTopPick ? "Top Pick" : `Match #${product.rank}`}
              </span>
            </span>
          ) : isUnverified ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border border-amber-300 dark:border-[#F5B942]/30 bg-amber-50 dark:bg-[#F5B942]/10 text-amber-700 dark:text-[#F5B942]">
              <AlertCircle className="h-2.5 w-2.5 shrink-0" />
              <span>Unverified Option</span>
            </span>
          ) : (
            <span className="text-[11px] text-zinc-600 dark:text-[#A1A1AA] font-bold flex items-center gap-1">
              <Tag className="h-3 w-3 text-[#FF6A00]" />
              <span className="truncate max-w-[120px]">{product.brand || "Catalog Option"}</span>
            </span>
          )}

          <span
            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
              product.availability === "in_stock"
                ? "text-[#35C979] bg-[#35C979]/10 border border-[#35C979]/20"
                : "text-zinc-600 dark:text-[#A1A1AA] bg-zinc-100 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-[#282828]"
            }`}
          >
            {product.availability === "in_stock" && <Check className="h-2.5 w-2.5" />}
            {product.availability === "in_stock" ? "In Stock" : product.availability === "out_of_stock" ? "Out of Stock" : "Check Store"}
          </span>
        </div>

        {/* Product Image */}
        <div className="relative mb-3 flex h-40 sm:h-44 w-full items-center justify-center overflow-hidden rounded-xl bg-zinc-50 dark:bg-[#090909] border border-orange-100 dark:border-[#1e1e1e] p-2">
          {product.imageUrl && !imgError ? (
            <Image
              src={product.imageUrl}
              alt={product.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
              className="object-contain p-2 transition-transform duration-300 hover:scale-105"
              onError={() => setImgError(true)}
              loading="lazy"
              unoptimized
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1.5 text-zinc-400 dark:text-[#525252]">
              <ShoppingBag className="h-8 w-8 text-zinc-300 dark:text-[#333333]" aria-hidden="true" />
              <span className="text-[10px] text-zinc-500 dark:text-[#A1A1AA]">Merchant Image</span>
            </div>
          )}
        </div>

        {/* Brand & Title */}
        <div className="mb-2">
          <span className="text-[11px] text-zinc-600 dark:text-[#D4D4D8] font-bold block truncate mb-0.5">
            {product.brand || product.retailerName || "Retailer Option"}
          </span>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-[#F5F5F5] line-clamp-2 leading-snug" title={product.title}>
            {product.title}
          </h3>
        </div>

        {/* Pricing Display */}
        <div className="mt-2 flex items-baseline justify-between gap-1 pb-2 border-b border-orange-100 dark:border-[#1c1c1c]">
          <div className="flex items-baseline gap-1.5">
            {startingPrice ? (
              <>
                <span className="text-lg sm:text-xl font-extrabold text-zinc-900 dark:text-[#F5F5F5] tabular-nums">
                  {hasMultipleOffers ? `From ${startingPrice}` : startingPrice}
                </span>
                {compareAtPrice && (
                  <span className="text-xs text-zinc-400 dark:text-[#A1A1AA] line-through tabular-nums">
                    {compareAtPrice}
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs font-bold text-zinc-600 dark:text-[#D4D4D8]">
                Check Merchant Price
              </span>
            )}
            <span className="text-[10px] text-zinc-500 dark:text-[#A1A1AA] font-mono">
              {productCurrency}
            </span>
            {isWithinBudget && (
              <span className="text-[10px] font-bold text-[#35C979] bg-[#35C979]/10 border border-[#35C979]/20 px-1.5 py-0.5 rounded">
                In Budget
              </span>
            )}
          </div>

          <span className="text-[11px] text-zinc-500 dark:text-[#D4D4D8] truncate max-w-[110px]" title={activeOffer?.domain || product.retailerName || "Retailer"}>
            via {activeOffer?.domain || product.retailerName || "Retailer"}
          </span>
        </div>

        {/* Compact Key Specs Badges */}
        {keySpecs.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {keySpecs.map((spec) => (
              <span
                key={spec}
                className="inline-block rounded-md border border-orange-200/80 dark:border-[#333333] bg-orange-50/60 dark:bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:text-[#E4E4E7] truncate max-w-full"
              >
                {spec}
              </span>
            ))}
          </div>
        )}

        {/* Expandable Details & Specifications Toggle */}
        <div className="mt-2.5">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex w-full items-center justify-between text-[11px] font-bold text-zinc-600 dark:text-[#D4D4D8] hover:text-zinc-900 dark:hover:text-white py-1 transition-colors"
            aria-expanded={showDetails}
          >
            <span>{showDetails ? "Hide details & offers" : "Details & offers"}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${
                showDetails ? "rotate-180 text-[#FF6A00]" : ""
              }`}
            />
          </button>

          {showDetails && (
            <div className="mt-2 space-y-2.5 rounded-xl border border-orange-200/80 dark:border-[#2a2a2a] bg-[#FFF9F3] dark:bg-[#111111] p-3 text-xs animate-fadeIn">
              {product.explanation && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-[#FF8126] block">
                    SpendPilot Insight:
                  </span>
                  <p className="text-[11px] text-zinc-700 dark:text-[#F5F5F5] leading-relaxed">
                    {product.explanation}
                  </p>
                </div>
              )}

              {product.keyTradeOffs && (
                <div className="rounded-lg border border-amber-300 dark:border-[#F5B942]/30 bg-amber-50 dark:bg-[#161410] p-2 text-[11px] text-amber-900 dark:text-[#F5B942] flex items-start gap-1.5">
                  <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{product.keyTradeOffs}</span>
                </div>
              )}

              {/* Multiple Merchant Offers */}
              {product.offers && product.offers.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-orange-100 dark:border-[#1a1a1a]">
                  <span className="text-[10px] font-bold uppercase text-zinc-500 dark:text-[#A1A1AA] block">
                    Store Offers ({product.offers.length}):
                  </span>
                  {product.offers.map((offer, idx) => {
                    const offerKey = offer.id || offer.url || `${offer.domain}_${offer.priceMinor}`;
                    const isSelected = activeOffer?.url === offer.url || (!activeOffer && idx === 0);
                    const isOfferOverBudget =
                      budgetCents !== null &&
                      typeof offer.priceMinor === "number" &&
                      offer.priceMinor > budgetCents;

                    return (
                      <div
                        key={offerKey}
                        className={`flex items-center justify-between p-1.5 rounded-lg text-[11px] border ${
                          isSelected
                            ? "border-[#35C979]/40 bg-[#35C979]/10"
                            : isOfferOverBudget
                            ? "border-red-200/50 dark:border-red-900/30 bg-red-50/30 dark:bg-red-950/10"
                            : "border-orange-200/70 dark:border-[#262626] bg-white dark:bg-[#161616]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate max-w-[140px]">
                          <span className="font-bold text-zinc-800 dark:text-[#F5F5F5] truncate">
                            {offer.domain}
                          </span>
                          {isOfferOverBudget && (
                            <span className="shrink-0 text-[9px] font-bold text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1 py-0.2 rounded border border-rose-200 dark:border-rose-900/50">
                              Over budget
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono font-bold ${
                              isOfferOverBudget
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-zinc-900 dark:text-[#F5F5F5]"
                            }`}
                          >
                            {formatCurrency(offer.priceMinor, offer.currency)}
                          </span>
                          {onSelectOffer && !isSelected && (
                            <button
                              type="button"
                              disabled={isOfferOverBudget}
                              onClick={() => {
                                if (!isOfferOverBudget) {
                                  onSelectOffer(product, offer);
                                }
                              }}
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                isOfferOverBudget
                                  ? "cursor-not-allowed opacity-40 bg-zinc-200 dark:bg-zinc-800 text-zinc-500"
                                  : "btn-3d-secondary"
                              }`}
                              title={
                                isOfferOverBudget
                                  ? "Cannot select: exceeds your active budget ceiling"
                                  : "Select this retailer offer"
                              }
                            >
                              Select
                            </button>
                          )}
                          <a
                            href={offer.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#FF6A00] dark:text-[#69A8FF] hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Full Specs */}
              {product.specifications && Object.keys(product.specifications).length > 0 && (
                <div className="space-y-1 pt-1 border-t border-orange-100 dark:border-[#1a1a1a]">
                  <span className="text-[10px] font-bold uppercase text-zinc-500 dark:text-[#A1A1AA] block">
                    Specifications:
                  </span>
                  <div className="space-y-1 text-[11px]">
                    {Object.entries(product.specifications).slice(0, 6).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-zinc-500 dark:text-[#A1A1AA]">
                        <span className="truncate pr-2">{k}:</span>
                        <span className="text-zinc-800 dark:text-[#F5F5F5] font-bold truncate max-w-[60%]">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Card 3D Actions */}
      <div className="mt-4 pt-3 border-t border-orange-100 dark:border-[#1f1f1f] space-y-2">
        {onSelectProduct && (
          <button
            type="button"
            onClick={() => onSelectProduct(product)}
            className={`btn-3d-primary w-full rounded-xl py-2.5 text-xs font-bold gap-1.5 transition-all ${
              isSelected
                ? "border-[#35C979]/50 bg-gradient-to-b from-emerald-600 to-emerald-700 text-white shadow-[0_4px_16px_rgba(53,201,121,0.25)]"
                : ""
            }`}
          >
            {isSelected ? (
              <>
                <Check className="h-4 w-4" />
                <span>Added to Shopping List ✓</span>
              </>
            ) : (
              <>
                <ShoppingBag className="h-4 w-4" />
                <span>Select This Product</span>
              </>
            )}
          </button>
        )}

        {onConfigure && (
          <button
            type="button"
            onClick={() => onConfigure(product)}
            className={`btn-3d-accent w-full rounded-xl py-2 text-xs font-bold ${
              isConfigured ? "border-[#35C979]/40 text-[#35C979]" : ""
            }`}
            title={`See all available options for ${product.title}`}
            aria-label={`See all available options for ${product.title}`}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            <span>{isConfigured ? "Options Configured ✓" : "See Options"}</span>
          </button>
        )}

        <a
          href={activeOffer?.url || product.retailerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-3d-secondary w-full rounded-xl py-2.5 text-xs font-bold gap-1.5"
        >
          <span>View on {activeOffer?.domain || product.retailerName || "Retailer"}</span>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}
