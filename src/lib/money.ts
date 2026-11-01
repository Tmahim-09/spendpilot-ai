import type { CurrencyCode } from "@/types";

export type SupportedCurrency = "USD" | "EUR" | "GBP";

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
};

/**
 * Maximum allowable budget in dollars to prevent overflow / malformed amounts.
 * Ceiling: $1,000,000.00 = 100,000,000 cents.
 */
export const MAX_BUDGET_DOLLARS = 1_000_000;
export const MAX_BUDGET_CENTS = MAX_BUDGET_DOLLARS * 100;

/**
 * Converts a raw user input, parsed number, or string amount into integer minor units (cents).
 *
 * Rules:
 * - If input is a string like "$150", "150", "150.00", it parses the numeric component.
 * - Detects whether a numeric value is already in minor units (e.g. 15000) or major units (150)
 *   when passed from session state, ensuring values are never multiplied by 100 repeatedly.
 * - Enforces positive, finite numbers and upper bounds.
 * - Returns null for empty, invalid, negative, or out-of-range inputs.
 */
export function parseToMinorUnits(
  input: string | number | null | undefined,
  options?: { isAlreadyMinor?: boolean }
): number | null {
  if (input === null || input === undefined) return null;

  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 0) return null;
    if (options?.isAlreadyMinor) {
      const integerCents = Math.round(input);
      return integerCents <= MAX_BUDGET_CENTS ? integerCents : null;
    }
    // If not flagged as already minor, treat as major units (e.g. 150 -> 15000 cents)
    const cents = Math.round(input * 100);
    return cents <= MAX_BUDGET_CENTS ? cents : null;
  }

  const clean = input.trim().replace(/,/g, "");
  if (!clean) return null;

  const match = clean.match(/\$?([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!match) return null;

  const parsed = parseFloat(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  const cents = Math.round(parsed * 100);
  if (cents <= 0 || cents > MAX_BUDGET_CENTS) return null;

  return cents;
}

/**
 * Converts internal minor units (cents) to integer/decimal major currency units (USD dollars)
 * for external services like Channel3 search filters and Gemini prompt contexts.
 *
 * Example: 15000 cents -> 150 USD
 */
export function minorToMajorUnits(minorUnits: number | null | undefined): number | null {
  if (minorUnits === null || minorUnits === undefined) return null;
  if (!Number.isFinite(minorUnits) || minorUnits <= 0) return null;
  return Math.round((minorUnits / 100) * 100) / 100;
}

/**
 * Formats internal integer minor units (cents) into a clean user-facing currency string.
 *
 * Examples:
 * - formatMinorUnits(15000, "USD") -> "$150.00"
 * - formatMinorUnits(15050, "USD") -> "$150.50"
 * - formatMinorUnits(null) -> "No budget limit"
 */
export function formatMinorUnits(
  minorUnits: number | null | undefined,
  currency: CurrencyCode = "USD"
): string {
  if (minorUnits === null || minorUnits === undefined || !Number.isFinite(minorUnits)) {
    return "No budget limit";
  }

  const symbol = CURRENCY_SYMBOLS[currency] || "$";
  const major = minorUnits / 100;
  return `${symbol}${major.toFixed(2)}`;
}

/**
 * Compact formatting for pill badges and summary tags.
 * If whole dollar amount (e.g. $150.00), formats as "$150".
 */
export function formatMinorUnitsCompact(
  minorUnits: number | null | undefined,
  currency: CurrencyCode = "USD"
): string {
  if (minorUnits === null || minorUnits === undefined || !Number.isFinite(minorUnits)) {
    return "Not capped";
  }

  const symbol = CURRENCY_SYMBOLS[currency] || "$";
  const major = minorUnits / 100;
  if (Number.isInteger(major)) {
    return `${symbol}${major}`;
  }
  return `${symbol}${major.toFixed(2)}`;
}

/**
 * Safely formats any budget value whether it is already in minor units (15000)
 * or in major units (150), preventing multiple multiplications by 100.
 */
export function formatSafeBudget(
  amount: number | null | undefined,
  currency: CurrencyCode = "USD"
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount <= 0) {
    return "Not capped";
  }
  const isMinor = amount >= 10000;
  const minor = isMinor ? Math.round(amount) : Math.round(amount * 100);
  return formatMinorUnits(minor, currency);
}

