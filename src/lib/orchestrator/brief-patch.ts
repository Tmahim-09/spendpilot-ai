import type {
  ShoppingBrief,
  ShoppingBriefPatch,
  ProductRequirement,
  ShoppingConstraint,
} from "./types.ts";
import {
  validateShoppingBriefPatch,
  validateShoppingBrief,
} from "./brief-schema.ts";

export interface PatchApplicationResult {
  brief: ShoppingBrief;
  applied: ShoppingBriefPatch[];
  rejected: Array<{ patch: unknown; reason: string }>;
}

/**
 * Applies a single validated patch to a Shopping Brief.
 * Throws an Error with a descriptive reason if the patch cannot be applied safely.
 */
export function applyBriefPatch(
  brief: ShoppingBrief,
  rawPatch: unknown
): ShoppingBrief {
  const validation = validateShoppingBriefPatch(rawPatch);
  if (!validation.success || !validation.patch) {
    throw new Error(`Invalid patch structure: ${validation.error || "schema validation failed"}`);
  }

  const patch = validation.patch;
  const now = new Date().toISOString();

  switch (patch.type) {
    case "create_requirement": {
      const existing = brief.productRequirements.find((r) => r.id === patch.requirement.id);
      if (existing) {
        throw new Error(`Requirement with id '${patch.requirement.id}' already exists.`);
      }
      return {
        ...brief,
        productRequirements: [...brief.productRequirements, patch.requirement],
        updatedAt: now,
      };
    }

    case "update_requirement": {
      const index = brief.productRequirements.findIndex((r) => r.id === patch.requirementId);
      if (index === -1) {
        throw new Error(`Cannot update requirement: id '${patch.requirementId}' not found.`);
      }
      const existing = brief.productRequirements[index];
      const updatedReq: ProductRequirement = {
        ...existing,
        ...patch.updates,
        id: existing.id, // Immutable ID
        constraints: existing.constraints, // Constraints are strictly managed via add_constraint/remove_constraint
        purpose: patch.updates.purpose && patch.updates.purpose.length > 0
          ? Array.from(new Set([...existing.purpose, ...patch.updates.purpose]))
          : existing.purpose,
        excludedAttributes: patch.updates.excludedAttributes && patch.updates.excludedAttributes.length > 0
          ? Array.from(new Set([...existing.excludedAttributes, ...patch.updates.excludedAttributes]))
          : existing.excludedAttributes,
      };
      const newRequirements = [...brief.productRequirements];
      newRequirements[index] = updatedReq;
      return {
        ...brief,
        productRequirements: newRequirements,
        updatedAt: now,
      };
    }

    case "remove_requirement": {
      const index = brief.productRequirements.findIndex((r) => r.id === patch.requirementId);
      if (index === -1) {
        throw new Error(`Cannot remove requirement: id '${patch.requirementId}' not found.`);
      }
      return {
        ...brief,
        productRequirements: brief.productRequirements.filter((r) => r.id !== patch.requirementId),
        updatedAt: now,
      };
    }

    case "add_constraint": {
      const reqIndex = brief.productRequirements.findIndex((r) => r.id === patch.requirementId);
      if (reqIndex === -1) {
        throw new Error(`Cannot add constraint: requirement '${patch.requirementId}' not found.`);
      }
      const req = brief.productRequirements[reqIndex];
      // Check if constraint with same key or id already exists
      const existingConstraintIndex = req.constraints.findIndex(
        (c) => c.id === patch.constraint.id || c.key.toLowerCase() === patch.constraint.key.toLowerCase()
      );

      let newConstraints: ShoppingConstraint[];
      if (existingConstraintIndex !== -1) {
        // Deterministically replace or update constraint for that key
        newConstraints = [...req.constraints];
        newConstraints[existingConstraintIndex] = patch.constraint;
      } else {
        newConstraints = [...req.constraints, patch.constraint];
      }

      const updatedReq: ProductRequirement = {
        ...req,
        constraints: newConstraints,
      };
      const newRequirements = [...brief.productRequirements];
      newRequirements[reqIndex] = updatedReq;
      return {
        ...brief,
        productRequirements: newRequirements,
        updatedAt: now,
      };
    }

    case "update_constraint": {
      const reqIndex = brief.productRequirements.findIndex((r) => r.id === patch.requirementId);
      if (reqIndex === -1) {
        throw new Error(`Cannot update constraint: requirement '${patch.requirementId}' not found.`);
      }
      const req = brief.productRequirements[reqIndex];
      const constraintIndex = req.constraints.findIndex((c) => c.id === patch.constraintId);
      if (constraintIndex === -1) {
        throw new Error(`Constraint id '${patch.constraintId}' not found on requirement '${patch.requirementId}'.`);
      }
      const existingC = req.constraints[constraintIndex];
      const updatedC: ShoppingConstraint = {
        ...existingC,
        ...patch.updates,
        id: existingC.id, // Immutable ID
      };
      const newConstraints = [...req.constraints];
      newConstraints[constraintIndex] = updatedC;

      const newRequirements = [...brief.productRequirements];
      newRequirements[reqIndex] = { ...req, constraints: newConstraints };
      return {
        ...brief,
        productRequirements: newRequirements,
        updatedAt: now,
      };
    }

    case "remove_constraint": {
      const reqIndex = brief.productRequirements.findIndex((r) => r.id === patch.requirementId);
      if (reqIndex === -1) {
        throw new Error(`Cannot remove constraint: requirement '${patch.requirementId}' not found.`);
      }
      const req = brief.productRequirements[reqIndex];
      const target = patch.constraintKeyOrId.toLowerCase();
      const existing = req.constraints.find(
        (c) => c.id.toLowerCase() === target || c.key.toLowerCase() === target
      );
      if (!existing) {
        throw new Error(`Constraint '${patch.constraintKeyOrId}' not found on requirement '${patch.requirementId}'.`);
      }
      const updatedReq: ProductRequirement = {
        ...req,
        constraints: req.constraints.filter(
          (c) => c.id.toLowerCase() !== target && c.key.toLowerCase() !== target
        ),
      };
      const newRequirements = [...brief.productRequirements];
      newRequirements[reqIndex] = updatedReq;
      return {
        ...brief,
        productRequirements: newRequirements,
        updatedAt: now,
      };
    }

    case "set_budget": {
      return {
        ...brief,
        budget: patch.budget,
        updatedAt: now,
      };
    }

    case "set_mode": {
      return {
        ...brief,
        mode: patch.mode,
        updatedAt: now,
      };
    }

    case "set_user_goal": {
      return {
        ...brief,
        userGoal: patch.userGoal,
        updatedAt: now,
      };
    }

    case "set_missing_information": {
      return {
        ...brief,
        missingInformation: patch.missingInformation,
        updatedAt: now,
      };
    }

    case "set_status": {
      return {
        ...brief,
        status: patch.status,
        updatedAt: now,
      };
    }

    default: {
      const _exhaustiveCheck: never = patch;
      throw new Error(`Unhandled patch type: ${JSON.stringify(_exhaustiveCheck)}`);
    }
  }
}

/**
 * Applies a list of patches sequentially to a Shopping Brief.
 * Validates the resulting brief against the schema to guarantee integrity.
 * Returns the final brief alongside lists of applied and rejected patches.
 */
export function applyBriefPatches(
  initialBrief: ShoppingBrief,
  patches: unknown[]
): PatchApplicationResult {
  let currentBrief = initialBrief;
  const applied: ShoppingBriefPatch[] = [];
  const rejected: Array<{ patch: unknown; reason: string }> = [];

  for (const rawPatch of patches) {
    try {
      const updated = applyBriefPatch(currentBrief, rawPatch);
      // Validate that intermediate brief remains schema-valid
      const check = validateShoppingBrief(updated);
      if (!check.success || !check.brief) {
        rejected.push({
          patch: rawPatch,
          reason: `Patch resulted in invalid brief: ${check.errors?.join(", ") || "unknown"}`,
        });
        continue;
      }
      currentBrief = check.brief;
      // Push validated patch
      const val = validateShoppingBriefPatch(rawPatch);
      if (val.patch) applied.push(val.patch);
    } catch (err: unknown) {
      rejected.push({
        patch: rawPatch,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    brief: currentBrief,
    applied,
    rejected,
  };
}
