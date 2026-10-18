"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bot,
  BotOff,
  Brain,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  MessagesSquare,
  Pencil,
  QrCode,
  RotateCcw,
  Scale,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Table2,
  TrendingUp,
  Users,
  UserX,
  X,
  Zap,
} from "lucide-react";
import type { LiveAction } from "../actions.ts";
import { rank, whyNot } from "../planner.ts";
import { qrPath } from "../qr.ts";
import { BUSINESS, fmtHour, fmtWindow, overlaps } from "../scenario.ts";
import type { AuditEntry, Crew, CrewStatus, Gate, LiveState, Msg, Slot } from "../types.ts";
import { clock, fmtElapsed, useLive, useNow, type LiveMeta, type Source } from "./use-live.ts";

type Act = (a: LiveAction) => Promise<{ ok: boolean; error?: string }>;
type Tone = "good" | "tent" | "wait" | "bad" | "human" | "idle";

const STATUS: Record<CrewStatus, { label: string; tone: Tone }> = {
  rostered: { label: "Working today", tone: "good" },
  checking: { label: "Not checked in", tone: "wait" },
  absent: { label: "Out today", tone: "bad" },
  bench: { label: "Available", tone: "idle" },
  ineligible: { label: "Ruled out", tone: "idle" },
  contacted: { label: "Asked", tone: "wait" },
  chased: { label: "Reminded", tone: "wait" },
  negotiating: { label: "Talking", tone: "wait" },
  accepted: { label: "Pencilled in", tone: "tent" },
  declined: { label: "Can't", tone: "bad" },
  no_response: { label: "No reply", tone: "bad" },
  unreachable: { label: "Unreachable", tone: "bad" },
  human: { label: "Manager handling", tone: "human" },
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

const DAY = { start: 7, end: 23 };
const hrs = (w: { start: number; end: number }) => w.end - w.start;
const money = (n: number) => `S$${n.toFixed(n % 1 ? 2 : 0)}`;

// ───────────────────────────────── building blocks (black outlines)

function Box({ className = "", children, id }: { className?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 rounded-2xl border-[1.5px] border-foreground bg-background ${className}`}>
      {children}
    </section>
  );
}

function Head({ icon, title, sub, right }: { icon: ReactNode; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b-[1.5px] border-foreground px-5 py-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {icon}
          {title}
        </h2>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${PILL[tone]}`}>{children}</span>;
}

function Btn({ onClick, children, kind = "outline", disabled, type = "button", title }: { onClick?: () => void; children: ReactNode; kind?: "solid" | "outline" | "danger"; disabled?: boolean; type?: "button" | "submit"; title?: string }) {
  const k = kind === "solid" ? "bg-foreground text-background hover:bg-foreground/85" : kind === "danger" ? "border-red-700 bg-red-50 text-red-800 hover:bg-red-100" : "bg-background hover:bg-muted";
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled} className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-foreground px-3 text-xs font-medium transition-colors disabled:opacity-40 ${k}`}>
      {children}
    </button>
  );
}

const Label = ({ children }: { children: ReactNode }) => <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{children}</p>;

// ───────────────────────────────── page

export function LiveApp({ source }: { source: Source }) {
  const { state, meta, act, offline } = useLive(source);
  const now = useNow(500);
  const [chatWith, setChatWith] = useState<string | null>(null);
  if (!state) return <div className="dashboard flex min-h-screen items-center justify-center bg-muted/20 text-sm text-muted-foreground">Connecting to the agent…</div>;
  const elapsed = state.startedAt ? (state.finishedAt ?? now) - state.startedAt : 0;
  const openChat = (id: string) => {
    setChatWith(id);
    document.getElementById("chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="dashboard min-h-screen bg-muted/20 text-foreground">
      <header className="sticky top-0 z-30 border-b-[1.5px] border-foreground bg-background">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-2">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="text-base leading-tight font-semibold tracking-tight">ContinuityOS</p>
              <p className="text-xs text-muted-foreground">
                {BUSINESS.name} · {BUSINESS.outlet} outlet · today
              </p>
            </div>
          </div>
          <nav className="hidden items-center gap-1 text-xs md:flex">
            {[
              ["status", "Status"],
              ["timetable", "Timetable"],
              ["chat", "Staff chat"],
              ["insights", "Insights"],
              ["timesheet", "Timesheet"],
            ].map(([id, l]) => (
              <a key={id} href={`#${id}`} className="rounded-md px-2.5 py-1.5 font-medium hover:bg-muted">
                {l}
              </a>
            ))}
          </nav>
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

      <div className="mx-auto grid max-w-7xl items-start gap-6 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <main className="min-w-0 space-y-6">
          <StatusCard state={state} act={act} now={now} meta={meta} />
          <Metrics state={state} />
          <Timetable state={state} act={act} onChat={openChat} />
          <StaffChat state={state} act={act} selected={chatWith} onSelect={setChatWith} now={now} />
          <div id="insights" className="grid scroll-mt-20 gap-6 md:grid-cols-2">
            <RulesCard state={state} act={act} />
            <JoinCard state={state} meta={meta} source={source} />
            <Fairness state={state} />
            <Memory state={state} onChat={openChat} />
          </div>
          <Impact state={state} />
          <EvidenceLog state={state} />
          <DemoBar state={state} meta={meta} act={act} />
          <Timesheet state={state} />
        </main>
        <HowItWorks state={state} />
      </div>
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

// ───────────────────────────────── status

