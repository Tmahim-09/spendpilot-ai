"use client";

import React from "react";
import { CheckCircle2, ShieldCheck, Database, Calculator, Scale, ExternalLink } from "lucide-react";

export function TrustSection() {
  const trustPillars = [
    {
      icon: Database,
      title: "Authentic Merchant Data",
      description:
        "Product details, live pricing, and stock availability come directly from verified retailers via Channel3—never AI-invented specifications or placeholder prices.",
    },
    {
      icon: Calculator,
      title: "Strict Budget Caps",
      description:
        "Financial limits and category allocations are computed and validated using deterministic code. The AI cannot alter your budget or recommend over-budget bundles.",
    },
    {
      icon: Scale,
      title: "Objective Trade-Offs",
      description:
        "Every recommendation highlights known limitations and missing information alongside strengths. Rankings are grounded in your requirements, not sponsored placements.",
    },
    {
      icon: ExternalLink,
      title: "Direct Retailer Links",
      description:
        "You always purchase directly from the authorized merchant. SpendPilot does not charge middleman markups or intercept payment credentials.",
    },
  ];

  return (
    <section id="trust" className="py-16 md:py-24 border-b border-[#242424] bg-[#080808]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#35C979]">
            Transparency &amp; Principles
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#F5F5F5] sm:text-3xl md:text-4xl">
            Built for trust, not persuasion
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#A3A3A3]">
            SpendPilot does not pressure you to buy or invent discounts. Our architecture pairs conversational intelligence with verified, source-grounded commerce data.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {trustPillars.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <div
                key={idx}
                className="flex flex-col justify-between rounded-xl border border-[#242424] bg-[#101010] p-6 transition-all hover:border-[#383838]"
              >
                <div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#303030] bg-[#171717] text-[#D4D4D4] mb-4">
                    <Icon className="h-5 w-5 text-[#FF6A00]" aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-semibold text-[#F5F5F5] mb-2">
                    {pillar.title}
                  </h3>
                  <p className="text-xs text-[#A3A3A3] leading-relaxed">
                    {pillar.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#1c1c1c] flex items-center gap-1.5 text-[11px] font-medium text-[#35C979]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Verified Architecture</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Prototype Transparency Notice */}
        <div className="mt-10 rounded-xl border border-[#2a2a2a] bg-[#121212] p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-[#35C979] shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-[#F5F5F5]">
                PayPal AI Hackathon 2026 Prototype
              </h4>
              <p className="text-xs text-[#A3A3A3] mt-0.5">
                SpendPilot connects to the Channel3 product catalog and Google Gemini models with automatic server-side failover. All merchant links direct to official retailer storefronts.
              </p>
            </div>
          </div>
          <span className="shrink-0 text-xs font-mono text-[#737373] bg-[#0a0a0a] px-3 py-1.5 rounded-lg border border-[#222222]">
            API Secrets: Server-Side Only
          </span>
        </div>
      </div>
    </section>
  );
}
