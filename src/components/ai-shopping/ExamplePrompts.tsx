"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import type { CurrencyCode, ShoppingMode } from "@/types";

export interface ExampleScenario {
  id: string;
  label: string;
  prompt: string;
  budget: string;
  currency: CurrencyCode;
  mode?: ShoppingMode;
}

const SINGLE_PRODUCT_EXAMPLES: ExampleScenario[] = [
  {
    id: "headphones",
    label: "Wireless headphones under $150",
    prompt:
      "I need wireless headphones under $150 with good battery life and comfortable ear cushions.",
    budget: "150",
    currency: "USD",
    mode: "single",
  },
  {
    id: "mouse",
    label: "Ergonomic wireless mouse under $40",
    prompt:
      "A reliable wireless mouse for university studying under $40 with quiet click buttons.",
    budget: "40",
    currency: "USD",
    mode: "single",
  },
  {
    id: "keyboard",
    label: "Mechanical keyboard under $90",
    prompt:
      "A tactile mechanical keyboard suitable for programming under $90 with hot-swappable switches.",
    budget: "90",
    currency: "USD",
    mode: "single",
  },
];

const SETUP_EXAMPLES: ExampleScenario[] = [
  {
    id: "gaming-setup",
    label: "Gaming setup under $3,000",
    prompt:
      "Build a gaming setup with a desktop PC, monitor, mechanical keyboard, mouse, and headset under $3,000.",
    budget: "3000",
    currency: "USD",
    mode: "setup",
  },
  {
    id: "dorm-setup",
    label: "Desk setup under $180",
    prompt:
      "Build a student desk setup with an adjustable laptop stand, wireless keyboard, mouse, and LED desk lamp under $180.",
    budget: "180",
    currency: "USD",
    mode: "setup",
  },
  {
    id: "recording-setup",
    label: "Home studio setup under $250",
    prompt:
      "Build a home recording setup with a USB condenser microphone, boom arm, pop filter, and studio monitor headphones under $250.",
    budget: "250",
    currency: "USD",
    mode: "setup",
  },
];

interface ExamplePromptsProps {
  mode?: ShoppingMode;
  onSelectPrompt: (prompt: string, budget: string, currency: CurrencyCode, mode?: ShoppingMode) => void;
  className?: string;
}

export function ExamplePrompts({ mode = "single", onSelectPrompt, className = "" }: ExamplePromptsProps) {
  const examples = mode === "setup" ? SETUP_EXAMPLES : SINGLE_PRODUCT_EXAMPLES;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between text-xs font-medium text-[#A3A3A3]">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[#FF6A00]" aria-hidden="true" />
          <span>Try an example {mode === "setup" ? "bundle setup" : "single product"} prompt:</span>
        </div>
        <span className="text-[11px] text-[#737373]">
          {mode === "setup" ? "Multi-product Mode" : "Single Product Mode"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Example prompts">
        {examples.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectPrompt(item.prompt, item.budget, item.currency, item.mode)}
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
