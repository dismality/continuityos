import { buildPlan, conditionsFor, rank, whyNot } from "./planner.ts";
import { applyProfile, BUSINESS, DEFAULT_BASELINE, DEFAULT_SETTINGS, fmtHour, fmtWindow, freshCrew, freshSlots, overlaps } from "./scenario.ts";
import type { AuditEntry, Button, Crew, Effect, Gate, Goal, LiveEvent, LiveState, Msg, Notice, Plan, Slot, Step, Window } from "./types.ts";

/**
 * The agent as a pure state machine: (state, event, now) → (state, effects).
 * Drivers (server.ts for Telegram, the browser for rehearsal) perform the effects and feed
 * the results back in as events, so every send has a delivery receipt or a visible failure.
 *
 * The agent watches today's timetable (`slots`). Whenever a slot loses its person, through a
 * sick text, a no-show or a manager edit, it starts a recovery for that slot on its own.
 * There is no spending cap: extras within the manager's auto-approve rule are confirmed
 * automatically, anything above it is asked once.
 */

const PENDING = new Set<Crew["status"]>(["contacted", "chased", "negotiating", "human"]);
const IDLE = new Set<LiveState["phase"]>(["lobby", "checking", "done"]);

export function initialState(opts: { mode: LiveState["mode"]; code: string; telegram?: LiveState["telegram"] }): LiveState {
  const s: LiveState = {
    version: 1,
    code: opts.code,
    mode: opts.mode,
    telegram: opts.telegram ?? { enabled: false },
    phase: "lobby",
    crew: freshCrew(),
    gates: [],
    steps: [],
    audit: [],
    manager: {},
    managerInbox: [],
    failureInjected: false,
    managerTaps: 0,
    baseline: DEFAULT_BASELINE,
    settings: DEFAULT_SETTINGS,
    nextId: 1,
    slots: freshSlots(),
    queue: [],
    history: [],
    businessId: BUSINESS.id,
    tomorrow: freshSlots(),
    usual: Object.fromEntries(freshSlots().map((sl) => [sl.id, sl.assignments[0]?.crewId ?? ""])),
    notices: [],
  };
  syncCrew(s);
  s.steps = deriveSteps(s);
  return s;
}

type Ctx = { s: LiveState; fx: Effect[]; now: number };

export function step(prev: LiveState, ev: LiveEvent, now: number): { state: LiveState; effects: Effect[] } {
  const s: LiveState = structuredClone(prev);
  const ctx: Ctx = { s, fx: [], now };
  handle(ctx, ev);
  syncCrew(s);
  s.steps = deriveSteps(s);
  s.version = prev.version + 1;
  if (s.audit.length > 500) s.audit = s.audit.slice(-500);
  return { state: s, effects: ctx.fx };
}

// ───────────────────────── helpers

/** Derive each person's shifts today from the timetable. */
function syncCrew(s: LiveState) {
  for (const c of s.crew) {
    c.today = s.slots.flatMap((sl) => sl.assignments.filter((a) => a.crewId === c.id).map((a) => a.window));
    c.rostered = c.today.length > 0;
    c.tomorrow = (s.tomorrow ?? []).flatMap((sl) => sl.assignments.filter((a) => a.crewId === c.id).map((a) => a.window));
  }
}

function log(ctx: Ctx, actor: AuditEntry["actor"], tool: string, action: string, evidence?: string, status: AuditEntry["status"] = "ok") {
  ctx.s.audit.push({ id: ctx.s.nextId++, at: ctx.now, actor, tool, action, evidence, status });
}

const crewById = (s: LiveState, id: string) => s.crew.find((c) => c.id === id);
const slotById = (s: LiveState, id?: string) => s.slots.find((x) => x.id === id);
const slotOf = (s: LiveState, crewId: string) => s.slots.find((sl) => sl.assignments.some((a) => a.crewId === crewId));
const channelOf = (c: Crew) => (c.seat?.kind === "telegram" ? "Telegram" : "Simulated phone");
const lower = (x: string) => x[0].toLowerCase() + x.slice(1);

function send(ctx: Ctx, c: Crew, text: string, tag: Msg["tag"], buttons?: Button[], from: Msg["from"] = "agent") {
  const msg: Msg = { id: `m${ctx.s.nextId++}`, at: ctx.now, dir: "out", text, buttons, status: "queued", attempts: 1, tag, from };
  c.thread.push(msg);
  ctx.fx.push({ kind: "send", crewId: c.id, msgId: msg.id, text, buttons });
  return msg;
}

function notifyManager(ctx: Ctx, text: string, buttons?: Button[]) {
  ctx.s.managerInbox.push({ id: ctx.s.nextId++, at: ctx.now, text, buttons });
  if (ctx.s.managerInbox.length > 60) ctx.s.managerInbox.shift();
  ctx.fx.push({ kind: "notify_manager", text, buttons });
}

function remember(c: Crew, note: string) {
  c.notes = [...new Set([note, ...(c.notes ?? [])])].slice(0, 4);
}

const offerButtons = (c: Crew): Button[] => [
  { label: "✅ Yes, all of it", data: `r:${c.id}:yes` },
  { label: "🕐 Part of it", data: `r:${c.id}:part` },
  { label: "❌ Can't", data: `r:${c.id}:no` },
];

const gateButtons = (g: Gate): Button[] => [
  { label: "Approve", data: `g:${g.id}:1` },
  { label: "Reject", data: `g:${g.id}:0` },
];

const shiftLabel = (g: Pick<Goal, "outlet" | "role" | "window">) => `${g.outlet} ${lower(g.role)} shift, ${fmtWindow(g.window)}`;

// ───────────────────────── event handling

