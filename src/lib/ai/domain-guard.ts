import type { DomainScope } from "../../types/index.ts";

export const SPENDPILOT_REDIRECT_MESSAGE =
  "I'm designed for product discovery, comparisons and shopping decisions. Tell me what you're looking to buy, and I'll help you find the right option.";

export interface DomainGuardResult {
  scope: DomainScope;
  isAllowed: boolean;
  allowed: boolean;
  confidence: number;
  redirectMessage?: string;
  reason?: string;
}

/**
 * Common shopping and product indicators.
 * When present, technical or academic keywords (like python, math, student)
 * are recognized as legitimate shopping criteria rather than general requests.
 */
const SHOPPING_INDICATOR_PATTERNS = [
  /\b(buy|shop|shopping|purchase|order|price|cost|budget|under|\$|usd|eur|gbp|recommend|looking for|need|want|find|search|deal|sale|discount)\b/i,
  /\b(laptop|macbook|pc|desktop|gpu|graphics card|cpu|processor|ram|monitor|display|screen|keyboard|mouse|headphone|earbud|headset|sneaker|shoe|boot|jacket|shirt|hoodie|chair|desk|phone|smartphone|iphone|android|samsung|tv|camera|bedding|rug|decor|poster|figure|figurine)\b/i,
  /\b(size|color|colour|spec|specification|brand|model|version|edition|tier|upgrade|hardware|accessory|accessories)\b/i,
  /\b(cheaper|similar|alternative|compare|comparison|versus|vs|difference between|better for|which is better|recommendation)\b/i,
  /\b(the (?:first|second|third|fourth|1st|2nd|3rd|4th|last|other) (?:one|option|item|product|alternative))\b/i,
  /\b(this one|that one|show me|take this|choose this|add this)\b/i,
];

/**
 * Patterns that indicate obvious non-shopping general requests.
 * Checked ONLY when shopping indicators are ABSENT or clearly overridden.
 */
