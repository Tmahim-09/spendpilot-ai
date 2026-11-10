import { Type } from "@google/genai";
import { executeWithModelFailover, buildModelGenerationConfig } from "./gemini-router.ts";
import { extractEvidenceFacts } from "./evidence-extractor.ts";
import { validateAndCleanComparison, type ComparisonValidationResult } from "./comparison-validator.ts";
import type {
  NormalizedProduct,
  AiComparisonResult,
  EvidenceFact,
  ModelAttemptDiagnostic,
} from "../../types/index.ts";

const comparisonSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "A concise 1-2 sentence executive summary of the comparison and trade-offs.",
    },
    bestMatchProductId: {
      type: Type.STRING,
      description: "Exact productId from the candidates that best matches the request.",
    },
    bestMatchReason: {
      type: Type.STRING,
      description: "Concise explanation of why this product beats the alternatives based on verified facts.",
    },
    priorityInterpretation: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "1-3 bullet points interpreting the user's primary decision criteria.",
    },
    criteria: {
      type: Type.ARRAY,
      description: "3 to 5 key comparison criteria relevant to this specific shopping request.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "Criterion name (e.g. 'Quiet Operation', 'Wireless Connectivity', 'Study Portability', 'Value for Price').",
          },
          importance: {
            type: Type.STRING,
            description: "high, medium, or low",
          },
          assessments: {
            type: Type.ARRAY,
            description: "Assessment for each candidate product against this criterion.",
            items: {
              type: Type.OBJECT,
              properties: {
                productId: {
                  type: Type.STRING,
                  description: "Exact productId matching the candidate.",
                },
                assessment: {
                  type: Type.STRING,
                  description: "Must be 'strong', 'partial', 'weak', or 'unknown'.",
                },
                reason: {
                  type: Type.STRING,
                  description: "Concise factual reason citing verified evidence.",
                },
                evidenceFactIds: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "List of exact fact IDs (e.g. ['fact-p1-2']) from this product's verified facts list that support this assessment.",
                },
              },
              required: ["productId", "assessment", "reason"],
            },
          },
        },
        required: ["name", "importance", "assessments"],
      },
    },
    tradeoffs: {
      type: Type.ARRAY,
      description: "Key limitations or trade-offs to consider before purchasing.",
      items: {
        type: Type.OBJECT,
        properties: {
          productId: { type: Type.STRING },
          summary: { type: Type.STRING },
        },
        required: ["productId", "summary"],
      },
    },
    alternativePicks: {
      type: Type.ARRAY,
      description: "Options that may suit alternative priorities better (e.g. 'Best for Portability', 'Lowest Verified Price').",
      items: {
        type: Type.OBJECT,
        properties: {
          productId: { type: Type.STRING },
          bestFor: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ["productId", "bestFor", "reason"],
      },
    },
    missingInformation: {
      type: Type.ARRAY,
      description: "Important specifications that were not provided in the retailer listings.",
      items: {
        type: Type.OBJECT,
        properties: {
          productId: { type: Type.STRING },
          field: { type: Type.STRING },
          explanation: { type: Type.STRING },
        },
        required: ["productId", "field", "explanation"],
      },
    },
  },
  required: [
    "summary",
    "bestMatchProductId",
    "bestMatchReason",
    "priorityInterpretation",
    "criteria",
  ],
};

export interface RunAiComparisonOptions {
  query: string;
  products: NormalizedProduct[];
  budget?: number | null;
  currency?: string;
  priorityOverride?: string;
  requestId?: string;
  aiClient?: import("@google/genai").GoogleGenAI;
}

export interface RunAiComparisonResult {
  comparison: AiComparisonResult;
  evidenceFacts: Record<string, EvidenceFact>;
  topRecommendations: NormalizedProduct[];
  otherMatches: NormalizedProduct[];
  allProducts: NormalizedProduct[];
  validation: ComparisonValidationResult;
  modelUsed?: string;
  usedFallback?: boolean;
  attempts?: ModelAttemptDiagnostic[];
}

/**
 * Selects and sorts the top 4 candidate products for side-by-side comparison:
 * - When budget is set, prioritizes products closest to budget for maximum features and quality (unless budget-saver requested).
 * - When budget-saver / lowest price requested, prioritizes lowest prices.
 * - Strictly caps to at most 4 products so the comparison table fits the screen cleanly.
 */
