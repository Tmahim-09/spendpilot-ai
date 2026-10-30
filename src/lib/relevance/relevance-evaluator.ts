import type { NormalizedProduct, RelevanceOutcome, SetupRequirementItem } from "../../types/index.ts";
import {
  verifyTargetFranchiseInProduct,
  identifyFranchisesInText,
  containsPhrase,
  isGeneralAnimeTheme,
} from "./entity-registry.ts";

export type { RelevanceOutcome };

export interface RelevanceEvaluationResult {
  productId: string;
  requirementId: string;
  outcome: RelevanceOutcome;
  matchedFranchises: string[];
  matchedCharacters: string[];
  evidenceQuote: string;
  evidenceField: "title" | "description" | "brand" | "specifications" | "sourceFacts" | "none";
  isSubstitution: boolean;
  substitutionCategory?: string;
  explanation: string;
  isEligible: boolean; // true for matches and permitted fallbacks
}

/**
 * Normalizes category keywords to detect general physical form factor.
 */
function extractCategoryKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const keywords: string[] = [];
  const standardCategories = [
    "neon",
    "led",
    "light",
    "lamp",
    "sign",
    "canvas",
    "wall art",
    "art",
    "poster",
    "scroll",
    "print",
    "bedding",
    "duvet",
    "comforter",
    "sheet",
    "blanket",
    "quilt",
    "figure",
    "figurine",
    "statue",
    "collectible",
    "toy",
    "rug",
    "carpet",
    "mat",
    "pillow",
    "cushion",
    "pillowcase",
    "mousepad",
    "mouse pad",
    "desk mat",
    "playmat",
    "keyboard",
    "mouse",
    "monitor",
    "headset",
    "pc",
  ];

  for (const cat of standardCategories) {
    if (containsPhrase(lower, cat).found) {
      keywords.push(cat);
    }
  }

  return keywords;
}

/**
 * Checks whether a candidate product matches the requested product category or an allowed substitution.
 */
