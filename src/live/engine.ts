import { buildPlan, conditionsFor, rank, whyNot } from "./planner.ts";
import { BUSINESS, DEFAULT_BASELINE, DEFAULT_SETTINGS, fmtHour, fmtWindow, freshCrew } from "./scenario.ts";
import type { AuditEntry, Button, Crew, Effect, Gate, Goal, LiveEvent, LiveState, Msg, Plan, Step, Window } from "./types.ts";

/**
 * The agent as a pure state machine: (state, event, now) → (state, effects).
 * Drivers (server.ts for Telegram, the browser for rehearsal) perform the effects and feed
 * the results back in as events, so every send has a delivery receipt or a visible failure.
 */

const SHIFT: Window = { start: BUSINESS.shift.start, end: BUSINESS.shift.end };
const PENDING = new Set<Crew["status"]>(["contacted", "chased", "negotiating", "human"]);

export function initialState(opts: { mode: LiveState["mode"]; code: string; telegram?: LiveState["telegram"] }): LiveState {
  return {
    version: 1,
    code: opts.code,
    mode: opts.mode,
    telegram: opts.telegram ?? { enabled: false },
    phase: "lobby",
    crew: freshCrew().map((c) => (!c.rostered && whyNot(c, { window: SHIFT, absent: "" }) ? { ...c, status: "ineligible" } : c)),
    gates: [],
    steps: deriveSteps(),
    audit: [],
    manager: {},
    managerInbox: [],
    failureInjected: false,
    managerTaps: 0,
    baseline: DEFAULT_BASELINE,
    settings: DEFAULT_SETTINGS,
    nextId: 1,
  };
}

type Ctx = { s: LiveState; fx: Effect[]; now: number };

export function step(prev: LiveState, ev: LiveEvent, now: number): { state: LiveState; effects: Effect[] } {
  const s: LiveState = structuredClone(prev);
  const ctx: Ctx = { s, fx: [], now };
  handle(ctx, ev);
  s.steps = deriveSteps(s);
  s.version = prev.version + 1;
  if (s.audit.length > 400) s.audit = s.audit.slice(-400);
  return { state: s, effects: ctx.fx };
}

// ───────────────────────── helpers

function log(ctx: Ctx, actor: AuditEntry["actor"], tool: string, action: string, evidence?: string, status: AuditEntry["status"] = "ok") {
  ctx.s.audit.push({ id: ctx.s.nextId++, at: ctx.now, actor, tool, action, evidence, status });
}

const crewById = (s: LiveState, id: string) => s.crew.find((c) => c.id === id);
const channelOf = (c: Crew) => (c.seat?.kind === "telegram" ? "Telegram" : "Rehearsal phone");

function send(ctx: Ctx, c: Crew, text: string, tag: Msg["tag"], buttons?: Button[], from: Msg["from"] = "agent") {
  const msg: Msg = { id: `m${ctx.s.nextId++}`, at: ctx.now, dir: "out", text, buttons, status: "queued", attempts: 1, tag, from };
  c.thread.push(msg);
  ctx.fx.push({ kind: "send", crewId: c.id, msgId: msg.id, text, buttons });
  return msg;
}

function notifyManager(ctx: Ctx, text: string, buttons?: Button[]) {
  ctx.s.managerInbox.push({ id: ctx.s.nextId++, at: ctx.now, text, buttons });
  if (ctx.s.managerInbox.length > 50) ctx.s.managerInbox.shift();
  ctx.fx.push({ kind: "notify_manager", text, buttons });
}

const offerButtons = (c: Crew): Button[] => [
  { label: "✅ Yes, all of it", data: `r:${c.id}:yes` },
  { label: "🕐 Part of it", data: `r:${c.id}:part` },
  { label: "❌ Can't tonight", data: `r:${c.id}:no` },
];

const gateButtons = (g: Gate): Button[] => [
  { label: "Approve", data: `g:${g.id}:1` },
  { label: "Reject", data: `g:${g.id}:0` },
];

function committedExtras(s: LiveState, exceptId?: string) {
  return s.crew
    .filter((c) => c.id !== exceptId && (c.status === "accepted" || c.status === "confirmed") && c.offer)
    .reduce((a, c) => a + c.offer!.conditions.filter((x) => x.allowed).reduce((b, x) => b + x.cost, 0), 0);
}

