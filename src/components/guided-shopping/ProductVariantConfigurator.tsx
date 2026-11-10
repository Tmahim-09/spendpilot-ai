"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import {
  Sparkles,
  Check,
  AlertTriangle,
  ExternalLink,
  ShoppingBag,
  RefreshCw,
  X,
  ChevronDown,
  Info,
  ShieldAlert,
} from "lucide-react";
import type {
  NormalizedProduct,
  ProductVariantState,
  ProductVariantSelection,
  ProductVariantDimension,
  ProductVariantOptionValue,
  CurrencyCode,
} from "@/types";
import { formatCurrency } from "@/lib/utils";

interface ProductVariantConfiguratorProps {
  product: NormalizedProduct;
  initialSelections?: Record<string, string>;
  currency?: CurrencyCode;
  budgetMinor?: number | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmSelection: (selection: ProductVariantSelection) => void;
}

// Swatch colors for standard color variants
const COLOR_SWATCH_MAP: Record<string, string> = {
  midnight: "#192231",
  "space gray": "#5c5d60",
  "space grey": "#5c5d60",
  silver: "#e3e4e5",
  starlight: "#eae3d2",
  "space black": "#1b1b1d",
  black: "#141414",
  white: "#f8f9fa",
  "pure platinum": "#e5e7eb",
  gold: "#f4e4c1",
  "rose gold": "#e8c5be",
  blue: "#1e3a8a",
  navy: "#0f172a",
  "obsidian blue": "#1a2a44",
  red: "#dc2626",
  green: "#166534",
  anthracite: "#374151",
  yellow: "#eab308",
  purple: "#7e22ce",
  grey: "#6b7280",
  gray: "#6b7280",
  beige: "#d4c5b9",
};

function getColorSwatch(colorLabel: string): string {
  const lower = colorLabel.toLowerCase();
  for (const [key, hex] of Object.entries(COLOR_SWATCH_MAP)) {
    if (lower.includes(key)) {
      return hex;
    }
  }
  return "#2e2e2e";
}

/**
 * Computes effective total price based on base price and selected options delta.
 */
function computeEffectivePrice(
  basePrice: number,
  dimensions: ProductVariantDimension[],
  selections: Record<string, string>
): number {
  let totalDelta = 0;
  for (const dim of dimensions) {
    const selectedLabel = selections[dim.name] || dim.selectedValue;
    if (!selectedLabel) continue;
    const optVal = dim.values.find(
      (v) => v.label.toLowerCase() === selectedLabel.toLowerCase()
    );
    if (optVal && typeof optVal.priceMinor === "number") {
      const delta = Math.max(0, optVal.priceMinor - basePrice);
      totalDelta += delta;
    }
  }
  return basePrice + totalDelta;
}

/**
 * Dropdown Selector Component for a Single Option Dimension
 */
interface OptionDropdownProps {
  dimension: ProductVariantDimension;
  selectedValue: string;
  basePrice: number;
  currentTotalPrice: number;
  budgetMinor?: number | null;
  currency: CurrencyCode;
  onSelect: (label: string, optionVal?: ProductVariantOptionValue) => void;
  disabled?: boolean;
}

