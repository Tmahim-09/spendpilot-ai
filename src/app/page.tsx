"use client";

import React, { useState } from "react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { HeroSection } from "@/components/ai-shopping/HeroSection";
import { LiveProductResults } from "@/components/product-results/LiveProductResults";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { ProductPreview } from "@/components/sections/ProductPreview";
import { SpendingControls } from "@/components/sections/SpendingControls";
import { TrustSection } from "@/components/sections/TrustSection";
import { SiteFooter } from "@/components/layout/SiteFooter";
import type { NormalizedProduct, CurrencyCode, SearchProductsResponsePayload } from "@/types";

export default function Home() {
  const [query, setQuery] = useState<string | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (
    searchQuery: string,
    searchBudget: number | null,
    searchCurrency: CurrencyCode
  ) => {
    setQuery(searchQuery);
    setBudget(searchBudget);
    setCurrency(searchCurrency);
    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    // Smooth-scroll down to results area
    setTimeout(() => {
      const resultsEl = document.getElementById("search-results");
      if (resultsEl) {
        resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);

    try {
      const res = await fetch("/api/products/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: searchQuery,
          budget: searchBudget,
          currency: searchCurrency,
        }),
      });

      const data = (await res.json()) as SearchProductsResponsePayload;

      if (!res.ok || !data.success) {
        setError(data.error || "Unable to search Channel3 products at this time.");
        setProducts([]);
        return;
      }

      setProducts(data.products || []);
      setCached(Boolean(data.cached));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error during product search.";
      setError(msg);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    if (query) {
      handleSearch(query, budget, currency);
    }
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
          isLoading={isLoading}
          initialPrompt={query || ""}
          initialBudget={budget ? String(budget) : ""}
          initialCurrency={currency}
        />

        {/* Live Channel3 Results (displayed when search is in flight or completed) */}
        {hasSearched ? (
          <LiveProductResults
            query={query}
            budget={budget}
            currency={currency}
            products={products}
            isLoading={isLoading}
            error={error}
            onRetry={handleRetry}
            cached={cached}
          />
        ) : null}

        {/* How It Works: 3-step explanation */}
        <HowItWorks />

        {/* Product Preview: Source-backed product demonstration (Initial sample preview) */}
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
