"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import {
  Sparkles,
  Send,
  Search,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  SlidersHorizontal,
  Bot,
  User,
} from "lucide-react";
import type {
  AuthoritativeShoppingSession,
  CurrencyCode,
} from "@/types";
import { formatCurrency } from "@/lib/utils";

interface ContinuousChatWorkspaceProps {
  session: AuthoritativeShoppingSession;
  isLoading: boolean;
  activeStatusText?: string | null;
  onSendMessage: (message: string) => void;
  onExecuteSearch: () => void;
  onResetSession?: () => void;
  currency?: CurrencyCode;
}

export function ContinuousChatWorkspace({
  session,
  isLoading,
  activeStatusText,
  onSendMessage,
  onExecuteSearch,
  onResetSession,
  currency = "USD",
}: ContinuousChatWorkspaceProps) {
  const [inputText, setInputText] = useState("");
  const [isRequirementsOpen, setIsRequirementsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [session.messages, isLoading, activeStatusText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || isLoading) return;
    onSendMessage(text);
    setInputText("");
  };

  const handleQuickReply = (reply: string) => {
    if (isLoading) return;
    onSendMessage(reply);
  };

  const answeredCount = Object.keys(session.answers).length;
  const canSearch = session.canSearch;

  return (
    <div id="spendpilot-chat-workspace" className="w-full max-w-4xl mx-auto my-6 px-3 sm:px-4">
      <div className="flex flex-col h-[650px] sm:h-[720px] rounded-2xl border border-[#262626] bg-[#0a0a0a] shadow-2xl overflow-hidden relative">
        
        {/* ─────────────────────────────────────────────────────────────
            HEADER & REQUIREMENTS ACCORDION
           ───────────────────────────────────────────────────────────── */}
        <div className="border-b border-[#202020] bg-[#0e0e0e]/95 backdrop-blur-md px-4 py-3 z-10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="relative h-8 w-8 rounded-xl border border-[#FF6A00]/40 bg-[#161210] p-1 flex items-center justify-center">
                <Image
                  src="/logo/SpendPilotLOGO.png"
                  alt="SpendPilot"
                  width={28}
                  height={28}
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[#F5F5F5] tracking-tight">
                    SpendPilot Assistant
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#FF6A00]/30 bg-[#FF6A00]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FF8126]">
                    <Sparkles className="h-2.5 w-2.5" />
                    Shopping Only
                  </span>
                </div>
                <p className="text-[11px] text-[#737373] truncate max-w-xs sm:max-w-md">
                  {session.intentSummary || "Natural conversational product discovery"}
                </p>
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-2">
              {/* Requirements Toggle */}
              <button
                type="button"
                onClick={() => setIsRequirementsOpen((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  isRequirementsOpen
                    ? "border-[#FF6A00]/60 bg-[#FF6A00]/10 text-[#FF8126]"
                    : "border-[#303030] bg-[#141414] text-[#A3A3A3] hover:border-[#404040]"
                }`}
                title="View structured requirements"
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span className="hidden sm:inline">Requirements</span>
                {answeredCount > 0 && (
                  <span className="h-4 w-4 rounded-full bg-[#262626] text-[10px] flex items-center justify-center text-[#D4D4D4]">
                    {answeredCount}
                  </span>
                )}
                {isRequirementsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>

              {/* Reset Session Button */}
              {onResetSession && (
                <button
                  type="button"
                  onClick={onResetSession}
                  className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-1.5 text-[#737373] hover:text-[#D4D4D4] hover:border-[#383838] transition-colors"
                  title="Start fresh conversation"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Collapsible Requirements Summary Drawer */}
          {isRequirementsOpen && (
            <div className="mt-3 pt-3 border-t border-[#1c1c1c] text-xs space-y-2.5 animate-fadeIn">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[#888888] font-medium">Session Specifications:</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    canSearch
                      ? "border border-[#35C979]/30 bg-[#35C979]/10 text-[#35C979]"
                      : "border border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]"
                  }`}
                >
                  {canSearch ? "Ready to Search" : "Clarifying Details"}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="rounded-lg border border-[#202020] bg-[#121212] p-2">
                  <span className="text-[#666666] block text-[10px]">Mode</span>
                  <span className="text-[#E5E5E5] font-semibold capitalize">{session.mode}</span>
                </div>
                <div className="rounded-lg border border-[#202020] bg-[#121212] p-2">
                  <span className="text-[#666666] block text-[10px]">Budget Cap</span>
                  <span className="text-[#35C979] font-bold">
                    {session.budget ? formatCurrency(session.budget * 100, currency) : "Not capped"}
                  </span>
                </div>
                <div className="rounded-lg border border-[#202020] bg-[#121212] p-2 col-span-2">
                  <span className="text-[#666666] block text-[10px]">Known Attributes</span>
                  <span className="text-[#D4D4D4] truncate block">
                    {Object.values(session.answers)
                      .filter((a) => !a.isSkipped && a.value !== undefined)
                      .map((a) => `${a.attribute}: ${a.displayValue || a.value}`)
                      .join(", ") || "None yet"}
                  </span>
                </div>
              </div>

              {canSearch && (
                <button
                  type="button"
                  onClick={onExecuteSearch}
                  className="w-full mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#FF6A00] py-1.5 text-xs font-bold text-white hover:bg-[#ff7b1a] transition-colors shadow-md shadow-[#FF6A00]/20"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Search Verified Channel3 Products Now</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────
            MESSAGE STREAM
           ───────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-sm">
          {session.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3">
              <div className="h-12 w-12 rounded-2xl border border-[#FF6A00]/40 bg-[#161210] p-2 flex items-center justify-center text-[#FF8126]">
                <Bot className="h-6 w-6" />
              </div>
              <h4 className="text-base font-bold text-[#F5F5F5]">SpendPilot Shopping Assistant</h4>
              <p className="text-xs text-[#888888] max-w-md">
                Tell me what you&apos;re looking to buy. I&apos;ll help you clarify specifications, compare options, and stay strictly within your budget.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {["Running sneakers under $150", "Laptop for programming under $1000", "Gaming PC setup for 1440p"].map(
                  (ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => handleQuickReply(ex)}
                      className="rounded-full border border-[#262626] bg-[#121212] px-3 py-1 text-xs text-[#A3A3A3] hover:border-[#FF6A00]/50 hover:text-[#FF8126] transition-colors"
                    >
                      &ldquo;{ex}&rdquo;
                    </button>
                  )
                )}
              </div>
            </div>
          ) : (
            session.messages.map((msg) => {
              const isAssistant = msg.role === "assistant";
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${isAssistant ? "justify-start" : "justify-end"} animate-fadeIn`}
                >
                  {isAssistant && (
                    <div className="h-7 w-7 rounded-xl border border-[#FF6A00]/30 bg-[#141210] p-1 shrink-0 flex items-center justify-center mt-0.5">
                      <Image
                        src="/logo/SpendPilotLOGO.png"
                        alt="SpendPilot"
                        width={20}
                        height={20}
                        className="h-full w-full object-contain"
                      />
                    </div>
                  )}

                  <div className={`max-w-[85%] sm:max-w-[75%] space-y-2`}>
                    <div
                      className={`rounded-2xl p-3.5 leading-relaxed ${
                        isAssistant
                          ? "border border-[#262626] bg-[#121212] text-[#E5E5E5] rounded-tl-sm shadow-md"
                          : "bg-gradient-to-br from-[#FF6A00] to-[#E05300] text-white font-medium rounded-tr-sm shadow-lg shadow-[#FF6A00]/15"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>

                      {/* Display Model Badge if available */}
                      {isAssistant && msg.modelUsed && (
                        <div className="mt-2 pt-1.5 border-t border-[#1f1f1f] flex items-center justify-between text-[10px] text-[#666666]">
                          <span className="capitalize">{msg.actionProposed?.replace(/_/g, " ") || "conversation"}</span>
                          <span className="font-mono">{msg.modelUsed}</span>
                        </div>
                      )}
                    </div>

                    {/* Inline Questions (chips / selectors) */}
                    {isAssistant && msg.questions && msg.questions.length > 0 && (
                      <div className="space-y-2 pt-1 pl-1">
                        {msg.questions.map((q) => (
                          <div key={q.id} className="space-y-1.5">
                            <span className="text-[11px] font-semibold text-[#FF8126] flex items-center gap-1">
                              <Sparkles className="h-2.5 w-2.5" />
                              {q.label}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {q.options?.map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => handleQuickReply(opt.label || opt.value)}
                                  className="rounded-lg border border-[#2a2a2a] bg-[#161616] px-2.5 py-1 text-xs text-[#D4D4D4] hover:border-[#FF6A00] hover:text-[#FF8126] transition-all"
                                >
                                  {opt.label}
                                </button>
                              ))}
                              {q.allowSkip && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickReply(`No preference for ${q.attribute}`)}
                                  className="rounded-lg border border-[#242424] bg-[#101010] px-2 py-1 text-xs text-[#737373] hover:text-[#A3A3A3] transition-colors"
                                >
                                  No preference
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Inline Suggested Quick Replies */}
                    {isAssistant && msg.suggestedReplies && msg.suggestedReplies.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1 pl-1">
                        {msg.suggestedReplies.map((reply, rIdx) => (
                          <button
                            key={rIdx}
                            type="button"
                            onClick={() => handleQuickReply(reply)}
                            className="rounded-full border border-[#2f2f2f] bg-[#141414] px-3 py-1 text-xs text-[#D4D4D4] hover:border-[#FF6A00]/60 hover:text-[#FF8126] transition-colors"
                          >
                            {reply}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {!isAssistant && (
                    <div className="h-7 w-7 rounded-xl border border-[#333333] bg-[#181818] p-1 shrink-0 flex items-center justify-center text-[#888888] mt-0.5">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Active status indicator (Thinking, Searching, Comparing) */}
          {isLoading && (
            <div className="flex items-center gap-2.5 text-xs text-[#FF8126] py-2 animate-fadeIn">
              <div className="h-7 w-7 rounded-xl border border-[#FF6A00]/40 bg-[#161210] p-1 shrink-0 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 animate-spin" />
              </div>
              <div className="rounded-2xl border border-[#262626] bg-[#121212] px-3.5 py-2 flex items-center gap-2">
                <span>{activeStatusText || "SpendPilot is thinking..."}</span>
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FF6A00] animate-bounce" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FF6A00] animate-bounce [animation-delay:0.2s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FF6A00] animate-bounce [animation-delay:0.4s]" />
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ─────────────────────────────────────────────────────────────
            BOTTOM CONFIRMATION ACTION BANNER (WHEN READY)
           ───────────────────────────────────────────────────────────── */}
        {canSearch && !isLoading && (
          <div className="border-t border-[#202020] bg-[#111111] px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-[#35C979]">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="font-medium text-[#E5E5E5] hidden sm:inline">Requirements ready!</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onExecuteSearch}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF6A00] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#ff7b1a] transition-all shadow-md shadow-[#FF6A00]/20"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Search Verified Matches</span>
              </button>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            BOTTOM TEXT INPUT FORM
           ───────────────────────────────────────────────────────────── */}
        <div className="border-t border-[#222222] bg-[#0c0c0c] p-3 sm:p-4">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask a question, refine preferences, or describe what to buy..."
              disabled={isLoading}
              className="flex-1 rounded-xl border border-[#2c2c2c] bg-[#141414] px-4 py-2.5 text-sm text-[#F5F5F5] placeholder-[#666666] focus:border-[#FF6A00] focus:outline-none focus:ring-1 focus:ring-[#FF6A00] disabled:opacity-50 transition-all"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00] text-white hover:bg-[#ff7b1a] disabled:opacity-30 disabled:hover:bg-[#FF6A00] transition-all shadow-md shadow-[#FF6A00]/25"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-[#555555]">
            <span>Enter to send &bull; Genuine product shopping domain only</span>
            <span>Gemini Interactions API</span>
          </div>
        </div>

      </div>
    </div>
  );
}