function handle(ctx: Ctx, ev: LiveEvent) {
  const { s, now } = ctx;
  switch (ev.type) {
    case "reset": {
      const keep = new Map(s.crew.map((c) => [c.id, c.seat]));
      const fresh = initialState({ mode: ev.mode ?? s.mode, code: ev.code ?? s.code, telegram: s.telegram });
      fresh.crew.forEach((c) => (c.seat = keep.get(c.id) ?? null));
      fresh.manager = s.manager;
      fresh.baseline = s.baseline;
      fresh.settings = s.settings;
      fresh.nextId = s.nextId;
      Object.assign(s, fresh);
      log(ctx, "presenter", "session", "Demo reset: timetable restored, joined phones kept");
      return;
    }

    case "business": {
      applyProfile(ev.id);
      handle(ctx, { type: "reset" });
      log(ctx, "presenter", "session", `Switched to ${BUSINESS.name} (${BUSINESS.industry}, ${BUSINESS.outlet})`);
      return;
    }

    case "leave": {
      const c = crewById(s, ev.crewId);
      if (!c) return;
      c.lastActivityAt = now;
      if (ev.day === "tomorrow") return earlyOut(ctx, c, ev.via ?? "leave_link");
      if (ev.day === "later" && ev.date) {
        if (s.notices.some((n) => n.crewId === c.id && n.date === ev.date)) return;
        return earlyOut(ctx, c, ev.via ?? "leave_link", ev.date);
      }
      const sl = slotOf(s, c.id);
      if (!sl) {
        log(ctx, "crew", "leave link", `${c.name} used the leave link for today but isn't on today's timetable`, undefined, "warn");
        return;
      }
      log(ctx, "crew", "leave link", `${c.name} used the leave link: can't work today`, "the reason stays private");
      send(ctx, c, `Got it, ${c.name}. Thanks for telling us 🙏 I'll find cover for your ${fmtWindow(sl.window)} shift today; you don't need to do anything else.`, "info");
      dropOut(ctx, c, "sick", "Reported through the leave link");
      return;
    }

    case "checkin_tomorrow": {
      s.checkinAt = now;
      let n = 0;
      for (const c of s.crew) {
        const sl = tomorrowSlotOf(s, c.id);
        if (!sl || c.checkin === "out" || c.aiPaused) continue;
        c.checkin = "asked";
        send(ctx, c, `Evening check-in 🌙 You're on tomorrow's ${lower(sl.role)} shift, ${fmtWindow(sl.window)}. Still good? Reply yes, or tell me if you can't make it so I can sort cover early.`, "checkin");
        n++;
      }
      log(ctx, "agent", "check-in", `Evening check-in sent to ${n} people on tomorrow's timetable`, "gaps are found the night before, not at the door");
      return;
    }

    case "join": {
      const existing = s.crew.find((c) => c.seat?.kind === "telegram" && c.seat.chatId === ev.chatId);
      if (existing) {
        ctx.fx.push({ kind: "send_chat", chatId: ev.chatId, text: `You're already ${existing.name} 🙂 Keep this chat open.` });
        return;
      }
      const close = slotById(s, "close-lead")!;
      const order = [close.assignments[0]?.crewId ?? "aisha", ...rank(s.crew, { window: close.window, absent: "", needsCert: true }).map((r) => r.crewId)];
      const free = order.map((id) => crewById(s, id)).find((c) => c && (c.seat === null || c.seat.kind === "sim"));
      if (!free) {
        ctx.fx.push({ kind: "send_chat", chatId: ev.chatId, text: "All crew seats are taken for this round. Enjoy the show! 🍿" });
        return;
      }
      free.seat = { kind: "telegram", chatId: ev.chatId, handle: ev.handle, joinedAt: now };
      log(ctx, "crew", "telegram", `${ev.handle} joined as ${free.name}`, `chat ${ev.chatId}`);
      const mine = slotOf(s, free.id);
      send(
        ctx,
        free,
        mine
          ? `Welcome to ${BUSINESS.name} 👋\n\nYou are *${free.name}*, on today's ${lower(mine.role)} shift, ${fmtWindow(mine.window)}.\n\nWhen the presenter gives the signal, text me that you can't come in, in your own words. Or stay silent when I check on you, to see what happens with a no-show.\n\nCan't make a shift tomorrow? Just tell me here, e.g. \"can't make it tmr\", and I'll sort cover early.`
          : `Welcome to ${BUSINESS.name} 👋\n\nFor the next few minutes you are *${free.name}*, ${lower(free.role)} at our ${free.outlet} outlet. You've worked ${free.hoursThisWeek}h of ${free.maxHours}h this week.\n\nKeep this chat open. If a shift needs cover I'll message you here. Reply however you like: "yes", "only after 7", "need a ride", "can I talk to the manager"... I'll understand.\n\nCan't make a shift tomorrow? Tell me here any time and I'll arrange cover early.`,
        "welcome",
      );
      return;
    }

    case "manager_join": {
      s.manager = { chatId: ev.chatId, handle: ev.handle };
      log(ctx, "manager", "telegram", `${ev.handle} connected as manager`, `chat ${ev.chatId}`);
      ctx.fx.push({
        kind: "send_chat",
        chatId: ev.chatId,
        text: `You're the manager of ${BUSINESS.name}. You don't need to do anything.\n\nI watch today's timetable. If someone calls in sick, doesn't show up or a slot is left empty, I find cover myself using your rules: ${BUSINESS.certNeed} for lead shifts, hour caps and rest respected, extras up to S$${s.settings.autoApproveSpend} without asking.\n\nI'll only message you if something needs a decision, and once more when it's sorted. To talk to someone yourself, write "Daniel: your message".`,
      });
      return;
    }

    case "goal": {
      const target =
        s.crew.find((c) => c.rostered && new RegExp(`\\b${c.name}\\b`, "i").test(ev.text)) ?? crewById(s, slotById(s, "close-lead")?.assignments[0]?.crewId ?? "");
      if (!target || !IDLE.has(s.phase)) return;
      log(ctx, "manager", "report", `Manager reported: "${ev.text}"`);
      dropOut(ctx, target, "manager", ev.text);
      return;
    }

    case "no_show": {
      const c = crewById(s, ev.crewId);
      const sl = c && slotOf(s, c.id);
      if (!c || !sl || !IDLE.has(s.phase) || s.phase === "checking") return;
      s.phase = "checking";
      c.status = "checking";
      c.lastActivityAt = now;
      log(ctx, "agent", "check-in", `${c.name} hasn't checked in 10 minutes after the ${fmtHour(sl.window.start)} start`, `${sl.role} ${fmtWindow(sl.window)}`, "warn");
      send(ctx, c, `Hi ${c.name}, your ${lower(sl.role)} shift started at ${fmtHour(sl.window.start)} and you haven't checked in. Are you on your way?`, "check", [
        { label: "🏃 On my way", data: `r:${c.id}:onway` },
        { label: "🤒 Can't make it", data: `r:${c.id}:cant` },
      ]);
      return;
    }

    case "assign": {
      const sl = slotById(s, ev.slotId);
      if (!sl) return;
      const before = sl.assignments.map((a) => crewById(s, a.crewId)!.name).join(" + ") || "empty";
      if (ev.crewId) {
        const c = crewById(s, ev.crewId);
        if (!c) return;
        const rule = whyNot({ ...c, today: [] }, { window: sl.window, absent: "", needsCert: sl.needsCert }) ?? (c.today?.some((w) => overlaps(w, sl.window)) ? "Already working at that time" : null);
        sl.assignments = [{ crewId: c.id, window: sl.window, source: "manager" }];
        log(ctx, "manager", "timetable", `Manager put ${c.name} on ${sl.role} ${fmtWindow(sl.window)} (was ${before})`, rule ? `override: ${rule}` : "within the rules", rule ? "warn" : "ok");
        if (s.goal?.slotId === sl.id && !IDLE.has(s.phase)) closeIncident(ctx, `manager filled it by hand with ${c.name}`);
        s.queue = s.queue.filter((q) => q !== sl.id);
        return;
      }
      if (sl.assignments.length === 0) return;
      const leaving = sl.assignments.map((a) => crewById(s, a.crewId)!);
      sl.assignments = [];
      log(ctx, "manager", "timetable", `Manager cleared ${sl.role} ${fmtWindow(sl.window)} (was ${before})`, undefined, "warn");
      startOrQueue(ctx, sl, "open_slot", leaving[0], `${sl.role} ${fmtWindow(sl.window)} was left empty`);
      return;
    }

    case "decide": {
      const g = s.gates.find((x) => x.id === ev.gateId);
      if (!g || g.status !== "pending") return;
      g.status = ev.approve ? "approved" : "rejected";
      g.decidedAt = now;
      s.managerTaps++;
      log(ctx, "manager", ev.via, `${ev.approve ? "Approved" : "Rejected"}: ${g.title}`, `tap #${s.managerTaps}`, ev.approve ? "ok" : "warn");
      if (g.kind === "outreach") {
        if (!ev.approve) return closeIncident(ctx, "manager chose to handle it");
        s.phase = "negotiating";
        contactWave(ctx);
        return;
      }
      if (!ev.approve) {
        s.phase = "negotiating";
        log(ctx, "agent", "planner", "Manager rejected the spend: keeping offers open and looking for alternatives", undefined, "warn");
        contactWave(ctx);
        return;
      }
      execute(ctx, g.payload!);
      return;
    }

    case "reply": {
      const c = crewById(s, ev.crewId);
      if (!c) return;
      c.thread.push({ id: `m${s.nextId++}`, at: now, dir: "in", text: ev.text, parsed: ev.parsed });
      c.lastActivityAt = now;
      log(
        ctx,
        "crew",
        channelOf(c),
        `${c.name}: "${ev.text}"`,
        `understood as ${ev.parsed.intent.replace("_", " ")}${ev.parsed.window ? ` ${fmtWindow(ev.parsed.window)}` : ""}${ev.parsed.transport ? " +ride" : ""} · ${Math.round(ev.parsed.confidence * 100)}% · ${ev.parsed.via}`,
      );
      onReply(ctx, c, ev.parsed);
      return;
    }

    case "send_result": {
      const c = crewById(s, ev.crewId);
      const m = c?.thread.find((x) => x.id === ev.msgId);
      if (!c || !m) return;
      if (ev.ok) {
        m.status = "sent";
        m.evidence = ev.evidence;
        if (m.tag !== "welcome") log(ctx, "agent", channelOf(c), `Delivered ${m.from === "manager" ? "manager's message" : (m.tag ?? "message")} to ${c.name}`, ev.evidence);
        if (s.phase === "executing") verify(ctx);
        return;
      }
      m.error = ev.error;
      if ((m.attempts ?? 1) < s.settings.maxAttempts) {
        m.status = "retrying";
        m.nextAttemptAt = now + s.settings.retryDelaySec * 1000 * (m.attempts ?? 1);
        log(ctx, "agent", channelOf(c), `Send to ${c.name} failed (attempt ${m.attempts}/${s.settings.maxAttempts}), retrying in ${s.settings.retryDelaySec * (m.attempts ?? 1)}s`, ev.error, "warn");
        return;
      }
      m.status = "abandoned";
      log(ctx, "agent", channelOf(c), `Could not reach ${c.name} after ${m.attempts} attempts`, ev.error, "fail");
      if (m.tag === "offer" || m.tag === "chase") {
        c.status = "unreachable";
        replan(ctx, `${c.name} unreachable`);
      } else if (m.tag === "confirm") {
        notifyManager(ctx, `⚠️ I couldn't deliver ${c.name}'s confirmation after ${m.attempts} tries. Please call them directly.`);
        verify(ctx);
      }
      return;
    }

    case "tick": {
      for (const c of s.crew)
        for (const m of c.thread)
          if (m.status === "retrying" && (m.nextAttemptAt ?? 0) <= now) {
            m.status = "queued";
            m.attempts = (m.attempts ?? 1) + 1;
            ctx.fx.push({ kind: "send", crewId: c.id, msgId: m.id, text: m.text, buttons: m.buttons });
          }
      for (const n of s.notices ?? [])
        if (n.status === "finding") {
          const c = crewById(s, n.asked[n.asked.length - 1]);
          if (c && c.advance === n.id && c.advanceAt && (now - c.advanceAt) / 1000 >= s.settings.giveUpAfterSec) {
            c.advance = undefined;
            log(ctx, "agent", "planner", `Tomorrow: no reply from ${c.name}, asking the next person`, undefined, "warn");
            advanceAsk(ctx, n);
          }
        }
      if (s.phase === "checking") {
        const c = s.crew.find((x) => x.status === "checking");
        if (c && c.lastActivityAt && (now - c.lastActivityAt) / 1000 >= s.settings.noShowWaitSec) {
          log(ctx, "agent", "check-in", `No reply from ${c.name} ${s.settings.noShowWaitSec}s after the check-in message: treating it as a no-show`, undefined, "warn");
          dropOut(ctx, c, "no_show", "No check-in and no reply");
        }
        return;
      }
      if (s.phase !== "negotiating" && s.phase !== "awaiting_package") return;
      for (const c of s.crew) {
        const delivered = c.thread.some((m) => m.tag === "offer" && m.status === "sent");
        if (!delivered || !c.lastActivityAt || c.aiPaused) continue;
        const idle = (now - c.lastActivityAt) / 1000;
        if (c.status === "contacted" && idle >= s.settings.chaseAfterSec) {
          c.status = "chased";
          c.chases++;
          c.lastActivityAt = now;
          log(ctx, "agent", "follow-up", `No reply from ${c.name} after ${s.settings.chaseAfterSec}s: sending one reminder`, undefined, "wait");
          send(ctx, c, `Hi ${c.name}, just checking: any chance you can do ${fmtWindow(c.askedWindow ?? s.goal!.window)} today? A quick yes or no helps a lot 🙏`, "chase", offerButtons(c));
        } else if (c.status === "chased" && idle >= s.settings.giveUpAfterSec - s.settings.chaseAfterSec) {
          c.status = "no_response";
          remember(c, "Slow to reply to shift offers");
          log(ctx, "agent", "follow-up", `No reply from ${c.name} after a reminder: moving to the next person`, undefined, "warn");
          replan(ctx, `${c.name} did not reply`);
        }
      }
      return;
    }

    case "failure":
      s.failureInjected = ev.on;
      log(ctx, "presenter", "chaos", ev.on ? "Injected failure: outbound messaging is down" : "Messaging restored", undefined, ev.on ? "fail" : "ok");
      return;

    case "ai_toggle":
    case "takeover": {
      const c = crewById(s, ev.crewId);
      if (!c) return;
      const pause = ev.type === "takeover" ? ev.on : !ev.on;
      c.aiPaused = pause;
      if (pause) {
        if (PENDING.has(c.status)) c.status = "human";
        log(ctx, "manager", "handover", `AI turned off for ${c.name}: the manager handles this chat by hand`);
      } else {
        if (c.status === "human") c.status = c.offer ? "accepted" : "negotiating";
        log(ctx, "manager", "handover", `AI turned back on for ${c.name}`);
        if (s.goal && !IDLE.has(s.phase)) replan(ctx, `${c.name} handed back to the agent`);
      }
      return;
    }

    case "manager_say": {
      const c = crewById(s, ev.crewId);
      if (!c) return;
      send(ctx, c, ev.text, "info", undefined, "manager");
      log(ctx, "manager", channelOf(c), `Manager messaged ${c.name} by hand`, ev.text.slice(0, 80));
      return;
    }

    case "offer_to": {
      const c = crewById(s, ev.crewId);
      if (!c || !s.goal || IDLE.has(s.phase)) return;
      const reason = whyNot(c, s.goal);
      if (reason) {
        log(ctx, "agent", "rules", `Did not offer the shift to ${c.name}`, reason, "warn");
        return;
      }
      log(ctx, "manager", "outreach", `Manager asked the agent to offer the shift to ${c.name}`);
      offer(ctx, c, (s.plan?.segments.length ? s.plan.gaps[0] : undefined) ?? s.goal.window, "requested by the manager");
      return;
    }

    case "baseline":
      s.baseline = { ...s.baseline, ...ev.baseline };
      return;
    case "settings":
      s.settings = { ...s.settings, ...ev.settings };
      return;
  }
}

