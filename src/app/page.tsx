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
import { minorToMajorUnits, formatMinorUnits, formatCurrencyTotals } from "@/lib/money";
import {
  createInitialWorkspace,
  selectProductForItem,
  getNextUnresolvedItem,
  addIndependentItem,
  calculateWorkspaceBudgetSummary,
  getActiveWorkspaceItem,
  findItemInWorkspace,
  updateItemSearchResults,
  updateItemComparison,
  selectOfferForItem,
  updateVariantForItem,
  buildItemSearchFingerprint,
  deriveItemCanonicalAttributes,
} from "@/lib/workspace/workspace-manager";
import { resolveRequirementForItem } from "@/lib/workspace/sync-engine";
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
  const [, setSearchProgress] = useState<SearchProgressState | null>(null);
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

  // Variant Configuration State (scoped to owning item)
  const [configuringProductInfo, setConfiguringProductInfo] = useState<{
    product: NormalizedProduct;
    itemId: string;
  } | null>(null);
  const [configuredProductIds, setConfiguredProductIds] = useState<Set<string>>(new Set());
  const [configuredVariants, setConfiguredVariants] = useState<Record<string, ProductVariantSelection>>({});

  // Helper to open/close variant configurator scoped to active item
  const setConfiguringProduct = useCallback(
    (product: NormalizedProduct | null) => {
      if (!product) {
        setConfiguringProductInfo(null);
        return;
      }
      const ws = chatSession.workspace;
      const activeItem = getActiveWorkspaceItem(ws);
      if (activeItem) {
        setConfiguringProductInfo({ product, itemId: activeItem.id });
      }
    },
    [chatSession.workspace]
  );

  // Background AI ranking & refinement progress
  const [, setIsSearchingProducts] = useState(false);
  const [, setIsRankingAi] = useState(false);
  const [isRefining, setIsRefining] = useState(false);

  // Item-scoped search and progress tracking (prevents one item from clearing another's progress)
  const [searchingItemIds, setSearchingItemIds] = useState<Set<string>>(new Set());
  const [rankingItemIds, setRankingItemIds] = useState<Set<string>>(new Set());
  const [itemProgressMap, setItemProgressMap] = useState<Map<string, SearchProgressState>>(new Map());
  const [itemStatusTextMap, setItemStatusTextMap] = useState<Map<string, string>>(new Map());

  // Per-item monotonic search counter to prevent race conditions across items and late responses
  const activeItemSearches = useRef<Map<string, number>>(new Map());

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
    activeItemSearches.current.clear();
    setSearchingItemIds(new Set());
    setRankingItemIds(new Set());
    setItemProgressMap(new Map());
    setItemStatusTextMap(new Map());
    setConfiguringProductInfo(null);
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
    async (candidateProductIds: string[], targetItemId?: string) => {
      const ws = chatSession.workspace;
      const itemId = targetItemId || ws?.activeItemId;
      if (!ws || !itemId) return;
      const itemRecord = findItemInWorkspace(ws, itemId);
      if (!itemRecord || !itemRecord.item.candidates.length) return;

      const item = itemRecord.item;
      const candidateProducts = item.candidates.filter((p) =>
        candidateProductIds.includes(p.sourceProductId || p.title)
      );
      const toCompare = candidateProducts.length >= 2 ? candidateProducts : item.candidates.slice(0, 4);
      const majorBudget = minorToMajorUnits(
        item.individualBudget?.amountMinor ??
        (itemRecord.group.type === "coordinated_setup" ? itemRecord.group.budget?.amountMinor : null) ??
        null
      );
      const searchCurrency =
        item.individualBudget?.currency ??
        (itemRecord.group.type === "coordinated_setup" ? itemRecord.group.budget?.currency : null) ??
        currency;

      setRankingItemIds((prev) => new Set([...prev, itemId]));
      setIsRankingAi(true);
      try {
        const itemCanonicalAttrs = deriveItemCanonicalAttributes(item, itemRecord.group);
        const compRes = await fetch("/api/shopping/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: item.searchQuery || item.productRequest || chatSession.originalRequest,
            budget: majorBudget,
            currency: searchCurrency,
            products: toCompare,
            canonicalAttributes: itemCanonicalAttrs,
          }),
        });

        const compData = (await compRes.json()) as ShoppingRecommendResponsePayload;
        if (compRes.ok && compData.success && compData.comparison) {
          setChatSession((prev) => {
            if (!prev.workspace) return prev;
            const nextWs = updateItemComparison(
              prev.workspace,
              itemId,
              compData.comparison ?? null,
              compData.evidenceFacts || {},
              compData.allProducts && compData.allProducts.length > 0 ? compData.allProducts : undefined,
              item.searchId
            );
            if (nextWs === prev.workspace || nextWs.revision <= prev.workspace.revision) {
              return prev;
            }
            saveWorkspaceToStorage(nextWs);
            return { ...prev, workspace: nextWs };
          });
        }
      } catch {
        // Keep existing comparison
      } finally {
        setRankingItemIds((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
        setIsRankingAi(false);
      }
    },
    [chatSession.workspace, chatSession.originalRequest, currency]
  );

  /**
   * Executes verified Channel3 product discovery and background AI comparison
   * strictly scoped to originating item identity. Requires validated explicit itemId.
   */
  const executeDirectSearch = useCallback(
    async (options: {
      itemId: string;
      searchQuery: string;
      budgetMinor?: number | null;
      currency?: CurrencyCode;
      canonicalAttributes?: Record<string, CanonicalShoppingAttribute>;
      workspaceRevision?: number;
    }) => {
      if (!options || typeof options !== "object" || !options.itemId) {
        console.error("[SpendPilot] executeDirectSearch rejected: explicit itemId is required");
        return;
      }

      const originatingItemId = options.itemId;
      const searchQuery = (options.searchQuery || "").trim();
      if (!searchQuery) {
        console.error("[SpendPilot] executeDirectSearch rejected: searchQuery is required");
        return;
      }

      const curWs = chatSession.workspace;
      if (!curWs) {
        console.error("[SpendPilot] executeDirectSearch rejected: no active workspace");
        return;
      }

      const itemRecord = findItemInWorkspace(curWs, originatingItemId);
      if (!itemRecord) {
        console.error(`[SpendPilot] executeDirectSearch rejected: item ${originatingItemId} not found in workspace`);
        return;
      }

      // Generate unique per-item search sequence and searchId
      const searchSeq = (activeItemSearches.current.get(originatingItemId) || 0) + 1;
      activeItemSearches.current.set(originatingItemId, searchSeq);
      const searchId = `search_${originatingItemId}_${searchSeq}_${Date.now()}`;

      // Resolve item-specific budget and currency (strictly item-scoped or coordinated group budget)
      const effectiveBudgetMinor =
        itemRecord.item.individualBudget?.amountMinor ??
        (itemRecord.group.type === "coordinated_setup" ? itemRecord.group.budget?.amountMinor : null) ??
        options.budgetMinor ??
        null;

      const searchCurrency =
        itemRecord.item.individualBudget?.currency ??
        (itemRecord.group.type === "coordinated_setup" ? itemRecord.group.budget?.currency : null) ??
        options.currency ??
        currency;

      const majorBudget = minorToMajorUnits(effectiveBudgetMinor);

      // Derive item canonical attributes strictly from item's own constraints/preferences or coordinated group requirements
      const itemCanonicalAttrs = deriveItemCanonicalAttributes(
        itemRecord.item,
        itemRecord.group,
        options.canonicalAttributes
      );

      // Build requirement-sensitive search fingerprint
      const searchFingerprint = buildItemSearchFingerprint({
        itemId: originatingItemId,
        searchQuery,
        budgetMinor: effectiveBudgetMinor,
        currency: searchCurrency,
        hardConstraints: itemRecord.item.hardConstraints,
        preferences: itemRecord.item.preferences,
        groupRequirements:
          itemRecord.group.type === "coordinated_setup" ? itemRecord.group.sharedRequirements : undefined,
      });

      const activeReq = resolveRequirementForItem(chatSession.shoppingBrief, itemRecord.item);
      const reqCategory = itemRecord.item.category || activeReq?.category || "";
      const isWinter =
        searchQuery.toLowerCase().includes("winter") ||
        (chatSession.shoppingBrief?.userGoal?.toLowerCase().includes("winter") ?? false);

      // Set item-specific searching progress
      const searchingMsg = getProgressMessage("searching", searchQuery, reqCategory, { isWinter });
      setSearchingItemIds((prev) => new Set([...prev, originatingItemId]));
      setItemProgressMap((prev) => {
        const next = new Map(prev);
        next.set(originatingItemId, { stage: "searching", message: searchingMsg });
        return next;
      });
      setItemStatusTextMap((prev) => {
        const next = new Map(prev);
        next.set(originatingItemId, searchingMsg);
        return next;
      });
      setIsSearchingProducts(true);

      // Mark only originating item as searching in workspace (registers searchId)
      setChatSession((prev) => {
        const currentWs = prev.workspace;
        if (!currentWs) return prev;
        const nextWs = updateItemSearchResults(currentWs, originatingItemId, {
          searchId,
          searchFingerprint,
          searchStatus: "searching",
          searchError: null,
        });
        saveWorkspaceToStorage(nextWs);
        return { ...prev, workspace: nextWs };
      });

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
            canonicalAttributes: itemCanonicalAttrs,
          }),
        });

        const searchData = (await searchRes.json()) as SearchProductsResponsePayload;

        // Verify that this search has not been superseded by a newer search on this same item
        if (activeItemSearches.current.get(originatingItemId) !== searchSeq) return;

        if (!searchRes.ok || !searchData.success) {
          setSearchingItemIds((prev) => {
            const next = new Set(prev);
            next.delete(originatingItemId);
            return next;
          });
          setItemProgressMap((prev) => {
            const next = new Map(prev);
            next.delete(originatingItemId);
            return next;
          });
          setItemStatusTextMap((prev) => {
            const next = new Map(prev);
            next.delete(originatingItemId);
            return next;
          });
          setIsSearchingProducts(false);

          setChatSession((prev) => {
            if (!prev.workspace) return prev;
            const nextWs = updateItemSearchResults(prev.workspace, originatingItemId, {
              searchId,
              searchStatus: "error",
              searchError: searchData.error || "Unable to retrieve products. Please try again.",
            });
            if (nextWs === prev.workspace || nextWs.revision <= prev.workspace.revision) {
              return prev;
            }
            saveWorkspaceToStorage(nextWs);
            return {
              ...prev,
              workspace: nextWs,
              messages: [
                ...prev.messages,
                {
                  id: `msg_err_${Date.now()}`,
                  role: "assistant",
                  content: "I ran into a temporary issue retrieving live products. Your requirements are preserved. Please click below or reply to try again.",
                  createdAt: Date.now(),
                },
              ],
            };
          });
          return;
        }

        const retrievedProducts = searchData.products || [];
        setSearchingItemIds((prev) => {
          const next = new Set(prev);
          next.delete(originatingItemId);
          return next;
        });

        if (retrievedProducts.length === 0) {
          setItemProgressMap((prev) => {
            const next = new Map(prev);
            next.delete(originatingItemId);
            return next;
          });
          setItemStatusTextMap((prev) => {
            const next = new Map(prev);
            next.delete(originatingItemId);
            return next;
          });
          setIsSearchingProducts(false);

          setChatSession((prev) => {
            if (!prev.workspace) return prev;
            const nextWs = updateItemSearchResults(prev.workspace, originatingItemId, {
              searchId,
              searchStatus: "completed",
              candidates: [],
              searchError: null,
            });
            if (nextWs === prev.workspace || nextWs.revision <= prev.workspace.revision) {
              return prev;
            }
            saveWorkspaceToStorage(nextWs);
            return {
              ...prev,
              workspace: nextWs,
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
            };
          });
          return;
        }

        // Stage C: Search completed -> transition to comparing
        const comparingMsg = getProgressMessage("comparing", searchQuery, reqCategory, { isWinter });
        setRankingItemIds((prev) => new Set([...prev, originatingItemId]));
        setItemProgressMap((prev) => {
          const next = new Map(prev);
          next.set(originatingItemId, { stage: "comparing", message: comparingMsg });
          return next;
        });
        setItemStatusTextMap((prev) => {
          const next = new Map(prev);
          next.set(originatingItemId, comparingMsg);
          return next;
        });
        setIsSearchingProducts(false);
        setIsRankingAi(true);

        // Mark item as comparing in workspace
        setChatSession((prev) => {
          if (!prev.workspace) return prev;
          const nextWs = updateItemSearchResults(prev.workspace, originatingItemId, {
            searchId,
            searchStatus: "comparing",
            candidates: retrievedProducts,
          });
          if (nextWs === prev.workspace || nextWs.revision <= prev.workspace.revision) {
            return prev;
          }
          return { ...prev, workspace: nextWs };
        });

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
              canonicalAttributes: itemCanonicalAttrs,
            }),
          });

          const recData = (await recRes.json()) as ShoppingRecommendResponsePayload;
          if (activeItemSearches.current.get(originatingItemId) !== searchSeq) return;

          if (recRes.ok && recData.success && recData.comparison) {
            finalRecComparison = recData.comparison;
            finalRecEvidence = recData.evidenceFacts || {};
            if (recData.allProducts && recData.allProducts.length > 0) {
              finalAllProducts = recData.allProducts;
            }
          }
        } catch {
          // AI comparison failure: product catalog remains visible without pretending comparison succeeded
          finalRecComparison = null;
        } finally {
          setRankingItemIds((prev) => {
            const next = new Set(prev);
            next.delete(originatingItemId);
            return next;
          });
          if (activeItemSearches.current.get(originatingItemId) === searchSeq) {
            setIsRankingAi(false);
          }
        }

        const finalMsg = getProgressMessage("completed", searchQuery, reqCategory, { isWinter });
        let wasAccepted = false;

        setChatSession((prev) => {
          const curWs = prev.workspace;
          if (!curWs) return prev;

          // Verify originating item still exists
          const itemExists = findItemInWorkspace(curWs, originatingItemId);
          if (!itemExists) return prev;

          // Update ONLY the originating item without modifying activeItemId
          const nextWs = updateItemSearchResults(curWs, originatingItemId, {
            searchId,
            searchFingerprint,
            searchStatus: "completed",
            candidates: finalAllProducts,
            comparison: finalRecComparison,
            evidenceFacts: finalRecEvidence,
            searchError: null,
          });

          // Verify that update was actually accepted by workspace manager
          if (nextWs === curWs || nextWs.revision <= curWs.revision) {
            return prev;
          }

          wasAccepted = true;
          saveWorkspaceToStorage(nextWs);

          const hasRecentIntro = prev.messages.slice(-3).some(
            (m) =>
              m.role === "assistant" &&
              (m.content === finalMsg ||
                m.content.includes("compared the available options") ||
                m.content.includes("best matches"))
          );

          return {
            ...prev,
            workspace: nextWs,
            stage: "product_selection",
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

        // Stage E: Completed -> Clear transient progress ONLY when search update was accepted
        if (wasAccepted) {
          setItemProgressMap((prev) => {
            const next = new Map(prev);
            next.delete(originatingItemId);
            return next;
          });
          setItemStatusTextMap((prev) => {
            const next = new Map(prev);
            next.delete(originatingItemId);
            return next;
          });
        }
      } catch {
        if (activeItemSearches.current.get(originatingItemId) !== searchSeq) return;
        setSearchingItemIds((prev) => {
          const next = new Set(prev);
          next.delete(originatingItemId);
          return next;
        });
        setRankingItemIds((prev) => {
          const next = new Set(prev);
          next.delete(originatingItemId);
          return next;
        });
        setItemProgressMap((prev) => {
          const next = new Map(prev);
          next.delete(originatingItemId);
          return next;
        });
        setItemStatusTextMap((prev) => {
          const next = new Map(prev);
          next.delete(originatingItemId);
          return next;
        });
        setIsSearchingProducts(false);
        setIsRankingAi(false);

        setChatSession((prev) => {
          if (!prev.workspace) return prev;
          const nextWs = updateItemSearchResults(prev.workspace, originatingItemId, {
            searchId,
            searchStatus: "error",
            searchError: "Failed to connect to product search service. Please try again.",
          });
          saveWorkspaceToStorage(nextWs);
          return { ...prev, workspace: nextWs };
        });
      }
    },
    [chatSession.workspace, chatSession.shoppingBrief, currency]
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
          const totalsStr = formatCurrencyTotals(summary.totalsByCurrency);
          const budgetStr =
            summary.remainingMinor != null && summary.budgetCurrency
              ? `\n**Remaining Budget (${summary.budgetCurrency}):** ${formatMinorUnits(summary.remainingMinor, summary.budgetCurrency)}`
              : "";
          const comparabilityStr =
            summary.status === "partially_comparable" && summary.budgetCurrency
              ? `\n*(Note: Selections in foreign currencies are excluded from the ${summary.budgetCurrency} target budget comparison.)*`
              : "";

          summaryText =
            `Here is your final shopping summary:\n\n` +
            selectedItems
              .map((item, idx) => {
                const p = item.selectedProduct;
                const o = item.selectedOffer || p?.selectedOffer || p?.offers?.[0];
                const itemCurr = (o?.currency || p?.currency || currency) as CurrencyCode;
                const priceStr =
                  o?.priceMinor != null
                    ? formatMinorUnits(o.priceMinor, itemCurr)
                    : "Price unconfirmed";
                const retailerStr = o?.domain || p?.retailerName || "Retailer";
                return `${idx + 1}. **${p?.title || item.productRequest}** — ${priceStr} (${retailerStr})`;
              })
              .join("\n") +
            `\n\n**Total:** ${totalsStr}` +
            budgetStr +
            comparabilityStr +
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
      const relevantCandidates = activeItem?.candidates ?? [];

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
                    setConfiguredProductIds(new Set());
                    setConfiguredVariants({});
                    setConfiguringProductInfo(null);
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
            const ws = finalSession.workspace;
            let activeItem = getActiveWorkspaceItem(ws);
            if (!activeItem && ws && ws.groups.length > 0) {
              const next = getNextUnresolvedItem(ws);
              if (next) activeItem = next.item;
            }
            if (!activeItem) {
              const queryTerm = finalSession.originalRequest || messageText;
              const newWs = addIndependentItem(ws || createInitialWorkspace({ currency }), {
                productRequest: queryTerm,
                category: "general",
                displayName: queryTerm,
              });
              activeItem = getActiveWorkspaceItem(newWs);
              if (activeItem) {
                saveWorkspaceToStorage(newWs);
                setChatSession((prev) => ({ ...prev, workspace: newWs }));
              }
            }

            if (activeItem) {
              const activeReq = resolveRequirementForItem(finalSession.shoppingBrief, activeItem);
              const queryTerm =
                activeReq?.searchQuery ||
                activeReq?.displayName ||
                activeItem.productRequest ||
                finalSession.originalRequest ||
                messageText;
              const itemBudget = activeItem.individualBudget?.amountMinor ?? null;
              const itemCurrency = activeItem.individualBudget?.currency ?? currency;

              await executeDirectSearch({
                itemId: activeItem.id,
                searchQuery: queryTerm,
                budgetMinor: itemBudget,
                currency: itemCurrency,
              });
            }
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
          setConfiguredProductIds(new Set());
          setConfiguredVariants({});
          setConfiguringProductInfo(null);
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
          const ws = data.session?.workspace;
          let activeItem = getActiveWorkspaceItem(ws);
          if (!activeItem && ws && ws.groups.length > 0) {
            const next = getNextUnresolvedItem(ws);
            if (next) activeItem = next.item;
          }
          if (!activeItem) {
            const queryTerm = data.session?.originalRequest || messageText;
            const newWs = addIndependentItem(ws || createInitialWorkspace({ currency }), {
              productRequest: queryTerm,
              category: "general",
              displayName: queryTerm,
            });
            activeItem = getActiveWorkspaceItem(newWs);
            if (activeItem) {
              saveWorkspaceToStorage(newWs);
              setChatSession((prev) => ({ ...prev, workspace: newWs }));
            }
          }

          if (activeItem) {
            const activeReq = resolveRequirementForItem(data.session?.shoppingBrief, activeItem);
            const queryTerm =
              activeReq?.searchQuery ||
              activeReq?.displayName ||
              activeItem.productRequest ||
              data.session?.originalRequest ||
              messageText;
            const itemBudget = activeItem.individualBudget?.amountMinor ?? null;
            const itemCurrency = activeItem.individualBudget?.currency ?? currency;

            await executeDirectSearch({
              itemId: activeItem.id,
              searchQuery: queryTerm,
              budgetMinor: itemBudget,
              currency: itemCurrency,
            });
          }
        } else {
          setSearchProgress(null);
          if (data.shouldExecuteComparison && data.comparisonRequestedProductIds?.length) {
            setChatStatusText("Comparing the best matches...");
            await handleCompareProducts(data.comparisonRequestedProductIds);
          } else if (data.variantConfiguration?.productId) {
            const ws = data.session?.workspace;
            const activeItem = getActiveWorkspaceItem(ws);
            const prodToConfig = activeItem?.candidates?.find(
              (p) => (p.sourceProductId || p.title) === data.variantConfiguration.productId
            );
            if (prodToConfig && activeItem) {
              setConfiguringProductInfo({ product: prodToConfig, itemId: activeItem.id });
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
    [chatSession, currency, executeDirectSearch, handleCompareProducts]
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
    const ws = chatSession.workspace;
    const activeItem = getActiveWorkspaceItem(ws);
    if (!activeItem) return;

    const activeReq = resolveRequirementForItem(chatSession.shoppingBrief, activeItem);
    const queryTerm =
      activeReq?.searchQuery ||
      activeReq?.displayName ||
      activeItem.productRequest ||
      chatSession.originalRequest ||
      "products";
    const itemBudget = activeItem.individualBudget?.amountMinor ?? null;
    const itemCurrency = activeItem.individualBudget?.currency ?? currency;

    executeDirectSearch({
      itemId: activeItem.id,
      searchQuery: queryTerm,
      budgetMinor: itemBudget,
      currency: itemCurrency,
    });
  };

  /**
   * Product Variant Configuration Confirmation (scoped to owning item)
   */
  const handleConfirmVariantSelection = (
    selection: ProductVariantSelection,
    targetItemId?: string
  ) => {
    setConfiguredProductIds((prev) => new Set([...prev, selection.productId]));
    setConfiguredVariants((prev) => ({
      ...prev,
      [selection.productId]: selection,
    }));

    const resolvedItemId =
      targetItemId || configuringProductInfo?.itemId || chatSession.workspace?.activeItemId;

    if (resolvedItemId) {
      setChatSession((prev) => {
        const ws = prev.workspace;
        if (!ws) return prev;
        const nextWs = updateVariantForItem(ws, resolvedItemId, selection);
        saveWorkspaceToStorage(nextWs);
        return {
          ...prev,
          workspace: nextWs,
        };
      });
    }

    setConfiguringProductInfo(null);
  };

  const handleSelectOffer = (
    product: NormalizedProduct,
    offer: ProductOfferItem,
    targetItemId?: string
  ) => {
    const pid = product.sourceProductId || product.title;
    const resolvedItemId = targetItemId || chatSession.workspace?.activeItemId;

    if (resolvedItemId) {
      setChatSession((prev) => {
        const ws = prev.workspace;
        if (!ws) return prev;
        const nextWs = selectOfferForItem(ws, resolvedItemId, pid, offer);
        saveWorkspaceToStorage(nextWs);
        return {
          ...prev,
          workspace: nextWs,
        };
      });
    }
  };

  const handleRefinePriority = async (priorityText: string, targetItemId?: string) => {
    const ws = chatSession.workspace;
    const resolvedItemId = targetItemId || ws?.activeItemId;
    if (!ws || !resolvedItemId) return;

    const itemRecord = findItemInWorkspace(ws, resolvedItemId);
    if (!itemRecord || !itemRecord.item.candidates.length) return;

    setIsRefining(true);

    try {
      const item = itemRecord.item;
      const majorBudget = minorToMajorUnits(
        item.individualBudget?.amountMinor ??
        (itemRecord.group.type === "coordinated_setup" ? itemRecord.group.budget?.amountMinor : null) ??
        null
      );
      const searchCurrency =
        item.individualBudget?.currency ??
        (itemRecord.group.type === "coordinated_setup" ? itemRecord.group.budget?.currency : null) ??
        currency;

      const itemCanonicalAttrs = deriveItemCanonicalAttributes(item, itemRecord.group);

      const recRes = await fetch("/api/shopping/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: item.searchQuery || item.productRequest || chatSession.originalRequest,
          products: item.candidates,
          budget: majorBudget,
          currency: searchCurrency,
          priorityOverride: priorityText,
          canonicalAttributes: itemCanonicalAttrs,
        }),
      });

      const recData = (await recRes.json()) as ShoppingRecommendResponsePayload;
      if (recRes.ok && recData.success && recData.comparison) {
        setChatSession((prev) => {
          const currentWs = prev.workspace;
          if (!currentWs) return prev;
          const nextWs = updateItemComparison(
            currentWs,
            resolvedItemId,
            recData.comparison ?? null,
            recData.evidenceFacts || {},
            item.candidates,
            item.searchId
          );
          if (nextWs === currentWs || nextWs.revision <= currentWs.revision) {
            return prev;
          }
          saveWorkspaceToStorage(nextWs);
          return { ...prev, workspace: nextWs };
        });
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
    (product: NormalizedProduct, targetItemId?: string) => {
      const productId = product.sourceProductId || product.title;
      setSelectedProductIds((prev) => new Set([...prev, productId]));

      setChatSession((prev) => {
        let ws = prev.workspace || createInitialWorkspace({ currency });

        // Determine target item: explicit targetItemId, active item, or unresolved item, or create one
        let resolvedItemId = targetItemId || ws.activeItemId;
        if (!resolvedItemId) {
          const next = getNextUnresolvedItem(ws);
          if (next) resolvedItemId = next.item.id;
        }

        // If workspace has no items yet, add independent item
        if (!resolvedItemId || ws.groups.length === 0) {
          ws = addIndependentItem(ws, {
            productRequest: product.title,
            category: product.source || "general",
            displayName: product.title,
          });
          resolvedItemId = ws.activeItemId;
        }

        const activeOffer = product.selectedOffer || product.offers?.[0] || null;
        if (resolvedItemId) {
          ws = selectProductForItem(ws, resolvedItemId, product, activeOffer);
          saveWorkspaceToStorage(ws);
        }

        // Determine parent group type (coordinated setup vs independent)
        const targetGroup = ws.groups.find((g) => g.items.some((i) => i.id === resolvedItemId));
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

            const nextItemId = unresolved.id;
            const nextQuery = unresolved.searchQuery || unresolved.productRequest;
            const nextBudget = unresolved.individualBudget?.amountMinor || targetGroup.budget?.amountMinor || null;
            const nextCurrency = targetGroup.budget?.currency || currency;

            setTimeout(() => {
              executeDirectSearch({
                itemId: nextItemId,
                searchQuery: nextQuery,
                budgetMinor: nextBudget,
                currency: nextCurrency,
              });
            }, 0);

            return {
              ...prev,
              workspace: ws,
              messages: [...prev.messages, assistantMsg],
            };
          } else {
            // Completed setup
            const summary = calculateWorkspaceBudgetSummary(ws, currency);
            const setupMsg = `All components for your ${targetGroup.title} have been selected! Total: ${formatCurrencyTotals(summary.totalsByCurrency)}. Would you like to add anything else outside this setup?`;

            const assistantMsg = {
              id: `msg_a_complete_${Date.now()}`,
              role: "assistant" as const,
              content: setupMsg,
              suggestedReplies: ["Add another item", "I'm done for now"],
              createdAt: Date.now(),
            };

            return {
              ...prev,
              workspace: ws,
              messages: [...prev.messages, assistantMsg],
            };
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

          return {
            ...prev,
            workspace: ws,
            messages: [...prev.messages, assistantMsg],
          };
        }
      });
    },
    [currency, executeDirectSearch]
  );

  const currentWorkspace = chatSession.workspace || createInitialWorkspace({ currency });
  const workspaceBudgetSummary = calculateWorkspaceBudgetSummary(currentWorkspace, currency);
  const selectedCartCount = currentWorkspace.groups.reduce(
    (acc, g) => acc + g.items.filter((i) => i.status === "selected").length,
    0
  );

  const activeWorkspaceItem = getActiveWorkspaceItem(currentWorkspace);
  const displayedProducts = activeWorkspaceItem?.candidates ?? [];
  const displayedComparison = activeWorkspaceItem?.comparison ?? null;
  const displayedEvidenceFacts = activeWorkspaceItem?.evidenceFacts ?? {};
  const displayedSearchError = activeWorkspaceItem?.searchError ?? null;

  const isItemSearching = activeWorkspaceItem
    ? searchingItemIds.has(activeWorkspaceItem.id) || activeWorkspaceItem.searchStatus === "searching"
    : false;
  const isItemComparing = activeWorkspaceItem
    ? rankingItemIds.has(activeWorkspaceItem.id) || activeWorkspaceItem.searchStatus === "comparing"
    : false;
  const activeItemSearchProgress = activeWorkspaceItem
    ? itemProgressMap.get(activeWorkspaceItem.id) ?? null
    : null;
  const activeItemChatStatusText = activeWorkspaceItem
    ? itemStatusTextMap.get(activeWorkspaceItem.id) ?? null
    : null;

  const displayedHasSearched = Boolean(
    activeWorkspaceItem?.searchFingerprint ||
    activeWorkspaceItem?.candidates?.length ||
    activeWorkspaceItem?.searchStatus === "completed" ||
    activeWorkspaceItem?.searchStatus === "searching" ||
    activeWorkspaceItem?.searchStatus === "comparing" ||
    activeWorkspaceItem?.searchStatus === "error" ||
    activeWorkspaceItem?.searchError
  );

  return (
    <div className="flex min-h-screen flex-col bg-transparent text-zinc-900 dark:text-[#E4E4E7]">
      {/* Site Header with Brand Logo, Centered Rounded Navbar, and Cart Button */}
      <SiteHeader
        onResetSession={handleResetSession}
        selectedItemCount={selectedCartCount}
        totalSelectedMinor={workspaceBudgetSummary.totalSelectedMinor}
        currency={currency}
        totalsByCurrency={workspaceBudgetSummary.totalsByCurrency}
      />

      {/* Main Conversational Shopping Interface & Dedicated Showcasing Section */}
      <main className="flex-1 flex flex-col">
        {/* Dedicated Chatting Section */}
        <section aria-label="Shopping Chat Workspace">
          <ContinuousChatWorkspace
            session={chatSession}
            isLoading={isChatLoading || isItemSearching}
            activeStatusText={isChatLoading ? chatStatusText : activeItemChatStatusText}
            searchProgress={activeItemSearchProgress}
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
        {displayedHasSearched && (displayedProducts.length > 0 || isItemSearching || displayedSearchError) && (
          <LiveProductResults
            query={activeWorkspaceItem?.productRequest || chatSession.originalRequest || "products"}
            budget={minorToMajorUnits(activeWorkspaceItem?.individualBudget?.amountMinor ?? null)}
            budgetMinor={activeWorkspaceItem?.individualBudget?.amountMinor ?? null}
            currency={activeWorkspaceItem?.individualBudget?.currency ?? currency}
            products={displayedProducts}
            comparison={displayedComparison}
            evidenceFacts={displayedEvidenceFacts}
            isSearchingProducts={isItemSearching}
            isRankingAi={isItemComparing}
            isRefining={isRefining}
            aiStatus={displayedComparison ? "complete" : isItemComparing ? "partial" : "unavailable"}
            error={displayedSearchError}
            onRetry={handleConfirmAndSearch}
            onSearchAgain={handleConfirmAndSearch}
            onConfigureProduct={(p) => setConfiguringProduct(p)}
            onSelectOffer={(p, o) => handleSelectOffer(p, o, activeWorkspaceItem?.id)}
            onSelectProduct={(p) => handleSelectProduct(p, activeWorkspaceItem?.id)}
            configuredProductIds={configuredProductIds}
            selectedProductIds={selectedProductIds}
            onRefinePriority={(pr) => handleRefinePriority(pr, activeWorkspaceItem?.id)}
          />
        )}

        {/* Product Variant Configurator Modal */}
        {configuringProductInfo && (
          <ProductVariantConfigurator
            product={configuringProductInfo.product}
            initialSelections={{
              ...(chatSession.answers["shoe_size"]?.value || chatSession.answers["size"]?.value
                ? { Size: String(chatSession.answers["shoe_size"]?.value || chatSession.answers["size"]?.value) }
                : {}),
              ...(chatSession.answers["color"]?.value && chatSession.answers["color"].value !== "No preference"
                ? { Color: String(chatSession.answers["color"].value) }
                : {}),
              ...(configuredVariants[configuringProductInfo.product.sourceProductId || configuringProductInfo.product.title]?.selectedOptions || {}),
            }}
            currency={chatSession.currency || currency}
            budgetMinor={chatSession.budget}
            isOpen={Boolean(configuringProductInfo)}
            onClose={() => setConfiguringProductInfo(null)}
            onConfirmSelection={(sel) => handleConfirmVariantSelection(sel, configuringProductInfo.itemId)}
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
