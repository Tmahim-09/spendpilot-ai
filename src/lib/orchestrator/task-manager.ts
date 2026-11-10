import type { ShoppingBrief, ShoppingMode, UserShoppingIntent } from "./types.ts";

/**
 * Generates an isolated, traceable task ID.
 */
export function generateTaskId(): string {
  const timestamp = Date.now().toString(36);
  const entropy = Math.random().toString(36).slice(2, 8);
  return `task_${timestamp}_${entropy}`;
}

/**
 * Creates a clean, empty Shopping Brief for a new shopping task.
 * Guarantees schemaVersion: 1 and zero state carryover.
 */
export function createInitialShoppingBrief(params?: {
  taskId?: string;
  userGoal?: string;
  mode?: ShoppingMode;
  currency?: string;
}): ShoppingBrief {
  const taskId = params?.taskId || generateTaskId();
  const userGoal = params?.userGoal?.trim() || "Initial shopping inquiry";
  const mode: ShoppingMode = params?.mode || "single_product";
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    taskId,
    mode,
    userGoal,
    productRequirements: [],
    missingInformation: [],
    status: "collecting",
    updatedAt: now,
  };
}

/**
 * Resolves the active Shopping Brief based on user intent.
 * When intent is 'start_new_task', guarantees complete isolation:
 * - Creates a fresh task ID
 * - Creates a fresh Shopping Brief
 * - Discards all old requirements, constraints, and allocations
 */
export function resolveActiveBriefForTurn(
  currentBrief: ShoppingBrief | null | undefined,
  intent: UserShoppingIntent,
  userMessage: string
): { brief: ShoppingBrief; isNewTask: boolean } {
  if (!currentBrief || intent.type === "start_new_task" || currentBrief.productRequirements.length === 0) {
    const newBrief = createInitialShoppingBrief({
      userGoal: userMessage,
    });
    return {
      brief: newBrief,
      isNewTask: true,
    };
  }

  return {
    brief: currentBrief,
    isNewTask: false,
  };
}
