/**
 * Curated Entity and Franchise Registry for Theme-Aware Shopping.
 * Provides deterministic mapping between franchises, characters, organizations, and aliases.
 */

export interface FranchiseEntry {
  id: string; // e.g. "naruto"
  canonicalName: string; // e.g. "Naruto"
  aliases: string[]; // e.g. ["naruto", "shippuden", "naruto shippuden", "boruto"]
  characters: string[]; // e.g. ["naruto uzumaki", "sasuke uchiha", "kakashi"]
  organizations: string[]; // e.g. ["akatsuki", "konoha", "hidden leaf"]
  keyTerms: string[]; // e.g. ["sharingan", "rasengan", "hokage"]
}

export const ANIME_FRANCHISE_REGISTRY: Record<string, FranchiseEntry> = {
  naruto: {
    id: "naruto",
    canonicalName: "Naruto",
    aliases: [
      "naruto",
      "naruto shippuden",
      "shippuden",
      "boruto",
      "uzumaki",
    ],
    characters: [
      "naruto uzumaki",
      "uzumaki naruto",
      "sasuke uchiha",
      "uchiha sasuke",
      "kakashi hatake",
      "hatake kakashi",
      "itachi uchiha",
      "itachi",
      "sakura haruno",
      "hinata hyuga",
      "gaara",
      "jiraiya",
      "tsunade",
      "orochimaru",
      "minato namikaze",
      "madara uchiha",
      "obito uchiha",
      "pain",
      "nagato",
      "shikamaru nara",
      "rock lee",
      "might guy",
      "neji hyuga",
    ],
    organizations: [
      "akatsuki",
      "konoha",
      "hidden leaf",
      "leaf village",
      "anbu",
      "team 7",
      "sound village",
    ],
    keyTerms: [
      "sharingan",
      "rinnegan",
      "byakugan",
      "rasengan",
      "chidori",
      "hokage",
      "ninja",
      "shinobi",
      "kurama",
      "nine-tailed fox",
      "nine tails",
    ],
  },
  "one piece": {
    id: "one piece",
    canonicalName: "One Piece",
    aliases: [
      "one piece",
      "onepiece",
      "straw hat",
      "strawhat",
      "straw hats",
    ],
    characters: [
      "monkey d. luffy",
      "monkey d luffy",
      "luffy",
      "roronoa zoro",
      "zoro",
      "nami",
      "sanji",
      "vinsmoke sanji",
      "tony tony chopper",
      "chopper",
      "nico robin",
      "usopp",
      "sogeking",
      "franky",
      "brook",
      "jinbe",
      "jimbei",
      "portgas d. ace",
      "portgas d ace",
      "ace",
      "sabo",
      "trafalgar law",
      "trafalgar d. water law",
      "eustass kid",
      "shanks",
      "red-haired shanks",
      "gol d. roger",
      "whitebeard",
      "edward newgate",
      "blackbeard",
      "marshall d. teach",
      "kaido",
      "big mom",
      "donquixote doflamingo",
      "doflamingo",
      "boa hancock",
      "buggy the clown",
      "mihawk",
      "dracule mihawk",
      "yamato",
    ],
    organizations: [
      "straw hat pirates",
      "heart pirates",
      "red hair pirates",
      "whitebeard pirates",
      "marines",
      "world government",
      "revolutionary army",
      "cp9",
      "cp0",
    ],
    keyTerms: [
      "thousand sunny",
      "going merry",
      "gum-gum",
      "gomu gomu",
      "gear 5",
      "gear fourth",
      "gear 4",
      "haki",
      "devil fruit",
      "wano",
      "grand line",
      "pirate king",
      "wanted poster",
    ],
  },
  "attack on titan": {
    id: "attack on titan",
    canonicalName: "Attack on Titan",
    aliases: [
      "attack on titan",
      "shingeki no kyojin",
      "aot",
      "snk",
    ],
    characters: [
      "eren yeager",
      "eren jaeger",
      "eren",
      "mikasa ackerman",
      "mikasa",
      "levi ackerman",
      "captain levi",
      "levi",
      "armin arlert",
      "armin",
      "erwin smith",
      "commander erwin",
      "erwin",
      "hange zoe",
      "hanji zoe",
      "hange",
      "reiner braun",
      "reiner",
      "bertholdt hoover",
      "annie leonhart",
      "annie",
      "sasha braus",
      "connie springer",
      "jean kirstein",
      "historia reiss",
      "ymir",
      "zeke yeager",
    ],
    organizations: [
      "survey corps",
      "scouting legion",
      "scout regiment",
      "military police",
      "garrison regiment",
      "marley",
      "eldia",
      "yeagerists",
    ],
    keyTerms: [
      "wings of freedom",
      "colossal titan",
      "armored titan",
      "beast titan",
      "attack titan",
      "founding titan",
      "jaw titan",
      "war hammer titan",
      "cart titan",
      "female titan",
      "omni-directional mobility",
      "odm gear",
      "wall maria",
      "wall rose",
      "wall sina",
      "rumbling",
    ],
  },
  "demon slayer": {
    id: "demon slayer",
    canonicalName: "Demon Slayer",
    aliases: ["demon slayer", "kimetsu no yaiba", "kny"],
    characters: [
      "tanjiro kamado",
      "tanjiro",
      "nezuko kamado",
      "nezuko",
      "zenitsu agatsuma",
      "zenitsu",
      "inosuke hashibira",
      "inosuke",
      "kyojuro rengoku",
      "rengoku",
      "giyu tomioka",
      "giyu",
      "shinobu kocho",
      "tengen uzui",
      "muzan kibutsuji",
      "muzan",
    ],
    organizations: ["demon slayer corps", "hashira", "twelve kizuki"],
    keyTerms: ["nichirin blade", "sun breathing", "water breathing"],
  },
  "dragon ball": {
    id: "dragon ball",
    canonicalName: "Dragon Ball",
    aliases: ["dragon ball", "dragon ball z", "dbz", "dragon ball super"],
    characters: ["goku", "vegeta", "gohan", "piccolo", "trunks", "frieza", "cell", "majin buu"],
    organizations: ["z fighters", "red ribbon army"],
    keyTerms: ["kamehameha", "super saiyan", "dragon balls"],
  },
  "jujutsu kaisen": {
    id: "jujutsu kaisen",
    canonicalName: "Jujutsu Kaisen",
    aliases: ["jujutsu kaisen", "jjk"],
    characters: ["satoru gojo", "gojo", "yuji itadori", "itadori", "megumi fushiguro", "nobara kugisaki", "ryomen sukuna", "sukuna"],
    organizations: ["jujutsu tech"],
    keyTerms: ["domain expansion", "infinity", "cursed energy"],
  },
  "powerpuff girls": {
    id: "powerpuff_girls",
    canonicalName: "The Powerpuff Girls",
    aliases: ["powerpuff girls", "the powerpuff girls", "powerpuff"],
    characters: ["blossom", "bubbles", "buttercup", "mojo jojo", "professor utonium"],
    organizations: ["cartoon network"],
    keyTerms: ["chemical x", "townsville"],
  },
};

