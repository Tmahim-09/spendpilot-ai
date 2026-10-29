"use client";

import React from "react";
import { CheckCircle2, ShieldAlert, Cpu, CreditCard, Sparkles, Database } from "lucide-react";

export function TrustSection() {
  const trustPillars = [
    {
      icon: Database,
      title: "Facts Come From Data Sources",
      description:
        "Product prices, availability, titles, and specifications come from Channel3 retailer data or the controlled sample catalog—never AI invention or hallucinated specifications.",
    },
    {
      icon: Cpu,
      title: "Deterministic Spending Enforcement",
      description:
        "Budgets and price caps are calculated and validated in deterministic server-side code. The LLM cannot alter prices, ignore caps, or approve over-budget baskets.",
    },
    {
      icon: CreditCard,
      title: "Verified PayPal Sandbox Flow",
      description:
        "Checkout is only supported for the dedicated sample demo catalog. Orders are created and captured server-side, and success is shown only after verified capture.",
    },
    {
      icon: Sparkles,
      title: "Explainable Recommendations",
      description:
        "Every recommended match clearly explains why it was chosen based on your stated needs and known attributes. Unknown details are explicitly labelled as unknown.",
    },
  ];

  return (
    <section id="trust" className="py-16 md:py-24 border-b border-[#242424] bg-[#080808]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#35C979]">
            Transparency & Principles
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#F5F5F5] sm:text-3xl md:text-4xl">
            Built for trust, not persuasion
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#A3A3A3]">
            SpendPilot does not pressure you to buy or invent discounts. Our architecture separates conversational intelligence from authoritative financial logic.
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
            <ShieldAlert className="h-5 w-5 text-[#F5B942] shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-[#F5F5F5]">
                Prototype Boundary & Disclosure
              </h4>
              <p className="text-xs text-[#A3A3A3] mt-0.5">
                SpendPilot is a hackathon prototype for the PayPal AI Hackathon 2026. External retailer items link to their authentic merchant stores. In-app PayPal checkouts use sandbox accounts on sample demo merchandise.
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
