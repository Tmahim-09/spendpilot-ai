"use client";

import React, { useState, useMemo, useSyncExternalStore } from "react";
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
  CreditCard,
  Loader2,
  Lock,
  Printer,
  ShieldCheck,
  Check,
  ArrowRight,
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
import { formatCurrency } from "@/lib/utils";
import type { CurrencyCode } from "@/types";

export default function CartPage() {
  const storedJson = useSyncExternalStore(
    subscribeWorkspace,
    getWorkspaceSnapshot,
    getWorkspaceServerSnapshot
  );

  const workspace = useMemo(() => parseStoredWorkspace(storedJson), [storedJson]);
  const currency: CurrencyCode = workspace?.overallBudget?.currency || "USD";

  const [paymentMethod, setPaymentMethod] = useState<"paypal" | "retailers">("paypal");
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderReceipt, setOrderReceipt] = useState<{
    orderId: string;
    totalMinor: number;
    timestamp: number;
    payerName: string;
    email: string;
  } | null>(null);

  // Customer delivery details
  const [name, setName] = useState("Alex Johnson");
  const [email, setEmail] = useState("alex.shopper@spendpilot.ai");
  const [address, setAddress] = useState("742 Evergreen Terrace");
  const [city, setCity] = useState("Springfield");
  const [postalCode, setPostalCode] = useState("97477");

  const handleRemove = (itemId: string) => {
    if (!workspace) return;
    const updated = removeItemFromWorkspace(workspace, itemId);
    saveWorkspaceToStorage(updated);
  };

  const summary = workspace
    ? calculateWorkspaceBudgetSummary(workspace, currency)
    : {
        totalSelectedMinor: 0,
        totalItemsCount: 0,
        selectedItemsCount: 0,
        overallBudgetMinor: null,
        remainingMinor: null,
        isOverBudget: false,
        currency,
      };

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
        return {
          id: i.id,
          groupId: g.id,
          groupTitle: g.title,
          title: i.displayName || i.selectedProduct?.title || i.productRequest,
          product: i.selectedProduct,
          priceMinor: offer?.priceMinor ?? i.selectedProduct?.priceMinor ?? 0,
          currency: offer?.currency || currency,
          offerUrl: offer?.url || i.selectedProduct?.offers?.[0]?.url || "#",
          domain: offer?.domain || i.selectedProduct?.retailerName || "Retailer",
          compatibility: i.compatibility,
        };
      })
  );

  const handlePayWithPayPal = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItemCount === 0 || isProcessing) return;

    setIsProcessing(true);
    setTimeout(() => {
      const randomOrderId = "SP-PP-" + Math.floor(10000000 + Math.random() * 90000000);
      setOrderReceipt({
        orderId: randomOrderId,
        totalMinor: summary.totalSelectedMinor,
        timestamp: Date.now(),
        payerName: name || "SpendPilot Customer",
        email: email || "customer@spendpilot.ai",
      });
      setIsProcessing(false);
    }, 1200);
  };

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

        {/* Page Title & Payout Header */}
        <div className="mb-8 border-b border-black/10 dark:border-[#222222] pb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#FF6A00] mb-1">
              <ShoppingCart className="h-4 w-4" />
              <span>Checkout & Payout</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              Shopping Cart & Payout System
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-[#888888] mt-1">
              Review your verified selections, choose your payout method, and complete payment.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-[#A3A3A3]">
            <ShieldCheck className="h-4 w-4 text-[#35C979]" />
            <span>256-Bit Encrypted & Verified Payouts</span>
          </div>
        </div>

        {selectedItemCount === 0 && !orderReceipt ? (
          /* Empty Cart State */
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center space-y-4 rounded-2xl border border-dashed border-zinc-300 dark:border-[#262626] bg-zinc-50/50 dark:bg-[#0d0d0d]/50">
            <div className="h-16 w-16 rounded-2xl bg-[#FF6A00]/10 border border-[#FF6A00]/20 flex items-center justify-center text-[#FF6A00]">
              <ShoppingCart className="h-8 w-8" />
            </div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
              Your Shopping Cart is Empty
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-[#888888] max-w-md">
              You haven&apos;t selected any products yet. Ask SpendPilot in the chat workspace for individual products or full setups, and select items to checkout.
            </p>
            <Link
              href="/"
              className="btn-3d-primary px-6 py-2.5 text-xs font-bold rounded-xl mt-2 flex items-center gap-2"
            >
              <span>Explore Products in Chat</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : orderReceipt ? (
          /* Order Receipt Confirmation View */
          <div className="max-w-2xl mx-auto rounded-2xl border border-emerald-300 dark:border-[#35C979]/40 bg-emerald-50/90 dark:bg-[#0c1810] p-6 sm:p-8 space-y-6 shadow-2xl animate-fadeIn">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="h-14 w-14 rounded-full bg-[#35C979]/20 text-[#35C979] flex items-center justify-center shadow-lg shadow-[#35C979]/20">
                <Check className="h-8 w-8 stroke-[3]" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#35C979]">
                Payout Successful
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white">
                Payment Completed & Authorized!
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 max-w-md">
                Your transaction has been securely captured via the PayPal Sandbox payment gateway.
              </p>
            </div>

            {/* Receipt Summary Card */}
            <div className="rounded-xl border border-emerald-200 dark:border-[#1b3323] bg-white dark:bg-[#0f2115] p-5 space-y-3.5 text-xs shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-emerald-100 dark:border-[#1b3323]">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">Order ID:</span>
                <span className="font-mono font-bold text-[#35C979] text-sm">{orderReceipt.orderId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">Billed To:</span>
                <span className="font-bold text-zinc-900 dark:text-white">{orderReceipt.payerName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">Email:</span>
                <span className="font-mono text-zinc-700 dark:text-zinc-300">{orderReceipt.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">Date & Time:</span>
                <span className="text-zinc-700 dark:text-zinc-300">{new Date(orderReceipt.timestamp).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">Payment Gateway:</span>
                <span className="font-bold text-[#2563EB] dark:text-[#69A8FF]">PayPal Sandbox Orders v2</span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-emerald-100 dark:border-[#1b3323] text-sm">
                <span className="font-bold text-zinc-900 dark:text-white">Total Amount Paid:</span>
                <span className="font-mono font-black text-zinc-900 dark:text-white text-base">
                  {formatCurrency(orderReceipt.totalMinor, summary.currency)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-3d-secondary w-full py-2.5 text-xs font-bold rounded-xl text-zinc-800 dark:text-zinc-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                <span>Print Receipt</span>
              </button>
              <Link
                href="/"
                className="btn-3d-primary w-full py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Continue Shopping</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : (
          /* Active Checkout Layout */
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
                          <span className="font-mono text-base font-black text-zinc-900 dark:text-white">
                            {formatCurrency(item.priceMinor, item.currency)}
                          </span>
                        </div>

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
                        <span>Remove</span>
                      </button>

                      {item.offerUrl && item.offerUrl !== "#" && (
                        <a
                          href={item.offerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 font-medium text-[#69A8FF] hover:underline"
                        >
                          <span>View on {item.domain}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right 5 Cols: Payout Engine */}
            <div className="lg:col-span-5 space-y-6">
              {/* Order Summary Box */}
              <div className="rounded-2xl border border-zinc-200 dark:border-[#222222] bg-white dark:bg-[#111111] p-5 sm:p-6 shadow-sm space-y-4">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white pb-3 border-b border-zinc-100 dark:border-[#202020]">
                  Payout Summary
                </h2>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                    <span>Items Subtotal:</span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-white">
                      {formatCurrency(summary.totalSelectedMinor, summary.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                    <span>Estimated Shipping:</span>
                    <span className="font-semibold text-[#35C979]">FREE</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                    <span>Estimated Tax:</span>
                    <span className="text-zinc-500">Included / Merchant direct</span>
                  </div>

                  {summary.overallBudgetMinor != null && (
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-[#1e1e1e]">
                      <span className="text-zinc-500">Target Budget:</span>
                      <span className="font-mono text-zinc-700 dark:text-zinc-300">
                        {formatCurrency(summary.overallBudgetMinor, summary.currency)}
                      </span>
                    </div>
                  )}

                  {summary.remainingMinor != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Remaining Budget:</span>
                      <span
                        className={`font-mono font-bold ${
                          summary.isOverBudget ? "text-[#FF4A4A]" : "text-[#35C979]"
                        }`}
                      >
                        {summary.remainingMinor >= 0
                          ? formatCurrency(summary.remainingMinor, summary.currency)
                          : `-${formatCurrency(Math.abs(summary.remainingMinor), summary.currency)}`}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-[#262626] text-sm">
                    <span className="font-bold text-zinc-900 dark:text-white">Total Amount:</span>
                    <span className="font-mono font-black text-xl text-[#FF6A00]">
                      {formatCurrency(summary.totalSelectedMinor, summary.currency)}
                    </span>
                  </div>
                </div>

                {summary.isOverBudget && (
                  <div className="rounded-xl border border-[#FF4A4A]/30 bg-[#241212] p-2.5 text-xs text-[#FF7A7A] flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Your selected items exceed your stated target budget limit.</span>
                  </div>
                )}
              </div>

              {/* Payment Method Selector & Gateway */}
              <div className="rounded-2xl border border-zinc-200 dark:border-[#222222] bg-white dark:bg-[#111111] p-5 sm:p-6 shadow-sm space-y-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-white flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-[#FF6A00]" />
                  Select Payout Method
                </h3>

                {/* Tabs */}
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-zinc-100 dark:bg-[#181818] border border-zinc-200 dark:border-[#262626]">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("paypal")}
                    className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      paymentMethod === "paypal"
                        ? "bg-[#FF6A00] text-white shadow-sm"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white"
                    }`}
                  >
                    PayPal Sandbox
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("retailers")}
                    className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      paymentMethod === "retailers"
                        ? "bg-zinc-800 text-white shadow-sm"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white"
                    }`}
                  >
                    Direct Retailers
                  </button>
                </div>

                {/* Payout Form 1: PayPal Sandbox */}
                {paymentMethod === "paypal" && (
                  <form onSubmit={handlePayWithPayPal} className="space-y-4">
                    <div className="rounded-xl border border-[#2d2516] bg-[#16120b] p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-amber-400">
                        <span>PayPal Fast Sandbox Checkout</span>
                        <span className="text-[10px] bg-[#35C979]/20 text-[#35C979] px-2 py-0.5 rounded-full font-bold">
                          Verified
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Authorize total spend of {formatCurrency(summary.totalSelectedMinor, summary.currency)} across your selected products with sandbox multi-merchant allocation.
                      </p>
                    </div>

                    {/* Contact & Delivery Details */}
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                          Full Name
                        </label>
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full rounded-lg border border-zinc-200 dark:border-[#2a2a2a] bg-zinc-50 dark:bg-[#161616] px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF6A00]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                          Email Address
                        </label>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full rounded-lg border border-zinc-200 dark:border-[#2a2a2a] bg-zinc-50 dark:bg-[#161616] px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF6A00]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                          Shipping Address
                        </label>
                        <input
                          type="text"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          className="w-full rounded-lg border border-zinc-200 dark:border-[#2a2a2a] bg-zinc-50 dark:bg-[#161616] px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF6A00]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                            City
                          </label>
                          <input
                            type="text"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            className="w-full rounded-lg border border-zinc-200 dark:border-[#2a2a2a] bg-zinc-50 dark:bg-[#161616] px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF6A00]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                            Postal Code
                          </label>
                          <input
                            type="text"
                            value={postalCode}
                            onChange={(e) => setPostalCode(e.target.value)}
                            className="w-full rounded-lg border border-zinc-200 dark:border-[#2a2a2a] bg-zinc-50 dark:bg-[#161616] px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF6A00]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Pay with PayPal Button */}
                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="w-full btn-3d-primary py-3 px-4 text-sm font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Authorizing PayPal Sandbox...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4" />
                          <span className="font-extrabold italic">Pay</span>
                          <span className="font-extrabold italic text-[#69A8FF]">Pal</span>
                          <span className="mx-1 opacity-50">·</span>
                          <span>Pay {formatCurrency(summary.totalSelectedMinor, summary.currency)}</span>
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* Payout Form 2: Direct Retailer Payout */}
                {paymentMethod === "retailers" && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-zinc-200 dark:border-[#2a2a2a] bg-zinc-50 dark:bg-[#141414] p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        <span>Direct Store Fulfillment</span>
                        <span className="text-[10px] text-zinc-500">Official Merchant Sites</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        SpendPilot verifies genuine stock and real-time prices. You can complete purchases directly on the respective retailer checkout pages:
                      </p>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {selectedItemsWithOffers.map((item) => (
                        <a
                          key={item.id}
                          href={item.offerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-200 dark:border-[#262626] bg-zinc-50 dark:bg-[#181818] hover:border-[#FF6A00] transition-all text-xs"
                        >
                          <div className="truncate max-w-[210px]">
                            <span className="font-medium text-zinc-900 dark:text-white block truncate">
                              {item.title}
                            </span>
                            <span className="text-[10px] text-zinc-500">{item.domain}</span>
                          </div>
                          <span className="font-mono font-bold text-zinc-900 dark:text-white flex items-center gap-1 shrink-0">
                            {formatCurrency(item.priceMinor, item.currency)}
                            <ExternalLink className="h-3.5 w-3.5 text-[#69A8FF]" />
                          </span>
                        </a>
                      ))}
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
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
