import React from "react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { HeroSection } from "@/components/ai-shopping/HeroSection";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { ProductPreview } from "@/components/sections/ProductPreview";
import { SpendingControls } from "@/components/sections/SpendingControls";
import { TrustSection } from "@/components/sections/TrustSection";
import { SiteFooter } from "@/components/layout/SiteFooter";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[#080808] text-[#D4D4D4]">
      {/* Header with supplied logo asset and navigation */}
      <SiteHeader />

      {/* Main Page Landmark */}
      <main className="flex-1">
        {/* Hero Section: Focal point with AI prompt composer */}
        <HeroSection />

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
