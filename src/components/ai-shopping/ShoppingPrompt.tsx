"use client";

import React, { useState, useRef, useEffect } from "react";
import { ArrowRight, Sparkles, ShieldCheck, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { BudgetInput } from "./BudgetInput";
import { ExamplePrompts } from "./ExamplePrompts";
import type { CurrencyCode } from "@/types";

interface ShoppingPromptProps {
  initialPrompt?: string;
  initialBudget?: string;
  initialCurrency?: CurrencyCode;
}

export function ShoppingPrompt({
  initialPrompt = "",
  initialBudget = "",
  initialCurrency = "USD",
}: ShoppingPromptProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [budget, setBudget] = useState(initialBudget);
  const [currency, setCurrency] = useState<CurrencyCode>(initialCurrency);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedState, setSubmittedState] = useState<{
    query: string;
    budget: string;
    currency: CurrencyCode;
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
    selectedCurrency: CurrencyCode
  ) => {
    setPrompt(selectedPrompt);
    setBudget(selectedBudget);
    setCurrency(selectedCurrency);
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

      // Block submission if composing natively or if keyCode is 229 (WebKit/Safari IME)
      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        return;
      }

      // Check Safari timestamp window workaround
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

    // Phase 1: capture valid frontend request state without faking completed API calls
    setSubmittedState({
      query: trimmed,
      budget: budget.trim(),
      currency,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    });
  };

  return (
    <div id="prompt-composer" className="w-full">
      <div className="relative rounded-2xl border border-[#303030] bg-[#101010] p-4 sm:p-6 shadow-2xl transition-all hover:border-[#3d3d3d]">
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
              placeholder="Describe what you need and your budget (e.g. Help me build a study setup for programming under $300)..."
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
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF6A00] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#FF6A00]/20 transition-all hover:bg-[#FF8126] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]"
              >
                <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
                <span>Find my options</span>
                <ArrowRight className="h-4 w-4 text-white" aria-hidden="true" />
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
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[#35C979] mt-0.5" aria-hidden="true" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#F5F5F5]">
                    Request Captured (Phase 1 Frontend State)
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
                    <strong>Next Steps:</strong> In Phase 2 & 3, this prompt is parsed by Gemini into structured requirements and dispatched to Channel3 for live product discovery.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Example prompts */}
        <div className="mt-6 border-t border-[#222222] pt-4">
          <ExamplePrompts onSelectPrompt={handleSelectExample} />
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