function StatusCard({ state, act, now, meta }: { state: LiveState; act: Act; now: number; meta: LiveMeta }) {
  const close = state.slots.find((s) => s.id === "close-lead")!;
  const aisha = state.crew.find((c) => c.id === "aisha")!;
  const gate = state.gates.find((g) => g.status === "pending");
  const waiting = state.crew.filter((c) => c.status === "human");
  const p = state.phase;
  const g = state.goal;
  const coverage = state.plan ? Math.round((state.plan.coveredHours / state.plan.totalHours) * 100) : 0;
  const realAisha = aisha.seat?.kind === "telegram";
  const checking = state.crew.find((c) => c.status === "checking");
  const last = state.history[state.history.length - 1];

  let icon = <BadgeCheck className="size-6" />;
  let tone = "bg-emerald-50";
  let title = "Today is fully staffed";
  let sub = `${state.slots.length} shifts on the timetable. The agent is watching for sick calls, no-shows and empty slots.`;
  if (p === "checking" && checking) {
    icon = <Clock3 className="size-6" />;
    tone = "bg-amber-50";
    title = `Checking on ${checking.name}`;
    const left = Math.max(0, state.settings.noShowWaitSec - Math.floor((now - (checking.lastActivityAt ?? now)) / 1000));
    sub = `${checking.name} hasn't checked in. The agent asked if they're coming and will find cover in ${left}s if there's no reply.`;
  } else if ((p === "negotiating" || p === "awaiting_outreach") && g) {
    icon = <Bot className="size-6" />;
    tone = "bg-amber-50";
    title = `Finding cover: ${g.role.toLowerCase()} ${fmtWindow(g.window)}`;
    sub = state.plan?.gaps.length ? `Still open: ${state.plan.gaps.map(fmtWindow).join(", ")}. The agent is asking staff now. Nothing needed from you.` : "The agent is asking staff now. Nothing needed from you.";
  } else if (p === "awaiting_package") {
    icon = <AlertTriangle className="size-6" />;
    tone = "bg-amber-50";
    title = "One decision needed";
    sub = "Cover is found, but the extra cost is above your auto-approve rule.";
  } else if (p === "executing") {
    icon = <Send className="size-6" />;
    tone = "bg-sky-50";
    title = "Updating the timetable";
    sub = "Confirming the people covering, releasing everyone else, checking every message arrived.";
  } else if (p === "done" && last) {
    title = "Covered. Nothing needed from you.";
    sub = `${last.trigger}. ${last.outcome}.`;
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
        {p === "done" && last && <Outcome state={state} />}
        {gate && <Decision gate={gate} act={act} />}
        {waiting.map((c) => (
          <Handover key={c.id} c={c} act={act} />
        ))}
        {(p === "lobby" || p === "done") && close.assignments.some((a) => a.crewId === "aisha") && (
          <div className="rounded-xl border-[1.5px] border-dashed border-foreground/60 p-4">
            <Label>Try it</Label>
            <p className="mt-1 text-sm">
              {realAisha
                ? `${aisha.seat?.kind === "telegram" ? aisha.seat.handle : ""} is playing Aisha. Ask them to text the bot that they can't come in, or simulate a no-show.`
                : "Make something go wrong. The manager doesn't touch anything after this. You can also clear any shift in the timetable."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!realAisha && (
                <Btn kind="solid" onClick={() => act({ action: "sim_reply", crewId: "aisha", text: aisha.persona[0] })}>
                  <Smartphone className="size-3.5" />
                  Aisha texts in sick
                </Btn>
              )}
              <Btn onClick={() => act({ action: "no_show", crewId: "aisha" })}>
                <UserX className="size-3.5" />
                Aisha doesn&apos;t show up
              </Btn>
            </div>
            {!meta.autoplay && <p className="mt-2 text-[11px] text-muted-foreground">Simulated staff are set to wait: answer for them in Staff chat.</p>}
          </div>
        )}
      </div>
    </Box>
  );
}

function Outcome({ state }: { state: LiveState }) {
  const last = state.history[state.history.length - 1];
  const msg = [...state.managerInbox].reverse().find((m) => m.text.startsWith("✅"));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat value={fmtElapsed(last.ms)} label="from problem to covered" />
        <Stat value={String(last.taps)} label="taps by the manager" />
        <Stat value={money(last.extra)} label="extra cost" />
      </div>
      {msg && (
        <div>
          <Label>The only message the manager got</Label>
          <div className="mt-1.5 rounded-xl border-[1.5px] border-foreground bg-muted/40 p-3 text-sm leading-6 whitespace-pre-wrap">{msg.text}</div>
        </div>
      )}
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
        className="mt-3 flex flex-wrap gap-2"
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
        <input id={`handover-${c.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Reply to ${c.name} as the manager…`} className="min-h-9 min-w-0 flex-1 rounded-lg border-[1.5px] border-foreground bg-background px-3 text-xs outline-none" />
        <Btn type="submit" kind="solid">
          Send
        </Btn>
        <Btn onClick={() => act({ action: "takeover", crewId: c.id, on: false })}>Hand back to AI</Btn>
      </form>
    </div>
  );
}

// ───────────────────────────────── metrics

