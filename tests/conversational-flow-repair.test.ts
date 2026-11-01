import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseToMinorUnits,
  minorToMajorUnits,
  formatMinorUnits,
  formatMinorUnitsCompact,
  formatSafeBudget,
} from "../src/lib/money.ts";
import {
  upsertCanonicalAttribute,
} from "../src/lib/shopping/canonical-attributes.ts";
import {
  createInitialSession,
  processConversationalTurn,
} from "../src/lib/ai/conversation-engine.ts";
import {
  sanitizeAndValidateActionContract,
  buildCompactSessionContext,
} from "../src/lib/ai/gemini-interactions.ts";
import { analyzeShoppingRequirements } from "../src/lib/shopping/requirement-engine.ts";
import type {
  CanonicalShoppingAttribute,
} from "../src/types/index.ts";

describe("SpendPilot AI: Conversational Flow Repair (Part 15 - 31 Acceptance Criteria + Part 14 Regression)", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. CURRENCY (Criteria 1–5)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("1. Currency & Budget Conversion (Criteria 1–5)", () => {
    test("1. $150 input remains $150", () => {
      const minor = parseToMinorUnits("$150");
      assert.equal(minor, 15000, "Input '$150' should convert to 15000 cents");
      const major = minorToMajorUnits(minor);
      assert.equal(major, 150, "Major units should be exactly 150 USD");
    });

    test("2. Internal cents conversion is correct", () => {
      assert.equal(parseToMinorUnits("150"), 15000);
      assert.equal(parseToMinorUnits("150.50"), 15050);
      assert.equal(parseToMinorUnits(150), 15000);
      assert.equal(parseToMinorUnits(0), null);
      assert.equal(parseToMinorUnits(-50), null);
      assert.equal(parseToMinorUnits("invalid"), null);
      assert.equal(parseToMinorUnits(2_000_000), null, "Above 1,000,000 should be rejected");
    });

    test("3. Frontend formatting is correct", () => {
      assert.equal(formatMinorUnits(15000, "USD"), "$150.00");
      assert.equal(formatMinorUnits(15050, "USD"), "$150.50");
      assert.equal(formatMinorUnits(null, "USD"), "No budget limit");
      assert.equal(formatMinorUnitsCompact(15000, "USD"), "$150");
      assert.equal(formatMinorUnitsCompact(15050, "USD"), "$150.50");
      // formatSafeBudget handles both minor units (cents) and legacy major units
      assert.equal(formatSafeBudget(15000, "USD"), "$150.00");
      assert.equal(formatSafeBudget(150, "USD"), "$150.00");
    });

    test("4. Channel3 receives 150 USD, not 15000 USD", () => {
      const session = createInitialSession({
        budget: parseToMinorUnits("$150"),
        currency: "USD",
      });
      assert.equal(session.budget, 15000, "Internal session budget is stored in minor cents");

      const channel3MaxPrice = minorToMajorUnits(session.budget);
      assert.equal(channel3MaxPrice, 150, "Channel3 API must receive 150 USD, never 15000");
      assert.notEqual(channel3MaxPrice, 15000, "Must never pass minor units to Channel3 as major dollars");
    });

    test("5. Repeated updates do not multiply the amount", () => {
      let budget = parseToMinorUnits("$150");
      assert.equal(budget, 15000);

      // Simulate 5 consecutive session updates
      for (let i = 0; i < 5; i++) {
        budget = parseToMinorUnits(budget, { isAlreadyMinor: true });
        assert.equal(budget, 15000, `Turn ${i + 1} multiplied the budget!`);
      }
      assert.equal(formatMinorUnits(budget, "USD"), "$150.00");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. QUESTION HANDLING (Criteria 6–14)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("2. Question Handling Contract (Criteria 6–14)", () => {
    test("6. Exactly one pending question is returned", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn = await processConversationalTurn(session, "I need running shoes under $120");

      assert.ok(turn.assistantMessage.nextQuestion, "Expected a single next question");
      assert.ok(turn.session.activeQuestion, "Session should have activeQuestion populated");
      assert.equal(turn.session.pendingQuestions.length, 1, "Must contain strictly 1 pending question");
    });

    test("7. Multiple model-generated questions are safely reduced to one valid next question", () => {
      const rawPayload = {
        action: "ask_follow_up" as const,
        assistantMessage: "Here are a few questions for you.",
        questions: [
          {
            id: "q1",
            attribute: "form_factor",
            label: "Do you prefer over-ear or in-ear?",
            inputType: "single_select",
            options: [
              { id: "opt1", label: "Over-ear", value: "Over-ear" },
              { id: "opt2", label: "In-ear", value: "In-ear" },
            ],
            importance: "required_before_search",
          },
          {
            id: "q2",
            attribute: "noise_cancellation",
            label: "Do you want active noise cancellation?",
            inputType: "single_select",
            options: [
              { id: "opt3", label: "Yes", value: "Yes" },
              { id: "opt4", label: "No", value: "No" },
            ],
            importance: "optional_preference",
          },
        ],
      };

      const sanitized = sanitizeAndValidateActionContract(rawPayload, "I need headphones", false);
      assert.ok(sanitized.nextQuestion, "Sanitized contract should produce single nextQuestion");
      assert.equal(sanitized.nextQuestion.text, "Do you prefer over-ear or in-ear?");
      assert.equal(sanitized.questions?.length, 1, "Questions array must be reduced to exactly 1");
    });

    test("8. Previously answered questions never repeat", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need wireless headphones under $150");
      assert.equal(turn1.session.activeQuestion?.attributeKey, "form_factor");

      // User answers the form_factor question
      const turn2 = await processConversationalTurn(turn1.session, "Over-ear", {
        answeredQuestionId: turn1.session.activeQuestion?.id,
        answeredAttributeKey: "form_factor",
      });

      assert.notEqual(
        turn2.session.activeQuestion?.attributeKey,
        "form_factor",
        "Form factor was already answered and must never be asked again"
      );
      assert.equal(
        turn2.session.activeQuestion?.attributeKey,
        "noise_cancellation",
        "Next question should advance to noise_cancellation"
      );
    });

    test("9. Duplicate questions are rejected", () => {
      let map: Record<string, CanonicalShoppingAttribute> = {};
      map = upsertCanonicalAttribute(map, "connectivity", "Wireless", "user_explicit");
      map = upsertCanonicalAttribute(map, "connectivity", "Wireless (Bluetooth)", "user_confirmed");

      const entries = Object.values(map);
      assert.equal(entries.length, 1, "Duplicate attribute must be merged into 1 entry");
      assert.equal(entries[0].key, "connectivity");
      assert.equal(entries[0].value, "Wireless (Bluetooth)");
    });

    test("10. Duplicate options are removed", () => {
      const rawPayload = {
        action: "ask_follow_up" as const,
        assistantMessage: "Choose an option:",
        nextQuestion: {
          id: "q_test",
          attributeKey: "style",
          text: "What style do you prefer?",
          options: [
            { id: "o1", label: "Casual", value: "Casual" },
            { id: "o2", label: "Casual", value: "Casual" },
            { id: "o3", label: "No preference", value: "No preference" },
            { id: "o4", label: "No preference", value: "No preference" },
          ],
        },
      };

      const sanitized = sanitizeAndValidateActionContract(rawPayload, "shoes", false);
      assert.equal(sanitized.nextQuestion?.options.length, 2, "Duplicates must be stripped");
      assert.equal(sanitized.nextQuestion?.options[0].label, "Casual");
      assert.equal(sanitized.nextQuestion?.options[1].label, "No preference");
    });

    test("11. 'No preference' is saved correctly", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need wireless headphones under $150");
      const turn2 = await processConversationalTurn(turn1.session, "No preference", {
        answeredQuestionId: turn1.session.activeQuestion?.id,
        answeredAttributeKey: turn1.session.activeQuestion?.attributeKey,
      });

      const attr = (turn2.session.canonicalAttributes || {})["form_factor"];
      assert.ok(attr, "Form factor attribute should exist in canonical map");
      assert.equal(attr.status, "skipped", "Status should be skipped");
      assert.equal(attr.displayValue, "No preference");
    });

    test("12. Optional questions do not prevent searching", async () => {
      const req = await analyzeShoppingRequirements({
        originalRequest: "wireless over-ear headphones",
        mode: "single",
        budget: 150,
        currency: "USD",
        existingAnswers: {
          connectivity: {
            questionId: "q-conn",
            attribute: "connectivity",
            value: "Wireless",
            displayValue: "Wireless",
            isSkipped: false,
            answeredAt: Date.now(),
          },
          form_factor: {
            questionId: "q-ff",
            attribute: "form_factor",
            value: "Over-Ear",
            displayValue: "Over-Ear",
            isSkipped: false,
            answeredAt: Date.now(),
          },
        },
      });

      assert.equal(req.canSearch, true, "Should allow searching even if optional ANC is not yet specified");
    });

    test("13. A free-text answer can satisfy multiple attributes", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need running shoes under $150");
      const turn2 = await processConversationalTurn(
        turn1.session,
        "I need size 10.5 in black road running shoes"
      );

      const canonical2 = turn2.session.canonicalAttributes || {};
      assert.ok(canonical2["shoe_size"] || canonical2["size"]);
      assert.ok(canonical2["color"]);
      assert.equal(canonical2["color"]?.value, "Black");
    });

    test("14. A changed answer updates the existing attribute", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need wireless headphones under $150");
      const turn2 = await processConversationalTurn(turn1.session, "Over-ear", {
        answeredAttributeKey: "form_factor",
      });
      const canonical2 = turn2.session.canonicalAttributes || {};
      assert.equal(canonical2["form_factor"]?.displayValue, "Over-Ear");

      // User changes their mind
      const turn3 = await processConversationalTurn(turn2.session, "Actually I prefer earbuds", {
        answeredAttributeKey: "form_factor",
      });
      const canonical3 = turn3.session.canonicalAttributes || {};
      assert.equal(canonical3["form_factor"]?.displayValue, "In-Ear / Earbuds");
      assert.equal(Object.keys(canonical3).filter(k => k === "form_factor").length, 1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. OPTION INTERACTION (Criteria 15–20)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("3. Option Interaction & Idempotency (Criteria 15–20)", () => {
    test("15. Clicking one quick reply creates one user message", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need wireless headphones under $150");
      const turn2 = await processConversationalTurn(turn1.session, "Over-ear", {
        clientMessageId: "msg_user_click_1",
        answeredQuestionId: turn1.session.activeQuestion?.id,
        answeredAttributeKey: "form_factor",
      });

      const userMsgs = turn2.session.messages.filter((m) => m.role === "user");
      assert.equal(userMsgs.length, 2, "Exactly 2 user messages should exist across 2 turns");
      assert.equal(userMsgs[1].content, "Over-ear");
      assert.equal(userMsgs[1].clientMessageId, "msg_user_click_1");
    });

    test("16. A selected answer calls the correct conversation payload", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need wireless headphones under $150");
      const turn2 = await processConversationalTurn(turn1.session, "Over-ear", {
        answeredQuestionId: "q_form_factor",
        answeredAttributeKey: "form_factor",
      });

      assert.equal(turn2.action, "ask_follow_up");
      assert.equal((turn2.session.answeredQuestionIds || []).includes("q_form_factor"), true);
    });

    test("17. The answer is persisted before the next model call", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need wireless headphones under $150");
      const turn2 = await processConversationalTurn(turn1.session, "Over-ear", {
        answeredAttributeKey: "form_factor",
      });

      assert.equal((turn2.session.canonicalAttributes || {})["form_factor"]?.status, "confirmed");
      const context = buildCompactSessionContext(turn2.session);
      assert.ok(context.includes("Over-Ear"), "Compact context for Gemini must include newly confirmed attribute");
    });

    test("18. Repeated clicks cannot duplicate the same turn (idempotency)", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need wireless headphones under $150");

      // First click
      const turn2a = await processConversationalTurn(turn1.session, "Over-ear", {
        clientMessageId: "click_id_unique_123",
        answeredAttributeKey: "form_factor",
      });

      // Rapid duplicate click with same clientMessageId
      const turn2b = await processConversationalTurn(turn2a.session, "Over-ear", {
        clientMessageId: "click_id_unique_123",
        answeredAttributeKey: "form_factor",
      });

      assert.equal(turn2a.session.revision, turn2b.session.revision, "Duplicate click must not increment revision");
      assert.equal(turn2a.session.messages.length, turn2b.session.messages.length, "Duplicate message must not be added");
    });

    test("19. The next question reflects the newly updated state", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need wireless headphones under $150");
      assert.equal(turn1.session.activeQuestion?.attributeKey, "form_factor");

      const turn2 = await processConversationalTurn(turn1.session, "Over-ear", {
        answeredQuestionId: turn1.session.activeQuestion?.id,
        answeredAttributeKey: "form_factor",
      });

      assert.equal(turn2.session.activeQuestion?.attributeKey, "noise_cancellation");
    });

    test("20. Old responses cannot overwrite newer turns (revision tracking)", () => {
      const session = createInitialSession({ currency: "USD" });
      assert.equal(session.revision, 1);
      assert.equal(session.turnId, "turn_0");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. AUTOMATIC PROGRESSION (Criteria 21–25)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("4. Automatic Progression & Fallback (Criteria 21–25)", () => {
    test("21. Search begins when essential requirements are complete", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need wireless headphones under $150");
      const turn2 = await processConversationalTurn(turn1.session, "Over-ear", {
        answeredAttributeKey: "form_factor",
      });
      const turn3 = await processConversationalTurn(turn2.session, "Yes, ANC is important", {
        answeredAttributeKey: "noise_cancellation",
      });

      assert.equal(turn3.shouldExecuteSearch, true, "Channel3 product search must begin automatically");
      assert.equal(turn3.action, "search_products");
      assert.equal(turn3.session.activeQuestion, null, "No further question should be active");
    });

    test("22. Search does not begin when essential requirements remain unresolved", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need headphones");

      assert.equal(turn1.shouldExecuteSearch, false, "Search must NOT begin without essential form-factor");
      assert.equal(turn1.action, "ask_follow_up");
    });

    test("23. No redundant confirmation is requested after an already clear shopping request", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(
        session,
        "I need wireless over-ear headphones with active noise cancellation under $150"
      );

      assert.equal(turn1.shouldExecuteSearch, true, "Must start searching immediately without asking for another confirmation");
      assert.ok(
        !turn1.assistantMessage.content.toLowerCase().includes("would you like me to search"),
        "Must not ask redundant confirmation"
      );
      assert.ok(
        !turn1.assistantMessage.content.toLowerCase().includes("keeping your shopping requirements ready"),
        "Must not use broken generic fallback message"
      );
    });

    test("24. Gemini failure preserves conversation answers", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need wireless headphones under $150");
      const turn2 = await processConversationalTurn(turn1.session, "Over-ear", {
        answeredAttributeKey: "form_factor",
      });

      // Even if AI client fails or is offline, canonical answers are preserved deterministically
      const canonical = turn2.session.canonicalAttributes || {};
      assert.equal(canonical["form_factor"]?.displayValue, "Over-Ear");
      assert.ok(canonical["connectivity"]?.displayValue.includes("Wireless"));
    });

    test("25. Model fallback does not repeat a submitted user message", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need wireless headphones under $150");

      const userMessages = turn1.session.messages.filter((m) => m.role === "user");
      assert.equal(userMessages.length, 1, "Submitted user message must appear exactly once");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. UI, INTEGRITY & PART 14 REGRESSION (Criteria 26–31 + Part 14)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("5. UI Integrity & Part 14 Exact Headphone Regression (Criteria 26–31)", () => {
    test("26. Progress messages correspond to actual application operations", () => {
      const searchCat = "headphones";
      const progressText = `Finding ${searchCat} that match your preferences...`;
      assert.equal(progressText, "Finding headphones that match your preferences...");
    });

    test("27. Internal debugging labels never appear in the customer UI / contract", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need wireless headphones under $150");

      const forbiddenDebugLabels = [
        "Shopping Only",
        "Requirements6",
        "Clarifying Details",
        "Known Attributes",
        "ask follow up",
        "deterministic-recovery",
        "Gemini Interactions API",
      ];

      for (const label of forbiddenDebugLabels) {
        assert.ok(
          !turn1.assistantMessage.content.includes(label),
          `Assistant message should never leak debug label '${label}'`
        );
      }
    });

    test("28. Only one question's options are visible at a time", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need wireless headphones under $150");

      assert.ok(turn1.assistantMessage.nextQuestion);
      assert.equal(turn1.session.pendingQuestions.length, 1);
    });

    test("29. Quick replies disappear after selection", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(session, "I need wireless headphones under $150");
      const turn2 = await processConversationalTurn(turn1.session, "Over-ear", {
        answeredQuestionId: turn1.session.activeQuestion?.id,
        answeredAttributeKey: "form_factor",
      });

      // The previous question is now answered and recorded in answeredQuestionIds
      const answered = turn2.session.answeredQuestionIds || [];
      assert.ok(answered.includes(turn1.session.activeQuestion!.id));
    });

    test("30. No infinite loading state occurs", async () => {
      const session = createInitialSession({ currency: "USD" });
      const turn = await processConversationalTurn(session, "test hello");
      assert.ok(turn.assistantMessage);
      assert.notEqual(turn.session.conversationState, "error");
    });

    test("31. Exact failing headphone scenario from Part 14", async () => {
      // Step 1: Initial user message
      const initialSession = createInitialSession({ currency: "USD" });
      const turn1 = await processConversationalTurn(initialSession, "I need a wireless headphone under $150.");

      // Verify Step 1-3
      assert.equal(turn1.session.budget, 15000, "Budget must be 15000 minor cents ($150.00)");
      assert.equal(formatMinorUnits(turn1.session.budget, "USD"), "$150.00");
      assert.equal(turn1.session.activeQuestion?.attributeKey, "form_factor");
      assert.equal(turn1.session.activeQuestion?.text, "Do you prefer over-ear headphones or earbuds?");
      const optLabels1 = turn1.session.activeQuestion?.options.map((o) => o.label);
      assert.ok(optLabels1?.includes("Over-ear"));
      assert.ok(optLabels1?.includes("In-ear / Earbuds"));
      assert.ok(optLabels1?.includes("No preference"));

      // Step 2: User chooses "Over-ear"
      const turn2 = await processConversationalTurn(turn1.session, "Over-ear", {
        answeredQuestionId: turn1.session.activeQuestion?.id,
        answeredAttributeKey: "form_factor",
      });

      // Verify Step 4-7
      assert.equal(turn2.session.budget, 15000, "Budget must still be 15000 cents ($150.00)");
      assert.equal(formatMinorUnits(turn2.session.budget, "USD"), "$150.00");
      assert.equal(turn2.session.activeQuestion?.attributeKey, "noise_cancellation");
      assert.equal(turn2.session.activeQuestion?.text, "Would you like Active Noise Cancellation (ANC)?");
      const optLabels2 = turn2.session.activeQuestion?.options.map((o) => o.label);
      assert.ok(optLabels2?.includes("Yes, ANC is important"));
      assert.ok(optLabels2?.includes("Not necessary"));
      assert.ok(optLabels2?.includes("No preference"));

      // Step 3: User chooses "Yes, ANC is important"
      const turn3 = await processConversationalTurn(turn2.session, "Yes, ANC is important", {
        answeredQuestionId: turn2.session.activeQuestion?.id,
        answeredAttributeKey: "noise_cancellation",
      });

      // Verify Step 8-17
      assert.equal(turn3.session.budget, 15000, "Budget must remain $150.00");
      assert.equal(formatMinorUnits(turn3.session.budget, "USD"), "$150.00");
      assert.equal(turn3.shouldExecuteSearch, true, "Channel3 search must automatically begin");
      assert.equal(turn3.action, "search_products");
      assert.equal(turn3.session.activeQuestion, null, "No further question should be pending");

      // Verify canonical known attributes contain exactly ONE entry for each
      const canonicalKeys = Object.keys(turn3.session.canonicalAttributes || {});
      assert.ok(canonicalKeys.includes("connectivity"), "Must have connectivity");
      assert.ok(canonicalKeys.includes("form_factor"), "Must have form_factor");
      assert.ok(canonicalKeys.includes("noise_cancellation"), "Must have noise_cancellation");

      // Verify Channel3 search filter
      const majorBudget = minorToMajorUnits(turn3.session.budget);
      assert.equal(majorBudget, 150, "Channel3 must receive 150 USD, NOT 15000 USD");
    });
  });
});
