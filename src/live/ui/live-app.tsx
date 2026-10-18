"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, BadgeCheck, Bot, Check, ChevronDown, Clock3, Download, QrCode, RotateCcw, Send, ShieldCheck, Smartphone, UserX, X, Zap } from "lucide-react";
import type { LiveAction } from "../actions.ts";
import { rank, whyNot } from "../planner.ts";
import { qrPath } from "../qr.ts";
import { BUSINESS, fmtHour, fmtWindow } from "../scenario.ts";
import type { AuditEntry, Crew, CrewStatus, Gate, LiveState, Msg, Step } from "../types.ts";
import { clock, fmtElapsed, useLive, useNow, type LiveMeta, type Source } from "./use-live.ts";

type Act = (a: LiveAction) => Promise<{ ok: boolean; error?: string }>;
type Tone = "good" | "tent" | "wait" | "bad" | "human" | "idle";

const STATUS: Record<CrewStatus, { label: string; tone: Tone }> = {
  rostered: { label: "On tonight's roster", tone: "good" },
  checking: { label: "Not checked in", tone: "wait" },
  absent: { label: "Out tonight", tone: "bad" },
  bench: { label: "Not asked", tone: "idle" },
  ineligible: { label: "Ruled out", tone: "idle" },
  contacted: { label: "Asked", tone: "wait" },
  chased: { label: "Reminded", tone: "wait" },
  negotiating: { label: "Talking", tone: "wait" },
  accepted: { label: "Pencilled in", tone: "tent" },
  declined: { label: "Can't", tone: "bad" },
  no_response: { label: "No reply", tone: "bad" },
  unreachable: { label: "Unreachable", tone: "bad" },
  human: { label: "Wants the manager", tone: "human" },
  confirmed: { label: "Confirmed", tone: "good" },
  released: { label: "Not needed", tone: "idle" },
};

const PILL: Record<Tone, string> = {
  good: "border-emerald-700 bg-emerald-50 text-emerald-900",
  tent: "border-sky-700 bg-sky-50 text-sky-900",
  wait: "border-amber-700 bg-amber-50 text-amber-900",
  bad: "border-red-700 bg-red-50 text-red-800",
  human: "border-violet-700 bg-violet-50 text-violet-900",
  idle: "border-foreground/40 bg-background text-muted-foreground",
};

/** Black-outlined surface used everywhere on this page. */
function Box({ className = "", children, id }: { className?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className={`rounded-2xl border-[1.5px] border-foreground bg-background ${className}`}>
      {children}
    </section>
  );
}

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${PILL[tone]}`}>{children}</span>;
}

function Btn({ onClick, children, kind = "outline", disabled, type = "button" }: { onClick?: () => void; children: ReactNode; kind?: "solid" | "outline" | "danger"; disabled?: boolean; type?: "button" | "submit" }) {
  const k =
    kind === "solid"
      ? "bg-foreground text-background hover:bg-foreground/85"
      : kind === "danger"
        ? "border-red-700 bg-red-50 text-red-800 hover:bg-red-100"
        : "bg-background hover:bg-muted";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-foreground px-3 text-xs font-medium transition-colors disabled:opacity-40 ${k}`}>
      {children}
    </button>
  );
}

