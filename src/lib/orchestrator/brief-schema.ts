import { z } from "zod";
import type {
  ShoppingBrief,
  ShoppingBriefPatch,
} from "./types.ts";

export const ALLOWED_CURRENCY_CODES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"] as const;

export const MoneySchema = z
  .object({
    amountMinor: z
      .number()
      .int("amountMinor must be an integer")
      .nonnegative("amountMinor must be non-negative"),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .refine(
        (val) => (ALLOWED_CURRENCY_CODES as readonly string[]).includes(val),
        {
          message: `Currency must be one of: ${ALLOWED_CURRENCY_CODES.join(", ")}`,
        }
      ),
  })
  .strict();

export const ConstraintStrengthSchema = z.enum(["hard", "soft"]);

export const RequirementSourceSchema = z.enum([
  "user_explicit",
  "user_confirmed",
  "ai_suggested",
  "application_default",
]);

export const TaskStatusSchema = z.enum([
  "collecting",
  "ready_to_search",
  "searching",
  "results_ready",
  "needs_clarification",
  "failed",
]);

export const ShoppingModeSchema = z.enum(["single_product", "multi_product"]);

export const ShoppingConstraintSchema = z
  .object({
    id: z.string().min(1, "Constraint id is required"),
    key: z.string().min(1, "Constraint key is required"),
    value: z.union([z.string(), z.number(), z.boolean()]),
    strength: ConstraintStrengthSchema,
    source: RequirementSourceSchema,
    sourceMessageId: z.string().optional(),
  })
  .strict();

export const ProductRequirementSchema = z
  .object({
    id: z.string().min(1, "Requirement id is required"),
    category: z.string().min(1, "Category is required"),
    displayName: z.string().min(1, "Display name is required"),
    searchQuery: z.string().min(1, "Search query is required"),
    quantity: z.number().int().positive().default(1),
    purpose: z.array(z.string()).default([]),
    constraints: z.array(ShoppingConstraintSchema).default([]),
    excludedAttributes: z.array(z.string()).default([]),
    suggestedBudgetMinor: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

export const ShoppingBriefSchema = z
  .object({
    schemaVersion: z.literal(1),
    taskId: z.string().min(1, "taskId is required"),
    mode: ShoppingModeSchema,
    userGoal: z.string().min(1, "userGoal is required"),
    budget: z
      .object({
        minimum: MoneySchema.optional(),
        maximum: MoneySchema.optional(),
      })
      .refine(
        (b) => {
          if (b.minimum && b.maximum) {
            if (b.minimum.currency !== b.maximum.currency) return false;
            return b.minimum.amountMinor <= b.maximum.amountMinor;
          }
          return true;
        },
        { message: "Minimum budget cannot exceed maximum budget and currencies must match" }
      )
      .optional(),
    productRequirements: z.array(ProductRequirementSchema).default([]),
    missingInformation: z.array(z.string()).default([]),
    status: TaskStatusSchema,
    updatedAt: z.string().min(1, "updatedAt is required"),
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────────────
// Validated Patch Schema
// ─────────────────────────────────────────────────────────────────────────────

export const ShoppingBriefPatchSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_requirement"),
    requirement: ProductRequirementSchema,
  }),
  z.object({
    type: z.literal("update_requirement"),
    requirementId: z.string().min(1),
    updates: ProductRequirementSchema.omit({ id: true, constraints: true }).partial(),
  }),
  z.object({
    type: z.literal("remove_requirement"),
    requirementId: z.string().min(1),
  }),
  z.object({
    type: z.literal("add_constraint"),
    requirementId: z.string().min(1),
    constraint: ShoppingConstraintSchema,
  }),
  z.object({
    type: z.literal("update_constraint"),
    requirementId: z.string().min(1),
    constraintId: z.string().min(1),
    updates: ShoppingConstraintSchema.omit({ id: true }).partial(),
  }),
  z.object({
    type: z.literal("remove_constraint"),
    requirementId: z.string().min(1),
    constraintKeyOrId: z.string().min(1),
  }),
  z.object({
    type: z.literal("set_budget"),
    budget: z.object({
      minimum: MoneySchema.optional(),
      maximum: MoneySchema.optional(),
    }),
  }),
  z.object({
    type: z.literal("set_mode"),
    mode: ShoppingModeSchema,
  }),
  z.object({
    type: z.literal("set_user_goal"),
    userGoal: z.string().min(1),
  }),
  z.object({
    type: z.literal("set_missing_information"),
    missingInformation: z.array(z.string()),
  }),
  z.object({
    type: z.literal("set_status"),
    status: TaskStatusSchema,
  }),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Validation Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function validateShoppingBrief(data: unknown): {
  success: boolean;
  brief?: ShoppingBrief;
  errors?: string[];
} {
  const result = ShoppingBriefSchema.safeParse(data);
  if (result.success) {
    return { success: true, brief: result.data as ShoppingBrief };
  }
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

export function validateShoppingBriefPatch(data: unknown): {
  success: boolean;
  patch?: ShoppingBriefPatch;
  error?: string;
} {
  const result = ShoppingBriefPatchSchema.safeParse(data);
  if (result.success) {
    return { success: true, patch: result.data as ShoppingBriefPatch };
  }
  return {
    success: false,
    error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  };
}
