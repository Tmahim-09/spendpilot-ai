"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ContinuousChatWorkspace } from "@/components/chat/ContinuousChatWorkspace";
import { LiveProductResults } from "@/components/product-results/LiveProductResults";
import { ProductVariantConfigurator } from "@/components/guided-shopping/ProductVariantConfigurator";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { TrustSection } from "@/components/sections/TrustSection";
import { SiteFooter } from "@/components/layout/SiteFooter";
import {
  createInitialSession,
  getRandomWelcomeMessage,
} from "@/lib/ai/conversation-engine";
import { minorToMajorUnits } from "@/lib/money";
import { selectRetailerOffer } from "@/lib/shopping/offer-verification";
import { formatCurrency } from "@/lib/utils";
import {
  createInitialWorkspace,
  selectProductForItem,
  getNextUnresolvedItem,
  addIndependentItem,
  calculateWorkspaceBudgetSummary,
  getActiveWorkspaceItem,
} from "@/lib/workspace/workspace-manager";
import type { ShoppingItem } from "@/lib/workspace/types";
import { saveWorkspaceToStorage } from "@/lib/workspace/workspace-storage";
import {
  getProgressMessage,
  type SearchProgressState,
} from "@/lib/shopping/search-progress";
import { isDelegatedOrNoPreference } from "@/lib/orchestrator/intent-analyzer";
import type {
  NormalizedProduct,
  ProductOfferItem,
  CurrencyCode,
  SearchProductsResponsePayload,
  ShoppingRecommendResponsePayload,
  AiComparisonResult,
  EvidenceFact,
  ProductVariantSelection,
  AuthoritativeShoppingSession,
  CanonicalShoppingAttribute,
} from "@/types";

