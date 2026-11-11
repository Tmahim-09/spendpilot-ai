import type { CurrencyCode } from "@/types";

export type SupportedCurrency = "USD" | "EUR" | "GBP";
export const SUPPORTED_CURRENCIES: readonly SupportedCurrency[] = ["USD", "EUR", "GBP"];

/**
 * Validates whether a currency string is one of the application's supported currencies.
 */
export function isSupportedCurrency(
  currency: string | null | undefined
): currency is SupportedCurrency {
  if (!currency || typeof currency !== "string") return false;
  const upper = currency.trim().toUpperCase();
  return upper === "USD" || upper === "EUR" || upper === "GBP";
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
};

/**
 * Returns symbol for currency, or code if not standard symbol.
 * Unsupported currencies (e.g. "JPY", "CAD") are never labeled with USD/EUR/GBP symbols.
 */
export function getCurrencySymbol(currency: string = "USD"): string {
  const code = (currency || "USD").trim().toUpperCase();
  if (CURRENCY_SYMBOLS[code]) {
    return CURRENCY_SYMBOLS[code];
  }
  return `${code} `;
}

/**
 * Maximum allowable budget in dollars to prevent overflow / malformed amounts.
 * Ceiling: $1,000,000.00 = 100,000,000 cents.
 */
export const MAX_BUDGET_DOLLARS = 1_000_000;
export const MAX_BUDGET_CENTS = MAX_BUDGET_DOLLARS * 100;

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL MONEY ADAPTER FUNCTIONS (PART 4 & PHASE 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts user-entered major dollar amounts (e.g. 1200 or "$1,200.00")
 * strictly into integer minor units (e.g. 120000 cents).
 */
export function parseMajorToMinor(dollars: number | string | null | undefined): number {
  if (dollars === null || dollars === undefined) return 0;
  if (typeof dollars === "number") {
    if (!Number.isFinite(dollars) || dollars <= 0) return 0;
    const cents = Math.round(dollars * 100);
    return cents <= MAX_BUDGET_CENTS ? cents : MAX_BUDGET_CENTS;
  }
  const clean = String(dollars).trim().replace(/,/g, "");
  const match = clean.match(/\$?([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!match) return 0;
  const parsed = parseFloat(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  const cents = Math.round(parsed * 100);
  return cents <= MAX_BUDGET_CENTS ? cents : MAX_BUDGET_CENTS;
}

/**
 * Formats a major-unit amount (e.g. 150 -> "$150.00", 15000 -> "$15,000.00").
 * Preserves correct handling of null, undefined, and zero.
 */
export function formatMajorUnits(
  priceMajor: number | null | undefined,
  currency: string = "USD",
  fallbackText: string = "No budget limit"
): string {
  if (priceMajor === null || priceMajor === undefined || !Number.isFinite(priceMajor)) {
    return fallbackText;
  }
  const symbol = getCurrencySymbol(currency);
  return `${symbol}${priceMajor.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formats internal integer minor units (e.g. 15000 -> "$150.00", 1500000 -> "$15,000.00").
 * Preserves correct handling of null, undefined, and zero.
 */
export function formatMinorUnits(
  priceMinor: number | null | undefined,
  currency: string = "USD",
  fallbackText: string = "No budget limit"
): string {
  if (priceMinor === null || priceMinor === undefined || !Number.isFinite(priceMinor)) {
    return fallbackText;
  }
  const symbol = getCurrencySymbol(currency);
  const major = priceMinor / 100;
  return `${symbol}${major.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formats a budget already stored in minor units.
 * Returns fallbackText (default "No budget limit") if null, undefined, or <= 0.
 * Example: 15000 cents -> "$150.00"
 */
export function formatBudgetMinor(
  budgetMinor: number | null | undefined,
  currency: string = "USD",
  fallbackText: string = "No budget limit"
): string {
  if (budgetMinor === null || budgetMinor === undefined || !Number.isFinite(budgetMinor) || budgetMinor <= 0) {
    return fallbackText;
  }
  return formatMinorUnits(budgetMinor, currency);
}

/**
 * Formats a budget stored in major units.
 * Returns fallbackText (default "No budget limit") if null, undefined, or <= 0.
 * Example: 150 dollars -> "$150.00", 15000 dollars -> "$15,000.00"
 */
export function formatBudgetMajor(
  budgetMajor: number | null | undefined,
  currency: string = "USD",
  fallbackText: string = "No budget limit"
): string {
  if (budgetMajor === null || budgetMajor === undefined || !Number.isFinite(budgetMajor) || budgetMajor <= 0) {
    return fallbackText;
  }
  return formatMajorUnits(budgetMajor, currency);
}

/**
 * Formats internal integer minor units (cents) into user-facing currency string.
 * Example: 120000 -> "$1,200.00"
 */
export function formatMinorMoney(
  cents: number | null | undefined,
  currency: CurrencyCode = "USD"
): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) {
    return "No budget limit";
  }
  return formatMinorUnits(cents, currency);
}

/**
 * Backwards-compatible formatCurrency: takes integer minor units and formats to string.
 */
export function formatCurrency(
  centsOrMinor: number | null | undefined,
  currency: string = "USD"
): string {
  return formatMinorUnits(centsOrMinor, currency);
}

/**
 * Formats currency-grouped totals into human-readable representation.
 * Single currency: "$1,130.00"
 * Multiple currencies: "USD: $950.00 | EUR: €180.00 | GBP: £75.00"
 */
export function formatCurrencyTotals(
  totalsByCurrency: Partial<Record<CurrencyCode, number>>,
  fallbackCurrency: CurrencyCode = "USD"
): string {
  const entries = (Object.keys(totalsByCurrency) as CurrencyCode[])
    .filter((c) => (totalsByCurrency[c] ?? 0) > 0)
    .map((c) => ({
      currency: c,
      amount: totalsByCurrency[c]!,
    }));

  if (entries.length === 0) {
    return formatMinorUnits(0, fallbackCurrency);
  }

  if (entries.length === 1) {
    return formatMinorUnits(entries[0].amount, entries[0].currency);
  }

  return entries
    .map((e) => `${e.currency}: ${formatMinorUnits(e.amount, e.currency)}`)
    .join(" | ");
}

/**
 * Converts internal integer minor units (cents) to external Channel3 price filter (float/int dollars).
 * Example: 120000 cents -> 1200 USD
 */
export function toChannel3Price(cents: number | null | undefined): number {
  if (cents === null || cents === undefined || !Number.isFinite(cents) || cents <= 0) {
    return 0;
  }
  return Math.round((cents / 100) * 100) / 100;
}

/**
 * Converts internal integer minor units (cents) to Gemini prompt money context string.
 * Example: 120000 cents -> "$1,200" or "$1,200.50"
 */
export function toGeminiMoneyContext(
  cents: number | null | undefined,
  currency: CurrencyCode = "USD"
): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents) || cents <= 0) {
    return "No budget limit";
  }
  const symbol = getCurrencySymbol(currency);
  const major = cents / 100;
  const formatted = Number.isInteger(major)
    ? major.toLocaleString("en-US")
    : major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKWARD-COMPATIBLE UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a raw user input, parsed number, or string amount into integer minor units (cents).
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
 * for external services.
 */
export function minorToMajorUnits(minorUnits: number | null | undefined): number | null {
  if (minorUnits === null || minorUnits === undefined) return null;
  if (!Number.isFinite(minorUnits) || minorUnits <= 0) return null;
  return toChannel3Price(minorUnits);
}

/**
 * Compact formatting for pill badges and summary tags.
 */
export function formatMinorUnitsCompact(
  minorUnits: number | null | undefined,
  currency: CurrencyCode = "USD"
): string {
  if (minorUnits === null || minorUnits === undefined || !Number.isFinite(minorUnits)) {
    return "Not capped";
  }

  const symbol = getCurrencySymbol(currency);
  const major = minorUnits / 100;
  if (Number.isInteger(major)) {
    return `${symbol}${major.toLocaleString("en-US")}`;
  }
  return `${symbol}${major.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * @deprecated Use formatBudgetMinor() for internal minor units or formatBudgetMajor() for major units.
 * Heuristic magnitude checking is deprecated and retained strictly for backwards compatibility.
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

// ─────────────────────────────────────────────────────────────────────────────
// NATURAL-LANGUAGE BUDGET & CURRENCY PARSER (SECTION 7)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractedBudgetAndCurrency {
  budgetMinor: number | null;
  currency: CurrencyCode;
  hasExplicitCurrency: boolean;
  minBudgetMinor?: number | null;
}

/**
 * Extracts budget amount and currency from natural language messages.
 * Handles:
 * - "$1000", "under 500 bucks", "around 80 euros", "£200 max", "between 300 and 500 dollars"
 * - Currency detection: EUR (€, euro/euros), GBP (£, pound/pounds), USD ($, dollar/dollars, buck/bucks)
 * - Defaults currency to USD if not specified
 */
export function extractBudgetAndCurrency(
  text: string,
  defaultCurrency: CurrencyCode = "USD"
): ExtractedBudgetAndCurrency {
  const clean = text.replace(/,/g, "");
  let currency: CurrencyCode = defaultCurrency;
  let hasExplicitCurrency = false;

  // 1. Detect explicit currency
  if (/€|\beuros?\b/i.test(clean)) {
    currency = "EUR";
    hasExplicitCurrency = true;
  } else if (/£|\bpounds?\b/i.test(clean)) {
    currency = "GBP";
    hasExplicitCurrency = true;
  } else if (/\$|\bdollars?\b|\bbucks?\b/i.test(clean)) {
    currency = "USD";
    hasExplicitCurrency = true;
  }

  // 2. Detect range: "between 300 and 500 dollars" or "from 300 to 500 euros"
  const rangeMatch = clean.match(
    /\b(?:between|from)\s*[\$€£]?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(?:and|to|-)\s*[\$€£]?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(?:dollars?|bucks?|euros?|pounds?)?\b/i
  );
  if (rangeMatch) {
    const minVal = parseFloat(rangeMatch[1]);
    const maxVal = parseFloat(rangeMatch[2]);
    const minMinor = !isNaN(minVal) && minVal > 0 ? parseToMinorUnits(minVal) : null;
    const maxMinor = !isNaN(maxVal) && maxVal > 0 ? parseToMinorUnits(maxVal) : null;
    return {
      budgetMinor: maxMinor, // Upper bound represents budget ceiling
      minBudgetMinor: minMinor,
      currency,
      hasExplicitCurrency,
    };
  }

  // 3. Detect "under / below / less than / up to / within / around / about 500 bucks"
  const prefixWordMatch = clean.match(
    /\b(?:under|below|less\s+than|within|up\s+to|around|about|approx(?:imately)?|~|for)\s*[\$€£]?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(?:dollars?|bucks?|euros?|pounds?)?\b/i
  );
  if (prefixWordMatch) {
    const val = parseFloat(prefixWordMatch[1]);
    if (!isNaN(val) && val > 0) {
      return {
        budgetMinor: parseToMinorUnits(val),
        currency,
        hasExplicitCurrency,
      };
    }
  }

  // 4. Detect "budget / cap of / is 500"
  const budgetWordMatch = clean.match(
    /\b(?:budget|cap)(?:\s*(?:of|is|to|under|:))?\s*[\$€£]?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(?:dollars?|bucks?|euros?|pounds?)?\b/i
  );
  if (budgetWordMatch) {
    const val = parseFloat(budgetWordMatch[1]);
    if (!isNaN(val) && val > 0) {
      return {
        budgetMinor: parseToMinorUnits(val),
        currency,
        hasExplicitCurrency,
      };
    }
  }

  // 5. Detect "500 max / 200 euros max / £200 max"
  const maxSuffixMatch = clean.match(
    /\b[\$€£]?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(?:dollars?|bucks?|euros?|pounds?)?\s*max\b/i
  );
  if (maxSuffixMatch) {
    const val = parseFloat(maxSuffixMatch[1]);
    if (!isNaN(val) && val > 0) {
      return {
        budgetMinor: parseToMinorUnits(val),
        currency,
        hasExplicitCurrency,
      };
    }
  }

  // 6. Detect prefixed currency symbol "$1000", "€80", "£200"
  const symbolMatch = clean.match(/[\$€£]([0-9]+(?:\.[0-9]{1,2})?)/);
  if (symbolMatch) {
    const val = parseFloat(symbolMatch[1]);
    if (!isNaN(val) && val > 0) {
      return {
        budgetMinor: parseToMinorUnits(val),
        currency,
        hasExplicitCurrency,
      };
    }
  }

  // 7. Detect numeric followed by currency word "500 bucks", "80 euros", "200 pounds", "1200 dollars"
  const wordSuffixMatch = clean.match(
    /\b([0-9]+(?:\.[0-9]{1,2})?)\s*(?:dollars?|bucks?|euros?|pounds?)\b/i
  );
  if (wordSuffixMatch) {
    const val = parseFloat(wordSuffixMatch[1]);
    if (!isNaN(val) && val > 0) {
      return {
        budgetMinor: parseToMinorUnits(val),
        currency,
        hasExplicitCurrency,
      };
    }
  }

  return {
    budgetMinor: null,
    currency,
    hasExplicitCurrency,
  };
}

/**
 * Extracts the currency code (USD, EUR, GBP) mentioned in user text.
 */
export function extractCurrencyFromText(
  text: string,
  defaultCurrency: CurrencyCode = "USD"
): CurrencyCode {
  return extractBudgetAndCurrency(text, defaultCurrency).currency;
}