export function prepareComparisonShortlist(
  products: NormalizedProduct[],
  budget?: number | null,
  priorityOverride?: string
): NormalizedProduct[] {
  if (!products || products.length === 0) return [];

  const sortedCandidates = [...products];
  const isBudgetSaver =
    Boolean(
      priorityOverride &&
      /\b(lowest price|best(?: \w+)? value|budget[- ]?(?:friendly|saver|value)|cheapest|economical|save[s]? money|budget)\b/i.test(priorityOverride)
    );

  if (budget && budget > 0) {
    if (isBudgetSaver) {
      sortedCandidates.sort((a, b) => (a.priceMinor ?? 0) - (b.priceMinor ?? 0));
    } else {
      // Prioritize products closest to the budget to maximize quality and performance
      const budgetCents = budget * 100;
      sortedCandidates.sort((a, b) => {
        const priceA = a.priceMinor ?? 0;
        const priceB = b.priceMinor ?? 0;
        return Math.abs(budgetCents - priceA) - Math.abs(budgetCents - priceB);
      });
    }
  }

  // Exactly 4 best candidate products for side-by-side comparison (fits screen cleanly)
  return sortedCandidates.slice(0, 4);
}

/**
 * Runs an evidence-grounded AI product comparison across a shortlist of 4 candidate products.
 */
