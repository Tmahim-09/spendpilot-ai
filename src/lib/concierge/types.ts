import type {
  ShoppingBrief,
  OrchestratorAction,
  UserShoppingIntent,
} from "../orchestrator/types.ts";
import type {
  AuthoritativeShoppingSession,
  ChatMessage,
} from "../../types/index.ts";

export type QuestionStatus = "active" | "answered" | "skipped" | "superseded";

export interface PendingQuestionOption {
  id: string;
  label: string;
  value: string;
}

export interface PendingQuestion {
  id: string;
  requirementId?: string;
  attributeKey: string;
  text: string;
  options: PendingQuestionOption[];
  createdAt: number;
  status: QuestionStatus;
}

export interface ConciergeDialogueMessage {
  role: "user" | "assistant";
  content: string;
  taskId?: string;
  timestamp?: number;
}

export interface ConciergeContextParams {
  session: AuthoritativeShoppingSession;
  brief: ShoppingBrief;
  userMessage: string;
  activeQuestion?: PendingQuestion | null;
  askedQuestionIds?: string[];
  currentProductsSummary?: Array<{
    id?: string;
    sourceProductId?: string | null;
    title: string;
    price?: number | null;
    currency?: string;
    brand?: string | null;
    availability?: string;
  }>;
}

export type ConciergeStreamEvent =
  | {
      type: "start";
      turnId: string;
      taskId: string;
    }
  | {
      type: "brief";
      brief: ShoppingBrief;
      taskId: string;
    }
  | {
      type: "delta";
      text: string;
    }
  | {
      type: "question";
      question: PendingQuestion | null;
    }
  | {
      type: "action";
      action: OrchestratorAction;
      canSearch: boolean;
      shouldExecuteSearch: boolean;
    }
  | {
      type: "done";
      turnId: string;
      taskId: string;
      fullText: string;
      session: AuthoritativeShoppingSession;
      canSearch?: boolean;
      shouldExecuteSearch?: boolean;
      action?: OrchestratorAction;
    }
  | {
      type: "error";
      error: string;
      partialText?: string;
      canRetry: boolean;
      session?: AuthoritativeShoppingSession;
    };

export interface ConciergeTurnResult {
  turnId: string;
  taskId: string;
  assistantMessage: ChatMessage;
  brief: ShoppingBrief;
  intent: UserShoppingIntent;
  pendingQuestion: PendingQuestion | null;
  action: OrchestratorAction;
  canSearch: boolean;
  shouldExecuteSearch: boolean;
  session: AuthoritativeShoppingSession;
}