export default function Home() {
  const [currency, setCurrency] = useState<CurrencyCode>("USD");

  // Conversational Chat Session State (Interactions API) - strictly ephemeral in memory
  const [chatSession, setChatSession] = useState<AuthoritativeShoppingSession>(() => {
    const init = createInitialSession({ sessionId: "ephemeral_client" });
    return {
      ...init,
      workspace: createInitialWorkspace({ id: "ephemeral_client" }),
    };
  });
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatStatusText, setChatStatusText] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState<SearchProgressState | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // Handle hash scrolling when returning from /cart or navigating via links
  useEffect(() => {
    const handleHash = () => {
      if (typeof window !== "undefined" && window.location.hash) {
        const id = window.location.hash.replace("#", "");
        const el = document.getElementById(id);
        if (el) {
          setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 50);
        }
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  // Variant Configuration State
  const [configuringProduct, setConfiguringProduct] = useState<NormalizedProduct | null>(null);
  const [configuredProductIds, setConfiguredProductIds] = useState<Set<string>>(new Set());
  const [configuredVariants, setConfiguredVariants] = useState<Record<string, ProductVariantSelection>>({});

  // Product Results & Showcase State
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [comparison, setComparison] = useState<AiComparisonResult | null>(null);
  const [evidenceFacts, setEvidenceFacts] = useState<Record<string, EvidenceFact>>({});
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Background AI ranking & refinement progress
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [isRankingAi, setIsRankingAi] = useState(false);
  const [isRefining, setIsRefining] = useState(false);

  // Monotonic ID to prevent race conditions from previous late responses
  const activeSearchId = useRef(0);

  // Track hydration state to prevent initial render from overwriting stored workspace
  const isHydratedRef = useRef(false);
  const lastSavedWorkspaceRef = useRef<string>("");

  // Smooth scroll helper to navigate from chat to products showcase
  const scrollToShowcase = useCallback(() => {
    if (typeof window !== "undefined") {
      const el = document.getElementById("products-showcase");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Ensure window stays at top on mount/refresh (never jumping to input section)
  useEffect(() => {
    if (typeof window !== "undefined") {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
      window.scrollTo(0, 0);
    }
  }, []);

  // Hydrate workspace from localStorage once on client mount (safe against Strict Mode and SSR)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (typeof window !== "undefined") {
          const raw = window.localStorage.getItem("spendpilot_workspace");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.groups)) {
              lastSavedWorkspaceRef.current = raw;
              setChatSession((prev) => ({ ...prev, workspace: parsed }));
              const selectedIds = new Set<string>();
              parsed.groups.forEach((g: { items: Array<{ status: string; selectedProductId?: string }> }) => {
                g.items.forEach((item) => {
                  if (item.status === "selected" && item.selectedProductId) {
                    selectedIds.add(item.selectedProductId);
                  }
                });
              });
              setSelectedProductIds(selectedIds);
            }
          }
        }
      } catch {
        // Ignore parsing errors
      } finally {
        isHydratedRef.current = true;
      }
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // Listen for external cross-tab storage changes (e.g. from /cart page removals in another window/tab)
  useEffect(() => {
    const handleCrossTabStorage = (e: StorageEvent) => {
      if (e.key && e.key !== "spendpilot_workspace") return;
      try {
        const raw = window.localStorage.getItem("spendpilot_workspace");
        if (!raw || raw === lastSavedWorkspaceRef.current) return;
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.groups)) {
          lastSavedWorkspaceRef.current = raw;
          setChatSession((prev) => ({ ...prev, workspace: parsed }));
          const selectedIds = new Set<string>();
          parsed.groups.forEach((g: { items: Array<{ status: string; selectedProductId?: string }> }) => {
            g.items.forEach((item) => {
              if (item.status === "selected" && item.selectedProductId) {
                selectedIds.add(item.selectedProductId);
              }
            });
          });
          setSelectedProductIds(selectedIds);
        }
      } catch {
        // Ignore parsing errors
      }
    };

    window.addEventListener("storage", handleCrossTabStorage);
    return () => window.removeEventListener("storage", handleCrossTabStorage);
  }, []);

  // Sync workspace to localStorage whenever it changes so /cart page accesses selected items
  // Guarded by hydration ref and serialized equality to avoid feedback loops
  useEffect(() => {
    if (!isHydratedRef.current || !chatSession.workspace || typeof window === "undefined") {
      return;
    }

    try {
      const serialized = JSON.stringify(chatSession.workspace);
      if (serialized === lastSavedWorkspaceRef.current) {
        return;
      }
      lastSavedWorkspaceRef.current = serialized;
      saveWorkspaceToStorage(chatSession.workspace);
    } catch {
      // Ignore
    }
  }, [chatSession.workspace]);



  const handleResetSession = useCallback(() => {
    const fresh = createInitialSession({ currency, welcomeMessage: getRandomWelcomeMessage() });
    const freshWorkspace = createInitialWorkspace({ id: fresh.sessionId, currency });
    try {
      const serialized = JSON.stringify(freshWorkspace);
      lastSavedWorkspaceRef.current = serialized;
      saveWorkspaceToStorage(freshWorkspace);
    } catch {
      // Ignore
    }
    setChatSession({
      ...fresh,
      workspace: freshWorkspace,
    });
    setProducts([]);
    setComparison(null);
    setEvidenceFacts({});
    setHasSearched(false);
    setSearchError(null);
    setConfiguringProduct(null);
    setConfiguredProductIds(new Set());
    setConfiguredVariants({});
    setSelectedProductIds(new Set());
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("spendpilot_guided_shopping_session");
      }
    } catch {
      // Ignore
    }
  }, [currency]);

  const handleCompareProducts = useCallback(
    async (candidateProductIds: string[]) => {
      if (products.length === 0) return;
      setIsRankingAi(true);
      try {
        const candidateProducts = products.filter((p) =>
          candidateProductIds.includes(p.sourceProductId || p.title)
        );
        const toCompare = candidateProducts.length >= 2 ? candidateProducts : products.slice(0, 4);
        const majorBudget = minorToMajorUnits(chatSession.budget);

        const compRes = await fetch("/api/shopping/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: chatSession.originalRequest,
            budget: majorBudget,
            currency: chatSession.currency || currency,
            products: toCompare,
            canonicalAttributes: chatSession.canonicalAttributes,
          }),
        });

        const compData = (await compRes.json()) as ShoppingRecommendResponsePayload;
        if (compRes.ok && compData.success && compData.comparison) {
          setComparison(compData.comparison);
          setEvidenceFacts(compData.evidenceFacts || {});
          if (compData.allProducts && compData.allProducts.length > 0) {
            setProducts(compData.allProducts);
          }
        }
      } catch {
        // Keep existing results
      } finally {
        setIsRankingAi(false);
      }
    },
    [products, chatSession.budget, chatSession.originalRequest, chatSession.currency, chatSession.canonicalAttributes, currency]
  );

  /**
   * Executes verified Channel3 product discovery and background AI comparison
   */
  const executeDirectSearch = useCallback(
    async (
      searchQuery: string,
      searchBudget: number | null,
      searchCurrency: CurrencyCode = "USD",
      searchCanonicalAttrs?: Record<string, CanonicalShoppingAttribute>
    ) => {
      const currentId = ++activeSearchId.current;
      const majorBudget = minorToMajorUnits(searchBudget);

      setHasSearched(true);
      setSearchError(null);
      setIsSearchingProducts(true);

      const reqCategory = chatSession.shoppingBrief?.productRequirements?.[0]?.category || "";
      const isWinter =
        searchQuery.toLowerCase().includes("winter") ||
        (chatSession.shoppingBrief?.userGoal?.toLowerCase().includes("winter") ?? false);

      // Stage B: Searching (animated dots)
      const searchingMsg = getProgressMessage("searching", searchQuery, reqCategory, { isWinter });
      setSearchProgress({
        stage: "searching",
        message: searchingMsg,
      });
      setChatStatusText(searchingMsg);
      setIsRankingAi(false);
      setComparison(null);
      setEvidenceFacts({});

      try {
        const searchRes = await fetch("/api/products/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: searchQuery,
            budget: majorBudget,
            currency: searchCurrency,
            mode: "single",
            pricePreference: "near_budget",
            expandRange: false,
            canonicalAttributes: searchCanonicalAttrs ?? chatSession.canonicalAttributes,
          }),
        });

        const searchData = (await searchRes.json()) as SearchProductsResponsePayload;
        if (currentId !== activeSearchId.current) return;

        if (!searchRes.ok || !searchData.success) {
          setProducts([]);
          setIsSearchingProducts(false);
          setSearchProgress(null);
          setSearchError(searchData.error || "Unable to retrieve products. Please try again.");
          setChatSession((prev) => ({
            ...prev,
            messages: [
              ...prev.messages,
              {
                id: `msg_err_${Date.now()}`,
                role: "assistant",
                content: "I ran into a temporary issue retrieving live products. Your requirements are preserved. Please click below or reply to try again.",
                createdAt: Date.now(),
              },
            ],
          }));
          return;
        }

        const retrievedProducts = searchData.products || [];
        setProducts(retrievedProducts);
        setIsSearchingProducts(false);

        if (retrievedProducts.length === 0) {
          setSearchProgress(null);
          setChatSession((prev) => ({
            ...prev,
            stage: "product_selection",
            messages: [
              ...prev.messages,
              {
                id: `msg_empty_${Date.now()}`,
                role: "assistant",
                content: "I couldn't find any products matching those exact specifications. Would you like to adjust your price range, brand, or key features?",
                createdAt: Date.now(),
              },
            ],
          }));
          return;
        }

        // Stage C: Search completed
        const searchCompletedMsg = getProgressMessage("search_completed", searchQuery, reqCategory, { isWinter });
        setSearchProgress({
          stage: "search_completed",
          message: searchCompletedMsg,
        });

        // Stage D: Comparing
        const comparingMsg = getProgressMessage("comparing", searchQuery, reqCategory, { isWinter });
        setSearchProgress({
          stage: "comparing",
          message: comparingMsg,
        });
        setChatStatusText(comparingMsg);
        setIsRankingAi(true);

        let finalRecComparison: AiComparisonResult | null = null;
        let finalRecEvidence: Record<string, EvidenceFact> = {};
        let finalAllProducts: NormalizedProduct[] = retrievedProducts;

        try {
          const recRes = await fetch("/api/shopping/recommend", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: searchQuery,
              products: retrievedProducts,
              budget: majorBudget,
              currency: searchCurrency,
              canonicalAttributes: searchCanonicalAttrs ?? chatSession.canonicalAttributes,
            }),
          });

          const recData = (await recRes.json()) as ShoppingRecommendResponsePayload;
          if (currentId !== activeSearchId.current) return;

          if (recRes.ok && recData.success && recData.comparison) {
            finalRecComparison = recData.comparison;
            finalRecEvidence = recData.evidenceFacts || {};
            if (recData.allProducts && recData.allProducts.length > 0) {
              finalAllProducts = recData.allProducts;
            }
            setComparison(finalRecComparison);
            setEvidenceFacts(finalRecEvidence);
            setProducts(finalAllProducts);
          }
        } catch {
          // AI comparison failure: product catalog remains visible without pretending comparison succeeded
          setComparison(null);
        } finally {
          if (currentId === activeSearchId.current) {
            setIsRankingAi(false);
          }
        }

        // Stage E: Completed -> Clear transient progress and append exactly ONE final message
        setSearchProgress(null);
        const finalMsg = getProgressMessage("completed", searchQuery, reqCategory, { isWinter });

        setChatSession((prev) => {
          let ws = prev.workspace;
          if (ws) {
            let targetItemId = ws.activeItemId;
            if (!targetItemId || ws.groups.length === 0) {
              ws = addIndependentItem(ws, {
                productRequest: searchQuery,
                category: reqCategory || "general",
                displayName: searchQuery,
              });
              targetItemId = ws.activeItemId;
            }

            if (targetItemId) {
              const updatedGroups = ws.groups.map((g) => ({
                ...g,
                items: g.items.map((i) => {
                  if (i.id === targetItemId) {
                    return {
                      ...i,
                      searchId: `search_${currentId}`,
                      searchFingerprint: `${searchQuery}_${majorBudget || 0}_${searchCurrency}`,
                      searchStatus: "completed" as const,
                      candidates: finalAllProducts,
                      comparison: finalRecComparison,
                      evidenceFacts: finalRecEvidence,
                      status: (i.status === "selected" ? "selected" : "results_ready") as ShoppingItem["status"],
                    };
                  }
                  return i;
                }),
              }));
              ws = { ...ws, groups: updatedGroups, updatedAt: Date.now() };
              saveWorkspaceToStorage(ws);
            }
          }

          const hasRecentIntro = prev.messages.slice(-3).some(
            (m) =>
              m.role === "assistant" &&
              (m.content === finalMsg ||
                m.content.includes("compared the available options") ||
                m.content.includes("best matches"))
          );
          return {
            ...prev,
            workspace: ws,
            stage: "product_selection",
            retrievedProductIds: finalAllProducts.map((p) => p.sourceProductId || p.title),
            messages: hasRecentIntro
              ? prev.messages
              : [
                ...prev.messages,
                {
                  id: `msg_completed_${Date.now()}`,
                  role: "assistant",
                  content: finalMsg,
                  createdAt: Date.now(),
                },
              ],
          };
        });
      } catch {
        if (currentId !== activeSearchId.current) return;
        setProducts([]);
        setIsSearchingProducts(false);
        setIsRankingAi(false);
        setSearchProgress(null);
        setSearchError("Failed to connect to product search service. Please try again.");
      }
    },
    [chatSession.canonicalAttributes, chatSession.shoppingBrief]
  );

  const handleSendChatMessage = useCallback(
    async (
      messageText: string,
      metaOrSession?:
        | AuthoritativeShoppingSession
        | { questionId?: string; attributeKey?: string; clientMessageId?: string },
      explicitSession?: AuthoritativeShoppingSession
    ) => {
      let sessionToUse = chatSession;
      let meta: { questionId?: string; attributeKey?: string; clientMessageId?: string } | undefined;

      if (metaOrSession && "sessionId" in metaOrSession) {
        sessionToUse = metaOrSession;
      } else if (metaOrSession) {
        meta = metaOrSession;
        if (explicitSession) sessionToUse = explicitSession;
      }

      const cleanMsg = messageText.trim().toLowerCase();
      if (
        cleanMsg === "i'm done for now" ||
        cleanMsg === "done for now" ||
        cleanMsg === "i am done" ||
        cleanMsg === "done"
      ) {
        const ws = sessionToUse.workspace || createInitialWorkspace({ currency });
        const summary = calculateWorkspaceBudgetSummary(ws, currency);
        const selectedItems = ws.groups.flatMap((g) =>
          g.items.filter((i) => i.status === "selected")
        );

        let summaryText = "";
        if (selectedItems.length === 0) {
          summaryText =
            "You haven't selected any products yet. Tell me what you're looking for whenever you're ready!";
        } else {
          summaryText =
            `Here is your final shopping summary:\n\n` +
            selectedItems
              .map((item, idx) => {
                const p = item.selectedProduct;
                const o = item.selectedOffer || p?.selectedOffer || p?.offers?.[0];
                const priceStr =
                  o?.priceMinor != null
                    ? formatCurrency(o.priceMinor, o.currency || currency)
                    : "Price unconfirmed";
                const retailerStr = o?.domain || p?.retailerName || "Retailer";
                return `${idx + 1}. **${p?.title || item.productRequest}** — ${priceStr} (${retailerStr})`;
              })
              .join("\n") +
            `\n\n**Total:** ${formatCurrency(summary.totalSelectedMinor, summary.currency)}` +
            (summary.remainingMinor != null
              ? `\n**Remaining Budget:** ${formatCurrency(summary.remainingMinor, summary.currency)}`
              : "") +
            `\n\nYou can review your full list and retailer links in My Shopping List on the right.`;
        }

        const userMsg = {
          id: meta?.clientMessageId || `msg_u_${Date.now()}`,
          role: "user" as const,
          content: messageText,
          createdAt: Date.now(),
        };
        const assistantMsg = {
          id: `msg_a_done_${Date.now()}`,
          role: "assistant" as const,
          content: summaryText,
          createdAt: Date.now() + 10,
        };

        setChatSession((prev) => ({
          ...prev,
          messages: [...prev.messages.filter((m) => m.id !== userMsg.id), userMsg, assistantMsg],
        }));
        return;
      }

      if (
        cleanMsg === "add another item" ||
        cleanMsg === "add another" ||
        cleanMsg === "add item"
      ) {
        const userMsg = {
          id: meta?.clientMessageId || `msg_u_${Date.now()}`,
          role: "user" as const,
          content: messageText,
          createdAt: Date.now(),
        };
        const assistantMsg = {
          id: `msg_a_add_${Date.now()}`,
          role: "assistant" as const,
          content:
            "What would you like to find next? Tell me what you're looking for and your budget if you have one.",
          createdAt: Date.now() + 10,
        };

        setChatSession((prev) => ({
          ...prev,
          messages: [...prev.messages.filter((m) => m.id !== userMsg.id), userMsg, assistantMsg],
        }));
        return;
      }

      setIsChatLoading(true);

      const reqCategory = sessionToUse.shoppingBrief?.productRequirements?.[0]?.category || "";
      const isWinter =
        messageText.toLowerCase().includes("winter") ||
        (sessionToUse.shoppingBrief?.userGoal?.toLowerCase().includes("winter") ?? false);

      // Stage A: Understanding / Thinking (only shown while processing)
      const isDelegatedChoice = isDelegatedOrNoPreference(messageText);
      if (isDelegatedChoice) {
        setSearchProgress(null);
        setChatStatusText("Thinking");
      } else {
        const understandingMsg = getProgressMessage("understanding", messageText, reqCategory, { isWinter });
        setSearchProgress({
          stage: "understanding",
          message: understandingMsg,
        });
        setChatStatusText(understandingMsg);
      }

      const activeItem = getActiveWorkspaceItem(sessionToUse.workspace);
      const relevantCandidates = activeItem?.candidates?.length
        ? activeItem.candidates
        : (sessionToUse.workspace?.groups?.length ? [] : products);

      const currentSummary = relevantCandidates.slice(0, 6).map((p) => ({
        id: p.sourceProductId || p.title,
        title: p.title,
        price: p.priceMinor !== null ? p.priceMinor / 100 : null,
        currency: p.currency,
        brand: p.brand,
        availability: p.availability,
      }));

      const metaObj = (meta && typeof meta === "object" && !("sessionId" in meta)) ? meta : null;
      const effectiveBudget: number | null = (metaObj && "budgetMinor" in metaObj && typeof metaObj.budgetMinor === "number")
        ? metaObj.budgetMinor
        : (sessionToUse.budget ?? null);
      const effectiveCurrency: CurrencyCode = (metaObj && "currency" in metaObj && typeof metaObj.currency === "string")
        ? (metaObj.currency as CurrencyCode)
        : (sessionToUse.currency || currency);

      try {
        const payloadBody = {
          sessionId: sessionToUse.sessionId,
          message: messageText,
          clientMessageId: meta?.clientMessageId,
          answeredQuestionId: meta?.questionId,
          answeredAttributeKey: meta?.attributeKey,
          mode: "single",
          budget: effectiveBudget,
          currency: effectiveCurrency,
          sessionState: {
            ...sessionToUse,
            budget: effectiveBudget,
            currency: effectiveCurrency,
          },
          currentProductIds: relevantCandidates.map((p) => p.sourceProductId || p.title),
          currentProductsSummary: currentSummary,
        };

        // Optimistically append user message ONLY (no empty assistant bubble)
        const userMsgId = meta?.clientMessageId || `msg_u_${Date.now()}`;
        const placeholderAssistantId = `msg_a_stream_${Date.now()}`;
        const newUserMsg = {
          id: userMsgId,
          role: "user" as const,
          content: messageText,
          createdAt: Date.now(),
        };

        setChatSession((prev) => ({
          ...prev,
          budget: effectiveBudget,
          currency: effectiveCurrency,
          messages: [...prev.messages.filter((m) => m.id !== userMsgId), newUserMsg],
        }));

        // Attempt SSE streaming first
        const streamRes = await fetch("/api/shopping/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadBody),
        });

        if (streamRes.ok && streamRes.body && streamRes.headers.get("content-type")?.includes("text/event-stream")) {
          const reader = streamRes.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          let accumulatedText = "";
          let finalSession: AuthoritativeShoppingSession | null = null;
          let shouldSearchAfterStream = false;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split("\n\n");
            buffer = blocks.pop() || "";

            for (const block of blocks) {
              const trimmed = block.trim();
              if (!trimmed.startsWith("data:")) continue;
              const jsonStr = trimmed.slice(5).trim();
              try {
                const event = JSON.parse(jsonStr);
                if (event.type === "delta" && event.text) {
                  accumulatedText += event.text;
                  setChatSession((prev) => {
                    const msgs = [...prev.messages];
                    const lastIdx = msgs.length - 1;
                    if (lastIdx >= 0 && msgs[lastIdx]?.role === "assistant" && msgs[lastIdx]?.id === placeholderAssistantId) {
                      msgs[lastIdx] = { ...msgs[lastIdx], content: accumulatedText };
                    } else {
                      msgs.push({
                        id: placeholderAssistantId,
                        role: "assistant",
                        content: accumulatedText,
                        createdAt: Date.now(),
                      });
                    }
                    return { ...prev, messages: msgs };
                  });
                } else if (event.type === "question" || event.type === "clarification") {
                  shouldSearchAfterStream = false;
                  setSearchProgress(null);
                } else if (event.type === "action") {
                  if (event.action === "start_new_task" || event.action === "new_shopping_task") {
                    setProducts([]);
                    setComparison(null);
                    setEvidenceFacts({});
                    setHasSearched(false);
                    setSearchError(null);
                    setConfiguredProductIds(new Set());
                    setConfiguredVariants({});
                  }
                  if (event.shouldExecuteSearch) {
                    shouldSearchAfterStream = true;
                  }
                } else if (event.type === "done") {
                  finalSession = event.session;
                  setChatSession(event.session);
                  if (event.session?.currency) {
                    setCurrency(event.session.currency);
                  }
                  if (event.shouldExecuteSearch !== undefined) {
                    shouldSearchAfterStream = Boolean(event.shouldExecuteSearch);
                  }
                  if (
                    event.session?.activeQuestion ||
                    (event.session?.pendingQuestions && event.session.pendingQuestions.length > 0) ||
                    event.session?.stage === "needs_clarification"
                  ) {
                    shouldSearchAfterStream = false;
                    setSearchProgress(null);
                  }
                } else if (event.type === "error") {
                  shouldSearchAfterStream = false;
                  setIsChatLoading(false);
                  setSearchProgress(null);
                  const friendlyError =
                    "I encountered a temporary connection issue. Your preferences have been saved. Please reply or click below to try again.";
                  setChatSession((prev) => {
                    const msgs = prev.messages.filter((m) => m.id !== placeholderAssistantId);
                    return {
                      ...prev,
                      messages: [
                        ...msgs,
                        {
                          id: `msg_err_${Date.now()}`,
                          role: "assistant",
                          content: friendlyError,
                          createdAt: Date.now(),
                        },
                      ],
                    };
                  });
                  return;
                }
              } catch {
                // Ignore partial JSON parse errors
              }
            }
          }

          const textEndsWithQuestion = /\?\s*$/.test(accumulatedText.trim());
          if (textEndsWithQuestion) {
            shouldSearchAfterStream = false;
          }

          const hasPendingClarification = Boolean(
            finalSession?.activeQuestion ||
            (finalSession?.pendingQuestions && finalSession.pendingQuestions.length > 0) ||
            finalSession?.stage === "needs_clarification" ||
            textEndsWithQuestion
          );

          if (finalSession && shouldSearchAfterStream && !hasPendingClarification) {
            const activeReq =
              finalSession.shoppingBrief?.productRequirements?.find((r) => r.searchQuery) ||
              finalSession.shoppingBrief?.productRequirements?.[0];
            const queryTerm = activeReq?.searchQuery || activeReq?.displayName || finalSession.originalRequest || messageText;
            await executeDirectSearch(
              queryTerm,
              finalSession.budget,
              finalSession.currency || currency,
              finalSession.canonicalAttributes
            );
          } else {
            setSearchProgress(null);
          }
          return;
        }

        // Fallback to standard JSON endpoint if SSE stream was unavailable
        const res = await fetch("/api/shopping/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadBody),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Unable to process message.");
        }

        setChatSession(data.session);
        if (data.session?.currency) {
          setCurrency(data.session.currency);
        }

        if (data.action === "new_shopping_task" || data.action === "start_new_task") {
          setProducts([]);
          setComparison(null);
          setEvidenceFacts({});
          setHasSearched(false);
          setSearchError(null);
          setConfiguredProductIds(new Set());
          setConfiguredVariants({});
        }

        const assistantMsgContent = (data.message || data.assistantMessage || "").trim();
        const textEndsWithQuestion = /\?\s*$/.test(assistantMsgContent);

        const hasPendingClarification = Boolean(
          data.clarification ||
          data.nextQuestion ||
          data.session?.activeQuestion ||
          (data.session?.pendingQuestions && data.session.pendingQuestions.length > 0) ||
          data.session?.stage === "needs_clarification" ||
          textEndsWithQuestion
        );

        if (data.shouldExecuteSearch && !hasPendingClarification && !textEndsWithQuestion) {
          const activeReq =
            data.session?.shoppingBrief?.productRequirements?.find((r: { searchQuery?: string }) => r.searchQuery) ||
            data.session?.shoppingBrief?.productRequirements?.[0];
          const queryTerm = activeReq?.searchQuery || activeReq?.displayName || data.session?.originalRequest || messageText;
          await executeDirectSearch(
            queryTerm,
            data.session?.budget,
            data.session?.currency || currency,
            data.session?.canonicalAttributes
          );
        } else {
          setSearchProgress(null);
          if (data.shouldExecuteComparison && data.comparisonRequestedProductIds?.length) {
            setChatStatusText("Comparing the best matches...");
            await handleCompareProducts(data.comparisonRequestedProductIds);
          } else if (data.variantConfiguration?.productId) {
            const prodToConfig = products.find(
              (p) => (p.sourceProductId || p.title) === data.variantConfiguration.productId
            );
            if (prodToConfig) {
              setConfiguringProduct(prodToConfig);
            }
          }
        }
      } catch {
        setSearchProgress(null);
        setChatSession((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: `msg_err_${Date.now()}`,
              role: "assistant",
              content:
                "I encountered a temporary connection issue. Your preferences have been preserved. Please reply or click below to try again.",
              createdAt: Date.now(),
            },
          ],
        }));
      } finally {
        setIsChatLoading(false);
        setChatStatusText(null);
      }
    },
    [chatSession, products, currency, executeDirectSearch, handleCompareProducts]
  );

  /**
   * Action when user clicks Re-run search
   */
  const handleConfirmAndSearch = () => {
    if (
      chatSession.activeQuestion ||
      (chatSession.pendingQuestions && chatSession.pendingQuestions.length > 0) ||
      chatSession.stage === "needs_clarification"
    ) {
      return;
    }
    const activeReq =
      chatSession.shoppingBrief?.productRequirements?.find((r) => r.searchQuery) ||
      chatSession.shoppingBrief?.productRequirements?.[0];
    const queryTerm =
      activeReq?.searchQuery || activeReq?.displayName || chatSession.originalRequest || "products";
    executeDirectSearch(
      queryTerm,
      chatSession.budget,
      chatSession.currency || currency,
      chatSession.canonicalAttributes
    );
  };

  /**
   * Product Variant Configuration Confirmation
   */
  const handleConfirmVariantSelection = (selection: ProductVariantSelection) => {
    setConfiguredProductIds((prev) => new Set([...prev, selection.productId]));
    setConfiguredVariants((prev) => ({
      ...prev,
      [selection.productId]: selection,
    }));

    // Update product pricing and metadata in current product results
    setProducts((prev) =>
      prev.map((p) => {
        const pid = p.sourceProductId || p.title;
        if (pid === selection.productId) {
          return {
            ...p,
            title: selection.title || p.title,
            priceMinor: selection.confirmedPriceMinor ?? p.priceMinor,
            retailerUrl: selection.confirmedRetailerUrl || p.retailerUrl,
            imageUrl: selection.imageUrl || p.imageUrl,
            retailerName: selection.retailerName || p.retailerName,
          };
        }
        return p;
      })
    );

    // Sync updated selection, options, and color image to shopping workspace / cart if already added
    setChatSession((prev) => {
      let ws = prev.workspace;
      let hasUpdatedWs = false;
      if (ws && ws.groups) {
        const activeItemId = ws.activeItemId;
        const newGroups = ws.groups.map((group) => ({
          ...group,
          items: group.items.map((item) => {
            const isMatch =
              (item.selectedProduct &&
                (item.selectedProduct.sourceProductId === selection.productId ||
                  item.selectedProduct.title === selection.title)) ||
              (activeItemId && item.id === activeItemId);
            if (isMatch && item.selectedProduct) {
              hasUpdatedWs = true;
              return {
                ...item,
                selectedVariant: (selection.selectedOptions as Record<string, string>) || item.selectedVariant,
                selectedProduct: {
                  ...item.selectedProduct,
                  title: selection.title || item.selectedProduct.title,
                  priceMinor: selection.confirmedPriceMinor ?? item.selectedProduct.priceMinor,
                  retailerUrl: selection.confirmedRetailerUrl || item.selectedProduct.retailerUrl,
                  imageUrl: selection.imageUrl || item.selectedProduct.imageUrl,
                  retailerName: selection.retailerName || item.selectedProduct.retailerName,
                },
              };
            }
            return item;
          }),
        }));
        if (hasUpdatedWs) {
          ws = { ...ws, groups: newGroups, updatedAt: Date.now() };
          saveWorkspaceToStorage(ws);
        }
      }
      return {
        ...prev,
        workspace: ws,
      };
    });

    setConfiguringProduct(null);
  };

  const handleSelectOffer = (product: NormalizedProduct, offer: ProductOfferItem) => {
    const updated = selectRetailerOffer(product, offer.url, chatSession.canonicalAttributes);
    const pid = product.sourceProductId || product.title;

    setProducts((prev) =>
      prev.map((p) => ((p.sourceProductId || p.title) === pid ? updated : p))
    );

    // Persist selected offer onto matching item in workspace and localStorage
    setChatSession((prev) => {
      const ws = prev.workspace;
      if (!ws || !ws.groups) return prev;
      let hasUpdated = false;
      const activeItemId = ws.activeItemId;

      const newGroups = ws.groups.map((group) => ({
        ...group,
        items: group.items.map((item) => {
          const isSelectedMatch =
            item.selectedProduct &&
            ((item.selectedProduct.sourceProductId && item.selectedProduct.sourceProductId === pid) ||
              item.selectedProduct.title === product.title);
          const isActiveItemMatch = activeItemId ? item.id === activeItemId : false;

          if (isSelectedMatch || (isActiveItemMatch && item.status === "selected")) {
            hasUpdated = true;
            return {
              ...item,
              selectedOffer: offer,
              selectedProduct: item.selectedProduct
                ? {
                    ...item.selectedProduct,
                    priceMinor: offer.priceMinor,
                    retailerUrl: offer.url,
                    retailerName: offer.domain || item.selectedProduct.retailerName,
                    selectedOffer: offer,
                  }
                : null,
            };
          }
          return item;
        }),
      }));

      if (hasUpdated) {
        const nextWs = { ...ws, groups: newGroups, updatedAt: Date.now() };
        saveWorkspaceToStorage(nextWs);
        return { ...prev, workspace: nextWs };
      }
      return prev;
    });
  };

  const handleRefinePriority = async (priorityText: string) => {
    if (products.length === 0) return;
    setIsRefining(true);

    try {
      const majorBudget = minorToMajorUnits(chatSession.budget);
      const recRes = await fetch("/api/shopping/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: chatSession.originalRequest,
          products,
          budget: majorBudget,
          currency: chatSession.currency || currency,
          priorityOverride: priorityText,
        }),
      });

      const recData = (await recRes.json()) as ShoppingRecommendResponsePayload;
      if (recRes.ok && recData.success && recData.comparison) {
        setComparison(recData.comparison);
        setEvidenceFacts(recData.evidenceFacts || {});
      }
    } catch {
      // Keep existing comparison
    } finally {
      setIsRefining(false);
    }
  };

  /**
   * Action when user selects a product: adds to authoritative workspace
   * and triggers conversational follow-up (Section 4 & 15).
   */
  const handleSelectProduct = useCallback(
    (product: NormalizedProduct) => {
      const productId = product.sourceProductId || product.title;
      setSelectedProductIds((prev) => new Set([...prev, productId]));

      let ws = chatSession.workspace || createInitialWorkspace({ currency });

      // Determine target item: active item, or unresolved item, or create one
      let targetItemId = ws.activeItemId;
      if (!targetItemId) {
        const next = getNextUnresolvedItem(ws);
        if (next) targetItemId = next.item.id;
      }

      // If workspace has no items yet, add independent item
      if (!targetItemId || ws.groups.length === 0) {
        ws = addIndependentItem(ws, {
          productRequest: product.title,
          category: product.source || "general",
          displayName: product.title,
        });
        targetItemId = ws.activeItemId;
      }

      const activeOffer = product.selectedOffer || product.offers?.[0] || null;
      if (targetItemId) {
        ws = selectProductForItem(ws, targetItemId, product, activeOffer);
        saveWorkspaceToStorage(ws);
      }

      // Determine parent group type (coordinated setup vs independent)
      const targetGroup = ws.groups.find((g) => g.items.some((i) => i.id === targetItemId));
      const isSetup = targetGroup?.type === "coordinated_setup";

      if (isSetup && targetGroup) {
        // Coordinated setup continuation
        const unresolved = targetGroup.items.find((i) => i.status !== "selected" && i.status !== "skipped");
        if (unresolved) {
          const totalItems = targetGroup.items.length;
          const currentIndex = targetGroup.items.filter((i) => i.status === "selected").length;
          const progressMsg = `Saved ${product.title} to your setup. Next, finding the ${unresolved.displayName || unresolved.productRequest} (${currentIndex + 1} of ${totalItems}).`;

          const assistantMsg = {
            id: `msg_a_progress_${Date.now()}`,
            role: "assistant" as const,
            content: progressMsg,
            createdAt: Date.now(),
          };

          setChatSession((prev) => ({
            ...prev,
            workspace: ws,
            messages: [...prev.messages, assistantMsg],
          }));

          // Trigger search for the next unresolved component
          executeDirectSearch(
            unresolved.searchQuery || unresolved.productRequest,
            unresolved.individualBudget?.amountMinor || targetGroup.budget?.amountMinor || null,
            targetGroup.budget?.currency || currency
          );
        } else {
          // Completed setup
          const summary = calculateWorkspaceBudgetSummary(ws, currency);
          const setupMsg = `All components for your ${targetGroup.title} have been selected! Total: ${formatCurrency(summary.totalSelectedMinor, summary.currency)}. Would you like to add anything else outside this setup?`;

          const assistantMsg = {
            id: `msg_a_complete_${Date.now()}`,
            role: "assistant" as const,
            content: setupMsg,
            suggestedReplies: ["Add another item", "I'm done for now"],
            createdAt: Date.now(),
          };

          setChatSession((prev) => ({
            ...prev,
            workspace: ws,
            messages: [...prev.messages, assistantMsg],
          }));
        }
      } else {
        // Independent item selection (Section 4 & Section 15)
        const naturalFollowUp = `Added ${product.title} to your shopping list. Anything else you'd like to find?`;
        const assistantMsg = {
          id: `msg_a_select_${Date.now()}`,
          role: "assistant" as const,
          content: naturalFollowUp,
          suggestedReplies: ["Add another item", "I'm done for now"],
          createdAt: Date.now(),
        };

        setChatSession((prev) => ({
          ...prev,
          workspace: ws,
          messages: [...prev.messages, assistantMsg],
        }));
      }
    },
    [chatSession.workspace, currency, executeDirectSearch]
  );

  const currentWorkspace = chatSession.workspace || createInitialWorkspace({ currency });
  const workspaceBudgetSummary = calculateWorkspaceBudgetSummary(currentWorkspace, currency);
  const selectedCartCount = currentWorkspace.groups.reduce(
    (acc, g) => acc + g.items.filter((i) => i.status === "selected").length,
    0
  );

  const activeWorkspaceItem = getActiveWorkspaceItem(currentWorkspace);
  const activeItemCandidates = activeWorkspaceItem?.candidates;
  const activeItemComparison = activeWorkspaceItem?.comparison;
  const activeItemEvidence = activeWorkspaceItem?.evidenceFacts;

  // Use active item scoped data when available, otherwise fall back to top-level state
  const displayedProducts = (activeItemCandidates && activeItemCandidates.length > 0)
    ? activeItemCandidates
    : (activeWorkspaceItem ? [] : products);
  const displayedComparison = activeItemComparison ?? comparison;
  const displayedEvidenceFacts = (activeItemEvidence && Object.keys(activeItemEvidence).length > 0)
    ? activeItemEvidence
    : evidenceFacts;
  const displayedHasSearched = hasSearched || displayedProducts.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-transparent text-zinc-900 dark:text-[#E4E4E7]">
      {/* Site Header with Brand Logo, Centered Rounded Navbar, and Cart Button */}
      <SiteHeader
        onResetSession={handleResetSession}
        selectedItemCount={selectedCartCount}
        totalSelectedMinor={workspaceBudgetSummary.totalSelectedMinor}
        currency={currency}
      />

      {/* Main Conversational Shopping Interface & Dedicated Showcasing Section */}
      <main className="flex-1 flex flex-col">
        {/* Dedicated Chatting Section */}
        <section aria-label="Shopping Chat Workspace">
          <ContinuousChatWorkspace
            session={chatSession}
            isLoading={isChatLoading || isSearchingProducts}
            activeStatusText={chatStatusText}
            searchProgress={searchProgress}
            onSendMessage={handleSendChatMessage}
            onExecuteSearch={handleConfirmAndSearch}
            onResetSession={handleResetSession}
            currency={chatSession.currency || currency}
            onCurrencyChange={(c) => {
              setCurrency(c);
              setChatSession((prev) => ({ ...prev, currency: c }));
            }}
            onBudgetChange={(b) => {
              setChatSession((prev) => ({ ...prev, budget: b }));
            }}
            hasProductResults={displayedProducts.length > 0}
            productCount={displayedProducts.length}
            onViewProducts={scrollToShowcase}
          />
        </section>

        {/* Dedicated Product Showcasing Section (Separate section below chat) */}
        {displayedHasSearched && (displayedProducts.length > 0 || isSearchingProducts || searchError) && (
          <LiveProductResults
            query={activeWorkspaceItem?.productRequest || chatSession.originalRequest || "products"}
            budget={minorToMajorUnits(chatSession.budget)}
            currency={chatSession.currency || currency}
            products={displayedProducts}
            comparison={displayedComparison}
            evidenceFacts={displayedEvidenceFacts}
            isSearchingProducts={isSearchingProducts}
            isRankingAi={isRankingAi}
            isRefining={isRefining}
            aiStatus={displayedComparison ? "complete" : isRankingAi ? "partial" : "unavailable"}
            error={searchError}
            onRetry={handleConfirmAndSearch}
            onSearchAgain={handleConfirmAndSearch}
            onConfigureProduct={(p) => setConfiguringProduct(p)}
            onSelectOffer={handleSelectOffer}
            onSelectProduct={handleSelectProduct}
            configuredProductIds={configuredProductIds}
            selectedProductIds={selectedProductIds}
            onRefinePriority={handleRefinePriority}
          />
        )}

        {/* Product Variant Configurator Modal */}
        {configuringProduct && (
          <ProductVariantConfigurator
            product={configuringProduct}
            initialSelections={{
              ...(chatSession.answers["shoe_size"]?.value || chatSession.answers["size"]?.value
                ? { Size: String(chatSession.answers["shoe_size"]?.value || chatSession.answers["size"]?.value) }
                : {}),
              ...(chatSession.answers["color"]?.value && chatSession.answers["color"].value !== "No preference"
                ? { Color: String(chatSession.answers["color"].value) }
                : {}),
              ...(configuredVariants[configuringProduct.sourceProductId || configuringProduct.title]?.selectedOptions || {}),
            }}
            currency={chatSession.currency || currency}
            budgetMinor={chatSession.budget}
            isOpen={Boolean(configuringProduct)}
            onClose={() => setConfiguringProduct(null)}
            onConfirmSelection={handleConfirmVariantSelection}
          />
        )}

        {/* How It Works & Trust Principles */}
        <HowItWorks />
        <TrustSection />
      </main>

      {/* Professional Footer */}
      <SiteFooter />
    </div>
  );
}
