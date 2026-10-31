"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  ExternalLink,
  Tag,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ShoppingBag,
  AlertCircle,
  Award,
} from "lucide-react";
import type { NormalizedProduct, CurrencyCode } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface ProductCardProps {
  product: NormalizedProduct;
  budget?: number | null;
  currency?: CurrencyCode;
  onConfigure?: (product: NormalizedProduct) => void;
  isConfigured?: boolean;
}

export function ProductCard({
  product,
  budget = null,
  currency = "USD",
  onConfigure,
  isConfigured = false,
}: ProductCardProps) {
  const [showOffers, setShowOffers] = useState(false);
  const [showSpecs, setShowSpecs] = useState(false);
  const [imgError, setImgError] = useState(false);

  const productCurrency = product.currency || currency;
  const hasMultipleOffers = product.offers && product.offers.length > 1;
  const startingPrice =
    product.priceMinor !== null ? formatCurrency(product.priceMinor, productCurrency) : null;
  const compareAtPrice =
    product.compareAtPriceMinor ? formatCurrency(product.compareAtPriceMinor, productCurrency) : null;

  const isRanked = typeof product.rank === "number";
  const isTopPick = product.rank === 1;

  // Budget difference calculation if budget is provided
  const budgetMinor = budget !== null ? Math.round(budget * 100) : null;
  const underBudgetDiffMinor =
    budgetMinor !== null && product.priceMinor !== null ? budgetMinor - product.priceMinor : null;

  return (
    <article
      className={`flex flex-col justify-between rounded-xl border p-4 sm:p-5 transition-all shadow-lg ${
        isTopPick
          ? "border-[#FF6A00]/40 bg-[#12100e] hover:border-[#FF6A00]/70 hover:bg-[#14120f] shadow-[0_0_20px_rgba(255,106,0,0.06)] ring-1 ring-[#FF6A00]/20"
          : "border-[#262626] bg-[#101010] hover:border-[#383838] hover:bg-[#121212]"
      }`}
    >
      <div>
        {/* Top AI Rank Badge */}
        {isRanked && (
          <div className="mb-3 flex items-center justify-between gap-2 pb-2.5 border-b border-[#222222]">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isTopPick
                  ? "border border-[#FF6A00]/40 bg-[#FF6A00]/15 text-[#FF8126]"
                  : product.rank === 2
                  ? "border border-[#4B90FF]/30 bg-[#4B90FF]/10 text-[#7BB0FF]"
                  : "border border-[#303030] bg-[#1a1a1a] text-[#A3A3A3]"
              }`}
            >
              <Award className="h-3 w-3 shrink-0" />
              <span>
                {isTopPick
                  ? "Top AI Match"
                  : product.rank === 2
                  ? "AI Match #2"
                  : `AI Match #${product.rank}`}
              </span>
            </span>

            {underBudgetDiffMinor !== null && underBudgetDiffMinor >= 0 && (
              <span className="text-[11px] font-mono text-[#35C979] font-medium tabular-nums">
                {formatCurrency(underBudgetDiffMinor, productCurrency)} under budget
              </span>
            )}
          </div>
        )}

        {/* Brand & Stock Status */}
        <div className="flex items-center justify-between text-xs mb-3 pb-2.5 border-b border-[#202020]">
          <span className="font-medium text-[#A3A3A3] flex items-center gap-1.5 truncate max-w-[60%]">
            <Tag className="h-3 w-3 text-[#FF6A00] shrink-0" aria-hidden="true" />
            <span className="truncate">{product.brand || product.retailerName || "Verified Retailer"}</span>
          </span>
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded ${
              product.availability === "in_stock"
                ? "text-[#35C979] bg-[#35C979]/10"
                : "text-[#A3A3A3] bg-[#222222]"
            }`}
          >
            {product.availability === "in_stock" && <Check className="h-3 w-3" />}
            {product.availability === "in_stock" ? "In stock" : "Check merchant"}
          </span>
        </div>

        {/* Product Image */}
        <div className="relative mb-4 flex h-48 w-full items-center justify-center overflow-hidden rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] p-2">
          {product.imageUrl && !imgError ? (
            <Image
              src={product.imageUrl}
              alt={product.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-contain p-2 transition-transform duration-300 hover:scale-105"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-[#525252]">
              <ShoppingBag className="h-10 w-10 text-[#333333]" aria-hidden="true" />
              <span className="text-[11px] text-[#737373]">Product shot available at retailer</span>
            </div>
          )}
        </div>

        {/* Product Title */}
        <h3 className="text-sm sm:text-base font-semibold text-[#F5F5F5] line-clamp-2 leading-snug">
          {product.title}
        </h3>

        {/* Pricing & Budget Comparison */}
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-1">
          <div className="flex items-baseline gap-2">
            {startingPrice ? (
              <>
                <span className="text-xl sm:text-2xl font-bold text-[#F5F5F5] tabular-nums">
                  {hasMultipleOffers ? `From ${startingPrice}` : startingPrice}
                </span>
                {compareAtPrice && (
                  <span className="text-xs text-[#737373] line-through tabular-nums">
                    {compareAtPrice}
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm font-medium text-[#A3A3A3]">
                Price available at merchant
              </span>
            )}
            <span className="text-[11px] text-[#737373]">
              {productCurrency}
            </span>
          </div>

          {budgetMinor !== null && (
            <span className="text-[11px] text-[#737373] tabular-nums">
              Budget: {formatCurrency(budgetMinor, productCurrency)}
            </span>
          )}
        </div>

        {/* AI Recommendation Rationale & Trade-Offs */}
        {product.explanation && (
          <div className="mt-3.5 rounded-lg border border-[#2b2b2b] bg-[#141414] p-3 text-xs">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#FF8126] mb-1">
              <Sparkles className="h-3 w-3 shrink-0" />
              <span>Why SpendPilot Recommends This</span>
            </div>
            <p className="text-[#D4D4D4] leading-relaxed text-xs">
              {product.explanation}
            </p>
            {product.keyTradeOffs && (
              <div className="mt-2 pt-2 border-t border-[#222222] flex items-start gap-1.5 text-[11px] text-[#F5B942]">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="leading-snug">{product.keyTradeOffs}</span>
              </div>
            )}
          </div>
        )}

        {/* Offers count & primary merchant */}
        <div className="mt-3 flex items-center justify-between text-xs text-[#A3A3A3]">
          <span>
            {product.offersCount && product.offersCount > 1
              ? `${product.offersCount} retailer offers`
              : `Sold by ${product.retailerName || "Partner"}`}
          </span>

          {hasMultipleOffers && (
            <button
              type="button"
              onClick={() => setShowOffers(!showOffers)}
              className="inline-flex items-center gap-1 text-[11px] text-[#FF6A00] hover:underline focus:outline-none"
              aria-expanded={showOffers}
            >
              <span>{showOffers ? "Hide offers" : "Compare offers"}</span>
              {showOffers ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>

        {/* Expandable Retailer Offers Tray */}
        {showOffers && product.offers && product.offers.length > 0 && (
          <div className="mt-3 space-y-1.5 rounded-lg border border-[#222222] bg-[#0c0c0c] p-2.5 text-xs animate-fadeIn">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737373] block mb-1">
              Available Merchant Offers:
            </span>
            {product.offers.map((offer, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-1 border-b border-[#1a1a1a] last:border-0"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-[#D4D4D4]">{offer.domain}</span>
                  {offer.condition && (
                    <span className="text-[10px] text-[#737373] capitalize">{offer.condition}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[#F5F5F5] font-semibold tabular-nums">
                    {formatCurrency(offer.priceMinor, offer.currency)}
                  </span>
                  <a
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded bg-[#171717] px-2 py-1 text-[11px] text-[#69A8FF] hover:bg-[#202020] hover:text-[#9bc2ff]"
                  >
                    <span>View offer</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Verified Source Facts */}
        {product.sourceFacts && product.sourceFacts.length > 0 && (
          <div className="mt-3.5 space-y-1">
            <span className="text-[11px] font-medium text-[#737373] uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-[#FF6A00]" />
              Verified Product Facts
            </span>
            <ul className="space-y-1 text-xs text-[#A3A3A3]">
              {product.sourceFacts.slice(0, 3).map((fact, idx) => (
                <li key={idx} className="flex items-start gap-1.5 leading-snug">
                  <span className="text-[#FF6A00] mt-0.5">&bull;</span>
                  <span className="line-clamp-2">{fact}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Expandable Specifications */}
        {product.specifications && Object.keys(product.specifications).length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowSpecs(!showSpecs)}
              className="text-[11px] text-[#737373] hover:text-[#A3A3A3] flex items-center gap-1"
            >
              <span>{showSpecs ? "Hide specifications" : "View specifications"}</span>
              {showSpecs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showSpecs && (
              <div className="mt-2 space-y-1 border-t border-[#1e1e1e] pt-2 text-[11px]">
                {Object.entries(product.specifications).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-[#737373]">
                    <span className="truncate pr-2">{key}:</span>
                    <span className="text-[#D4D4D4] font-medium truncate max-w-[60%]">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card Actions: Configure & View Retailer Offer */}
      <div className="mt-5 pt-3 border-t border-[#202020] space-y-2">
        {onConfigure && (
          <button
            type="button"
            onClick={() => onConfigure(product)}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
              isConfigured
                ? "border border-[#35C979]/40 bg-[#35C979]/15 text-[#35C979] hover:bg-[#35C979]/20"
                : "border border-[#FF6A00]/50 bg-[#161310] text-[#FF8126] hover:bg-[#FF6A00]/20"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{isConfigured ? "Configuration Verified ✓" : "Configure Options (Size / Color)"}</span>
          </button>
        )}

        <a
          href={product.retailerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#FF6A00] px-3.5 py-2.5 text-xs font-semibold text-white shadow transition-all hover:bg-[#FF8126] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]"
        >
          <span>View retailer offer</span>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>

        <div className="mt-2 flex items-center justify-between text-[10px] text-[#737373]">
          <span>Verified via Channel3</span>
          <span>Direct merchant link</span>
        </div>
      </div>
    </article>
  );
}
