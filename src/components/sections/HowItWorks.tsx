"use client";

import React from "react";
import { MessageSquareText, Search, ShieldCheck } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      number: "01",
      icon: MessageSquareText,
      title: "Tell SpendPilot what you need",
      description:
        "Describe your shopping goal in plain language with your constraints and budget. SpendPilot interprets your requirements, preferences, and price limits.",
      tag: "Gemini Intent Parsing",
    },
    {
      number: "02",
      icon: Search,
      title: "Compare source-backed products",
      description:
        "Explore real product options with verified retailer prices and specifications. AI explains trade-offs using retrieved facts—never fabricated specs or fake prices.",
      tag: "Channel3 Discovery",
    },
    {
      number: "03",
      icon: ShieldCheck,
      title: "Check spending rules & approve checkout",
      description:
        "The deterministic Purchase Policy Engine verifies your total basket against budget caps on the server before you review and approve PayPal checkout.",
      tag: "PayPal Sandbox & Policy Engine",
    },
  ];

  return (
    <section id="how-it-works" className="py-16 md:py-24 border-b border-[#242424] bg-[#0c0c0c]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#FF6A00]">
            How It Works
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#F5F5F5] sm:text-3xl md:text-4xl">
            A shopping assistant designed around your budget
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#A3A3A3]">
            SpendPilot bridges conversational discovery and deterministic spending control in three transparent steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="relative flex flex-col justify-between rounded-xl border border-[#262626] bg-[#101010] p-6 sm:p-8 transition-all hover:border-[#3d3d3d] hover:bg-[#141414]"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-xs font-mono font-semibold text-[#FF6A00] tracking-widest bg-[#FF6A00]/10 px-2.5 py-1 rounded-md border border-[#FF6A00]/20">
                      STEP {step.number}
                    </span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#303030] bg-[#171717] text-[#D4D4D4]">
                      <Icon className="h-5 w-5 text-[#FF6A00]" aria-hidden="true" />
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-[#F5F5F5] mb-2.5">
                    {step.title}
                  </h3>

                  <p className="text-sm text-[#A3A3A3] leading-relaxed">
                    {step.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-[#222222]">
                  <span className="inline-block text-[11px] font-medium text-[#737373]">
                    Under the hood: <strong className="text-[#A3A3A3]">{step.tag}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

