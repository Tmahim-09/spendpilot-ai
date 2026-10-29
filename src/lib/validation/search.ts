import type { CurrencyCode } from "@/types";

export const ALLOWED_CURRENCIES: CurrencyCode[] = ["USD", "EUR", "GBP"];

export interface ValidatedSearchParams {
  query: string;
  budget: number | null;
  currency: CurrencyCode;
}

export type ValidationResult =
  | { valid: true; data: ValidatedSearchParams }
  | { valid: false; error: string; status: number };

/**
 * Pure validation logic for product search requests.
 */
export function validateSearchPayload(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return {
      valid: false,
      error: "Invalid request payload. Expected JSON object with a 'query' string.",
      status: 400,
    };
  }

  const payload = body as Record<string, unknown>;

  const rawQuery = payload.query;
  if (typeof rawQuery !== "string") {
    return {
      valid: false,
      error: "The 'query' parameter is required and must be a string.",
      status: 400,
    };
  }

  const query = rawQuery.trim();
  if (query.length < 2) {
    return {
      valid: false,
      error: "Shopping query must be at least 2 characters long.",
      status: 400,
    };
  }

  if (query.length > 200) {
    return {
      valid: false,
      error: "Shopping query cannot exceed 200 characters.",
      status: 400,
    };
  }

  // Validate budget
  let budgetNumber: number | null = null;
  if (payload.budget !== undefined && payload.budget !== null && payload.budget !== "") {
    const parsed = Number(payload.budget);
    if (isNaN(parsed) || parsed <= 0) {
      return {
        valid: false,
        error: "Budget must be a positive number.",
        status: 400,
      };
    }
    if (parsed > 1000000) {
      return {
        valid: false,
        error: "Budget cannot exceed 1,000,000.",
        status: 400,
      };
    }
    budgetNumber = parsed;
  }

  // Validate currency
  const rawCurrency = (typeof payload.currency === "string" ? payload.currency : "USD").toUpperCase();
  if (!ALLOWED_CURRENCIES.includes(rawCurrency as CurrencyCode)) {
    return {
      valid: false,
      error: `Unsupported currency '${rawCurrency}'. Supported currencies: ${ALLOWED_CURRENCIES.join(", ")}`,
      status: 400,
    };
  }

  return {
    valid: true,
    data: {
      query,
      budget: budgetNumber,
      currency: rawCurrency as CurrencyCode,
    },
  };
}