// ───────────────────────── event handling

function handle(ctx: Ctx, ev: LiveEvent) {
  const { s, now } = ctx;
  switch (ev.type) {
    case "reset": {
      const keepSeats = new Map(s.crew.map((c) => [c.id, c.seat]));
      const fresh = initialState({ mode: ev.mode ?? s.mode, code: ev.code ?? s.code, telegram: s.telegram });
      fresh.crew.forEach((c) => (c.seat = keepSeats.get(c.id) ?? null));
      fresh.manager = s.manager;
      fresh.baseline = s.baseline;
      fresh.settings = s.settings;
      fresh.nextId = s.nextId;
      Object.assign(s, fresh);
      log(ctx, "presenter", "session", "Session reset: crew seats and manager kept");
      return;
    }

    case "join": {
      const existing = s.crew.find((c) => c.seat?.kind === "telegram" && c.seat.chatId === ev.chatId);
      if (existing) {
        ctx.fx.push({ kind: "send_chat", chatId: ev.chatId, text: `You're already ${existing.name} 🙂 Keep this chat open.` });
        return;
      }
      const order = [...s.crew.filter((c) => c.rostered).map((c) => c.id), ...rank(s.crew, { window: SHIFT, absent: "" }).map((r) => r.crewId)];
      const free = order.map((id) => crewById(s, id)!).find((c) => c.seat === null || c.seat.kind === "sim");
      if (!free) {
        ctx.fx.push({ kind: "send_chat", chatId: ev.chatId, text: "All crew seats are taken for this round. Enjoy the show! 🍿" });
        return;
      }
      free.seat = { kind: "telegram", chatId: ev.chatId, handle: ev.handle, joinedAt: now };
      log(ctx, "crew", "telegram", `${ev.handle} joined as ${free.name}`, `chat ${ev.chatId}`);
      if (free.rostered) {
        send(
          ctx,
          free,
          `Welcome to ${BUSINESS.name} 👋\n\nYou are *${free.name}*, ${free.role.toLowerCase()} on tonight's ${free.outlet} close, ${fmtWindow(SHIFT)}.\n\nWhen the presenter gives the signal, text me that you can't come in, in your own words. Or stay silent when I check on you, to see what happens with a no-show.`,
          "welcome",
        );
        return;
      }
      send(
        ctx,
        free,
        `Welcome to ${BUSINESS.name} 👋\n\nFor the next few minutes you are *${free.name}*, ${free.role.toLowerCase()} at our ${free.outlet} outlet. You've worked ${free.hoursThisWeek}h of ${free.maxHours}h this week.\n\nKeep this chat open. If a shift needs cover I'll message you here. Reply however you like: "yes", "only after 7", "need a ride", "can I talk to the manager"... I'll understand.`,
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
        text: `You're the manager of ${BUSINESS.name}. You don't need to do anything.\n\nI watch tonight's roster. If someone calls in sick or doesn't show up, I find cover myself using your rules: certified staff only, hour caps and rest respected, extras up to S$${s.settings.autoApproveSpend} without asking.\n\nI'll only message you if something needs a decision, and once more when it's sorted.`,
      });
      return;
    }

    case "goal": {
      if (s.phase !== "lobby" && s.phase !== "checking") {
        log(ctx, "manager", "goal", `Ignored a new report while a recovery is running: "${ev.text}"`, undefined, "warn");
        return;
      }
      const rostered = s.crew.find((c) => c.rostered);
      startIncident(ctx, "manager", rostered?.id, ev.text);
      return;
    }

    case "no_show": {
      const c = crewById(s, ev.crewId);
      if (!c || !c.rostered || s.phase !== "lobby") return;
      s.phase = "checking";
      s.startedAt = now;
      c.status = "checking";
      c.lastActivityAt = now;
      log(ctx, "agent", "roster", `${c.name} hasn't checked in 10 minutes after the ${fmtHour(SHIFT.start)} start`, "check-in missing", "warn");
      send(
        ctx,
        c,
        `Hi ${c.name}, tonight's ${BUSINESS.outlet} close started at ${fmtHour(SHIFT.start)} and you haven't checked in. Are you on your way?`,
        "check",
        [
          { label: "🏃 On my way", data: `r:${c.id}:onway` },
          { label: "🤒 Can't make it", data: `r:${c.id}:cant` },
        ],
      );
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
        if (!ev.approve) {
          s.phase = "lobby";
          s.goal = undefined;
          s.startedAt = undefined;
          log(ctx, "agent", "approvals", "Stopped. Nothing was sent to anyone");
          return;
        }
        s.phase = "negotiating";
        contactWave(ctx);
      } else {
        if (!ev.approve) {
          s.phase = "negotiating";
          log(ctx, "agent", "planner", "Manager rejected the package: keeping offers open and looking for alternatives", undefined, "warn");
          notifyManager(ctx, "Understood. I'll keep looking and come back with another option.");
          contactWave(ctx);
          return;
        }
        execute(ctx, g.payload!);
      }
      return;
    }

    case "reply": {
      const c = crewById(s, ev.crewId);
      if (!c) return;
      c.thread.push({ id: `m${s.nextId++}`, at: now, dir: "in", text: ev.text, parsed: ev.parsed });
      c.lastActivityAt = now;
      log(ctx, "crew", channelOf(c), `${c.name}: "${ev.text}"`, `${ev.parsed.intent}${ev.parsed.window ? ` ${fmtWindow(ev.parsed.window)}` : ""}${ev.parsed.transport ? " +ride" : ""} · ${Math.round(ev.parsed.confidence * 100)}% · ${ev.parsed.via}`);
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
        if (m.tag !== "welcome") log(ctx, "agent", channelOf(c), `Delivered ${m.tag ?? "message"} to ${c.name}`, ev.evidence);
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
      // outbox retries
      for (const c of s.crew)
        for (const m of c.thread)
          if (m.status === "retrying" && (m.nextAttemptAt ?? 0) <= now) {
            m.status = "queued";
            m.attempts = (m.attempts ?? 1) + 1;
            ctx.fx.push({ kind: "send", crewId: c.id, msgId: m.id, text: m.text, buttons: m.buttons });
          }
      if (s.phase === "checking") {
        const c = s.crew.find((x) => x.status === "checking");
        if (c && c.lastActivityAt && (now - c.lastActivityAt) / 1000 >= s.settings.noShowWaitSec) {
          log(ctx, "agent", "roster", `No reply from ${c.name} ${s.settings.noShowWaitSec}s after the check-in message: treating it as a no-show`, undefined, "warn");
          startIncident(ctx, "no_show", c.id, "No check-in and no reply");
        }
        return;
      }
      if (s.phase !== "negotiating" && s.phase !== "awaiting_package") return;
      // chase non-responders, then move on
      for (const c of s.crew) {
        const delivered = c.thread.some((m) => m.tag === "offer" && m.status === "sent");
        if (!delivered || !c.lastActivityAt) continue;
        const idle = (now - c.lastActivityAt) / 1000;
        if (c.status === "contacted" && idle >= s.settings.chaseAfterSec) {
          c.status = "chased";
          c.chases++;
          c.lastActivityAt = now;
          log(ctx, "agent", "follow-up", `No reply from ${c.name} after ${s.settings.chaseAfterSec}s: sending one reminder`, undefined, "wait");
          send(ctx, c, `Hi ${c.name}, just checking: any chance you can do ${fmtWindow(c.askedWindow ?? SHIFT)} tonight? A quick yes or no helps a lot 🙏`, "chase", offerButtons(c));
        } else if (c.status === "chased" && idle >= s.settings.giveUpAfterSec - s.settings.chaseAfterSec) {
          c.status = "no_response";
          log(ctx, "agent", "follow-up", `No reply from ${c.name} after a reminder: moving to the next person`, undefined, "warn");
          replan(ctx, `${c.name} did not reply`);
        }
      }
      return;
    }

    case "failure": {
      s.failureInjected = ev.on;
      log(ctx, "presenter", "chaos", ev.on ? "Injected failure: outbound messaging is down" : "Messaging restored", undefined, ev.on ? "fail" : "ok");
      return;
    }

    case "takeover": {
      const c = crewById(s, ev.crewId);
      if (!c) return;
      if (ev.on) {
        c.status = "human";
        log(ctx, "manager", "handover", `Manager took over the conversation with ${c.name}: AI paused`);
      } else {
        c.status = c.offer ? "accepted" : "negotiating";
        log(ctx, "manager", "handover", `Handed ${c.name} back to the agent`);
        replan(ctx, "handover ended");
      }
      return;
    }

    case "manager_say": {
      const c = crewById(s, ev.crewId);
      if (!c) return;
      send(ctx, c, `👤 Manager: ${ev.text}`, "info", undefined, "manager");
      log(ctx, "manager", channelOf(c), `Manager wrote to ${c.name}`);
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
  let p = parsed;
  const { s } = ctx;
  const goal = s.goal;
  const asked = c.askedWindow ?? SHIFT;

  if (c.rostered) {
    const out = p.intent === "cannot_work" || p.intent === "decline" || p.intent === "withdraw";
    if (out && (s.phase === "lobby" || s.phase === "checking")) {
      send(ctx, c, `Thanks for telling us, ${c.name}. Rest up 🙏 I'll find cover for tonight; you don't need to do anything else.`, "info");
      startIncident(ctx, "sick", c.id, c.thread[c.thread.length - 1].text);
      return;
    }
    if ((p.intent === "on_way" || p.intent === "accept") && s.phase === "checking") {
      c.status = "rostered";
      s.phase = "lobby";
      s.startedAt = undefined;
      log(ctx, "agent", "roster", `${c.name} is on the way: no cover needed`);
      send(ctx, c, "Great, see you soon! No need to reply further.", "info");
      return;
    }
    send(ctx, c, s.goal ? `Thanks ${c.name}, it's all handled. Feel better!` : `Thanks! You're on tonight's close, ${fmtWindow(SHIFT)}. Message me here if anything changes.`, "info");
    return;
  }
  if (p.intent === "cannot_work") p = { ...p, intent: "decline" };
  if (c.status === "human") {
    notifyManager(ctx, `💬 ${c.name} (waiting for you): "${c.thread[c.thread.length - 1].text}"`);
    return;
  }
  if (!goal || s.phase === "lobby" || s.phase === "checking" || s.phase === "awaiting_outreach") {
    send(ctx, c, "Thanks! Nothing needs cover right now. I'll message you here if that changes.", "info");
    return;
  }
  if (c.status === "released" || (s.phase === "done" && c.status !== "confirmed")) {
    send(ctx, c, "Thank you! Tonight is covered now, so no need. Appreciate you 🙌", "info");
    return;
  }
  if (c.status === "confirmed" && p.intent !== "withdraw" && p.intent !== "decline") {
    send(ctx, c, "You're all set. See you tonight! Message here if anything changes.", "info");
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
      const hours = window.end - window.start;
      const conds = conditionsFor(c, p.transport, p.premium, hours);
      const left = goal.budget - committedExtras(s, c.id);
      const cost = conds.reduce((a, x) => a + x.cost, 0);
      if (cost > left) {
        conds.forEach((x) => (x.allowed = false));
        c.offer = { window, conditions: conds };
        c.status = "negotiating";
        log(ctx, "agent", "policy", `${c.name}'s request (S$${cost}) exceeds the remaining budget (S$${left})`, "asked without it", "warn");
        send(ctx, c, `Thanks ${c.name}! That's more than I'm allowed to offer tonight (I have S$${left} left for extras). Could you do ${fmtWindow(window)} without it?`, "info", offerButtons(c));
        return;
      }
      c.offer = { window, conditions: conds };
      c.status = "accepted";
      const extras = conds.length ? ` with ${conds.map((x) => x.label[0].toLowerCase() + x.label.slice(1)).join(" and ")}` : "";
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
        log(ctx, "agent", "planner", `${c.name} pulled out after the roster was published: reopening the recovery`, undefined, "warn");
        notifyManager(ctx, `⚠️ ${c.name} just pulled out of tonight. I'm finding someone else now.`);
      }
      replan(ctx, `${c.name} declined`);
      return;
    }
    case "ask_who":
      c.status = "negotiating";
      log(ctx, "agent", "privacy", `Declined to tell ${c.name} who is absent or why`);
      send(ctx, c, `I can't share why a shift opens up, that stays between the team member and the manager 🙏 It's the ${goal.outlet} close, ${fmtWindow(asked)}, S$${c.rate}/h. Could you take it?`, "info", offerButtons(c));
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
      notifyManager(ctx, `❓ ${c.name} asks: "${c.thread[c.thread.length - 1].text}"`);
      send(ctx, c, "Good question. I've passed it to your manager, who'll reply here. Meanwhile, can you do the shift?", "info", offerButtons(c));
      return;
    case "human":
      c.status = "human";
      log(ctx, "agent", "handover", `${c.name} asked for a person: AI paused for this conversation`, undefined, "wait");
      notifyManager(ctx, `🙋 ${c.name} would like to speak to you before deciding. I've paused my side of that chat.`);
      send(ctx, c, "Of course. I've paused and asked your manager to message you directly.", "info");
      replan(ctx, `${c.name} handed to manager`);
      return;
    case "unclear":
    default:
      c.status = "negotiating";
      log(ctx, "agent", "parser", `Not sure what ${c.name} meant (${Math.round(p.confidence * 100)}%): asking instead of guessing`, undefined, "wait");
      send(ctx, c, `Sorry, just to make sure I've got it right: can you do ${fmtWindow(asked)} tonight?`, "info", offerButtons(c));
      return;
  }
}

