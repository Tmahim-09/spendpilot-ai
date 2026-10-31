"use client";

import React from "react";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";

export function SiteFooter() {
  const currentYear = 2026;

  return (
    <footer className="border-t border-[#242424] bg-[#050505] text-[#A3A3A3]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-8 border-b border-[#1c1c1c]">
          {/* Brand & Mission */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-3">
              <div className="relative h-8 w-8 overflow-hidden rounded-lg border border-[#303030] bg-[#0c0c0c] p-0.5 shadow-sm shadow-[#FF6A00]/20">
                <Image
                  src="/logo/SpendPilotLOGO.png"
                  alt="SpendPilot AI logo"
                  width={32}
                  height={32}
                  className="h-full w-full object-contain"
                />
              </div>
              <span className="text-base font-semibold text-[#F5F5F5]">
                SpendPilot <span className="text-[#FF6A00]">AI</span>
              </span>
            </div>
            <p className="text-xs text-[#888888] max-w-md leading-relaxed">
              Budget-aware conversational shopping assistant engineered for the PayPal AI Hackathon 2026. Translates natural language shopping goals into verified, source-grounded product plans with strict budget constraints.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-[#35C979]">
              <ShieldCheck className="h-4 w-4" />
              <span>Grounded Merchant Commerce Architecture</span>
            </div>
          </div>

          {/* Architecture Pillars */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#D4D4D4] mb-3">
              Technical Stack
            </h4>
            <ul className="space-y-2 text-xs text-[#888888]">
              <li>Next.js App Router (React 19, TypeScript)</li>
              <li>Tailwind CSS v4 Design Tokens</li>
              <li>Google Gemini API with Automatic Failover</li>
              <li>Channel3 API Product Discovery</li>
              <li>PayPal AI Hackathon 2026</li>
            </ul>
          </div>

          {/* Prototype Principles */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#D4D4D4] mb-3">
              Core Principles
            </h4>
            <ul className="space-y-2 text-xs text-[#888888]">
              <li>Deterministic budget validation</li>
              <li>Verified merchant data over hallucination</li>
              <li>Dual mode: Single product &amp; Multi-item setup</li>
              <li>Zero credentials in client-side code</li>
              <li>Automatic Gemini model fallback routing</li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#737373]">
          <div>
            &copy; {currentYear} SpendPilot AI &bull; Built for PayPal AI Hackathon 2026.
          </div>

          <div className="flex items-center gap-6">
            <span className="text-[#A3A3A3]">
              Intelligent Shopping Intelligence &amp; Product Bundling
            </span>
            <span className="text-[#303030]">&bull;</span>
            <span className="text-[#A3A3A3]">
              Authentic Retailer Referral
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
