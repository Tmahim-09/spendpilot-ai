/**
 * SpendPilot AI Central Shopping Orchestrator & Shopping Brief Domain Model
 * Versioned, validated data contracts for multi-agent shopping intelligence.
 */

export type ShoppingMode = "single_product" | "multi_product";

export type RequirementSource =
  | "user_explicit"
  | "user_confirmed"
  | "ai_suggested"
  | "application_default";

export type ConstraintStrength = "hard" | "soft";

export type TaskStatus =
  | "collecting"
  | "ready_to_search"
  | "searching"
  | "results_ready"
  | "needs_clarification"
  | "failed";

export type OrchestratorAction =
  | "respond"
  | "ask_question"
  | "update_requirements"
  | "start_product_search"
  | "refine_current_task"
  | "start_new_task"
  | "answer_product_question"
  | "reject_unrelated_request";

export type UserIntentType =
  | "start_new_task"
  | "refine_current_task"
  | "answer_question"
  | "ask_product_question"
  | "reject_suggestion"
  | "change_constraint"
  | "unrelated_query";

export interface Money {
  amountMinor: number;
  currency: string;
}

export interface ShoppingConstraint {
  id: string;
  key: string;
  value: string | number | boolean;
  strength: ConstraintStrength;
  source: RequirementSource;
  sourceMessageId?: string;
}

export interface ProductRequirement {
  id: string;
  category: string;
  displayName: string;
  searchQuery: string;
  quantity: number;
  purpose: string[];
  constraints: ShoppingConstraint[];
  excludedAttributes: string[];
  suggestedBudgetMinor?: number | null;
}

export interface ShoppingBrief {
  schemaVersion: 1;
  taskId: string;
  mode: ShoppingMode;
  userGoal: string;
  budget?: {
    minimum?: Money;
    maximum?: Money;
  };
  productRequirements: ProductRequirement[];
  missingInformation: string[];
  status: TaskStatus;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validated Patch Operations
// ─────────────────────────────────────────────────────────────────────────────

export type ShoppingBriefPatch =
  | {
      type: "create_requirement";
      requirement: ProductRequirement;
    }
  | {
      type: "update_requirement";
      requirementId: string;
      updates: Partial<Omit<ProductRequirement, "id">>;
    }
  | {
      type: "remove_requirement";
      requirementId: string;
    }
  | {
      type: "add_constraint";
      requirementId: string;
      constraint: ShoppingConstraint;
    }
  | {
      type: "update_constraint";
      requirementId: string;
      constraintId: string;
      updates: Partial<Omit<ShoppingConstraint, "id">>;
    }
  | {
      type: "remove_constraint";
      requirementId: string;
      constraintKeyOrId: string;
    }
  | {
      type: "set_budget";
      budget: {
        minimum?: Money;
        maximum?: Money;
      };
    }
  | {
      type: "set_mode";
      mode: ShoppingMode;
    }
  | {
      type: "set_user_goal";
      userGoal: string;
    }
  | {
      type: "set_missing_information";
      missingInformation: string[];
    }
  | {
      type: "set_status";
      status: TaskStatus;
    };

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator Turn Contracts
// ─────────────────────────────────────────────────────────────────────────────

export interface UserShoppingIntent {
  type: UserIntentType;
  confidence: number;
  explanation: string;
  targetRequirementId?: string;
}

export interface OrchestratorTurnInput {
  userMessage: string;
  activeBrief?: ShoppingBrief | null;
  activeSessionId: string;
  activeTaskId?: string | null;
  sourceMessageId?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  clientMessageId?: string;
  answeredQuestionId?: string;
}

export interface ClarificationOption {
  label: string;
  value: string;
}

export interface Clarification {
  questionId: string;
  attributeKey: string;
  question: string;
  options: ClarificationOption[];
}

export interface OrchestratorTurnResult {
  taskId: string;
  brief: ShoppingBrief;
  detectedIntent: UserShoppingIntent;
  patchesApplied: ShoppingBriefPatch[];
  rejectedPatches: Array<{ patch: unknown; reason: string }>;
  missingInformation: string[];
  isReadyForSearch: boolean;
  suggestedAction: OrchestratorAction;
  assistantMessage: string;
  clarification?: Clarification | null;
  question?: {
    id?: string;
    text: string;
    options?: Array<string | ClarificationOption>;
    attributeKey?: string;
  } | null;
  suggestedReplies?: string[];
  modelUsed?: string;
}

export interface Channel3AdaptedSearchRequest {
  requirementId: string;
  category: string;
  searchQuery: string;
  minPriceMinor?: number | null;
  maxPriceMinor?: number | null;
  currency: string;
  hardConstraints: Record<string, string | number | boolean>;
  excludedAttributes: string[];
}