const DEFINITIVE_OUT_OF_SCOPE_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  // 1. Model identity / system queries
  {
    regex: /\b(?:which|what)\s+(?:ai\s+)?model\s+(?:are\s+you|is\s+this|runs\s+this|powers\s+you)\b/i,
    reason: "model_identity_query",
  },
  {
    regex: /\b(?:who\s+are\s+you|what\s+are\s+you|who\s+made\s+you|who\s+created\s+you|what\s+is\s+your\s+system\s+prompt|are\s+you\s+(?:chatgpt|claude|gemini))\b/i,
    reason: "system_identity_query",
  },
  // 2. Code generation & programming tasks (NOT shopping for a coding laptop)
  {
    regex: /\b(?:write|create|generate|code|debug|fix|implement)\s+(?:a|an|me\s+a|the)?\s*(?:python|javascript|typescript|c\+\+|java|rust|html|css|sql|bash|shell)?\s*(?:program|code|script|function|algorithm|class|method|app|regex|api route|quicksort)\b/i,
    reason: "code_generation_request",
  },
  {
    regex: /\b(?:quicksort|binary tree|api route in next\.js|script to scrape)\b/i,
    reason: "code_programming_phrase",
  },
  {
    regex: /^def\s+[a-zA-Z_]\w*\s*\(|^function\s+[a-zA-Z_]|^const\s+\w+\s*=\s*\(/i,
    reason: "raw_code_snippet",
  },
  // 3. Math homework / academic calculus solving
  {
    regex: /\b(?:solve|calculate|compute|integrate|differentiate|evaluate)\s+(?:this|my)?\s*(?:math|calculus|algebra|homework|equation|integral|derivative|derivative of|problem)\b/i,
    reason: "homework_solving_request",
  },
  {
    regex: /\b(?:calculus homework|math homework|solve for x|integral of|derivative of|calculus integral)\b/i,
    reason: "explicit_math_homework",
  },
  {
    regex: /\b(?:photosynthesis|mitosis|biology exam|chemistry exam|physics exam|french revolution)\b/i,
    reason: "academic_exam_query",
  },
  // 4. Creative writing, essays, stories, jokes, poems
  {
    regex: /\b(?:write|draft|compose)\s+(?:me\s+)?(?:an?\s+)?(?:essay|story|poem|song|cover letter|speech|article|novel|blog post)\b/i,
    reason: "creative_writing_request",
  },
  {
    regex: /\b(?:tell\s+me\s+(?:a\s+)?)?(?:random\s+|bedtime\s+|funny\s+)?(?:story|joke|riddle|pun|poem)\b/i,
    reason: "entertainment_request",
  },
  {
    regex: /\b(?:bedtime story|tell me a story|write a poem|write an essay|essay about|fictional dialogue)\b/i,
    reason: "creative_writing_phrase",
  },
  // 5. General history / trivia / unrelated world knowledge
  {
    regex: /\b(?:who\s+was|tell\s+me\s+about|what\s+happened\s+in|explain\s+the\s+history\s+of)\s+(?:napoleon|world war|cleopatra|caesar|the roman empire|the french revolution|the dinosaur|the solar system|quantum physics)\b/i,
    reason: "general_history_trivia",
  },
];

/**
 * Checks whether text contains authentic shopping indicators.
 */
export function hasShoppingIndicators(text: string): boolean {
  return SHOPPING_INDICATOR_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Determines whether the message is a shopping follow-up to an ongoing product result list.
 */
export function isShoppingFollowUp(text: string, hasActiveProducts = false): boolean {
  const followUpPatterns = [
    /\b(cheaper|similar|alternative|different|more expensive|lower price)\b/i,
    /\b(black|white|blue|red|green|grey|gray|gold|silver|pink|size|larger|smaller)\s+(?:one|version|option|color|colour)?\b/i,
    /\b(compare|comparison|versus|vs|difference between)\b/i,
    /\b(first|second|third|fourth|1st|2nd|3rd|4th|last)\s+(?:one|option|product|item|alternative)\b/i,
    /\b(suitable for|good for|work for|usable for|fit for)\b/i,
    /\b(replace|swap|switch|change|choose|select)\b/i,
    /\b(which\s+(?:of\s+these|one|option)|better|best|cushioning|comfort|performance|weight|battery)\b/i,
  ];

  const matchesPattern = followUpPatterns.some((p) => p.test(text));
  return matchesPattern && hasActiveProducts;
}

/**
 * Determines whether the message is asking for technical/product specification information.
 */
export function isProductInformationQuery(text: string): boolean {
  const infoPatterns = [
    /\b(?:difference between|compare|versus|vs)\s+.*\b(?:oled|ips|qled|lcd|mini-led|va|bluetooth|anc|wireless|wired|intel|amd|nvidia|rtx|gtx|apple silicon|m1|m2|m3|m4|ddr4|ddr5|nvme|ssd)\b/i,
    /\b(?:is|are)\s+\d+\s*(?:gb|tb)\s*(?:ram|storage|ssd|vram)?\s*(?:enough|sufficient|good|needed)\b/i,
    /\b(?:what is the best|recommended|good)\s+(?:material|fabric|sole|cushioning|sensor|switch|grip)\s+(?:for|in)\b/i,
    /\b(?:which|what)\s+(?:gpu|cpu|processor|graphics card|monitor|laptop|headphone|sneaker)\s+is\s+(?:better|best|suitable|recommended)\b/i,
    /\b(?:explain|tell me about)\s+(?:oled|ips|anc|refresh rate|dpi|hz|mechanical keyboard|cherry mx)\b/i,
    /\b(?:which\s+(?:of\s+these|one)?\s*(?:is|has)\s+(?:better|best|more|higher|lower|cushioning))\b/i,
  ];

  return infoPatterns.some((p) => p.test(text));
}

/**
 * Fast deterministic domain guard for SpendPilot.
 * Blocks obvious non-shopping prompts instantly without wasting LLM or Channel3 resources.
 * Allows legitimate technical shopping prompts (e.g., "laptop for Python", "GPU for 1440p gaming").
 */
export function evaluateDomainScope(
  message: string,
  hasActiveProducts = false
): DomainGuardResult {
  const trimmed = message.trim();

  if (!trimmed || trimmed.length < 2) {
    return {
      scope: "ambiguous_intent",
      isAllowed: false,
      allowed: false,
      confidence: 1.0,
      redirectMessage: "Please tell me what you're looking to shop for!",
      reason: "empty_or_too_short",
    };
  }

  // 1. Check for genuine shopping follow-ups on active products
  if (isShoppingFollowUp(trimmed, hasActiveProducts)) {
    return {
      scope: "shopping_follow_up",
      isAllowed: true,
      allowed: true,
      confidence: 1.0,
      reason: "active_product_follow_up",
    };
  }

  // 2. Check for legitimate product specification / educational information queries
  if (isProductInformationQuery(trimmed)) {
    return {
      scope: "product_information",
      isAllowed: true,
      allowed: true,
      confidence: 1.0,
      reason: "product_specification_query",
    };
  }

  // 3. Check definitive out-of-scope patterns FIRST
  for (const item of DEFINITIVE_OUT_OF_SCOPE_PATTERNS) {
    if (item.regex.test(trimmed)) {
      // Check if it's explicitly salvaged by a clear product purchase intent
      // E.g. "I need a laptop for Python programming" -> "laptop" + "need" salvages it
      const hasShoppingNoun = /\b(laptop|pc|computer|monitor|gpu|cpu|ram|phone|headphone|sneaker|shoe|desk|chair|device|hardware|buy|shop|purchase|price|budget|under \$\d+)\b/i.test(
        trimmed
      );

      if (hasShoppingNoun) {
        return {
          scope: "shopping_related",
          isAllowed: true,
          allowed: true,
          confidence: 0.9,
          reason: "salvaged_by_product_noun",
        };
      }

      return {
        scope: "out_of_scope",
        isAllowed: false,
        allowed: false,
        confidence: 1.0,
        redirectMessage: SPENDPILOT_REDIRECT_MESSAGE,
        reason: item.reason,
      };
    }
  }

  // 4. Check if prompt has clear shopping indicators
  if (hasShoppingIndicators(trimmed)) {
    return {
      scope: "shopping_related",
      isAllowed: true,
      allowed: true,
      confidence: 1.0,
      reason: "shopping_indicators_present",
    };
  }

  // 5. If no shopping indicators and no out-of-scope patterns, treat as ambiguous
  return {
    scope: "ambiguous_intent",
    isAllowed: false, // Cannot search immediately
    allowed: false,
    confidence: 1.0,
    redirectMessage: "Tell me what product or setup you are shopping for, and I'll find the best options.",
    reason: "ambiguous_needs_clarification",
  };
}