export function LiveApp({ source }: { source: Source }) {
  const { state, meta, act, offline } = useLive(source);
  const now = useNow(500);
  if (!state) return <div className="dashboard flex min-h-screen items-center justify-center bg-muted/20 text-sm text-muted-foreground">Connecting to the agent…</div>;
  const elapsed = state.startedAt ? (state.finishedAt ?? now) - state.startedAt : 0;
  return (
    <div className="dashboard min-h-screen bg-muted/20 text-foreground">
      <header className="sticky top-0 z-30 border-b-[1.5px] border-foreground bg-background">
        <div className="mx-auto flex min-h-16 max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-2">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="text-base leading-tight font-semibold tracking-tight">ContinuityOS</p>
              <p className="text-xs text-muted-foreground">
                {BUSINESS.name} · {BUSINESS.outlet} · tonight&apos;s close {fmtWindow({ start: BUSINESS.shift.start, end: BUSINESS.shift.end })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Connection state={state} meta={meta} offline={offline} />
            {state.startedAt && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-foreground px-2.5 py-1 font-mono text-sm tabular-nums">
                <Clock3 className="size-3.5" />
                {fmtElapsed(elapsed)}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
        <StatusCard state={state} act={act} now={now} meta={meta} />
        <Timeline state={state} act={act} now={now} />
        <div className="grid gap-6 sm:grid-cols-2">
          <RulesCard state={state} act={act} />
          <JoinCard state={state} meta={meta} source={source} />
        </div>
        <EvidenceLog state={state} />
        <DemoBar state={state} meta={meta} act={act} />
      </main>
    </div>
  );
}

function Connection({ state, meta, offline }: { state: LiveState; meta: LiveMeta; offline: boolean }) {
  const [dot, text] = offline
    ? ["bg-red-500", "Offline"]
    : state.mode === "rehearsal"
      ? ["bg-amber-500", "Demo · simulated phones"]
      : meta.bot
        ? ["bg-emerald-500", `Telegram @${meta.bot}`]
        : ["bg-amber-500", "Simulated phones"];
  return (
    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex" title={state.telegram.error}>
      <span className={`size-2 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

// ───────────────────────────────── 1. status: the only thing a manager needs to read

function StatusCard({ state, act, now, meta }: { state: LiveState; act: Act; now: number; meta: LiveMeta }) {
  const rostered = state.crew.find((c) => c.rostered)!;
  const gate = state.gates.find((g) => g.status === "pending");
  const waiting = state.crew.filter((c) => c.status === "human");
  const p = state.phase;
  const coverage = state.plan ? Math.round((state.plan.coveredHours / state.plan.totalHours) * 100) : 0;
  const realAisha = rostered.seat?.kind === "telegram";

  let icon = <BadgeCheck className="size-6" />;
  let tone = "bg-emerald-50";
  let title = "Tonight is fully staffed";
  let sub = `${rostered.name} is the closing lead, ${fmtWindow({ start: BUSINESS.shift.start, end: BUSINESS.shift.end })}. The agent is watching for sick calls and no-shows.`;
  if (p === "checking") {
    icon = <Clock3 className="size-6" />;
    tone = "bg-amber-50";
    title = `Checking on ${rostered.name}`;
    const left = Math.max(0, state.settings.noShowWaitSec - Math.floor((now - (rostered.lastActivityAt ?? now)) / 1000));
    sub = `${rostered.name} hasn't checked in for the ${fmtHour(BUSINESS.shift.start)} start. The agent asked if she's coming and will find cover in ${left}s if there's no reply.`;
  } else if (p === "negotiating" || p === "awaiting_outreach") {
    icon = <Bot className="size-6" />;
    tone = "bg-amber-50";
    title = `Finding cover for ${state.goal?.absent ?? "the gap"}`;
    sub = state.plan?.gaps.length ? `Still open: ${state.plan.gaps.map(fmtWindow).join(", ")}. The agent is asking crew now.` : "The agent is asking crew now.";
  } else if (p === "awaiting_package") {
    icon = <AlertTriangle className="size-6" />;
    tone = "bg-amber-50";
    title = "One decision needed";
    sub = "Cover is found, but the extra spend is above your auto-approve rule.";
  } else if (p === "executing") {
    icon = <Send className="size-6" />;
    tone = "bg-sky-50";
    title = "Confirming cover";
    sub = "Telling the people covering, releasing everyone else, checking every message arrived.";
  } else if (p === "done") {
    title = "Covered. Nothing needed from you.";
    sub = state.plan?.explanation ?? "";
  }

  return (
    <Box className="overflow-hidden" id="status">
      <div className={`flex items-start gap-4 border-b-[1.5px] border-foreground p-5 ${tone}`}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-foreground bg-background">{icon}</span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{sub}</p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {(p === "negotiating" || p === "awaiting_package" || p === "executing") && (
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Shift covered</span>
              <span className="font-mono tabular-nums">{coverage}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full border-[1.5px] border-foreground bg-background">
              <div className="h-full bg-foreground transition-all duration-500" style={{ width: `${coverage}%` }} />
            </div>
          </div>
        )}

        {p === "done" && <Outcome state={state} />}

        {gate && <Decision gate={gate} act={act} />}

        {waiting.map((c) => (
          <Handover key={c.id} c={c} act={act} />
        ))}

        {p === "lobby" && (
          <div className="rounded-xl border-[1.5px] border-dashed border-foreground/60 p-4">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Try it</p>
            <p className="mt-1 text-sm">
              {realAisha
                ? `${rostered.seat?.kind === "telegram" ? rostered.seat.handle : rostered.name} is playing ${rostered.name}. Ask them to text the bot that they can't come in, or simulate a no-show.`
                : `Make something go wrong. The manager doesn't touch anything after this.`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!realAisha && (
                <Btn kind="solid" onClick={() => act({ action: "sim_reply", crewId: rostered.id, text: rostered.persona[0] ?? "I'm sick, can't come in tonight" })}>
                  <Smartphone className="size-3.5" />
                  {rostered.name} texts in sick
                </Btn>
              )}
              <Btn onClick={() => act({ action: "no_show", crewId: rostered.id })}>
                <UserX className="size-3.5" />
                {rostered.name} doesn&apos;t show up
              </Btn>
            </div>
            {!meta.autoplay && <p className="mt-2 text-[11px] text-muted-foreground">Simulated crew are set to wait: answer for them in step 3.</p>}
          </div>
        )}
      </div>
    </Box>
  );
}

function Outcome({ state }: { state: LiveState }) {
  const ms = (state.finishedAt ?? 0) - (state.startedAt ?? 0);
  const last = [...state.managerInbox].reverse().find((m) => m.text.startsWith("✅"));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat value={fmtElapsed(ms)} label="from problem to covered" />
        <Stat value={String(state.managerTaps)} label="taps by the manager" />
        <Stat value={`S$${state.plan?.extraCost ?? 0}`} label="extra spend" />
      </div>
      {last && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">The only message the manager got</p>
          <div className="rounded-xl border-[1.5px] border-foreground bg-muted/40 p-3 text-sm leading-6 whitespace-pre-wrap">{last.text}</div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Doing this by hand: about {state.baseline.minutes} min, {state.baseline.messages} messages and {state.baseline.apps} apps ({state.baseline.source}).
      </p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border-[1.5px] border-foreground p-3">
      <p className="font-mono text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{label}</p>
    </div>
  );
}

function Decision({ gate, act }: { gate: Gate; act: Act }) {
  return (
    <div className="rounded-xl border-[1.5px] border-amber-700 bg-amber-50 p-4">
      <p className="text-sm font-semibold">{gate.title}</p>
      <ul className="mt-2 space-y-1 text-xs leading-5">
        {gate.lines.map((l) => (
          <li key={l} className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0" />
            {l}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Btn kind="solid" onClick={() => act({ action: "decide", gateId: gate.id, approve: true })}>
          Approve
        </Btn>
        <Btn onClick={() => act({ action: "decide", gateId: gate.id, approve: false })}>Reject</Btn>
      </div>
    </div>
  );
}

function Handover({ c, act }: { c: Crew; act: Act }) {
  const [draft, setDraft] = useState("");
  const last = [...c.thread].reverse().find((m) => m.dir === "in");
  return (
    <div className="rounded-xl border-[1.5px] border-violet-700 bg-violet-50 p-4">
      <p className="text-sm font-semibold">{c.name} asked to talk to a person</p>
      <p className="mt-1 text-xs text-violet-900">&ldquo;{last?.text}&rdquo; · the agent paused this chat and kept going with everyone else.</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          void act({ action: "say", crewId: c.id, text: draft });
          setDraft("");
        }}
      >
        <label htmlFor={`handover-${c.id}`} className="sr-only">
          Message {c.name}
        </label>
        <input
          id={`handover-${c.id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Reply to ${c.name} as the manager…`}
          className="min-h-9 min-w-0 flex-1 rounded-lg border-[1.5px] border-foreground bg-background px-3 text-xs outline-none"
        />
        <Btn type="submit" kind="solid">
          Send
        </Btn>
        <Btn onClick={() => act({ action: "takeover", crewId: c.id, on: false })}>Hand back</Btn>
      </form>
    </div>
  );
}

// ───────────────────────────────── 2. what the agent did, in order

function Timeline({ state, act, now }: { state: LiveState; act: Act; now: number }) {
  return (
    <Box className="p-5" id="steps">
      <h2 className="text-base font-semibold">What the agent did</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">Each step happens on its own. Open any step to see the detail.</p>
      <ol className="mt-5">
        {state.steps.map((s, i) => (
          <StepRow key={s.id} step={s} n={i + 1} last={i === state.steps.length - 1}>
            <StepBody step={s} state={state} act={act} now={now} />
          </StepRow>
        ))}
      </ol>
    </Box>
  );
}

function StepRow({ step, n, last, children }: { step: Step; n: number; last: boolean; children: ReactNode }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open ?? step.status === "active";
  const can = step.status !== "waiting";
  const dot =
    step.status === "done"
      ? "bg-foreground text-background border-foreground"
      : step.status === "active"
        ? "bg-amber-100 border-foreground text-foreground"
        : "bg-background border-foreground/30 text-muted-foreground";
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] text-xs font-semibold ${dot} ${step.status === "active" ? "animate-pulse" : ""}`}>
          {step.status === "done" ? <Check className="size-4" /> : n}
        </span>
        {!last && <span className={`w-[1.5px] flex-1 ${step.status === "done" ? "bg-foreground" : "bg-foreground/20"}`} />}
      </div>
      <div className="min-w-0 flex-1 pb-5">
        <button onClick={() => can && setOpen(!isOpen)} disabled={!can} aria-expanded={isOpen} className="flex w-full items-start justify-between gap-3 text-left disabled:cursor-default">
          <span className="min-w-0">
            <span className={`block text-sm font-semibold ${step.status === "waiting" ? "text-muted-foreground" : ""}`}>{step.title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{step.detail}</span>
          </span>
          {can && <ChevronDown className={`mt-0.5 size-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />}
        </button>
        {can && isOpen && <div className="mt-3">{children}</div>}
      </div>
    </li>
  );
}

