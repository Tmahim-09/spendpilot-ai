"use client";

import React from "react";
import Image from "next/image";
import { ShoppingPrompt } from "./ShoppingPrompt";
import { CheckCircle2 } from "lucide-react";
import type { CurrencyCode, ShoppingMode, PricePreference } from "@/types";

interface HeroSectionProps {
  onSearch?: (
    query: string,
    budget: number | null,
    currency: CurrencyCode,
    mode: ShoppingMode,
    pricePreference: PricePreference
  ) => Promise<void> | void;
  isLoading?: boolean;
  initialPrompt?: string;
  initialBudget?: string;
  initialCurrency?: CurrencyCode;
  initialMode?: ShoppingMode;
  initialPricePreference?: PricePreference;
}

export function HeroSection({
  onSearch,
  isLoading = false,
  initialPrompt,
  initialBudget,
  initialCurrency,
  initialMode = "single",
  initialPricePreference = "near_budget",
}: HeroSectionProps = {}) {
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
          {/* Brandmark Icon */}
          <div className="relative mb-5 flex items-center justify-center">
            <div className="relative h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-2xl border border-[#303030] bg-[#0c0c0c] p-2 shadow-2xl shadow-[#FF6A00]/25 transition-all hover:border-[#FF6A00]/60 hover:shadow-[#FF6A00]/35">
              <Image
                src="/logo/SpendPilotLOGO.png"
                alt="SpendPilot AI brandmark"
                width={80}
                height={80}
                className="h-full w-full object-contain"
                priority
              />
            </div>
          </div>

          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#303030] bg-[#101010] px-3.5 py-1 text-xs font-medium text-[#D4D4D4] mb-4 shadow-sm">
            <Image
              src="/logo/SpendPilotLOGO.png"
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 object-contain"
              aria-hidden="true"
            />
            <span>AI shopping with your budget in control</span>
          </div>

          {/* Main Heading */}
          <h1 className="text-3xl font-extrabold tracking-tight text-[#F5F5F5] sm:text-5xl md:text-6xl max-w-3xl leading-[1.12]">
            Find what fits.{" "}
            <span className="text-[#FF6A00]">Know what you&apos;re buying.</span>
          </h1>

          {/* Subtitle */}
          <p className="mt-4 max-w-2xl text-base sm:text-lg text-[#A3A3A3] leading-relaxed">
            Tell us what you need and your budget. We&apos;ll find relevant products, compare the options, and help you choose.
          </p>

          {/* Key Value Pillars Pills */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-y-2 gap-x-4 text-xs text-[#A3A3A3]">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#FF6A00]" />
              Natural-Language Search
            </span>
            <span className="hidden sm:inline text-[#303030]">&bull;</span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#35C979]" />
              Verified Retailer Prices
            </span>
            <span className="hidden sm:inline text-[#303030]">&bull;</span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#38BDF8]" />
              Side-by-Side Comparison
            </span>
            <span className="hidden sm:inline text-[#303030]">&bull;</span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#FF6A00]" />
              Strict Budget Caps
            </span>
          </div>
        </div>

        {/* AI Request Composer (Hero focal point) */}
        <div className="mx-auto max-w-3xl">
          <ShoppingPrompt
            onSearch={onSearch}
            isLoading={isLoading}
            initialPrompt={initialPrompt}
            initialBudget={initialBudget}
            initialCurrency={initialCurrency}
            initialMode={initialMode}
            initialPricePreference={initialPricePreference}
          />
        </div>
      </div>
    </section>
  );
}
