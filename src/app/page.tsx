"use client";

import React, { useState, useRef } from "react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { HeroSection } from "@/components/ai-shopping/HeroSection";
import { LiveProductResults } from "@/components/product-results/LiveProductResults";
import { SetupDecompositionReview } from "@/components/setup/SetupDecompositionReview";
import { SetupBundleWorkspace } from "@/components/setup/SetupBundleWorkspace";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { ProductPreview } from "@/components/sections/ProductPreview";
import { SpendingControls } from "@/components/sections/SpendingControls";
import { TrustSection } from "@/components/sections/TrustSection";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { evaluateShoppingIntentGate } from "@/lib/validation/intent-gate";
import { calculateRecommendedBundle } from "@/lib/setup/bundle-calculator";
import type {
  NormalizedProduct,
  CurrencyCode,
  ShoppingMode,
  PricePreference,
  SearchProductsResponsePayload,
  ShoppingRecommendResponsePayload,
  AiProcessingStatus,
  AiComparisonResult,
  EvidenceFact,
  SetupDecompositionResult,
  SetupRequirementItem,
  SetupCategorySearchResult,
  SetupComparisonCategoryResult,
  RecommendedBundle,
  SetupDecomposeResponsePayload,
  SetupSearchResponsePayload,
  SetupCompareResponsePayload,
} from "@/types";
import { Sparkles, Search, Layers, ShieldAlert, RefreshCw } from "lucide-react";

type SetupStage = "idle" | "decomposing" | "review" | "searching" | "comparing" | "workspace";

