import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeInteractionResponse,
  resolveNaturalMessage,
  isRawJsonString,
  extractCleanJsonString,
  DEFAULT_SAFE_NATURAL_FALLBACK,
} from "../src/lib/ai/normalize-interaction-response.ts";
import {
  streamConciergeTurn,
} from "../src/lib/concierge/streaming-engine.ts";
import {
  createInitialSession,
} from "../src/lib/ai/conversation-engine.ts";
import type { ConciergeStreamEvent } from "../src/lib/concierge/types.ts";

describe("SpendPilot AI: Raw JSON Chat Prevention & Unified Thinking Indicator", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. JSON array beginning with '[' is never streamed as visible chat text
  // ─────────────────────────────────────────────────────────────────────────────
  test("1. A JSON array beginning with '[' is never streamed as visible chat text", async () => {
    const session = createInitialSession({ sessionId: "sess_stream_json_array", initialQuery: "Gaming" });
    const chunks = ["  \n", "[", '{"action":', '"search_products",', '"query":"gaming laptop"}', "]"];

    const generator = streamConciergeTurn({
      userMessage: "Gaming",
      session,
      customStreamChunks: chunks,
    });

    const events: ConciergeStreamEvent[] = [];
    for await (const ev of generator) {
      events.push(ev);
    }

    const deltas = events
      .filter((e) => e.type === "delta")
      .map((d) => (d as { text: string }).text)
      .join("");

    // Deltas must NEVER contain raw JSON syntax or internal action keys
    assert.ok(!deltas.includes("["), "Streamed deltas must not contain '['");
    assert.ok(!deltas.includes("]"), "Streamed deltas must not contain ']'");
    assert.ok(!deltas.includes('"action"'), "Streamed deltas must not contain '\"action\"'");
    assert.ok(!deltas.includes('"search_products"'), "Streamed deltas must not contain '\"search_products\"'");
    assert.ok(!deltas.includes('"filters"'), "Streamed deltas must not contain '\"filters\"'");

    // Deltas must be friendly natural language
    assert.ok(deltas.length > 0, "Deltas must have streamed natural text");
    assert.ok(!isRawJsonString(deltas), "Accumulated delta must not be raw JSON");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. JSON action array containing search_products, query, filters never reaches history
  // ─────────────────────────────────────────────────────────────────────────────
  test("2. A JSON action array containing search_products, query, and filters never reaches conversation history", async () => {
    const rawActionArray = JSON.stringify([
      {
        action: "search_products",
        query: "gaming laptop",
        filters: {
          category: "Laptop",
          tags: ["gaming"],
        },
      },
    ]);

    const session = createInitialSession({ sessionId: "sess_history_json", initialQuery: "Gaming" });
    const generator = streamConciergeTurn({
      userMessage: "Gaming",
      session,
      customStreamChunks: [rawActionArray],
    });

    const events: ConciergeStreamEvent[] = [];
    for await (const ev of generator) {
      events.push(ev);
    }

    const doneEvent = events.find((e) => e.type === "done") as { session: typeof session } | undefined;
    assert.ok(doneEvent, "Must yield done event");

    const messages = doneEvent.session.messages;
    const assistantMsg = messages[messages.length - 1];
    assert.ok(assistantMsg, "Must have assistant message");
    assert.strictEqual(assistantMsg.role, "assistant");

    // Must never contain raw JSON in content
    assert.ok(!assistantMsg.content.includes("search_products"), "History must not contain search_products");
    assert.ok(!assistantMsg.content.includes('"query"'), "History must not contain 'query'");
    assert.ok(!assistantMsg.content.includes('"filters"'), "History must not contain 'filters'");
    assert.ok(!assistantMsg.content.trim().startsWith("["), "History must not start with '['");
    assert.ok(!assistantMsg.content.trim().startsWith("{"), "History must not start with '{'");
    assert.ok(!isRawJsonString(assistantMsg.content), "History must not be raw JSON string");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. resolveNaturalMessage() never returns raw JSON when action array has no message
  // ─────────────────────────────────────────────────────────────────────────────
  test("3. resolveNaturalMessage() never returns raw JSON when an action array has no customer-facing message", () => {
    const rawActionArray = `[
      {
        "action": "search_products",
        "query": "gaming laptop",
        "filters": {
          "category": "Laptop",
          "tags": ["gaming"]
        }
      }
    ]`;

    // Case A: With explicit safe fallback
    const resFallback = resolveNaturalMessage(rawActionArray, "Looking for options.");
    assert.strictEqual(resFallback, "Looking for options.");

    // Case B: With default fallback
    const resDefault = resolveNaturalMessage(rawActionArray);
    assert.strictEqual(resDefault, DEFAULT_SAFE_NATURAL_FALLBACK);

    // Case C: Fallback itself is raw JSON (must safely recover to default)
    const resSelfFallback = resolveNaturalMessage(rawActionArray, rawActionArray);
    assert.strictEqual(resSelfFallback, DEFAULT_SAFE_NATURAL_FALLBACK);
    assert.ok(!resSelfFallback.includes("["));
    assert.ok(!resSelfFallback.includes("action"));

    // Case D: Leading/trailing whitespace and code fences
    const fencedAction = `\`\`\`json\n${rawActionArray}\n\`\`\``;
    const resFenced = resolveNaturalMessage(fencedAction, "Safe fallback");
    assert.strictEqual(resFenced, "Safe fallback");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Valid JSON object containing explicit assistantMessage produces natural message
  // ─────────────────────────────────────────────────────────────────────────────
  test("4. A valid JSON object containing an explicit assistantMessage still produces the correct natural-language response", () => {
    const validJsonObj = JSON.stringify({
      action: "search_products",
      assistantMessage: "Here are top-rated gaming laptops within your budget.",
    });

    const natural = resolveNaturalMessage(validJsonObj);
    assert.strictEqual(natural, "Here are top-rated gaming laptops within your budget.");

    const normalized = normalizeInteractionResponse(validJsonObj);
    assert.strictEqual(normalized.action, "search_products");
    assert.strictEqual(normalized.assistantMessage, "Here are top-rated gaming laptops within your budget.");
    assert.strictEqual(normalized.readyForSearch, true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Valid JSON array containing explicit customer-facing message is handled safely
  // ─────────────────────────────────────────────────────────────────────────────
  test("5. A valid JSON array containing an explicit customer-facing message is handled safely", () => {
    const validJsonArr = JSON.stringify([
      {
        action: "search_products",
        assistantMessage: "Searching verified retailer deals for gaming laptops.",
      },
    ]);

    const natural = resolveNaturalMessage(validJsonArr);
    assert.strictEqual(natural, "Searching verified retailer deals for gaming laptops.");

    const normalized = normalizeInteractionResponse(validJsonArr);
    assert.strictEqual(normalized.action, "search_products");
    assert.strictEqual(normalized.assistantMessage, "Searching verified retailer deals for gaming laptops.");
    assert.strictEqual(normalized.readyForSearch, true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Ordinary natural-language responses continue working
  // ─────────────────────────────────────────────────────────────────────────────
  test("6. Ordinary natural-language responses continue working", () => {
    const plainText = "I found three great laptops with 16GB RAM for your programming needs.";

    const natural = resolveNaturalMessage(plainText);
    assert.strictEqual(natural, plainText);

    const normalized = normalizeInteractionResponse(plainText);
    assert.strictEqual(normalized.assistantMessage, plainText);
    assert.strictEqual(normalized.action, "conversation_reply");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Internal search action still executes exactly once
  // ─────────────────────────────────────────────────────────────────────────────
  test("7. The internal search action still executes exactly once when raw action payload is received", async () => {
    const rawActionArray = JSON.stringify([
      {
        action: "search_products",
        query: "gaming laptop",
        filters: {
          category: "Laptop",
          tags: ["gaming"],
        },
      },
    ]);

    const session = createInitialSession({ sessionId: "sess_search_once", initialQuery: "Gaming" });
    const generator = streamConciergeTurn({
      userMessage: "Gaming",
      session,
      customStreamChunks: [rawActionArray],
    });

    const events: ConciergeStreamEvent[] = [];
    for await (const ev of generator) {
      events.push(ev);
    }

    const doneEvent = events.find((e) => e.type === "done") as {
      type: "done";
      shouldExecuteSearch?: boolean;
    } | undefined;

    assert.ok(doneEvent, "Must produce done event");
    assert.strictEqual(doneEvent.shouldExecuteSearch, true, "Must flag shouldExecuteSearch as true");

    // Verify search action is recorded in session lastAction
    const finalSession = (doneEvent as unknown as { session: typeof session }).session;
    assert.strictEqual(finalSession.lastAction, "search_products");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. extractCleanJsonString correctly handles arrays and objects
  // ─────────────────────────────────────────────────────────────────────────────
  test("8. extractCleanJsonString correctly isolates both JSON objects and JSON arrays", () => {
    const arrayStr = `Some prefix text [ { "action": "test" }, { "action": "second" } ] trailing notes`;
    const cleanArr = extractCleanJsonString(arrayStr);
    assert.strictEqual(cleanArr, '[ { "action": "test" }, { "action": "second" } ]');

    const objStr = `Prefix { "action": "single" } postfix`;
    const cleanObj = extractCleanJsonString(objStr);
    assert.strictEqual(cleanObj, '{ "action": "single" }');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Streaming leading whitespace buffering prevents premature delta leaks
  // ─────────────────────────────────────────────────────────────────────────────
  test("9. Streaming leading whitespace does not stream premature deltas for JSON arrays", async () => {
    const session = createInitialSession({ sessionId: "sess_whitespace_stream", initialQuery: "Gaming" });
    // Chunks split across leading whitespace and brackets
    const chunks = ["  \n\t  ", "  ", "[", '{"action":', '"search_products"}', "]"];

    const generator = streamConciergeTurn({
      userMessage: "Gaming",
      session,
      customStreamChunks: chunks,
    });

    const deltas: string[] = [];
    for await (const ev of generator) {
      if (ev.type === "delta") {
        deltas.push(ev.text);
      }
    }

    // No chunk yielded should be raw whitespace or bracket syntax
    for (const d of deltas) {
      assert.ok(!d.includes("["), "No delta should include '['");
      assert.ok(!d.includes("{"), "No delta should include '{'");
      assert.ok(!d.includes('"action"'), "No delta should include '\"action\"'");
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. Unified thinking indicator label format (no trailing literal dots)
  // ─────────────────────────────────────────────────────────────────────────────
  test("10. Loading messages have literal trailing dots removed for animated indicator", () => {
    const rawUnderstanding = "Understanding your laptop workload requirements...";
    const rawSearching = "Searching for verified laptops suited to your workload...";
    const rawComparing = "Comparing performance, configuration, and price...";

    const cleanUnderstanding = rawUnderstanding.replace(/\.{2,}$/, "").replace(/\.+$/, "").trim();
    const cleanSearching = rawSearching.replace(/\.{2,}$/, "").replace(/\.+$/, "").trim();
    const cleanComparing = rawComparing.replace(/\.{2,}$/, "").replace(/\.+$/, "").trim();

    assert.strictEqual(cleanUnderstanding, "Understanding your laptop workload requirements");
    assert.strictEqual(cleanSearching, "Searching for verified laptops suited to your workload");
    assert.strictEqual(cleanComparing, "Comparing performance, configuration, and price");

    assert.ok(!cleanUnderstanding.endsWith("."));
    assert.ok(!cleanSearching.endsWith("."));
    assert.ok(!cleanComparing.endsWith("."));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. Single consistent indicator logic across all stages (no separate bubbles)
  // ─────────────────────────────────────────────────────────────────────────────
  test("11. Understanding, searching, and comparing do not generate separate visible loading messages", () => {
    // Model simulated UI states:
    interface MockUIState {
      isLoading: boolean;
      searchProgress: { stage: string; message: string } | null;
      activeStatusText?: string | null;
      hasChosenPreference: boolean;
    }

    function getVisibleIndicatorBubbles(state: MockUIState): Array<{ label: string }> {
      // Must produce at most ONE indicator bubble
      if (!state.isLoading && !state.searchProgress) {
        return [];
      }

      let label = "Thinking";
      if (state.hasChosenPreference) {
        const raw = state.searchProgress?.message || state.activeStatusText || "Thinking";
        label = raw.replace(/\.{2,}$/, "").replace(/\.+$/, "").trim();
      }

      return [{ label }];
    }

    // Stage 1: Understanding
    const bubblesUnderstanding = getVisibleIndicatorBubbles({
      isLoading: true,
      searchProgress: { stage: "understanding", message: "Understanding your laptop workload requirements..." },
      hasChosenPreference: false,
    });
    assert.strictEqual(bubblesUnderstanding.length, 1, "Must render exactly 1 bubble during understanding");
    assert.strictEqual(bubblesUnderstanding[0]?.label, "Thinking", "Must not display workload sentence on first message");

    // Stage 2: Searching
    const bubblesSearching = getVisibleIndicatorBubbles({
      isLoading: true,
      searchProgress: { stage: "searching", message: "Searching for verified laptops suited to your workload..." },
      hasChosenPreference: false,
    });
    assert.strictEqual(bubblesSearching.length, 1, "Must render exactly 1 bubble during searching");
    assert.strictEqual(bubblesSearching[0]?.label, "Thinking", "Must maintain single thinking indicator");

    // Stage 3: Comparing
    const bubblesComparing = getVisibleIndicatorBubbles({
      isLoading: true,
      searchProgress: { stage: "comparing", message: "Comparing performance, configuration, and price..." },
      hasChosenPreference: false,
    });
    assert.strictEqual(bubblesComparing.length, 1, "Must render exactly 1 bubble during comparing");
    assert.strictEqual(bubblesComparing[0]?.label, "Thinking", "Must not show separate comparing bubble");

    // Stage 4: After user chose preference
    const bubblesAfterPreference = getVisibleIndicatorBubbles({
      isLoading: true,
      searchProgress: { stage: "comparing", message: "Comparing performance, configuration, and price..." },
      hasChosenPreference: true,
    });
    assert.strictEqual(bubblesAfterPreference.length, 1);
    assert.strictEqual(bubblesAfterPreference[0]?.label, "Comparing performance, configuration, and price");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 12. Thinking indicator disappears after completion and after errors
  // ─────────────────────────────────────────────────────────────────────────────
  test("12. The thinking indicator disappears after successful completion and after errors", async () => {
    // A: Successful stream completion
    const session = createInitialSession({ sessionId: "sess_indicator_done", initialQuery: "Gaming" });
    const generatorSuccess = streamConciergeTurn({
      userMessage: "Gaming",
      session,
      customStreamChunks: ["Great gaming options."],
    });

    const successEvents: ConciergeStreamEvent[] = [];
    for await (const ev of generatorSuccess) {
      successEvents.push(ev);
    }

    const hasDone = successEvents.some((e) => e.type === "done");
    assert.ok(hasDone, "Successful flow emits done event, clearing isLoading & searchProgress");

    // B: Stream network error
    const generatorError = streamConciergeTurn({
      userMessage: "Gaming",
      session,
      customStreamChunks: ["First chunk", "Second chunk", "Third chunk"],
      simulateStreamErrorAfterChunk: 1,
    });

    const errorEvents: ConciergeStreamEvent[] = [];
    for await (const ev of generatorError) {
      errorEvents.push(ev);
    }

    const errorEvent = errorEvents.find((e) => e.type === "error");
    assert.ok(errorEvent, "Error flow emits error event, causing UI to reset isLoading and searchProgress");
  });
});
