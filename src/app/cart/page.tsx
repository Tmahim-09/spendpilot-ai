"use client";

import React, { useMemo, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ShoppingCart,
  ArrowLeft,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ShieldAlert,
  ArrowRight,
  Store,
  CreditCard,
} from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import {
  calculateWorkspaceBudgetSummary,
  removeItemFromWorkspace,
} from "@/lib/workspace/workspace-manager";
import {
  subscribeWorkspace,
  getWorkspaceSnapshot,
  getWorkspaceServerSnapshot,
  saveWorkspaceToStorage,
  parseStoredWorkspace,
} from "@/lib/workspace/workspace-storage";
import { formatMinorUnits, isSupportedCurrency } from "@/lib/money";
import type { CurrencyCode } from "@/types";
import type { WorkspaceBudgetSummary } from "@/lib/workspace/types";

export default function CartPage() {
  const storedJson = useSyncExternalStore(
    subscribeWorkspace,
    getWorkspaceSnapshot,
    getWorkspaceServerSnapshot
  );

  const workspace = useMemo(() => parseStoredWorkspace(storedJson), [storedJson]);
  const currency: CurrencyCode = workspace?.overallBudget?.currency || "USD";

  const handleRemove = (itemId: string) => {
    if (!workspace) return;
    const updated = removeItemFromWorkspace(workspace, itemId);
    saveWorkspaceToStorage(updated);
  };

  const summary: WorkspaceBudgetSummary = workspace
    ? calculateWorkspaceBudgetSummary(workspace, currency)
    : {
        totalSelectedMinor: 0,
        totalsByCurrency: {},
        selectedTotalInBudgetCurrencyMinor: null,
        budgetCurrency: null,
        status: "no_budget",
        foreignCurrencyTotals: {},
        unpricedCount: 0,
        unsupportedCurrencyCount: 0,
        overallBudgetMinor: null,
        remainingMinor: null,
        isOverBudget: false,
        currency,
        groups: [],
      };

  const currencyEntries = Object.entries(summary.totalsByCurrency || {}).filter(
    (e): e is [string, number] => typeof e[1] === "number" && e[1] > 0
  );
  const hasMultipleCurrencies = currencyEntries.length > 1;

  const selectedItemCount = workspace
    ? workspace.groups.reduce(
        (acc, g) => acc + g.items.filter((i) => i.status === "selected").length,
        0
      )
    : 0;

  const selectedItemsWithOffers = (workspace?.groups || []).flatMap((g) =>
    g.items
      .filter((i) => i.status === "selected" && i.selectedProduct)
      .map((i) => {
        const offer = i.selectedOffer || i.selectedProduct?.selectedOffer || i.selectedProduct?.offers?.[0];
        const rawPrice = offer?.priceMinor ?? i.selectedProduct?.priceMinor ?? null;
        const rawCurrency = offer?.currency || i.selectedProduct?.currency || null;
        const isValidPrice =
          typeof rawPrice === "number" &&
          Number.isFinite(rawPrice) &&
          Number.isSafeInteger(rawPrice) &&
          rawPrice > 0;
        const isSupported = isSupportedCurrency(rawCurrency);

        return {
          id: i.id,
          groupId: g.id,
          groupTitle: g.title,
          title: i.displayName || i.selectedProduct?.title || i.productRequest,
          product: i.selectedProduct,
          priceMinor: isValidPrice ? rawPrice : null,
          currency: isSupported ? rawCurrency : null,
          isValidPrice,
          isSupportedCurrency: isSupported,
          offerUrl: offer?.url || i.selectedProduct?.offers?.[0]?.url || i.selectedProduct?.retailerUrl || "#",
          domain: offer?.domain || i.selectedProduct?.retailerName || "Retailer",
          compatibility: i.compatibility,
          selectedVariant: i.selectedVariant,
        };
      })
  );

  const handleOpenAllRetailers = () => {
    selectedItemsWithOffers.forEach((item) => {
      if (item.offerUrl && item.offerUrl !== "#") {
        window.open(item.offerUrl, "_blank", "noopener,noreferrer");
      }
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-transparent text-zinc-900 dark:text-[#E4E4E7]">
      <SiteHeader
        selectedItemCount={selectedItemCount}
        totalSelectedMinor={summary.totalSelectedMinor}
        currency={currency}
        totalsByCurrency={summary.totalsByCurrency}
      />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        {/* Navigation Breadcrumb */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-[#A3A3A3] hover:text-[#FF6A00] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Shopping Assistant</span>
          </Link>
        </div>

        {/* Page Title Header */}
        <div className="mb-8 border-b border-black/10 dark:border-[#222222] pb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#FF6A00] mb-1">
              <ShoppingCart className="h-4 w-4" />
              <span>Shopping Cart</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              My Selected Products & Retailer Offers
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-[#888888] mt-1">
              Review your verified selections with live merchant prices, and complete your purchases directly on official retailer websites.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-[#A3A3A3]">
            <Store className="h-4 w-4 text-[#FF6A00]" />
            <span>Direct Retailer Fulfillment</span>
          </div>
        </div>

        {selectedItemCount === 0 ? (
          /* Empty Cart State */
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center space-y-4 rounded-2xl border border-dashed border-zinc-300 dark:border-[#262626] bg-zinc-50/50 dark:bg-[#0d0d0d]/50">
            <div className="h-16 w-16 rounded-2xl bg-[#FF6A00]/10 border border-[#FF6A00]/20 flex items-center justify-center text-[#FF6A00]">
              <ShoppingCart className="h-8 w-8" />
            </div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
              Your Shopping Cart is Empty
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-[#888888] max-w-md">
              You haven&apos;t selected any products yet. Ask SpendPilot in the chat workspace for individual products or full setups, compare specs, and select items to build your shopping list.
            </p>
            <Link
              href="/"
              className="btn-3d-primary px-6 py-2.5 text-xs font-bold rounded-xl mt-2 flex items-center gap-2"
            >
              <span>Explore Products in Chat</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          /* Active Cart Layout */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 7 Cols: Selected Products */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                  Selected Products ({selectedItemCount})
                </h2>
                <Link
                  href="/"
                  className="text-xs font-semibold text-[#FF6A00] hover:underline"
                >
                  + Add more items
                </Link>
              </div>

              <div className="space-y-4">
                {selectedItemsWithOffers.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-zinc-200 dark:border-[#222222] bg-white dark:bg-[#111111] p-4 sm:p-5 shadow-sm space-y-3.5 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      {/* Product Image */}
                      <div className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 rounded-xl border border-zinc-200 dark:border-[#262626] bg-zinc-50 dark:bg-[#181818] overflow-hidden flex items-center justify-center">
                        {item.product?.imageUrl ? (
                          <Image
                            src={item.product.imageUrl}
                            alt={item.title}
                            fill
                            className="object-contain p-2"
                            sizes="80px"
                            unoptimized
                          />
                        ) : (
                          <ShoppingCart className="h-6 w-6 text-zinc-400 dark:text-zinc-600" />
                        )}
                      </div>

                      {/* Product Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF6A00]">
                              {item.groupTitle}
                            </span>
                            <h3 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                              {item.title}
                            </h3>
                          </div>
                          {item.isValidPrice && item.isSupportedCurrency && item.priceMinor != null && item.currency ? (
                            <span className="font-mono text-base font-black text-zinc-900 dark:text-white">
                              {formatMinorUnits(item.priceMinor, item.currency)}
                            </span>
                          ) : (
                            <span className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                              Price unavailable
                            </span>
                          )}
                        </div>

                        {/* Selected Variant Information */}
                        {item.selectedVariant && (
                          <p className="mt-1 text-[11px] text-[#FF6A00] font-medium">
                            Variant:{" "}
                            {typeof item.selectedVariant === "string"
                              ? item.selectedVariant
                              : (item.selectedVariant as Record<string, string>).title ||
                                Object.entries(item.selectedVariant)
                                  .filter(([k]) => k !== "variantId")
                                  .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
                                  .join(" / ") ||
                                (item.selectedVariant as Record<string, string>).variantId ||
                                "Custom Configuration"}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-[#888888]">
                          <span className="rounded-md bg-zinc-100 dark:bg-[#1a1a1a] px-2 py-0.5 text-[11px] font-medium border border-zinc-200 dark:border-[#262626]">
                            Sold by: <strong className="text-zinc-800 dark:text-zinc-200">{item.domain}</strong>
                          </span>

                          {/* Compatibility Badge */}
                          {item.compatibility && item.compatibility.status !== "not_applicable" && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border ${
                                item.compatibility.status === "verified_compatible"
                                  ? "bg-[#35C979]/15 text-[#35C979] border-[#35C979]/30"
                                  : item.compatibility.status === "verified_incompatible"
                                  ? "bg-[#FF4A4A]/15 text-[#FF7A7A] border-[#FF4A4A]/30"
                                  : "bg-amber-500/15 text-amber-500 border-amber-500/30"
                              }`}
                            >
                              {item.compatibility.status === "verified_compatible" ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3" /> Compatible
                                </>
                              ) : item.compatibility.status === "verified_incompatible" ? (
                                <>
                                  <ShieldAlert className="h-3 w-3" /> Incompatible
                                </>
                              ) : (
                                <>
                                  <HelpCircle className="h-3 w-3" /> Not verified
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="border-t border-zinc-100 dark:border-[#1e1e1e] pt-3 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => handleRemove(item.id)}
                        className="text-zinc-500 dark:text-[#888888] hover:text-[#FF4A4A] transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove from Cart</span>
                      </button>

                      {item.offerUrl && item.offerUrl !== "#" ? (
                        <a
                          href={item.offerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-3d-primary py-1.5 px-3 text-xs font-bold rounded-lg flex items-center gap-1.5 text-white"
                        >
                          <span>Buy on {item.domain}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-zinc-400 text-[11px] italic">
                          Merchant link unavailable
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right 5 Cols: Order Summary & Checkout Guidance */}
            <div className="lg:col-span-5 space-y-6">
              {/* Order Summary Box */}
              <div className="rounded-2xl border border-zinc-200 dark:border-[#222222] bg-white dark:bg-[#111111] p-5 sm:p-6 shadow-sm space-y-4">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white pb-3 border-b border-zinc-100 dark:border-[#202020]">
                  Order & Budget Summary
                </h2>

                <div className="space-y-2 text-xs">
                  {currencyEntries.length === 0 ? (
                    <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                      <span>Selected Items ({selectedItemCount}):</span>
                      <span className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                        Price unavailable
                      </span>
                    </div>
                  ) : !hasMultipleCurrencies ? (
                    <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                      <span>Selected Items ({selectedItemCount}):</span>
                      <span className="font-mono font-bold text-zinc-900 dark:text-white">
                        {formatMinorUnits(currencyEntries[0][1], currencyEntries[0][0] as CurrencyCode)}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2 py-1">
                      <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                        <span>Selected Items:</span>
                        <span className="font-bold">{selectedItemCount} items</span>
                      </div>
                      <div className="rounded-xl border border-zinc-200 dark:border-[#222222] bg-zinc-50 dark:bg-[#161616] p-3 space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Subtotals by Currency:</span>
                        {currencyEntries.map(([c, minor]) => (
                          <div key={c} className="flex items-center justify-between text-xs font-mono">
                            <span className="font-bold text-zinc-700 dark:text-zinc-300">{c}:</span>
                            <span className="font-bold text-zinc-900 dark:text-white">{formatMinorUnits(minor, c as CurrencyCode)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {summary.overallBudgetMinor != null && summary.budgetCurrency && (
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-[#1e1e1e]">
                      <span className="text-zinc-500">Target Budget ({summary.budgetCurrency}):</span>
                      <span className="font-mono text-zinc-700 dark:text-zinc-300">
                        {formatMinorUnits(summary.overallBudgetMinor, summary.budgetCurrency)}
                      </span>
                    </div>
                  )}

                  {summary.remainingMinor != null && summary.budgetCurrency && (
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Remaining Budget ({summary.budgetCurrency}):</span>
                      <span
                        className={`font-mono font-bold ${
                          summary.isOverBudget ? "text-[#FF4A4A]" : "text-[#35C979]"
                        }`}
                      >
                        {summary.remainingMinor >= 0
                          ? formatMinorUnits(summary.remainingMinor, summary.budgetCurrency)
                          : `-${formatMinorUnits(Math.abs(summary.remainingMinor), summary.budgetCurrency)}`}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-[#262626] text-sm">
                    <span className="font-bold text-zinc-900 dark:text-white">Total Amount:</span>
                    {currencyEntries.length === 0 ? (
                      <span className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                        Price unavailable
                      </span>
                    ) : !hasMultipleCurrencies ? (
                      <span className="font-mono font-black text-xl text-[#FF6A00]">
                        {formatMinorUnits(currencyEntries[0][1], currencyEntries[0][0] as CurrencyCode)}
                      </span>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        {currencyEntries.map(([c, minor]) => (
                          <span key={c} className="font-mono font-black text-base text-[#FF6A00]">
                            {c}: {formatMinorUnits(minor, c as CurrencyCode)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {summary.unpricedCount > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      {summary.unpricedCount} selected item{summary.unpricedCount > 1 ? "s have" : " has"} unavailable or unverified pricing and {summary.unpricedCount > 1 ? "are" : "is"} excluded from budget totals.
                    </span>
                  </div>
                )}

                {summary.unsupportedCurrencyCount > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      {summary.unsupportedCurrencyCount} selected item{summary.unsupportedCurrencyCount > 1 ? "s use" : " uses"} an unsupported currency and cannot participate in budget verification.
                    </span>
                  </div>
                )}

                {summary.status === "partially_comparable" && Object.keys(summary.foreignCurrencyTotals || {}).length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      Foreign-currency selections ({Object.entries(summary.foreignCurrencyTotals || {}).map(([c, m]) => `${c}: ${formatMinorUnits(m, c as CurrencyCode)}`).join(", ")}) are excluded from the {summary.budgetCurrency} target budget comparison.
                    </span>
                  </div>
                )}

                {summary.status === "not_comparable" && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      {Object.keys(summary.foreignCurrencyTotals || {}).length > 0
                        ? `Selected items are in currencies that differ from your stated target budget (${summary.budgetCurrency}). Monetary comparison requires an explicit conversion.`
                        : `Selected items have unverified or missing prices preventing a complete monetary comparison against your target budget (${summary.budgetCurrency}).`}
                    </span>
                  </div>
                )}

                {summary.isOverBudget && (
                  <div className="rounded-xl border border-[#FF4A4A]/30 bg-[#241212] p-2.5 text-xs text-[#FF7A7A] flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Your selected items exceed your stated target budget limit.</span>
                  </div>
                )}

                {/* Direct Retailer Purchasing Information */}
                <div className="pt-3 border-t border-zinc-100 dark:border-[#202020] space-y-3">
                  <div className="rounded-xl border border-zinc-200 dark:border-[#2a2a2a] bg-zinc-50 dark:bg-[#161616] p-3.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      <Store className="h-4 w-4 text-[#FF6A00]" />
                      <span>Purchasing on Retailer Websites</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      SpendPilot indexes verified live stock and prices across partner merchants. Click any product&apos;s button to open the retailer&apos;s official checkout page and complete your order.
                    </p>
                  </div>

                  {selectedItemsWithOffers.length > 1 && (
                    <button
                      type="button"
                      onClick={handleOpenAllRetailers}
                      className="btn-3d-secondary w-full py-2.5 text-xs font-bold rounded-xl text-zinc-800 dark:text-zinc-200 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Open All Retailer Checkouts</span>
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* PayPal Sandbox Demonstration Callout */}
              <div className="rounded-2xl border border-amber-200 dark:border-[#382b18] bg-amber-50/70 dark:bg-[#19140c] p-5 sm:p-6 shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  <CreditCard className="h-4 w-4" />
                  <span>PayPal AI Hackathon Demonstration</span>
                </div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Multi-Seller Sandbox Checkout
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  This is a separate Sandbox test with four fixed sample products and two test seller accounts. It does not charge the products in this cart or send money to the retailers listed above. Real retailer purchases still happen on each retailer's own checkout page. To take one PayPal payment and split it to real retailers, each retailer must join SpendPilot through PayPal's marketplace seller onboarding and authorize your platform. A Channel3 product link by itself cannot receive a PayPal payment.
                </p>
                <Link
                  href="/paypal-demo"
                  className="btn-3d-primary w-full py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 text-white"
                >
                  <span>Open PayPal Sandbox Demo</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
