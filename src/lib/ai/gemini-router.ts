import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { getGeminiClient, GeminiTimeoutError } from "./gemini-client.ts";
import type { GeminiErrorCategory, ModelAttemptDiagnostic } from "../../types/index.ts";

export const DEFAULT_PRIMARY_MODEL = "gemini-3.1-flash-lite";
export const DEFAULT_FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash-lite",
];

const SAFE_MODEL_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,63}$/;

/**
 * Validates a single model identifier string against safe naming patterns.
 */
export function isValidModelIdentifier(model: string): boolean {
  return typeof model === "string" && SAFE_MODEL_REGEX.test(model.trim());
}

/**
 * Reads and validates the primary configured Gemini model.
 */
export function getPrimaryModel(): string {
  const envModel = process.env.GEMINI_MODEL?.trim();
  if (envModel && isValidModelIdentifier(envModel)) {
    return envModel;
  }
  return DEFAULT_PRIMARY_MODEL;
}

/**
 * Reads and validates the fallback models list from GEMINI_FALLBACK_MODELS.
 */
export function getFallbackModels(): string[] {
  const envFallbacks = process.env.GEMINI_FALLBACK_MODELS?.trim();
  if (!envFallbacks) {
    return [...DEFAULT_FALLBACK_MODELS];
  }

  const parsed = envFallbacks
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0 && isValidModelIdentifier(m));

  return parsed.length > 0 ? parsed : [...DEFAULT_FALLBACK_MODELS];
}

/**
 * Parses, deduplicates, and validates the model chain in strict priority order.
 * Ensures the primary model is first, followed by fallbacks, without duplicates.
 */
export function getConfiguredModelChain(
  primaryOverride?: string,
  fallbackOverride?: string | string[]
): string[] {
  let primary = DEFAULT_PRIMARY_MODEL;
  if (primaryOverride && typeof primaryOverride === "string" && primaryOverride.trim().length > 0) {
    if (isValidModelIdentifier(primaryOverride.trim())) {
      primary = primaryOverride.trim();
    }
  } else {
    primary = getPrimaryModel();
  }

  let fallbacks: string[] = [];
  if (Array.isArray(fallbackOverride) && fallbackOverride.length > 0) {
    fallbacks = fallbackOverride
      .map((m) => m.trim())
      .filter((m) => m.length > 0 && isValidModelIdentifier(m));
  } else if (typeof fallbackOverride === "string" && fallbackOverride.trim().length > 0) {
    fallbacks = fallbackOverride
      .split(",")
      .map((m) => m.trim())
      .filter((m) => m.length > 0 && isValidModelIdentifier(m));
  }

  if (fallbacks.length === 0) {
    fallbacks = getFallbackModels();
  }

  // Deduplicate while preserving strict priority order
  const chain: string[] = [];
  const seen = new Set<string>();

  if (isValidModelIdentifier(primary)) {
    chain.push(primary);
    seen.add(primary);
  }

  for (const model of fallbacks) {
    if (!seen.has(model) && isValidModelIdentifier(model)) {
      chain.push(model);
      seen.add(model);
    }
  }

  return chain.length > 0 ? chain : [DEFAULT_PRIMARY_MODEL];
}

export interface ClassifiedError {
  category: GeminiErrorCategory;
  isFatal: boolean;
  isRetryableForNextModel: boolean;
  message: string;
  status?: number | string;
}

/**
 * Classifies SDK and HTTP errors into internal categories.
 */
