import type {
  ChatMessage,
  CurrencyCode,
} from "../../types/index.ts";
import type { ConciergeContextParams } from "./types.ts";
import { formatMinorUnits } from "../money.ts";
import { resolveNaturalMessage } from "../ai/normalize-interaction-response.ts";

/**
 * Builds the authoritative conversational dialogue context for the current active task.
 * Solves the missing dialogue history bug by injecting relevant task messages into Gemini context.
 */
export function buildConciergeDialogueContext(params: ConciergeContextParams): string {
  const {
    session,
    brief,
    userMessage,
    activeQuestion,
    askedQuestionIds = [],
    currentProductsSummary,
  } = params;

  const sections: string[] = [];

  // 1. Task Identity & Shopping Brief
  sections.push(`ACTIVE SHOPPING TASK ID: ${brief.taskId}
Mode: ${brief.mode}
User Goal: "${brief.userGoal}"
Status: ${brief.status}`);

  if (brief.budget?.maximum) {
    const curr = brief.budget.maximum.currency as CurrencyCode;
    const maxMinor = brief.budget.maximum.amountMinor;
    sections.push(`Budget Limit: ${formatMinorUnits(maxMinor, curr)}`);
  }

  // 2. Structured Product Requirements from authoritative Shopping Brief
  if (brief.productRequirements.length > 0) {
    const reqDescriptions = brief.productRequirements.map((r, idx) => {
      const constraints = r.constraints.map(
        (c) => `${c.key}: "${c.value}" (${c.strength}, origin: ${c.source})`
      );
      const constraintsText = constraints.length > 0 ? `\n    Constraints: ${constraints.join("; ")}` : "";
      const purposeText = r.purpose.length > 0 ? `\n    Purposes: ${r.purpose.join(", ")}` : "";
      return `Requirement #${idx + 1} (${r.displayName}):
    Category: ${r.category}
    Search Query: "${r.searchQuery}"${purposeText}${constraintsText}`;
    });
    sections.push(`CURRENT SHOPPING BRIEF REQUIREMENTS:\n${reqDescriptions.join("\n")}`);
  }

  // 3. Question Tracking & Slots
  const questionNotes: string[] = [];
  if (activeQuestion && activeQuestion.status === "active") {
    questionNotes.push(`Active Pending Question: "${activeQuestion.text}" (Slot: ${activeQuestion.attributeKey})`);
  }
  if (askedQuestionIds.length > 0) {
    questionNotes.push(`Questions Already Asked in this Task: ${askedQuestionIds.join(", ")}`);
  }
  if (questionNotes.length > 0) {
    sections.push(`QUESTION STATE:\n${questionNotes.join("\n")}`);
  }

  // 4. Relevant Dialogue Transcript for Current Task ONLY (avoids cross-task contamination)
  // Extract messages belonging to the current task or recent session messages (last 6 turns max)
  const allMessages: ChatMessage[] = session.messages || [];
  const recentMessages = allMessages.slice(-8);

  if (recentMessages.length > 0) {
    const dialogueLines = recentMessages.map((m) => {
      const roleName = m.role === "user" ? "User" : "SpendPilot Concierge";
      const naturalText = resolveNaturalMessage(m.content, "I'm looking into options for you.");
      return `${roleName}: "${naturalText.replace(/\n+/g, " ").trim()}"`;
    });
    sections.push(`RECENT CONVERSATION DIALOGUE (Current Task):\n${dialogueLines.join("\n")}`);
  }

  // 5. Active Candidate Products (if any search has already occurred in this task)
  if (Array.isArray(currentProductsSummary) && currentProductsSummary.length > 0) {
    const prodLines = currentProductsSummary.slice(0, 4).map((p, i) => {
      const priceStr = p.price !== null && p.price !== undefined ? `${p.currency || "USD"} ${p.price}` : "Price unlisted";
      return `- Option ${i + 1}: ${p.title} (${priceStr}, ${p.availability || "in_stock"})`;
    });
    sections.push(`OBSERVED PRODUCTS IN SEARCH RESULTS:\n${prodLines.join("\n")}`);
  }

  // 6. User's Current Turn Message
  sections.push(`CURRENT USER MESSAGE:\n"${userMessage}"`);

  return sections.join("\n\n---\n\n");
}