function onReply(ctx: Ctx, c: Crew, parsed: NonNullable<Msg["parsed"]>) {
  const { s } = ctx;
  let p = parsed;
  const mine = slotOf(s, c.id);
  const lastText = c.thread[c.thread.length - 1].text;

  // ahead-of-time cover for tomorrow: an open offer, the evening check-in, or "can't make it tmr" in chat
  if (c.advance !== undefined && onAdvanceReply(ctx, c, p)) return;
  const outIntent = p.intent === "cannot_work" || p.intent === "decline" || p.intent === "withdraw";
  if (c.checkin === "asked") {
    if (outIntent) return tomorrowOut(ctx, c, "checkin");
    if (p.intent === "accept" || p.intent === "on_way" || p.intent === "partial" || p.intent === "conditional") {
      c.checkin = "ok";
      log(ctx, "agent", "check-in", `${c.name} confirmed tomorrow's shift`);
      send(ctx, c, "Great, see you tomorrow 👍", "info");
      return;
    }
  }
  if (outIntent && /\b(tmr|tmrw|tml|tomorrow|tomolo)\b/i.test(lastText) && tomorrowSlotOf(s, c.id)) return tomorrowOut(ctx, c, "chat");

  // someone on today's timetable talking about their own shift
  if (mine && c.status !== "confirmed" && !PENDING.has(c.status) && c.status !== "accepted") {
    const out = p.intent === "cannot_work" || p.intent === "withdraw" || p.intent === "decline";
    if (out && IDLE.has(s.phase)) {
      if (c.aiPaused) return void notifyManager(ctx, `💬 ${c.name} (you're handling this chat): "${lastText}"`);
      send(ctx, c, `Thanks for telling us, ${c.name}. Rest up 🙏 I'll find cover for your ${fmtWindow(mine.window)} shift; you don't need to do anything else.`, "info");
      dropOut(ctx, c, "sick", lastText);
      return;
    }
    if ((p.intent === "on_way" || p.intent === "accept") && c.status === "checking") {
      c.status = "bench";
      s.phase = s.history.length ? "done" : "lobby";
      log(ctx, "agent", "check-in", `${c.name} is on the way: no cover needed`);
      send(ctx, c, "Great, see you soon! No need to reply further.", "info");
      return;
    }
    if (out) {
      // a second dropout while another recovery is running: take them off and queue it
      send(ctx, c, `Thanks for telling us, ${c.name}. I'll find cover for your ${fmtWindow(mine.window)} shift too.`, "info");
      dropOut(ctx, c, "sick", lastText);
      return;
    }
    if (c.aiPaused) return void notifyManager(ctx, `💬 ${c.name}: "${lastText}"`);
    send(ctx, c, `Thanks! You're on ${lower(mine.role)} today, ${fmtWindow(mine.window)}. Message me here if anything changes.`, "info");
    return;
  }

  if (c.aiPaused || c.status === "human") {
    notifyManager(ctx, `💬 ${c.name} (you're handling this chat): "${lastText}"`);
    return;
  }
  if (c.status === "absent") {
    send(ctx, c, "Thanks, it's all handled. Feel better!", "info");
    return;
  }
  const goal = s.goal;
  const asked = c.askedWindow ?? goal?.window;
  if (!goal || !asked || s.phase === "lobby" || s.phase === "checking" || s.phase === "awaiting_outreach" || !c.contactedAt) {
    send(ctx, c, "Thanks! Nothing needs cover from you right now. I'll message you here if that changes.", "info");
    return;
  }
  if (c.status === "released" || (s.phase === "done" && c.status !== "confirmed")) {
    send(ctx, c, "Thank you! It's covered now, so no need. Appreciate you 🙌", "info");
    return;
  }
  if (p.intent === "cannot_work") p = { ...p, intent: "decline" };
  if (c.status === "confirmed" && p.intent !== "withdraw" && p.intent !== "decline") {
    send(ctx, c, "You're all set. See you then! Message here if anything changes.", "info");
    return;
  }

  switch (p.intent) {
    case "accept":
    case "partial":
    case "conditional": {
      if (p.note === "ask_hours") {
        c.status = "negotiating";
        send(ctx, c, `Thanks! Which hours could you do? For example "from 7" or "5 to 8".`, "info");
        return;
      }
      const window = p.window ?? asked;
      const conds = conditionsFor(c, p.transport, p.premium, window.end - window.start);
      if (p.transport) remember(c, "Needs a ride when working late");
      if (p.window && (p.window.start > asked.start || p.window.end < asked.end)) remember(c, `Prefers ${fmtWindow(p.window)}`);
      c.offer = { window, conditions: conds };
      c.status = "accepted";
      const extras = conds.length ? ` with ${conds.map((x) => lower(x.label)).join(" and ")}` : "";
      send(ctx, c, `Great, thank you! I've pencilled you in for ${fmtWindow(window)}${extras}. I'll confirm here as soon as the whole shift is covered.`, "info");
      replan(ctx, `${c.name} offered ${fmtWindow(window)}`);
      return;
    }
    case "decline":
    case "withdraw": {
      const wasIn = c.status === "accepted" || c.status === "confirmed";
      c.status = "declined";
      c.offer = undefined;
      send(ctx, c, wasIn ? "Thanks for the heads-up, I'll sort it out." : "No worries, thanks for letting me know!", "info");
      if (wasIn && (s.phase === "done" || s.phase === "executing")) {
        s.phase = "negotiating";
        s.finishedAt = undefined;
        const sl = slotById(s, goal.slotId);
        if (sl) sl.assignments = sl.assignments.filter((a) => a.crewId !== c.id);
        log(ctx, "agent", "planner", `${c.name} pulled out after the timetable was updated: reopening the recovery`, undefined, "warn");
      }
      replan(ctx, `${c.name} declined`);
      return;
    }
    case "ask_who":
      c.status = "negotiating";
      log(ctx, "agent", "privacy", `Declined to tell ${c.name} who is absent or why`);
      send(ctx, c, `I can't share why a shift opens up, that stays between the team member and the manager 🙏 It's the ${shiftLabel({ ...goal, window: asked })}, S$${c.rate}/h. Could you take it?`, "info", offerButtons(c));
      return;
    case "ask_pay":
      c.status = "negotiating";
      send(ctx, c, `Your usual S$${c.rate}/h, and a ride can be covered if you need one. Can you do ${fmtWindow(asked)}?`, "info", offerButtons(c));
      return;
    case "ask_where":
      c.status = "negotiating";
      send(ctx, c, `${BUSINESS.address}. About ${c.travelMin} min from you. Can you do ${fmtWindow(asked)}?`, "info", offerButtons(c));
      return;
    case "question":
      c.status = "negotiating";
      log(ctx, "agent", "handover", `Passed ${c.name}'s question to the manager (not something the agent may answer)`, undefined, "wait");
      notifyManager(ctx, `❓ ${c.name} asks: "${lastText}"`);
      send(ctx, c, "Good question. I've passed it to your manager, who'll reply here. Meanwhile, can you do the shift?", "info", offerButtons(c));
      return;
    case "human":
      c.status = "human";
      c.aiPaused = true;
      remember(c, "Prefers to talk to the manager before agreeing");
      log(ctx, "agent", "handover", `${c.name} asked for a person: AI paused for this chat, still working on everyone else`, undefined, "wait");
      notifyManager(ctx, `🙋 ${c.name} would like to speak to you before deciding. I've paused my side of that chat.`);
      send(ctx, c, "Of course. I've paused and asked your manager to message you directly.", "info");
      replan(ctx, `${c.name} handed to manager`);
      return;
    case "unclear":
    default:
      c.status = "negotiating";
      log(ctx, "agent", "parser", `Not sure what ${c.name} meant (${Math.round(p.confidence * 100)}%): asking instead of guessing`, undefined, "wait");
      send(ctx, c, `Sorry, just to make sure I've got it right: can you do ${fmtWindow(asked)}?`, "info", offerButtons(c));
      return;
  }
}