export default function Home() {
  const [query, setQuery] = useState<string | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [mode, setMode] = useState<ShoppingMode>("single");
  const [pricePreference, setPricePreference] = useState<PricePreference>("near_budget");

  // Single Product State
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [comparison, setComparison] = useState<AiComparisonResult | null>(null);
  const [evidenceFacts, setEvidenceFacts] = useState<Record<string, EvidenceFact>>({});
  const [topRecommendations, setTopRecommendations] = useState<NormalizedProduct[]>([]);
  const [otherMatches, setOtherMatches] = useState<NormalizedProduct[]>([]);
  const [emptyInPreferredRange, setEmptyInPreferredRange] = useState(false);
  const [preferredRangeText, setPreferredRangeText] = useState<string | null>(null);
  const [isRangeExpanded, setIsRangeExpanded] = useState(false);

  // Status & Progress State for Single Product
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [isRankingAi, setIsRankingAi] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiProcessingStatus>("complete");
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [playfulNotice, setPlayfulNotice] = useState<{
    message: string;
    suggestedProducts: string[];
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Multi-Product Setup State
  const [setupStage, setSetupStage] = useState<SetupStage>("idle");
  const [setupDecomposition, setSetupDecomposition] = useState<SetupDecompositionResult | null>(null);
  const [setupRequirements, setSetupRequirements] = useState<SetupRequirementItem[]>([]);
  const [setupCategories, setSetupCategories] = useState<SetupCategorySearchResult[]>([]);
  const [setupComparisons, setSetupComparisons] = useState<SetupComparisonCategoryResult[]>([]);
  const [setupBundle, setSetupBundle] = useState<RecommendedBundle | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Record<string, string>>({});
  const [setupError, setSetupError] = useState<string | null>(null);

  // Monotonic ID to prevent race conditions from previous late responses
  const activeSearchId = useRef(0);

  const scrollToResults = () => {
    setTimeout(() => {
      const resultsEl = document.getElementById("search-results") || document.getElementById("setup-workspace");
      if (resultsEl) {
        resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 60);
  };

  const handleSearch = async (
    searchQuery: string,
    searchBudget: number | null,
    searchCurrency: CurrencyCode,
    searchMode: ShoppingMode = "single",
    searchPricePreference: PricePreference = "near_budget"
  ) => {
    const currentId = ++activeSearchId.current;

    setQuery(searchQuery);
    setBudget(searchBudget);
    setCurrency(searchCurrency);
    setMode(searchMode);
    setPricePreference(searchPricePreference);
    setError(null);
    setSetupError(null);
    setEmptyInPreferredRange(false);
    setIsRangeExpanded(false);
    setPreferredRangeText(null);

    // Step 1: Lightweight Zero-LLM Intent Gate
    const intentGate = evaluateShoppingIntentGate(searchQuery);
    if (!intentGate.isShopping) {
      setPlayfulNotice({
        message:
          intentGate.playfulResponse ||
          "I calculate budgets, not punchlines. Tell me what you're looking to buy!",
        suggestedProducts: intentGate.suggestedProducts || [],
      });
      setProducts([]);
      setHasSearched(true);
      setSetupStage("idle");
      setIsSearchingProducts(false);
      setIsRankingAi(false);
      scrollToResults();
      return;
    }

    setPlayfulNotice(null);

    // ─────────────────────────────────────────────────────────────
    // BRANCH A: MULTI-PRODUCT SETUP MODE
    // ─────────────────────────────────────────────────────────────
    if (searchMode === "setup") {
      setHasSearched(false);
      setProducts([]);
      setComparison(null);
      setSetupDecomposition(null);
      setSetupRequirements([]);
      setSetupCategories([]);
      setSetupComparisons([]);
      setSetupBundle(null);
      setSelectedItemIds({});

      if (!searchBudget || searchBudget <= 0) {
        setSetupError("A total budget is required for multi-product setup mode so SpendPilot can allocate categories.");
        setSetupStage("idle");
        scrollToResults();
        return;
      }

      setSetupStage("decomposing");
      scrollToResults();

      try {
        const decompRes = await fetch("/api/setup/decompose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: searchQuery,
            totalBudget: searchBudget,
            currency: searchCurrency,
          }),
        });

        const decompData = (await decompRes.json()) as SetupDecomposeResponsePayload;
        if (currentId !== activeSearchId.current) return;

        if (!decompRes.ok || !decompData.success || !decompData.decomposition) {
          setSetupError(decompData.error || "Unable to decompose setup requirements. Please try again.");
          setSetupStage("idle");
          return;
        }

        setSetupDecomposition(decompData.decomposition);
        setSetupRequirements(decompData.decomposition.items);
        setSetupStage("review");
      } catch (err: unknown) {
        if (currentId !== activeSearchId.current) return;
        setSetupError(err instanceof Error ? err.message : "Network error during setup decomposition.");
        setSetupStage("idle");
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // BRANCH B: SINGLE PRODUCT MODE
    // ─────────────────────────────────────────────────────────────
    setSetupStage("idle");
    setHasSearched(true);
    setComparison(null);
    setEvidenceFacts({});
    setTopRecommendations([]);
    setOtherMatches([]);
    setIsSearchingProducts(true);
    setIsRankingAi(false);
    scrollToResults();

    try {
      const searchRes = await fetch("/api/products/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          budget: searchBudget,
          currency: searchCurrency,
          mode: "single",
          pricePreference: searchPricePreference,
          expandRange: false,
        }),
      });

      const searchData = (await searchRes.json()) as SearchProductsResponsePayload;
      if (currentId !== activeSearchId.current) return;

      if (!searchRes.ok || !searchData.success) {
        setError(searchData.error || "Unable to search Channel3 products at this time.");
        setProducts([]);
        setIsSearchingProducts(false);
        return;
      }

      if (searchData.isUnrelated) {
        setPlayfulNotice({
          message:
            searchData.playfulMessage ||
            "I calculate budgets, not punchlines. Tell me what you're looking to buy!",
          suggestedProducts: searchData.suggestedProducts || [],
        });
        setProducts([]);
        setIsSearchingProducts(false);
        return;
      }

      // Check if near-budget empty range condition occurred
      if (searchData.emptyInPreferredRange) {
        setProducts([]);
        setEmptyInPreferredRange(true);
        setPreferredRangeText(searchData.preferredRangeText || null);
        setIsSearchingProducts(false);
        return;
      }

      const retrievedProducts = searchData.products || [];
      setProducts(retrievedProducts);
      setCached(Boolean(searchData.cached));
      setIsSearchingProducts(false);

      if (retrievedProducts.length === 0) {
        return;
      }

      // Asynchronous Gemini Candidate Comparison in Background
      setIsRankingAi(true);
      setAiStatus("complete");
      setAiMessage(null);

      try {
        const recRes = await fetch("/api/shopping/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: searchQuery,
            products: retrievedProducts,
            budget: searchBudget,
            currency: searchCurrency,
          }),
        });

        const recData = (await recRes.json()) as ShoppingRecommendResponsePayload;
        if (currentId !== activeSearchId.current) return;

        if (recRes.ok && recData.success && recData.comparison) {
          setComparison(recData.comparison);
          setEvidenceFacts(recData.evidenceFacts || {});
          setTopRecommendations(recData.topRecommendations || []);
          setOtherMatches(recData.otherMatches || []);
          setAiStatus(recData.aiStatus || "complete");
        } else {
          setAiStatus("unavailable");
          setAiMessage(
            recData.aiMessage ||
              "AI comparison is temporarily unavailable. Showing verified catalog matches directly."
          );
        }
      } catch {
        if (currentId !== activeSearchId.current) return;
        setAiStatus("unavailable");
        setAiMessage(
          "AI comparison temporarily unavailable. Showing verified catalog matches directly."
        );
      } finally {
        if (currentId === activeSearchId.current) {
          setIsRankingAi(false);
        }
      }
    } catch (err: unknown) {
      if (currentId !== activeSearchId.current) return;
      const msg = err instanceof Error ? err.message : "Network error during product search.";
      setError(msg);
      setProducts([]);
      setIsSearchingProducts(false);
      setIsRankingAi(false);
    }
  };

  // Expand price range action when 0 products were found in preferred 90%-100% range
  const handleExpandRange = async () => {
    if (!query) return;

    setIsSearchingProducts(true);
    setEmptyInPreferredRange(false);
    setError(null);

    try {
      const searchRes = await fetch("/api/products/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          budget,
          currency,
          mode: "single",
          pricePreference,
          expandRange: true,
        }),
      });

      const searchData = (await searchRes.json()) as SearchProductsResponsePayload;
      if (!searchRes.ok || !searchData.success) {
        setError(searchData.error || "Unable to search products with expanded range.");
        setIsSearchingProducts(false);
        return;
      }

      const retrievedProducts = searchData.products || [];
      setProducts(retrievedProducts);
      setIsRangeExpanded(true);
      setIsSearchingProducts(false);

      if (retrievedProducts.length > 0) {
        // Trigger background comparison for expanded matches
        setIsRankingAi(true);
        try {
          const recRes = await fetch("/api/shopping/recommend", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query,
              products: retrievedProducts,
              budget,
              currency,
            }),
          });
          const recData = (await recRes.json()) as ShoppingRecommendResponsePayload;
          if (recRes.ok && recData.success && recData.comparison) {
            setComparison(recData.comparison);
            setEvidenceFacts(recData.evidenceFacts || {});
            setTopRecommendations(recData.topRecommendations || []);
            setOtherMatches(recData.otherMatches || []);
            setAiStatus(recData.aiStatus || "complete");
          }
        } catch {
          setAiStatus("unavailable");
        } finally {
          setIsRankingAi(false);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error expanding search range.");
      setIsSearchingProducts(false);
    }
  };

  // Setup Stage 3 Confirm: Search Channel3 then perform consolidated comparison
  const handleConfirmSetup = async (
    confirmedItems: SetupRequirementItem[],
    totalBudget: number
  ) => {
    setSetupRequirements(confirmedItems);
    setBudget(totalBudget);
    setSetupError(null);
    setSetupStage("searching");
    scrollToResults();

    try {
      // Step 1: Bounded Category Discovery via Channel3
      const searchRes = await fetch("/api/setup/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirements: confirmedItems,
          totalBudget,
          currency,
        }),
      });

      const searchData = (await searchRes.json()) as SetupSearchResponsePayload;
      if (!searchRes.ok || !searchData.success || !searchData.categories) {
        setSetupError(searchData.error || "Failed to search product categories for setup.");
        setSetupStage("review");
        return;
      }

      const categories = searchData.categories;
      setSetupCategories(categories);
      setSetupStage("comparing");

      // Step 2: Consolidated AI Comparison across all categories
      const compareRes = await fetch("/api/setup/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query || "",
          requirements: confirmedItems,
          categories,
          totalBudget,
          currency,
        }),
      });

      const compareData = (await compareRes.json()) as SetupCompareResponsePayload;
      if (compareRes.ok && compareData.success && compareData.bundle) {
        setSetupComparisons(compareData.comparisons || []);
        setSetupBundle(compareData.bundle);
        setSelectedItemIds({});
        setSetupStage("workspace");
      } else {
        // Fallback: build bundle deterministically with server math even if AI comparison failed
        const fallbackBundle = calculateRecommendedBundle({
          totalBudget,
          currency,
          requirements: confirmedItems,
          categories,
          comparisons: [],
        });
        setSetupComparisons([]);
        setSetupBundle(fallbackBundle);
        setSelectedItemIds({});
        setSetupStage("workspace");
      }
    } catch (err: unknown) {
      setSetupError(err instanceof Error ? err.message : "Network error during setup discovery.");
      setSetupStage("review");
    }
  };

  // Interactive Product Switching in Recommended Bundle
  const handleSelectBundleProduct = (requirementId: string, productId: string) => {
    const updated = { ...selectedItemIds, [requirementId]: productId };
    setSelectedItemIds(updated);

    const recalculated = calculateRecommendedBundle({
      totalBudget: budget || setupDecomposition?.totalBudget || 0,
      currency,
      requirements: setupRequirements,
      categories: setupCategories,
      comparisons: setupComparisons,
      selectedItemIds: updated,
    });
    setSetupBundle(recalculated);
  };

  // Single Product Refinement on Stored Candidate Products
  const handleRefinePriority = async (priorityText: string) => {
    if (!query || products.length === 0) return;

    setIsRefining(true);
    try {
      const recRes = await fetch("/api/shopping/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          products,
          budget,
          currency,
          priorityOverride: priorityText,
        }),
      });

      const recData = (await recRes.json()) as ShoppingRecommendResponsePayload;
      if (recRes.ok && recData.success && recData.comparison) {
        setComparison(recData.comparison);
        setEvidenceFacts(recData.evidenceFacts || {});
        setTopRecommendations(recData.topRecommendations || []);
        setOtherMatches(recData.otherMatches || []);
        setAiStatus("complete");
      }
    } catch {
      // Keep existing comparison intact on network glitch
    } finally {
      setIsRefining(false);
    }
  };

  const handleRetry = () => {
    if (query) {
      handleSearch(query, budget, currency, mode, pricePreference);
    }
  };

  const handleRetryComparison = () => {
    if (query && products.length > 0) {
      handleRefinePriority("");
    }
  };

  const handleSelectPrompt = (suggestedPrompt: string) => {
    handleSearch(suggestedPrompt, budget, currency, mode, pricePreference);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#080808] text-[#D4D4D4]">
      {/* Header with supplied logo asset and navigation */}
      <SiteHeader />

      {/* Main Page Landmark */}
      <main className="flex-1">
        {/* Hero Section: Dual-mode AI prompt composer */}
        <HeroSection
          onSearch={handleSearch}
          isLoading={isSearchingProducts || setupStage === "decomposing" || setupStage === "searching"}
          initialPrompt={query || ""}
          initialBudget={budget ? String(budget) : ""}
          initialCurrency={currency}
          initialMode={mode}
          initialPricePreference={pricePreference}
        />

        {/* ─────────────────────────────────────────────────────────────
            MULTI-PRODUCT SETUP WORKFLOW STAGES
           ───────────────────────────────────────────────────────────── */}
        {setupStage !== "idle" && (
          <div id="setup-workspace" className="scroll-mt-6">
            {/* Stage: Decomposing Loading Card */}
            {setupStage === "decomposing" && (
              <section className="py-16 sm:py-20 border-b border-[#242424] bg-[#090909]">
                <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8 text-center">
                  <div className="rounded-2xl border border-[#242424] bg-[#0e0e0e] p-8 sm:p-12 shadow-2xl relative overflow-hidden">
                    <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF6A00]/15 motion-reduce:animate-none" />
                      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[#FF6A00]/40 bg-[#161310] text-[#FF8126] shadow-lg shadow-[#FF6A00]/10">
                        <Layers className="h-7 w-7 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6A00]/30 bg-[#FF6A00]/10 px-3 py-0.5 text-xs font-semibold text-[#FF8126]">
                        <Sparkles className="h-3 w-3" />
                        AI Setup Architect
                      </span>
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F5F5]">
                        Decomposing your setup requirements...
                      </h2>
                      <p className="text-xs sm:text-sm text-[#888888] max-w-md mx-auto">
                        Analyzing your request &ldquo;{query}&rdquo; into individual components with target budget allocations.
                      </p>
                    </div>

                    <div className="mt-8 h-1 w-full overflow-hidden rounded-full bg-[#1c1c1c]">
                      <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-[#FF6A00]/20 via-[#FF6A00] to-[#FF6A00]/20 animate-pulse motion-reduce:animate-none mx-auto" />
                    </div>

                    <div className="mt-4 text-[11px] text-[#737373]">
                      Up to 8 discrete requirements &bull; Server-verified budget constraints
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Stage: Review & Customize Decomposition */}
            {setupStage === "review" && setupDecomposition && (
              <SetupDecompositionReview
                decomposition={setupDecomposition}
                currency={currency}
                onConfirm={handleConfirmSetup}
                onCancel={() => setSetupStage("idle")}
                isLoading={false}
              />
            )}

            {/* Stage: Bounded Channel3 Discovery & Comparison Loading Card */}
            {(setupStage === "searching" || setupStage === "comparing") && (
              <section className="py-16 sm:py-20 border-b border-[#242424] bg-[#090909]">
                <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8 text-center">
                  <div className="rounded-2xl border border-[#242424] bg-[#0e0e0e] p-8 sm:p-12 shadow-2xl relative overflow-hidden">
                    <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF6A00]/15 motion-reduce:animate-none" />
                      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[#FF6A00]/40 bg-[#161310] text-[#FF8126] shadow-lg shadow-[#FF6A00]/10">
                        {setupStage === "searching" ? (
                          <Search className="h-7 w-7 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
                        ) : (
                          <Sparkles className="h-7 w-7 animate-spin text-[#FF6A00] motion-reduce:animate-none" aria-hidden="true" />
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6A00]/30 bg-[#FF6A00]/10 px-3 py-0.5 text-xs font-semibold text-[#FF8126]">
                        {setupStage === "searching" ? "Channel3 Discovery" : "Consolidated AI Comparison"}
                      </span>
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F5F5]">
                        {setupStage === "searching"
                          ? `Searching ${setupRequirements.length} component categories...`
                          : "Evaluating bundle alternatives & hardware compatibility..."}
                      </h2>
                      <p className="text-xs sm:text-sm text-[#888888] max-w-md mx-auto">
                        {setupStage === "searching"
                          ? "Querying up to 2 top product alternatives per category with bounded concurrency."
                          : "Running single consolidated comparison to determine the optimal budget bundle."}
                      </p>
                    </div>

                    <div className="mt-8 h-1 w-full overflow-hidden rounded-full bg-[#1c1c1c]">
                      <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-[#FF6A00]/20 via-[#FF6A00] to-[#FF6A00]/20 animate-pulse motion-reduce:animate-none mx-auto" />
                    </div>

                    <div className="mt-4 text-[11px] text-[#737373]">
                      Deterministic minor-unit math &bull; Direct verified merchant stock
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Stage: Interactive Bundle Workspace */}
            {setupStage === "workspace" && setupBundle && (
              <SetupBundleWorkspace
                bundle={setupBundle}
                requirements={setupRequirements}
                categories={setupCategories}
                comparisons={setupComparisons}
                onSelectProduct={handleSelectBundleProduct}
                currency={currency}
              />
            )}

            {/* Setup Error Display */}
            {setupError && (
              <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
                <div className="rounded-xl border border-[#F05B5B]/30 bg-[#F05B5B]/10 p-5 text-sm flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 text-[#F05B5B] shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <p className="text-sm font-semibold text-[#F5F5F5]">Multi-Product Setup Issue</p>
                    <p className="text-xs text-[#D4D4D4]">{setupError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        if (setupRequirements.length > 0) {
                          handleConfirmSetup(setupRequirements, budget || 0);
                        } else if (query) {
                          handleSearch(query, budget, currency, "setup", pricePreference);
                        }
                      }}
                      className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[#F05B5B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#ff7070] transition-colors"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Retry Setup Step</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            SINGLE PRODUCT MODE LIVE RESULTS
           ───────────────────────────────────────────────────────────── */}
        {hasSearched && mode === "single" ? (
          <LiveProductResults
            query={query}
            budget={budget}
            currency={currency}
            products={products}
            comparison={comparison}
            evidenceFacts={evidenceFacts}
            topRecommendations={topRecommendations}
            otherMatches={otherMatches}
            isSearchingProducts={isSearchingProducts}
            isRankingAi={isRankingAi}
            isRefining={isRefining}
            aiStatus={aiStatus}
            aiMessage={aiMessage}
            playfulNotice={playfulNotice}
            emptyInPreferredRange={emptyInPreferredRange}
            preferredRangeText={preferredRangeText}
            isRangeExpanded={isRangeExpanded}
            onExpandRange={handleExpandRange}
            error={error}
            onRetry={handleRetry}
            onRetryComparison={handleRetryComparison}
            onRefinePriority={handleRefinePriority}
            onSelectPrompt={handleSelectPrompt}
            cached={cached}
          />
        ) : null}

        {/* How It Works: 3-step explanation */}
        <HowItWorks />

        {/* Product Preview: Source-backed product demonstration */}
        <ProductPreview />

        {/* Spending Controls: Purchase Policy Engine explanation & simulator */}
        <SpendingControls />

        {/* Trust & Transparency: Clear disclosures and principles */}
        <TrustSection />
      </main>

      {/* Professional Footer */}
      <SiteFooter />
    </div>
  );
}
