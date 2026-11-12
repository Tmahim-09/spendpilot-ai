import { test } from "node:test";
import assert from "node:assert/strict";
import { orchestrateShoppingTurn } from "../src/lib/orchestrator/index.ts";
import { streamConciergeTurn } from "../src/lib/concierge/streaming-engine.ts";
import { isDelegatedOrNoPreference } from "../src/lib/orchestrator/intent-analyzer.ts";
import { processUserMessage, createInitialSession } from "../src/lib/ai/conversation-engine.ts";
import {
  getActiveWorkspaceItem,
  updateItemSearchResults,
  findItemInWorkspace,
} from "../src/lib/workspace/workspace-manager.ts";
import type { AuthoritativeShoppingSession } from "../src/types/index.ts";
import type { ConciergeStreamEvent } from "../src/lib/concierge/types.ts";

test("Laptop Flow: 'u suggest' triggers warm thinking & delegation response without repeating question or searching prematurely", async (t) => {
  await t.test("Unit 1: isDelegatedOrNoPreference matches colloquial delegation phrases", () => {
    assert.equal(isDelegatedOrNoPreference("u suggest"), true);
    assert.equal(isDelegatedOrNoPreference("you suggest"), true);
    assert.equal(isDelegatedOrNoPreference("u decide"), true);
    assert.equal(isDelegatedOrNoPreference("you choose"), true);
    assert.equal(isDelegatedOrNoPreference("up to you"), true);
    assert.equal(isDelegatedOrNoPreference("no preference"), true);
    assert.equal(isDelegatedOrNoPreference("whatever you think"), true);
    assert.equal(isDelegatedOrNoPreference("surprise me"), true);

    // Negative assertions
    assert.equal(isDelegatedOrNoPreference("macOS"), false);
    assert.equal(isDelegatedOrNoPreference("Windows 11 with 16GB RAM"), false);
    assert.equal(isDelegatedOrNoPreference("Leather"), false);
  });

  await t.test("Unit 2: Turn 1 Laptop query asks for OS clarification", async () => {
    const turn1 = await orchestrateShoppingTurn({
      userMessage: "i need a laptop for professional works as an web developer",
      activeBrief: null,
      activeSessionId: "session_laptop_test",
      sourceMessageId: "msg_turn_1",
      conversationHistory: [],
    });

    assert.ok(turn1.brief.productRequirements.length > 0, "Brief must contain laptop requirement");
    const laptopReq = turn1.brief.productRequirements[0];
    assert.equal(laptopReq.category, "laptop");
    assert.equal(turn1.suggestedAction, "ask_question");
    assert.ok(turn1.question || turn1.clarification, "Must ask clarification question for OS");
    assert.ok(
      turn1.assistantMessage.toLowerCase().includes("operating system") ||
      turn1.assistantMessage.toLowerCase().includes("os"),
      "Must ask for operating system in turn 1"
    );
  });

  await t.test("Unit 3: Turn 2 'u suggest' resolves to start_product_search with warm delegation message and NO repeated question", async () => {
    const turn1 = await orchestrateShoppingTurn({
      userMessage: "i need a laptop for professional works as an web developer",
      activeBrief: null,
      activeSessionId: "session_laptop_test",
      sourceMessageId: "msg_turn_1",
      conversationHistory: [],
    });

    const turn2 = await orchestrateShoppingTurn({
      userMessage: "u suggest",
      activeBrief: turn1.brief,
      activeSessionId: "session_laptop_test",
      sourceMessageId: "msg_turn_2",
      conversationHistory: [
        { role: "user", content: "i need a laptop for professional works as an web developer" },
        { role: "assistant", content: turn1.assistantMessage },
      ],
    });

    assert.equal(turn2.suggestedAction, "start_product_search", "Action must be start_product_search");
    assert.equal(turn2.isReadyForSearch, true, "isReadyForSearch must be true");
    assert.equal(turn2.question, null, "Question must be null on delegation");
    assert.equal(turn2.clarification, null, "Clarification must be null on delegation");

    const msg = turn2.assistantMessage;
    assert.ok(!/\?\s*$/.test(msg.trim()), "Assistant message must NOT end with a question mark");
    assert.ok(
      msg.toLowerCase().includes("very little preference") ||
      msg.toLowerCase().includes("little preference"),
      "Message must mention having little preference"
    );
    assert.ok(
      msg.toLowerCase().includes("tough to suggest") ||
      msg.toLowerCase().includes("recommend the top-rated"),
      "Message must mention recommending top-rated all-around options"
    );
    assert.ok(
      msg.toLowerCase().includes("search again") ||
      msg.toLowerCase().includes("add your preferences"),
      "Message must remind user they can add preferences and search again"
    );
  });

  await t.test("Unit 4: Streaming Engine yields start_product_search with warm message and shouldExecuteSearch=true", async () => {
    const initialSession: AuthoritativeShoppingSession = createInitialSession({
      sessionId: "session_stream_laptop",
      initialQuery: "i need a laptop for professional works as an web developer",
    });

    // Run turn 1 in stream
    const turn1Events: ConciergeStreamEvent[] = [];
    for await (const evt of streamConciergeTurn({
      userMessage: "i need a laptop for professional works as an web developer",
      session: initialSession,
    })) {
      turn1Events.push(evt);
    }

    const done1 = turn1Events.find((e) => e.type === "done");
    assert.ok(done1 && done1.session, "Turn 1 stream must complete");

    // Run turn 2 with 'u suggest'
    const turn2Events: ConciergeStreamEvent[] = [];
    let streamedText = "";
    for await (const evt of streamConciergeTurn({
      userMessage: "u suggest",
      session: done1.session,
    })) {
      turn2Events.push(evt);
      if (evt.type === "delta" && evt.text) {
        streamedText += evt.text;
      }
    }

    const questionEvt = turn2Events.find((e) => e.type === "question");
    assert.equal(questionEvt?.question, null, "Turn 2 question event must be null");

    const done2 = turn2Events.find((e) => e.type === "done");
    assert.ok(done2, "Turn 2 stream must produce a done event");
    assert.equal(done2.shouldExecuteSearch, true, "done event must indicate shouldExecuteSearch: true");

    assert.ok(!/\?\s*$/.test(streamedText.trim()), "Streamed text must NOT end with a question mark");
    assert.ok(
      streamedText.toLowerCase().includes("very little preference") ||
      streamedText.toLowerCase().includes("little preference"),
      "Streamed text must contain warm delegation explanation"
    );
  });

  await t.test("Unit 5: Search Mutual Exclusion Gate: If assistant asks a question, shouldExecuteSearch is strictly false", async () => {
    const session = createInitialSession({
      sessionId: "session_gate_test",
      initialQuery: "i need a laptop",
    });

    // Simulate processUserMessage when assistant content ends in '?'
    const result = await processUserMessage({
      session,
      userMessage: "i need a laptop",
      precomputedOrchestration: {
        taskId: "task_1",
        brief: session.shoppingBrief!,
        detectedIntent: { type: "refine_current_task", confidence: 1, explanation: "test" },
        suggestedAction: "ask_question",
        isReadyForSearch: false,
        question: {
          id: "q_os",
          attributeKey: "operating_system",
          text: "What operating system do you prefer?",
          options: ["macOS", "Windows"],
        },
        clarification: null,
        assistantMessage: "What operating system do you prefer?",
        patchesApplied: [],
        rejectedPatches: [],
        missingInformation: [],
        modelUsed: "deterministic",
      },
    });

    assert.equal(result.shouldExecuteSearch, false, "shouldExecuteSearch must be strictly false when asking a question");
  });

  await t.test("Unit 6: MacBook under 1200 USD request streams search action and synchronizes workspace item for direct search", async () => {
    const initialSession: AuthoritativeShoppingSession = createInitialSession({
      sessionId: "session_macbook_test",
      initialQuery: "macbook under 1200 usd for programming",
    });

    const events: ConciergeStreamEvent[] = [];
    let streamedText = "";
    for await (const evt of streamConciergeTurn({
      userMessage: "macbook under 1200 usd for programming",
      session: initialSession,
    })) {
      events.push(evt);
      if (evt.type === "delta" && evt.text) {
        streamedText += evt.text;
      }
    }

    const doneEvt = events.find((e) => e.type === "done");
    assert.ok(doneEvt && doneEvt.session, "Stream must complete with a session");
    assert.equal(doneEvt.shouldExecuteSearch, true, "MacBook query with budget and use-case must execute search");
    assert.ok(!/\?\s*$/.test(streamedText.trim()), "Assistant message must not end in a question mark");

    const ws = doneEvt.session.workspace;
    assert.ok(ws, "Workspace must exist");
    assert.ok(ws.groups.length > 0, "Workspace must contain at least one group");

    const activeItem = getActiveWorkspaceItem(ws);
    assert.ok(activeItem, "Active workspace item must be retrievable");
    assert.ok(
      activeItem.productRequest.toLowerCase().includes("macbook") ||
      (activeItem.displayName && activeItem.displayName.toLowerCase().includes("macbook")),
      "Active workspace item must be for MacBook"
    );

    // Verify search lifecycle transition on this item
    const searchId = `search_${activeItem.id}_1_${Date.now()}`;
    const searchingWs = updateItemSearchResults(ws, activeItem.id, {
      searchId,
      searchStatus: "searching",
    });
    assert.notEqual(searchingWs, ws, "Workspace must accept searching transition");
    const searchingItem = findItemInWorkspace(searchingWs, activeItem.id);
    assert.equal(searchingItem?.item.searchStatus, "searching");

    const completedWs = updateItemSearchResults(searchingWs, activeItem.id, {
      searchId,
      searchStatus: "completed",
      candidates: [],
    });
    assert.notEqual(completedWs, searchingWs, "Workspace must accept completed transition");
    const completedItem = findItemInWorkspace(completedWs, activeItem.id);
    assert.equal(completedItem?.item.searchStatus, "completed");
  });

  await t.test("Unit 7: 'asking for a macbook under 1200 usd for programming' streams search action with budget $1200 and MacBook item", async () => {
    const initialSession: AuthoritativeShoppingSession = createInitialSession({
      sessionId: "session_macbook_phrase_test",
      initialQuery: "asking for a macbook under 1200 usd for programming",
    });

    const events: ConciergeStreamEvent[] = [];
    for await (const evt of streamConciergeTurn({
      userMessage: "asking for a macbook under 1200 usd for programming",
      session: initialSession,
    })) {
      events.push(evt);
    }

    const doneEvt = events.find((e) => e.type === "done");
    assert.ok(doneEvt && doneEvt.session, "Stream must complete with a session");
    assert.equal(doneEvt.shouldExecuteSearch, true, "Search must be triggered");

    const activeItem = getActiveWorkspaceItem(doneEvt.session.workspace);
    assert.ok(activeItem, "Active workspace item must exist");
    assert.ok(Boolean(activeItem.displayName && activeItem.displayName.includes("MacBook")), "Display name must be MacBook");
    assert.equal(activeItem.individualBudget?.amountMinor, 120000);
    assert.equal(activeItem.individualBudget?.currency, "USD");
  });

  await t.test("Unit 8: Bare 'asking for a macbook under 1200 usd' without use-case asks primary use question", async () => {
    const initialSession: AuthoritativeShoppingSession = createInitialSession({
      sessionId: "session_macbook_bare_test",
      initialQuery: "asking for a macbook under 1200 usd",
    });

    const events: ConciergeStreamEvent[] = [];
    for await (const evt of streamConciergeTurn({
      userMessage: "asking for a macbook under 1200 usd",
      session: initialSession,
    })) {
      events.push(evt);
    }

    const doneEvt = events.find((e) => e.type === "done");
    assert.ok(doneEvt && doneEvt.session, "Stream must complete with a session");
    assert.equal(doneEvt.shouldExecuteSearch, false, "Search must wait for use-case clarification");
    assert.ok(doneEvt.session.activeQuestion, "Must ask primary use question");
    assert.equal(doneEvt.session.activeQuestion.attributeKey, "primary_use");
  });
});
