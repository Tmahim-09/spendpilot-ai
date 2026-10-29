"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Menu, X, ShieldCheck } from "lucide-react";

export function SiteHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#242424] bg-[#080808]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand & Logo */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00] rounded-md"
            aria-label="SpendPilot AI Home"
          >
            <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-[#303030] bg-[#101010]">
              <Image
                src="/logo/SpendPilotLOGO.jpeg"
                alt="SpendPilot AI logo"
                width={36}
                height={36}
                className="h-full w-full object-cover"
                priority
              />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-semibold tracking-tight text-[#F5F5F5]">
                SpendPilot <span className="text-[#FF6A00]">AI</span>
              </span>
            </div>
          </Link>
          <span className="hidden sm:inline-flex items-center rounded-full border border-[#303030] bg-[#141414] px-2.5 py-0.5 text-xs font-medium text-[#A3A3A3]">
            PayPal Hackathon MVP
          </span>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8" aria-label="Main Navigation">
          <button
            onClick={() => scrollToSection("how-it-works")}
            className="text-sm font-medium text-[#A3A3A3] transition-colors hover:text-[#F5F5F5] focus:outline-none"
          >
            How it works
          </button>
          <button
            onClick={() => scrollToSection("product-preview")}
            className="text-sm font-medium text-[#A3A3A3] transition-colors hover:text-[#F5F5F5] focus:outline-none"
          >
            Product Preview
          </button>
          <button
            onClick={() => scrollToSection("spending-rules")}
            className="text-sm font-medium text-[#A3A3A3] transition-colors hover:text-[#F5F5F5] focus:outline-none"
          >
            Spending Rules
          </button>
          <button
            onClick={() => scrollToSection("trust")}
            className="text-sm font-medium text-[#A3A3A3] transition-colors hover:text-[#F5F5F5] focus:outline-none"
          >
            Transparency
          </button>
        </nav>

        {/* Primary CTA */}
        <div className="hidden sm:flex items-center gap-3">
          <button
            onClick={() => scrollToSection("prompt-composer")}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF6A00] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#FF8126] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080808]"
          >
            <span>Start shopping</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="inline-flex items-center justify-center rounded-md p-2 text-[#A3A3A3] hover:bg-[#171717] hover:text-[#F5F5F5] focus:outline-none"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-[#242424] bg-[#101010] px-4 pt-2 pb-6 md:hidden">
          <div className="flex flex-col space-y-3">
            <div className="py-1">
              <span className="inline-flex items-center gap-1.5 text-xs text-[#A3A3A3]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#35C979]" />
                PayPal AI Hackathon 2026 Prototype
              </span>
            </div>
            <button
              onClick={() => scrollToSection("how-it-works")}
              className="text-left text-base font-medium text-[#D4D4D4] py-2 hover:text-[#FF6A00]"
            >
              How it works
            </button>
            <button
              onClick={() => scrollToSection("product-preview")}
              className="text-left text-base font-medium text-[#D4D4D4] py-2 hover:text-[#FF6A00]"
            >
              Product Preview
            </button>
            <button
              onClick={() => scrollToSection("spending-rules")}
              className="text-left text-base font-medium text-[#D4D4D4] py-2 hover:text-[#FF6A00]"
            >
              Spending Rules
            </button>
            <button
              onClick={() => scrollToSection("trust")}
              className="text-left text-base font-medium text-[#D4D4D4] py-2 hover:text-[#FF6A00]"
            >
              Transparency
            </button>
            <div className="pt-2">
              <button
                onClick={() => scrollToSection("prompt-composer")}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#FF6A00] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#FF8126]"
              >
                <span>Start shopping</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