function Metrics({ state }: { state: LiveState }) {
  const pending = state.gates.filter((g) => g.status === "pending");
  const need = state.slots.reduce((a, s) => a + hrs(s.window), 0);
  const have = state.slots.reduce((a, s) => a + s.assignments.reduce((b, x) => b + hrs(x.window), 0), 0);
  const extra = state.history.reduce((a, h) => a + h.extra, 0) + (state.phase !== "done" && state.plan ? state.plan.extraCost : 0);
  const receipts = state.audit.filter((a) => a.status === "ok" && (a.action.startsWith("Delivered") || a.tool === "timetable" || a.tool === "verify")).length;
  return (
    <section aria-label="Today at a glance" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric icon={<ShieldCheck className="size-4" />} label="Needs approval" value={pending.length ? "Yes" : "No"} hint={pending.length ? pending[0].title : "No unsafe action taken"} accent={pending.length > 0} />
      <Metric icon={<Users className="size-4" />} label="Timetable coverage" value={`${Math.round((have / need) * 100)}%`} hint={`${have}h of ${need}h staffed today`} />
      <Metric icon={<CircleDollarSign className="size-4" />} label="Extra spend" value={money(extra)} hint={`auto-approved up to S$${state.settings.autoApproveSpend} per recovery`} />
      <Metric icon={<FileCheck2 className="size-4" />} label="Verified actions" value={String(receipts)} hint="With evidence receipts" />
    </section>
  );
}

