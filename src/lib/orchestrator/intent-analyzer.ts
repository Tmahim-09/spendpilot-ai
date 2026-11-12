import type { ShoppingBrief, UserShoppingIntent } from "./types.ts";

export interface IntentAnalysisContext {
  userMessage: string;
  activeBrief?: ShoppingBrief | null;
  answeredQuestionId?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * Domain category signatures to detect topic switching.
 */
interface DomainCategory {
  id: string;
  keywords: string[];
}

const DOMAIN_CATEGORIES: DomainCategory[] = [
  {
    id: "laptop",
    keywords: ["laptop", "macbook", "notebook", "thinkpad", "chromebook", "ultrabook"],
  },
  {
    id: "gaming_pc",
    keywords: ["gaming pc", "desktop pc", "pc build", "rig", "computer tower", "gaming setup"],
  },
  {
    id: "room_decor",
    keywords: ["room decor", "decoration", "wall decor", "poster", "wall scroll", "decorations", "decorate my room", "anime room"],
  },
  {
    id: "audio",
    keywords: ["headphone", "headset", "earbuds", "airpods", "iem", "speakers"],
  },
  {
    id: "shoes",
    keywords: ["shoes", "sneakers", "boots", "running shoes", "runners", "footwear"],
  },
  {
    id: "phone",
    keywords: ["phone", "smartphone", "iphone", "pixel", "galaxy", "android phone"],
  },
  {
    id: "keyboard",
    keywords: ["keyboard", "keycaps", "mechanical keyboard"],
  },
  {
    id: "monitor",
    keywords: ["monitor", "display", "ultrawide monitor", "gaming monitor"],
  },
  {
    id: "chair",
    keywords: ["chair", "gaming chair", "office chair", "ergonomic chair", "desk chair", "armchair"],
  },
  {
    id: "desk",
    keywords: ["desk", "standing desk", "computer desk", "gaming desk", "table"],
  },
  {
    id: "furniture",
    keywords: ["sofa", "couch", "bookshelf", "bed", "dresser", "nightstand"],
  },
  {
    id: "skincare",
    keywords: ["skincare", "lotion", "body lotion", "moisturizer", "serum", "cleanser", "sunscreen"],
  },
  {
    id: "kitchen",
    keywords: ["coffee maker", "coffee machine", "espresso", "blender", "air fryer", "toaster", "microwave", "cookware"],
  },
  {
    id: "water_filtration",
    keywords: ["water filter", "water purifier", "filtration", "cartridge"],
  },
  {
    id: "camera",
    keywords: ["camera", "dslr", "mirrorless", "lens", "tripod"],
  },
  {
    id: "clothing",
    keywords: ["jacket", "coat", "hoodie", "shirt", "pants", "dress"],
  },
  {
    id: "musical_instruments",
    keywords: ["guitar", "piano", "keyboard piano", "drums", "microphone"],
  },
];

export function isDelegatedOrNoPreference(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return /\b(?:u\s+suggest|you\s+suggest|u\s+recommend|you\s+recommend|u\s+choose|you\s+choose|u\s+decide|you\s+decide|whatever\s+you\s+(?:think|suggest|recommend|choose)|up\s+to\s+you|no\s+preference|surprise\s+me|you\s+pick|recommend\s+for\s+me|your\s+choice|anything\s+(?:is\s+fine|works)|whatever\s+works|as\s+you\s+see\s+fit)\b/i.test(lower);
}

export function detectDomainFromText(text: string): string | null {
  const lower = text.toLowerCase();
  for (const cat of DOMAIN_CATEGORIES) {
    if (
      cat.keywords.some((kw) => {
        const regex = new RegExp(`\\b${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
        return regex.test(lower);
      })
    ) {
      return cat.id;
    }
  }
  return null;
}

/**
 * Checks if a user message is a pure conversational acknowledgement or expression of gratitude/agreement.
 */
export function isConversationalAcknowledgement(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim().toLowerCase().replace(/[!.?,]/g, "");
  const acknowledgements = new Set([
    "ok",
    "okay",
    "k",
    "thanks",
    "thank you",
    "thx",
    "great",
    "cool",
    "sounds good",
    "nice",
    "got it",
    "understood",
    "awesome",
    "perfect",
    "good",
    "sure",
    "alright",
    "yep",
    "yes",
    "fine",
    "no problem",
    "super",
    "looks good",
  ]);
  return acknowledgements.has(trimmed);
}

/**
 * Pure deterministic intent analyzer for user turns.
 * Identifies whether a turn starts a new task, refines existing requirements, answers questions, or asks product details.
 */
export function analyzeUserShoppingIntent(
  context: IntentAnalysisContext
): UserShoppingIntent {
  const { userMessage, activeBrief, answeredQuestionId } = context;
  const message = userMessage.trim();
  const lower = message.toLowerCase();

  // 1. Check for non-shopping / unrelated queries
  const nonShoppingTriggers = [
    /\b(?:write|generate)\s+(?:code|python|script|essay|poem|sql)\b/i,
    /\b(?:solve|calculate)\s+(?:my\s+)?(?:math|calculus|homework|integral|equation)\b/i,
    /\b(?:who\s+are\s+you|what\s+model|which\s+model|system\s+prompt)\b/i,
  ];
  if (nonShoppingTriggers.some((r) => r.test(message))) {
    return {
      type: "unrelated_query",
      confidence: 0.95,
      explanation: "User requested a non-shopping or out-of-domain action.",
    };
  }

  // 2. If no active brief or empty brief -> definitely start_new_task
  if (!activeBrief || activeBrief.productRequirements.length === 0) {
    return {
      type: "start_new_task",
      confidence: 1.0,
      explanation: "No active shopping task exists. Starting a new shopping task.",
    };
  }

  // 2b. Check for sequential shopping / new item addition phrases
  const sequentialItemTriggers = [
    /\b(?:i\s+also\s+need|also\s+(?:need|want|find|look\s+for|search\s+for|get|show)|can\s+you\s+also\s+find|next\s+(?:item|product|thing)|in\s+addition|another\s+(?:item|product)|now\s+(?:find|need|look\s+for|show)|what\s+about\s+(?:a|an)\b)/i,
  ];
  if (sequentialItemTriggers.some((r) => r.test(lower))) {
    return {
      type: "start_new_task",
      confidence: 0.98,
      explanation: "User requested an additional or sequential shopping item.",
    };
  }

  // 2c. User explicitly delegates choice to AI or states no preference ("u suggest", "you decide", "up to you")
  if (isDelegatedOrNoPreference(message)) {
    return {
      type: "refine_current_task",
      confidence: 0.99,
      explanation: "User delegated product preference choice to AI ('u suggest').",
      targetRequirementId: activeBrief.productRequirements[0]?.id,
    };
  }

  // 3. Explicit task-switching phrases ("Now help me...", "Instead find me...", "Now find me...", "Switch to...")
  const taskSwitchingPrefixes = [
    /^(?:now\s+(?:help\s+me|find|search|show|get|look for)|instead|change of plans|actually[,\s]+(?:let's|switch to|find)|switch\s+to|forget that[,\s]+find)\b/i,
  ];
  const hasTaskSwitchPrefix = taskSwitchingPrefixes.some((p) => p.test(lower));

  // Determine active brief's primary domain
  const existingGoalText = `${activeBrief.userGoal} ${activeBrief.productRequirements.map((r) => `${r.category} ${r.displayName} ${r.searchQuery}`).join(" ")}`;
  const currentDomain = detectDomainFromText(existingGoalText);
  const newDomain = detectDomainFromText(lower);

  // If a distinct new domain is detected and it contradicts current domain
  if (newDomain && currentDomain && newDomain !== currentDomain) {
    return {
      type: "start_new_task",
      confidence: 0.98,
      explanation: `Topic switched from ${currentDomain} to ${newDomain}. Establishing a fresh shopping task.`,
    };
  }

  if (hasTaskSwitchPrefix) {
    return {
      type: "start_new_task",
      confidence: 0.99,
      explanation: "Explicit task switch request detected.",
    };
  }

  // 4. Answering an active question
  if (answeredQuestionId) {
    return {
      type: "answer_question",
      confidence: 0.9,
      explanation: `User answered question ${answeredQuestionId}.`,
    };
  }

  // 5. Rejecting a suggestion ("no, not that", "none of these", "i don't like any", "reject that")
  if (
    /^(?:no|nope|neither|none|i don't like|reject|not that one|don't want that)\b/i.test(lower) &&
    lower.length < 50
  ) {
    return {
      type: "reject_suggestion",
      confidence: 0.85,
      explanation: "User rejected an AI suggestion or candidate option.",
    };
  }

  // 6. Product-specific question ("does it have...", "how many ports", "what is the battery life", "is it in stock")
  if (
    /\b(?:does it have|how many ports|is it in stock|what (?:is|are) the specs|what about the warranty|how much is shipping)\b/i.test(
      lower
    )
  ) {
    return {
      type: "ask_product_question",
      confidence: 0.85,
      explanation: "User asked a clarifying question regarding a product or specification.",
    };
  }

  // 6b. Conversational acknowledgement ("ok", "thanks", "great", "cool")
  if (isConversationalAcknowledgement(message)) {
    return {
      type: "unrelated_query",
      confidence: 0.95,
      explanation: "Conversational acknowledgement or appreciation.",
    };
  }

  // 7. Changing / adding constraints on current task ("with 1TB instead", "make it 16GB", "under $1000 instead", "in silver")
  const constraintModifiers = [
    /\b(?:with\s+\d+|instead|rather than|make it|change\s+to|what about\s+\d+|can i get (?:it|the same)|switch to\s+\d+|upgrade to)\b/i,
    /\b(?:\d+tb|\d+gb|silver|space gray|black|white|blue|windows|macos)\b/i,
  ];
  if (constraintModifiers.some((r) => r.test(lower))) {
    return {
      type: "refine_current_task",
      confidence: 0.92,
      explanation: "User is refining constraints on the active shopping task.",
      targetRequirementId: activeBrief.productRequirements[0]?.id,
    };
  }

  // 8. Default fallback for ongoing context
  return {
    type: "refine_current_task",
    confidence: 0.7,
    explanation: "User message contributes additional context to the active shopping task.",
    targetRequirementId: activeBrief.productRequirements[0]?.id,
  };
}
