"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Bot,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  Check,
  Search,
  ChevronRight,
  Edit2,
} from "lucide-react";
import type {
  ShoppingStage,
  ShoppingMode,
  CurrencyCode,
  GuidedQuestion,
  StructuredRequirement,
  CollectedAnswer,
} from "@/types";
import { formatCurrency } from "@/lib/utils";

interface GuidedConversationWorkspaceProps {
  stage: ShoppingStage;
  mode: ShoppingMode;
  query: string;
  budget: number | null;
  currency: CurrencyCode;
  assistantMessage: string;
  questions: GuidedQuestion[];
  requirements: StructuredRequirement[];
  answers: Record<string, CollectedAnswer>;
  canSearch: boolean;
  isLoading: boolean;
  onAnswerQuestion: (questionId: string, attribute: string, value: string, displayValue: string, isAiSelected?: boolean) => void;
  onSkipQuestion: (questionId: string, attribute: string) => void;
  onEditAnswer: (questionId: string) => void;
  onConfirmAndSearch: () => void;
  onBrowseWithoutDetails: () => void;
  onResetInterview?: () => void;
}

export function GuidedConversationWorkspace({
  stage,
  mode,
  query,
  budget,
  currency,
  assistantMessage,
  questions,
  requirements,
  answers,
  canSearch,
  isLoading,
  onAnswerQuestion,
  onSkipQuestion,
  onEditAnswer,
  onConfirmAndSearch,
  onBrowseWithoutDetails,
  onResetInterview,
}: GuidedConversationWorkspaceProps) {
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  const answeredList = Object.values(answers).filter(
    (a) => !a.isSkipped && a.value !== undefined && a.value !== null
  );

  const handleCustomSubmit = (q: GuidedQuestion, e: React.FormEvent) => {
    e.preventDefault();
    const val = (customInputs[q.id] || "").trim();
    if (val) {
      onAnswerQuestion(q.id, q.attribute, val, val, false);
      setCustomInputs((prev) => ({ ...prev, [q.id]: "" }));
    }
  };

  return (
    <div id="guided-interview" className="w-full max-w-4xl mx-auto my-8 animate-fadeIn">
      <div className="rounded-2xl border border-[#262626] bg-[#0c0c0c] p-5 sm:p-7 shadow-2xl space-y-6">
        
        {/* Stage Stepper Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#202020] text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6A00]/40 bg-[#FF6A00]/10 px-3 py-1 font-semibold text-[#FF8126]">
              <Sparkles className="h-3.5 w-3.5" />
              Guided Shopping Assistant
            </span>
            <span className="text-[#737373] hidden sm:inline">&bull;</span>
            <span className="text-[#A3A3A3] font-medium hidden sm:inline">
              {mode === "setup" ? "Multi-product Setup Planner" : "Single Product Match"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#737373]">
            <span
              className={`font-semibold ${
                stage === "needs_clarification" ? "text-[#FF8126]" : "text-[#A3A3A3]"
              }`}
            >
              1. Clarify Details
            </span>
            <ChevronRight className="h-3 w-3" />
            <span
              className={`font-semibold ${
                stage === "requirements_review" || canSearch ? "text-[#FF8126]" : "text-[#555555]"
              }`}
            >
              2. Review Requirements
            </span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-[#555555]">3. Search &amp; Compare</span>
          </div>
        </div>

        {/* Assistant Dialogue Bubble */}
        <div className="flex items-start gap-3.5 rounded-xl border border-[#222222] bg-[#121212] p-4 sm:p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#FF6A00]/30 bg-[#FF6A00]/15 text-[#FF8126]">
            <Bot className="h-5 w-5" />
          </div>
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#FF8126]">
                SpendPilot Shopping Guide
              </span>
              {budget && (
                <span className="text-xs font-mono font-medium text-[#35C979] bg-[#141c14] border border-[#35C979]/30 px-2 py-0.5 rounded-full">
                  Budget: {formatCurrency(budget * 100, currency)}
                </span>
              )}
            </div>
            <p className="text-sm sm:text-base font-medium text-[#F5F5F5] leading-snug">
              {assistantMessage}
            </p>
          </div>
        </div>

        {/* Confirmed Previous Answers Summary Pills */}
        {answeredList.length > 0 && (
          <div className="rounded-xl border border-[#1e1e1e] bg-[#101010] p-3.5 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#737373] flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#35C979]" />
                Your Confirmed Details ({answeredList.length}):
              </span>
              {onResetInterview && (
                <button
                  type="button"
                  onClick={onResetInterview}
                  className="text-[11px] text-[#737373] hover:text-[#FF8126] flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Start over</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {answeredList.map((ans) => (
                <div
                  key={ans.questionId}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#2b2b2b] bg-[#161616] px-2.5 py-1 text-xs text-[#D4D4D4]"
                >
                  <span className="text-[#888888] capitalize">
                    {ans.attribute.replace(/-/g, " ")}:
                  </span>
                  <strong className="text-[#F5F5F5]">{ans.displayValue}</strong>
                  {ans.isAiSelected && (
                    <span className="text-[10px] text-[#FF8126] bg-[#FF8126]/10 px-1 rounded">
                      AI Choice
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onEditAnswer(ans.questionId)}
                    title={`Edit ${ans.attribute}`}
                    className="ml-1 p-0.5 text-[#737373] hover:text-[#FF8126] transition-colors"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Clarification Questions */}
        {questions.length > 0 && (
          <div className="space-y-5">
            {questions.map((q, idx) => {
              const isRequired = q.importance === "required_before_search";
              return (
                <div
                  key={q.id}
                  className="rounded-xl border border-[#2b2b2b] bg-[#121212] p-4 sm:p-5 space-y-3 transition-all hover:border-[#383838]"
                >
                  {/* Question Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2.5 border-b border-[#1c1c1c]">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FF6A00]/20 text-[#FF8126] text-xs font-bold">
                        {idx + 1}
                      </span>
                      <h3 className="text-sm sm:text-base font-semibold text-[#F5F5F5]">
                        {q.label}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                          isRequired
                            ? "bg-[#FF6A00]/15 text-[#FF8126] border border-[#FF6A00]/30"
                            : "bg-[#222222] text-[#A3A3A3] border border-[#333333]"
                        }`}
                      >
                        {isRequired ? "Essential for search" : "Optional preference"}
                      </span>
                    </div>
                  </div>

                  {q.description && (
                    <p className="text-xs text-[#8E8E8E] leading-relaxed">
                      {q.description}
                    </p>
                  )}

                  {/* Options Selector Grid / Chips */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {q.options.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isLoading}
                        onClick={() =>
                          onAnswerQuestion(
                            q.id,
                            q.attribute,
                            opt.value,
                            opt.label,
                            opt.value === "No preference" || opt.label.includes("You decide")
                          )
                        }
                        className="rounded-xl border border-[#303030] bg-[#181818] px-3.5 py-2 text-xs font-medium text-[#D4D4D4] hover:border-[#FF6A00] hover:text-white hover:bg-[#201a14] active:scale-[0.98] transition-all focus:outline-none focus:ring-1 focus:ring-[#FF6A00]"
                      >
                        {opt.label}
                      </button>
                    ))}

                    {/* Common Skip / AI Choice Actions */}
                    {q.allowSkip && (
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => onSkipQuestion(q.id, q.attribute)}
                        className="rounded-xl border border-[#2b2b2b] bg-[#141414] px-3 py-2 text-xs text-[#888888] hover:text-[#D4D4D4] hover:bg-[#1a1a1a] transition-colors"
                      >
                        Skip for now
                      </button>
                    )}
                  </div>

                  {/* Free Text Input Fallback if available */}
                  {q.allowCustom && (
                    <form
                      onSubmit={(e) => handleCustomSubmit(q, e)}
                      className="flex items-center gap-2 pt-2"
                    >
                      <input
                        type="text"
                        value={customInputs[q.id] || ""}
                        onChange={(e) =>
                          setCustomInputs({ ...customInputs, [q.id]: e.target.value })
                        }
                        placeholder="Or enter a specific choice..."
                        className="flex-1 rounded-lg border border-[#2b2b2b] bg-[#161616] px-3 py-1.5 text-xs text-[#F5F5F5] placeholder-[#666666] focus:border-[#FF6A00] focus:outline-none"
                        disabled={isLoading}
                      />
                      <button
                        type="submit"
                        disabled={isLoading || !(customInputs[q.id] || "").trim()}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#242424] px-3 py-1.5 text-xs font-semibold text-[#F5F5F5] hover:bg-[#333333] hover:text-[#FF8126] transition-colors disabled:opacity-40"
                      >
                        <span>Apply</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Requirements Review & Search Action Card */}
        {canSearch && (
          <div className="rounded-xl border border-[#35C979]/40 bg-[#0f1711] p-5 sm:p-6 space-y-4 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1c2e21]">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-[#35C979]/20 p-2 text-[#35C979] border border-[#35C979]/40">
                  <Check className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#F5F5F5]">
                    Shopping Requirements Ready
                  </h3>
                  <p className="text-xs text-[#8E8E8E]">
                    Your specifications are validated and ready for Channel3 product discovery.
                  </p>
                </div>
              </div>

              {budget && (
                <div className="text-left sm:text-right">
                  <span className="text-[11px] text-[#8E8E8E] block">Maximum Budget</span>
                  <span className="text-base font-bold text-[#35C979] tabular-nums">
                    {formatCurrency(budget * 100, currency)}
                  </span>
                </div>
              )}
            </div>

            {/* Target Specifications Summary */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E8E] block">
                Targeted Specifications:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-[#223526] bg-[#142017] p-2.5 flex justify-between">
                  <span className="text-[#8E8E8E]">Query:</span>
                  <span className="text-[#F5F5F5] font-medium truncate max-w-[65%]">{query}</span>
                </div>
                {requirements[0]?.category && (
                  <div className="rounded-lg border border-[#223526] bg-[#142017] p-2.5 flex justify-between">
                    <span className="text-[#8E8E8E]">Category:</span>
                    <span className="text-[#F5F5F5] font-medium">{requirements[0].category}</span>
                  </div>
                )}
                {Object.entries(requirements[0]?.attributes || {}).map(([key, val]) => {
                  if (!val || val === "No preference") return null;
                  return (
                    <div
                      key={key}
                      className="rounded-lg border border-[#223526] bg-[#142017] p-2.5 flex justify-between"
                    >
                      <span className="text-[#8E8E8E] capitalize">{key.replace(/-/g, " ")}:</span>
                      <span className="text-[#35C979] font-semibold">{String(val)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Final Actions */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={onConfirmAndSearch}
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF6A00] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#FF6A00]/25 hover:bg-[#FF8126] active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
              >
                <Search className="h-4 w-4" />
                <span>Find my matches</span>
              </button>

              <button
                type="button"
                onClick={onBrowseWithoutDetails}
                disabled={isLoading}
                className="text-xs text-[#8E8E8E] hover:text-[#D4D4D4] transition-colors text-center"
              >
                Or browse all verified items without filters
              </button>
            </div>
          </div>
        )}

        {/* Non-blocking browse option if questions remain */}
        {!canSearch && (
          <div className="pt-2 flex items-center justify-between text-xs text-[#737373]">
            <span>Answering these ensures precise sizing and compatibility.</span>
            <button
              type="button"
              onClick={onBrowseWithoutDetails}
              className="text-[#A3A3A3] hover:text-[#FF8126] underline transition-colors"
            >
              Browse catalog without answering
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
