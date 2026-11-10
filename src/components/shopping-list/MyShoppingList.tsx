"use client";

import type { ShoppingWorkspace } from "@/lib/workspace/types";
import type { CurrencyCode } from "@/types";

export interface MyShoppingListProps {
  workspace?: ShoppingWorkspace;
  currency?: CurrencyCode;
  onRemoveItem?: (itemId: string) => void;
  onReplaceItem?: (itemId: string) => void;
  isOpen?: boolean;
  onToggleOpen?: () => void;
}

/**
 * MyShoppingList right-side drawer and floating cart has been removed
 * in favor of the dedicated /cart page.
 */
export function MyShoppingList() {
  return null;
}
