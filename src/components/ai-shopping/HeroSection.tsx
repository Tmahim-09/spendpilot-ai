"use client";

import React from "react";
import { ShoppingPrompt } from "./ShoppingPrompt";
import { ShieldCheck, CheckCircle2 } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-8 pb-16 md:pt-12 md:pb-20 border-b border-[#242424]">
      {/* Subtle radial background to accent the dark canvas */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(255,106,0,0.06),rgba(8,8,8,0))]"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Eyebrow & Headline container */}
        <div className="flex flex-col items-center text-center mb-8 sm:mb-10">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#303030] bg-[#101010] px-3.5 py-1 text-xs font-medium text-[#D4D4D4] mb-4 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-[#FF6A00]" />
            <span>AI shopping, with your budget in control</span>
          </div>

          {/* Main Heading */}
          <h1 className="text-3xl font-extrabold tracking-tight text-[#F5F5F5] sm:text-5xl md:text-6xl max-w-3xl leading-[1.12]">
            Find what fits.{" "}
            <span className="text-[#FF6A00]">Stay in control.</span>
          </h1>

          {/* Subtitle */}
          <p className="mt-4 max-w-2xl text-base sm:text-lg text-[#A3A3A3] leading-relaxed">
            SpendPilot turns natural-language requests into source-backed product recommendations, checks spending policies on the server, and puts you in control of every checkout.
          </p>

          {/* Key Value Pillars Pills */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-y-2 gap-x-4 text-xs text-[#A3A3A3]">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#FF6A00]" />
              Natural-Language Requests
            </span>
            <span className="hidden sm:inline text-[#303030]">&bull;</span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#35C979]" />
              Source-Backed Facts
            </span>
            <span className="hidden sm:inline text-[#303030]">&bull;</span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#FF6A00]" />
              Deterministic Spending Policy
            </span>
            <span className="hidden sm:inline text-[#303030]">&bull;</span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#69A8FF]" />
              User-Approved PayPal Checkout
            </span>
          </div>
        </div>

        {/* AI Request Composer (Hero focal point) */}
        <div className="mx-auto max-w-3xl">
          <ShoppingPrompt />
        </div>
      </div>
    </section>
  );
}
