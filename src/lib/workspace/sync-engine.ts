import type {
  ShoppingWorkspace,
  ShoppingGroup,
  ShoppingItem,
  ShoppingItemPriority,
} from "./types.ts";
import type { ShoppingBrief, ProductRequirement } from "../orchestrator/types.ts";
import type { CurrencyCode } from "../../types/index.ts";
import {
  createInitialWorkspace,
  addIndependentItem,
  createCoordinatedSetupGroup,
  replaceProductForItem,
} from "./workspace-manager.ts";
import { revalidateGroupCompatibility } from "./compatibility-engine.ts";

/**
 * Checks if the message requests a coordinated setup.
 */
export function isCoordinatedSetupIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("gaming setup") ||
    lower.includes("pc build") ||
    lower.includes("home office setup") ||
    lower.includes("workstation") ||
    lower.includes("studio setup") ||
    lower.includes("smart home setup") ||
    lower.includes("room furnishing") ||
    lower.includes("bedroom furnishing") ||
    (lower.includes("setup") && (lower.includes("gaming") || lower.includes("office") || lower.includes("desk"))) ||
    (lower.includes("build a") && (lower.includes("pc") || lower.includes("computer") || lower.includes("setup")))
  );
}

/**
 * Checks if the user is asking to replace an existing component or item.
 */
export function detectReplaceIntent(
  message: string,
  workspace: ShoppingWorkspace
): { isReplace: boolean; targetItemId?: string; targetCategory?: string } {
  const lower = message.toLowerCase();
  if (
    !lower.includes("replace") &&
    !lower.includes("change the") &&
    !lower.includes("swap the") &&
    !lower.includes("different") &&
    !lower.includes("another option for")
  ) {
    return { isReplace: false };
  }

  // Look through items in workspace to find which one matches
  for (const group of workspace.groups) {
    for (const item of group.items) {
      const cat = item.category.toLowerCase();
      const name = (item.displayName || item.productRequest).toLowerCase();
      if (
        lower.includes(cat) ||
        lower.includes(name) ||
        (cat === "keyboard" && lower.includes("keyboard")) ||
        (cat === "monitor" && lower.includes("monitor")) ||
        (cat === "mouse" && lower.includes("mouse")) ||
        (cat === "desk" && lower.includes("desk")) ||
        (cat === "chair" && lower.includes("chair"))
      ) {
        return { isReplace: true, targetItemId: item.id, targetCategory: item.category };
      }
    }
  }

  return { isReplace: false };
}

/**
 * Checks if user is explicitly asking to add an unrelated item while working on a setup.
 */
export function isAddUnrelatedItemToSetup(
  message: string,
  activeGroup?: ShoppingGroup | null
): boolean {
  if (!activeGroup || activeGroup.type !== "coordinated_setup") return false;
  const lower = message.toLowerCase();

  // If user says "also need", "separate purchase", "coffee maker", "shoes", etc. that are not setup components
  const unrelatedKeywords = [
    "coffee maker",
    "coffee machine",
    "shoes",
    "sneakers",
    "perfume",
    "cologne",
    "backpack",
    "jacket",
    "clothing",
  ];

  for (const kw of unrelatedKeywords) {
    if (lower.includes(kw)) {
      return true;
    }
  }

  if (lower.includes("separate purchase") || lower.includes("unrelated") || lower.includes("outside the setup")) {
    return true;
  }

  return false;
}

/**
 * Checks if user is adding a component to an existing setup (e.g. "Add a compatible monitor to my selected PC").
 */
export function isAddToSetupIntent(
  message: string,
  activeGroup?: ShoppingGroup | null
): { isAdd: boolean; componentName?: string; dependsOnPc?: boolean } {
  if (!activeGroup || activeGroup.type !== "coordinated_setup") return { isAdd: false };
  const lower = message.toLowerCase();

  if (lower.includes("add a") || lower.includes("include a") || lower.includes("also add")) {
    const dependsOnPc = lower.includes("pc") || lower.includes("compatible");
    if (lower.includes("monitor")) return { isAdd: true, componentName: "Monitor", dependsOnPc };
    if (lower.includes("keyboard")) return { isAdd: true, componentName: "Keyboard", dependsOnPc };
    if (lower.includes("mouse")) return { isAdd: true, componentName: "Mouse", dependsOnPc };
    if (lower.includes("webcam")) return { isAdd: true, componentName: "Webcam", dependsOnPc };
    if (lower.includes("speakers")) return { isAdd: true, componentName: "Speakers", dependsOnPc };
  }

  return { isAdd: false };
}

/**
 * Synchronizes the unified workspace state with the central Shopping Brief and user input.
 */
