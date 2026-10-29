"use client";

import React, { useState } from "react";
import { ShieldCheck, Lock, Ban, SlidersHorizontal } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export function SpendingControls() {
  const [activeScenario, setActiveScenario] = useState<"pass" | "fail">("pass");

  const scenarios = {
    pass: {
      title: "Valid Study Setup Basket",
      items: [
        { name: "Ergonomic Mesh Chair", priceMinor: 14999 },
        { name: "Mechanical Keyboard", priceMinor: 6999 },
        { name: "Monitor Light Bar", priceMinor: 4499 },
      ],
      totalMinor: 26497,
      budgetCapMinor: 30000,
      itemCapMinor: 15000,
      isApproved: true,
      message: "Policy check passed: Basket total is $35.03 under budget, and all items respect the $150.00 item cap.",
    },
    fail: {
      title: "Simulated Over-Budget Basket",
      items: [
        { name: "Ergonomic Mesh Chair", priceMinor: 14999 },
        { name: "Mechanical Keyboard", priceMinor: 6999 },
        { name: "Premium 4K Monitor", priceMinor: 24499 },
      ],
      totalMinor: 46497,
      budgetCapMinor: 30000,
      itemCapMinor: 15000,
      isApproved: false,
      message: "Checkout blocked: Basket total ($464.97) exceeds the $300.00 budget limit by $164.97, and 4K Monitor ($244.99) exceeds the $150.00 item cap.",
    },
  };

  const current = scenarios[activeScenario];

  return (
    <section id="spending-rules" className="py-16 md:py-24 border-b border-[#242424] bg-[#0c0c0c]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FF6A00]/30 bg-[#FF6A00]/10 px-3 py-1 text-xs font-semibold text-[#FF6A00] mb-3">
            <Lock className="h-3.5 w-3.5" />
            <span>Deterministic Policy Engine</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#F5F5F5] sm:text-3xl md:text-4xl">
            You set the spending limits. The server enforces them.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#A3A3A3]">
            Unlike generic chatbots that guess prices or execute unrestricted actions, SpendPilot uses a deterministic Purchase Policy Engine. The AI cannot invent prices, bypass rules, or trigger payments.
          </p>
        </div>

        {/* 2-Column layout: Explanation & Interactive Simulator */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Core Policy Principles */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl border border-[#262626] bg-[#101010] p-6 space-y-4">
              <h3 className="text-base font-semibold text-[#F5F5F5] flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-[#FF6A00]" />
                Three-Layer Policy Protection
              </h3>

              <div className="space-y-3 text-xs text-[#A3A3A3]">
                <div className="rounded-lg border border-[#222222] bg-[#141414] p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-[#F5F5F5] font-medium">
                    <span>1. Hard Maximum Budget</span>
                    <span className="text-[#35C979]">Enforced</span>
                  </div>
                  <p className="text-[#888888]">
                    Calculates server-authoritative totals. If the basket is even $0.01 over the user-approved limit, checkout order creation is strictly rejected.
                  </p>
                </div>

                <div className="rounded-lg border border-[#222222] bg-[#141414] p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-[#F5F5F5] font-medium">
                    <span>2. Per-Item Price Cap</span>
                    <span className="text-[#35C979]">Enforced</span>
                  </div>
                  <p className="text-[#888888]">
                    Prevents a single overpriced item from consuming your entire budget. Each product line is evaluated against your preferred item ceiling.
                  </p>
                </div>

                <div className="rounded-lg border border-[#222222] bg-[#141414] p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-[#F5F5F5] font-medium">
                    <span>3. Anti-Tamper Recalculation</span>
                    <span className="text-[#35C979]">Enforced</span>
                  </div>
                  <p className="text-[#888888]">
                    Client price manipulation is impossible. The backend reconstructs items from trusted catalog records before creating any PayPal Sandbox order.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[#242424] bg-[#141414] p-4 text-xs text-[#737373] flex items-start gap-2.5">
              <Lock className="h-4 w-4 text-[#FF6A00] shrink-0 mt-0.5" />
              <span>
                <strong>Architectural Boundary:</strong> The LLM (Gemini) handles language understanding and explanations. It never touches database balances or payment capture APIs.
              </span>
            </div>
          </div>

          {/* Right Column: Interactive Policy Simulator */}
          <div className="lg:col-span-7 rounded-xl border border-[#303030] bg-[#101010] p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-[#242424] gap-3">
              <div>
                <span className="text-xs font-semibold text-[#A3A3A3] uppercase tracking-wider">
                  Interactive Simulator
                </span>
                <h4 className="text-base font-bold text-[#F5F5F5]">
                  Policy Evaluation Engine in Action
                </h4>
              </div>

              {/* Toggle Buttons */}
              <div className="inline-flex rounded-lg border border-[#303030] bg-[#141414] p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveScenario("pass")}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    activeScenario === "pass"
                      ? "bg-[#35C979]/20 text-[#35C979] border border-[#35C979]/30"
                      : "text-[#A3A3A3] hover:text-[#F5F5F5]"
                  }`}
                >
                  Within Budget
                </button>
                <button
                  type="button"
                  onClick={() => setActiveScenario("fail")}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    activeScenario === "fail"
                      ? "bg-[#F05B5B]/20 text-[#F05B5B] border border-[#F05B5B]/30"
                      : "text-[#A3A3A3] hover:text-[#F5F5F5]"
                  }`}
                >
                  Simulate Over-Budget
                </button>
              </div>
            </div>

            {/* Simulated Basket Breakdown */}
            <div className="mt-5 space-y-3">
              <div className="flex justify-between text-xs font-medium text-[#737373] px-1">
                <span>SIMULATED BASKET ITEMS</span>
                <span>UNIT PRICE</span>
              </div>

              <div className="space-y-2">
                {current.items.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg border border-[#222222] bg-[#141414] px-3.5 py-2.5 text-xs"
                  >
                    <span className="text-[#D4D4D4] font-medium">{item.name}</span>
                    <span className="font-mono text-[#F5F5F5] font-semibold tabular-nums">
                      {formatCurrency(item.priceMinor, "USD")}
                    </span>
                  </div>
                ))}
              </div>

              {/* Policy Totals Matrix */}
              <div className="mt-4 pt-3 border-t border-[#222222] space-y-2 text-xs">
                <div className="flex justify-between text-[#A3A3A3]">
                  <span>Enforced Budget Limit:</span>
                  <span className="font-mono text-[#F5F5F5] font-medium tabular-nums">
                    {formatCurrency(current.budgetCapMinor, "USD")}
                  </span>
                </div>
                <div className="flex justify-between text-[#A3A3A3]">
                  <span>Single-Item Cap:</span>
                  <span className="font-mono text-[#F5F5F5] font-medium tabular-nums">
                    {formatCurrency(current.itemCapMinor, "USD")}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold text-[#F5F5F5] pt-1 border-t border-[#222222]">
                  <span>Calculated Basket Total:</span>
                  <span
                    className={`font-mono tabular-nums ${
                      current.isApproved ? "text-[#35C979]" : "text-[#F05B5B]"
                    }`}
                  >
                    {formatCurrency(current.totalMinor, "USD")}
                  </span>
                </div>
              </div>

              {/* Status Outcome Banner */}
              <div
                className={`mt-4 rounded-xl border p-4 text-xs transition-all ${
                  current.isApproved
                    ? "border-[#35C979]/40 bg-[#35C979]/10 text-[#D4D4D4]"
                    : "border-[#F05B5B]/40 bg-[#F05B5B]/10 text-[#D4D4D4]"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {current.isApproved ? (
                    <ShieldCheck className="h-5 w-5 text-[#35C979] shrink-0 mt-0.5" />
                  ) : (
                    <Ban className="h-5 w-5 text-[#F05B5B] shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span
                      className={`block font-bold text-sm ${
                        current.isApproved ? "text-[#35C979]" : "text-[#F05B5B]"
                      }`}
                    >
                      {current.isApproved
                        ? "POLICY EVALUATION: APPROVED FOR CHECKOUT"
                        : "POLICY EVALUATION: CHECKOUT BLOCKED"}
                    </span>
                    <p className="mt-1 text-xs text-[#A3A3A3] leading-relaxed">
                      {current.message}
                    </p>
                  </div>
                </div>
              </div>

              {/* PayPal Sandbox Hook Preview */}
              <div className="mt-3 flex items-center justify-between text-[11px] text-[#737373] bg-[#0c0c0c] p-2.5 rounded-lg border border-[#222222]">
                <span>PayPal Sandbox Endpoint:</span>
                <span className="font-mono text-[#A3A3A3]">
                  {current.isApproved ? "POST /api/paypal/create-order [Ready]" : "[Call Prohibited by Policy]"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
