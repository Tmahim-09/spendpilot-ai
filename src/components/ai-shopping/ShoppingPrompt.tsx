"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Info,
  RefreshCw,
  Tag,
  Layers,
  SlidersHorizontal,
} from "lucide-react";
import { BudgetInput } from "./BudgetInput";
import { ExamplePrompts } from "./ExamplePrompts";
import type { CurrencyCode, ShoppingMode, PricePreference } from "@/types";

interface ShoppingPromptProps {
  initialPrompt?: string;
  initialBudget?: string;
  initialCurrency?: CurrencyCode;
  initialMode?: ShoppingMode;
  initialPricePreference?: PricePreference;
  onSearch?: (
    query: string,
    budget: number | null,
    currency: CurrencyCode,
    mode: ShoppingMode,
    pricePreference: PricePreference
  ) => Promise<void> | void;
  isLoading?: boolean;
}

export function ShoppingPrompt({
  initialPrompt = "",
  initialBudget = "",
  initialCurrency = "USD",
  initialMode = "single",
  initialPricePreference = "near_budget",
  onSearch,
  isLoading = false,
}: ShoppingPromptProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [budget, setBudget] = useState(initialBudget);
  const [currency, setCurrency] = useState<CurrencyCode>(initialCurrency);
  const [mode, setMode] = useState<ShoppingMode>(initialMode);
  const [pricePreference, setPricePreference] = useState<PricePreference>(initialPricePreference);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedState, setSubmittedState] = useState<{
    query: string;
    budget: string;
    currency: CurrencyCode;
    mode: ShoppingMode;
    pricePreference: PricePreference;
    timestamp: string;
  } | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastCompositionEndAtRef = useRef<number | null>(null);

  // Auto-resize textarea as content changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        Math.max(textareaRef.current.scrollHeight, 72),
        220
      )}px`;
    }
  }, [prompt]);

  const handleSelectExample = (
    selectedPrompt: string,
    selectedBudget: string,
    selectedCurrency: CurrencyCode,
    selectedMode?: ShoppingMode
  ) => {
    setPrompt(selectedPrompt);
    setBudget(selectedBudget);
    setCurrency(selectedCurrency);
    if (selectedMode) {
      setMode(selectedMode);
    }
    setErrorMessage(null);
    setSubmittedState(null);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME-safe Enter-to-submit pattern from modern-web-guidance
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();

      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        return;
      }

      if (
        lastCompositionEndAtRef.current !== null &&
        Math.abs(e.timeStamp - lastCompositionEndAtRef.current) < 50
      ) {
        return;
      }

      formRef.current?.requestSubmit();
    }
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    lastCompositionEndAtRef.current = e.timeStamp;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmed = prompt.trim();
    if (!trimmed) {
      setErrorMessage("Please describe what items or setup you are looking for.");
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
      return;
    }

    if (trimmed.length < 5) {
      setErrorMessage("Please enter a slightly more detailed request (at least 5 characters).");
      return;
    }

    setErrorMessage(null);

    if (onSearch) {
      const parsedBudget = budget.trim() ? Number(budget.trim()) : null;
      onSearch(trimmed, parsedBudget, currency, mode, pricePreference);
    } else {
      setSubmittedState({
        query: trimmed,
        budget: budget.trim(),
        currency,
        mode,
        pricePreference,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      });
    }
  };

  return (
    <div id="prompt-composer" className="w-full">
      <div className="relative rounded-2xl border border-[#303030] bg-[#101010] p-4 sm:p-6 shadow-2xl transition-all hover:border-[#3d3d3d]">
        
        {/* Shopping Mode Selector (Prompt Section 2) */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#A3A3A3]">
              Select Shopping Mode
            </label>
            <span className="text-[11px] text-[#737373]">
              {mode === "single" ? "1 Target Product" : "Multi-Product Bundle"}
            </span>
          </div>

          <div
            role="tablist"
            aria-label="Shopping modes"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {/* Mode A: Single Product */}
            <button
              type="button"
              role="tab"
              aria-selected={mode === "single"}
              onClick={() => {
                setMode("single");
                setErrorMessage(null);
              }}
              className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00] ${
                mode === "single"
                  ? "border-[#FF6A00] bg-[#FF6A00]/10 shadow-md shadow-[#FF6A00]/10"
                  : "border-[#262626] bg-[#0c0c0c] hover:border-[#3d3d3d] hover:bg-[#141414]"
              }`}
            >
              <div
                className={`mt-0.5 rounded-lg p-2 ${
                  mode === "single" ? "bg-[#FF6A00] text-white" : "bg-[#1f1f1f] text-[#A3A3A3]"
                }`}
              >
                <Tag className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm font-bold ${
                      mode === "single" ? "text-white" : "text-[#D4D4D4]"
                    }`}
                  >
                    Single Product
                  </span>
                  {mode === "single" && (
                    <span className="h-2 w-2 rounded-full bg-[#FF6A00] animate-pulse" />
                  )}
                </div>
                <p className="text-xs text-[#8E8E8E] mt-0.5 leading-relaxed">
                  Find and compare one product within your target budget.
                </p>
                <p className="text-[11px] text-[#5A5A5A] mt-1 italic">
                  e.g. &ldquo;Wireless headphones under $150&rdquo;
                </p>
              </div>
            </button>

            {/* Mode B: Multi-product Setup */}
            <button
              type="button"
              role="tab"
              aria-selected={mode === "setup"}
              onClick={() => {
                setMode("setup");
                setErrorMessage(null);
              }}
              className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00] ${
                mode === "setup"
                  ? "border-[#FF6A00] bg-[#FF6A00]/10 shadow-md shadow-[#FF6A00]/10"
                  : "border-[#262626] bg-[#0c0c0c] hover:border-[#3d3d3d] hover:bg-[#141414]"
              }`}
            >
              <div
                className={`mt-0.5 rounded-lg p-2 ${
                  mode === "setup" ? "bg-[#FF6A00] text-white" : "bg-[#1f1f1f] text-[#A3A3A3]"
                }`}
              >
                <Layers className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm font-bold ${
                      mode === "setup" ? "text-white" : "text-[#D4D4D4]"
                    }`}
                  >
                    Multi-product Setup
                  </span>
                  {mode === "setup" && (
                    <span className="h-2 w-2 rounded-full bg-[#FF6A00] animate-pulse" />
                  )}
                </div>
                <p className="text-xs text-[#8E8E8E] mt-0.5 leading-relaxed">
                  Build a complete collection of products within one total budget.
                </p>
                <p className="text-[11px] text-[#5A5A5A] mt-1 italic">
                  e.g. &ldquo;Complete gaming setup under $3,000&rdquo;
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Mode-specific Price Preference Toggle (Single Product Mode Only) */}
        {mode === "single" && (
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border border-[#222222] bg-[#0c0c0c]">
            <div className="flex items-center gap-2 text-xs text-[#A3A3A3]">
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#FF6A00]" />
              <span className="font-medium text-[#D4D4D4]">Targeting Policy:</span>
              <span className="text-[#737373]">
                {pricePreference === "near_budget"
                  ? "Prioritizing products in upper 10% of budget"
                  : "Searching all products up to budget ceiling"}
              </span>
            </div>

            <div className="inline-flex rounded-lg border border-[#2c2c2c] bg-[#161616] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setPricePreference("near_budget")}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  pricePreference === "near_budget"
                    ? "bg-[#FF6A00] text-white shadow-sm"
                    : "text-[#A3A3A3] hover:text-white"
                }`}
              >
                Near Budget (Top 10%)
              </button>
              <button
                type="button"
                onClick={() => setPricePreference("best_value")}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  pricePreference === "best_value"
                    ? "bg-[#2a2a2a] text-white shadow-sm"
                    : "text-[#A3A3A3] hover:text-white"
                }`}
              >
                Best Value (All Prices)
              </button>
            </div>
          </div>
        )}

        {/* Main form */}
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Main prompt input */}
          <div className="relative">
            <label htmlFor="shopping-prompt-input" className="sr-only">
              Shopping request and requirements
            </label>
            <textarea
              ref={textareaRef}
              id="shopping-prompt-input"
              name="prompt"
              rows={2}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              onKeyDown={handleKeyDown}
              onCompositionEnd={handleCompositionEnd}
              placeholder={
                mode === "setup"
                  ? "Describe the setup or bundle you need (e.g. Build a gaming setup with a desktop PC, monitor, keyboard, mouse, and headset under $3,000)..."
                  : "Describe the single product you need (e.g. Wireless headphones under $150 with good battery life and comfortable ear cushions)..."
              }
              className="w-full resize-none rounded-xl border border-[#242424] bg-[#0c0c0c] p-4 text-base font-normal text-[#F5F5F5] placeholder-[#5a5a5a] transition-colors focus:border-[#FF6A00] focus:outline-none"
              aria-invalid={errorMessage !== null}
              aria-describedby={errorMessage ? "prompt-error" : "prompt-hint"}
            />
            <div id="prompt-hint" className="mt-1 flex items-center justify-between px-1 text-[11px] text-[#737373]">
              <span>Press <kbd className="rounded border border-[#303030] bg-[#171717] px-1 py-0.5 text-[10px] text-[#A3A3A3]">Enter</kbd> to search, <kbd className="rounded border border-[#303030] bg-[#171717] px-1 py-0.5 text-[10px] text-[#A3A3A3]">Shift+Enter</kbd> for newline</span>
              <span className="tabular-nums">{prompt.length} chars</span>
            </div>
          </div>

          {/* Validation Error Message */}
          {errorMessage && (
            <div
              id="prompt-error"
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-[#F05B5B]/30 bg-[#F05B5B]/10 px-3.5 py-2.5 text-xs text-[#F05B5B]"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Controls bar: Budget & Submit */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pt-1">
            <div className="w-full sm:w-64">
              <BudgetInput
                value={budget}
                onChange={(val) => {
                  setBudget(val);
                  if (submittedState) setSubmittedState(null);
                }}
                currency={currency}
                onCurrencyChange={(curr) => {
                  setCurrency(curr);
                  if (submittedState) setSubmittedState(null);
                }}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF6A00] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#FF6A00]/20 transition-all hover:bg-[#FF8126] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[#FF6A00] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 text-white animate-spin" aria-hidden="true" />
                    <span>{mode === "setup" ? "Decomposing Setup..." : "Searching Channel3..."}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
                    <span>{mode === "setup" ? "Decompose & Plan Setup" : "Find & Compare Options"}</span>
                    <ArrowRight className="h-4 w-4 text-white" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Phase 1 Prototype submission state notice */}
        {submittedState && (
          <div
            role="status"
            className="mt-5 rounded-xl border border-[#303030] bg-[#141414] p-4 text-sm text-[#D4D4D4] animate-fadeIn"
          >
            <div className="flex items-start gap-3">
              <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-md border border-[#303030] bg-[#0c0c0c] p-0.5 mt-0.5 shadow-sm shadow-[#FF6A00]/20">
                <Image
                  src="/logo/SpendPilotLOGO.png"
                  alt="SpendPilot"
                  width={24}
                  height={24}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#F5F5F5]">
                    Request Captured ({submittedState.mode === "setup" ? "Multi-Product Mode" : "Single Product Mode"})
                  </span>
                  <span className="text-xs text-[#737373] tabular-nums">
                    {submittedState.timestamp}
                  </span>
                </div>
                <p className="text-xs text-[#A3A3A3]">
                  Query: <span className="text-[#F5F5F5] font-medium">&ldquo;{submittedState.query}&rdquo;</span>
                  {submittedState.budget && (
                    <>
                      {" "}&bull; Budget Cap:{" "}
                      <span className="text-[#35C979] font-medium tabular-nums">
                        {submittedState.currency} {submittedState.budget}
                      </span>
                    </>
                  )}
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-[#A3A3A3] bg-[#0c0c0c] p-2.5 rounded-lg border border-[#242424]">
                  <Info className="h-4 w-4 shrink-0 text-[#69A8FF]" />
                  <span>
                    <strong>Mode:</strong> {submittedState.mode === "setup" ? "Multi-product bundle breakdown" : `Single product comparison (${submittedState.pricePreference})`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Example prompts */}
        <div className="mt-6 border-t border-[#222222] pt-4">
          <ExamplePrompts mode={mode} onSelectPrompt={handleSelectExample} />
        </div>

        {/* Understated trust message */}
        <div className="mt-4 flex items-center gap-2 text-xs text-[#A3A3A3]">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[#35C979]" aria-hidden="true" />
          <span>
            Product recommendations are source-backed by verified catalog data. You explicitly review and approve every checkout.
          </span>
        </div>
      </div>
    </div>
  );
}