function OptionDropdown({
  dimension,
  selectedValue,
  basePrice,
  currentTotalPrice,
  budgetMinor,
  currency,
  onSelect,
  disabled,
}: OptionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isColorDimension =
    dimension.name.toLowerCase().includes("color") ||
    dimension.name.toLowerCase().includes("colour") ||
    dimension.name.toLowerCase().includes("finish");

  const activeValue = dimension.values.find(
    (v) => v.label.toLowerCase() === selectedValue.toLowerCase()
  ) || dimension.values[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative space-y-1.5" ref={dropdownRef}>
      <label className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-[#D4D4D4]">
        <span>Select {dimension.name}:</span>
        {activeValue && (
          <span className="font-mono text-[#35C979] text-[11px] font-normal">
            Current: {activeValue.label}
          </span>
        )}
      </label>

      {/* Dropdown Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-300 dark:border-[#2e2e2e] bg-white dark:bg-[#141414] px-3.5 py-2.5 text-left text-xs font-medium text-zinc-900 dark:text-[#F5F5F5] transition-all hover:border-[#FF6A00]/50 hover:bg-zinc-50 dark:hover:bg-[#181818] focus:border-[#FF6A00] focus:outline-none focus:ring-1 focus:ring-[#FF6A00] disabled:opacity-50"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Color swatch or thumbnail image */}
          {isColorDimension && (
            activeValue?.thumbnailUrl ? (
              <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full border border-black/10 dark:border-white/20 bg-black">
                <Image
                  src={activeValue.thumbnailUrl}
                  alt={activeValue.label}
                  fill
                  sizes="20px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : (
              <span
                className="h-4 w-4 shrink-0 rounded-full border border-black/10 dark:border-white/20 shadow-inner"
                style={{ backgroundColor: getColorSwatch(activeValue?.label || "") }}
              />
            )
          )}
          <span className="truncate">{activeValue?.label || `Select ${dimension.name}`}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ChevronDown
            className={`h-4 w-4 text-zinc-400 dark:text-[#888888] transition-transform duration-200 ${isOpen ? "rotate-180 text-[#FF6A00]" : ""
              }`}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="listbox"
          className="absolute z-20 mt-1.5 w-full rounded-xl border border-zinc-200 dark:border-[#2e2e2e] bg-white dark:bg-[#121212] p-1.5 shadow-2xl backdrop-blur-md max-h-60 overflow-y-auto animate-fadeIn"
        >
          {dimension.values.map((val) => {
            const isSelected = val.label.toLowerCase() === selectedValue.toLowerCase();
            const isOutOfStock =
              val.available === "OutOfStock" || val.available === "SoldOut";

            // Price delta calculation for this specific option
            const optDelta = val.priceMinor ? Math.max(0, val.priceMinor - basePrice) : 0;
            // What the total would be if this option were selected
            const simulatedTotal = currentTotalPrice - (activeValue?.priceMinor ? Math.max(0, activeValue.priceMinor - basePrice) : 0) + optDelta;
            const exceedsBudget = budgetMinor ? simulatedTotal > budgetMinor : false;

            return (
              <button
                key={val.label}
                type="button"
                disabled={isOutOfStock}
                onClick={() => {
                  onSelect(val.label, val);
                  setIsOpen(false);
                }}
                role="option"
                aria-selected={isSelected}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs transition-colors ${isSelected
                  ? "bg-[#FF6A00]/20 text-[#FF8126] font-semibold"
                  : isOutOfStock
                    ? "text-zinc-400 dark:text-[#555555] line-through cursor-not-allowed opacity-50"
                    : "text-zinc-700 dark:text-[#D4D4D4] hover:bg-orange-50 dark:hover:bg-[#1c1c1c] hover:text-zinc-900 dark:hover:text-[#FFFFFF]"
                  }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Swatch or thumbnail */}
                  {isColorDimension && (
                    val.thumbnailUrl ? (
                      <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full border border-black/10 dark:border-white/20 bg-black">
                        <Image
                          src={val.thumbnailUrl}
                          alt={val.label}
                          fill
                          sizes="20px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <span
                        className="h-4 w-4 shrink-0 rounded-full border border-black/10 dark:border-white/20 shadow-inner"
                        style={{ backgroundColor: getColorSwatch(val.label) }}
                      />
                    )
                  )}

                  <span className="truncate">{val.label}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                  {optDelta > 0 && (
                    <span className="font-mono text-zinc-500 dark:text-[#A3A3A3]">
                      +{formatCurrency(optDelta, currency)}
                    </span>
                  )}

                  {budgetMinor && !isOutOfStock && (
                    exceedsBudget ? (
                      <span className="rounded bg-[#F5B942]/15 border border-[#F5B942]/30 px-1.5 py-0.5 text-[10px] font-semibold text-[#F5B942]">
                        Exceeds budget
                      </span>
                    ) : (
                      <span className="rounded bg-[#35C979]/15 border border-[#35C979]/30 px-1.5 py-0.5 text-[10px] font-semibold text-[#35C979]">
                        In budget
                      </span>
                    )
                  )}

                  {val.available === "LimitedAvailability" && (
                    <span className="text-[10px] text-[#F5B942]">(Low stock)</span>
                  )}
                  {isOutOfStock && (
                    <span className="text-[10px] text-[#F05B5B]">(Sold out)</span>
                  )}
                  {isSelected && <Check className="h-3.5 w-3.5 text-[#FF6A00]" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProductVariantConfigurator({
  product,
  initialSelections = {},
  currency = "USD",
  budgetMinor,
  isOpen,
  onClose,
  onConfirmSelection,
}: ProductVariantConfiguratorProps) {
  const [variantState, setVariantState] = useState<ProductVariantState | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(initialSelections);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(product.imageUrl || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasInitializedRef = useRef<string | null>(null);

  const productId = product.sourceProductId || product.title;

  // Load product variants on open or when selections change
  const fetchVariants = useCallback(
    async (optionsToSelect: Record<string, string>, isInitial = false) => {
      if (!productId) return;
      if (isInitial) {
        setIsLoading(true);
      } else {
        setIsUpdating(true);
      }
      setError(null);

      try {
        const res = await fetch("/api/products/variants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: product.sourceProductId || productId,
            retailerUrl: product.retailerUrl,
            selectedOptions: optionsToSelect,
            currency,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to load product variants.");
        }

        setVariantState(data.variantState);

        // Update image url from returned variant state if available
        if (data.variantState?.imageUrl) {
          setCurrentImageUrl(data.variantState.imageUrl);
        }

        // Merge selections: user's requested options take precedence over server defaults!
        setSelectedOptions((prev) => ({
          ...data.variantState?.effectiveSelected,
          ...prev,
          ...optionsToSelect,
        }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unable to retrieve variant metadata";
        setError(msg);
      } finally {
        if (isInitial) {
          setIsLoading(false);
        } else {
          setIsUpdating(false);
        }
      }
    },
    [productId, currency, product.sourceProductId, product.retailerUrl]
  );

  useEffect(() => {
    if (isOpen && productId) {
      if (hasInitializedRef.current !== productId) {
        hasInitializedRef.current = productId;
        setSelectedOptions(initialSelections);
        setVariantState(null);
        setCurrentImageUrl(product.imageUrl || null);
        void fetchVariants(initialSelections, true);
      }
    } else if (!isOpen) {
      hasInitializedRef.current = null;
    }
  }, [isOpen, productId, initialSelections, product.imageUrl, fetchVariants]);

  const handleSelectOption = (
    dimensionName: string,
    label: string,
    optVal?: ProductVariantOptionValue
  ) => {
    const updated = { ...selectedOptions, [dimensionName]: label };
    setSelectedOptions(updated);

    // If selecting a color and option has a thumbnail/image, update product hero image immediately!
    const isColor =
      dimensionName.toLowerCase().includes("color") ||
      dimensionName.toLowerCase().includes("colour") ||
      dimensionName.toLowerCase().includes("finish");
    if (isColor && optVal?.thumbnailUrl) {
      setCurrentImageUrl(optVal.thumbnailUrl);
    }

    // Immediately update variantState locally so dropdown labels and checkmarks reflect with zero lag
    setVariantState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        effectiveSelected: {
          ...prev.effectiveSelected,
          [dimensionName]: label,
        },
        options: prev.options.map((dim) =>
          dim.name === dimensionName ? { ...dim, selectedValue: label } : dim
        ),
      };
    });

    // Re-verify with backend in background without unmounting the options UI
    void fetchVariants(updated, false);
  };

  if (!isOpen) return null;

  // Calculate pricing
  const basePrice =
    variantState?.verifiedPriceMinor ||
    (product.priceMinor !== null && product.configurationStatus === "verified"
      ? product.priceMinor
      : 109900);

  const effectivePriceMinor = computeEffectivePrice(
    basePrice,
    variantState?.options || [],
    selectedOptions
  );

  // Budget comparison
  const isOverBudget = Boolean(budgetMinor && effectivePriceMinor > budgetMinor);
  const budgetDeltaMinor = isOverBudget && budgetMinor ? effectivePriceMinor - budgetMinor : 0;

  const handleConfirm = () => {
    const confirmedPrice = effectivePriceMinor || product.priceMinor || null;
    const confirmedUrl = variantState?.retailerUrl || product.retailerUrl;

    onConfirmSelection({
      productId,
      title: variantState?.title || product.title,
      retailerName: variantState?.retailerName || product.retailerName || "Verified Retailer",
      imageUrl: currentImageUrl || variantState?.imageUrl || product.imageUrl,
      selectedOptions,
      isConfirmed: true,
      confirmedPriceMinor: confirmedPrice,
      confirmedRetailerUrl: confirmedUrl,
    });
  };

  const allOffers = variantState?.offers || product.offers || [];
  const allSpecs = variantState?.specifications || product.specifications || {};

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="configurator-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-zinc-200 dark:border-[#2b2b2b] bg-white dark:bg-[#101010] p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-4 border-b border-zinc-200 dark:border-[#222222]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF6A00]/20 text-[#FF8126]">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="configurator-title" className="text-lg font-bold text-zinc-900 dark:text-[#F5F5F5]">
                  Select Product Options
                </h2>
                <span className="inline-flex items-center rounded-md border border-[#FF6A00]/40 bg-[#FF6A00]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FF8126]">
                  Channel3 Verified
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-[#8E8E8E]">
                Choose from available retailer options in your budget.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close configuration"
            className="rounded-lg p-1.5 text-zinc-400 dark:text-[#737373] hover:text-zinc-800 dark:hover:text-[#F5F5F5] hover:bg-zinc-100 dark:hover:bg-[#1f1f1f] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Product Hero Info Card */}
        <div className="my-5 flex gap-4 rounded-xl border border-zinc-200 dark:border-[#222222] bg-zinc-50 dark:bg-[#141414] p-4 items-center">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-zinc-200 dark:border-[#292929] bg-white dark:bg-[#0c0c0c] p-1 shadow-sm">
            {(currentImageUrl || variantState?.imageUrl || product.imageUrl) ? (
              <Image
                src={currentImageUrl || variantState?.imageUrl || product.imageUrl!}
                alt={product.title}
                fill
                sizes="80px"
                className="object-contain p-1 transition-all duration-300"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-400 dark:text-[#444444]">
                <ShoppingBag className="h-6 w-6" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <span className="text-[11px] text-zinc-500 dark:text-[#A3A3A3] block font-medium">
              {variantState?.retailerName || product.retailerName || "Verified Retailer"}
            </span>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-[#F5F5F5] line-clamp-2 leading-snug">
              {variantState?.title || product.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-lg font-bold text-[#35C979] tabular-nums">
                {formatCurrency(effectivePriceMinor, currency)}
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-[#737373] font-mono">
                {currency}
              </span>

              {budgetMinor && (
                <span className="text-xs text-zinc-500 dark:text-[#888888]">
                  &bull; Budget: <span className="font-mono text-zinc-700 dark:text-[#D4D4D4]">{formatCurrency(budgetMinor, currency)}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* GENTLE REMINDER BANNER WHEN EXCEEDING BUDGET */}
        {isOverBudget && (
          <div className="mb-5 rounded-xl border border-[#F5B942]/40 bg-amber-500/10 dark:bg-[#1e1910] p-4 text-xs text-[#F5B942] flex items-start gap-3 animate-fadeIn">
            <ShieldAlert className="h-5 w-5 shrink-0 text-[#F5B942] mt-0.5" />
            <div className="space-y-1">
              <strong className="font-semibold text-[#F5B942] text-sm block">
                Gentle Reminder: Confirmed Budget Exceeded
              </strong>
              <p className="leading-relaxed text-zinc-700 dark:text-[#D4D4D4]">
                This selected configuration (<strong>{formatCurrency(effectivePriceMinor, currency)}</strong>) exceeds your confirmed budget limit of <strong>{formatCurrency(budgetMinor!, currency)}</strong> by <span className="font-bold text-[#F5B942]">+{formatCurrency(budgetDeltaMinor, currency)}</span>.
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-[#A3A3A3]">
                You can still proceed if you are comfortable with this price, or switch back to an in-budget option below.
              </p>
            </div>
          </div>
        )}

        {/* Server Relaxation Alert Banner (if Channel3 server relaxed choice) */}
        {variantState?.isRelaxed && variantState.relaxationMessage && (
          <div className="mb-5 rounded-xl border border-[#F5B942]/40 bg-amber-500/10 dark:bg-[#1e1910] p-4 text-xs text-[#F5B942] flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block mb-0.5">Retailer Stock Notice</strong>
              <p className="leading-relaxed text-zinc-700 dark:text-[#D4D4D4]">{variantState.relaxationMessage}</p>
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
          <div className="py-8 text-center text-xs text-zinc-500 dark:text-[#8E8E8E] flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-[#FF6A00]" />
            <span>Calling Channel3 API to fetch all available options for this exact product...</span>
          </div>
        )}

        {/* Variant Dimension Dropdowns UI */}
        {!isLoading && variantState?.options && variantState.options.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-zinc-200 dark:border-[#1f1f1f]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#737373]">
                  Available Options on Retailer Site
                </span>
                {isUpdating && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#FF8126]">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>Updating...</span>
                  </span>
                )}
              </div>
              {budgetMinor && (
                <span className={`text-[11px] font-semibold ${isOverBudget ? "text-[#F5B942]" : "text-[#35C979]"}`}>
                  {isOverBudget ? "⚠️ Over Budget" : "✓ In Budget"}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {variantState.options.map((dimension) => {
                const currentActive =
                  selectedOptions[dimension.name] || dimension.selectedValue || dimension.values[0]?.label || "";

                return (
                  <OptionDropdown
                    key={dimension.name}
                    dimension={dimension}
                    selectedValue={currentActive}
                    basePrice={basePrice}
                    currentTotalPrice={effectivePriceMinor}
                    budgetMinor={budgetMinor}
                    currency={currency}
                    onSelect={(label, optVal) => handleSelectOption(dimension.name, label, optVal)}
                    disabled={isLoading}
                  />
                );
              })}
            </div>
          </div>
        ) : !isLoading && variantState?.status === "unavailable" ? (
          <div className="my-3 py-4 px-4 rounded-xl border border-[#382b1d] bg-[#16120d] text-xs text-[#D4D4D4] space-y-2">
            <div className="flex items-center gap-2 text-[#F5B942] font-semibold">
              <AlertTriangle className="h-4 w-4 text-[#F5B942] shrink-0" />
              <span>Options Verification Notice</span>
            </div>
            <p className="text-[#A3A3A3] leading-relaxed">
              Real-time option variants could not be fetched from Channel3 for this product at the moment. You can review the merchant listing below for all available options.
            </p>
            <a
              href={variantState?.retailerUrl || product.retailerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#FF8126] hover:text-[#FFA057] transition-colors font-medium pt-1"
            >
              <span>Check options on {variantState?.retailerName || product.retailerName || "retailer store"}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : !isLoading ? (
          <div className="my-3 py-4 px-4 rounded-xl border border-[#222222] bg-[#141414] text-xs text-[#A3A3A3] space-y-2">
            <div className="flex items-center gap-2 text-[#F5F5F5] font-semibold">
              <Info className="h-4 w-4 text-[#69A8FF] shrink-0" />
              <span>Standard Product Configuration</span>
            </div>
            <p className="text-[#8E8E8E] leading-relaxed">
              This product is available in its standard verified configuration.
            </p>
          </div>
        ) : null}

        {/* Available Merchant Offers for this exact product */}
        {!isLoading && allOffers.length > 0 && (
          <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-[#1f1f1f] space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-700 dark:text-[#D4D4D4]">
                Available Retailer Offers &amp; Prices ({allOffers.length}):
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-[#737373]">Live merchant data</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {allOffers.map((offer, idx) => (
                <div
                  key={`${offer.domain}_${offer.priceMinor}_${idx}`}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-[#262626] bg-zinc-50 dark:bg-[#141414] p-3 text-xs"
                >
                  <div>
                    <span className="font-medium text-zinc-900 dark:text-[#F5F5F5] block">{offer.domain}</span>
                    <span className="text-[11px] text-zinc-500 dark:text-[#737373]">
                      {offer.availability === "in_stock" ? "In Stock" : "Available"}
                    </span>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span className="font-bold text-[#35C979] font-mono">
                      {formatCurrency(offer.priceMinor, offer.currency || currency)}
                    </span>
                    <a
                      href={offer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-zinc-400 dark:text-[#888888] hover:text-[#FF6A00] transition-colors"
                      title={`Visit ${offer.domain}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verified Specifications */}
        {!isLoading && Object.keys(allSpecs).length > 0 && (
          <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-[#1f1f1f] space-y-2.5">
            <span className="font-semibold text-zinc-700 dark:text-[#D4D4D4] text-xs block">
              Verified Specifications:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(allSpecs).slice(0, 6).map(([key, val]) => (
                <div key={key} className="rounded-lg border border-zinc-200 dark:border-[#202020] bg-zinc-50 dark:bg-[#131313] px-3 py-1.5 text-xs flex justify-between">
                  <span className="text-zinc-500 dark:text-[#888888]">{key}:</span>
                  <span className="text-zinc-800 dark:text-[#E5E5E5] font-medium truncate max-w-[150px]">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal Action Buttons */}
        <div className="mt-8 pt-4 border-t border-zinc-200 dark:border-[#222222] flex flex-col sm:flex-row items-center justify-between gap-3">
          <a
            href={variantState?.retailerUrl || product.retailerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-500 dark:text-[#8E8E8E] hover:text-[#FF6A00] flex items-center gap-1.5 transition-colors font-medium"
          >
            <span>View on retailer store</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="btn-3d-secondary w-full sm:w-auto rounded-xl px-4 py-2.5 text-xs font-bold"
            >
              Cancel
            </button>

            {/* If over budget, show Proceed with Exceeded Budget */}
            {isOverBudget ? (
              <button
                type="button"
                onClick={handleConfirm}
                className="btn-3d-primary w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-bold"
              >
                <span>Proceed with Exceeded Budget ({formatCurrency(effectivePriceMinor, currency)})</span>
                <Check className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConfirm}
                className="btn-3d-primary w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-bold"
              >
                <Check className="h-4 w-4" />
                <span>Confirm Option Selection ({formatCurrency(effectivePriceMinor, currency)})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
