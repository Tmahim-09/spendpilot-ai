import type {
  AiComparisonResult,
  NormalizedProduct,
  EvidenceFact,
  ComparisonCriterion,
  CriterionAssessment,
  AssessmentRating,
  ProductTradeOff,
  AlternativePick,
  MissingInformation,
} from "../../types/index.ts";

export interface ComparisonValidationResult {
  valid: boolean;
  comparison: AiComparisonResult;
  topRecommendations: NormalizedProduct[];
  otherMatches: NormalizedProduct[];
  rejectionReasons: string[];
}

const ALLOWED_RATINGS: Set<AssessmentRating> = new Set([
  "strong",
  "partial",
  "weak",
  "unknown",
]);

/**
 * Strictly validates Gemini comparison output against genuine candidate products
 * and server-generated evidence fact IDs.
 *
 * Rules:
 * 1. bestMatchProductId must exist in the candidate set.
 * 2. Every assessment productId must exist in the candidate set.
 * 3. Every cited evidenceFactId MUST exist AND belong to the specific product being assessed.
 * 4. Assessment ratings must strictly be "strong" | "partial" | "weak" | "unknown".
 * 5. Trade-offs, alternative picks, and missing info must reference valid candidates only.
 */
export function validateAndCleanComparison(
  rawJson: unknown,
  candidateProducts: NormalizedProduct[],
  evidenceFacts: Record<string, EvidenceFact>,
  fallbackQuery = "products"
): ComparisonValidationResult {
  const rejectionReasons: string[] = [];

  // Build lookup maps
  const candidateMap = new Map<string, NormalizedProduct>();
  for (const p of candidateProducts) {
    const id = p.sourceProductId || p.title;
    candidateMap.set(id, { ...p });
  }

  const firstProductId = candidateProducts[0]?.sourceProductId || candidateProducts[0]?.title || "";

  if (!rawJson || typeof rawJson !== "object") {
    rejectionReasons.push("Comparison output is not a JSON object");
    return {
      valid: false,
      comparison: createFallbackComparison(firstProductId, fallbackQuery),
      topRecommendations: candidateProducts.slice(0, 3),
      otherMatches: candidateProducts.slice(3),
      rejectionReasons,
    };
  }

  const raw = rawJson as Record<string, unknown>;

  // 1. Validate bestMatchProductId
  let bestMatchId = typeof raw.bestMatchProductId === "string" ? raw.bestMatchProductId.trim() : "";
  if (!candidateMap.has(bestMatchId)) {
    rejectionReasons.push(
      `bestMatchProductId "${bestMatchId}" was not found in candidate products list; falling back to first candidate.`
    );
    bestMatchId = firstProductId;
  }

  // 2. Summary & Reason
  const summary =
    typeof raw.summary === "string" && raw.summary.trim().length > 0
      ? raw.summary.trim()
      : `Comparison of ${candidateProducts.length} candidate options for "${fallbackQuery}".`;

  const bestMatchReason =
    typeof raw.bestMatchReason === "string" && raw.bestMatchReason.trim().length > 0
      ? raw.bestMatchReason.trim()
      : "Matches your stated shopping requirements better than the alternatives based on verified attributes.";

  // 3. Priority Interpretation
  const priorityInterpretation: string[] = [];
  if (Array.isArray(raw.priorityInterpretation)) {
    for (const item of raw.priorityInterpretation) {
      if (typeof item === "string" && item.trim().length > 0) {
        priorityInterpretation.push(item.trim());
      }
    }
  }
  if (priorityInterpretation.length === 0) {
    priorityInterpretation.push(`Finding reliable options for "${fallbackQuery}"`);
  }

  // 4. Criteria & Evidence Fact Validation
  const validatedCriteria: ComparisonCriterion[] = [];
  if (Array.isArray(raw.criteria)) {
    for (const rawCrit of raw.criteria) {
      if (!rawCrit || typeof rawCrit !== "object") continue;
      const cObj = rawCrit as Record<string, unknown>;

      const name = typeof cObj.name === "string" && cObj.name.trim().length > 0 ? cObj.name.trim() : "Key Feature";
      const importanceRaw = typeof cObj.importance === "string" ? cObj.importance.toLowerCase() : "medium";
      const importance: ComparisonCriterion["importance"] =
        importanceRaw === "high" || importanceRaw === "low" ? importanceRaw : "medium";

      const validatedAssessments: CriterionAssessment[] = [];

      if (Array.isArray(cObj.assessments)) {
        for (const rawAss of cObj.assessments) {
          if (!rawAss || typeof rawAss !== "object") continue;
          const aObj = rawAss as Record<string, unknown>;

          const prodId = typeof aObj.productId === "string" ? aObj.productId.trim() : "";
          if (!candidateMap.has(prodId)) {
            rejectionReasons.push(`Ignored assessment for unknown productId: "${prodId}"`);
            continue;
          }

          const rawRating = typeof aObj.assessment === "string" ? aObj.assessment.toLowerCase() : "unknown";
          let assessment: AssessmentRating = "unknown";
          if (ALLOWED_RATINGS.has(rawRating as AssessmentRating)) {
            assessment = rawRating as AssessmentRating;
          } else {
            rejectionReasons.push(
              `Sanitized invalid assessment rating "${rawRating}" to "unknown" for product "${prodId}".`
            );
          }

          const reason =
            typeof aObj.reason === "string" && aObj.reason.trim().length > 0
              ? aObj.reason.trim()
              : "Assessed based on available listing facts.";

          // GROUNDING CHECK: Validate evidence fact IDs strictly!
          const validatedFactIds: string[] = [];
          if (Array.isArray(aObj.evidenceFactIds)) {
            for (const fId of aObj.evidenceFactIds) {
              if (typeof fId !== "string") continue;
              const cleanFactId = fId.trim();
              const fact = evidenceFacts[cleanFactId];

              // Check 1: Fact must exist in our extracted server fact dictionary
              // Check 2: Fact must belong to THIS specific product (no cross-contamination!)
              if (fact && fact.productId === prodId) {
                validatedFactIds.push(cleanFactId);
              } else if (fact && fact.productId !== prodId) {
                rejectionReasons.push(
                  `Rejected cross-product fact citation: fact "${cleanFactId}" belongs to "${fact.productId}", not "${prodId}".`
                );
              }
            }
          }

          validatedAssessments.push({
            productId: prodId,
            assessment,
            reason,
            evidenceFactIds: validatedFactIds,
          });
        }
      }

      if (validatedAssessments.length > 0) {
        validatedCriteria.push({
          name,
          importance,
          assessments: validatedAssessments,
        });
      }
    }
  }

  // 5. Trade-offs
  const validatedTradeoffs: ProductTradeOff[] = [];
  if (Array.isArray(raw.tradeoffs)) {
    for (const t of raw.tradeoffs) {
      if (!t || typeof t !== "object") continue;
      const tObj = t as Record<string, unknown>;
      const pId = typeof tObj.productId === "string" ? tObj.productId.trim() : "";
      const s = typeof tObj.summary === "string" ? tObj.summary.trim() : "";
      if (candidateMap.has(pId) && s.length > 0) {
        validatedTradeoffs.push({ productId: pId, summary: s });
      }
    }
  }

  // 6. Alternative Picks
  const validatedAlternatives: AlternativePick[] = [];
  if (Array.isArray(raw.alternativePicks)) {
    for (const alt of raw.alternativePicks) {
      if (!alt || typeof alt !== "object") continue;
      const aObj = alt as Record<string, unknown>;
      const pId = typeof aObj.productId === "string" ? aObj.productId.trim() : "";
      const bestFor = typeof aObj.bestFor === "string" ? aObj.bestFor.trim() : "";
      const reason = typeof aObj.reason === "string" ? aObj.reason.trim() : "";

      if (candidateMap.has(pId) && pId !== bestMatchId && bestFor.length > 0 && reason.length > 0) {
        validatedAlternatives.push({ productId: pId, bestFor, reason });
      }
    }
  }

  // 7. Missing Information
  const validatedMissing: MissingInformation[] = [];
  if (Array.isArray(raw.missingInformation)) {
    for (const m of raw.missingInformation) {
      if (!m || typeof m !== "object") continue;
      const mObj = m as Record<string, unknown>;
      const pId = typeof mObj.productId === "string" ? mObj.productId.trim() : "";
      const field = typeof mObj.field === "string" ? mObj.field.trim() : "";
      const explanation = typeof mObj.explanation === "string" ? mObj.explanation.trim() : "";

      if (candidateMap.has(pId) && field.length > 0 && explanation.length > 0) {
        validatedMissing.push({ productId: pId, field, explanation });
      }
    }
  }

  // Compile final validated comparison object
  const comparison: AiComparisonResult = {
    summary,
    bestMatchProductId: bestMatchId,
    bestMatchReason,
    priorityInterpretation,
    criteria: validatedCriteria,
    tradeoffs: validatedTradeoffs,
    alternativePicks: validatedAlternatives,
    missingInformation: validatedMissing,
  };

  // Build top recommendations: Best match is #1, followed by alternatives
  const assignedIds = new Set<string>();
  const topRecommendations: NormalizedProduct[] = [];

  const bestMatchProduct = candidateMap.get(bestMatchId);
  if (bestMatchProduct) {
    assignedIds.add(bestMatchId);
    bestMatchProduct.rank = 1;
    bestMatchProduct.explanation = bestMatchReason;
    const matchTradeoff = validatedTradeoffs.find((t) => t.productId === bestMatchId);
    if (matchTradeoff) {
      bestMatchProduct.keyTradeOffs = matchTradeoff.summary;
    }
    topRecommendations.push(bestMatchProduct);
  }

  // Add alternative picks to recommendations
  for (const alt of validatedAlternatives) {
    if (!assignedIds.has(alt.productId)) {
      const altProduct = candidateMap.get(alt.productId);
      if (altProduct) {
        assignedIds.add(alt.productId);
        altProduct.rank = topRecommendations.length + 1;
        altProduct.explanation = `${alt.bestFor}: ${alt.reason}`;
        const altTradeoff = validatedTradeoffs.find((t) => t.productId === alt.productId);
        if (altTradeoff) {
          altProduct.keyTradeOffs = altTradeoff.summary;
        }
        topRecommendations.push(altProduct);
      }
    }
  }

  // Remaining products go to otherMatches
  const otherMatches: NormalizedProduct[] = [];
  for (const p of candidateProducts) {
    const id = p.sourceProductId || p.title;
    if (!assignedIds.has(id)) {
      otherMatches.push({ ...p });
    }
  }

  return {
    valid: true,
    comparison,
    topRecommendations,
    otherMatches,
    rejectionReasons,
  };
}

function createFallbackComparison(productId: string, query: string): AiComparisonResult {
  return {
    summary: `Showing authentic catalog matches for "${query}".`,
    bestMatchProductId: productId,
    bestMatchReason: "Identified from your search criteria.",
    priorityInterpretation: [`Matching products for "${query}"`],
    criteria: [],
    tradeoffs: [],
    alternativePicks: [],
    missingInformation: [],
  };
}
