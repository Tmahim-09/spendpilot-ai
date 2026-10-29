"use client";

import React from "react";
import type { CurrencyCode } from "@/types";
import { CURRENCY_SYMBOLS } from "@/lib/utils";

interface BudgetInputProps {
  value: string;
  onChange: (value: string) => void;
  currency: CurrencyCode;
  onCurrencyChange: (currency: CurrencyCode) => void;
  id?: string;
  className?: string;
}

export function BudgetInput({
  value,
  onChange,
  currency,
  onCurrencyChange,
  id = "budget-amount",
  className = "",
}: BudgetInputProps) {
  const symbol = CURRENCY_SYMBOLS[currency];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    // Allow numbers and decimal points
    if (/^\d*\.?\d{0,2}$/.test(rawVal) || rawVal === "") {
      onChange(rawVal);
    }
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-xs font-medium text-[#A3A3A3] flex items-center justify-between">
        <span>Target Budget</span>
        <span className="text-[11px] text-[#737373]">Optional limit</span>
      </label>
      <div className="relative flex rounded-lg border border-[#303030] bg-[#141414] focus-within:border-[#FF6A00] transition-colors shadow-inner">
        {/* Currency Selector */}
        <div className="relative border-r border-[#262626]">
          <label htmlFor="currency-select" className="sr-only">
            Select Currency
          </label>
          <select
            id="currency-select"
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value as CurrencyCode)}
            className="h-10 appearance-none bg-transparent pl-3 pr-6 text-xs font-semibold text-[#D4D4D4] focus:outline-none cursor-pointer"
          >
            <option value="USD" className="bg-[#171717] text-[#F5F5F5]">
              USD ($)
            </option>
            <option value="EUR" className="bg-[#171717] text-[#F5F5F5]">
              EUR (€)
            </option>
            <option value="GBP" className="bg-[#171717] text-[#F5F5F5]">
              GBP (£)
            </option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[#737373] text-[10px]">
            ▼
          </div>
        </div>

        {/* Currency Symbol Prefix */}
        <div className="pointer-events-none flex items-center pl-3 text-sm font-medium text-[#737373]">
          {symbol}
        </div>

        {/* Amount Input */}
        <input
          type="text"
          id={id}
          name="budget"
          inputMode="decimal"
          value={value}
          onChange={handleInputChange}
          placeholder="e.g. 300"
          className="h-10 w-full bg-transparent px-2 text-sm font-medium text-[#F5F5F5] placeholder-[#525252] focus:outline-none tabular-nums"
          aria-describedby="budget-hint"
        />
      </div>
      <span id="budget-hint" className="sr-only">
        Enter your maximum budget in {currency}
      </span>
    </div>
  );
}