function contactWave(ctx: Ctx) {
  const { s } = ctx;
  if (!s.goal || s.phase !== "negotiating") return;
  const plan = s.plan ?? buildPlan(s.crew, s.goal);
  if (plan.gaps.length === 0) return;
  const pending = s.crew.filter((c) => PENDING.has(c.status) && c.status !== "human").length;
  const everContacted = s.crew.filter((c) => c.contactedAt).length;
  let slots = Math.min(s.settings.waveSize - pending, s.settings.maxContacts - everContacted);
  const hasCover = plan.segments.length > 0;
  const ask: Window = hasCover ? plan.gaps[0] : s.goal.window;
  for (const r of rank(s.crew, s.goal)) {
    if (slots <= 0) break;
    const c = crewById(s, r.crewId)!;
    if (c.status !== "bench") continue;
    c.status = "contacted";
    c.contactedAt = ctx.now;
    c.lastActivityAt = ctx.now;
    c.askedWindow = ask;
    send(
      ctx,
      c,
      `Hi ${c.name}, it's the ${BUSINESS.name} rota assistant 👋 Can you cover the ${s.goal.outlet} close tonight, *${fmtWindow(ask)}*? Your usual S$${c.rate}/h.\n\nReply in your own words or tap below.`,
      "offer",
      offerButtons(c),
    );
    log(ctx, "agent", "outreach", `Offered ${fmtWindow(ask)} to ${c.name}`, r.reasons.join(" · "));
    slots--;
  }
  const stillPending = s.crew.some((c) => PENDING.has(c.status));
  if (slots > 0 && !stillPending && s.crew.every((c) => c.status !== "bench")) {
    log(ctx, "agent", "planner", "Everyone eligible has been asked. Escalating the remaining gap to the manager", plan.gaps.map(fmtWindow).join(", "), "fail");
    notifyManager(ctx, `🚨 I've asked everyone eligible and can't fill ${plan.gaps.map(fmtWindow).join(", ")}. Options: shorten opening hours, cover it yourself, or allow a premium.`);
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

  if (plan.gaps.length === 0 && plan.withinBudget) {
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
      title: `Approve S$${plan.extraCost} in extras for tonight's cover?`,
      lines: [
        ...plan.segments.map((g) => `${name(g.crewId)}: ${fmtWindow(g.window)}${g.extras.length ? ` (+ ${g.extras.map((x) => x.label).join(", ")})` : ""}`),
        `S$${plan.extraCost} is above your S$${s.settings.autoApproveSpend} auto-approve rule, so I'm checking with you`,
        `Then: publish roster, confirm each person, thank and release everyone else`,
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
  s.phase = "executing";
  s.publishedRoster = plan.segments;
  const hash = plan.segments.map((g) => `${g.crewId}@${g.window.start}-${g.window.end}`).join("|");
  log(ctx, "agent", "roster", `Roster published: ${s.goal!.outlet} close tonight`, `version ${simpleHash(hash)}`);
  for (const g of plan.segments) {
    const c = crewById(s, g.crewId)!;
    c.status = "confirmed";
    const extras = g.extras.length ? `\n${g.extras.map((x) => `• ${x.label}: keep the receipt and claim it as usual`).join("\n")}` : "";
    send(ctx, c, `🎉 Confirmed: ${s.goal!.outlet} close tonight, *${fmtWindow(g.window)}*. Thank you, ${c.name}!${extras}\n\nIf anything changes, just tell me here.`, "confirm");
  }
  for (const c of s.crew) {
    if (plan.segments.some((g) => g.crewId === c.id)) continue;
    if (["contacted", "chased", "negotiating", "accepted", "human"].includes(c.status)) {
      c.status = "released";
      send(ctx, c, "Update: tonight's close is now covered, so no need. Thanks for being there 🙌", "release");
    }
  }
}

function verify(ctx: Ctx) {
  const { s } = ctx;
  const confirms = s.crew.flatMap((c) => c.thread.filter((m) => m.tag === "confirm").map((m) => ({ c, m })));
  if (confirms.length === 0 || confirms.some(({ m }) => m.status === "queued" || m.status === "retrying")) return;
  s.verified = confirms.map(({ c, m }) => ({ crewId: c.id, ok: m.status === "sent", evidence: m.evidence ?? m.error ?? "" }));
  const allOk = s.verified.every((v) => v.ok);
  s.phase = "done";
  s.finishedAt = ctx.now;
  log(ctx, "agent", "verify", allOk ? "Verified: roster published and every confirmation delivered" : "Finished with delivery problems (manager notified)", s.verified.map((v) => `${crewById(s, v.crewId)!.name} ${v.ok ? "✓" : "✗"}`).join(", "), allOk ? "ok" : "warn");
  const t = s.goal?.trigger;
  const what = t?.kind === "no_show" ? `${s.goal!.absent} didn't show up or reply` : t?.kind === "manager" ? `You reported ${s.goal!.absent} out` : `${s.goal!.absent} called in sick`;
  const name = (id: string) => crewById(s, id)!.name;
  const cover = (s.publishedRoster ?? []).map((g) => `${name(g.crewId)} ${fmtWindow(g.window)}${g.extras.length ? ` (${g.extras.map((x) => x.label[0].toLowerCase() + x.label.slice(1)).join(", ")})` : ""}`).join(", ");
  notifyManager(
    ctx,
    `✅ Sorted: tonight's ${BUSINESS.outlet} close is covered.\n\n${what}. Cover: ${cover}.\nExtras S$${s.plan?.extraCost ?? 0}${s.managerTaps === 0 ? `, within your S$${s.settings.autoApproveSpend} rule` : ""}. Everyone has been told.\n\nNothing needed from you.`,
  );
}

function simpleHash(x: string) {
  let h = 0;
  for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).slice(0, 7);
}

// ───────────────────────── incident start

function startIncident(ctx: Ctx, kind: "sick" | "no_show" | "manager", crewId: string | undefined, text: string) {
  const { s, now } = ctx;
  if (s.phase !== "lobby" && s.phase !== "checking") return;
  const absentee = crewId ? crewById(s, crewId) : undefined;
  const absent = absentee?.name ?? BUSINESS.absent;
  const goal: Goal = {
    raw: text,
    absent,
    outlet: BUSINESS.outlet,
    role: BUSINESS.shift.role,
    window: SHIFT,
    budget: BUSINESS.defaultBudget,
    via: "detected",
    confidence: 1,
    assumptions: [],
    trigger: { kind, crewId, text, at: now },
  };
  s.goal = goal;
  s.startedAt = s.startedAt ?? now;
  if (absentee) absentee.status = "absent";
  const how = kind === "sick" ? `${absent} called in sick: "${text}"` : kind === "no_show" ? `${absent} is a no-show` : `Manager reported ${absent} out: "${text}"`;
  log(ctx, kind === "manager" ? "manager" : "agent", "detect", `Gap detected. ${how}`, `${BUSINESS.outlet} ${BUSINESS.shift.role.toLowerCase()} ${fmtWindow(SHIFT)} is now uncovered`, "warn");
  for (const c of s.crew) {
    if (c.rostered) continue;
    const reason = whyNot(c, goal);
    if (reason) {
      c.status = "ineligible";
      log(ctx, "agent", "rules", `Excluded ${c.name}`, reason);
    } else if (c.status === "ineligible") c.status = "bench";
  }
  const order = rank(s.crew, goal);
  log(ctx, "agent", "ranking", `Ranked ${order.length} eligible crew`, order.map((r, i) => `#${i + 1} ${crewById(s, r.crewId)!.name}`).join(", "));
  if (s.settings.autoOutreach) {
    log(ctx, "agent", "policy", "Your standing rules allow it: messaging eligible crew now, no approval needed", `never says who is absent or why · extras up to S$${s.settings.autoApproveSpend} auto-approved`);
    s.phase = "negotiating";
    contactWave(ctx);
    return;
  }
  const first = order.slice(0, s.settings.waveSize).map((r) => crewById(s, r.crewId)!.name);
  const gate: Gate = {
    id: `g${s.nextId++}`,
    kind: "outreach",
    title: "Message crew about tonight's close?",
    lines: [`Ask ${first.join(", ")} first`, `Messages never say who is absent or why`],
    extraCost: 0,
    createdAt: now,
    status: "pending",
  };
  s.gates.push(gate);
  s.phase = "awaiting_outreach";
  log(ctx, "agent", "approvals", "Auto-messaging is off: asking the manager first", gate.title, "wait");
  notifyManager(ctx, `📋 ${how}.\n\n${gate.lines.map((l) => `• ${l}`).join("\n")}\n\nShall I start?`, gateButtons(gate));
}

// ───────────────────────── visible plan

export function deriveSteps(s?: LiveState): Step[] {
  const phase = s?.phase ?? "lobby";
  const order = ["lobby", "checking", "awaiting_outreach", "negotiating", "awaiting_package", "executing", "done"];
  const at = order.indexOf(phase);
  const has = Boolean(s?.goal);
  const asked = s?.crew.filter((c) => c.contactedAt).length ?? 0;
  const replies = s?.crew.filter((c) => c.contactedAt && c.thread.some((m) => m.dir === "in")).length ?? 0;
  const t = s?.goal?.trigger;
  const gate = s?.gates.find((g) => g.kind === "package");
  return [
    {
      id: "detect",
      title: "Spot the problem",
      detail: t ? (t.kind === "sick" ? `${s!.goal!.absent} texted in sick` : t.kind === "no_show" ? `${s!.goal!.absent} didn't check in or reply` : `Manager reported ${s!.goal!.absent} out`) : phase === "checking" ? "Someone hasn't checked in: asking if they're coming" : "Watching tonight's roster for sick calls and no-shows",
      status: has ? "done" : phase === "checking" ? "active" : "waiting",
    },
    { id: "rank", title: "Check the rules", detail: has ? `${s!.crew.filter((c) => !c.rostered && c.status !== "ineligible").length} can cover · ${s!.crew.filter((c) => c.status === "ineligible").length} ruled out, each with a reason` : "Certificates, hour caps, rest, leave", status: has ? "done" : "waiting" },
    { id: "negotiate", title: "Ask crew", detail: has ? `${asked} asked · ${replies} replied` : "Several people at once, in plain language", status: at > 3 ? "done" : at === 3 || at === 2 ? "active" : "waiting" },
    { id: "replan", title: "Build the cover", detail: s?.plan ? s.plan.explanation : "Split shifts, rides, budget", status: at > 3 ? "done" : at === 3 ? "active" : "waiting" },
    {
      id: "confirm",
      title: "Confirm",
      detail: gate ? (gate.status === "pending" ? "Over your auto-approve rule: waiting for you" : "Approved by the manager") : at >= 5 ? `Within your rules: confirmed automatically` : `Automatic if extras ≤ S$${s?.settings.autoApproveSpend ?? 30}`,
      status: at >= 5 ? "done" : at === 4 ? "active" : "waiting",
    },
    { id: "notify", title: "Tell everyone", detail: "Confirm cover, release the rest, update the roster", status: at === 6 ? "done" : at === 5 ? "active" : "waiting" },
    { id: "verify", title: "Check delivery and report", detail: s?.verified ? `${s.verified.filter((v) => v.ok).length}/${s.verified.length} confirmations delivered · manager told once` : "Delivery receipt for every message", status: at === 6 ? "done" : "waiting" },
  ];
}
