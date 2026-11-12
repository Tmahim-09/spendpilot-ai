"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { loadScript } from "@paypal/paypal-js";
import {
  ShieldAlert,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  Minus,
  Building2,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { DEMO_PRODUCTS } from "@/lib/paypal/demo-catalog";
import type {
  PublicPayPalConfig,
  CaptureOrderResponsePayload,
} from "@/lib/paypal/types";

export default function PayPalDemoPage() {
  // Cart state: Record<skuId, quantity>
  // Initial cart starts with 1 product from Seller A and 1 from Seller B to immediately demonstrate multi-seller checkout!
  const [cartQuantities, setCartQuantities] = useState<Record<string, number>>({
    "DEMO-SKU-AUDIO-01": 1, // Seller A: $149.00
    "DEMO-SKU-GEAR-02": 1, // Seller B: $79.00
  });

  const [paypalConfig, setPaypalConfig] = useState<PublicPayPalConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [isSdkLoading, setIsSdkLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<CaptureOrderResponsePayload | null>(null);

  // Store server-issued checkout token corresponding to active orderId
  const activeCheckoutTokenRef = useRef<string | null>(null);
  const paypalContainerRef = useRef<HTMLDivElement>(null);
  const paypalButtonsInstanceRef = useRef<{ close?: () => Promise<void> } | null>(null);

  // Fetch public PayPal Sandbox configuration
  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch("/api/paypal/config");
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to load PayPal configuration");
        }
        const data: PublicPayPalConfig = await res.json();
        setPaypalConfig(data);
      } catch (err) {
        setConfigError(err instanceof Error ? err.message : "Configuration load error");
        setIsSdkLoading(false);
      }
    }
    fetchConfig();
  }, []);

  // Compute cart items & subtotals per seller
  const selectedItems = Object.entries(cartQuantities)
    .filter(([, qty]) => qty > 0)
    .map(([skuId, qty]) => {
      const prod = DEMO_PRODUCTS.find((p) => p.skuId === skuId)!;
      return { product: prod, quantity: qty };
    });

  const sellerAItems = selectedItems.filter((i) => i.product.sellerId === "seller_a");
  const sellerBItems = selectedItems.filter((i) => i.product.sellerId === "seller_b");

  const sellerASubtotalMinor = sellerAItems.reduce(
    (sum, i) => sum + i.product.priceMinor * i.quantity,
    0
  );
  const sellerBSubtotalMinor = sellerBItems.reduce(
    (sum, i) => sum + i.product.priceMinor * i.quantity,
    0
  );
  const grandTotalMinor = sellerASubtotalMinor + sellerBSubtotalMinor;
  const grandTotalFormatted = (grandTotalMinor / 100).toFixed(2);

  const handleUpdateQuantity = (skuId: string, delta: number) => {
    setCartQuantities((prev) => {
      const current = prev[skuId] || 0;
      const next = Math.max(0, Math.min(current + delta, 10));
      return { ...prev, [skuId]: next };
    });
    setCheckoutError(null);
  };

  // Render or re-render PayPal Buttons when configuration and cart change
  const renderPayPalButtons = useCallback(async () => {
    if (!paypalConfig || !paypalContainerRef.current) return;

    // Check if at least 1 item exists in cart
    if (selectedItems.length === 0) {
      if (paypalButtonsInstanceRef.current) {
        paypalButtonsInstanceRef.current.close?.();
        paypalButtonsInstanceRef.current = null;
      }
      return;
    }

    try {
      setIsSdkLoading(true);
      setCheckoutError(null);

      // Load only the seller accounts represented in the current demo cart.
      const requiredSellerIds = Array.from(new Set(selectedItems.map((item) => item.product.sellerId)));
      const requiredSellers = paypalConfig.sellers.filter((seller) =>
        requiredSellerIds.includes(seller.id)
      );
      const missingSellerIds = requiredSellerIds.filter((sellerId) => {
        const seller = requiredSellers.find((candidate) => candidate.id === sellerId);
        return !seller?.merchantId?.trim();
      });

      if (missingSellerIds.length > 0) {
        const environmentVariableBySeller: Record<string, string> = {
          seller_a: "PAYPAL_DEMO_SELLER_A_MERCHANT_ID",
          seller_b: "PAYPAL_DEMO_SELLER_B_MERCHANT_ID",
        };
        const missingVariables = missingSellerIds
          .map((sellerId) => environmentVariableBySeller[sellerId] || sellerId.toUpperCase() + "_MERCHANT_ID")
          .join(", ");
        throw new Error(
          "PayPal Sandbox checkout is not configured for the selected demo seller(s). Add " +
          missingVariables +
          " in Vercel Project Settings → Environment Variables (or .env.local for local development), then redeploy. No payment has been created."
        );
      }

      const merchantIds = requiredSellerIds.map((sellerId) =>
        requiredSellers.find((seller) => seller.id === sellerId)!.merchantId!.trim()
      );

      if (new Set(merchantIds).size !== merchantIds.length) {
        throw new Error(
          "Each demo seller must have a different PayPal Sandbox Merchant ID. Configure two distinct Sandbox Business accounts before testing split checkout."
        );
      }

      // Load official PayPal JavaScript SDK
      // For multi-seller checkout, pass merchant IDs array or comma-separated string
      const paypal = await loadScript({
        clientId: paypalConfig.clientId,
        merchantId: merchantIds,
        currency: "USD",
        intent: "capture",
        components: "buttons",
      });

      if (!paypal || !paypal.Buttons) {
        throw new Error("PayPal JavaScript SDK failed to initialize buttons.");
      }

      // Clean up previous buttons instance if any
      if (paypalButtonsInstanceRef.current) {
        try {
          if (typeof paypalButtonsInstanceRef.current.close === "function") {
            await paypalButtonsInstanceRef.current.close();
          }
        } catch {
          // Ignore cleanup errors
        }
        paypalButtonsInstanceRef.current = null;
      }

      if (!paypalContainerRef.current) return;
      paypalContainerRef.current.innerHTML = "";

      const buttons = paypal.Buttons({
        style: {
          layout: "vertical",
          color: "gold",
          shape: "rect",
          label: "paypal",
          height: 48,
        },
        createOrder: async () => {
          setIsProcessing(true);
          setCheckoutError(null);

          try {
            const cartPayload = {
              items: selectedItems.map((i) => ({
                skuId: i.product.skuId,
                quantity: i.quantity,
              })),
            };

            const res = await fetch("/api/paypal/create-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(cartPayload),
            });

            const data = await res.json();
            if (!res.ok || !data.success || !data.orderId) {
              throw new Error(data.error || "Order creation failed.");
            }

            // Save server-signed context token for secure capture verification
            activeCheckoutTokenRef.current = data.checkoutToken;
            return data.orderId;
          } catch (err) {
            setIsProcessing(false);
            const msg = err instanceof Error ? err.message : "Error creating order";
            setCheckoutError(msg);
            throw err;
          }
        },
        onApprove: async (data: { orderID: string }) => {
          try {
            setIsProcessing(true);
            const checkoutToken = activeCheckoutTokenRef.current;
            if (!checkoutToken) {
              throw new Error("Missing server checkout authorization token.");
            }

            const res = await fetch("/api/paypal/capture-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: data.orderID,
                checkoutToken,
              }),
            });

            const captureData: CaptureOrderResponsePayload = await res.json();
            if (!res.ok || !captureData.success) {
              throw new Error(captureData.error || "Failed to capture payment.");
            }

            setCheckoutResult(captureData);
          } catch (err) {
            setCheckoutError(
              err instanceof Error ? err.message : "Capture processing error."
            );
          } finally {
            setIsProcessing(false);
          }
        },
        onCancel: () => {
          setIsProcessing(false);
          setCheckoutError("Payment approval was cancelled. Your cart has been preserved.");
        },
        onError: (err: unknown) => {
          setIsProcessing(false);
          const msg =
            err && typeof err === "object" && "message" in err
              ? String((err as { message: unknown }).message)
              : "An unexpected error occurred with the PayPal Sandbox checkout.";
          setCheckoutError(msg);
        },
      });

      if (paypalContainerRef.current) {
        await buttons.render(paypalContainerRef.current);
        paypalButtonsInstanceRef.current = buttons;
      }
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "SDK loading failure");
    } finally {
      setIsSdkLoading(false);
    }
  }, [paypalConfig, selectedItems]);

  useEffect(() => {
    if (paypalConfig && !checkoutResult) {
      let cancelled = false;
      const t = setTimeout(() => {
        if (!cancelled) {
          void renderPayPalButtons();
        }
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
  }, [paypalConfig, renderPayPalButtons, checkoutResult]);

  const handleResetCheckout = () => {
    setCheckoutResult(null);
    setCheckoutError(null);
    activeCheckoutTokenRef.current = null;
    setCartQuantities({
      "DEMO-SKU-AUDIO-01": 1,
      "DEMO-SKU-GEAR-02": 1,
    });
  };

  return (
    <div className="min-h-screen bg-[#080808] text-[#D4D4D4] flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-[#242424] bg-[#0c0c0c]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-xs font-medium text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to AI Shopping Assistant</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6A00]/40 bg-[#FF6A00]/10 px-3 py-1 text-xs font-semibold text-[#FF8126]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FF6A00] animate-pulse" />
              <span>PayPal Orders v2 Multi-Seller Sandbox</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Prominent Sandbox Notice Banner */}
        <div
          role="alert"
          className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/20 via-[#18120b] to-[#141414] p-5 shadow-lg shadow-amber-950/10 flex items-start gap-4 animate-fadeIn"
        >
          <ShieldAlert className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-amber-300 tracking-tight">
              PayPal Sandbox Demonstration
            </h2>
            <p className="text-xs sm:text-sm text-[#D4D4D4] leading-relaxed">
              These are fixed sample products for a Sandbox payment test. They are not imported
              from your shopping list, do not place orders with actual retailers, and do
              not arrange physical delivery.
            </p>
            <p className="text-[11px] text-[#A3A3A3] pt-1">
              Demonstrates a single PayPal Orders v2 checkout capturing funds across{" "}
              <strong className="text-white">two distinct Sandbox Business sellers</strong> with
              independent purchase units.
            </p>
          </div>
        </div>

        {/* Configuration Error Banner (if seller merchant IDs are missing) */}
        {configError && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/20 p-5 text-red-200 text-sm flex items-start gap-3">
            <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-300">Sandbox Configuration Required</p>
              <p className="text-xs text-red-200 mt-1">{configError}</p>
            </div>
          </div>
        )}

        {/* ── CHECKOUT RECEIPT (WHEN TRANSACTION IS COMPLETED OR PARTIALLY COMPLETED) ── */}
        {checkoutResult ? (
          <div className="rounded-2xl border border-[#2c2c2c] bg-[#121212] p-6 sm:p-8 space-y-6 shadow-2xl animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#222222] pb-6">
              <div className="flex items-center gap-3">
                {checkoutResult.overallStatus === "COMPLETED" ? (
                  <div className="h-12 w-12 rounded-2xl bg-[#35C979]/20 border border-[#35C979]/40 flex items-center justify-center text-[#35C979]">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                ) : checkoutResult.overallStatus === "PARTIALLY_COMPLETED" ? (
                  <div className="h-12 w-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                ) : (
                  <div className="h-12 w-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                    <XCircle className="h-7 w-7" />
                  </div>
                )}

                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white">
                    {checkoutResult.overallStatus === "COMPLETED"
                      ? "Sandbox transaction completed."
                      : checkoutResult.overallStatus === "PARTIALLY_COMPLETED"
                      ? "Partial Sandbox payment captured."
                      : "Sandbox transaction failed."}
                  </h3>
                  <p className="text-xs text-[#A3A3A3]">
                    {checkoutResult.overallStatus === "COMPLETED"
                      ? "Separate Sandbox seller captures confirmed."
                      : "Some seller captures succeeded while others were declined."}
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right">
                <span className="text-[11px] text-[#737373] uppercase tracking-wider block">
                  PayPal Order ID
                </span>
                <span className="text-sm font-mono font-bold text-[#FF8126]">
                  {checkoutResult.orderId}
                </span>
              </div>
            </div>

            {/* Individual Seller Captures Breakdown */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#A3A3A3]">
                Multi-Seller Capture Records
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {checkoutResult.sellerCaptures.map((capture) => (
                  <div
                    key={capture.referenceId}
                    className="rounded-xl border border-[#262626] bg-[#161616] p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-[#FF6A00]" />
                        <span className="text-sm font-semibold text-white">
                          {capture.sellerName}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          capture.status === "COMPLETED"
                            ? "bg-[#35C979]/20 text-[#35C979] border border-[#35C979]/40"
                            : "bg-red-500/20 text-red-400 border border-red-500/40"
                        }`}
                      >
                        {capture.status}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-[#A3A3A3] font-mono">
                      <div className="flex justify-between">
                        <span>Merchant ID:</span>
                        <span className="text-white">{capture.merchantId || "Configured in Sandbox"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Capture ID:</span>
                        <span className="text-white">{capture.captureId || "None"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Reference ID:</span>
                        <span className="text-[#888888] truncate max-w-[200px]">
                          {capture.referenceId}
                        </span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-[#222222] font-semibold">
                        <span>Settled Subtotal:</span>
                        <span className="text-[#35C979]">
                          ${(capture.subtotalMinor / 100).toFixed(2)} USD
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Receipt Footer Notice */}
            <div className="rounded-xl border border-[#242424] bg-[#141414] p-4 text-xs text-[#888888] space-y-1">
              <p className="font-semibold text-[#D4D4D4]">
                This is a payment demonstration. No real retailer order or delivery was created.
              </p>
              <p>
                Each purchase unit was captured independently in the PayPal Sandbox environment,
                simulating multi-vendor marketplace settlement without placing physical retailer orders.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleResetCheckout}
                className="btn-3d-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Test Another Multi-Seller Checkout</span>
              </button>
            </div>
          </div>
        ) : (
          /* ── DEMO PRODUCT CATALOG & SELECTION ── */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left 8 Columns: Demo Seller Products */}
            <div className="lg:col-span-8 space-y-8">
              {/* Demo Seller A Section */}
              <section className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#222222] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-xl border border-[#FF6A00]/40 bg-[#161210] flex items-center justify-center text-[#FF6A00]">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">
                        Seller A: SpendPilot Audio Lab
                      </h3>
                      <p className="text-xs text-[#737373]">
                        Sandbox Merchant ID:{" "}
                        <span className="font-mono text-[#A3A3A3]">
                          {paypalConfig?.sellers.find((s) => s.id === "seller_a")?.merchantId ||
                            "Configured in server environment"}
                        </span>
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[#35C979] bg-[#35C979]/10 px-2.5 py-0.5 rounded-full border border-[#35C979]/20">
                    Seller 1 of 2
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {DEMO_PRODUCTS.filter((p) => p.sellerId === "seller_a").map((product) => {
                    const qty = cartQuantities[product.skuId] || 0;
                    return (
                      <div
                        key={product.skuId}
                        className="rounded-2xl border border-[#242424] bg-[#121212] overflow-hidden flex flex-col justify-between p-4 space-y-3 transition-all hover:border-[#383838]"
                      >
                        <div className="space-y-2.5">
                          <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-[#181818]">
                            <Image
                              src={product.imageUrl}
                              alt={product.title}
                              fill
                              sizes="(max-width: 768px) 100vw, 350px"
                              className="object-cover"
                            />
                            {product.badge && (
                              <span className="absolute top-2 left-2 rounded-md bg-black/70 backdrop-blur-md px-2 py-0.5 text-[10px] font-semibold text-[#FF8126] border border-[#FF6A00]/30">
                                {product.badge}
                              </span>
                            )}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white line-clamp-1">
                              {product.title}
                            </h4>
                            <p className="text-xs text-[#888888] line-clamp-2 mt-1">
                              {product.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-[#1e1e1e]">
                          <span className="text-base font-bold text-white">
                            ${(product.priceMinor / 100).toFixed(2)}
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(product.skuId, -1)}
                              disabled={qty <= 0}
                              className="h-8 w-8 rounded-lg btn-3d-secondary flex items-center justify-center text-[#D4D4D4] disabled:opacity-30 cursor-pointer"
                              aria-label={`Decrease ${product.title}`}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-6 text-center text-sm font-semibold text-white">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(product.skuId, 1)}
                              className="h-8 w-8 rounded-lg btn-3d-secondary flex items-center justify-center text-[#D4D4D4] cursor-pointer"
                              aria-label={`Increase ${product.title}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Demo Seller B Section */}
              <section className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#222222] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-xl border border-[#38BDF8]/40 bg-[#0e161c] flex items-center justify-center text-[#38BDF8]">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">
                        Seller B: SpendPilot Workspace Gear
                      </h3>
                      <p className="text-xs text-[#737373]">
                        Sandbox Merchant ID:{" "}
                        <span className="font-mono text-[#A3A3A3]">
                          {paypalConfig?.sellers.find((s) => s.id === "seller_b")?.merchantId ||
                            "Configured in server environment"}
                        </span>
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[#38BDF8] bg-[#38BDF8]/10 px-2.5 py-0.5 rounded-full border border-[#38BDF8]/20">
                    Seller 2 of 2
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {DEMO_PRODUCTS.filter((p) => p.sellerId === "seller_b").map((product) => {
                    const qty = cartQuantities[product.skuId] || 0;
                    return (
                      <div
                        key={product.skuId}
                        className="rounded-2xl border border-[#242424] bg-[#121212] overflow-hidden flex flex-col justify-between p-4 space-y-3 transition-all hover:border-[#383838]"
                      >
                        <div className="space-y-2.5">
                          <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-[#181818]">
                            <Image
                              src={product.imageUrl}
                              alt={product.title}
                              fill
                              sizes="(max-width: 768px) 100vw, 350px"
                              className="object-cover"
                            />
                            {product.badge && (
                              <span className="absolute top-2 left-2 rounded-md bg-black/70 backdrop-blur-md px-2 py-0.5 text-[10px] font-semibold text-[#38BDF8] border border-[#38BDF8]/30">
                                {product.badge}
                              </span>
                            )}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white line-clamp-1">
                              {product.title}
                            </h4>
                            <p className="text-xs text-[#888888] line-clamp-2 mt-1">
                              {product.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-[#1e1e1e]">
                          <span className="text-base font-bold text-white">
                            ${(product.priceMinor / 100).toFixed(2)}
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(product.skuId, -1)}
                              disabled={qty <= 0}
                              className="h-8 w-8 rounded-lg btn-3d-secondary flex items-center justify-center text-[#D4D4D4] disabled:opacity-30 cursor-pointer"
                              aria-label={`Decrease ${product.title}`}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-6 text-center text-sm font-semibold text-white">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(product.skuId, 1)}
                              className="h-8 w-8 rounded-lg btn-3d-secondary flex items-center justify-center text-[#D4D4D4] cursor-pointer"
                              aria-label={`Increase ${product.title}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Right 4 Columns: Multi-Seller Cart Summary & PayPal Checkout */}
            <div className="lg:col-span-4">
              <div className="sticky top-24 rounded-2xl border border-[#282828] bg-[#111111] p-5 space-y-6 shadow-xl">
                <div className="border-b border-[#202020] pb-4">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="h-5 w-5 text-[#FF6A00]" />
                    <h3 className="text-base font-bold text-white">Multi-Seller Order</h3>
                  </div>
                  <p className="text-xs text-[#737373] mt-0.5">
                    Single checkout covering multiple merchants
                  </p>
                </div>

                {/* Selected Items List */}
                {selectedItems.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#737373]">
                    Your cart is empty. Add items from either seller above to start.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Seller A Items */}
                    {sellerAItems.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#FF8126]">
                          SpendPilot Audio Lab ({sellerAItems.length})
                        </span>
                        {sellerAItems.map((item) => (
                          <div
                            key={item.product.skuId}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="text-[#D4D4D4] truncate max-w-[180px]">
                              {item.quantity}x {item.product.title}
                            </span>
                            <span className="font-mono text-white">
                              ${((item.product.priceMinor * item.quantity) / 100).toFixed(2)}
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between text-[11px] font-medium text-[#888888] pt-1 border-t border-[#1a1a1a]">
                          <span>Seller A Subtotal:</span>
                          <span className="font-mono">${(sellerASubtotalMinor / 100).toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    {/* Seller B Items */}
                    {sellerBItems.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-[#202020]">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#38BDF8]">
                          SpendPilot Workspace Gear ({sellerBItems.length})
                        </span>
                        {sellerBItems.map((item) => (
                          <div
                            key={item.product.skuId}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="text-[#D4D4D4] truncate max-w-[180px]">
                              {item.quantity}x {item.product.title}
                            </span>
                            <span className="font-mono text-white">
                              ${((item.product.priceMinor * item.quantity) / 100).toFixed(2)}
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between text-[11px] font-medium text-[#888888] pt-1 border-t border-[#1a1a1a]">
                          <span>Seller B Subtotal:</span>
                          <span className="font-mono">${(sellerBSubtotalMinor / 100).toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    {/* Grand Total */}
                    <div className="pt-3 border-t border-[#242424] space-y-1">
                      <div className="flex justify-between text-sm font-bold text-white">
                        <span>Combined Total:</span>
                        <span className="text-[#35C979] font-mono text-base">
                          ${grandTotalFormatted} USD
                        </span>
                      </div>
                      <p className="text-[10px] text-[#737373]">
                        Authorized in one single payment. Split into 2 purchase units by PayPal.
                      </p>
                    </div>

                    {/* Checkout Error Message */}
                    {checkoutError && (
                      <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-300 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                        <span>{checkoutError}</span>
                      </div>
                    )}

                    {/* PayPal Button Container */}
                    <div className="space-y-2 pt-2">
                      {isSdkLoading && (
                        <div className="rounded-xl border border-[#222222] bg-[#161616] p-4 text-center space-y-2 animate-pulse">
                          <div className="h-10 bg-[#242424] rounded-lg" />
                          <span className="text-xs text-[#737373]">
                            Loading PayPal Sandbox Multi-Seller SDK...
                          </span>
                        </div>
                      )}

                      <div
                        ref={paypalContainerRef}
                        id="paypal-button-container"
                        className={`min-h-[48px] ${isSdkLoading || isProcessing ? "opacity-50 pointer-events-none" : ""}`}
                      />

                      {isProcessing && (
                        <div className="flex items-center justify-center gap-2 text-xs text-[#FF8126] py-1">
                          <PackageCheck className="h-4 w-4 animate-spin" />
                          <span>Processing Sandbox capture...</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