// ───────────────────────── recovery

/** A person drops out of their slot: take them off it and recover that slot. */
function dropOut(ctx: Ctx, c: Crew, kind: "sick" | "no_show" | "manager", text: string) {
  const sl = slotOf(ctx.s, c.id);
  if (!sl) return;
  const reason = kind === "no_show" ? "no-show" : "out";
  sl.assignments = sl.assignments.filter((a) => a.crewId !== c.id);
  sl.out = [...(sl.out ?? []), { crewId: c.id, reason }];
  c.status = "absent";
  log(ctx, "agent", "timetable", `Took ${c.name} off ${sl.role} ${fmtWindow(sl.window)}`, `marked ${reason}; the reason stays private`);
  startOrQueue(ctx, sl, kind, c, text);
}

function startOrQueue(ctx: Ctx, sl: Slot, kind: NonNullable<Goal["trigger"]>["kind"], who: Crew | undefined, text: string) {
  const { s } = ctx;
  if (!IDLE.has(s.phase)) {
    if (!s.queue.includes(sl.id)) s.queue.push(sl.id);
    log(ctx, "agent", "planner", `${sl.role} ${fmtWindow(sl.window)} also needs cover: queued until the current recovery finishes`, undefined, "wait");
    return;
  }
  startIncident(ctx, sl, kind, who, text);
}

