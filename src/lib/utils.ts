import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type Currency = "USD" | "EUR" | "GBP";

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
};

export function formatCurrency(centsOrMinor: number, currency: Currency = "USD"): string {
  const symbol = CURRENCY_SYMBOLS[currency] || "$";
  const amount = (centsOrMinor / 100).toFixed(2);
  return `${symbol}${amount}`;
}

