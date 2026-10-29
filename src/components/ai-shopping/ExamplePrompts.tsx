"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import type { CurrencyCode } from "@/types";

export interface ExampleScenario {
  id: string;
  label: string;
  prompt: string;
  budget: string;
  currency: CurrencyCode;
}

const EXAMPLE_SCENARIOS: ExampleScenario[] = [
  {
    id: "study-setup",
    label: "Programming study setup under $300",
    prompt:
      "Help me build a study setup for programming under $300. I prefer reliable, durable products with a clean, minimal design.",
    budget: "300",
    currency: "USD",
  },
  {
    id: "headphones",
    label: "ANC wireless headphones under $150",
    prompt:
      "Find wireless active noise-cancelling headphones under $150 with multi-point Bluetooth and clear voice microphone for remote work.",
    budget: "150",
    currency: "USD",
  },
  {
    id: "peripherals",
    label: "Mechanical keyboard & mouse under $120",
    prompt:
      "Ergonomic mechanical keyboard with tactile switches and a comfortable wireless mouse under $120.",
    budget: "120",
    currency: "USD",
  },
  {
    id: "lighting",
    label: "Monitor light bar & cable organizer under $70",
    prompt:
      "Minimalist monitor light bar with adjustable temperature and a clean under-desk cable organizer under $70.",
    budget: "70",
    currency: "USD",
  },
];

interface ExamplePromptsProps {
  onSelectPrompt: (prompt: string, budget: string, currency: CurrencyCode) => void;
  className?: string;
}

export function ExamplePrompts({ onSelectPrompt, className = "" }: ExamplePromptsProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-[#A3A3A3]">
        <Sparkles className="h-3.5 w-3.5 text-[#FF6A00]" aria-hidden="true" />
        <span>Try an example shopping prompt:</span>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Example prompts">
        {EXAMPLE_SCENARIOS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectPrompt(item.prompt, item.budget, item.currency)}
            className="group inline-flex items-center gap-1.5 rounded-full border border-[#262626] bg-[#101010] px-3 py-1.5 text-xs text-[#D4D4D4] transition-all hover:border-[#FF6A00]/60 hover:bg-[#171717] hover:text-[#F5F5F5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#FF6A00] transition-transform group-hover:scale-125" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