export async function runAiComparison({
  query,
  products,
  budget,
  currency = "USD",
  priorityOverride,
  requestId,
  aiClient,
}: RunAiComparisonOptions): Promise<RunAiComparisonResult> {
  if (!products || products.length === 0) {
    return {
      comparison: {
        summary: "No products available for comparison.",
        bestMatchProductId: "",
        bestMatchReason: "",
        priorityInterpretation: [],
        criteria: [],
        tradeoffs: [],
        alternativePicks: [],
        missingInformation: [],
      },
      evidenceFacts: {},
      topRecommendations: [],
      otherMatches: [],
      allProducts: [],
      validation: {
        valid: false,
        comparison: {} as AiComparisonResult,
        topRecommendations: [],
        otherMatches: [],
        rejectionReasons: ["No candidate products provided."],
      },
    };
  }

  // Select the top 4 candidates calibrated to budget and screen fit
  const shortlist = prepareComparisonShortlist(products, budget, priorityOverride);
  const isBudgetSaver =
    Boolean(
      priorityOverride &&
      /\b(lowest price|best(?: \w+)? value|budget[- ]?(?:friendly|saver|value)|cheapest|economical|save[s]? money|budget)\b/i.test(priorityOverride)
    );

  // Extract verified evidence facts with stable IDs
  const { evidenceFacts, candidateSummariesForPrompt } = extractEvidenceFacts(shortlist);

  // If only 1 product available, return transparent single-item result without LLM call
  if (shortlist.length < 2) {
    const singleProduct = shortlist[0];
    const singleId = singleProduct.sourceProductId || singleProduct.title;
    const singleComparison: AiComparisonResult = {
      summary: `Only 1 product matched "${query}". Comparison requires at least 2 comparable products.`,
      bestMatchProductId: singleId,
      bestMatchReason: "Sole verified match retrieved for this search query.",
      priorityInterpretation: [`Evaluating options for "${query}"`],
      criteria: [],
      tradeoffs: [],
      alternativePicks: [],
      missingInformation: [],
    };
    return {
      comparison: singleComparison,
      evidenceFacts,
      topRecommendations: [singleProduct],
      otherMatches: [],
      allProducts: [singleProduct],
      validation: {
        valid: true,
        comparison: singleComparison,
        topRecommendations: [singleProduct],
        otherMatches: [],
        rejectionReasons: [],
      },
    };
  }

  const systemInstruction = `You are the Lead Shopping Comparison Engine for SpendPilot AI, an intelligent commerce assistant for the PayPal AI Hackathon 2026.
Your job is to produce a rigorous, grounded, side-by-side comparison of genuine candidate products retrieved from Channel3.
Rules:
1. Grounding: Every claim must be grounded in the supplied listing facts. Never fabricate ratings, customer reviews, battery life, weight, or unlisted specs.
2. Evidence Citation: For each assessment, cite ONLY the fact IDs (e.g. 'fact-prod123-1') provided in that product's verifiedFacts list. NEVER cite a fact ID belonging to a different product.
3. Missing Information: If an important specification like battery life, weight, or connection mode is not in the verifiedFacts list, set assessment to 'unknown' and log it in missingInformation. Never guess or estimate missing battery life.
4. Storage Accuracy: Strictly distinguish internal SSD from bundled external accessories (e.g., 1TB SSD + 1TB docking station must NOT be described as '2TB internal storage').
5. Hard Requirements & OS: If an explicit operating system (e.g. macOS) is required, an incompatible or unverified OS cannot pass or be chosen as bestMatch.
6. Objective: Avoid promotional hype like "world-class" or "best ever". Use objective, evidence-based comparisons.
7. Allowed assessments: 'strong', 'partial', 'weak', 'unknown'.
8. No Invented User Requirements: Only treat specifications explicitly stated in the User Shopping Query or Priority Refinement as user requirements. Never claim the user asked for 32GB RAM, 1440p resolution, or unmentioned specs unless explicitly stated.
9. Budget Proximity & Calibration: When a budget limit is provided (e.g. $100), unless the user explicitly requested "lowest price" or "best value/saver", users expect the #1 Top Recommendation (bestMatchProductId) to be a high-quality product that maximizes performance close to their budget (e.g., 75%–100% of budget), rather than an entry-level product that leaves a large portion of the budget unspent (e.g., $44 on a $100 budget). Highlight lower-cost budget-saver products under alternativePicks (e.g., "Best Value / Budget Saver"), allowing the user to choose whether to maximize quality near their budget or save money.`;

  const userPrompt = `User Shopping Query: "${query}"
${budget ? `Budget Limit: ${currency} ${budget} (${isBudgetSaver ? "User requested budget-saver / lowest-price focus" : "Prioritize options closest to budget for maximum features & quality"})` : "Budget: No strict limit set"}
${priorityOverride ? `User Priority Refinement: "${priorityOverride}" (Prioritize this requirement in your comparison)` : ""}

Candidate Products with Verified Facts (Top 4 Best Candidates for Screen-Fit Comparison):
${JSON.stringify(candidateSummariesForPrompt, null, 2)}

Provide a structured, side-by-side comparison evaluating these candidate products against the user's requirements.`;

  const failoverResult = await executeWithModelFailover<Record<string, unknown>>({
    requestId,
    totalTimeoutMs: 18000,
    aiClient,
    executeFn: async (ai, model, signal) => {
      const config = buildModelGenerationConfig(model, {
        abortSignal: signal,
        systemInstruction,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: comparisonSchema,
      });

      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        config,
      });

      const text = response.text?.trim() || "{}";
      return JSON.parse(text) as Record<string, unknown>;
    },
    validateFn: (data) => {
      if (!data || typeof data !== "object") {
        return { valid: false, reason: "Model output is not a JSON object" };
      }
      return { valid: true };
    },
  });

  // Validate the comparison server-side
  const validation = validateAndCleanComparison(failoverResult.data, shortlist, evidenceFacts, query);

  // Combine top recommendations with remaining candidate products with strict identity deduplication
  const assignedIds = new Set<string>();

  // 1. Top recommendations always come first
  const deduplicatedTop: NormalizedProduct[] = [];
  for (const p of validation.topRecommendations) {
    const id = p.sourceProductId || p.title;
    if (id && !assignedIds.has(id)) {
      assignedIds.add(id);
      deduplicatedTop.push(p);
    }
  }

  // 2. Other matches from the comparison shortlist
  const deduplicatedOther: NormalizedProduct[] = [];
  for (const p of validation.otherMatches) {
    const id = p.sourceProductId || p.title;
    if (id && !assignedIds.has(id)) {
      assignedIds.add(id);
      deduplicatedOther.push(p);
    }
  }

  // 3. Add any remaining candidate products from the initial catalog that weren't in the shortlist
  for (const p of products) {
    const id = p.sourceProductId || p.title;
    if (id && !assignedIds.has(id)) {
      assignedIds.add(id);
      deduplicatedOther.push(p);
    }
  }

  const allProducts = [...deduplicatedTop, ...deduplicatedOther];

  return {
    comparison: validation.comparison,
    evidenceFacts,
    topRecommendations: deduplicatedTop,
    otherMatches: deduplicatedOther,
    allProducts,
    validation,
    modelUsed: failoverResult.modelUsed,
    usedFallback: failoverResult.usedFallback,
    attempts: failoverResult.attempts,
  };
}
