/**
 * Deterministic Lightweight Intent Gate for SpendPilot AI
 *
 * Fast, zero-LLM classification to identify clearly non-shopping prompts
 * and provide witty, playful responses without consuming Channel3 or Gemini API credits.
 */

export type NonShoppingCategory =
  | "code_generation"
  | "math_homework"
  | "jokes_humor"
  | "creative_writing"
  | "science_trivia"
  | "general_chit_chat";

export interface IntentGateResult {
  isShopping: boolean;
  category?: NonShoppingCategory;
  playfulResponse?: string;
  suggestedProducts?: string[];
}

// Strong product keywords & categories: if present, request is ALWAYS considered shopping!
const PRODUCT_NOUNS = [
  "laptop", "notebook", "macbook", "pc", "computer", "desktop",
  "mouse", "trackpad", "keyboard", "keycap", "keycaps",
  "monitor", "screen", "display", "webcam", "camera", "microphone", "mic",
  "headphone", "headphones", "headset", "earbuds", "earphones", "speaker", "speakers", "soundbar",
  "desk", "chair", "stand", "mount", "mat", "pad",
  "cable", "charger", "adapter", "hub", "dock", "battery", "power bank",
  "phone", "smartphone", "iphone", "android", "case", "tablet", "ipad", "kindle", "ereader",
  "watch", "smartwatch", "tracker",
  "backpack", "bag", "sleeve", "briefcase",
  "book", "calculator", "pen", "notebook", "stationery",
  "shoes", "sneakers", "jacket", "hoodie", "shirt", "pants", "clothes",
  "drive", "ssd", "hdd", "storage", "ram", "gpu", "graphics card", "cpu", "processor",
  "router", "modem", "wifi",
  "console", "playstation", "xbox", "nintendo", "switch", "controller",
  "air fryer", "blender", "coffee", "maker", "vacuum", "gadget", "device", "gear",
];

// Explicit shopping intent verbs & price indicators
const SHOPPING_INTENT_PATTERNS = [
  /\b(buy|purchase|shop|order|browse|find|search|get me|show me|recommend|looking for|want to buy)\b/i,
  /\b(price|pricing|cost|costs|budget|cheap|affordable|discount|deal|deals|coupon|sale)\b/i,
  /\b(under|below|less than|max|maximum|at most|up to)\s*[$€£]?\s*\d+/i,
  /[$€£]\s*\d+/,
  /\b\d+\s*(dollars|bucks|euros|pounds)\b/i,
  /\b(best|top-rated|reliable|ergonomic|wireless|bluetooth|portable|compact)\b/i,
  /\b(review|reviews|versus|vs|compare)\b/i,
];

// Playful response banks with attitude
const WITTY_RESPONSES: Record<NonShoppingCategory, string[]> = {
  code_generation: [
    "Python code? I'm a shopping agent, not Stack Overflow wearing a shopping cart. Tell me what hardware or gear you're looking to buy and I'll do my thing.",
    "I debug checkout flows, not syntax errors. If you need a high-spec developer laptop or a mechanical keyboard to write that code, name your budget!",
    "Compiling... Error 404: Code generation not in stock. But if you're shopping for coding peripherals or monitors, I'm ready.",
  ],
  math_homework: [
    "Calculus? I calculate budgets, not your GPA. Need a scientific calculator or a quiet study keyboard? Now we're shopping.",
    "Derivatives give me headaches, but deriving discounts on student electronics? That's my sweet spot. What do you need to buy?",
    "I balance shopping carts, not algebraic equations. Tell me what school gear or tech you're hunting for and let's talk numbers.",
  ],
  jokes_humor: [
    "My budget is for products, not punchlines. Give me a shopping mission and I'll try not to disappoint your wallet.",
    "Why did the shopper cross the road? To snag 20% off retail. That's all you get from me—now what are we buying?",
    "I only know one joke: paying full retail price. Name an item you want and let's find a genuine deal.",
  ],
  creative_writing: [
    "Roses are red, discounts are sweet, tell me what you're shopping for and I'll find a neat treat. (That's my only poem—what product do you need?)",
    "I'm a shopping specialist, not Shakespeare. Tell me what gear or gadget you want and I'll compose a great deal.",
    "Once upon a time, a shopper found the best price under budget. Want to make that story real? Give me an item.",
  ],
  science_trivia: [
    "Quantum mechanics? The only entanglement I handle is cable management on desks. Looking for an ergonomic setup?",
    "The universe may be expanding, but your budget doesn't have to. Tell me what product you're hunting for and let's get shopping.",
    "Fascinating topic! Sadly, my neural circuits are strictly calibrated for consumer commerce. What item can I find for you?",
  ],
  general_chit_chat: [
    "Hello! I'm SpendPilot AI, your budget-focused shopping assistant. Tell me what product or setup you're looking to buy today!",
    "Ready for a shopping mission. Name a product you need and optional budget limit, and I'll search verified merchant deals.",
  ],
};

const SUGGESTED_SHOPPING_PROMPTS = [
  "Ergonomic wireless mouse under $40",
  "Mechanical keyboard with quiet switches under $80",
  "Adjustable aluminum laptop stand under $35",
  "Noise cancelling wireless headphones under $100",
];

/**
 * Checks whether user input contains recognizable shopping intent.
 */
function hasProductOrShoppingIntent(text: string): boolean {
  const lower = text.toLowerCase();

  // Check product nouns
  for (const noun of PRODUCT_NOUNS) {
    const nounRegex = new RegExp(`\\b${noun}s?\\b`, "i");
    if (nounRegex.test(lower)) {
      return true;
    }
  }

  // Check shopping intent patterns
  for (const pattern of SHOPPING_INTENT_PATTERNS) {
    if (pattern.test(lower)) {
      return true;
    }
  }

  return false;
}

