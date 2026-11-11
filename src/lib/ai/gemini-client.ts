import { GoogleGenAI } from "@google/genai";

export class MissingGeminiApiKeyError extends Error {
  constructor() {
    super(
      "GEMINI_API_KEY is not configured on the server. Please configure GEMINI_API_KEY in your environment variables to enable AI shopping intelligence."
    );
    this.name = "MissingGeminiApiKeyError";
  }
}

export class GeminiTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Gemini API request exceeded deadline of ${timeoutMs}ms.`);
    this.name = "GeminiTimeoutError";
  }
}

let cachedClient: GoogleGenAI | null = null;
let lastApiKey: string | null = null;

/**
 * Returns an authenticated GoogleGenAI client instance.
 * Throws MissingGeminiApiKeyError if GEMINI_API_KEY is not defined.
 */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new MissingGeminiApiKeyError();
  }

  if (!cachedClient || lastApiKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    lastApiKey = apiKey;
  }

  return cachedClient;
}

/**
 * Gets the primary configured Gemini model name.
 * Defaults to "gemini-3.8-flash" as configured in environment.
 */
export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite";
}

export interface GenerateWithDeadlineOptions {
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Executes Gemini generation with:
 * 1. Hard request deadline via AbortSignal to cancel in-flight HTTP requests.
 * 2. At most 1 bounded retry for transient 503 spikes only if sufficient time remains.
 * 3. Immediate failure on 429 quota exhaustion (never retried).
 * 4. Automatic fallback to supported flash-lite model if primary model experiences 429 quota exhaustion.
 */
export async function executeGeminiWithDeadline<T>(
  generateFn: (ai: GoogleGenAI, model: string, signal: AbortSignal) => Promise<T>,
  options: GenerateWithDeadlineOptions = {}
): Promise<T> {
  const { timeoutMs = 10000, maxRetries = 1 } = options;
  const startTime = Date.now();
  const ai = getGeminiClient();
  let model = getGeminiModel();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new GeminiTimeoutError(timeoutMs));
  }, timeoutMs);

  let lastError: unknown;

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (controller.signal.aborted) {
        throw new GeminiTimeoutError(timeoutMs);
      }

      try {
        return await generateFn(ai, model, controller.signal);
      } catch (err: unknown) {
        lastError = err;

        // Check if aborted by timeout
        if (controller.signal.aborted) {
          throw new GeminiTimeoutError(timeoutMs);
        }

        const errStr = typeof err === "object" && err ? JSON.stringify(err) : String(err);
        const isQuotaExhausted =
          (err &&
            typeof err === "object" &&
            "status" in err &&
            (err.status === 429 || err.status === "RESOURCE_EXHAUSTED")) ||
          errStr.includes("RESOURCE_EXHAUSTED") ||
          errStr.includes("limit exceeded") ||
          errStr.includes("quota") ||
          errStr.includes("QuotaFailure");

        // If primary model hit quota exhaustion (e.g. Free Tier daily limit)
        // and we haven't tried the fallback yet, switch to gemini-3.5-flash-lite
        if (isQuotaExhausted && model !== "gemini-3.5-flash-lite") {
          const remainingMs = timeoutMs - (Date.now() - startTime);
          if (remainingMs > 3000) {
            model = "gemini-3.5-flash-lite";
            continue;
          }
        }

        // Only retry for transient 503 errors if time allows
        const isTransient503 =
          err &&
          typeof err === "object" &&
          "status" in err &&
          err.status === 503;

        const remainingMs = timeoutMs - (Date.now() - startTime);
        if (attempt < maxRetries && isTransient503 && remainingMs > 3000) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        break;
      }
    }

    throw lastError;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Backward compatible wrapper for legacy calls
 */
export async function generateContentWithRetry<T>(
  generateFn: (ai: GoogleGenAI, model: string) => Promise<T>
): Promise<T> {
  return executeGeminiWithDeadline((ai, model) => generateFn(ai, model), {
    timeoutMs: 10000,
    maxRetries: 1,
  });
}
