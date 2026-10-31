"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Sparkles,
  Check,
  AlertTriangle,
  ExternalLink,
  ShoppingBag,
  RefreshCw,
  X,
  Info,
} from "lucide-react";
import type {
  NormalizedProduct,
  ProductVariantState,
  ProductVariantSelection,
  CurrencyCode,
} from "@/types";
import { formatCurrency } from "@/lib/utils";

interface ProductVariantConfiguratorProps {
  product: NormalizedProduct;
  initialSelections?: Record<string, string>;
  currency?: CurrencyCode;
  isOpen: boolean;
  onClose: () => void;
  onConfirmSelection: (selection: ProductVariantSelection) => void;
}

export function ProductVariantConfigurator({
  product,
  initialSelections = {},
  currency = "USD",
  isOpen,
  onClose,
  onConfirmSelection,
}: ProductVariantConfiguratorProps) {
  const [variantState, setVariantState] = useState<ProductVariantState | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(initialSelections);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productId = product.sourceProductId || product.title;

  // Load product variants on open or when selections change
  const fetchVariants = useCallback(
    async (optionsToSelect: Record<string, string>) => {
      if (!productId) return;
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/products/variants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            selectedOptions: optionsToSelect,
            currency,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to load product variants.");
        }

        setVariantState(data.variantState);

        // Prepopulate active effective selections
        if (data.variantState?.effectiveSelected) {
          setSelectedOptions((prev) => ({
            ...prev,
            ...data.variantState.effectiveSelected,
          }));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unable to retrieve variant metadata";
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [productId, currency]
  );

  useEffect(() => {
    if (isOpen && productId) {
      const timer = setTimeout(() => {
        void fetchVariants(initialSelections);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, productId, initialSelections, fetchVariants]);

  const handleSelectOption = (dimensionName: string, label: string) => {
    const updated = { ...selectedOptions, [dimensionName]: label };
    setSelectedOptions(updated);
    fetchVariants(updated);
  };

  const handleConfirm = () => {
    const confirmedPrice =
      variantState?.verifiedPriceMinor || product.priceMinor || null;
    const confirmedUrl = variantState?.retailerUrl || product.retailerUrl;

    onConfirmSelection({
      productId,
      title: variantState?.title || product.title,
      retailerName: variantState?.retailerName || product.retailerName || "Verified Retailer",
      imageUrl: variantState?.imageUrl || product.imageUrl,
      selectedOptions,
      isConfirmed: true,
      confirmedPriceMinor: confirmedPrice,
      confirmedRetailerUrl: confirmedUrl,
    });
  };

  if (!isOpen) return null;

  const displayPrice = variantState?.verifiedPriceMinor
    ? formatCurrency(variantState.verifiedPriceMinor, currency)
    : product.priceMinor !== null
    ? formatCurrency(product.priceMinor, product.currency || currency)
    : "Price at merchant";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="configurator-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-[#2b2b2b] bg-[#101010] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#222222]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF6A00]/20 text-[#FF8126]">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 id="configurator-title" className="text-lg font-bold text-[#F5F5F5]">
                Configure Product &amp; Verify Options
              </h2>
              <p className="text-xs text-[#8E8E8E]">
                Select your exact variant and confirm stock availability with the merchant.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close configuration"
            className="rounded-lg p-1.5 text-[#737373] hover:text-[#F5F5F5] hover:bg-[#1f1f1f] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Product Hero Info */}
        <div className="my-5 flex gap-4 rounded-xl border border-[#222222] bg-[#141414] p-4 items-center">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-[#292929] bg-[#0c0c0c] p-1">
            {(variantState?.imageUrl || product.imageUrl) ? (
              <Image
                src={variantState?.imageUrl || product.imageUrl!}
                alt={product.title}
                fill
                sizes="80px"
                className="object-contain p-1"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[#444444]">
                <ShoppingBag className="h-6 w-6" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <span className="text-[11px] text-[#A3A3A3] block">
              {variantState?.retailerName || product.retailerName || "Verified Retailer"}
            </span>
            <h3 className="text-sm font-semibold text-[#F5F5F5] line-clamp-2 leading-snug">
              {variantState?.title || product.title}
            </h3>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-bold text-[#35C979] tabular-nums">
                {displayPrice}
              </span>
              <span className="text-[11px] text-[#737373]">
                {currency}
              </span>
            </div>
          </div>
        </div>

        {/* Server Relaxation Alert Banner (if Channel3 server relaxed choice) */}
        {variantState?.isRelaxed && variantState.relaxationMessage && (
          <div className="mb-5 rounded-xl border border-[#F5B942]/40 bg-[#1e1910] p-4 text-xs text-[#F5B942] flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block mb-0.5">Retailer Stock Notice</strong>
              <p className="leading-relaxed text-[#D4D4D4]">{variantState.relaxationMessage}</p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-5 rounded-xl border border-[#F05B5B]/30 bg-[#F05B5B]/10 p-3.5 text-xs text-[#F05B5B] flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="py-8 text-center text-xs text-[#8E8E8E] flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-[#FF6A00]" />
            <span>Verifying stock and option availability with merchant...</span>
          </div>
        )}

        {/* Variant Dimension Selectors */}
        {!isLoading && variantState?.options && variantState.options.length > 0 ? (
          <div className="space-y-5">
            {variantState.options.map((dimension) => {
              const currentActive =
                selectedOptions[dimension.name] || dimension.selectedValue;

              return (
                <div key={dimension.name} className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#D4D4D4]">
                      Select {dimension.name}:
                    </span>
                    {currentActive && (
                      <span className="font-mono text-[#35C979] font-medium">
                        Selected: {currentActive}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {dimension.values.map((val) => {
                      const isSelected =
                        currentActive?.toLowerCase() === val.label.toLowerCase();
                      const isOutOfStock =
                        val.available === "OutOfStock" || val.available === "SoldOut";

                      return (
                        <button
                          key={val.label}
                          type="button"
                          disabled={isOutOfStock}
                          onClick={() => handleSelectOption(dimension.name, val.label)}
                          className={`rounded-xl border px-3.5 py-2 text-xs font-medium transition-all ${
                            isSelected
                              ? "border-[#FF6A00] bg-[#FF6A00]/20 text-[#FF8126] ring-1 ring-[#FF6A00]"
                              : isOutOfStock
                              ? "border-[#222222] bg-[#141414] text-[#555555] line-through cursor-not-allowed opacity-50"
                              : "border-[#303030] bg-[#181818] text-[#D4D4D4] hover:border-[#FF6A00]/50 hover:text-white"
                          }`}
                        >
                          <span>{val.label}</span>
                          {val.available === "LimitedAvailability" && (
                            <span className="ml-1.5 text-[10px] text-[#F5B942] font-normal">
                              (Low stock)
                            </span>
                          )}
                          {isOutOfStock && (
                            <span className="ml-1.5 text-[10px] text-[#F05B5B] font-normal">
                              (Sold out)
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : !isLoading && (
          <div className="py-4 text-xs text-[#8E8E8E] flex items-center gap-2">
            <Info className="h-4 w-4 text-[#69A8FF]" />
            <span>This product has a single standard configuration with direct retailer stock.</span>
          </div>
        )}

        {/* Modal Action Buttons */}
        <div className="mt-8 pt-4 border-t border-[#222222] flex flex-col sm:flex-row items-center justify-between gap-3">
          <a
            href={variantState?.retailerUrl || product.retailerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#8E8E8E] hover:text-[#FF6A00] flex items-center gap-1.5 transition-colors"
          >
            <span>View on retailer store</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto rounded-xl border border-[#333333] bg-[#171717] px-4 py-2 text-xs font-semibold text-[#D4D4D4] hover:bg-[#222222] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#FF6A00] px-5 py-2 text-xs font-bold text-white shadow-lg shadow-[#FF6A00]/25 hover:bg-[#FF8126] transition-all"
            >
              <Check className="h-4 w-4" />
              <span>Confirm Configuration</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