function Metric({ icon, label, value, hint, accent = false }: { icon: ReactNode; label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border-[1.5px] border-foreground p-4 ${accent ? "bg-amber-50" : "bg-background"}`}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-medium tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

// ───────────────────────────────── timetable

function Timetable({ state, act, onChat }: { state: LiveState; act: Act; onChat: (id: string) => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  const span = DAY.end - DAY.start;
  const pct = (h: number) => `${((h - DAY.start) / span) * 100}%`;
  const w = (x: { start: number; end: number }) => `${((x.end - x.start) / span) * 100}%`;
  const name = (id: string) => state.crew.find((c) => c.id === id)?.name ?? id;
  const ticks: number[] = [];
  for (let h = DAY.start; h <= DAY.end; h += 2) ticks.push(h);
  const active = state.goal && !["lobby", "done", "checking"].includes(state.phase) ? state.goal.slotId : undefined;
  return (
    <Box id="timetable">
      <Head
        icon={<Table2 className="size-4" />}
        title="Today's timetable"
        sub="Click a shift to change who's on it. Clear one and the agent fills it by itself."
        right={
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded border-[1.5px] border-foreground bg-background px-1.5">Planned</span>
            <span className="inline-flex items-center gap-1 rounded border-[1.5px] border-foreground bg-foreground px-1.5 text-background">
              <Bot className="size-3" />
              Filled by AI
            </span>
            <span className="inline-flex items-center gap-1 rounded border-[1.5px] border-amber-700 bg-amber-100 px-1.5">
              <Pencil className="size-3" />
              Manager edit
            </span>
            <span className="inline-flex items-center gap-1 rounded border-[1.5px] border-red-700 bg-red-50 px-1.5 text-red-800">Needs staff</span>
          </div>
        }
      />
      <div className="overflow-x-auto p-5">
        <div className="min-w-[44rem]">
          <div className="relative ml-36 h-5 font-mono text-[10px] text-muted-foreground">
            {ticks.map((h, i) => (
              <span key={h} className="absolute" style={{ left: pct(h), transform: i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>
                {fmtHour(h)}
              </span>
            ))}
          </div>
          <div className="space-y-2">
            {state.slots.map((sl) => {
              const isEdit = edit === sl.id;
              const isActive = active === sl.id;
              return (
                <div key={sl.id}>
                  <div className={`flex items-center gap-2 rounded-xl ${isActive ? "bg-amber-50" : ""}`}>
                    <button onClick={() => setEdit(isEdit ? null : sl.id)} className="w-34 shrink-0 rounded-lg px-2 py-1.5 text-left hover:bg-muted" aria-expanded={isEdit}>
                      <span className="block text-xs font-semibold">{sl.role}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground">{fmtWindow(sl.window)}</span>
                    </button>
                    <div className="relative h-11 flex-1 rounded-lg border-[1.5px] border-foreground/25 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_calc(12.5%-1px),rgb(0_0_0/0.06)_calc(12.5%-1px),rgb(0_0_0/0.06)_12.5%)]">
                      <button
                        onClick={() => setEdit(isEdit ? null : sl.id)}
                        aria-label={`Edit ${sl.role} ${fmtWindow(sl.window)}`}
                        className={`absolute inset-y-1 rounded-md border-[1.5px] border-red-700 bg-[repeating-linear-gradient(135deg,#fee2e2_0_6px,#fff_6px_12px)] ${isActive ? "animate-pulse" : ""}`}
                        style={{ left: pct(sl.window.start), width: w(sl.window) }}
                      >
                        <span className="px-2 text-[10px] font-semibold text-red-800">Needs staff</span>
                      </button>
                      {isActive &&
                        state.plan?.segments.map((g) => (
                          <span
                            key={`t${g.crewId}`}
                            className="absolute inset-y-1 flex items-center gap-1 overflow-hidden rounded-md border-[1.5px] border-dashed border-sky-700 bg-sky-50 px-2 text-[11px] font-semibold whitespace-nowrap text-sky-900"
                            style={{ left: pct(g.window.start), width: w(g.window) }}
                          >
                            {name(g.crewId)} <span className="font-normal opacity-70">pencilled in</span>
                          </span>
                        ))}
                      {sl.assignments.map((a) => (
                        <button
                          key={a.crewId + a.window.start}
                          onClick={() => onChat(a.crewId)}
                          title={`Open chat with ${name(a.crewId)}`}
                          className={`absolute inset-y-1 flex items-center gap-1 overflow-hidden rounded-md border-[1.5px] px-2 text-[11px] font-semibold whitespace-nowrap ${a.source === "ai" ? "border-foreground bg-foreground text-background" : a.source === "manager" ? "border-amber-700 bg-amber-100" : "border-foreground bg-background"}`}
                          style={{ left: pct(a.window.start), width: w(a.window) }}
                        >
                          {a.source === "ai" && <Bot className="size-3 shrink-0" />}
                          {a.source === "manager" && <Pencil className="size-3 shrink-0" />}
                          {name(a.crewId)}
                          <span className="font-normal opacity-70">{fmtWindow(a.window)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {sl.out?.length ? (
                    <p className="mt-0.5 ml-36 text-[10px] text-muted-foreground">
                      {sl.out.map((o) => (
                        <span key={o.crewId} className="mr-2 line-through decoration-red-600">
                          {name(o.crewId)} ({o.reason})
                        </span>
                      ))}
                    </p>
                  ) : null}
                  {isEdit && <SlotEditor sl={sl} state={state} act={act} onClose={() => setEdit(null)} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Box>
  );
}

function SlotEditor({ sl, state, act, onClose }: { sl: Slot; state: LiveState; act: Act; onClose: () => void }) {
  const current = sl.assignments.length === 1 ? sl.assignments[0].crewId : "";
  const [pick, setPick] = useState(current);
  const c = state.crew.find((x) => x.id === pick);
  const rule = c ? (whyNot({ ...c, today: c.today?.filter((x) => !sl.assignments.some((a) => a.crewId === c.id && overlaps(a.window, x))) }, { window: sl.window, absent: "", needsCert: sl.needsCert }) ?? null) : null;
  const busy = !!state.goal && !["lobby", "done", "checking"].includes(state.phase) && state.goal.slotId !== sl.id;
  return (
    <div className="mt-2 ml-36 rounded-xl border-[1.5px] border-foreground bg-muted/30 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`slot-${sl.id}`} className="block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Who&apos;s on {sl.role.toLowerCase()} {fmtWindow(sl.window)}
          </label>
          <select id={`slot-${sl.id}`} value={pick} onChange={(e) => setPick(e.target.value)} className="mt-1 min-h-9 rounded-lg border-[1.5px] border-foreground bg-background px-2 text-xs">
            <option value="">Nobody: let the agent find someone</option>
            {state.crew.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · {x.role}
              </option>
            ))}
          </select>
        </div>
        <Btn
          kind="solid"
          onClick={() => {
            void act({ action: "assign", slotId: sl.id, crewId: pick || null });
            onClose();
          }}
          disabled={pick === current && sl.assignments.length <= 1}
        >
          Save
        </Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
      {rule && <p className="mt-2 text-[11px] text-amber-800">⚠ This breaks a rule ({rule}). You can still save it; it&apos;s logged as a manager override.</p>}
      {!pick && <p className="mt-2 text-[11px] text-muted-foreground">{busy ? "Another recovery is running, so this one will be queued and handled right after." : "The agent will treat this as an empty shift and start finding cover straight away."}</p>}
      {sl.needsCert && <p className="mt-1 text-[11px] text-muted-foreground">This shift needs a food-safety certified lead.</p>}
    </div>
  );
}

// ───────────────────────────────── staff chat

const QUICK = ["yes I can do the whole shift", "only after 7, and I'd need a grab", "who called in sick?", "can I talk to the manager?", "sorry can't today"];

function StaffChat({ state, act, selected, onSelect, now }: { state: LiveState; act: Act; selected: string | null; onSelect: (id: string) => void; now: number }) {
  const fallback = [...state.crew].sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0))[0];
  const c = state.crew.find((x) => x.id === selected) ?? fallback;
  const directory = [...state.crew].sort((a, b) => Number(!!b.contactedAt) - Number(!!a.contactedAt) || Number(!!b.rostered) - Number(!!a.rostered));
  return (
    <Box id="chat">
      <Head
        icon={<MessagesSquare className="size-4" />}
        title="Staff chat"
        sub="The AI messages people automatically. You can message anyone yourself, or switch the AI off for one person."
        right={<Pill tone="idle">{state.crew.filter((x) => x.seat?.kind === "telegram").length} real phones · rest simulated</Pill>}
      />
      <div className="grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="max-h-[34rem] overflow-y-auto border-b-[1.5px] border-foreground p-2 lg:border-r-[1.5px] lg:border-b-0">
          {directory.map((x) => {
            const active = x.id === c.id;
            const last = [...x.thread].reverse().find((m) => m.tag !== "welcome");
            const fresh = last && now - last.at < 4000;
            return (
              <button key={x.id} onClick={() => onSelect(x.id)} className={`mb-1 flex w-full items-center gap-2.5 rounded-lg p-2 text-left ${active ? "bg-foreground text-background" : fresh ? "bg-amber-50" : "hover:bg-muted"}`}>
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px] font-semibold ${active ? "border-background" : "border-foreground"}`}>{x.name.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    {x.name}
                    {x.aiPaused ? <BotOff className="size-3" aria-label="AI off" /> : null}
                    {x.seat?.kind === "telegram" && <Smartphone className="size-3" aria-label="Real phone" />}
                  </span>
                  <span className={`block truncate text-[10px] ${active ? "opacity-70" : "text-muted-foreground"}`}>{x.today?.length && (x.status === "ineligible" || x.status === "bench") ? `Working ${fmtWindow(x.today[0])}` : STATUS[x.status].label}</span>
                </span>
              </button>
            );
          })}
        </div>
        <Conversation c={c} state={state} act={act} />
      </div>
    </Box>
  );
}

function Conversation({ c, state, act }: { c: Crew; state: LiveState; act: Act }) {
  const [draft, setDraft] = useState("");
  const [asStaff, setAsStaff] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const msgs = c.thread.filter((m) => m.tag !== "welcome");
  useEffect(() => box.current?.scrollTo({ top: box.current.scrollHeight }), [msgs.length, c.id]);
  const sim = c.seat?.kind !== "telegram";
  const incident = state.goal && !["lobby", "done", "checking"].includes(state.phase);
  const canOffer = incident && !c.contactedAt && !whyNot(c, state.goal!) && c.status !== "absent";
  const offerWhy = !incident ? "No open shift right now" : c.contactedAt ? "Already asked" : (whyNot(c, state.goal!) ?? "");
  const run = async (a: LiveAction) => {
    const r = await act(a);
    setErr(r.ok ? null : (r.error ?? "Could not send"));
  };
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-[1.5px] border-foreground/15 p-4">
        <div>
          <p className="text-sm font-semibold">
            {c.name} <span className="font-normal text-muted-foreground">· {c.role} · {c.outlet}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {c.today?.length ? `Working today ${c.today.map(fmtWindow).join(", ")}` : "Not working today"} · {c.hoursThisWeek}/{c.maxHours}h this week · {c.seat?.kind === "telegram" ? `Telegram ${c.seat.handle}` : "simulated phone"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={c.today?.length && (c.status === "ineligible" || c.status === "bench") ? "good" : STATUS[c.status].tone}>{c.today?.length && (c.status === "ineligible" || c.status === "bench") ? "Working today" : STATUS[c.status].label}</Pill>
          <button
            onClick={() => act({ action: "ai_toggle", crewId: c.id, on: !!c.aiPaused })}
            aria-pressed={!c.aiPaused}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border-[1.5px] px-2.5 text-[11px] font-medium ${c.aiPaused ? "border-violet-700 bg-violet-50 text-violet-900" : "border-foreground bg-foreground text-background"}`}
          >
            {c.aiPaused ? <BotOff className="size-3.5" /> : <Bot className="size-3.5" />}
            {c.aiPaused ? "AI off: you reply by hand" : "AI replies automatically"}
          </button>
        </div>
      </div>

      <div ref={box} role="log" aria-label={`Conversation with ${c.name}`} className="flex max-h-[24rem] min-h-56 flex-col gap-2 overflow-y-auto bg-muted/20 p-4">
        {msgs.length === 0 ? (
          <p className="m-auto max-w-xs text-center text-xs text-muted-foreground">No messages with {c.name} yet. The agent writes when a shift needs cover, or you can message them below.</p>
        ) : (
          msgs.map((m) => <Bubble key={m.id} m={m} crew={c} act={act} />)
        )}
      </div>

      <div className="space-y-3 border-t-[1.5px] border-foreground/15 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Btn kind="solid" disabled={!canOffer} title={canOffer ? "" : offerWhy} onClick={() => run({ action: "offer_to", crewId: c.id })}>
            <Sparkles className="size-3.5" />
            AI: offer the open shift to {c.name}
          </Btn>
          {!canOffer && offerWhy && <span className="text-[11px] text-muted-foreground">{offerWhy}</span>}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            void run({ action: "say", crewId: c.id, text: draft });
            setDraft("");
          }}
        >
          <label htmlFor="mgr-msg" className="sr-only">
            Message {c.name} as the manager
          </label>
          <input id="mgr-msg" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Message ${c.name} yourself (manual)…`} className="min-h-9 min-w-0 flex-1 rounded-lg border-[1.5px] border-foreground bg-background px-3 text-xs outline-none" />
          <Btn type="submit" kind="solid">
            <Send className="size-3.5" />
            Send
          </Btn>
        </form>
        {sim && c.status !== "absent" && (
          <div className="rounded-xl border-[1.5px] border-dashed border-foreground/40 p-3">
            <Label>Reply as {c.name} (simulated phone)</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(c.rostered && !c.contactedAt ? ["sorry, I'm sick, can't come in today", "omw, running 10 min late", "ok see you later"] : QUICK).map((q) => (
                <button key={q} onClick={() => void run({ action: "sim_reply", crewId: c.id, text: q })} className="rounded-full border-[1.5px] border-foreground/50 bg-background px-2.5 py-1 text-[11px] hover:border-foreground">
                  {q}
                </button>
              ))}
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!asStaff.trim()) return;
                void run({ action: "sim_reply", crewId: c.id, text: asStaff });
                setAsStaff("");
              }}
            >
              <label htmlFor="as-staff" className="sr-only">
                Reply as {c.name}
              </label>
              <input id="as-staff" value={asStaff} onChange={(e) => setAsStaff(e.target.value)} placeholder="Or type anything they might say…" className="min-h-9 min-w-0 flex-1 rounded-lg border-[1.5px] border-foreground/50 bg-background px-3 text-xs outline-none" />
              <Btn type="submit">Reply</Btn>
            </form>
          </div>
        )}
        {err && <p className="text-[11px] text-red-700">{err}</p>}
      </div>
    </div>
  );
}

function Bubble({ m, crew, act }: { m: Msg; crew: Crew; act: Act }) {
  const incoming = m.dir === "in";
  const manual = m.from === "manager";
  const lastOut = [...crew.thread].reverse().find((x) => x.dir === "out");
  const canTap = !incoming && m.buttons && m.id === lastOut?.id && crew.seat?.kind !== "telegram" && !["confirmed", "released", "declined", "human", "absent"].includes(crew.status);
  const tick: Record<string, string> = { queued: "sending…", sent: "delivered ✓", retrying: `retrying (${m.attempts})`, abandoned: "failed", failed: "failed" };
  return (
    <div className={`max-w-[85%] rounded-xl border-[1.5px] px-3 py-2 ${incoming ? "self-start border-foreground bg-background" : manual ? "self-end border-violet-700 bg-violet-50" : "self-end border-foreground bg-foreground text-background"}`}>
      <p className="flex flex-wrap items-center gap-1 text-[10px] opacity-70">
        {incoming ? crew.name : manual ? "Manager · manual" : "AI · automatic"} · {clock(m.at)}
        {!incoming && ` · ${tick[m.status ?? "queued"]}`}
      </p>
      <p className="mt-0.5 text-xs leading-5 whitespace-pre-wrap">{m.text.replace(/\*/g, "")}</p>
      {!incoming && m.buttons && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {m.buttons.map((b) => (
            <button key={b.data} disabled={!canTap} onClick={() => act({ action: "sim_button", crewId: crew.id, button: b.data.split(":")[2] })} className="rounded-md border border-current/40 px-2 py-0.5 text-[10px] enabled:hover:bg-white/15 disabled:opacity-50">
              {b.label}
            </button>
          ))}
        </div>
      )}
      {m.parsed && (
        <p className="mt-1 font-mono text-[9px] text-muted-foreground">
          AI understood: {m.parsed.intent.replace("_", " ")}
          {m.parsed.window ? ` ${fmtWindow(m.parsed.window)}` : ""}
          {m.parsed.transport ? " +ride" : ""} · {Math.round(m.parsed.confidence * 100)}%
        </p>
      )}
    </div>
  );
}

// ───────────────────────────────── insights

function RulesCard({ state, act }: { state: LiveState; act: Act }) {
  return (
    <Box>
      <Head icon={<ShieldCheck className="size-4" />} title="Rules the manager set once" sub="The agent acts inside these without asking." />
      <div className="p-5">
        <ul className="space-y-2 text-xs leading-5">
          {[
            "Message eligible staff straight away",
            `Certified leads for lead shifts; hour caps, ${BUSINESS.minRestHours}h rest, one shift a day`,
            "Never tell anyone who is absent or why",
            "Ask the manager only for extras over the limit, if nobody can cover, or if someone wants a person",
          ].map((r) => (
            <li key={r} className="flex gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0" />
              {r}
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <Label>Auto-approve extras per recovery up to</Label>
          <div className="mt-2 flex gap-2">
            {[0, 30, 100].map((l) => (
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
      </div>
    </Box>
  );
}

function JoinCard({ state, meta, source }: { state: LiveState; meta: LiveMeta; source: Source }) {
  const url = meta.joinUrl ?? `https://t.me/YourCrewBot?start=${state.code}`;
  const qr = useMemo(() => qrPath(url), [url]);
  const real = Boolean(meta.joinUrl);
  const joined = state.crew.filter((c) => c.seat?.kind === "telegram");
  return (
    <Box>
      <Head icon={<QrCode className="size-4" />} title="Join as staff" sub="Judges play the staff on their own phones." />
      <div className="flex items-start gap-4 p-5">
        <div className="relative w-24 shrink-0 overflow-hidden rounded-lg border-[1.5px] border-foreground bg-white p-1">
          <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className={`block w-full ${real ? "" : "opacity-25"}`} style={{ shapeRendering: "crispEdges" }} role="img" aria-label="QR code to join on Telegram">
            <path d={qr.d} fill="#0a0a0a" />
          </svg>
          {!real && <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-foreground py-0.5 text-center text-[9px] font-semibold tracking-wider text-background uppercase">{source === "local" ? "Demo" : "No bot"}</span>}
        </div>
        <div className="text-xs leading-5 text-muted-foreground">
          <p>{real ? "Scan to get a seat on Telegram. The first person plays Aisha, who calls in sick; the next ones are the staff the agent asks." : "In a live session, judges scan this and get real Telegram messages. Here every phone is simulated."}</p>
          <p className="mt-2 font-medium text-foreground">{joined.length ? `Joined: ${joined.map((c) => c.name).join(", ")}` : "Nobody joined yet"}</p>
        </div>
      </div>
    </Box>
  );
}

function Fairness({ state }: { state: LiveState }) {
  const added = (id: string) => state.slots.reduce((a, s) => a + s.assignments.filter((x) => x.crewId === id && x.source !== "plan").reduce((b, x) => b + hrs(x.window), 0), 0);
  const rows = state.crew.filter((c) => !c.onLeave).map((c) => ({ c, base: c.hoursThisWeek, add: added(c.id) }));
  const max = 44;
  return (
    <Box>
      <Head icon={<Scale className="size-4" />} title="Fair hours this week" sub="The agent asks people with the most room first. Black is today's extra shift." />
      <div className="space-y-1.5 p-5">
        {rows.map(({ c, base, add }) => (
          <div key={c.id} className="grid grid-cols-[4rem_1fr_3.5rem] items-center gap-2 text-[11px]">
            <span className="truncate font-medium">{c.name}</span>
            <div className="relative h-3 overflow-hidden rounded-full border-[1.5px] border-foreground/60 bg-background">
              <div className="absolute inset-y-0 left-0 bg-foreground/25" style={{ width: `${(Math.min(base, max) / max) * 100}%` }} />
              <div className="absolute inset-y-0 bg-foreground" style={{ left: `${(Math.min(base, max) / max) * 100}%`, width: `${(Math.min(add, max - base) / max) * 100}%` }} />
            </div>
            <span className="text-right font-mono tabular-nums">
              {base + add}/{c.maxHours}h
            </span>
          </div>
        ))}
      </div>
    </Box>
  );
}

function Memory({ state, onChat }: { state: LiveState; onChat: (id: string) => void }) {
  const known = state.crew.filter((c) => c.notes?.length);
  return (
    <Box>
      <Head icon={<Brain className="size-4" />} title="What the agent remembers" sub="Learned from replies and used next time it ranks people." />
      <div className="p-5">
        {known.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing yet. Notes appear here as staff reply, for example who needs a ride or prefers late shifts.</p>
        ) : (
          <ul className="space-y-2">
            {known.map((c) => (
              <li key={c.id} className="text-xs">
                <button onClick={() => onChat(c.id)} className="font-semibold underline-offset-2 hover:underline">
                  {c.name}
                </button>
                <span className="text-muted-foreground"> · {c.notes!.join(" · ")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Box>
  );
}

function Impact({ state }: { state: LiveState }) {
  const h = state.history;
  const manual = h.length * state.baseline.minutes;
  const spent = h.reduce((a, x) => a + x.ms, 0) / 60000;
  return (
    <Box>
      <Head icon={<TrendingUp className="size-4" />} title="Impact today" sub={`Compared with doing it by hand: about ${state.baseline.minutes} min, ${state.baseline.messages} messages and ${state.baseline.apps} apps per gap (${state.baseline.source}).`} />
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={String(h.length)} label="gaps filled by the agent" />
          <Stat value={`${Math.max(0, Math.round(manual - spent))} min`} label="manager time saved" />
          <Stat value={String(h.reduce((a, x) => a + x.taps, 0))} label="manager taps needed" />
          <Stat value={String(h.reduce((a, x) => a + x.messages, 0))} label="messages the agent handled" />
        </div>
        {h.length > 0 && (
          <ol className="divide-y divide-foreground/15 overflow-hidden rounded-xl border-[1.5px] border-foreground">
            {h.map((x, i) => (
              <li key={i} className="grid gap-1 p-3 text-xs sm:grid-cols-[1fr_auto]">
                <span>
                  <span className="font-semibold">
                    {x.role} {fmtWindow(x.window)}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    · {x.trigger} → {x.outcome}
                  </span>
                </span>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {fmtElapsed(x.ms)} · {x.taps} taps · {money(x.extra)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Box>
  );
}

function EvidenceLog({ state }: { state: LiveState }) {
  const canDownload = !(globalThis as { __lvNoDownload?: boolean }).__lvNoDownload;
  return (
    <Box>
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-5">
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
              <Btn onClick={() => save(`continuityos-evidence-${state.code}.json`, "application/json", JSON.stringify({ exportedAt: new Date().toISOString(), timetable: state.slots, history: state.history, audit: state.audit }, null, 2))}>
                <Download className="size-3.5" />
                Export log as JSON
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
        {meta.autoplay ? "Simulated staff reply on their own" : "Simulated staff wait for you"}
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

// ───────────────────────────────── timesheet (last section)

type Row = { name: string; role: string; shift: string; hours: number; rate: number; base: number; extras: number; note: string; total: number; source: string };

function timesheetRows(state: LiveState): Row[] {
  const rows: Row[] = [];
  for (const sl of state.slots) {
    for (const a of [...sl.assignments].sort((x, y) => x.window.start - y.window.start)) {
      const c = state.crew.find((x) => x.id === a.crewId)!;
      const hours = hrs(a.window);
      const base = hours * c.rate;
      rows.push({
        name: c.name,
        role: sl.role,
        shift: fmtWindow(a.window),
        hours,
        rate: c.rate,
        base,
        extras: a.extras ?? 0,
        note: a.extrasNote ?? "",
        total: base + (a.extras ?? 0),
        source: a.source === "ai" ? "Filled by AI" : a.source === "manager" ? "Manager edit" : "Planned",
      });
    }
    for (const o of sl.out ?? []) {
      const c = state.crew.find((x) => x.id === o.crewId)!;
      rows.push({ name: c.name, role: sl.role, shift: `${fmtWindow(sl.window)} (not worked)`, hours: 0, rate: c.rate, base: 0, extras: 0, note: "Out today, reason kept private", total: 0, source: "Dropped out" });
    }
  }
  return rows;
}

function save(filename: string, type: string, content: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Timesheet({ state }: { state: LiveState }) {
  const rows = timesheetRows(state);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const totalHours = rows.reduce((a, r) => a + r.hours, 0);
  const date = new Date().toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const canDownload = !(globalThis as { __lvNoDownload?: boolean }).__lvNoDownload;
  const csv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["Name", "Role", "Shift", "Hours", "Rate (S$/h)", "Base pay (S$)", "Extras (S$)", "Extras note", "Total (S$)", "Source"].map(esc).join(",")];
    rows.forEach((r) => lines.push([r.name, r.role, r.shift, r.hours, r.rate, r.base.toFixed(2), r.extras.toFixed(2), r.note, r.total.toFixed(2), r.source].map(esc).join(",")));
    lines.push(["Total", "", "", totalHours, "", "", "", "", total.toFixed(2), ""].map(esc).join(","));
    save(`timesheet-${BUSINESS.outlet.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv", lines.join("\n"));
  };
  const doc = () => {
    const tr = rows
      .map((r) => `<tr><td>${r.name}</td><td>${r.role}</td><td>${r.shift}</td><td class="n">${r.hours}</td><td class="n">${r.rate.toFixed(2)}</td><td class="n">${r.base.toFixed(2)}</td><td class="n">${r.extras ? r.extras.toFixed(2) : "–"}</td><td class="n"><b>${r.total.toFixed(2)}</b></td><td>${r.source}${r.note ? `<br><small>${r.note}</small>` : ""}</td></tr>`)
      .join("");
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Timesheet · ${BUSINESS.name} ${BUSINESS.outlet}</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:40px;color:#111}h1{margin:0 0 4px}p{margin:0 0 20px;color:#555}table{border-collapse:collapse;width:100%}th,td{border:1.5px solid #111;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f2f2f2;font-size:12px;text-transform:uppercase;letter-spacing:.05em}.n{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:700}small{color:#666}footer{margin-top:24px;font-size:12px;color:#666}@media print{body{margin:16px}}</style></head><body><h1>Timesheet: ${BUSINESS.name} ${BUSINESS.outlet}</h1><p>${date} · generated by ContinuityOS</p><table><thead><tr><th>Name</th><th>Role</th><th>Shift</th><th>Hours</th><th>Rate (S$/h)</th><th>Base (S$)</th><th>Extras (S$)</th><th>Total (S$)</th><th>Notes</th></tr></thead><tbody>${tr}</tbody><tfoot><tr><td colspan="3">Total</td><td class="n">${totalHours}</td><td></td><td></td><td></td><td class="n">${total.toFixed(2)}</td><td></td></tr></tfoot></table><footer>Absence reasons are not recorded on this sheet. Extras are reimbursed on receipt.</footer></body></html>`;
    save(`timesheet-${BUSINESS.outlet.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.html`, "text/html", html);
  };
  return (
    <Box id="timesheet">
      <Head
        icon={<FileText className="size-4" />}
        title="Today's timesheet"
        sub="Who worked, when, and what they're paid. Always matches the timetable above, including the agent's changes."
        right={
          canDownload ? (
            <div className="flex flex-wrap gap-2">
              <Btn kind="solid" onClick={doc}>
                <Download className="size-3.5" />
                Download document
              </Btn>
              <Btn onClick={csv}>
                <FileSpreadsheet className="size-3.5" />
                Download CSV (Excel)
              </Btn>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground">Downloads work on the live website</span>
          )
        }
      />
      <div className="overflow-x-auto p-5">
        <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b-[1.5px] border-foreground text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              <th className="py-2 pr-3 font-semibold">Name</th>
              <th className="py-2 pr-3 font-semibold">Role</th>
              <th className="py-2 pr-3 font-semibold">Shift</th>
              <th className="py-2 pr-3 text-right font-semibold">Hours</th>
              <th className="py-2 pr-3 text-right font-semibold">Rate</th>
              <th className="py-2 pr-3 text-right font-semibold">Extras</th>
              <th className="py-2 pr-3 text-right font-semibold">Pay</th>
              <th className="py-2 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/15">
            {rows.map((r, i) => (
              <tr key={i} className={r.hours === 0 ? "text-muted-foreground" : ""}>
                <td className="py-2 pr-3 font-medium">{r.name}</td>
                <td className="py-2 pr-3">{r.role}</td>
                <td className="py-2 pr-3 font-mono">{r.shift}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.hours}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(r.rate)}/h</td>
                <td className="py-2 pr-3 text-right tabular-nums" title={r.note}>
                  {r.extras ? money(r.extras) : "–"}
                </td>
                <td className="py-2 pr-3 text-right font-semibold tabular-nums">{money(r.total)}</td>
                <td className="py-2">
                  <Pill tone={r.source === "Filled by AI" ? "tent" : r.source === "Manager edit" ? "wait" : r.source === "Dropped out" ? "bad" : "idle"}>{r.source}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-[1.5px] border-foreground font-semibold">
              <td className="py-2 pr-3" colSpan={3}>
                Total
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{totalHours}</td>
              <td />
              <td />
              <td className="py-2 pr-3 text-right tabular-nums">{money(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Box>
  );
}

// ───────────────────────────────── side: how it works

function HowItWorks({ state }: { state: LiveState }) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      <Box className="p-5">
        <Label>About this project</Label>
        <h2 className="mt-1 text-lg leading-snug font-semibold">One less thing for the shift manager</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          When someone calls in sick or doesn&apos;t show up, managers lose an hour texting people one by one. ContinuityOS notices the gap, asks the right staff in parallel, rebuilds the timetable and only interrupts the manager for real decisions.
        </p>
      </Box>
      <Box className="p-5">
        <Label>What the agent does, live</Label>
        <ol className="mt-3">
          {state.steps.map((s, i) => {
            const dot = s.status === "done" ? "bg-foreground text-background border-foreground" : s.status === "active" ? "animate-pulse bg-amber-100 border-foreground" : "bg-background border-foreground/30 text-muted-foreground";
            return (
              <li key={s.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px] font-semibold ${dot}`}>{s.status === "done" ? <Check className="size-3" /> : i + 1}</span>
                  {i < state.steps.length - 1 && <span className={`w-[1.5px] flex-1 ${s.status === "done" ? "bg-foreground" : "bg-foreground/20"}`} />}
                </div>
                <div className="min-w-0 pb-3">
                  <p className={`text-xs font-semibold ${s.status === "waiting" ? "text-muted-foreground" : ""}`}>{s.title}</p>
                  <p className="text-[11px] leading-4 text-muted-foreground">{s.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Box>
      <Box className="p-5">
        <Label>Why judges can trust it</Label>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-4">
          <li>• Hard rules checked before anyone is asked, with reasons shown</li>
          <li>• Approval rules set once; anything outside them stops for the manager</li>
          <li>• Every message has a delivery receipt; failures are retried</li>
          <li>• Absence reasons are never shared with other staff</li>
          <li>• Any chat can be taken over by a person at any time</li>
        </ul>
      </Box>
    </aside>
  );
}
