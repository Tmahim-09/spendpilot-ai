"use client";

import React, { useState, useRef, useEffect } from "react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { HeroSection } from "@/components/ai-shopping/HeroSection";
import { LiveProductResults } from "@/components/product-results/LiveProductResults";
import { SetupDecompositionReview } from "@/components/setup/SetupDecompositionReview";
import { SetupBundleWorkspace } from "@/components/setup/SetupBundleWorkspace";
import { GuidedConversationWorkspace } from "@/components/guided-shopping/GuidedConversationWorkspace";
import { ProductVariantConfigurator } from "@/components/guided-shopping/ProductVariantConfigurator";
import { HowItWorks } from "@/components/sections/HowItWorks";
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
  ShoppingStage,
  GuidedQuestion,
  StructuredRequirement,
  CollectedAnswer,
  ProductVariantSelection,
  StructuredRequirementSearchFilters,
} from "@/types";
import { Sparkles, Search, Layers, ShieldAlert, RefreshCw } from "lucide-react";

type SetupStage = "idle" | "decomposing" | "review" | "searching" | "comparing" | "workspace";

export default function Home() {
  const [query, setQuery] = useState<string | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [mode, setMode] = useState<ShoppingMode>("single");
  const [pricePreference, setPricePreference] = useState<PricePreference>("near_budget");

  // Guided Shopping Interview State (Phase 4)
  const [shoppingStage, setShoppingStage] = useState<ShoppingStage>("initial_request");
  const [interviewQuestions, setInterviewQuestions] = useState<GuidedQuestion[]>([]);
  const [interviewRequirements, setInterviewRequirements] = useState<StructuredRequirement[]>([]);
  const [collectedAnswers, setCollectedAnswers] = useState<Record<string, CollectedAnswer>>({});
  const [interviewAssistantMessage, setInterviewAssistantMessage] = useState<string>("");
  const [isInterviewLoading, setIsInterviewLoading] = useState(false);
  const [canSearchAfterInterview, setCanSearchAfterInterview] = useState(false);

  // Variant Configuration State
  const [configuringProduct, setConfiguringProduct] = useState<NormalizedProduct | null>(null);
  const [configuredProductIds, setConfiguredProductIds] = useState<Set<string>>(new Set());
  const [configuredVariants, setConfiguredVariants] = useState<Record<string, ProductVariantSelection>>({});

  // Single Product Results State
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

  // Load saved session on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (typeof window !== "undefined") {
          const saved = window.sessionStorage.getItem("spendpilot_guided_shopping_session");
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.query) setQuery(parsed.query);
            if (parsed.budget) setBudget(parsed.budget);
            if (parsed.currency) setCurrency(parsed.currency);
            if (parsed.mode) setMode(parsed.mode);
            if (parsed.collectedAnswers) setCollectedAnswers(parsed.collectedAnswers);
            if (parsed.interviewQuestions) setInterviewQuestions(parsed.interviewQuestions);
            if (parsed.interviewRequirements) setInterviewRequirements(parsed.interviewRequirements);
            if (Array.isArray(parsed.configuredProductIds)) {
              setConfiguredProductIds(new Set(parsed.configuredProductIds));
            }
          }
        }
      } catch {
        // Ignore session storage errors
      }
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const scrollToInterview = () => {
    setTimeout(() => {
      const el = document.getElementById("guided-interview");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 60);
  };

  const scrollToResults = () => {
    setTimeout(() => {
      const resultsEl = document.getElementById("search-results") || document.getElementById("setup-workspace");
      if (resultsEl) {
        resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 60);
  };

  /**
   * Initial submission handler from prompt composer.
   * Starts the Guided Shopping interview to collect and confirm missing requirements.
   */
  const handleSearch = async (
    searchQuery: string,
    searchBudget: number | null,
    searchCurrency: CurrencyCode,
    searchMode: ShoppingMode = "single",
    searchPricePreference: PricePreference = "near_budget"
  ) => {
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
    setHasSearched(false);
    setProducts([]);
    setComparison(null);
    setSetupStage("idle");

    // Step 1: Lightweight Zero-LLM Intent Gate
    const intentGate = evaluateShoppingIntentGate(searchQuery);
    if (!intentGate.isShopping) {
      setPlayfulNotice({
        message:
          intentGate.playfulResponse ||
          "I calculate budgets, not punchlines. Tell me what you're looking to buy!",
        suggestedProducts: intentGate.suggestedProducts || [],
      });
      setShoppingStage("initial_request");
      setInterviewQuestions([]);
      scrollToResults();
      return;
    }

    setPlayfulNotice(null);

    // Step 2: Trigger Guided Shopping Interview
    setShoppingStage("understanding_request");
    setIsInterviewLoading(true);

    try {
      const interviewRes = await fetch("/api/shopping/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestText: searchQuery,
          mode: searchMode,
          budget: searchBudget,
          currency: searchCurrency,
          answers: {},
        }),
      });

      const interviewData = await interviewRes.json();
      if (!interviewRes.ok || !interviewData.success) {
        throw new Error(interviewData.error || "Unable to start guided shopping interview.");
      }

      setInterviewQuestions(interviewData.questions || []);
      setInterviewRequirements(interviewData.requirements || []);
      setInterviewAssistantMessage(interviewData.message || "");
      setCanSearchAfterInterview(Boolean(interviewData.canSearch));
      setCollectedAnswers({});

      // Set stage: If questions exist and canSearch is false, go to needs_clarification
      if (interviewData.questions && interviewData.questions.length > 0 && !interviewData.canSearch) {
        setShoppingStage("needs_clarification");
        scrollToInterview();
      } else {
        setShoppingStage("requirements_review");
        scrollToInterview();
      }
    } catch {
      // Fallback: If interview fails, proceed directly to search
      setShoppingStage("ready_to_search");
      executeDirectSearch(searchQuery, searchBudget, searchCurrency, searchMode, searchPricePreference);
    } finally {
      setIsInterviewLoading(false);
    }
  };

  /**
   * Handles user answering a question chip/selector in the guided conversation
   */
  const handleAnswerQuestion = async (
    questionId: string,
    attribute: string,
    value: string,
    displayValue: string,
    isAiSelected = false
  ) => {
    const updatedAnswers = {
      ...collectedAnswers,
      [questionId]: {
        questionId,
        attribute,
        value,
        displayValue,
        isAiSelected,
        answeredAt: Date.now(),
      },
    };
    setCollectedAnswers(updatedAnswers);
    setIsInterviewLoading(true);

    try {
      const res = await fetch("/api/shopping/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestText: query || "",
          mode,
          budget,
          currency,
          answers: updatedAnswers,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setInterviewQuestions(data.questions || []);
        setInterviewRequirements(data.requirements || []);
        setInterviewAssistantMessage(data.message || "");
        setCanSearchAfterInterview(Boolean(data.canSearch));

        if (data.canSearch) {
          setShoppingStage("requirements_review");
        }
      }
    } catch {
      // Keep existing state
    } finally {
      setIsInterviewLoading(false);
    }
  };

  /**
   * Handles skipping an optional preference question
   */
  const handleSkipQuestion = async (questionId: string, attribute: string) => {
    const updatedAnswers = {
      ...collectedAnswers,
      [questionId]: {
        questionId,
        attribute,
        value: "Skipped",
        displayValue: "No preference",
        isSkipped: true,
        answeredAt: Date.now(),
      },
    };
    setCollectedAnswers(updatedAnswers);
    setIsInterviewLoading(true);

    try {
      const res = await fetch("/api/shopping/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestText: query || "",
          mode,
          budget,
          currency,
          answers: updatedAnswers,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setInterviewQuestions(data.questions || []);
        setInterviewRequirements(data.requirements || []);
        setInterviewAssistantMessage(data.message || "");
        setCanSearchAfterInterview(Boolean(data.canSearch));

        if (data.canSearch) {
          setShoppingStage("requirements_review");
        }
      }
    } catch {
      // Keep existing state
    } finally {
      setIsInterviewLoading(false);
    }
  };

  /**
   * Handles editing a previously answered attribute
   */
  const handleEditAnswer = async (questionId: string) => {
    const updated = { ...collectedAnswers };
    delete updated[questionId];
    setCollectedAnswers(updated);
    setHasSearched(false);
    setProducts([]);
    setComparison(null);
    setIsInterviewLoading(true);

    try {
      const res = await fetch("/api/shopping/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestText: query || "",
          mode,
          budget,
          currency,
          answers: updated,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setInterviewQuestions(data.questions || []);
        setInterviewRequirements(data.requirements || []);
        setInterviewAssistantMessage(data.message || "");
        setCanSearchAfterInterview(Boolean(data.canSearch));
        setShoppingStage(data.canSearch ? "requirements_review" : "needs_clarification");
      }
    } catch {
      // Keep state
    } finally {
      setIsInterviewLoading(false);
    }
  };

  /**
   * Executes the actual product discovery (Channel3 + Gemini comparison)
   * with the confirmed requirements and filters.
   */
  const executeDirectSearch = async (
    searchQuery: string,
    searchBudget: number | null,
    searchCurrency: CurrencyCode,
    searchMode: ShoppingMode = "single",
    searchPricePreference: PricePreference = "near_budget",
    searchFilters?: StructuredRequirementSearchFilters
  ) => {
    const currentId = ++activeSearchId.current;
    setShoppingStage("searching_products");

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
          categorySlug: searchFilters?.categorySlug,
          attributes: searchFilters?.attributes,
          gender: searchFilters?.gender,
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
          setAiStatus("complete");
        } else {
          setAiStatus("unavailable");
          setAiMessage(recData.aiMessage || "Catalog view available.");
        }
      } catch {
        if (currentId !== activeSearchId.current) return;
        setAiStatus("unavailable");
        setAiMessage("Product catalog retrieved successfully. AI comparison temporarily delayed.");
      } finally {
        if (currentId === activeSearchId.current) {
          setIsRankingAi(false);
        }
      }
    } catch (err: unknown) {
      if (currentId !== activeSearchId.current) return;
      setError(err instanceof Error ? err.message : "Network error while searching Channel3.");
      setProducts([]);
      setIsSearchingProducts(false);
      setIsRankingAi(false);
    }
  };

  /**
   * Action when user confirms the reviewed shopping specifications
   */
  const handleConfirmAndSearch = () => {
    const filters = interviewRequirements[0]?.searchFilters;
    executeDirectSearch(query!, budget, currency, mode, pricePreference, filters);
  };

  /**
   * Action when user chooses to browse without answering interview questions
   */
  const handleBrowseWithoutDetails = () => {
    executeDirectSearch(query!, budget, currency, mode, pricePreference, undefined);
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

    try {
      const planToSave = {
        timestamp: new Date().toISOString(),
        productId: selection.productId,
        title: selection.title,
        priceMinor: selection.confirmedPriceMinor,
        retailerUrl: selection.confirmedRetailerUrl,
        selectedOptions: selection.selectedOptions,
      };
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("spendpilot_configured_item", JSON.stringify(planToSave));
      }
    } catch {
      // Ignore
    }

    setConfiguringProduct(null);
  };

  // Multi-Product Setup Handlers
  const handleConfirmSetup = async (
    confirmedItems: SetupRequirementItem[],
    totalBudget: number
  ) => {
    const currentId = ++activeSearchId.current;
    setSetupRequirements(confirmedItems);
    setSetupStage("searching");
    scrollToResults();

    try {
      const searchRes = await fetch("/api/setup/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: confirmedItems,
          currency,
          totalBudget,
        }),
      });

      const searchData = (await searchRes.json()) as SetupSearchResponsePayload;
      if (currentId !== activeSearchId.current) return;

      if (!searchRes.ok || !searchData.success || !searchData.categories) {
        setSetupError(searchData.error || "Failed to search product candidates for categories.");
        setSetupStage("review");
        return;
      }

      setSetupCategories(searchData.categories);
      setSetupStage("comparing");

      const compareRes = await fetch("/api/setup/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setupQuery: query,
          totalBudget,
          currency,
          categories: searchData.categories,
          requirements: confirmedItems,
        }),
      });

      const compareData = (await compareRes.json()) as SetupCompareResponsePayload;
      if (currentId !== activeSearchId.current) return;

      if (!compareRes.ok || !compareData.success || !compareData.bundle) {
        setSetupError(compareData.error || "Failed to generate recommended setup bundle.");
        setSetupStage("review");
        return;
      }

      setSetupComparisons(compareData.comparisons || []);
      setSetupBundle(compareData.bundle);

      const initialSelected: Record<string, string> = {};
      compareData.bundle.items.forEach((item) => {
        initialSelected[item.requirementId] = item.selectedProductId;
      });
      setSelectedItemIds(initialSelected);

      setSetupStage("workspace");
    } catch (err: unknown) {
      if (currentId !== activeSearchId.current) return;
      setSetupError(err instanceof Error ? err.message : "Network error during setup search.");
      setSetupStage("review");
    }
  };

  const handleSelectBundleProduct = (requirementId: string, productId: string) => {
    if (!setupBundle || !setupCategories.length) return;
    const updatedSelected = { ...selectedItemIds, [requirementId]: productId };
    setSelectedItemIds(updatedSelected);

    const recomputed = calculateRecommendedBundle({
      totalBudget: setupBundle.totalBudgetMinor / 100,
      currency,
      requirements: setupRequirements,
      categories: setupCategories,
      comparisons: setupComparisons,
      selectedItemIds: updatedSelected,
    });

    setSetupBundle(recomputed);
  };

  const handleExpandRange = () => {
    setIsRangeExpanded(true);
    setEmptyInPreferredRange(false);
    executeDirectSearch(query!, budget, currency, mode, pricePreference, undefined);
  };

  const handleRetry = () => {
    if (query) {
      handleSearch(query, budget, currency, mode, pricePreference);
    }
  };

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
      }
    } catch {
      // Keep existing comparison
    } finally {
      setIsRefining(false);
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

  // Determine whether to display the Guided Shopping Interview workspace
  const isGuidedInterviewActive =
    (shoppingStage === "needs_clarification" || shoppingStage === "requirements_review") &&
    !hasSearched &&
    setupStage === "idle";

  return (
    <div className="flex min-h-screen flex-col bg-[#080808] text-[#D4D4D4]">
      {/* Header with supplied logo asset and navigation */}
      <SiteHeader />

      {/* Main Page Landmark */}
      <main className="flex-1">
        {/* Hero Section: Dual-mode AI prompt composer */}
        <HeroSection
          onSearch={handleSearch}
          isLoading={isSearchingProducts || isInterviewLoading || setupStage === "decomposing" || setupStage === "searching"}
          initialPrompt={query || ""}
          initialBudget={budget ? String(budget) : ""}
          initialCurrency={currency}
          initialMode={mode}
          initialPricePreference={pricePreference}
        />

        {/* ─────────────────────────────────────────────────────────────
            GUIDED SHOPPING INTERVIEW CONVERSATION (PHASE 4)
           ───────────────────────────────────────────────────────────── */}
        {isGuidedInterviewActive && (
          <GuidedConversationWorkspace
            stage={shoppingStage}
            mode={mode}
            query={query || ""}
            budget={budget}
            currency={currency}
            assistantMessage={interviewAssistantMessage}
            questions={interviewQuestions}
            requirements={interviewRequirements}
            answers={collectedAnswers}
            canSearch={canSearchAfterInterview}
            isLoading={isInterviewLoading}
            onAnswerQuestion={handleAnswerQuestion}
            onSkipQuestion={handleSkipQuestion}
            onEditAnswer={handleEditAnswer}
            onConfirmAndSearch={handleConfirmAndSearch}
            onBrowseWithoutDetails={handleBrowseWithoutDetails}
            onResetInterview={() => {
              setCollectedAnswers({});
              setShoppingStage("initial_request");
            }}
          />
        )}

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
                        Analyzing setup requirements...
                      </h2>
                      <p className="text-xs sm:text-sm text-[#888888] max-w-md mx-auto">
                        Breaking down your request &ldquo;{query}&rdquo; into individual components with target budget allocations.
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
                onAdjustRequirements={() => setSetupStage("review")}
                onConfigureProduct={(p) => setConfiguringProduct(p)}
                configuredProductIds={configuredProductIds}
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
            onConfigureProduct={(p) => setConfiguringProduct(p)}
            configuredProductIds={configuredProductIds}
          />
        ) : null}

        {/* Product Variant Configurator Modal */}
        {configuringProduct && (
          <ProductVariantConfigurator
            product={configuringProduct}
            initialSelections={{
              ...(collectedAnswers["q-shoe-size"]?.value
                ? { Size: String(collectedAnswers["q-shoe-size"].value) }
                : {}),
              ...(collectedAnswers["q-color"]?.value && collectedAnswers["q-color"].value !== "No preference"
                ? { Color: String(collectedAnswers["q-color"].value) }
                : {}),
              ...(configuredVariants[configuringProduct.sourceProductId || configuringProduct.title]?.selectedOptions || {}),
            }}
            currency={currency}
            isOpen={Boolean(configuringProduct)}
            onClose={() => setConfiguringProduct(null)}
            onConfirmSelection={handleConfirmVariantSelection}
          />
        )}

        {/* How It Works: 3-step explanation */}
        <HowItWorks />

        {/* Trust & Transparency: Clear disclosures and principles */}
        <TrustSection />
      </main>

      {/* Professional Footer */}
      <SiteFooter />
    </div>
  );
}