function startIncident(ctx: Ctx, sl: Slot, kind: NonNullable<Goal["trigger"]>["kind"], who: Crew | undefined, text: string) {
  const { s, now } = ctx;
  for (const c of s.crew) {
    if (c.status === "absent") continue;
    c.status = "bench";
    c.offer = undefined;
    c.askedWindow = undefined;
    c.contactedAt = undefined;
    c.chases = 0;
  }
  if (who) who.status = "absent";
  s.plan = undefined;
  s.verified = undefined;
  s.publishedRoster = undefined;
  s.managerTaps = 0;
  s.startedAt = now;
  s.finishedAt = undefined;
  const goal: Goal = {
    raw: text,
    absent: who?.name ?? "",
    outlet: BUSINESS.outlet,
    role: sl.role,
    window: sl.window,
    slotId: sl.id,
    needsCert: sl.needsCert,
    budget: 0, // no spending cap; the auto-approve rule decides when to ask
    via: "detected",
    confidence: 1,
    assumptions: [],
    trigger: { kind, crewId: who?.id, text, at: now },
  };
  s.goal = goal;
  const how =
    kind === "sick"
      ? `${who!.name} called in sick: "${text}"`
      : kind === "no_show"
        ? `${who!.name} is a no-show`
        : kind === "manager"
          ? `Manager reported ${who?.name ?? "someone"} out`
          : `${sl.role} ${fmtWindow(sl.window)} has nobody on it`;
  log(ctx, kind === "manager" ? "manager" : "agent", "detect", `Gap detected. ${how}`, `${sl.role} ${fmtWindow(sl.window)} needs ${sl.needsCert ? "a certified lead" : "one person"}`, "warn");
  for (const c of s.crew) {
    if (c.status === "absent") continue;
    const reason = whyNot(c, goal);
    if (reason) {
      c.status = "ineligible";
      log(ctx, "agent", "rules", `Ruled out ${c.name}`, reason);
    }
  }
  const order = rank(s.crew, goal);
  log(ctx, "agent", "ranking", `Ranked ${order.length} people who can cover`, order.map((r, i) => `#${i + 1} ${crewById(s, r.crewId)!.name}`).join(", "));
  if (s.settings.autoOutreach) {
    log(ctx, "agent", "policy", "Your standing rules allow it: messaging crew now, no approval needed", `never says who is absent or why · extras up to S$${s.settings.autoApproveSpend} auto-approved`);
    s.phase = "negotiating";
    contactWave(ctx);
    return;
  }
  const gate: Gate = {
    id: `g${s.nextId++}`,
    kind: "outreach",
    title: `Message crew about ${lower(sl.role)} ${fmtWindow(sl.window)}?`,
    lines: [`Ask ${order.slice(0, s.settings.waveSize).map((r) => crewById(s, r.crewId)!.name).join(", ")} first`, "Messages never say who is absent or why"],
    extraCost: 0,
    createdAt: now,
    status: "pending",
  };
  s.gates.push(gate);
  s.phase = "awaiting_outreach";
  log(ctx, "agent", "approvals", "Auto-messaging is off: asking the manager first", gate.title, "wait");
  notifyManager(ctx, `📋 ${how}.\n\n${gate.lines.map((l) => `• ${l}`).join("\n")}\n\nShall I start?`, gateButtons(gate));
}

function offer(ctx: Ctx, c: Crew, ask: Window, why: string) {
  c.status = "contacted";
  c.contactedAt = ctx.now;
  c.lastActivityAt = ctx.now;
  c.askedWindow = ask;
  send(ctx, c, `Hi ${c.name}, it's the ${BUSINESS.name} rota assistant 👋 Can you cover the ${shiftLabel({ ...ctx.s.goal!, window: ask })} today? Your usual S$${c.rate}/h.\n\nReply in your own words or tap below.`, "offer", offerButtons(c));
  log(ctx, "agent", "outreach", `Offered ${fmtWindow(ask)} to ${c.name}`, why);
}