export function syncWorkspaceFromBrief(
  existingWorkspace: ShoppingWorkspace | undefined,
  brief: ShoppingBrief,
  userMessage: string,
  currency: CurrencyCode = "USD"
): ShoppingWorkspace {
  let ws = existingWorkspace || createInitialWorkspace({ currency });
  const msg = userMessage.trim();
  const lower = msg.toLowerCase();
  const now = Date.now();

  // 1. Check for item replacement
  const replaceInfo = detectReplaceIntent(msg, ws);
  if (replaceInfo.isReplace && replaceInfo.targetItemId) {
    ws = replaceProductForItem(ws, replaceInfo.targetItemId);
    return ws;
  }

  // 2. Check for unrelated item while in coordinated setup
  const activeGroup = ws.groups.find((g) => g.id === ws.activeGroupId);
  if (isAddUnrelatedItemToSetup(msg, activeGroup)) {
    // Add as independent item in a separate independent group!
    ws = addIndependentItem(ws, {
      productRequest: msg,
      category: "unrelated",
      displayName: msg,
    });
    return ws;
  }

  // 3. Check for adding a component to an existing setup
  const addToSetup = isAddToSetupIntent(msg, activeGroup);
  if (addToSetup.isAdd && activeGroup && activeGroup.type === "coordinated_setup") {
    // Find PC item if dependency requested
    const pcItem = activeGroup.items.find(
      (i) => i.category.includes("pc") || i.category.includes("desktop")
    );
    const dependencies = addToSetup.dependsOnPc && pcItem ? [pcItem.id] : [];

    const newItem: ShoppingItem = {
      id: `item_${activeGroup.id}_add_${Date.now()}`,
      productRequest: addToSetup.componentName || msg,
      category: (addToSetup.componentName || "peripheral").toLowerCase(),
      displayName: addToSetup.componentName || msg,
      hardConstraints: {},
      preferences: {},
      priority: "preferred",
      status: "ready_to_search",
      candidates: [],
      dependencies,
      answeredQuestionIds: [],
      searchQuery: `${addToSetup.componentName} for ${activeGroup.title}`,
    };

    const updatedGroup: ShoppingGroup = {
      ...activeGroup,
      items: [...activeGroup.items, newItem],
      updatedAt: now,
    };

    ws = {
      ...ws,
      revision: ws.revision + 1,
      activeItemId: newItem.id,
      groups: ws.groups.map((g) => (g.id === activeGroup.id ? revalidateGroupCompatibility(updatedGroup) : g)),
      updatedAt: now,
    };
    return ws;
  }

  // 4. If brief has productRequirements, ensure they are reflected in workspace
  if (brief.productRequirements && brief.productRequirements.length > 0) {
    const isSetup =
      isCoordinatedSetupIntent(msg) ||
      (brief.mode === "multi_product" &&
        (lower.includes("setup") ||
          lower.includes("workstation") ||
          lower.includes("pc build") ||
          lower.includes("furnishing")));

    if (isSetup) {
      // Find or create coordinated setup group
      const setupGroup = ws.groups.find((g) => g.type === "coordinated_setup");

      if (!setupGroup) {
        // Group title
        const title = lower.includes("gaming")
          ? "Gaming Setup"
          : lower.includes("workstation")
          ? "Workstation Setup"
          : "Coordinated Setup";

        const sharedBudgetMinor = brief.budget?.maximum?.amountMinor;

        ws = createCoordinatedSetupGroup(ws, {
          title,
          sharedBudget: sharedBudgetMinor
            ? {
                amountMinor: sharedBudgetMinor,
                currency: (brief.budget?.maximum?.currency as CurrencyCode) || currency,
                strict: true,
              }
            : undefined,
          items: brief.productRequirements.map((req, idx) => ({
            productRequest: req.displayName || req.category,
            category: req.category,
            displayName: req.displayName,
            requirementId: req.id,
            hardConstraints: req.constraints.reduce((acc, c) => {
              acc[c.key] = c.value;
              return acc;
            }, {} as Record<string, string | number | boolean>),
            preferences: {},
            priority: (idx === 0 ? "essential" : "preferred") as ShoppingItemPriority,
            dependencies: idx > 0 && brief.productRequirements[0] ? [`req_${brief.productRequirements[0].id}`] : [],
          })),
        });
      } else {
        // Update shared budget if changed
        if (brief.budget?.maximum?.amountMinor && (!setupGroup.budget || setupGroup.budget.amountMinor !== brief.budget.maximum.amountMinor)) {
          const updatedGroup: ShoppingGroup = {
            ...setupGroup,
            budget: {
              amountMinor: brief.budget.maximum.amountMinor,
              currency: (brief.budget.maximum.currency as CurrencyCode) || currency,
              scope: "group",
              strict: true,
            },
            updatedAt: now,
          };
          ws = {
            ...ws,
            revision: ws.revision + 1,
            groups: ws.groups.map((g) => (g.id === setupGroup!.id ? updatedGroup : g)),
            updatedAt: now,
          };
        }
      }
    } else {
      // Independent items (single or multiple)
      let independentGroup = ws.groups.find((g) => g.type === "independent");

      if (!independentGroup) {
        const newItems: ShoppingItem[] = brief.productRequirements.map((req) => ({
          id: req.id,
          productRequest: req.displayName || req.category,
          category: req.category,
          displayName: req.displayName,
          requirementId: req.id,
          hardConstraints: req.constraints.reduce((acc, c) => {
            acc[c.key] = c.value;
            return acc;
          }, {} as Record<string, string | number | boolean>),
          preferences: {},
          priority: "essential",
          status: "ready_to_search",
          candidates: [],
          dependencies: [],
          answeredQuestionIds: [],
          searchQuery: req.searchQuery || req.displayName,
        }));

        independentGroup = {
          id: `grp_indep_${now}`,
          type: "independent",
          title: "My Shopping List",
          sharedRequirements: {},
          items: newItems,
          status: "searching",
          createdAt: now,
          updatedAt: now,
        };

        ws = {
          ...ws,
          revision: ws.revision + 1,
          activeGroupId: independentGroup.id,
          activeItemId: newItems[0]?.id || null,
          groups: [...ws.groups, independentGroup],
          updatedAt: now,
        };
      } else {
        // Update existing unselected items in independent group from brief requirements
        const updatedExistingItems = independentGroup.items.map((item) => {
          const matchingReq = brief.productRequirements.find((r) => r.id === item.id);
          if (!matchingReq) return item;
          // If item is already selected, preserve selection and status
          if (item.status === "selected") return item;

          const updatedConstraints = matchingReq.constraints.reduce((acc, c) => {
            acc[c.key] = c.value;
            return acc;
          }, { ...item.hardConstraints });

          return {
            ...item,
            productRequest: matchingReq.displayName || matchingReq.category,
            category: matchingReq.category,
            displayName: matchingReq.displayName,
            requirementId: matchingReq.id,
            hardConstraints: updatedConstraints,
            searchQuery: matchingReq.searchQuery || item.searchQuery,
          };
        });

        // Check if brief added new requirements not in independent group
        const existingItemIds = new Set(independentGroup.items.map((i) => i.id));
        const newReqs = brief.productRequirements.filter((r) => !existingItemIds.has(r.id));

        const appendedItems: ShoppingItem[] = newReqs.map((req) => ({
          id: req.id,
          productRequest: req.displayName || req.category,
          category: req.category,
          displayName: req.displayName,
          requirementId: req.id,
          hardConstraints: req.constraints.reduce((acc, c) => {
            acc[c.key] = c.value;
            return acc;
          }, {} as Record<string, string | number | boolean>),
          preferences: {},
          priority: "essential",
          status: "ready_to_search",
          candidates: [],
          dependencies: [],
          answeredQuestionIds: [],
          searchQuery: req.searchQuery || req.displayName,
        }));

        const finalItems = [...updatedExistingItems, ...appendedItems];

        const updatedGroup: ShoppingGroup = {
          ...independentGroup,
          items: finalItems,
          updatedAt: now,
        };

        ws = {
          ...ws,
          revision: ws.revision + 1,
          activeGroupId: independentGroup.id,
          activeItemId: appendedItems[0]?.id || ws.activeItemId,
          groups: ws.groups.map((g) => (g.id === independentGroup!.id ? updatedGroup : g)),
          updatedAt: now,
        };
      }
    }
  }

  // 5. Update shared budget if user stated "These are separate purchases, but I have a total budget of $500" or similar
  if (lower.includes("total budget") || lower.includes("budget for everything") || lower.includes("together under")) {
    if (brief.budget?.maximum?.amountMinor) {
      ws = {
        ...ws,
        overallBudget: {
          amountMinor: brief.budget.maximum.amountMinor,
          currency: (brief.budget.maximum.currency as CurrencyCode) || currency,
          strict: true,
        },
      };
    }
  }

  return ws;
}

