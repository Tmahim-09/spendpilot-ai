"use client";

import React, { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Menu, X, Sun, Moon, ShoppingCart } from "lucide-react";
import { formatMinorUnits, formatCurrencyTotals } from "@/lib/money";
import type { CurrencyCode } from "@/types";

interface SiteHeaderProps {
  onResetSession?: () => void;
  selectedItemCount?: number;
  totalSelectedMinor?: number;
  currency?: CurrencyCode;
  totalsByCurrency?: Partial<Record<CurrencyCode, number>>;
}

function subscribeTheme(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getThemeSnapshot(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return localStorage.getItem("spendpilot-theme") === "light" ? "light" : "dark";
}

function getThemeServerSnapshot(): "dark" | "light" {
  return "dark";
}

export function SiteHeader({
  onResetSession,
  selectedItemCount = 0,
  totalSelectedMinor = 0,
  currency = "USD",
  totalsByCurrency,
}: SiteHeaderProps = {}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeServerSnapshot);
  const router = useRouter();
  const pathname = usePathname();

  const activeCurrencyEntries = totalsByCurrency
    ? Object.entries(totalsByCurrency).filter((e): e is [string, number] => typeof e[1] === "number" && e[1] > 0)
    : [];

  const singleCurrencyFormatted =
    activeCurrencyEntries.length === 1
      ? formatMinorUnits(activeCurrencyEntries[0][1], activeCurrencyEntries[0][0] as CurrencyCode)
      : activeCurrencyEntries.length > 1
      ? null
      : totalSelectedMinor > 0
      ? formatMinorUnits(totalSelectedMinor, currency)
      : null;

  const toggleTheme = () => {
    const current = getThemeSnapshot();
    const next = current === "dark" ? "light" : "dark";
    if (typeof window !== "undefined") {
      localStorage.setItem("spendpilot-theme", next);
      if (next === "dark") {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
        document.documentElement.setAttribute("data-theme", "dark");
        document.documentElement.style.colorScheme = "dark";
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
        document.documentElement.setAttribute("data-theme", "light");
        document.documentElement.style.colorScheme = "light";
      }
      window.dispatchEvent(new Event("storage"));
    }
  };

  const handleNavClick = (id: string) => {
    setMobileMenuOpen(false);
    if (pathname === "/") {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
    router.push(`/#${id}`);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b-0 bg-transparent">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* 1. Brand & Logo (OUTSIDE of the navbar, on the left) */}
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/"
            className="flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00] rounded-xl p-0.5"
            aria-label="SpendPilot AI Home"
          >
            <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-orange-200 dark:border-[#382f45] bg-white dark:bg-[#121015] p-0.5 shadow-sm shadow-[#FF6A00]/20 hover:scale-105 transition-transform">
              <Image
                src="/logo/SpendPilotLOGO.png"
                alt="SpendPilot AI logo"
                width={36}
                height={36}
                className="h-full w-full object-contain"
                priority
              />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-[#F5F5F5]">
                SpendPilot <span className="text-[#FF6A00]">AI</span>
              </span>
            </div>
          </Link>
          <span className="hidden lg:inline-flex items-center rounded-full border border-orange-200 dark:border-[#382f45] bg-[#FFF8F2] dark:bg-[#1a1622] px-2.5 py-0.5 text-xs font-bold text-zinc-700 dark:text-[#C4C2CA]">
            PayPal Hackathon 2026
          </span>
        </div>

        {/* 2. Desktop Navigation: Centered Pill with 3D Buttons for Assistant, How It Works, and Transparency */}
        <nav
          className="hidden md:flex items-center gap-2 p-1.5 rounded-2xl border border-orange-200/80 dark:border-[#FF6A00]/30 bg-white/70 dark:bg-[#120F16]/70 backdrop-blur-md shadow-sm dark:shadow-[0_0_20px_rgba(255,106,0,0.12)] transition-all"
          aria-label="Main Navigation"
        >
          <button
            type="button"
            onClick={() => {
              if (onResetSession) onResetSession();
              handleNavClick("spendpilot-chat-workspace");
            }}
            className="btn-3d-secondary px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wider rounded-xl cursor-pointer"
          >
            Assistant
          </button>
          <button
            type="button"
            onClick={() => handleNavClick("how-it-works")}
            className="btn-3d-secondary px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wider rounded-xl cursor-pointer"
          >
            How it works
          </button>
          <button
            type="button"
            onClick={() => handleNavClick("trust")}
            className="btn-3d-secondary px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wider rounded-xl cursor-pointer"
          >
            Transparency
          </button>
        </nav>

        {/* 3. Actions Area (OUTSIDE of the navbar, on the right: Cart + Theme Switcher) */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Cart Button navigating to /cart */}
          <Link
            href="/cart"
            className="btn-3d-primary relative flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl cursor-pointer"
            aria-label={`Open Cart (${selectedItemCount} items)`}
            title="View selected products and checkout on /cart"
          >
            <div className="relative">
              <ShoppingCart className="h-4 w-4" />
              {selectedItemCount > 0 && (
                <span className="absolute -top-2 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white text-[#FF6A00] dark:bg-[#0c0c0c] dark:text-[#FF8126] border border-[#FF6A00] px-1 text-[9px] font-extrabold shadow-sm">
                  {selectedItemCount}
                </span>
              )}
            </div>
            <span className="font-extrabold">Cart</span>
          </Link>

          {/* Dark / Light Mode Switcher */}
          <button
            type="button"
            onClick={toggleTheme}
            className="btn-3d-secondary flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl cursor-pointer"
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle dark/light mode"
          >
            {theme === "dark" ? (
              <>
                <Sun className="h-4 w-4 text-[#FF8126]" />
                <span className="hidden lg:inline">Light</span>
              </>
            ) : (
              <>
                <Moon className="h-4 w-4 text-[#FF6A00]" />
                <span className="hidden lg:inline">Dark</span>
              </>
            )}
          </button>

          {/* Mobile menu toggle button */}
          <div className="flex md:hidden items-center">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center rounded-xl p-2 text-zinc-600 dark:text-[#A3A3A3] hover:bg-zinc-100 dark:hover:bg-[#171717] hover:text-black dark:hover:text-[#F5F5F5] border border-black/10 dark:border-white/10 focus:outline-none"
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-black/10 dark:border-[#242424] bg-white/95 dark:bg-[#101010]/95 backdrop-blur-xl px-4 pt-2 pb-6 md:hidden animate-fadeIn">
          <div className="flex flex-col space-y-3">
            <button
              type="button"
              onClick={() => {
                if (onResetSession) onResetSession();
                handleNavClick("spendpilot-chat-workspace");
              }}
              className="btn-3d-secondary w-full py-2.5 px-4 text-xs font-extrabold uppercase tracking-wider text-left justify-start rounded-xl cursor-pointer"
            >
              Assistant
            </button>
            <button
              type="button"
              onClick={() => handleNavClick("how-it-works")}
              className="btn-3d-secondary w-full py-2.5 px-4 text-xs font-extrabold uppercase tracking-wider text-left justify-start rounded-xl cursor-pointer"
            >
              How it works
            </button>
            <button
              type="button"
              onClick={() => handleNavClick("trust")}
              className="btn-3d-secondary w-full py-2.5 px-4 text-xs font-extrabold uppercase tracking-wider text-left justify-start rounded-xl cursor-pointer"
            >
              Transparency
            </button>

            {/* Mobile Cart Action */}
            <div className="pt-2">
              <Link
                href="/cart"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full btn-3d-primary flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl"
              >
                <ShoppingCart className="h-4 w-4" />
                <span>
                  View Cart {selectedItemCount > 0 ? `(${selectedItemCount} items)` : "(Empty)"}
                </span>
                {singleCurrencyFormatted ? (
                  <span className="font-mono text-xs opacity-90">
                    · {singleCurrencyFormatted}
                  </span>
                ) : activeCurrencyEntries.length > 1 ? (
                  <span className="font-mono text-[11px] opacity-90">
                    · {formatCurrencyTotals(totalsByCurrency!)}
                  </span>
                ) : null}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