function contactWave(ctx: Ctx) {
  const { s } = ctx;
  if (!s.goal || s.phase !== "negotiating") return;
  const plan = s.plan ?? buildPlan(s.crew, s.goal);
  if (plan.gaps.length === 0) return;
  const pending = s.crew.filter((c) => PENDING.has(c.status) && c.status !== "human").length;
  const everContacted = s.crew.filter((c) => c.contactedAt).length;
  let slots = Math.min(s.settings.waveSize - pending, s.settings.maxContacts - everContacted);
  const ask: Window = plan.segments.length > 0 ? plan.gaps[0] : s.goal.window;
  for (const r of rank(s.crew, s.goal)) {
    if (slots <= 0) break;
    const c = crewById(s, r.crewId)!;
    if (c.status !== "bench" || c.aiPaused) continue;
    offer(ctx, c, ask, r.reasons.join(" · "));
    slots--;
  }
  const stillPending = s.crew.some((c) => PENDING.has(c.status));
  if (slots > 0 && !stillPending && !s.crew.some((c) => c.status === "bench" && !c.aiPaused && !whyNot(c, s.goal!))) {
    log(ctx, "agent", "planner", "Everyone eligible has been asked. Escalating the remaining gap to the manager", plan.gaps.map(fmtWindow).join(", "), "fail");
    notifyManager(ctx, `🚨 I've asked everyone eligible and can't fill ${lower(s.goal.role)} ${plan.gaps.map(fmtWindow).join(", ")}. Options: shorten opening hours, cover it yourself, or allow a premium.`);
  }
}

function replan(ctx: Ctx, why: string) {
  const { s } = ctx;
  if (!s.goal) return;
  const before = s.plan;
  const plan = buildPlan(s.crew, s.goal, before);
  s.plan = plan;
  if (!before || before.explanation !== plan.explanation)
    log(ctx, "agent", "planner", `Re-planned (${why})`, `${plan.explanation} · ${Math.round((plan.coveredHours / plan.totalHours) * 100)}% covered`);

  const open = s.gates.find((g) => g.kind === "package" && g.status === "pending");
  if (open && JSON.stringify(open.payload?.segments) !== JSON.stringify(plan.segments)) {
    open.status = "rejected";
    open.decidedAt = ctx.now;
    log(ctx, "agent", "approvals", "Withdrew the pending approval: the plan changed underneath it", undefined, "warn");
    notifyManager(ctx, "↩️ Ignore my last request, the plan changed. A new one is coming.");
  }

  if (plan.gaps.length === 0) {
    if (s.gates.some((g) => g.kind === "package" && g.status === "pending")) return;
    if (plan.extraCost <= s.settings.autoApproveSpend) {
      log(ctx, "agent", "policy", `Full cover found. Extras S$${plan.extraCost} are within your S$${s.settings.autoApproveSpend} auto-approve rule: confirming without asking`, plan.explanation);
      execute(ctx, plan);
      return;
    }
    const name = (id: string) => crewById(s, id)!.name;
    const gate: Gate = {
      id: `g${s.nextId++}`,
      kind: "package",
      title: `Approve S$${plan.extraCost} in extras for this cover?`,
      lines: [
        ...plan.segments.map((g) => `${name(g.crewId)}: ${fmtWindow(g.window)}${g.extras.length ? ` (+ ${g.extras.map((x) => x.label).join(", ")})` : ""}`),
        `S$${plan.extraCost} is above your S$${s.settings.autoApproveSpend} auto-approve rule, so I'm checking with you`,
      ],
      extraCost: plan.extraCost,
      createdAt: ctx.now,
      status: "pending",
      payload: plan,
    };
    s.gates.push(gate);
    s.phase = "awaiting_package";
    log(ctx, "agent", "approvals", `Full cover found, but extras S$${plan.extraCost} exceed the S$${s.settings.autoApproveSpend} rule: asking the manager`, plan.explanation, "wait");
    notifyManager(ctx, `💸 *One decision needed*\n\n${gate.lines.map((l) => `• ${l}`).join("\n")}\n\nApprove?`, gateButtons(gate));
    return;
  }
  if (s.phase === "awaiting_package") s.phase = "negotiating";
  contactWave(ctx);
}

function execute(ctx: Ctx, plan: Plan) {
  const { s } = ctx;
  const goal = s.goal!;
  s.phase = "executing";
  s.publishedRoster = plan.segments;
  const sl = slotById(s, goal.slotId);
  if (sl) {
    sl.assignments = [...sl.assignments.filter((a) => !plan.segments.some((g) => g.crewId === a.crewId)), ...plan.segments.map((g) => ({ crewId: g.crewId, window: g.window, source: "ai" as const, extras: g.extras.reduce((t, x) => t + x.cost, 0), extrasNote: g.extras.map((x) => x.label).join(", ") || undefined }))];
    log(ctx, "agent", "timetable", `Updated the timetable: ${sl.role} ${fmtWindow(sl.window)}`, plan.segments.map((g) => `${crewById(s, g.crewId)!.name} ${fmtWindow(g.window)}`).join(" + "));
  }
  for (const g of plan.segments) {
    const c = crewById(s, g.crewId)!;
    c.status = "confirmed";
    const extras = g.extras.length ? `\n${g.extras.map((x) => `• ${x.label}: keep the receipt and claim it as usual`).join("\n")}` : "";
    send(ctx, c, `🎉 Confirmed: ${goal.outlet} ${lower(goal.role)}, *${fmtWindow(g.window)}* today. Thank you, ${c.name}!${extras}\n\nIf anything changes, just tell me here.`, "confirm");
  }
  for (const c of s.crew) {
    if (plan.segments.some((g) => g.crewId === c.id)) continue;
    if (["contacted", "chased", "negotiating", "accepted", "human"].includes(c.status)) {
      c.status = "released";
      send(ctx, c, "Update: that shift is now covered, so no need. Thanks for being there 🙌", "release");
    }
  }
}