function StepBody({ step, state, act, now }: { step: Step; state: LiveState; act: Act; now: number }) {
  switch (step.id) {
    case "detect":
      return <DetectBody state={state} />;
    case "rank":
      return <RankBody state={state} />;
    case "negotiate":
      return <NegotiateBody state={state} act={act} now={now} />;
    case "replan":
      return <CoverBar state={state} />;
    case "confirm":
      return <ConfirmBody state={state} />;
    case "notify":
      return <NotifyBody state={state} />;
    case "verify":
      return <VerifyBody state={state} />;
    default:
      return null;
  }
}

function DetectBody({ state }: { state: LiveState }) {
  const c = state.crew.find((x) => x.rostered)!;
  const msgs = c.thread.filter((m) => m.tag !== "welcome").slice(-3);
  return (
    <div className="space-y-2 rounded-xl border-[1.5px] border-foreground bg-muted/30 p-3">
      {msgs.map((m) => (
        <Bubble key={m.id} m={m} crew={c} />
      ))}
      {state.goal?.trigger?.kind === "no_show" && <p className="text-xs text-muted-foreground">No reply within {state.settings.noShowWaitSec}s, so the agent treated it as a no-show.</p>}
      {state.goal && <p className="text-xs font-medium">→ {BUSINESS.outlet} closing lead {fmtWindow(state.goal.window)} is uncovered. The reason stays private.</p>}
    </div>
  );
}