export function classifyGeminiError(error: unknown): ClassifiedError {
  if (!error) {
    return {
      category: "unknown",
      isFatal: false,
      isRetryableForNextModel: true,
      message: "Unknown error occurred.",
    };
  }

  if (error instanceof GeminiTimeoutError) {
    return {
      category: "timeout",
      isFatal: false,
      isRetryableForNextModel: false,
      message: error.message,
    };
  }

  const errObj = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const rawStatus = errObj.status ?? errObj.statusCode ?? (errObj.error as Record<string, unknown> | undefined)?.code;
  const status: number | string | undefined =
    typeof rawStatus === "number" || typeof rawStatus === "string" ? rawStatus : undefined;
  const message =
    typeof errObj.message === "string"
      ? errObj.message
      : typeof error === "string"
      ? error
      : JSON.stringify(error);

  const lowerMsg = message.toLowerCase();

  // 1. Authentication & Permission Errors (401, 403, PERMISSION_DENIED) -> FATAL, STOP!
  if (
    status === 401 ||
    status === 403 ||
    status === "PERMISSION_DENIED" ||
    lowerMsg.includes("api key not valid") ||
    lowerMsg.includes("permission_denied") ||
    lowerMsg.includes("unregistered project") ||
    lowerMsg.includes("forbidden")
  ) {
    return {
      category: "auth_error",
      isFatal: true,
      isRetryableForNextModel: false,
      message: "Gemini API key or project permission is invalid.",
      status,
    };
  }

  // 2. Invalid Request / Schema Configuration (400, INVALID_ARGUMENT) -> FATAL, DO NOT CYCLE BLINDLY!
  if (
    status === 400 ||
    status === "INVALID_ARGUMENT" ||
    lowerMsg.includes("invalid_argument") ||
    lowerMsg.includes("bad request") ||
    lowerMsg.includes("schema validation failed")
  ) {
    return {
      category: "invalid_request",
      isFatal: true,
      isRetryableForNextModel: false,
      message: "Invalid request payload or schema configuration.",
      status,
    };
  }

  // 3. Model Not Found / Deprecated (404, NOT_FOUND) -> Failover to next model
  if (
    status === 404 ||
    status === "NOT_FOUND" ||
    lowerMsg.includes("not_found") ||
    lowerMsg.includes("not found") ||
    lowerMsg.includes("no longer available")
  ) {
    return {
      category: "model_not_found",
      isFatal: false,
      isRetryableForNextModel: true,
      message: `Model is unavailable or deprecated: ${message.slice(0, 100)}`,
      status,
    };
  }

  // 4. Rate Limits & Quota Exhaustion (429, RESOURCE_EXHAUSTED) -> Immediate Failover to next model
  if (
    status === 429 ||
    status === "RESOURCE_EXHAUSTED" ||
    lowerMsg.includes("resource_exhausted") ||
    lowerMsg.includes("quota") ||
    lowerMsg.includes("limit exceeded") ||
    lowerMsg.includes("quotafailure") ||
    lowerMsg.includes("too many requests") ||
    lowerMsg.includes("rate limit")
  ) {
    return {
      category: "rate_limited",
      isFatal: false,
      isRetryableForNextModel: true,
      message: "Model rate limit or quota exceeded.",
      status,
    };
  }

  // 5. Transient Server Errors (503, 500, UNAVAILABLE, Overloaded) -> Bounded Failover
  if (
    status === 503 ||
    status === 500 ||
    status === "UNAVAILABLE" ||
    lowerMsg.includes("unavailable") ||
    lowerMsg.includes("overloaded") ||
    lowerMsg.includes("internal error")
  ) {
    return {
      category: "transient_error",
      isFatal: false,
      isRetryableForNextModel: true,
      message: "Model temporarily unavailable or overloaded.",
      status,
    };
  }

  // 6. Abort / Deadline Timeout
  if (
    errObj.name === "AbortError" ||
    lowerMsg.includes("aborted") ||
    lowerMsg.includes("deadline exceeded")
  ) {
    return {
      category: "timeout",
      isFatal: false,
      isRetryableForNextModel: false,
      message: "Request deadline exceeded.",
      status,
    };
  }

  return {
    category: "unknown",
    isFatal: false,
    isRetryableForNextModel: true,
    message,
    status,
  };
}

/**
 * Builds model-aware generation config to prevent incompatible settings
 * (e.g. low-thinking is supported on 3.1 & 3.5 flash-lite, but omitted on 2.5).
 */
export function buildModelGenerationConfig(
  model: string,
  baseConfig: {
    systemInstruction?: string;
    temperature?: number;
    responseMimeType?: string;
    responseSchema?: unknown;
    abortSignal?: AbortSignal;
  }
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    abortSignal: baseConfig.abortSignal,
    systemInstruction: baseConfig.systemInstruction,
    temperature: baseConfig.temperature ?? 0.2,
    responseMimeType: baseConfig.responseMimeType ?? "application/json",
    responseSchema: baseConfig.responseSchema,
  };

  // ThinkingLevel.LOW is supported on Gemini 3.x models
  if (model.includes("gemini-3")) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  }

  return config;
}

export class AllModelsExhaustedError extends Error {
  public readonly attempts: ModelAttemptDiagnostic[];
  public readonly requestId: string;

  constructor(attempts: ModelAttemptDiagnostic[], requestId: string) {
    const summary = attempts
      .map((a) => `${a.model} (${a.category})`)
      .join(", ");
    super(`All configured Gemini models failed for request [${requestId}]: ${summary}`);
    this.name = "AllModelsExhaustedError";
    this.attempts = attempts;
    this.requestId = requestId;
  }
}

