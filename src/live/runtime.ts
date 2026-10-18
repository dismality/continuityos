import { initialState, step } from "./engine.ts";
import { parseGoal, parseReply } from "./parse.ts";
import type { Button, Crew, Goal, LiveEvent, LiveState, ParsedReply, Window } from "./types.ts";

/**
 * Executes the engine's effects. The same class runs on the server (with a Telegram transport)
 * and in the browser (rehearsal: every seat is a simulated phone).
 */

export type SendResult = { ok: boolean; evidence?: string; error?: string };

export type Transport = {
  send(chatId: number, text: string, buttons?: Button[]): Promise<SendResult>;
};

export type Understanding = {
  reply(text: string, asked: Window, crew: Crew): Promise<ParsedReply>;
  goal(text: string): Promise<Goal>;
};

const heuristics: Understanding = {
  reply: async (text, asked) => parseReply(text, asked),
  goal: async (text) => parseGoal(text),
};

export function buttonToParsed(action: string, asked: Window): ParsedReply {
  if (action === "yes") return { intent: "accept", window: asked, confidence: 1, via: "button" };
  if (action === "no") return { intent: "decline", confidence: 1, via: "button" };
  return { intent: "partial", confidence: 1, via: "button", note: "ask_hours" };
}

const BUTTON_TEXT: Record<string, string> = { yes: "✅ Yes, all of it", part: "🕐 Part of it", no: "❌ Can't tonight" };

export class Runtime {
  state: LiveState;
  autoplay = false;
  private listeners = new Set<(s: LiveState) => void>();
  private persona = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    opts: { mode: LiveState["mode"]; code: string; telegram?: LiveState["telegram"] },
    private transport?: Transport,
    private understanding: Understanding = heuristics,
    private now: () => number = () => Date.now(),
  ) {
    this.state = initialState(opts);
  }

  start() {
    if (!this.timer) this.timer = setInterval(() => this.dispatch({ type: "tick" }), 1000);
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  subscribe(fn: (s: LiveState) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(ev: LiveEvent) {
    const before = this.state;
    const { state, effects } = step(this.state, ev, this.now());
    // quiet tick: keep the old state so pollers can use the version as an ETag
    if (ev.type === "tick" && effects.length === 0 && JSON.stringify({ ...state, version: 0 }) === JSON.stringify({ ...before, version: 0 })) return;
    this.state = state;
    if (ev.type === "reset") this.persona.clear();
    for (const fx of effects) void this.run(fx);
    this.listeners.forEach((fn) => fn(this.state));
  }

  // ───────────── inputs

  async goal(text: string) {
    const goal = await this.understanding.goal(text).catch(() => parseGoal(text));
    this.dispatch({ type: "goal", text, goal });
  }

  async inbound(crewId: string, text: string) {
    const c = this.state.crew.find((x) => x.id === crewId);
    if (!c) return;
    const asked = c.askedWindow ?? this.state.goal?.window ?? { start: 17, end: 23 };
    const parsed = await this.understanding.reply(text, asked, c).catch(() => parseReply(text, asked));
    this.dispatch({ type: "reply", crewId, text, parsed });
  }

  button(crewId: string, action: string) {
    const c = this.state.crew.find((x) => x.id === crewId);
    if (!c) return;
    const asked = c.askedWindow ?? this.state.goal?.window ?? { start: 17, end: 23 };
    this.dispatch({ type: "reply", crewId, text: BUTTON_TEXT[action] ?? action, parsed: buttonToParsed(action, asked) });
  }

  // ───────────── effects

  private async run(fx: ReturnType<typeof step>["effects"][number]) {
    if (fx.kind === "send_chat") {
      await this.transport?.send(fx.chatId, fx.text, fx.buttons).catch(() => undefined);
      return;
    }
    if (fx.kind === "notify_manager") {
      const chat = this.state.manager.chatId;
      if (chat) await this.transport?.send(chat, fx.text, fx.buttons).catch(() => undefined);
      return;
    }
    const crew = this.state.crew.find((c) => c.id === fx.crewId);
    if (!crew) return;
    const report = (r: SendResult) => this.dispatch({ type: "send_result", crewId: fx.crewId, msgId: fx.msgId, ...r });
    if (this.state.failureInjected) {
      setTimeout(() => report({ ok: false, error: "Injected outage: messaging API unreachable (ECONNREFUSED)" }), 700);
      return;
    }
    if (crew.seat?.kind === "telegram") {
      if (!this.transport) return report({ ok: false, error: "Telegram transport not configured" });
      const r = await this.transport.send(crew.seat.chatId, fx.text, fx.buttons).catch((e: Error) => ({ ok: false, error: e.message }) as SendResult);
      report(r);
      return;
    }
    // rehearsal seat: a simulated phone on the projector
    setTimeout(() => {
      report({ ok: true, evidence: `rehearsal phone · ${fx.msgId} (simulated, not a real delivery)` });
      if (this.autoplay) this.autoReply(crew.id, fx.msgId);
    }, 350);
  }

  /** Hands-free rehearsal: simulated crew answer from their scripted personas. */
  private autoReply(crewId: string, msgId: string) {
    const c = this.state.crew.find((x) => x.id === crewId);
    const m = c?.thread.find((x) => x.id === msgId);
    if (!c || !m || c.seat?.kind === "telegram") return;
    const wantsAnswer = m.tag === "offer" || m.tag === "chase" || (m.tag === "info" && !!m.buttons?.length);
    if (!wantsAnswer || c.status === "human") return;
    const i = this.persona.get(crewId) ?? 0;
    if (i >= c.persona.length) return;
    this.persona.set(crewId, i + 1);
    const line = c.persona[i];
    if (!line) return; // scripted silence (to show the follow-up logic)
    setTimeout(() => void this.inbound(crewId, line), 2200 + Math.random() * 2600);
  }
}