function checkProductCategoryMatch(
  product: NormalizedProduct,
  req: SetupRequirementItem
): { isCategoryMatch: boolean; isSubstitution: boolean; matchedSub?: string } {
  const reqCategoryKeywords = extractCategoryKeywords(
    `${req.productCategory || ""} ${req.name} ${req.searchQuery}`
  );

  const productText = `${product.title} ${product.description || ""} ${Object.keys(product.specifications || {}).join(" ")} ${Object.values(product.specifications || {}).join(" ")}`.toLowerCase();

  // 1. Check direct category match
  let directMatchCount = 0;
  for (const kw of reqCategoryKeywords) {
    if (containsPhrase(productText, kw).found) {
      directMatchCount++;
    }
  }

  // If at least one primary category keyword matches, consider it a category match
  if (directMatchCount > 0) {
    return { isCategoryMatch: true, isSubstitution: false };
  }

  // 1b. Check allowedProductFormats
  const allowedFormats = req.allowedProductFormats || [];
  for (const fmt of allowedFormats) {
    const fmtKeywords = extractCategoryKeywords(fmt);
    const fmtMatches = fmtKeywords.some((kw) => containsPhrase(productText, kw).found);
    if (fmtMatches || containsPhrase(productText, fmt.toLowerCase()).found) {
      return { isCategoryMatch: true, isSubstitution: false };
    }
  }

  // If no standard category keywords were found in the requirement name/query,
  // fall back to checking if non-trivial tokens from the requirement name/query appear in product
  if (reqCategoryKeywords.length === 0 && allowedFormats.length === 0) {
    const fallbackWords = `${req.name} ${req.searchQuery || ""}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (fallbackWords.length === 0) {
      return { isCategoryMatch: true, isSubstitution: false };
    }

    const matchesWord = fallbackWords.some((w) => containsPhrase(productText, w).found);
    if (matchesWord) {
      return { isCategoryMatch: true, isSubstitution: false };
    }
  }

  // 2. Check allowed substitutions
  const allowedSubs = req.allowedSubstitutions || [];
  for (const sub of allowedSubs) {
    const subKeywords = extractCategoryKeywords(sub);
    const subMatches = subKeywords.some((kw) => containsPhrase(productText, kw).found);
    if (subMatches || containsPhrase(productText, sub.toLowerCase()).found) {
      return { isCategoryMatch: false, isSubstitution: true, matchedSub: sub };
    }
  }

  // 3. If requirement explicitly allows alternative formats and product belongs to decorative domain:
  if (req.allowAlternativeFormat) {
    // Bedding is special: a poster or keychain cannot substitute for bedding
    const isBeddingReq = reqCategoryKeywords.some((k) => ["bedding", "duvet", "comforter", "sheet"].includes(k));
    const isProductBedding = ["bedding", "duvet", "comforter", "sheet", "blanket", "quilt"].some((k) => containsPhrase(productText, k).found);
    if (isBeddingReq && !isProductBedding) {
      return { isCategoryMatch: false, isSubstitution: false };
    }

    const decorativeFormats = ["poster", "scroll", "tapestry", "flag", "canvas", "art", "print", "lamp", "light", "neon", "figure", "figurine", "statue", "mat", "pad", "pillow", "cushion", "blanket"];
    const matchedFmt = decorativeFormats.find((f) => containsPhrase(productText, f).found);
    if (matchedFmt) {
      return { isCategoryMatch: false, isSubstitution: true, matchedSub: matchedFmt };
    }
  }

  return { isCategoryMatch: false, isSubstitution: false };
}

/**
 * Strictly verifies whether an evidence quote exists as a genuine substring
 * inside the product's actual fields. Rejects fabricated or hallucinated evidence.
 */
export function verifyEvidenceGroundedInProduct(
  product: NormalizedProduct,
  quote: string,
  field: string
): boolean {
  if (!quote || quote.trim().length === 0) return false;
  const cleanQuote = quote.trim().toLowerCase();

  let targetText = "";
  if (field === "title") {
    targetText = (product.title || "").toLowerCase();
  } else if (field === "description") {
    targetText = (product.description || "").toLowerCase();
  } else if (field === "brand") {
    targetText = (product.brand || "").toLowerCase();
  } else if (field === "sourceFacts") {
    targetText = (product.sourceFacts || []).join(" ").toLowerCase();
  } else if (field === "specifications") {
    targetText = `${Object.keys(product.specifications || {}).join(" ")} ${Object.values(product.specifications || {}).join(" ")}`.toLowerCase();
  } else {
    // Check all fields
    targetText = `${product.title} ${product.description || ""} ${product.brand || ""} ${(product.sourceFacts || []).join(" ")}`.toLowerCase();
  }

  return targetText.includes(cleanQuote);
}

/**
 * Evaluates whether a product is eligible for a specific requirement based on
 * mandatory/preferred franchise constraints, character constraints, and product purpose.
 */
export function evaluateProductRelevance(
  product: NormalizedProduct,
  requirement: SetupRequirementItem
): RelevanceEvaluationResult {
  const productId = product.sourceProductId || product.title;
  const reqId = requirement.id;

  const requiredFranchises = requirement.requiredFranchises || [];
  const preferredFranchises = requirement.preferredFranchises || [];
  const targetFranchises = requiredFranchises.length > 0 ? requiredFranchises : preferredFranchises;

  const requiredCharacters = requirement.requiredCharacters || [];
  const mustHaveTerms = requirement.mustHaveTerms || [];

  const productFields = {
    title: product.title,
    description: product.description,
    brand: product.brand,
    specifications: product.specifications,
    sourceFacts: product.sourceFacts,
  };

  const productFullText = `${product.title} ${product.description || ""} ${product.brand || ""} ${Object.values(product.specifications || {}).join(" ")} ${(product.sourceFacts || []).join(" ")}`;

  // ─────────────────────────────────────────────────────────────
  // 1. Mandatory/Preferred Franchise & Entity Verification
  // ─────────────────────────────────────────────────────────────
  if (targetFranchises.length > 0) {
    let matchedFranchiseName: string | null = null;
    let matchedEntityType: "franchise" | "character" | "alias" | "organization" | "keyTerm" = "franchise";
    let matchedEntityName = "";
    let franchiseQuote = "";
    let franchiseField: RelevanceEvaluationResult["evidenceField"] = "none";

    for (const franchise of targetFranchises) {
      const matchResult = verifyTargetFranchiseInProduct(franchise, productFields);
      if (matchResult.isMatched) {
        matchedFranchiseName = matchResult.canonicalFranchise || franchise;
        matchedEntityType = matchResult.entityType || "franchise";
        matchedEntityName = matchResult.matchedEntity || matchedFranchiseName;
        franchiseQuote = matchResult.evidenceQuote || matchedEntityName;
        franchiseField = (matchResult.evidenceField as RelevanceEvaluationResult["evidenceField"]) || "title";
        break;
      }
    }

    // Criterion 8: Product title alone cannot override conflicting source metadata
    const metadataText = `${product.brand || ""} ${product.description || ""} ${Object.values(product.specifications || {}).join(" ")}`;
    const conflictingInMetadata = identifyFranchisesInText(metadataText).filter(
      (f) => !targetFranchises.some((rf) => rf.toLowerCase() === f.franchiseId.toLowerCase())
    );

    if (conflictingInMetadata.length > 0) {
      return {
        productId,
        requirementId: reqId,
        outcome: "unrelated",
        matchedFranchises: [],
        matchedCharacters: [],
        evidenceQuote: "",
        evidenceField: "none",
        isSubstitution: false,
        explanation: `Source metadata contradicts title: product metadata indicates "${conflictingInMetadata[0].canonicalName}" rather than required "${targetFranchises.join(", ")}"`,
        isEligible: false,
      };
    }

    // If required franchise was NOT found:
    if (!matchedFranchiseName) {
      // Check if product mentions an unrelated/conflicting franchise (e.g. Demon Slayer, Powerpuff Girls)
      const allFound = identifyFranchisesInText(productFullText);
      const conflicting = allFound.filter(
        (f) => !targetFranchises.some((rf) => rf.toLowerCase() === f.franchiseId.toLowerCase())
      );

      if (conflicting.length > 0) {
        return {
          productId,
          requirementId: reqId,
          outcome: "unrelated",
          matchedFranchises: [],
          matchedCharacters: [],
          evidenceQuote: "",
          evidenceField: "none",
          isSubstitution: false,
          explanation: `Mentions unrelated franchise "${conflicting[0].canonicalName}" instead of required "${targetFranchises.join(", ")}"`,
          isEligible: false,
        };
      }

      // Check if product represents a general anime theme
      if (isGeneralAnimeTheme(productFullText)) {
        if (requirement.allowGeneralAnimeFallback) {
          const categoryResult = checkProductCategoryMatch(product, requirement);
          if (categoryResult.isCategoryMatch || categoryResult.isSubstitution || requirement.allowAlternativeFormat) {
            return {
              productId,
              requirementId: reqId,
              outcome: "general_anime_theme",
              matchedFranchises: [],
              matchedCharacters: [],
              evidenceQuote: product.title,
              evidenceField: "title",
              isSubstitution: false,
              explanation: "General anime theme decoration without specific franchise branding.",
              isEligible: true,
            };
          }
        }
        return {
          productId,
          requirementId: reqId,
          outcome: "general_anime_theme",
          matchedFranchises: [],
          matchedCharacters: [],
          evidenceQuote: product.title,
          evidenceField: "title",
          isSubstitution: false,
          explanation: `Features general anime aesthetic, but does not match required franchise "${targetFranchises.join(", ")}"`,
          isEligible: false,
        };
      }

      // Neither franchise nor anime aesthetic -> generic unrelated product
      return {
        productId,
        requirementId: reqId,
        outcome: "unrelated",
        matchedFranchises: [],
        matchedCharacters: [],
        evidenceQuote: "",
        evidenceField: "none",
        isSubstitution: false,
        explanation: `Product does not contain evidence of required franchise "${targetFranchises.join(", ")}" or general anime theme.`,
        isEligible: false,
      };
    }

    // ─────────────────────────────────────────────────────────────
    // 2. Character Verification (if explicitly required)
    // ─────────────────────────────────────────────────────────────
    let matchedCharName: string | null = null;
    let charQuote = "";
    if (requiredCharacters.length > 0) {
      for (const char of requiredCharacters) {
        const charMatch = verifyTargetFranchiseInProduct(char, productFields);
        if (charMatch.isMatched) {
          matchedCharName = char;
          charQuote = charMatch.evidenceQuote || char;
          break;
        }
      }

      if (!matchedCharName) {
        return {
          productId,
          requirementId: reqId,
          outcome: "unrelated",
          matchedFranchises: [matchedFranchiseName],
          matchedCharacters: [],
          evidenceQuote: franchiseQuote,
          evidenceField: franchiseField,
          isSubstitution: false,
          explanation: `Matches franchise "${matchedFranchiseName}" but does not contain required character "${requiredCharacters.join(", ")}"`,
          isEligible: false,
        };
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 3. Must-Have Terms Check
    // ─────────────────────────────────────────────────────────────
    if (mustHaveTerms.length > 0) {
      const fullText = productFullText.toLowerCase();
      const missingTerms = mustHaveTerms.filter(
        (t) => !containsPhrase(fullText, t.toLowerCase()).found
      );
      if (missingTerms.length > 0) {
        return {
          productId,
          requirementId: reqId,
          outcome: "uncertain",
          matchedFranchises: [matchedFranchiseName],
          matchedCharacters: matchedCharName ? [matchedCharName] : [],
          evidenceQuote: franchiseQuote,
          evidenceField: franchiseField,
          isSubstitution: false,
          explanation: `Matches franchise "${matchedFranchiseName}" but missing required terms: ${missingTerms.join(", ")}`,
          isEligible: false,
        };
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 4. Category & Substitution Check
    // ─────────────────────────────────────────────────────────────
    const categoryResult = checkProductCategoryMatch(product, requirement);

    if (categoryResult.isCategoryMatch) {
      let outcome: RelevanceOutcome = "direct_franchise_match";
      if (matchedEntityType === "character") {
        outcome = "verified_character_match";
      } else if (matchedEntityType === "alias" || matchedEntityType === "organization") {
        outcome = "verified_franchise_alias_match";
      }

      return {
        productId,
        requirementId: reqId,
        outcome,
        matchedFranchises: [matchedFranchiseName],
        matchedCharacters: matchedCharName ? [matchedCharName] : (matchedEntityType === "character" ? [matchedEntityName] : []),
        evidenceQuote: charQuote || franchiseQuote,
        evidenceField: franchiseField,
        isSubstitution: false,
        explanation: `Direct match: Verified "${matchedFranchiseName}" (${matchedEntityName}) with authentic merchant offer.`,
        isEligible: true,
      };
    }

    if (categoryResult.isSubstitution) {
      return {
        productId,
        requirementId: reqId,
        outcome: "verified_same_franchise_substitute",
        matchedFranchises: [matchedFranchiseName],
        matchedCharacters: matchedCharName ? [matchedCharName] : (matchedEntityType === "character" ? [matchedEntityName] : []),
        evidenceQuote: charQuote || franchiseQuote,
        evidenceField: franchiseField,
        isSubstitution: true,
        substitutionCategory: categoryResult.matchedSub || "Alternative format",
        explanation: `Verified alternative format: Matches "${matchedFranchiseName}" in alternative decorative format (${categoryResult.matchedSub || 'alternative format'}).`,
        isEligible: true,
      };
    }

    // Franchise matches, but product category is completely incompatible
    return {
      productId,
      requirementId: reqId,
      outcome: "unrelated",
      matchedFranchises: [matchedFranchiseName],
      matchedCharacters: matchedCharName ? [matchedCharName] : [],
      evidenceQuote: franchiseQuote,
      evidenceField: franchiseField,
      isSubstitution: false,
      explanation: `Product matches "${matchedFranchiseName}" but is not a valid ${requirement.name} or allowed substitution format.`,
      isEligible: false,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Non-Franchise General Requirements (e.g. Standard PC builds)
  // ─────────────────────────────────────────────────────────────
  if (isGeneralAnimeTheme(productFullText)) {
    return {
      productId,
      requirementId: reqId,
      outcome: "general_anime_theme",
      matchedFranchises: [],
      matchedCharacters: [],
      evidenceQuote: product.title,
      evidenceField: "title",
      isSubstitution: false,
      explanation: `General anime-themed match for ${requirement.name}.`,
      isEligible: true,
    };
  }

  const categoryResult = checkProductCategoryMatch(product, requirement);
  if (categoryResult.isCategoryMatch) {
    return {
      productId,
      requirementId: reqId,
      outcome: "direct_match",
      matchedFranchises: [],
      matchedCharacters: [],
      evidenceQuote: product.title,
      evidenceField: "title",
      isSubstitution: false,
      explanation: `Direct match for ${requirement.name}.`,
      isEligible: true,
    };
  }

  if (categoryResult.isSubstitution) {
    return {
      productId,
      requirementId: reqId,
      outcome: "verified_substitute",
      matchedFranchises: [],
      matchedCharacters: [],
      evidenceQuote: product.title,
      evidenceField: "title",
      isSubstitution: true,
      substitutionCategory: categoryResult.matchedSub,
      explanation: `Verified alternative for ${requirement.name}.`,
      isEligible: true,
    };
  }

  return {
    productId,
    requirementId: reqId,
    outcome: "uncertain",
    matchedFranchises: [],
    matchedCharacters: [],
    evidenceQuote: product.title,
    evidenceField: "title",
    isSubstitution: false,
    explanation: `Does not match requested product purpose for ${requirement.name}.`,
    isEligible: false,
  };
}

/**
 * Filters a candidate list strictly to products that pass the relevance evaluation.
 */
export function filterEligibleCandidates(
  products: NormalizedProduct[],
  requirement: SetupRequirementItem
): {
  eligibleProducts: NormalizedProduct[];
  relevanceMap: Record<string, RelevanceEvaluationResult>;
  rejectedCount: number;
} {
  const eligibleProducts: NormalizedProduct[] = [];
  const relevanceMap: Record<string, RelevanceEvaluationResult> = {};
  let rejectedCount = 0;

  for (const product of products) {
    const id = product.sourceProductId || product.title;
    const evaluation = evaluateProductRelevance(product, requirement);
    relevanceMap[id] = evaluation;

    if (evaluation.isEligible) {
      eligibleProducts.push(product);
    } else {
      rejectedCount++;
    }
  }

  return { eligibleProducts, relevanceMap, rejectedCount };
}