/**
 * Resolves the corresponding ProductRequirement for a ShoppingItem using explicit IDs,
 * never by array position or first search query.
 */
export function resolveRequirementForItem(
  brief: ShoppingBrief | undefined | null,
  item: ShoppingItem | undefined | null
): ProductRequirement | null {
  if (!brief || !brief.productRequirements || brief.productRequirements.length === 0 || !item) {
    return null;
  }

  // 1. Explicit requirementId on the item
  if (item.requirementId) {
    const found = brief.productRequirements.find((r) => r.id === item.requirementId);
    if (found) return found;
  }

  // 2. Exact item.id matching req.id
  const foundById = brief.productRequirements.find((r) => r.id === item.id);
  if (foundById) return foundById;

  // 3. Reconcile using explicit name/request matching
  const itemRequest = (item.productRequest || item.displayName || "").trim().toLowerCase();
  if (itemRequest) {
    const foundByReq = brief.productRequirements.find((r) => {
      const reqName = (r.displayName || r.searchQuery || "").trim().toLowerCase();
      return (
        reqName === itemRequest ||
        (reqName.length >= 3 && itemRequest.includes(reqName)) ||
        (itemRequest.length >= 3 && reqName.includes(itemRequest))
      );
    });
    if (foundByReq) return foundByReq;
  }

  // 4. Safe single requirement fallback (only if brief has exactly 1 requirement)
  if (brief.productRequirements.length === 1) {
    return brief.productRequirements[0];
  }

  // Multi-requirement brief where no explicit match exists: do NOT silently guess first requirement!
  return null;
}
