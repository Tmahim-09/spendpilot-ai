import { GoogleGenAI } from "@google/genai";

export class MissingGeminiApiKeyError extends Error {
  constructor() {
    super(
      "GEMINI_API_KEY is not configured on the server. Please add your Gemini API key to .env.local to enable AI shopping intelligence."
    );
    this.name = "MissingGeminiApiKeyError";
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
 * Gets the configured Gemini model name.
 * Defaults to "gemini-3.8-flash" as specified by PRD and environment configuration.
 */
export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
}

/**
 * Helper to execute Gemini generation with bounded retry for transient 503 errors.
 */
export async function generateContentWithRetry<T>(
  generateFn: (ai: GoogleGenAI, model: string) => Promise<T>,
  maxRetries = 2
): Promise<T> {
  const ai = getGeminiClient();
  const model = getGeminiModel();

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await generateFn(ai, model);
    } catch (err: unknown) {
      lastError = err;

      const isTransient =
        err &&
        typeof err === "object" &&
        ("status" in err && (err.status === 503 || err.status === 429 || err.status === 500));

      if (attempt < maxRetries && isTransient) {
        // Exponential backoff: 1s, 2s
        const delayMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      break;
    }
  }

  throw lastError;
}