/**
 * Searches text for an exact whole-word or boundary-delimited phrase.
 */
export function containsPhrase(haystack: string, needle: string): { found: boolean; matchIndex: number; matchedText: string } {
  if (!haystack || !needle) return { found: false, matchIndex: -1, matchedText: "" };
  
  // Escape regex specials
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Require word boundary at start and end
  const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?:$|[^a-zA-Z0-9])`, "i");
  
  const match = regex.exec(haystack);
  if (!match) return { found: false, matchIndex: -1, matchedText: "" };

  const startIdx = match.index + (match[0].startsWith(needle.charAt(0)) ? 0 : 1);
  const matchedText = haystack.substring(startIdx, startIdx + needle.length);

  return { found: true, matchIndex: startIdx, matchedText };
}

export interface MatchedEntityDetails {
  franchiseId: string;
  canonicalName: string;
  matchedEntity: string;
  entityType: "franchise" | "character" | "organization" | "keyTerm";
  evidenceQuote: string;
}

/**
 * Scans candidate text against the curated registry and returns all matched franchises & characters.
 */
export function identifyFranchisesInText(text: string): MatchedEntityDetails[] {
  if (!text || text.trim().length === 0) return [];

  const results: MatchedEntityDetails[] = [];
  const lower = text.toLowerCase();

  for (const entry of Object.values(ANIME_FRANCHISE_REGISTRY)) {
    // 1. Check primary aliases
    for (const alias of entry.aliases) {
      const match = containsPhrase(lower, alias);
      if (match.found) {
        // Extract original casing quote
        const quote = text.substring(match.matchIndex, match.matchIndex + alias.length);
        results.push({
          franchiseId: entry.id,
          canonicalName: entry.canonicalName,
          matchedEntity: alias,
          entityType: "franchise",
          evidenceQuote: quote,
        });
        break; // One alias match per franchise is sufficient
      }
    }

    // 2. Check characters
    for (const char of entry.characters) {
      const match = containsPhrase(lower, char);
      if (match.found) {
        const quote = text.substring(match.matchIndex, match.matchIndex + char.length);
        results.push({
          franchiseId: entry.id,
          canonicalName: entry.canonicalName,
          matchedEntity: char,
          entityType: "character",
          evidenceQuote: quote,
        });
        break; // Primary character match
      }
    }

    // 3. Check key organizations
    for (const org of entry.organizations) {
      const match = containsPhrase(lower, org);
      if (match.found) {
        const quote = text.substring(match.matchIndex, match.matchIndex + org.length);
        results.push({
          franchiseId: entry.id,
          canonicalName: entry.canonicalName,
          matchedEntity: org,
          entityType: "organization",
          evidenceQuote: quote,
        });
        break;
      }
    }

    // 4. Check distinctive key terms
    for (const term of entry.keyTerms) {
      const match = containsPhrase(lower, term);
      if (match.found) {
        const quote = text.substring(match.matchIndex, match.matchIndex + term.length);
        results.push({
          franchiseId: entry.id,
          canonicalName: entry.canonicalName,
          matchedEntity: term,
          entityType: "keyTerm",
          evidenceQuote: quote,
        });
        break;
      }
    }
  }

  return results;
}

export interface TargetFranchiseVerificationResult {
  isMatched: boolean;
  matchedEntity?: string;
  entityType?: "franchise" | "character" | "alias" | "organization" | "keyTerm";
  canonicalFranchise?: string;
  evidenceQuote?: string;
  evidenceField?: string;
}

/**
 * Resolves whether a candidate product contains evidence for a specific target franchise.
 */
export function verifyTargetFranchiseInProduct(
  targetFranchise: string,
  productFields: {
    title: string;
    description?: string | null;
    brand?: string | null;
    specifications?: Record<string, string>;
    sourceFacts?: string[];
  }
): TargetFranchiseVerificationResult {
  const normTarget = targetFranchise.toLowerCase().trim();
  const entry = ANIME_FRANCHISE_REGISTRY[normTarget] || Object.values(ANIME_FRANCHISE_REGISTRY).find(
    (e) => e.canonicalName.toLowerCase() === normTarget || e.aliases.includes(normTarget)
  );

  const checkField = (val: string, fieldName: string) => {
    if (!val) return null;
    const lower = val.toLowerCase();

    // Check alias
    if (entry) {
      for (const alias of entry.aliases) {
        const match = containsPhrase(lower, alias);
        if (match.found) {
          const isDirect = alias.toLowerCase() === entry.canonicalName.toLowerCase() || alias.toLowerCase() === entry.id.toLowerCase();
          return {
            matchedEntity: alias,
            entityType: (isDirect ? "franchise" : "alias") as "franchise" | "alias",
            canonicalFranchise: entry.canonicalName,
            evidenceQuote: val.substring(match.matchIndex, match.matchIndex + alias.length),
            evidenceField: fieldName,
          };
        }
      }
      for (const char of entry.characters) {
        const match = containsPhrase(lower, char);
        if (match.found) {
          return {
            matchedEntity: char,
            entityType: "character" as const,
            canonicalFranchise: entry.canonicalName,
            evidenceQuote: val.substring(match.matchIndex, match.matchIndex + char.length),
            evidenceField: fieldName,
          };
        }
      }
      for (const org of entry.organizations) {
        const match = containsPhrase(lower, org);
        if (match.found) {
          return {
            matchedEntity: org,
            entityType: "organization" as const,
            canonicalFranchise: entry.canonicalName,
            evidenceQuote: val.substring(match.matchIndex, match.matchIndex + org.length),
            evidenceField: fieldName,
          };
        }
      }
      for (const term of entry.keyTerms) {
        const match = containsPhrase(lower, term);
        if (match.found) {
          return {
            matchedEntity: term,
            entityType: "keyTerm" as const,
            canonicalFranchise: entry.canonicalName,
            evidenceQuote: val.substring(match.matchIndex, match.matchIndex + term.length),
            evidenceField: fieldName,
          };
        }
      }
    } else {
      // General non-registered entity match
      const match = containsPhrase(lower, normTarget);
      if (match.found) {
        return {
          matchedEntity: normTarget,
          entityType: "franchise" as const,
          canonicalFranchise: targetFranchise,
          evidenceQuote: val.substring(match.matchIndex, match.matchIndex + normTarget.length),
          evidenceField: fieldName,
        };
      }
    }
    return null;
  };

  // 1. Check title first (highest priority)
  const titleMatch = checkField(productFields.title, "title");
  if (titleMatch) return { isMatched: true, ...titleMatch };

  // 2. Check brand
  if (productFields.brand) {
    const brandMatch = checkField(productFields.brand, "brand");
    if (brandMatch) return { isMatched: true, ...brandMatch };
  }

  // 3. Check source facts
  if (productFields.sourceFacts && productFields.sourceFacts.length > 0) {
    for (const fact of productFields.sourceFacts) {
      const factMatch = checkField(fact, "sourceFacts");
      if (factMatch) return { isMatched: true, ...factMatch };
    }
  }

  // 4. Check specifications
  if (productFields.specifications) {
    for (const [k, v] of Object.entries(productFields.specifications)) {
      const specMatch = checkField(`${k}: ${v}`, "specifications");
      if (specMatch) return { isMatched: true, ...specMatch };
    }
  }

  // 5. Check description
  if (productFields.description) {
    const descMatch = checkField(productFields.description, "description");
    if (descMatch) return { isMatched: true, ...descMatch };
  }

  return { isMatched: false };
}

/**
 * Normalizes duplicated terms in display names (e.g. "Naruto Naruto Uzumaki" -> "Naruto Uzumaki")
 */
export function normalizeEntityDisplayName(text: string): string {
  if (!text || typeof text !== "string") return "";
  const trimmed = text.trim();

  // Collapse consecutive identical words (case-insensitive)
  const tokens = trimmed.split(/\s+/);
  const normalizedTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i];
    const prev = normalizedTokens[normalizedTokens.length - 1];
    if (prev && prev.toLowerCase() === current.toLowerCase()) {
      continue;
    }
    normalizedTokens.push(current);
  }

  let cleaned = normalizedTokens.join(" ");

  // Collapse consecutive multi-word phrases like "One Piece One Piece"
  cleaned = cleaned.replace(/\b(One Piece)\s+(One Piece)\b/gi, "$1");
  cleaned = cleaned.replace(/\b(Attack on Titan)\s+(Attack on Titan)\b/gi, "$1");
  cleaned = cleaned.replace(/\b(Dragon Ball)\s+(Dragon Ball)\b/gi, "$1");
  cleaned = cleaned.replace(/\b(Demon Slayer)\s+(Demon Slayer)\b/gi, "$1");

  return cleaned;
}

const GENERAL_ANIME_KEYWORDS = [
  "anime",
  "manga",
  "japanese animation",
  "otaku",
  "chibi",
  "kawaii",
  "cosplay",
  "waifu",
  "shonen",
  "shoujo",
  "seinen",
  "light novel",
  "vocaloid",
  "hatsune miku",
  "studio ghibli",
];

/**
 * Checks whether text displays clear general Japanese anime/manga aesthetic markers.
 */
export function isGeneralAnimeTheme(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();
  for (const kw of GENERAL_ANIME_KEYWORDS) {
    if (containsPhrase(lower, kw).found) {
      return true;
    }
  }
  return false;
}
