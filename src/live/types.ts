/**
 * Live Mode: a self-contained, database-free recovery session that can run on the
 * server (real Telegram crew) or entirely in the browser (rehearsal).
 * Everything in src/live is pure TypeScript with no I/O, except server.ts.
 */

export type Hour = number; // decimal hour of day, e.g. 19.5 = 19:30

export type Window = { start: Hour; end: Hour };

export type Seat =
  | { kind: "telegram"; chatId: number; handle: string; joinedAt: number }
  | { kind: "sim" };

export type CrewStatus =
  | "bench" // eligible, not contacted yet
  | "ineligible" // excluded by a hard rule (see whyNot)
  | "contacted"
  | "chased"
  | "negotiating" // replied with a condition / question, conversation open
  | "accepted" // tentative yes (subject to manager approval)
  | "declined"
  | "no_response"
  | "unreachable"
  | "human" // asked for a person; AI paused
  | "confirmed" // in the approved, published roster
  | "released"; // thanked and released after the plan was fixed

export type Condition = { kind: "transport" | "premium" | "other"; label: string; cost: number; allowed: boolean };

export type Offer = { window: Window; conditions: Condition[] };

export type Msg = {
  id: string;
  at: number;
  dir: "out" | "in";
  text: string;
  buttons?: Button[];
  /** outbound delivery */
  status?: "queued" | "sent" | "failed" | "retrying" | "abandoned";
  attempts?: number;
  nextAttemptAt?: number;
  evidence?: string;
  error?: string;
  /** inbound understanding */
  parsed?: ParsedReply;
  from?: "agent" | "manager";
  tag?: "welcome" | "offer" | "chase" | "confirm" | "release" | "info";
};

export type Button = { label: string; data: string };

export type Crew = {
  id: string;
  name: string;
  role: string;
  outlet: string;
  certified: boolean; // food-safety certificate, required to lead a close
  hoursThisWeek: number;
  maxHours: number;
  nextShiftStart?: Hour; // tomorrow's start as hours after today's midnight, e.g. 31 = 07:00 tomorrow
  onLeave?: boolean;
  travelMin: number;
  rate: number; // S$/h
  seat: Seat | null;
  status: CrewStatus;
  offer?: Offer;
  askedWindow?: Window; // window we asked them for (full shift, or a gap)
  thread: Msg[];
  contactedAt?: number;
  lastActivityAt?: number;
  chases: number;
  /** canned replies for the hands-free rehearsal autoplay */
  persona: string[];
};

export type Goal = {
  raw: string;
  absent: string;
  outlet: string;
  role: string;
  window: Window;
  budget: number;
  via: "heuristic" | "llm";
  confidence: number;
  assumptions: string[];
};

export type ReplyIntent =
  | "accept"
  | "partial"
  | "conditional"
  | "decline"
  | "ask_who"
  | "ask_pay"
  | "ask_where"
  | "question"
  | "human"
  | "withdraw"
  | "unclear";

export type ParsedReply = {
  intent: ReplyIntent;
  window?: Window;
  transport?: boolean;
  premium?: boolean;
  confidence: number;
  via: "button" | "heuristic" | "llm";
  note?: string;
};

export type GateKind = "outreach" | "package";

export type Gate = {
  id: string;
  kind: GateKind;
  title: string;
  lines: string[];
  extraCost: number;
  createdAt: number;
  status: "pending" | "approved" | "rejected";
  decidedAt?: number;
  /** what will happen on approval, frozen at creation */
  payload?: Plan;
};

export type Segment = { crewId: string; window: Window; base: number; extras: Condition[] };

export type Plan = {
  segments: Segment[];
  gaps: Window[];
  extraCost: number;
  baseCost: number;
  coveredHours: number;
  totalHours: number;
  withinBudget: boolean;
  explanation: string;
};

export type Phase = "lobby" | "awaiting_outreach" | "negotiating" | "awaiting_package" | "executing" | "done";

export type AuditEntry = {
  id: number;
  at: number;
  actor: "agent" | "manager" | "crew" | "system" | "presenter";
  tool: string;
  action: string;
  evidence?: string;
  status?: "ok" | "warn" | "fail" | "wait";
};

export type StepId = "understand" | "rank" | "approve_outreach" | "negotiate" | "replan" | "approve_package" | "execute" | "verify";

export type Step = { id: StepId; title: string; detail: string; status: "waiting" | "active" | "done" | "blocked" };

export type Baseline = { minutes: number; messages: number; apps: number; source: string };

export type Settings = {
  waveSize: number;
  maxContacts: number;
  chaseAfterSec: number;
  giveUpAfterSec: number;
  retryDelaySec: number;
  maxAttempts: number;
};

export type LiveState = {
  version: number;
  code: string;
  mode: "server" | "rehearsal";
  telegram: { enabled: boolean; bot?: string; error?: string };
  phase: Phase;
  crew: Crew[];
  goal?: Goal;
  plan?: Plan;
  gates: Gate[];
  steps: Step[];
  audit: AuditEntry[];
  manager: { chatId?: number; handle?: string };
  managerInbox: { id: number; at: number; text: string; buttons?: Button[] }[];
  failureInjected: boolean;
  startedAt?: number;
  finishedAt?: number;
  managerTaps: number;
  baseline: Baseline;
  settings: Settings;
  nextId: number;
  publishedRoster?: Segment[];
  verified?: { crewId: string; ok: boolean; evidence: string }[];
};

export type LiveEvent =
  | { type: "reset"; mode?: LiveState["mode"]; code?: string }
  | { type: "join"; chatId: number; handle: string }
  | { type: "manager_join"; chatId: number; handle: string }
  | { type: "goal"; text: string; goal: Goal }
  | { type: "decide"; gateId: string; approve: boolean; via: "projector" | "phone" | "telegram" }
  | { type: "reply"; crewId: string; text: string; parsed: ParsedReply }
  | { type: "send_result"; crewId: string; msgId: string; ok: boolean; evidence?: string; error?: string }
  | { type: "tick" }
  | { type: "failure"; on: boolean }
  | { type: "takeover"; crewId: string; on: boolean }
  | { type: "manager_say"; crewId: string; text: string }
  | { type: "baseline"; baseline: Partial<Baseline> }
  | { type: "settings"; settings: Partial<Settings> };

export type Effect =
  | { kind: "send"; crewId: string; msgId: string; text: string; buttons?: Button[] }
  | { kind: "send_chat"; chatId: number; text: string; buttons?: Button[] }
  | { kind: "notify_manager"; text: string; buttons?: Button[] };
