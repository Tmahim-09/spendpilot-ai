"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import {
  Send,
  CheckCircle2,
  User,
  ArrowDown,
  ArrowRight,
} from "lucide-react";
import type {
  AuthoritativeShoppingSession,
  ChatMessage,
  CurrencyCode,
} from "@/types";
import { formatMinorUnits } from "@/lib/money";
import {
  resolveNaturalMessage,
  cleanRepetitiveAcknowledgements,
} from "@/lib/ai/normalize-interaction-response";
import {
  SPENDPILOT_INITIAL_GREETING,
  getHeroWarmMessage,
} from "@/lib/ai/conversation-engine";
import type { SearchProgressState } from "@/lib/shopping/search-progress";

export { SPENDPILOT_INITIAL_GREETING };

interface TypewriterTextProps {
  text: string;
  speed?: number;
  className?: string;
  onComplete?: () => void;
}

export function TypewriterText({
  text,
  speed = 18,
  className = "",
  onComplete,
}: TypewriterTextProps) {
  const [displayedCount, setDisplayedCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    // If prefers-reduced-motion is active, display immediately via deferred timeout
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const t = setTimeout(() => {
        setDisplayedCount(text.length);
        setIsCompleted(true);
        onComplete?.();
      }, 0);
      return () => clearTimeout(t);
    }

    let idx = 0;
    const timer = setInterval(() => {
      idx += 1;
      setDisplayedCount(idx);
      if (idx >= text.length) {
        clearInterval(timer);
        setIsCompleted(true);
        onComplete?.();
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed, onComplete]);

  return (
    <span className={className}>
      {text.slice(0, displayedCount)}
      {!isCompleted && (
        <span
          className="inline-block w-1.5 h-3.5 ml-0.5 bg-[#FF6A00] animate-pulse align-middle"
          aria-hidden="true"
        />
      )}
    </span>
  );
}

const STARTER_PROMPTS = [
  "Noise-cancelling headphones under $200",
  "Running sneakers for marathon training",
  "MacBook for programming under $1,200",
  "Mechanical keyboard for work",
];

interface ContinuousChatWorkspaceProps {
  session: AuthoritativeShoppingSession;
  isLoading: boolean;
  activeStatusText?: string | null;
  searchProgress?: SearchProgressState | null;
  onSendMessage: (
    message: string,
    meta?: {
      questionId?: string;
      attributeKey?: string;
      clientMessageId?: string;
      budgetMinor?: number | null;
      currency?: CurrencyCode;
    }
  ) => void;
  onExecuteSearch: () => void;
  onResetSession?: () => void;
  currency?: CurrencyCode;
  onCurrencyChange?: (currency: CurrencyCode) => void;
  onBudgetChange?: (budgetMinor: number | null) => void;
  hasProductResults?: boolean;
  productCount?: number;
  onViewProducts?: () => void;
}

const FIRST_MESSAGE_THINKING_WORDS = ["Thinking", "Evaluating", "Understanding", "Reasoning"] as const;

function getRandomThinkingWord(counter = 0): string {
  const index = Math.abs((Date.now() + counter) % FIRST_MESSAGE_THINKING_WORDS.length);
  return FIRST_MESSAGE_THINKING_WORDS[index];
}

export function ContinuousChatWorkspace({
  session,
  isLoading,
  activeStatusText,
  searchProgress,
  onSendMessage,
  currency = "USD",
  onCurrencyChange,
  onBudgetChange,
  hasProductResults = false,
  productCount = 0,
  onViewProducts,
}: ContinuousChatWorkspaceProps) {
  const [inputText, setInputText] = useState("");
  const [disabledQuestionIds, setDisabledQuestionIds] = useState<Set<string>>(new Set());
  const [currencyOverride, setCurrencyOverride] = useState<CurrencyCode | null>(null);
  const [budgetInputOverride, setBudgetInputOverride] = useState<string | null>(null);
  const [hasClickedProceed, setHasClickedProceed] = useState(false);
  const [hasChosenPreference, setHasChosenPreference] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState<string>("Thinking");
  const [prevSessionKey, setPrevSessionKey] = useState(session.sessionId);
  const [heroWarmGreeting, setHeroWarmGreeting] = useState<string>(
    "Welcome to SpendPilot. Tell me what you're looking for and let's find the best match."
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setHeroWarmGreeting(getHeroWarmMessage());
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (session.sessionId !== prevSessionKey) {
    setPrevSessionKey(session.sessionId);
    setHasClickedProceed(false);
    setHasChosenPreference(false);
    setThinkingLabel("Thinking");
  }

  const selectedCurrency: CurrencyCode = currencyOverride ?? session.currency ?? currency ?? "USD";
  const budgetValue: string = budgetInputOverride !== null
    ? budgetInputOverride
    : session.budget
      ? String(session.budget / 100)
      : "";

  const isSubmitting = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastCompositionEndAtRef = useRef<number | null>(null);
  const userScrolledUpRef = useRef(false);
  const isUserScrollingRef = useRef(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const messageCounter = useRef(0);

  useEffect(() => {
    if (!isLoading) {
      isSubmitting.current = false;
    }
  }, [isLoading]);

  // Handle user scroll events to detect if user has scrolled up to read earlier content
  const handleScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (isNearBottom) {
      userScrolledUpRef.current = false;
      setShowJumpToLatest(false);
      isUserScrollingRef.current = false;
    } else if (isUserScrollingRef.current) {
      userScrolledUpRef.current = true;
      setShowJumpToLatest(true);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0) {
      isUserScrollingRef.current = true;
    } else if (e.deltaY > 0) {
      const el = chatContainerRef.current;
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
        userScrolledUpRef.current = false;
        setShowJumpToLatest(false);
        isUserScrollingRef.current = false;
      }
    }
  };

  // Track initial mount so we never auto-scroll or move viewport on initial load/refresh
  const isMountedRef = useRef(false);

  // Explicit scroll helper (called when user clicks "Jump to latest" or sends a message)
  const scrollToBottom = (smooth = true) => {
    userScrolledUpRef.current = false;
    isUserScrollingRef.current = false;
    setShowJumpToLatest(false);
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block: "end",
      });
    } else if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  };

  // Track last message details for scroll visibility
  const lastMsg = session.messages[session.messages.length - 1];
  const lastMsgId = lastMsg?.id;

  // Auto-scroll when new messages arrive, but NEVER hijack scroll if user scrolled up
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    const el = chatContainerRef.current;
    const isNearBottom = el ? el.scrollHeight - el.scrollTop - el.clientHeight < 120 : true;

    if (isNearBottom && !userScrolledUpRef.current) {
      const frame = requestAnimationFrame(() => {
        scrollToBottom(true);
      });
      return () => cancelAnimationFrame(frame);
    } else if (userScrolledUpRef.current || !isNearBottom) {
      setShowJumpToLatest(true);
    }
  }, [session.messages.length, lastMsgId]);

  // Auto-resize textarea as content changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        Math.max(textareaRef.current.scrollHeight, 44),
        160
      )}px`;
    }
  }, [inputText]);

  const handleSendMessage = () => {
    const text = inputText.trim();
    if (!text || isLoading || isSubmitting.current) return;
    isSubmitting.current = true;
    messageCounter.current += 1;
    const clientMessageId = `msg_u_submit_${messageCounter.current}`;

    const userMsgCount = session.messages.filter((m) => m.role === "user").length;
    const hasAnswered = Boolean(session.answeredQuestionIds && session.answeredQuestionIds.length > 0);
    if (userMsgCount === 0 && !hasAnswered && !hasChosenPreference) {
      setThinkingLabel(getRandomThinkingWord(messageCounter.current));
    }

    let parsedBudgetMinor: number | null | undefined = undefined;
    if (budgetValue && budgetValue.trim()) {
      const num = parseFloat(budgetValue.trim());
      if (!isNaN(num) && num > 0) {
        parsedBudgetMinor = Math.round(num * 100);
      }
    }

    onSendMessage(text, {
      clientMessageId,
      budgetMinor: parsedBudgetMinor,
      currency: selectedCurrency,
    });
    setInputText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    userScrolledUpRef.current = false;
    setTimeout(() => scrollToBottom(true), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      handleSendMessage();
    }
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    lastCompositionEndAtRef.current = e.timeStamp;
  };

  const handleQuickReply = (
    value: string,
    label: string,
    questionId?: string,
    attributeKey?: string
  ) => {
    if (isLoading || isSubmitting.current) return;
    isSubmitting.current = true;
    setHasChosenPreference(true);
    const isProceedVal =
      value.toLowerCase().includes("proceed") ||
      label.toLowerCase().includes("proceed") ||
      attributeKey === "proceed_confirmation" ||
      questionId === "q_proceed_confirmation";

    if (isProceedVal) {
      setHasClickedProceed(true);
    }

    if (questionId) {
      setDisabledQuestionIds((prev) => new Set(prev).add(questionId));
    }
    messageCounter.current += 1;
    const clientMessageId = `msg_u_${messageCounter.current}_${questionId || "opt"}`;
    onSendMessage(label || value, {
      questionId,
      attributeKey,
      clientMessageId,
    });
    userScrolledUpRef.current = false;
    setTimeout(() => scrollToBottom(true), 50);
  };

  const handleSelectStarterPrompt = (prompt: string) => {
    if (isLoading || isSubmitting.current) return;
    isSubmitting.current = true;
    const userMsgCount = session.messages.filter((m) => m.role === "user").length;
    const hasAnswered = Boolean(session.answeredQuestionIds && session.answeredQuestionIds.length > 0);
    if (userMsgCount === 0 && !hasAnswered && !hasChosenPreference) {
      setThinkingLabel(getRandomThinkingWord(messageCounter.current));
    }
    messageCounter.current += 1;
    const clientMessageId = `msg_u_starter_${messageCounter.current}`;
    onSendMessage(prompt, { clientMessageId });
    userScrolledUpRef.current = false;
    setTimeout(() => scrollToBottom(true), 50);
  };

  // Exclude empty placeholder assistant messages & deduplicate consecutive identical messages
  const displayMessages: ChatMessage[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < session.messages.length; i++) {
    const msg = session.messages[i];
    if (msg.role === "assistant" && (!msg.content || !msg.content.trim())) {
      continue;
    }
    if (seenIds.has(msg.id)) {
      continue;
    }
    seenIds.add(msg.id);

    // Filter consecutive duplicate assistant responses
    const prev = displayMessages[displayMessages.length - 1];
    if (
      prev &&
      prev.role === "assistant" &&
      msg.role === "assistant" &&
      prev.content?.trim().toLowerCase() === msg.content?.trim().toLowerCase()
    ) {
      continue;
    }

    displayMessages.push(msg);
  }

  const lastAssistantIdx = displayMessages.reduce(
    (lastIdx, msg, idx) => (msg.role === "assistant" ? idx : lastIdx),
    -1
  );

  // Unified loading label determination:
  // On first user message: randomly one of "Thinking", "Evaluating", "Understanding", "Reasoning"
  // After preference choice: uses progress/status message with literal dots removed
  const isFirstMessageState =
    !hasChosenPreference &&
    (!session.answeredQuestionIds || session.answeredQuestionIds.length === 0);

  let loadingLabel = thinkingLabel || "Thinking";
  if (!isFirstMessageState) {
    const rawStatus = searchProgress?.message || activeStatusText || "Thinking";
    loadingLabel = rawStatus.replace(/\.{2,}$/, "").replace(/\.+$/, "").trim();
  }

  return (
    <div id="spendpilot-chat-workspace" className="w-full max-w-4xl mx-auto flex flex-col flex-1 px-3 sm:px-4 py-4 sm:py-6">
      {/* Top Hero Section Header: Centered Typewriter Greeting H1 with SpendPilot Gradient */}
      <div className="mb-6 text-center space-y-3 px-2 animate-fadeIn flex flex-col items-center">
        {/* Pulsing AI Shopping Concierge pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[#FF6A00]/30 bg-[#FF6A00]/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#FF8126] shadow-sm shadow-[#FF6A00]/10">
          <span className="h-2 w-2 rounded-full bg-[#FF6A00] animate-pulse shrink-0" />
          <span>Shopping Agent</span>
        </div>

        {/* Gradient color H1 - Greeting text is now the H1 with typewriter effect */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 via-zinc-700 to-[#FF6A00] dark:from-white dark:via-zinc-200 dark:to-[#FF6A00] bg-clip-text text-transparent min-h-[3rem] sm:min-h-[3.75rem] flex items-center justify-center">
          <TypewriterText text={heroWarmGreeting} speed={22} />
        </h1>

        {/* Short message in one single line */}
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-[#888888] whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
          Verified merchant stock &bull; Real-time comparison &bull; Strictly within budget
        </p>
      </div>

      <div className="flex flex-col flex-1 min-h-[580px] sm:min-h-[640px] rounded-3xl border-2 border-orange-300/80 dark:border-[#FF6A00]/40 bg-[#FFFFFF] dark:bg-[#121015] shadow-[0_15px_50px_rgba(255,106,0,0.12),0_0_30px_rgba(255,106,0,0.08)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.9),0_0_45px_rgba(255,106,0,0.20)] overflow-hidden relative">

        {/* ─────────────────────────────────────────────────────────────
            MESSAGE STREAM (ARIA LIVE LOG) - CHAT CONVERSATION ONLY
           ───────────────────────────────────────────────────────────── */}
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          onWheel={handleWheel}
          onTouchMove={() => {
            isUserScrollingRef.current = true;
          }}
          role="log"
          aria-live="polite"
          aria-label="Shopping conversation history"
          className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-sm flex flex-col justify-start relative scroll-smooth bg-zinc-50/70 dark:bg-[#0c0a0e]"
        >
          {/* When conversation has not started: display ONLY Popular requests to start with */}
          {displayMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center my-auto py-16 px-4 text-center space-y-4 animate-fadeIn">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#A3A3A3]">
                Popular requests to start with:
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-xl">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleSelectStarterPrompt(prompt)}
                    className="btn-3d-pill rounded-full px-4 py-2 text-xs font-bold text-zinc-800 dark:text-[#D4D4D4] disabled:opacity-50 transition-all text-left cursor-pointer"
                  >
                    &ldquo;{prompt}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          )}

          {displayMessages.map((msg, idx) => {
            const isAssistant = msg.role === "assistant";
            const isLastAssistant = isAssistant && idx === lastAssistantIdx;

            // Derive single next question for active assistant message
            const activeQuestion = msg.nextQuestion || (msg.questions && msg.questions[0]) || null;
            const isQuestionAnswered = activeQuestion
              ? disabledQuestionIds.has(activeQuestion.id) ||
              (session.answeredQuestionIds?.includes(activeQuestion.id) ?? false)
              : true;
            const isProceedConfirmation = Boolean(
              (activeQuestion && ("attributeKey" in activeQuestion ? activeQuestion.attributeKey === "proceed_confirmation" : activeQuestion.attribute === "proceed_confirmation")) ||
              activeQuestion?.id === "q_proceed_confirmation" ||
              (isAssistant && msg.content?.toLowerCase().includes("before i search")) ||
              (isAssistant && msg.content?.toLowerCase().includes("more details"))
            );

            const activeOptions = isLastAssistant && activeQuestion && !isQuestionAnswered
              ? (activeQuestion.options || []).filter((opt) => {
                if (isProceedConfirmation || hasClickedProceed) {
                  const l = (opt.label || opt.value || "").toLowerCase();
                  if (l.includes("proceed") || l.includes("search")) {
                    return false;
                  }
                }
                return true;
              })
              : [];

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 ${isAssistant ? "justify-start" : "justify-end"} animate-fadeIn`}
              >
                {isAssistant && (
                  <div className="h-7 w-7 rounded-xl border border-[#FF6A00]/30 bg-[#141210] p-1 shrink-0 flex items-center justify-center mt-0.5 shadow-sm shadow-[#FF6A00]/15">
                    <Image
                      src="/logo/SpendPilotLOGO.png"
                      alt="SpendPilot"
                      width={20}
                      height={20}
                      className="h-full w-full object-contain"
                    />
                  </div>
                )}

                <div className={`w-full ${isAssistant ? "max-w-[85%] sm:max-w-[75%]" : "max-w-[85%] sm:max-w-[75%]"} space-y-2`}>
                  <div
                    className={`rounded-2xl p-3.5 sm:p-4 leading-relaxed ${isAssistant
                      ? "border border-orange-200/90 dark:border-[#2f2738] bg-[#FFF8F2] dark:bg-[#1a1720] text-zinc-900 dark:text-[#E8E6ED] rounded-tl-sm shadow-sm"
                      : "bg-gradient-to-r from-[#FF6A00] to-[#FF8126] text-white font-bold rounded-tr-sm shadow-md shadow-[#FF6A00]/30 border border-white/25 ml-auto"
                      }`}
                  >
                    <p className="whitespace-pre-wrap">
                      {isAssistant
                        ? cleanRepetitiveAcknowledgements(resolveNaturalMessage(msg.content, "I'm looking into options for you."))
                        : resolveNaturalMessage(msg.content, msg.content)}
                    </p>
                  </div>

                  {/* Dedicated Proceed Option button before calling Channel3 API - Strictly single instance */}
                  {isLastAssistant &&
                    isProceedConfirmation &&
                    !isQuestionAnswered &&
                    !hasClickedProceed &&
                    session.stage !== "product_selection" && (
                      <div className="pt-1.5 animate-fadeIn">
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() =>
                            handleQuickReply(
                              "Proceed to search",
                              "Proceed to search",
                              activeQuestion?.id || "q_proceed_confirmation",
                              "proceed_confirmation"
                            )
                          }
                          className="btn-3d-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-lg disabled:opacity-50 transition-all focus:outline-none focus:ring-2 focus:ring-[#FF6A00] cursor-pointer"
                        >
                          <span>Proceed to Search Verified Products</span>
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}

                  {/* Quick-Reply Option Chips (Rendered ONLY beneath active assistant question, never duplicating proceed button) */}
                  {activeOptions.length > 0 && (
                    <div className="space-y-1.5 pt-1 pl-1 animate-fadeIn">
                      <div className="flex flex-wrap gap-1.5">
                        {activeOptions.map((opt) => (
                          <button
                            key={opt.id || `${activeQuestion?.id || "q"}_opt_${opt.value || opt.label}`}
                            type="button"
                            disabled={isLoading}
                            onClick={() =>
                              handleQuickReply(
                                opt.value,
                                opt.label,
                                activeQuestion?.id,
                                activeQuestion && "attributeKey" in activeQuestion
                                  ? activeQuestion.attributeKey
                                  : (activeQuestion as { attribute: string })?.attribute
                              )
                            }
                            className="btn-3d-pill rounded-lg px-3.5 py-1.5 text-xs font-bold disabled:opacity-50 transition-all shadow-sm cursor-pointer"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {!isAssistant && (
                  <div className="h-7 w-7 rounded-xl border border-orange-200 dark:border-[#3a3245] bg-[#FFF9F3] dark:bg-[#1e1926] p-1 shrink-0 flex items-center justify-center text-[#FF6A00] dark:text-[#FF8126] mt-0.5">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })}

          {/* ─────────────────────────────────────────────────────────────
              UNIFIED THINKING / PROGRESS INDICATOR
              Single consistent indicator for both isLoading and searchProgress.
              Never displays multiple or separate bubbles for understanding/searching/comparing.
              Dots animate independently with literal '...' removed.
             ───────────────────────────────────────────────────────────── */}
          {(isLoading || Boolean(searchProgress)) && (
            <div
              className="flex items-center gap-2.5 text-xs text-[#FF8126] py-2 animate-fadeIn"
              role="status"
              aria-live="polite"
              aria-label={`${loadingLabel} in progress`}
              data-testid="search-progress-container"
            >
              <div className="relative h-7 w-7 rounded-xl border border-[#FF6A00]/40 bg-[#161210] p-1 shrink-0 flex items-center justify-center shadow-sm shadow-[#FF6A00]/20">
                <Image
                  src="/logo/SpendPilotLOGO.png"
                  alt="SpendPilot"
                  width={20}
                  height={20}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="rounded-2xl border border-orange-200 dark:border-[#352b42] bg-[#FFF8F2] dark:bg-[#17131e] px-3.5 py-2 flex items-center gap-2 shadow-sm">
                <span className="font-bold text-zinc-900 dark:text-zinc-100">{loadingLabel}</span>
                <span className="flex gap-1" aria-hidden="true">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FF6A00] animate-bounce motion-reduce:animate-none" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FF6A00] animate-bounce motion-reduce:animate-none [animation-delay:0.2s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FF6A00] animate-bounce motion-reduce:animate-none [animation-delay:0.4s]" />
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-8 shrink-0" aria-hidden="true" />
        </div>

        {/* Discreet Section 17 "Jump to latest" control when user is scrolled up */}
        {showJumpToLatest && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 animate-fadeIn pointer-events-auto">
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              className="btn-3d-pill inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold text-[#FF8126] shadow-lg shadow-[#FF6A00]/25 backdrop-blur-md hover:bg-[#1a1714] focus:outline-none focus:ring-1 focus:ring-[#FF6A00] cursor-pointer"
              aria-label="Jump to latest response"
            >
              <span>Jump to latest</span>
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            BOTTOM ACTION BANNER (LINKS TO PRODUCTS SHOWCASE SECTION)
           ───────────────────────────────────────────────────────────── */}
        {hasProductResults && productCount > 0 && (
          <div className="border-t border-orange-200/80 dark:border-[#2a2233] bg-[#FFF9F3] dark:bg-[#15121b] px-4 py-2.5 flex items-center justify-between gap-3 text-xs animate-fadeIn">
            <div className="flex items-center gap-2 text-[#16A34A] dark:text-[#35C979]">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="font-bold text-zinc-900 dark:text-[#E8E6ED]">
                {productCount} verified matching products ready in showcase below
              </span>
            </div>
            {onViewProducts && (
              <button
                type="button"
                onClick={onViewProducts}
                className="btn-3d-accent inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <span>View Products Showcase</span>
                <ArrowDown className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            BOTTOM CHAT INPUT COMPOSER
           ───────────────────────────────────────────────────────────── */}
        <div className="border-t border-orange-200/80 dark:border-[#2a2233] bg-white dark:bg-[#121015] p-3 sm:p-4">
          {/* Budget & Currencies Section in Input */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 px-0.5">
            <div className="flex items-center gap-2">
              {/* Currency Selector */}
              <div className="flex items-center gap-1.5 rounded-xl border border-orange-200 dark:border-[#382f45] bg-[#FFF9F3] dark:bg-[#1a1622] px-2.5 py-1 text-xs">
                <span className="text-zinc-500 dark:text-[#A1A1AA] text-[11px] font-bold">Currency:</span>
                <select
                  value={selectedCurrency}
                  onChange={(e) => {
                    const nextCurr = e.target.value as CurrencyCode;
                    setCurrencyOverride(nextCurr);
                    onCurrencyChange?.(nextCurr);
                  }}
                  disabled={isLoading}
                  className="bg-transparent text-zinc-900 dark:text-[#F5F5F5] font-bold focus:outline-none cursor-pointer text-xs"
                  aria-label="Select shopping currency"
                >
                  <option value="USD" className="bg-white dark:bg-[#1a1622] text-zinc-900 dark:text-white font-bold">USD ($)</option>
                  <option value="EUR" className="bg-white dark:bg-[#1a1622] text-zinc-900 dark:text-white font-bold">EUR (€)</option>
                  <option value="GBP" className="bg-white dark:bg-[#1a1622] text-zinc-900 dark:text-white font-bold">GBP (£)</option>
                </select>
              </div>

              {/* Budget Input */}
              <div className="flex items-center gap-1.5 rounded-xl border border-orange-200 dark:border-[#382f45] bg-[#FFF9F3] dark:bg-[#1a1622] px-2.5 py-1 text-xs">
                <span className="text-zinc-500 dark:text-[#A1A1AA] text-[11px] font-bold">Budget:</span>
                <span className="text-[#FF8126] font-bold">
                  {selectedCurrency === "EUR" ? "€" : selectedCurrency === "GBP" ? "£" : "$"}
                </span>
                <input
                  type="number"
                  min="1"
                  max="1000000"
                  step="any"
                  value={budgetValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBudgetInputOverride(val);
                    if (!val) {
                      onBudgetChange?.(null);
                    } else {
                      const num = parseFloat(val);
                      if (!isNaN(num) && num > 0) {
                        onBudgetChange?.(Math.round(num * 100));
                      }
                    }
                  }}
                  placeholder="Max budget (optional)"
                  disabled={isLoading}
                  className="w-28 sm:w-36 bg-transparent text-zinc-900 dark:text-[#F5F5F5] font-bold placeholder-zinc-400 dark:placeholder-[#776f82] focus:outline-none text-xs"
                  aria-label="Budget amount limit"
                />
                {budgetValue && (
                  <button
                    type="button"
                    onClick={() => {
                      setBudgetInputOverride("");
                      onBudgetChange?.(null);
                    }}
                    disabled={isLoading}
                    className="text-zinc-400 hover:text-zinc-600 dark:text-[#888888] dark:hover:text-[#FFFFFF] text-xs px-1 cursor-pointer font-bold"
                    title="Clear budget"
                    aria-label="Clear budget"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>

            {session.budget && (
              <span className="hidden sm:inline-flex items-center text-[11px] text-[#16A34A] dark:text-[#35C979] font-mono font-bold">
                Active limit: {formatMinorUnits(session.budget, session.currency || selectedCurrency)}
              </span>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2"
          >
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionEnd={handleCompositionEnd}
                placeholder="Describe what you're looking for, ask a question, or set a budget..."
                disabled={isLoading}
                rows={1}
                className="w-full resize-none rounded-xl border border-orange-200 dark:border-[#382f45] bg-[#FFFDFB] dark:bg-[#18151f] px-4 py-2.5 text-sm text-zinc-900 dark:text-[#F5F5F5] placeholder-zinc-400 dark:placeholder-[#776f82] focus:border-[#FF6A00] focus:outline-none focus:ring-1 focus:ring-[#FF6A00] caret-[#FF6A00] disabled:opacity-50 transition-all leading-relaxed shadow-inner font-medium"
                aria-label="Message SpendPilot assistant"
              />
            </div>
            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="btn-3d-primary inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-[#FF6A00] cursor-pointer"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-zinc-500 dark:text-[#776f82]">
            <span>Enter to send &bull; Shift+Enter for new line</span>
            <span>Zero hallucinated prices &bull; Verified retailer data</span>
          </div>
        </div>
      </div>
    </div>
  );
}
