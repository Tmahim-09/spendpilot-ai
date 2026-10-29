"use client";

import React, { useState } from "react";
import { ExternalLink, Check, Info, ShieldAlert, Sparkles, Tag } from "lucide-react";
import type { NormalizedProduct } from "@/types";
import { formatCurrency } from "@/lib/utils";

// Explicitly marked sample preview data for Phase 1
const SAMPLE_PREVIEW_PRODUCTS: NormalizedProduct[] = [
  {
    source: "channel3-preview",
    sourceProductId: "sample-p1",
    title: "Ergonomic High-Back Breathable Mesh Chair",
    imageUrl: null,
    priceMinor: 14999, // $149.99
    currency: "USD",
    retailerName: "Sample Office Retailer",
    retailerUrl: "https://example.com/products/mesh-chair",
    availability: "in_stock",
    specifications: {
      "Lumbar Support": "Adjustable dynamic 2D",
      "Armrests": "3D padded height-adjustable",
      "Warranty": "3-year manufacturer warranty",
    },
    sourceFacts: [
      "Retrieved price: $149.99 (below $150 item cap)",
      "Breathable high-density mesh backing",
      "BIFMA-tested 300 lb weight capacity",
    ],
    explanation:
      "Fits the ergonomic study setup priority while remaining precisely under the $150 single-item spending ceiling.",
    fitScore: 94,
  },
  {
    source: "channel3-preview",
    sourceProductId: "sample-p2",
    title: "Compact 75% Mechanical Keyboard (Tactile Quiet)",
    imageUrl: null,
    priceMinor: 6999, // $69.99
    currency: "USD",
    retailerName: "Sample Tech Retailer",
    retailerUrl: "https://example.com/products/keyboard",
    availability: "in_stock",
    specifications: {
      "Switch Type": "Gateron Brown (tactile, low-noise)",
      "Connectivity": "Tri-mode (Bluetooth 5.0, 2.4GHz, USB-C)",
      "Backlight": "Clean white monochrome LED",
    },
    sourceFacts: [
      "Retrieved price: $69.99",
      "Compact 75% footprint saves desk workspace",
      "Multi-device pairing up to 3 devices",
    ],
    explanation:
      "Recommended for long programming sessions. Tactile switches reduce fatigue without excessive click noise for study spaces.",
    fitScore: 91,
  },
  {
    source: "channel3-preview",
    sourceProductId: "sample-p3",
    title: "ScreenBar Monitor Light Bar with Auto-Dimming",
    imageUrl: null,
    priceMinor: 4499, // $44.99
    currency: "USD",
    retailerName: "Sample Workspace Store",
    retailerUrl: "https://example.com/products/light-bar",
    availability: "in_stock",
    specifications: {
      "Power": "USB-powered (5V / 1A)",
      "Color Temp": "2700K - 6500K stepless adjustment",
      "Mounting": "Counterweight clamp (zero desk footprint)",
    },
    sourceFacts: [
      "Retrieved price: $44.99",
      "Asymmetric optical design prevents screen glare",
      "Ambient light sensor with auto-dimming",
    ],
    explanation:
      "Keeps desk surface completely clear while illuminating the workspace, staying within the combined $300 setup limit.",
    fitScore: 88,
  },
];

