import { Type, ThinkingLevel } from "@google/genai";
import { executeGeminiWithDeadline } from "./gemini-client.ts";
import { extractEvidenceFacts } from "./evidence-extractor.ts";
import { validateAndCleanComparison, type ComparisonValidationResult } from "./comparison-validator.ts";
import type { NormalizedProduct, AiComparisonResult, EvidenceFact } from "../../types/index.ts";

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
}

export interface RunAiComparisonResult {
  comparison: AiComparisonResult;
  evidenceFacts: Record<string, EvidenceFact>;
  topRecommendations: NormalizedProduct[];
  otherMatches: NormalizedProduct[];
  allProducts: NormalizedProduct[];
  validation: ComparisonValidationResult;
}

/**
 * Runs an evidence-grounded AI product comparison across a shortlist of 4 to 6 candidate products.
 */
export async function runAiComparison({
  query,
  products,
  budget,
  currency = "USD",
  priorityOverride,
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

  // PRD Section 2: Compare a shortlist of 4 to 6 actual products
  const shortlist = products.slice(0, 6);

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
3. Missing Information: If an important specification like battery life, weight, or connection mode is not in the verifiedFacts list, set assessment to 'unknown' and log it in missingInformation.
4. Objective: Avoid promotional hype like "world-class" or "best ever". Use objective, evidence-based comparisons.
5. Allowed assessments: 'strong', 'partial', 'weak', 'unknown'.`;

  const userPrompt = `User Shopping Query: "${query}"
${budget ? `Budget Limit: ${currency} ${budget}` : "Budget: No strict limit set"}
${priorityOverride ? `User Priority Refinement: "${priorityOverride}" (Prioritize this requirement in your comparison)` : ""}

Candidate Products with Verified Facts:
${JSON.stringify(candidateSummariesForPrompt, null, 2)}

Provide a structured, side-by-side comparison evaluating these candidate products against the user's requirements.`;

  const parsedJson = await executeGeminiWithDeadline(
    async (ai, model, signal) => {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        config: {
          abortSignal: signal,
          systemInstruction,
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: comparisonSchema,
          thinkingConfig:
            model === "gemini-3.8-flash"
              ? { thinkingLevel: ThinkingLevel.LOW }
              : undefined,
        },
      });

      const text = response.text?.trim() || "{}";
      return JSON.parse(text) as Record<string, unknown>;
    },
    { timeoutMs: 14000, maxRetries: 0 }
  );

  // Validate the comparison server-side
  const validation = validateAndCleanComparison(parsedJson, shortlist, evidenceFacts, query);

  // Combine top recommendations with remaining candidate products (from outside the shortlist)
  const remainingProducts = products.slice(6);
  const otherMatches = [...validation.otherMatches, ...remainingProducts];
  const allProducts = [...validation.topRecommendations, ...otherMatches];

  return {
    comparison: validation.comparison,
    evidenceFacts,
    topRecommendations: validation.topRecommendations,
    otherMatches,
    allProducts,
    validation,
  };
}