function verify(ctx: Ctx) {
  const { s } = ctx;
  const confirms = s.crew.flatMap((c) => c.thread.filter((m) => m.tag === "confirm" && m.at >= (s.startedAt ?? 0)).map((m) => ({ c, m })));
  if (confirms.length === 0 || confirms.some(({ m }) => m.status === "queued" || m.status === "retrying")) return;
  s.verified = confirms.map(({ c, m }) => ({ crewId: c.id, ok: m.status === "sent", evidence: m.evidence ?? m.error ?? "" }));
  const allOk = s.verified.every((v) => v.ok);
  s.phase = "done";
  s.finishedAt = ctx.now;
  log(ctx, "agent", "verify", allOk ? "Verified: timetable updated and every confirmation delivered" : "Finished with delivery problems (manager notified)", s.verified.map((v) => `${crewById(s, v.crewId)!.name} ${v.ok ? "✓" : "✗"}`).join(", "), allOk ? "ok" : "warn");
  const goal = s.goal!;
  const t = goal.trigger;
  const what =
    t?.kind === "no_show" ? `${goal.absent} didn't show up or reply` : t?.kind === "open_slot" ? `${goal.role} ${fmtWindow(goal.window)} was left empty` : t?.kind === "manager" ? `You reported ${goal.absent} out` : `${goal.absent} called in sick`;
  const name = (id: string) => crewById(s, id)!.name;
  const cover = (s.publishedRoster ?? []).map((g) => `${name(g.crewId)} ${fmtWindow(g.window)}${g.extras.length ? ` (${g.extras.map((x) => lower(x.label)).join(", ")})` : ""}`).join(", ");
  const messages = s.crew.reduce((a, c) => a + c.thread.filter((m) => m.at >= (s.startedAt ?? 0) && m.tag !== "welcome" && m.from !== "manager").length, 0);
  s.history.push({ slotId: goal.slotId ?? "", role: goal.role, window: goal.window, trigger: what, outcome: cover, ms: ctx.now - (s.startedAt ?? ctx.now), taps: s.managerTaps, extra: s.plan?.extraCost ?? 0, messages, at: ctx.now });
  notifyManager(
    ctx,
    `✅ Sorted: ${goal.outlet} ${lower(goal.role)} ${fmtWindow(goal.window)} is covered.\n\n${what}. Cover: ${cover}.\nExtras S$${s.plan?.extraCost ?? 0}${s.managerTaps === 0 ? `, within your S$${s.settings.autoApproveSpend} rule` : ""}. Timetable updated and everyone has been told.\n\nNothing needed from you.`,
  );
  startNext(ctx);
}

function closeIncident(ctx: Ctx, why: string) {
  const { s } = ctx;
  for (const c of s.crew)
    if (["contacted", "chased", "negotiating", "accepted"].includes(c.status)) {
      c.status = "released";
      send(ctx, c, "Update: that shift is now covered, so no need. Thanks for being there 🙌", "release");
    }
  s.gates.forEach((g) => g.status === "pending" && (g.status = "rejected"));
  log(ctx, "agent", "planner", `Stopped the recovery: ${why}`);
  s.phase = "done";
  s.finishedAt = ctx.now;
  startNext(ctx);
}

function covered(sl: Slot) {
  let h = sl.window.start;
  for (const a of [...sl.assignments].sort((x, y) => x.window.start - y.window.start)) {
    if (a.window.start > h + 1e-9) return false;
    h = Math.max(h, a.window.end);
  }
  return h >= sl.window.end - 1e-9;
}

function startNext(ctx: Ctx) {
  const { s } = ctx;
  while (s.queue.length) {
    const sl = slotById(s, s.queue.shift());
    if (sl && !covered(sl)) {
      startIncident(ctx, sl, "open_slot", undefined, `${sl.role} ${fmtWindow(sl.window)} still needs cover`);
      return;
    }
  }
}

// ───────────────────────── visible plan

// ───────────────────────── cover arranged ahead of time (tomorrow, or any day this week)

const tomorrowSlotOf = (s: LiveState, crewId: string) => (s.tomorrow ?? []).find((sl) => sl.assignments.some((a) => a.crewId === crewId));
const VIA: Record<Notice["via"], string> = { leave_link: "leave link", chat: "told the agent in chat", checkin: "evening check-in" };

export const dateLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
const whenOf = (n: Notice) => (n.day === "tomorrow" ? "tomorrow's" : `${n.label ?? n.date}`);

/** Who works which slot on a later day: the usual roster, minus people who reported out, plus covers already agreed. */
function laterRoster(s: LiveState, date: string): Slot[] {
  return s.tomorrow.map((sl) => {
    const usual = s.usual?.[sl.id];
    const gone = s.notices.some((n) => n.date === date && n.slotId === sl.id && n.crewId === usual);
    const cover = s.notices.find((n) => n.date === date && n.slotId === sl.id && n.status === "covered")?.coverId;
    const who = cover ?? (gone ? undefined : usual);
    return { ...sl, out: undefined, assignments: who ? [{ crewId: who, window: sl.window, source: cover ? ("ai" as const) : ("plan" as const) }] : [] };
  });
}

function earlyOut(ctx: Ctx, c: Crew, via: Notice["via"], date?: string) {
  const { s, now } = ctx;
  let sl: Slot | undefined;
  if (date) {
    sl = laterRoster(s, date).find((x) => x.assignments.some((a) => a.crewId === c.id && a.source === "plan"));
  } else sl = tomorrowSlotOf(s, c.id);
  const label = date ? dateLabel(date) : "tomorrow";
  if (!sl) {
    send(ctx, c, `Thanks for letting me know! You're not on the timetable ${date ? `on ${label}` : "tomorrow"}, so there's nothing to change 🙂`, "info");
    return;
  }
  if (!date) {
    const live = s.tomorrow.find((x) => x.id === sl!.id)!;
    live.assignments = live.assignments.filter((a) => a.crewId !== c.id);
    live.out = [...(live.out ?? []), { crewId: c.id, reason: "leave" }];
    c.checkin = "out";
  }
  const n: Notice = { id: s.nextId++, crewId: c.id, slotId: sl.id, day: date ? "later" : "tomorrow", date, label: date ? label : undefined, via, at: now, status: "finding", asked: [] };
  s.notices.push(n);
  log(ctx, "agent", "leave", `Advance notice: ${c.name} can't work ${date ? label : "tomorrow"}'s ${sl.role} ${fmtWindow(sl.window)}`, `${VIA[via]}; the reason stays private`, "warn");
  send(ctx, c, `Thanks for telling us early, ${c.name} 🙏 I'll find cover for ${date ? label : "tomorrow"}'s ${lower(sl.role)} shift (${fmtWindow(sl.window)}). You don't need to do anything else.`, "info");
  advanceAsk(ctx, n);
}

/** kept for the chat and check-in paths, which are always about tomorrow */
const tomorrowOut = (ctx: Ctx, c: Crew, via: Notice["via"]) => earlyOut(ctx, c, via);