export function ProductPreview() {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  // Total calculated for the sample basket: $149.99 + $69.99 + $44.99 = $264.97 (within $300 budget)
  const sampleBasketTotalMinor = SAMPLE_PREVIEW_PRODUCTS.reduce(
    (acc, curr) => acc + (curr.priceMinor || 0),
    0
  );

  return (
    <section id="product-preview" className="py-16 md:py-24 border-b border-[#242424] bg-[#080808]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-10 pb-6 border-b border-[#242424] gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#F5B942]/30 bg-[#F5B942]/10 px-3 py-1 text-xs font-semibold text-[#F5B942] mb-3">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Demonstration Data Preview (Phase 1 Sample)</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-[#F5F5F5] sm:text-3xl">
              Source-backed product discovery
            </h2>
            <p className="mt-2 text-sm text-[#A3A3A3] max-w-2xl">
              Preview of how product recommendations look when retrieved from data sources. Notice every specification is source-grounded and accompanied by a transparent fit explanation.
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-3">
            <div className="rounded-xl border border-[#303030] bg-[#101010] px-4 py-2 text-right">
              <span className="block text-[11px] text-[#A3A3A3]">Sample 3-Item Total</span>
              <span className="text-lg font-bold text-[#35C979] tabular-nums">
                {formatCurrency(sampleBasketTotalMinor, "USD")}
              </span>
              <span className="block text-[10px] text-[#737373]">Under $300.00 Target</span>
            </div>
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SAMPLE_PREVIEW_PRODUCTS.map((product) => {
            const isSelected = selectedItem === product.sourceProductId;
            return (
              <div
                key={product.sourceProductId}
                className={`flex flex-col justify-between rounded-xl border bg-[#101010] p-5 transition-all ${
                  isSelected
                    ? "border-[#FF6A00] ring-1 ring-[#FF6A00]"
                    : "border-[#262626] hover:border-[#383838]"
                }`}
              >
                <div>
                  {/* Retailer & Status bar */}
                  <div className="flex items-center justify-between text-xs mb-3 pb-3 border-b border-[#202020]">
                    <span className="font-medium text-[#A3A3A3] flex items-center gap-1.5">
                      <Tag className="h-3 w-3 text-[#FF6A00]" />
                      {product.retailerName}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#35C979] bg-[#35C979]/10 px-2 py-0.5 rounded">
                      <Check className="h-3 w-3" />
                      In stock
                    </span>
                  </div>

                  {/* Title & Price */}
                  <h3 className="text-base font-semibold text-[#F5F5F5] line-clamp-2 leading-snug">
                    {product.title}
                  </h3>

                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-[#F5F5F5] tabular-nums">
                      {formatCurrency(product.priceMinor || 0, product.currency || "USD")}
                    </span>
                    <span className="text-xs text-[#737373]">verified price</span>
                  </div>

                  {/* Grounded AI Explanation */}
                  {product.explanation && (
                    <div className="mt-4 rounded-lg border border-[#262626] bg-[#141414] p-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FF6A00] mb-1">
                        <Sparkles className="h-3 w-3" />
                        <span>Why this fits:</span>
                      </div>
                      <p className="text-xs text-[#D4D4D4] leading-relaxed">
                        {product.explanation}
                      </p>
                    </div>
                  )}

                  {/* Verified Source Facts */}
                  <div className="mt-4 space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-[#737373]">
                      Verified Source Facts:
                    </span>
                    <ul className="space-y-1 text-xs text-[#A3A3A3]">
                      {product.sourceFacts.map((fact, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-[#FF6A00] mt-0.5">&bull;</span>
                          <span>{fact}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Known Specifications */}
                  <div className="mt-4 pt-3 border-t border-[#202020] space-y-1 text-[11px]">
                    {Object.entries(product.specifications).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-[#737373]">
                        <span>{key}:</span>
                        <span className="text-[#D4D4D4] font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card Action & Retailer distinction note */}
                <div className="mt-6 pt-3 border-t border-[#202020]">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedItem(isSelected ? null : (product.sourceProductId || ""))}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        isSelected
                          ? "border-[#FF6A00] bg-[#FF6A00]/10 text-[#FF6A00]"
                          : "border-[#303030] text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#171717]"
                      }`}
                    >
                      {isSelected ? "Selected for plan" : "Select item"}
                    </button>

                    <a
                      href={product.retailerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#69A8FF] hover:underline"
                    >
                      <span>Retailer link</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <span className="block mt-2 text-[10px] text-[#737373]">
                    *External retailer items open retailer website. Demo checkout catalog is separate.
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Phase notice banner */}
        <div className="mt-8 rounded-xl border border-[#262626] bg-[#101010] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#A3A3A3]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[#F5B942] shrink-0" />
            <span>
              <strong>Phase 1 Notice:</strong> These sample cards demonstrate the UI presentation. Live Channel3 API calls with genuine retailer offers will be connected in Phase 2.
            </span>
          </div>
          <span className="shrink-0 text-[11px] text-[#737373]">
            No fabricated reviews &bull; No fake ratings
          </span>
        </div>
      </div>
    </section>
  );
}