export interface FailoverExecutionOptions<T> {
  executeFn: (ai: GoogleGenAI, model: string, signal: AbortSignal) => Promise<T>;
  validateFn?: (result: T, model: string) => { valid: boolean; reason?: string };
  models?: string[];
  requestId?: string;
  totalTimeoutMs?: number;
  aiClient?: GoogleGenAI;
}

export interface FailoverResult<T> {
  data: T;
  modelUsed: string;
  usedFallback: boolean;
  attempts: ModelAttemptDiagnostic[];
  totalDurationMs: number;
}

/**
 * Executes a Gemini generation operation with sequential automatic model failover.
 * - Attempts models sequentially in priority order.
 * - Exactly one attempt per model (no unbounded loops).
 * - Immediately fails over on 429/RESOURCE_EXHAUSTED or 503 without user re-submission.
 * - Stops immediately on 401/403 or invalid requests.
 * - Validates outputs before accepting.
 */
export async function executeWithModelFailover<T>({
  executeFn,
  validateFn,
  models = getConfiguredModelChain(),
  requestId = `req_${Date.now().toString(36)}`,
  totalTimeoutMs = 18000,
  aiClient,
}: FailoverExecutionOptions<T>): Promise<FailoverResult<T>> {
  const overallStart = Date.now();
  const ai = aiClient || getGeminiClient();

  const controller = new AbortController();
  const overallTimeoutId = setTimeout(() => {
    controller.abort(new GeminiTimeoutError(totalTimeoutMs));
  }, totalTimeoutMs);

  const attempts: ModelAttemptDiagnostic[] = [];

  try {
    for (let index = 0; index < models.length; index++) {
      const model = models[index];
      const attemptNumber = index + 1;

      if (controller.signal.aborted) {
        throw new GeminiTimeoutError(totalTimeoutMs);
      }

      // Check remaining time budget
      const remainingTimeMs = totalTimeoutMs - (Date.now() - overallStart);
      if (remainingTimeMs < 1500) {
        attempts.push({
          requestId,
          model,
          attemptNumber,
          durationMs: 0,
          outcome: "timeout",
          category: "timeout",
          errorSummary: "Insufficient time remaining in request budget",
        });
        break;
      }

      const attemptStart = Date.now();

      try {
        const result = await executeFn(ai, model, controller.signal);
        const attemptDuration = Date.now() - attemptStart;

        // Run validation if provided
        if (validateFn) {
          const validation = validateFn(result, model);
          if (!validation.valid) {
            attempts.push({
              requestId,
              model,
              attemptNumber,
              durationMs: attemptDuration,
              outcome: "validation_failed",
              category: "validation_error",
              errorSummary: validation.reason || "Validation rejected model output",
            });

            if (process.env.NODE_ENV !== "production") {
              console.warn(
                `[GeminiRouter] id=${requestId} model=${model} attempt=${attemptNumber} validation_failed: ${validation.reason}`
              );
            }
            // Move to next candidate model if available
            continue;
          }
        }

        // Success!
        const usedFallback = index > 0;
        attempts.push({
          requestId,
          model,
          attemptNumber,
          durationMs: attemptDuration,
          outcome: "success",
          category: "unknown",
        });

        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[GeminiRouter] id=${requestId} model=${model} attempt=${attemptNumber} status=success duration=${attemptDuration}ms usedFallback=${usedFallback}`
          );
        }

        return {
          data: result,
          modelUsed: model,
          usedFallback,
          attempts,
          totalDurationMs: Date.now() - overallStart,
        };
      } catch (err: unknown) {
        const attemptDuration = Date.now() - attemptStart;
        const classified = classifyGeminiError(err);

        attempts.push({
          requestId,
          model,
          attemptNumber,
          durationMs: attemptDuration,
          outcome: classified.category as ModelAttemptDiagnostic["outcome"],
          category: classified.category,
          errorSummary: classified.message,
        });

        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[GeminiRouter] id=${requestId} model=${model} attempt=${attemptNumber} category=${classified.category} duration=${attemptDuration}ms -> ${
              classified.isFatal
                ? "fatal error (stopping)"
                : index < models.length - 1
                ? `failing over to ${models[index + 1]}`
                : "all candidates exhausted"
            }`
          );
        }

        // Fatal errors (e.g. 401/403 or bad schema 400) stop immediately
        if (classified.isFatal) {
          throw err;
        }

        // If not retryable for next model (e.g. timeout), stop
        if (!classified.isRetryableForNextModel) {
          throw err;
        }

        // Otherwise, continue loop to next model in chain
      }
    }

    // If we reach here, all configured candidate models were exhausted
    throw new AllModelsExhaustedError(attempts, requestId);
  } finally {
    clearTimeout(overallTimeoutId);
  }
}