/**
 * Deterministically evaluates user input to filter out clearly non-shopping prompts
 * and provide witty, playful feedback without calling any LLM.
 */
export function evaluateShoppingIntentGate(input: string): IntentGateResult {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // If input is empty or very short, treat as ambiguous chit-chat
  if (trimmed.length < 3) {
    return {
      isShopping: false,
      category: "general_chit_chat",
      playfulResponse: WITTY_RESPONSES.general_chit_chat[0],
      suggestedProducts: SUGGESTED_SHOPPING_PROMPTS,
    };
  }

  // Priority Check 1: If input contains any product noun or shopping pattern,
  // it is ALWAYS classified as a valid shopping request!
  if (hasProductOrShoppingIntent(trimmed)) {
    return {
      isShopping: true,
    };
  }

  // Check 2: Code generation
  if (
    /\b(debug|fix|write|create|generate)\b.*\b(code|script|program|function|algorithm|bug|regex)\b/i.test(lower) ||
    /^(write|create|generate|give me|debug|fix)\s+(a\s+|my\s+|this\s+|the\s+)?(python|javascript|typescript|c\+\+|java|rust|go|html|css|sql|bash|code|script|program|function|class|algorithm|regex|app|api)/i.test(lower) ||
    /\b(print\(|console\.log|def\s+\w+|function\s+\w+|import\s+\w+)/i.test(lower) ||
    /^(how do i write|help me code|teach me python)/i.test(lower)
  ) {
    const responses = WITTY_RESPONSES.code_generation;
    const picked = responses[Math.abs(hashString(lower)) % responses.length];
    return {
      isShopping: false,
      category: "code_generation",
      playfulResponse: picked,
      suggestedProducts: [
        "High-performance laptop for coding",
        "Mechanical keyboard suitable for programming",
        "Dual monitor arm for developer setup",
      ],
    };
  }

  // Check 3: Math & Homework
  if (
    /^(solve|calculate|compute|help with|do my)\s+(this|my)?\s*(math|calculus|algebra|geometry|physics|homework|equation|derivative|integral)/i.test(lower) ||
    /\b(calculus homework|math problem|quadratic equation|derivative of)\b/i.test(lower) ||
    /^what is \d+\s*[\+\-\*\/]\s*\d+$/i.test(lower)
  ) {
    const responses = WITTY_RESPONSES.math_homework;
    const picked = responses[Math.abs(hashString(lower)) % responses.length];
    return {
      isShopping: false,
      category: "math_homework",
      playfulResponse: picked,
      suggestedProducts: [
        "Scientific graphing calculator for calculus",
        "Comfortable desk lamp for studying",
        "Noise cancelling headphones for library focus",
      ],
    };
  }

  // Check 4: Jokes & Humor
  if (
    /\b(tell me a joke|tell a joke|make me laugh|say something funny|know any jokes|random joke)\b/i.test(lower)
  ) {
    const responses = WITTY_RESPONSES.jokes_humor;
    const picked = responses[Math.abs(hashString(lower)) % responses.length];
    return {
      isShopping: false,
      category: "jokes_humor",
      playfulResponse: picked,
      suggestedProducts: SUGGESTED_SHOPPING_PROMPTS,
    };
  }

  // Check 5: Creative Writing & Poetry
  if (
    /^(write|compose|generate)\s+(me\s+)?(a\s+)?(poem|story|haiku|essay|song|rap|novel|letter)/i.test(lower) ||
    /\b(rhyme about|write a love letter|write an essay)\b/i.test(lower)
  ) {
    const responses = WITTY_RESPONSES.creative_writing;
    const picked = responses[Math.abs(hashString(lower)) % responses.length];
    return {
      isShopping: false,
      category: "creative_writing",
      playfulResponse: picked,
      suggestedProducts: SUGGESTED_SHOPPING_PROMPTS,
    };
  }

  // Check 6: Science, Trivia, Philosophy
  if (
    /^(explain|describe|tell me about|what is|how does|why is)\s+(the\s+)?(theory of\s+)?(quantum|relativity|gravity|photosynthesis|black hole|the universe|the meaning of life|inflation|capitalism)/i.test(lower) ||
    /\b(quantum mechanics|theory of relativity|meaning of life)\b/i.test(lower) ||
    /^(who was|who is the president|who won the)/i.test(lower)
  ) {
    const responses = WITTY_RESPONSES.science_trivia;
    const picked = responses[Math.abs(hashString(lower)) % responses.length];
    return {
      isShopping: false,
      category: "science_trivia",
      playfulResponse: picked,
      suggestedProducts: SUGGESTED_SHOPPING_PROMPTS,
    };
  }

  // Check 7: Greetings & General Chit-chat
  if (
    /^(hi|hello|hey|yo|howdy|good morning|good evening|test|ping|who are you|what can you do)[\s!.]*$/i.test(lower)
  ) {
    const responses = WITTY_RESPONSES.general_chit_chat;
    const picked = responses[Math.abs(hashString(lower)) % responses.length];
    return {
      isShopping: false,
      category: "general_chit_chat",
      playfulResponse: picked,
      suggestedProducts: SUGGESTED_SHOPPING_PROMPTS,
    };
  }

  // If no negative non-shopping pattern matched, treat as an acceptable shopping query
  // so we never block legitimate, nuanced product queries!
  return {
    isShopping: true,
  };
}

/**
 * Deterministic hash for picking consistent yet diverse responses
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