function advanceAsk(ctx: Ctx, n: Notice) {
  const { s, now } = ctx;
  const roster = n.day === "tomorrow" ? s.tomorrow : laterRoster(s, n.date!);
  const sl = roster.find((x) => x.id === n.slotId)!;
  const out = crewById(s, n.crewId)!;
  const windowsOf = (id: string) => roster.flatMap((x) => x.assignments.filter((a) => a.crewId === id).map((a) => a.window));
  const pool = s.crew
    .filter((x) => x.id !== n.crewId && !n.asked.includes(x.id) && x.advance === undefined && (n.day === "later" || (x.status !== "absent" && x.checkin !== "out")))
    .map((x) => ({ ...x, today: windowsOf(x.id), nextShiftStart: undefined }));
  const next = rank(pool, { window: sl.window, absent: "", needsCert: sl.needsCert })[0];
  if (!next) {
    n.status = "no_cover";
    log(ctx, "agent", "planner", `${n.day === "tomorrow" ? "Tomorrow" : n.label}: nobody eligible left for ${sl.role} ${fmtWindow(sl.window)}`, `${n.asked.length} asked`, "fail");
    notifyManager(ctx, `⚠️ Heads-up for ${n.day === "tomorrow" ? "tomorrow" : n.label}: ${out.name} can't make ${lower(sl.role)} ${fmtWindow(sl.window)}. I asked ${n.asked.length} people and nobody is free. Can you take a look?`);
    return;
  }
  const c = crewById(s, next.crewId)!;
  n.asked.push(c.id);
  c.advance = n.id;
  c.advanceAt = now;
  c.lastActivityAt = now;
  log(ctx, "agent", "planner", `${n.day === "tomorrow" ? "Tomorrow" : n.label}: asking ${c.name} to cover ${sl.role} ${fmtWindow(sl.window)}`, next.reasons.slice(0, 2).join(" · "));
  send(ctx, c, `Hi ${c.name}, planning ahead 🗓 Can you cover ${whenOf(n)} ${BUSINESS.outlet} ${lower(sl.role)} shift, ${fmtWindow(sl.window)}? Your usual S$${c.rate}/h. Reply yes or no.`, "advance", [
    { label: "✅ Yes", data: `r:${c.id}:yes` },
    { label: "❌ Can't", data: `r:${c.id}:no` },
  ]);
}

function onAdvanceReply(ctx: Ctx, c: Crew, p: NonNullable<Msg["parsed"]>): boolean {
  const { s, now } = ctx;
  const n = s.notices.find((x) => x.id === c.advance);
  if (!n || n.status !== "finding") {
    c.advance = undefined;
    return false;
  }
  const sl = (n.day === "tomorrow" ? s.tomorrow : laterRoster(s, n.date!)).find((x) => x.id === n.slotId)!;
  const when = n.day === "tomorrow" ? "tomorrow's" : `${n.label}'s`;
  if (p.intent === "accept" || p.intent === "partial" || p.intent === "conditional") {
    c.advance = undefined;
    if (n.day === "tomorrow") s.tomorrow.find((x) => x.id === n.slotId)!.assignments = [{ crewId: c.id, window: sl.window, source: "ai" }];
    n.status = "covered";
    n.coverId = c.id;
    n.coveredAt = now;
    const out = crewById(s, n.crewId)!;
    log(ctx, "agent", "timetable", `${n.day === "tomorrow" ? "Tomorrow's" : `${n.label}'s`} timetable updated: ${c.name} covers ${sl.role} ${fmtWindow(sl.window)}`, `sorted ahead of time, ${n.asked.length} asked`);
    send(ctx, c, `Thank you ${c.name}! ✅ You're on ${when} ${lower(sl.role)} shift, ${fmtWindow(sl.window)}. The timetable is updated.`, "confirm");
    notifyManager(ctx, `🗓 Sorted early: ${out.name} can't make ${when} ${lower(sl.role)} shift (${fmtWindow(sl.window)}). ${c.name} is covering and the timetable is updated.\n\nNothing needed from you.`);
    return true;
  }
  if (p.intent === "decline" || p.intent === "cannot_work" || p.intent === "withdraw") {
    c.advance = undefined;
    log(ctx, "agent", "planner", `${n.day === "tomorrow" ? "Tomorrow" : n.label}: ${c.name} can't cover`, undefined, "warn");
    send(ctx, c, "No worries, thanks for letting me know 🙏", "info");
    advanceAsk(ctx, n);
    return true;
  }
  if (p.intent === "ask_who") {
    send(ctx, c, "I can't share why a shift opens up, that stays between the team member and the manager 🙏 Can you do it?", "advance");
    return true;
  }
  send(ctx, c, `Just reply yes or no: can you do ${when} ${fmtWindow(sl.window)}? 🙂`, "advance");
  return true;
}

export function deriveSteps(s: LiveState): Step[] {
  const phase = s.phase;
  const order = ["lobby", "checking", "awaiting_outreach", "negotiating", "awaiting_package", "executing", "done"];
  const at = order.indexOf(phase);
  const g = s.goal;
  const has = Boolean(g) && phase !== "lobby" && phase !== "checking";
  const asked = s.crew.filter((c) => c.contactedAt).length;
  const replies = s.crew.filter((c) => c.contactedAt && c.thread.some((m) => m.dir === "in" && m.at >= c.contactedAt!)).length;
  const t = g?.trigger;
  const gate = s.gates.find((x) => x.kind === "package" && x.createdAt >= (s.startedAt ?? 0));
  return [
    {
      id: "detect",
      title: "Spot the problem",
      detail:
        phase === "checking"
          ? "Someone hasn't checked in: asking if they're coming"
          : has && t
            ? t.kind === "sick"
              ? `${g!.absent} texted in sick`
              : t.kind === "no_show"
                ? `${g!.absent} didn't check in or reply`
                : t.kind === "open_slot"
                  ? `${g!.role} ${fmtWindow(g!.window)} left empty`
                  : `Manager reported ${g!.absent} out`
            : "Watching the timetable for sick calls, no-shows and empty slots",
      status: has ? "done" : phase === "checking" ? "active" : "waiting",
    },
    {
      id: "rank",
      title: "Check the rules",
      detail: has ? `${rank(s.crew, g!).length} can cover · ${s.crew.filter((c) => c.status === "ineligible").length} ruled out, each with a reason` : "Certificates, hour caps, rest, one shift a day",
      status: has ? "done" : "waiting",
    },
    { id: "negotiate", title: "Ask crew", detail: has ? `${asked} asked · ${replies} replied` : "Several people at once, in plain language", status: has && at > 3 ? "done" : at === 3 || at === 2 ? "active" : "waiting" },
    { id: "replan", title: "Build the cover", detail: s.plan && has ? s.plan.explanation : "Split shifts, rides", status: has && at > 3 ? "done" : at === 3 ? "active" : "waiting" },
    {
      id: "confirm",
      title: "Confirm",
      detail: gate ? (gate.status === "pending" ? "Over your auto-approve rule: waiting for you" : `Manager ${gate.status}`) : has && at >= 5 ? "Within your rules: confirmed automatically" : `Automatic if extras ≤ S$${s.settings.autoApproveSpend}`,
      status: has && at >= 5 ? "done" : at === 4 ? "active" : "waiting",
    },
    { id: "notify", title: "Update timetable and tell everyone", detail: "Fill the slot, confirm cover, release the rest", status: has && at === 6 ? "done" : at === 5 ? "active" : "waiting" },
    {
      id: "verify",
      title: "Check delivery and report",
      detail: s.verified && has ? `${s.verified.filter((v) => v.ok).length}/${s.verified.length} confirmations delivered · manager told once` : "Delivery receipt for every message",
      status: has && at === 6 ? "done" : "waiting",
    },
  ];
}
