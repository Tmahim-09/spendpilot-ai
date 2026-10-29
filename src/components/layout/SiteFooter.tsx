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
              <div className="relative h-8 w-8 overflow-hidden rounded-lg border border-[#303030] bg-[#101010]">
                <Image
                  src="/logo/SpendPilotLOGO.jpeg"
                  alt="SpendPilot AI logo"
                  width={32}
                  height={32}
                  className="h-full w-full object-cover"
                />
              </div>
              <span className="text-base font-semibold text-[#F5F5F5]">
                SpendPilot <span className="text-[#FF6A00]">AI</span>
              </span>
            </div>
            <p className="text-xs text-[#888888] max-w-md leading-relaxed">
              Budget-aware conversational commerce prototype engineered for the PayPal AI Hackathon 2026. Translates natural language into verified, source-backed product plans with deterministic spending limits.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-[#35C979]">
              <ShieldCheck className="h-4 w-4" />
              <span>PayPal Sandbox Verified Architecture</span>
            </div>
          </div>

          {/* Architecture Pillars */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#D4D4D4] mb-3">
              Technical Stack
            </h4>
            <ul className="space-y-2 text-xs text-[#888888]">
              <li>Next.js App Router (React 19, TS)</li>
              <li>Tailwind CSS v4 Design Tokens</li>
              <li>Google Gemini API (Intent Parsing)</li>
              <li>Channel3 API (Product Discovery)</li>
              <li>PayPal Developer Platform (Sandbox)</li>
            </ul>
          </div>

          {/* Prototype Principles */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#D4D4D4] mb-3">
              Prototype Principles
            </h4>
            <ul className="space-y-2 text-xs text-[#888888]">
              <li>Deterministic budget validation</li>
              <li>Grounded facts over hallucination</li>
              <li>Explicit user approval on checkout</li>
              <li>Zero credentials in browser code</li>
              <li>Transparent demo store separation</li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#737373]">
          <div>
            &copy; {currentYear} SpendPilot AI &bull; Built for PayPal AI Hackathon 2026.
          </div>

          <div className="flex items-center gap-6">
            <span className="hover:text-[#A3A3A3] transition-colors">
              Phase 1: Shell & Visual Foundation
            </span>
            <span className="text-[#303030]">&bull;</span>
            <span className="hover:text-[#A3A3A3] transition-colors">
              Sandbox Test Mode
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
