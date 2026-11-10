"use client";

import React from "react";
import { MessageSquareText, Scale, ShoppingBag } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      number: "01",
      icon: MessageSquareText,
      title: "Describe what you need",
      description:
        "Set your goals, criteria, and budget in plain language. SpendPilot extracts your explicit constraints, item preferences, and priorities.",
    },
    {
      number: "02",
      icon: Scale,
      title: "Compare verified options",
      description:
        "Explore real products with objective facts, key trade-offs, and grounded comparisons across multiple merchant offers.",
    },
    {
      number: "03",
      icon: ShoppingBag,
      title: "Choose with confidence",
      description:
        "Pick the best fit or build a complete multi-product setup within your budget, then follow direct links to retailer offers.",
    },
  ];

  return (
    <section id="how-it-works" className="py-16 md:py-24 border-b border-orange-200/60 dark:border-[#221c29] bg-transparent">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <span className="text-xs font-bold uppercase tracking-wider text-[#FF6A00]">
            How It Works
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#F5F5F5] sm:text-3xl md:text-4xl">
            A shopping assistant designed around your budget
          </h2>
          <p className="mt-3 text-sm sm:text-base text-zinc-600 dark:text-[#A3A3A3]">
            SpendPilot combines conversational intelligence with source-grounded product comparisons in three simple steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="relative flex flex-col justify-between rounded-2xl border border-orange-200 dark:border-[#2b2436] bg-white dark:bg-[#121015] p-6 sm:p-8 transition-all shadow-sm hover:border-[#FF6A00] dark:hover:border-[#FF6A00]/80 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-xs font-mono font-bold text-[#FF6A00] tracking-widest bg-[#FF6A00]/10 px-2.5 py-1 rounded-md border border-[#FF6A00]/30">
                      STEP {step.number}
                    </span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-200 dark:border-[#382e46] bg-[#FFF8F2] dark:bg-[#1a1622] text-[#FF6A00]">
                      <Icon className="h-5 w-5 text-[#FF6A00]" aria-hidden="true" />
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-zinc-900 dark:text-[#F5F5F5] mb-2.5">
                    {step.title}
                  </h3>

                  <p className="text-sm text-zinc-600 dark:text-[#A3A3A3] leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