function RankBody({ state }: { state: LiveState }) {
  const goal = state.goal!;
  const order = rank(state.crew, goal);
  const out = state.crew.filter((c) => c.status === "ineligible");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border-[1.5px] border-foreground p-3">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Can cover, best first</p>
        <ol className="mt-2 space-y-1.5">
          {order.map((r, i) => {
            const c = state.crew.find((x) => x.id === r.crewId)!;
            return (
              <li key={c.id} className="text-xs">
                <span className="font-semibold">
                  {i + 1}. {c.name}
                </span>{" "}
                <span className="text-muted-foreground">
                  · {c.hoursThisWeek}/{c.maxHours}h this week · {c.travelMin} min away
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="rounded-xl border-[1.5px] border-foreground p-3">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Ruled out</p>
        <ul className="mt-2 space-y-1.5">
          {out.map((c) => (
            <li key={c.id} className="text-xs">
              <span className="font-semibold">{c.name}</span> <span className="text-red-800">· {whyNot(c, goal)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const QUICK = ["yes I can do the whole shift", "only after 7, and I'd need a grab", "who called in sick?", "can I talk to the manager?", "sorry can't tonight"];

function NegotiateBody({ state, act, now }: { state: LiveState; act: Act; now: number }) {
  const asked = state.crew.filter((c) => c.contactedAt).sort((a, b) => (a.contactedAt ?? 0) - (b.contactedAt ?? 0));
  const [open, setOpen] = useState<string | null>(null);
  if (asked.length === 0) return <p className="text-xs text-muted-foreground">Nobody asked yet.</p>;
  return (
    <div className="divide-y-[1.5px] divide-foreground/15 overflow-hidden rounded-xl border-[1.5px] border-foreground">
      {asked.map((c) => {
        const last = [...c.thread].reverse().find((m) => m.tag !== "welcome");
        const isOpen = open === c.id;
        const fresh = last && now - last.at < 4000;
        return (
          <div key={c.id} className={fresh ? "bg-amber-50/60" : ""}>
            <button onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground text-[11px] font-semibold">{c.name.slice(0, 2).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {c.name}
                  {c.seat?.kind === "telegram" && <Smartphone className="size-3.5 text-emerald-700" aria-label="Real phone" />}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {last ? `${last.dir === "in" ? `${c.name}: ` : "Agent: "}${last.text.replace(/\*/g, "").replace(/\n+/g, " ")}` : ""}
                </span>
              </span>
              <Pill tone={STATUS[c.status].tone}>{c.offer && (c.status === "accepted" || c.status === "confirmed") ? `${STATUS[c.status].label} ${fmtWindow(c.offer.window)}` : STATUS[c.status].label}</Pill>
              <ChevronDown className={`size-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && <Thread c={c} act={act} />}
          </div>
        );
      })}
    </div>
  );
}

function Thread({ c, act }: { c: Crew; act: Act }) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const msgs = c.thread.filter((m) => m.tag !== "welcome");
  useEffect(() => box.current?.scrollTo({ top: box.current.scrollHeight }), [msgs.length]);
  const sim = c.seat?.kind !== "telegram";
  const open = !["confirmed", "released", "declined", "no_response", "unreachable", "human"].includes(c.status);
  const reply = async (t: string) => {
    if (!t.trim()) return;
    const r = await act({ action: "sim_reply", crewId: c.id, text: t });
    setErr(r.ok ? null : (r.error ?? "Could not send"));
    setDraft("");
  };
  return (
    <div className="border-t-[1.5px] border-foreground/15 bg-muted/20 p-3">
      <div ref={box} className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {msgs.map((m) => (
          <Bubble key={m.id} m={m} crew={c} act={act} />
        ))}
      </div>
      {sim && open && (
        <div className="mt-3 border-t border-dashed border-foreground/30 pt-3">
          <p className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Reply as {c.name} (simulated phone)</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button key={q} onClick={() => void reply(q)} className="rounded-full border-[1.5px] border-foreground/50 bg-background px-2.5 py-1 text-[11px] hover:border-foreground">
                {q}
              </button>
            ))}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void reply(draft);
            }}
          >
            <label htmlFor={`reply-${c.id}`} className="sr-only">
              Reply as {c.name}
            </label>
            <input id={`reply-${c.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Or type anything…" className="min-h-9 min-w-0 flex-1 rounded-lg border-[1.5px] border-foreground bg-background px-3 text-xs outline-none" />
            <Btn type="submit" kind="solid">
              Send
            </Btn>
          </form>
          {err && <p className="mt-1 text-[11px] text-red-700">{err}</p>}
        </div>
      )}
      {!sim && <p className="mt-2 text-[11px] text-muted-foreground">A real person on Telegram ({c.seat?.kind === "telegram" ? c.seat.handle : ""}). Their replies appear here live.</p>}
    </div>
  );
}

function Bubble({ m, crew, act }: { m: Msg; crew: Crew; act?: Act }) {
  const incoming = m.dir === "in";
  const lastOut = [...crew.thread].reverse().find((x) => x.dir === "out");
  const canTap = act && !incoming && m.buttons && m.id === lastOut?.id && crew.seat?.kind !== "telegram" && !["confirmed", "released", "declined", "human", "absent"].includes(crew.status);
  const tick: Record<string, string> = { queued: "sending…", sent: "delivered ✓", retrying: `retrying (${m.attempts})`, abandoned: "failed", failed: "failed" };
  return (
    <div className={`max-w-[85%] rounded-xl border-[1.5px] px-3 py-2 ${incoming ? "self-start border-foreground bg-background" : m.from === "manager" ? "self-end border-violet-700 bg-violet-50" : "self-end border-foreground bg-foreground text-background"}`}>
      <p className="text-[10px] opacity-60">
        {incoming ? crew.name : m.from === "manager" ? "Manager" : "Agent"} · {clock(m.at)}
        {!incoming && ` · ${tick[m.status ?? "queued"]}`}
      </p>
      <p className="mt-0.5 text-xs leading-5 whitespace-pre-wrap">{m.text.replace(/\*/g, "")}</p>
      {!incoming && m.buttons && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {m.buttons.map((b) => (
            <button
              key={b.data}
              disabled={!canTap}
              onClick={() => act?.({ action: "sim_button", crewId: crew.id, button: b.data.split(":")[2] })}
              className="rounded-md border border-current/40 px-2 py-0.5 text-[10px] enabled:hover:bg-white/15 disabled:opacity-50"
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
      {m.parsed && (
        <p className="mt-1 font-mono text-[9px] text-muted-foreground">
          understood: {m.parsed.intent.replace("_", " ")}
          {m.parsed.window ? ` ${fmtWindow(m.parsed.window)}` : ""}
          {m.parsed.transport ? " +ride" : ""} · {Math.round(m.parsed.confidence * 100)}%
        </p>
      )}
    </div>
  );
}

function CoverBar({ state }: { state: LiveState }) {
  const g = state.goal?.window ?? { start: BUSINESS.shift.start, end: BUSINESS.shift.end };
  const span = g.end - g.start;
  const pct = (h: number) => `${((h - g.start) / span) * 100}%`;
  const w = (x: { start: number; end: number }) => `${((x.end - x.start) / span) * 100}%`;
  const final = state.phase === "executing" || state.phase === "done";
  const name = (id: string) => state.crew.find((c) => c.id === id)?.name ?? id;
  const hours: number[] = [];
  for (let h = g.start; h <= g.end; h++) hours.push(h);
  return (
    <div className="rounded-xl border-[1.5px] border-foreground p-3">
      <div className="relative h-10 overflow-hidden rounded-lg border-[1.5px] border-foreground bg-[repeating-linear-gradient(135deg,#fee2e2_0_6px,#fff_6px_12px)]">
        {state.plan?.segments.map((s) => (
          <div
            key={s.crewId + s.window.start}
            className={`absolute inset-y-0 flex items-center border-r-[1.5px] border-foreground px-2 text-[11px] font-semibold whitespace-nowrap ${final ? "bg-foreground text-background" : "bg-sky-100"}`}
            style={{ left: pct(s.window.start), width: w(s.window) }}
          >
            {name(s.crewId)} {fmtWindow(s.window)}
            {s.extras.length ? " · ride" : ""}
          </div>
        ))}
      </div>
      <div className="relative mt-1 h-4 font-mono text-[10px] text-muted-foreground">
        {hours.map((h, i) => (
          <span key={h} className="absolute" style={{ left: pct(h), transform: i === 0 ? "none" : i === hours.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>
            {fmtHour(h)}
          </span>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Red stripes are still uncovered. The plan is rebuilt after every reply, so a partial yes becomes a split shift.</p>
    </div>
  );
}

function ConfirmBody({ state }: { state: LiveState }) {
  const gate = state.gates.find((g) => g.kind === "package");
  return (
    <div className="rounded-xl border-[1.5px] border-foreground p-3 text-xs leading-5">
      {gate ? (
        <p>
          Extras of S${gate.extraCost} were above the S${state.settings.autoApproveSpend} rule, so the agent asked the manager once ({gate.status}).
        </p>
      ) : (
        <p>
          Extras of S${state.plan?.extraCost ?? 0} are within the S${state.settings.autoApproveSpend} rule you set, so the agent confirmed without asking anyone.
        </p>
      )}
    </div>
  );
}

function NotifyBody({ state }: { state: LiveState }) {
  const rows = state.crew.flatMap((c) => c.thread.filter((m) => m.tag === "confirm" || m.tag === "release").map((m) => ({ c, m })));
  return (
    <ul className="divide-y divide-foreground/15 overflow-hidden rounded-xl border-[1.5px] border-foreground">
      {rows.map(({ c, m }) => (
        <li key={m.id} className="flex items-center justify-between gap-3 p-2.5 text-xs">
          <span>
            <span className="font-semibold">{c.name}</span> <span className="text-muted-foreground">· {m.tag === "confirm" ? "confirmed" : "told they're not needed"}</span>
          </span>
          <Pill tone={m.status === "sent" ? "good" : m.status === "abandoned" ? "bad" : "wait"}>{m.status === "sent" ? "delivered" : m.status === "retrying" ? `retrying (${m.attempts})` : m.status}</Pill>
        </li>
      ))}
    </ul>
  );
}

function VerifyBody({ state }: { state: LiveState }) {
  const last = [...state.managerInbox].reverse().find((m) => m.text.startsWith("✅"));
  return (
    <div className="space-y-2">
      {state.verified?.map((v) => (
        <p key={v.crewId} className="font-mono text-[11px] break-words text-muted-foreground">
          {v.ok ? "✓" : "✗"} {state.crew.find((c) => c.id === v.crewId)?.name}: {v.evidence}
        </p>
      ))}
      {last && <div className="rounded-xl border-[1.5px] border-foreground bg-muted/40 p-3 text-xs leading-5 whitespace-pre-wrap">{last.text}</div>}
    </div>
  );
}

// ───────────────────────────────── 3. rules, join, evidence

function RulesCard({ state, act }: { state: LiveState; act: Act }) {
  const limits = [0, 30, 100];
  return (
    <Box className="p-5" id="rules">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <ShieldCheck className="size-4" />
        Rules the manager set once
      </h2>
      <ul className="mt-3 space-y-2 text-xs leading-5">
        <li className="flex gap-2">
          <Check className="mt-0.5 size-3.5 shrink-0" />
          Message eligible crew straight away, without asking
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 size-3.5 shrink-0" />
          Food-safety certified leads only; respect hour caps and {BUSINESS.minRestHours}h rest
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 size-3.5 shrink-0" />
          Never tell anyone who is absent or why
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 size-3.5 shrink-0" />
          Ask the manager only for extras over the limit, if nobody can cover, or if someone wants a person
        </li>
      </ul>
      <div className="mt-4">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Auto-approve extras up to</p>
        <div className="mt-2 flex gap-2">
          {limits.map((l) => (
            <button
              key={l}
              onClick={() => act({ action: "settings", settings: { autoApproveSpend: l } })}
              aria-pressed={state.settings.autoApproveSpend === l}
              className={`min-h-8 rounded-lg border-[1.5px] border-foreground px-3 text-xs font-medium ${state.settings.autoApproveSpend === l ? "bg-foreground text-background" : "bg-background"}`}
            >
              S${l}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Set S$0 to see the agent stop and ask once.</p>
      </div>
    </Box>
  );
}

function JoinCard({ state, meta, source }: { state: LiveState; meta: LiveMeta; source: Source }) {
  const url = meta.joinUrl ?? `https://t.me/YourCrewBot?start=${state.code}`;
  const qr = useMemo(() => qrPath(url), [url]);
  const real = Boolean(meta.joinUrl);
  const seats = [state.crew.find((c) => c.rostered)!, ...rank(state.crew, { window: { start: BUSINESS.shift.start, end: BUSINESS.shift.end }, absent: "" }).map((r) => state.crew.find((c) => c.id === r.crewId)!)];
  return (
    <Box className="p-5" id="join">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <QrCode className="size-4" />
        Join as crew
      </h2>
      <div className="mt-3 flex items-start gap-4">
        <div className="relative w-24 shrink-0 overflow-hidden rounded-lg border-[1.5px] border-foreground bg-white p-1">
          <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className={`block w-full ${real ? "" : "opacity-25"}`} style={{ shapeRendering: "crispEdges" }} role="img" aria-label="QR code to join the crew on Telegram">
            <path d={qr.d} fill="#0a0a0a" />
          </svg>
          {!real && <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-foreground py-0.5 text-center text-[9px] font-semibold tracking-wider text-background uppercase">{source === "local" ? "Demo" : "No bot"}</span>}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {real ? "Scan to get a crew seat on Telegram. The first person to join plays Aisha, the one who calls in sick." : "In a live session, judges scan this and play the crew on their own phones. Here, every seat is simulated."}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {seats.map((c) => (
          <span key={c.id} className={`inline-flex items-center gap-1 rounded-md border-[1.5px] px-2 py-0.5 text-[11px] ${c.seat?.kind === "telegram" ? "border-emerald-700 bg-emerald-50" : "border-foreground/30"}`}>
            {c.seat?.kind === "telegram" ? <Smartphone className="size-3" /> : <Bot className="size-3 text-muted-foreground" />}
            {c.name}
          </span>
        ))}
      </div>
    </Box>
  );
}

function EvidenceLog({ state }: { state: LiveState }) {
  const canDownload = !(globalThis as { __lvNoDownload?: boolean }).__lvNoDownload;
  const download = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), goal: state.goal, roster: state.publishedRoster, verified: state.verified, audit: state.audit }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `continuityos-evidence-${state.code}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Box id="evidence">
      <details>
        <summary className="flex cursor-pointer items-center justify-between gap-3 p-5">
          <span className="flex items-center gap-2 text-base font-semibold">
            <Activity className="size-4" />
            Full evidence log
          </span>
          <span className="text-xs text-muted-foreground">{state.audit.length} entries · every decision and delivery receipt</span>
        </summary>
        <div className="border-t-[1.5px] border-foreground p-5">
          <ol className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {[...state.audit].reverse().map((e: AuditEntry) => (
              <li key={e.id} className="grid grid-cols-[4.5rem_1fr] gap-2 text-xs">
                <span className="font-mono text-[10px] text-muted-foreground">{clock(e.at)}</span>
                <span>
                  <span className={e.status === "fail" ? "text-red-800" : e.status === "warn" ? "text-amber-800" : ""}>{e.action}</span>
                  {e.evidence && <span className="block font-mono text-[10px] break-words text-muted-foreground">{e.evidence}</span>}
                </span>
              </li>
            ))}
          </ol>
          {canDownload && (
            <div className="mt-4">
              <Btn onClick={download} disabled={state.audit.length === 0}>
                <Download className="size-3.5" />
                Export as JSON
              </Btn>
            </div>
          )}
        </div>
      </details>
    </Box>
  );
}

function DemoBar({ state, meta, act }: { state: LiveState; meta: LiveMeta; act: Act }) {
  const [armed, setArmed] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-foreground/50 p-3">
      <span className="mr-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Demo controls</span>
      <Btn kind={state.failureInjected ? "danger" : "outline"} onClick={() => act({ action: "failure", on: !state.failureInjected })}>
        <Zap className="size-3.5" />
        {state.failureInjected ? "Messaging is down: restore" : "Break messaging"}
      </Btn>
      <Btn onClick={() => act({ action: "autoplay", on: !meta.autoplay })}>
        <Bot className="size-3.5" />
        {meta.autoplay ? "Simulated crew reply on their own" : "Simulated crew wait for you"}
      </Btn>
      <Btn
        onClick={() => {
          if (!armed) return setArmed(true);
          setArmed(false);
          void act({ action: "reset" });
        }}
      >
        <RotateCcw className="size-3.5" />
        {armed ? "Click again to reset" : "Reset"}
      </Btn>
      {armed && (
        <button onClick={() => setArmed(false)} aria-label="Cancel reset" className="text-muted-foreground">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
