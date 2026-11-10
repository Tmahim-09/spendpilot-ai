/**
 * SpendPilot Turn Call Tracker & Observability (Section 19)
 *
 * Lightweight development-only tracking of per-turn API call counts:
 * - Session revision
 * - Client submission ID
 * - Gemini calls
 * - Channel3 search calls
 * - Channel3 lookup calls
 * - Search fingerprint
 * - Decision reason
 */

export interface CallDetail {
  service: "gemini" | "channel3_search" | "channel3_lookup";
  reason: string;
  timestamp: number;
}

export interface TurnCallMetrics {
  sessionRevision: number;
  submissionId: string;
  geminiCalls: number;
  channel3SearchCalls: number;
  channel3LookupCalls: number;
  searchFingerprint?: string;
  decisionReason: string;
  callDetails: CallDetail[];
}

export class TurnTracker {
  private metrics: TurnCallMetrics;

  constructor(submissionId: string, sessionRevision: number = 1) {
    this.metrics = {
      sessionRevision,
      submissionId,
      geminiCalls: 0,
      channel3SearchCalls: 0,
      channel3LookupCalls: 0,
      decisionReason: "initialized",
      callDetails: [],
    };
  }

  public recordGeminiCall(reason: string): void {
    this.metrics.geminiCalls++;
    this.metrics.callDetails.push({
      service: "gemini",
      reason,
      timestamp: Date.now(),
    });
  }

  public recordChannel3Search(query: string, reason: string = "product_search"): void {
    this.metrics.channel3SearchCalls++;
    this.metrics.searchFingerprint = this.computeFingerprint(query);
    this.metrics.callDetails.push({
      service: "channel3_search",
      reason: `${reason} (query="${query.slice(0, 40)}")`,
      timestamp: Date.now(),
    });
  }

  public recordChannel3Lookup(productId: string, reason: string = "product_lookup"): void {
    this.metrics.channel3LookupCalls++;
    this.metrics.callDetails.push({
      service: "channel3_lookup",
      reason: `${reason} (id="${productId}")`,
      timestamp: Date.now(),
    });
  }

  public setDecisionReason(reason: string): void {
    this.metrics.decisionReason = reason;
  }

  public setSearchFingerprint(fingerprint: string): void {
    this.metrics.searchFingerprint = fingerprint;
  }

  public getMetrics(): Readonly<TurnCallMetrics> {
    return { ...this.metrics, callDetails: [...this.metrics.callDetails] };
  }

  private computeFingerprint(input: string): string {
    const clean = input.trim().toLowerCase().replace(/\s+/g, " ");
    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
      hash = (hash << 5) - hash + clean.charCodeAt(i);
      hash |= 0;
    }
    return `fp_${Math.abs(hash).toString(16)}_${clean.slice(0, 24).replace(/[^a-z0-9]/g, "-")}`;
  }

  public formatLog(): string {
    const m = this.metrics;
    return `[SpendPilot Turn] submissionId=${m.submissionId} revision=${m.sessionRevision} geminiCalls=${m.geminiCalls} ch3Searches=${m.channel3SearchCalls} ch3Lookups=${m.channel3LookupCalls} reason="${m.decisionReason}" fingerprint="${m.searchFingerprint || "none"}"`;
  }

  public logSummary(): void {
    if (process.env.NODE_ENV !== "production" || process.env.SPENDPILOT_DEBUG === "true") {
      console.log(this.formatLog());
    }
  }
}

// Global active turn tracker for the current async execution context or fallback
let activeTracker: TurnTracker | null = null;

export function createTurnTracker(submissionId: string, sessionRevision: number = 1): TurnTracker {
  const tracker = new TurnTracker(submissionId, sessionRevision);
  activeTracker = tracker;
  return tracker;
}

export function getActiveTracker(): TurnTracker | null {
  return activeTracker;
}

export function setActiveTracker(tracker: TurnTracker | null): void {
  activeTracker = tracker;
}

export function trackGeminiCall(reason: string): void {
  if (activeTracker) {
    activeTracker.recordGeminiCall(reason);
  }
}

export function trackChannel3Search(query: string, reason: string = "product_search"): void {
  if (activeTracker) {
    activeTracker.recordChannel3Search(query, reason);
  }
}

export function trackChannel3Lookup(productId: string, reason: string = "product_lookup"): void {
  if (activeTracker) {
    activeTracker.recordChannel3Lookup(productId, reason);
  }
}

