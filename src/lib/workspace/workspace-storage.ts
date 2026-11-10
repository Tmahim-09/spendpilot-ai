import type { ShoppingWorkspace } from "./types";

const STORAGE_KEY = "spendpilot_workspace";

// In-memory subscriber registry for same-tab reactive updates without dispatching synthetic "storage" events on window
const workspaceSubscribers = new Set<() => void>();

/**
 * Subscribes to workspace changes.
 * Supports both same-tab in-memory updates (for useSyncExternalStore)
 * and genuine cross-tab StorageEvents triggered by other browser windows.
 */
export function subscribeWorkspace(callback: () => void): () => void {
  workspaceSubscribers.add(callback);

  const handleCrossTab = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || !e.key) {
      callback();
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleCrossTab);
  }

  return () => {
    workspaceSubscribers.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleCrossTab);
    }
  };
}

export function getWorkspaceSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function getWorkspaceServerSnapshot(): string {
  return "";
}

// In-memory cache of the last serialized string to short-circuit identical writes
let lastSerializedWorkspace = "";

/**
 * Persists workspace to localStorage safely:
 * 1. Checks if serialized value is identical to avoid redundant writes.
 * 2. Never dispatches synthetic "storage" events on the current window (which creates infinite loops in React).
 * 3. Directly notifies same-tab in-memory subscribers (e.g. useSyncExternalStore in cart page).
 */
export function saveWorkspaceToStorage(workspace: ShoppingWorkspace): void {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify(workspace);
    if (serialized === lastSerializedWorkspace) {
      return;
    }

    const currentInStorage = window.localStorage.getItem(STORAGE_KEY);
    if (currentInStorage === serialized) {
      lastSerializedWorkspace = serialized;
      return;
    }

    lastSerializedWorkspace = serialized;
    window.localStorage.setItem(STORAGE_KEY, serialized);

    // Notify same-tab subscribers directly without dispatching synthetic "storage" window events
    workspaceSubscribers.forEach((cb) => {
      try {
        cb();
      } catch {
        // Ignore subscriber callback errors
      }
    });
  } catch {
    // Ignore storage quota or access errors
  }
}

export function clearStoredWorkspace(): void {
  if (typeof window === "undefined") return;
  try {
    lastSerializedWorkspace = "";
    window.localStorage.removeItem(STORAGE_KEY);
    workspaceSubscribers.forEach((cb) => {
      try {
        cb();
      } catch {
        // Ignore subscriber errors
      }
    });
  } catch {
    // Ignore storage errors
  }
}

export function parseStoredWorkspace(rawJson: string): ShoppingWorkspace | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson);
    if (parsed && Array.isArray(parsed.groups)) {
      return parsed as ShoppingWorkspace;
    }
  } catch {
    // Ignore invalid JSON
  }
  return null;
}
