"use client";

import React, { useState, useRef } from "react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { HeroSection } from "@/components/ai-shopping/HeroSection";
import { LiveProductResults } from "@/components/product-results/LiveProductResults";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { ProductPreview } from "@/components/sections/ProductPreview";
import { SpendingControls } from "@/components/sections/SpendingControls";
import { TrustSection } from "@/components/sections/TrustSection";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { evaluateShoppingIntentGate } from "@/lib/validation/intent-gate";
import type {
  NormalizedProduct,
  CurrencyCode,
  SearchProductsResponsePayload,
  ShoppingRecommendResponsePayload,
  AiProcessingStatus,
} from "@/types";

export default function Home() {
  const [query, setQuery] = useState<string | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>("USD");

  // Products and Recommendations State
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [topRecommendations, setTopRecommendations] = useState<NormalizedProduct[]>([]);
  const [otherMatches, setOtherMatches] = useState<NormalizedProduct[]>([]);
  const [comparisonOverview, setComparisonOverview] = useState<string | null>(null);

  // Status & Progress State
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [isRankingAi, setIsRankingAi] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiProcessingStatus>("complete");
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [playfulNotice, setPlayfulNotice] = useState<{
    message: string;
    suggestedProducts: string[];
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Monotonic ID to prevent race conditions from previous late responses
  const activeSearchId = useRef(0);

  const handleSearch = async (
    searchQuery: string,
    searchBudget: number | null,
    searchCurrency: CurrencyCode
  ) => {
    const currentId = ++activeSearchId.current;

    setQuery(searchQuery);
    setBudget(searchBudget);
    setCurrency(searchCurrency);
    setError(null);
    setHasSearched(true);
    setComparisonOverview(null);
    setTopRecommendations([]);
    setOtherMatches([]);

    // Step 1: Lightweight Zero-LLM Intent Gate
    const intentGate = evaluateShoppingIntentGate(searchQuery);
    if (!intentGate.isShopping) {
      // Clearly unrelated prompt! Make ZERO Gemini calls, ZERO Channel3 calls!
      setPlayfulNotice({
        message:
          intentGate.playfulResponse ||
          "I calculate budgets, not punchlines. Tell me what you're looking to buy!",
        suggestedProducts: intentGate.suggestedProducts || [],
      });
      setProducts([]);
      setIsSearchingProducts(false);
      setIsRankingAi(false);

      // Smooth-scroll down to results area
      setTimeout(() => {
        const resultsEl = document.getElementById("search-results");
        if (resultsEl) {
          resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
      return;
    }

    // Clear any previous playful notice
    setPlayfulNotice(null);
    setIsSearchingProducts(true);
    setIsRankingAi(false);

    // Smooth-scroll down to search radar area
    setTimeout(() => {
      const resultsEl = document.getElementById("search-results");
      if (resultsEl) {
        resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);

    try {
      // Step 2: Immediate Channel3 Product Search (No preliminary Gemini blocking!)
      const searchRes = await fetch("/api/products/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          budget: searchBudget,
          currency: searchCurrency,
        }),
      });

      const searchData = (await searchRes.json()) as SearchProductsResponsePayload;

      // Guard against race conditions if user started a newer search
      if (currentId !== activeSearchId.current) return;

      if (!searchRes.ok || !searchData.success) {
        setError(searchData.error || "Unable to search Channel3 products at this time.");
        setProducts([]);
        setIsSearchingProducts(false);
        return;
      }

      // Check if backend intent gate caught an unrelated query
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

      // Step 3: RENDER PRODUCTS IMMEDIATELY! User never waits for AI ranking!
      const retrievedProducts = searchData.products || [];
      setProducts(retrievedProducts);
      setCached(Boolean(searchData.cached));
      setIsSearchingProducts(false);

      // If zero products found, no need to call recommendation engine
      if (retrievedProducts.length === 0) {
        return;
      }

      // Step 4: Asynchronous Gemini Candidate Ranking in Background
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

        // Guard against race condition
        if (currentId !== activeSearchId.current) return;

        if (recRes.ok && recData.success && recData.topRecommendations?.length > 0) {
          // Smoothly update display with AI-ranked recommendations
          setTopRecommendations(recData.topRecommendations);
          setOtherMatches(recData.otherMatches || []);
          setComparisonOverview(recData.comparisonOverview || null);
          setAiStatus(recData.aiStatus || "complete");
        } else {
          // If Gemini was unavailable or timed out, preserve all rendered products
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

  const handleRetry = () => {
    if (query) {
      handleSearch(query, budget, currency);
    }
  };

  const handleSelectPrompt = (suggestedPrompt: string) => {
    handleSearch(suggestedPrompt, budget, currency);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#080808] text-[#D4D4D4]">
      {/* Header with supplied logo asset and navigation */}
      <SiteHeader />

      {/* Main Page Landmark */}
      <main className="flex-1">
        {/* Hero Section: Focal point with AI prompt composer */}
        <HeroSection
          onSearch={handleSearch}
          isLoading={isSearchingProducts}
          initialPrompt={query || ""}
          initialBudget={budget ? String(budget) : ""}
          initialCurrency={currency}
        />

        {/* Live Search & Responsive AI Results */}
        {hasSearched ? (
          <LiveProductResults
            query={query}
            budget={budget}
            currency={currency}
            products={products}
            topRecommendations={topRecommendations}
            otherMatches={otherMatches}
            comparisonOverview={comparisonOverview}
            isSearchingProducts={isSearchingProducts}
            isRankingAi={isRankingAi}
            aiStatus={aiStatus}
            aiMessage={aiMessage}
            playfulNotice={playfulNotice}
            error={error}
            onRetry={handleRetry}
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
