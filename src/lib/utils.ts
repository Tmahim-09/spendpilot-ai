import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatMinorUnits, CURRENCY_SYMBOLS, type SupportedCurrency } from "./money.ts";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type Currency = SupportedCurrency;
export { CURRENCY_SYMBOLS };
export * from "./money.ts";

/**
 * Backwards-compatible formatCurrency: takes integer minor units (cents) and formats to string.
 * Example: 15000 cents -> "$150.00"
 */
export function formatCurrency(centsOrMinor: number, currency: string = "USD"): string {
  return formatMinorUnits(centsOrMinor, currency);
}
