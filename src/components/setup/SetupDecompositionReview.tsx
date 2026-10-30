"use client";

import React, { useState } from "react";
import {
  Layers,
  Trash2,
  Plus,
  AlertCircle,
  Sparkles,
  ArrowRight,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type {
  CurrencyCode,
  SetupDecompositionResult,
  SetupRequirementItem,
} from "@/types";

interface SetupDecompositionReviewProps {
  decomposition: SetupDecompositionResult;
  currency: CurrencyCode;
  onConfirm: (confirmedItems: SetupRequirementItem[], totalBudget: number) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function SetupDecompositionReview({
  decomposition,
  currency,
  onConfirm,
  onCancel,
  isLoading = false,
}: SetupDecompositionReviewProps) {
  const totalBudget = decomposition.totalBudget;
  const [items, setItems] = useState<SetupRequirementItem[]>(decomposition.items);
  const [error, setError] = useState<string | null>(null);

  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";

  // Calculate live totals
  const totalBudgetMinor = Math.round(totalBudget * 100);
  const allocatedTotalMinor = items.reduce(
    (sum, item) => sum + (item.allocatedAmountMinor || Math.round(item.allocatedAmount * 100)),
    0
  );
  const remainingUnallocatedMinor = totalBudgetMinor - allocatedTotalMinor;
  const isOverBudget = remainingUnallocatedMinor < 0;

  const handleUpdateItem = (
    index: number,
    field: keyof SetupRequirementItem,
    value: string | number
  ) => {
    setError(null);
    const updated = [...items];
    const item = { ...updated[index] };

    if (field === "allocatedAmount") {
      const numVal = Math.max(0, Number(value) || 0);
      item.allocatedAmount = numVal;
      item.allocatedAmountMinor = Math.round(numVal * 100);
      item.allocationPercentage = totalBudget > 0 ? Math.round((numVal / totalBudget) * 100) : 0;
    } else if (field === "name") {
      item.name = String(value);
      if (!item.searchQuery || item.searchQuery === item.name) {
        item.searchQuery = String(value);
      }
    } else if (field === "searchQuery") {
      item.searchQuery = String(value);
    }

    updated[index] = item;
    setItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      setError("A multi-product setup must contain at least one item.");
      return;
    }
    setError(null);
    setItems(items.filter((_, i) => i !== index));
  };

  const handleAddItem = () => {
    if (items.length >= 8) {
      setError("Maximum 8 product requirements allowed per setup to control complexity.");
      return;
    }
    setError(null);
    const nextId = `req-${Date.now().toString(36).slice(-4)}`;
    const newItemBudget = Math.max(
      10,
      Math.round(Math.max(0, remainingUnallocatedMinor / 100) * 100) / 100
    );

    const newItem: SetupRequirementItem = {
      id: nextId,
      name: "New Product Requirement",
      searchQuery: "New Product",
      allocationPercentage: totalBudget > 0 ? Math.round((newItemBudget / totalBudget) * 100) : 10,
      allocatedAmount: newItemBudget,
      allocatedAmountMinor: Math.round(newItemBudget * 100),
      requirements: [],
      priority: "medium",
    };
    setItems([...items, newItem]);
  };

  const handleConfirm = () => {
    if (isOverBudget) {
      setError(`Allocated budget exceeds your total ${symbol}${totalBudget} limit. Please adjust item amounts.`);
      return;
    }
    if (items.length === 0) {
      setError("Please add at least one product requirement.");
      return;
    }
    for (const item of items) {
      if (!item.name.trim()) {
        setError("All product requirements must have a name.");
        return;
      }
      if (item.allocatedAmount <= 0) {
        setError(`Please assign a positive budget allocation to "${item.name}".`);
        return;
      }
    }

    onConfirm(items, totalBudget);
  };

  return (
    <div className="w-full max-w-4xl mx-auto my-8 animate-fadeIn">
      <div className="rounded-2xl border border-[#303030] bg-[#101010] p-5 sm:p-7 shadow-2xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#242424]">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#FF6A00]/15 p-2.5 text-[#FF6A00] border border-[#FF6A00]/30">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-[#F5F5F5]">
                  Review Setup Breakdown
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#1e1e1e] border border-[#333] text-[#A3A3A3]">
                  {items.length} / 8 items
                </span>
              </div>
              <p className="text-xs text-[#8E8E8E] mt-0.5">
                AI decomposed your request into individual requirements. Review and adjust allocations before product discovery.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg border border-[#333333] bg-[#171717] text-xs text-[#D4D4D4] hover:bg-[#202020] transition-colors"
            >
              Back to Request
            </button>
          </div>
        </div>

        {/* Total Budget & Live Allocation Meter */}
        <div className="my-5 p-4 rounded-xl border border-[#262626] bg-[#0c0c0c] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs text-[#8E8E8E]">Total Setup Budget</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xl font-extrabold text-[#F5F5F5]">
                {symbol}{totalBudget.toLocaleString()}
              </span>
              <span className="text-xs text-[#737373]">({currency})</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div>
              <span className="text-[#8E8E8E]">Allocated Total:</span>
              <div className={`font-bold tabular-nums text-sm ${isOverBudget ? "text-[#F05B5B]" : "text-[#D4D4D4]"}`}>
                {symbol}{(allocatedTotalMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="hidden sm:block h-8 w-px bg-[#262626]" />

            <div>
              <span className="text-[#8E8E8E]">Remaining Unallocated:</span>
              <div
                className={`font-bold tabular-nums text-sm ${
                  isOverBudget
                    ? "text-[#F05B5B]"
                    : remainingUnallocatedMinor === 0
                    ? "text-[#35C979]"
                    : "text-[#69A8FF]"
                }`}
              >
                {isOverBudget ? "-" : "+"}
                {symbol}{Math.abs(remainingUnallocatedMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* Warning if over budget */}
        {isOverBudget && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#F05B5B]/30 bg-[#F05B5B]/10 p-3 text-xs text-[#F05B5B]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Your allocations exceed your total budget by {symbol}
              {Math.abs(remainingUnallocatedMinor / 100).toFixed(2)}. Please reduce individual allocations.
            </span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#F05B5B]/30 bg-[#F05B5B]/10 p-3 text-xs text-[#F05B5B]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Items Table */}
        <div className="overflow-x-auto rounded-xl border border-[#262626] bg-[#0c0c0c]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#242424] bg-[#141414] text-[#A3A3A3]">
                <th className="py-3 px-3 sm:px-4 font-semibold">Requirement</th>
                <th className="py-3 px-3 sm:px-4 font-semibold hidden md:table-cell">Search Query</th>
                <th className="py-3 px-3 sm:px-4 font-semibold text-right">Allocation</th>
                <th className="py-3 px-2 sm:px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e1e]">
              {items.map((item, index) => (
                <tr key={item.id} className="hover:bg-[#121212] transition-colors">
                  <td className="py-3 px-3 sm:px-4">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => handleUpdateItem(index, "name", e.target.value)}
                      placeholder="e.g. Gaming desktop PC"
                      className="w-full rounded-lg border border-[#2b2b2b] bg-[#161616] px-2.5 py-1.5 text-xs text-[#F5F5F5] focus:border-[#FF6A00] focus:outline-none"
                    />
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[#737373]">
                      <span className="capitalize px-1.5 py-0.2 rounded bg-[#1e1e1e] border border-[#292929]">
                        {item.priority} Priority
                      </span>
                      {item.requirements?.length > 0 && (
                        <span>&bull; {item.requirements.slice(0, 2).join(", ")}</span>
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-3 sm:px-4 hidden md:table-cell">
                    <input
                      type="text"
                      value={item.searchQuery}
                      onChange={(e) => handleUpdateItem(index, "searchQuery", e.target.value)}
                      placeholder="Search query for Channel3"
                      className="w-full rounded-lg border border-[#2b2b2b] bg-[#161616] px-2.5 py-1.5 text-xs text-[#A3A3A3] focus:border-[#FF6A00] focus:outline-none"
                    />
                  </td>

                  <td className="py-3 px-3 sm:px-4 text-right">
                    <div className="inline-flex items-center gap-1 justify-end">
                      <span className="text-[#8E8E8E] font-medium">{symbol}</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.allocatedAmount}
                        onChange={(e) => handleUpdateItem(index, "allocatedAmount", e.target.value)}
                        className="w-24 rounded-lg border border-[#2b2b2b] bg-[#161616] px-2.5 py-1.5 text-right text-xs font-semibold text-[#F5F5F5] focus:border-[#FF6A00] focus:outline-none tabular-nums"
                      />
                    </div>
                    <div className="text-[10px] text-[#737373] mt-0.5 tabular-nums">
                      {item.allocationPercentage}% of budget
                    </div>
                  </td>

                  <td className="py-3 px-2 sm:px-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      title="Remove requirement"
                      aria-label={`Remove ${item.name}`}
                      className="p-1.5 rounded-lg text-[#888888] hover:text-[#F05B5B] hover:bg-[#F05B5B]/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add Requirement Button */}
        {items.length < 8 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#333333] px-3.5 py-2 text-xs text-[#A3A3A3] hover:border-[#FF6A00]/50 hover:text-[#FFFFFF] transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-[#FF6A00]" />
              <span>Add another product requirement</span>
            </button>
          </div>
        )}

        {/* Confirmation Footer */}
        <div className="mt-6 pt-5 border-t border-[#242424] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-[#8E8E8E]">
            <ShieldCheck className="h-4 w-4 text-[#35C979] shrink-0" />
            <span>
              Each item will discover at most 2 authentic product candidates within its allocated budget.
            </span>
          </div>

          <button
            type="button"
            disabled={isLoading || isOverBudget}
            onClick={handleConfirm}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF6A00] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#FF6A00]/25 transition-all hover:bg-[#FF8126] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#FF6A00]"
          >
            {isLoading ? (
              <>
                <RotateCcw className="h-4 w-4 animate-spin" />
                <span>Searching Channel3 for Requirements...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Confirm & Search Setup</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
