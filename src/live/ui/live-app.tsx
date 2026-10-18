"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bot,
  Building2,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  FileCheck2,
  House,
  MapPin,
  MessageSquare,
  MessagesSquare,
  Network,
  Play,
  QrCode,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Table2,
  Users,
  Utensils,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LiveAction } from "../actions.ts";
import { rank, whyNot } from "../planner.ts";
import { qrPath } from "../qr.ts";
import { BUSINESS, fmtHour, fmtWindow } from "../scenario.ts";
import type { AuditEntry, Crew, CrewStatus, Gate, LiveState, Msg } from "../types.ts";
import { clock, fmtElapsed, useLive, useNow, type LiveMeta, type Source } from "./use-live.ts";

type Act = (a: LiveAction) => Promise<{ ok: boolean; error?: string }>;
type Tone = "good" | "tent" | "wait" | "bad" | "human" | "idle" | "off";

const STATUS: Record<CrewStatus, { label: string; tone: Tone }> = {
  bench: { label: "Not asked yet", tone: "idle" },
  ineligible: { label: "Excluded", tone: "off" },
  contacted: { label: "Offer delivered", tone: "wait" },
  chased: { label: "Reminder sent", tone: "wait" },
  negotiating: { label: "In conversation", tone: "wait" },
  accepted: { label: "Pencilled in", tone: "tent" },
  declined: { label: "Declined", tone: "bad" },
  no_response: { label: "No reply", tone: "bad" },
  unreachable: { label: "Unreachable", tone: "bad" },
  human: { label: "Human requested", tone: "human" },
  confirmed: { label: "Confirmed", tone: "good" },
  released: { label: "Released", tone: "idle" },
};

const BADGE: Record<Tone, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  tent: "border-sky-200 bg-sky-50 text-sky-800",
  wait: "border-amber-200 bg-amber-50 text-amber-800",
  bad: "border-red-200 bg-red-50 text-red-700",
  human: "border-violet-200 bg-violet-50 text-violet-800",
  idle: "",
  off: "text-muted-foreground",
};

const DOT: Record<Tone, string> = {
  good: "bg-emerald-500",
  tent: "bg-sky-500",
  wait: "bg-amber-500",
  bad: "bg-red-400",
  human: "bg-violet-500",
  idle: "bg-slate-400",
  off: "bg-slate-300",
};

const VIEWS = [
  { id: "incident-overview", label: "Incident overview", hint: "Risk and outcome", icon: House },
  { id: "join", label: "Join the crew", hint: "QR for the audience", icon: QrCode },
  { id: "live-recovery", label: "Recovery plan", hint: "Agent steps", icon: Sparkles },
  { id: "negotiation", label: "Live negotiation", hint: "Who the agent is asking", icon: Network },
  { id: "staffing-timetable", label: "Staffing timetable", hint: "Hourly coverage", icon: Table2 },
  { id: "worker-communications", label: "Worker communications", hint: "AI chat and handoff", icon: MessagesSquare },
  { id: "audit-trail", label: "Evidence log", hint: "Actions and receipts", icon: Activity },
  { id: "guardrails", label: "Rules & approvals", hint: "Limits and control", icon: Settings2 },
] as const;

export function LiveApp({ source }: { source: Source }) {
  const { state, meta, act, offline } = useLive(source);
  const now = useNow(500);
  const [view, setView] = useState<string>("Incident overview");
  const [selected, setSelected] = useState<string | null>(null);

  if (!state) return <div className="dashboard flex min-h-screen items-center justify-center bg-muted/20 text-sm text-muted-foreground">Connecting to the agent…</div>;

  const go = (label: string, id: string) => {
    setView(label);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const pending = state.gates.filter((g) => g.status === "pending");
  const resolved = state.phase === "done";
  const elapsed = state.startedAt ? (state.finishedAt ?? now) - state.startedAt : 0;
  const receipts = state.audit.filter((a) => a.status === "ok" && (a.action.startsWith("Delivered") || a.tool === "roster" || a.tool === "verify")).length;
  const coverage = state.plan ? Math.round((state.plan.coveredHours / state.plan.totalHours) * 100) : 0;
  const telegramSeats = state.crew.filter((c) => c.seat?.kind === "telegram").length;
  const chatCrew =
    state.crew.find((c) => c.id === selected) ??
    state.crew.filter((c) => c.thread.some((m) => m.tag !== "welcome")).sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0))[0];

  return (
    <div className="dashboard min-h-screen bg-muted/20 text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-background px-5 py-7 lg:flex">
        <button onClick={() => go("Incident overview", "incident-overview")} className="mb-10 flex items-center gap-2.5 rounded-lg px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </span>
          <span>
            <span className="block text-lg font-semibold tracking-tight">ContinuityOS</span>
            <span className="block text-[10px] tracking-[0.13em] text-muted-foreground uppercase">Operations agent · Live</span>
          </span>
        </button>
        <p className="mb-3 px-3.5 text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">Incident workspace</p>
        <nav className="flex flex-col gap-1.5">
          {VIEWS.map((v) => (
            <NavItem key={v.id} icon={v.icon} label={v.label} hint={v.hint} active={view === v.label} onClick={() => go(v.label, v.id)} />
          ))}
        </nav>
        <div className="mt-auto border-t pt-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-muted">
              <Utensils className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium">{BUSINESS.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{BUSINESS.outlet} outlet</p>
            </div>
          </div>
          <ConnectionLine state={state} meta={meta} offline={offline} />
        </div>
      </aside>

      <main className="min-h-screen lg:pl-60">
        <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-2 sm:px-8 lg:px-10">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">LIVE-{state.code}</span>
              <ChevronRight className="size-3.5 text-muted-foreground" />
              <span className="font-medium">{view}</span>
            </div>
            <PresenterControls state={state} meta={meta} act={act} />
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
          <header id="incident-overview" className="flex scroll-mt-24 flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {resolved ? (
                  <Badge variant="outline" className={`gap-1.5 ${BADGE.good}`}>
                    <BadgeCheck className="size-3" />
                    Recovery verified
                  </Badge>
                ) : state.goal ? (
                  <Badge variant="destructive" className="gap-1.5">
                    <AlertTriangle className="size-3" />
                    Uncovered closing shift
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1.5">
                    <Clock3 className="size-3" />
                    Waiting for the manager
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {state.mode === "rehearsal" ? "Rehearsal · every phone is simulated" : `Live session · ${telegramSeats} real crew on Telegram`}
                </span>
              </div>
              <h1 className="max-w-3xl text-3xl font-medium tracking-tight text-balance sm:text-4xl">
                {resolved
                  ? "Tonight's close is covered and verified."
                  : state.goal
                    ? `${state.goal.absent}'s absence leaves tonight's close uncovered.`
                    : "The judges are the crew. The manager sends one message."}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                {state.goal
                  ? "The agent applies the rules, negotiates with real people in parallel, re-plans on every reply and asks the manager before anything is final."
                  : "Scan the QR code to join as a crew member. When the manager hands over the problem, the agent messages you directly."}
              </p>
            </div>
            <div className="rounded-2xl border bg-background px-5 py-3 text-right">
              <p className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">{state.finishedAt ? "Resolved in" : "Elapsed"}</p>
              <p className="mt-1 font-mono text-3xl font-medium tracking-tight tabular-nums">{fmtElapsed(elapsed)}</p>
            </div>
          </header>

          <section aria-label="Incident metrics" className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric icon={ShieldCheck} label="Needs approval" value={pending.length ? "Yes" : "No"} hint={pending.length ? pending[0].title : "No unsafe action taken"} accent={pending.length > 0} />
            <Metric
              icon={Users}
              label="Shift coverage"
              value={`${coverage}%`}
              hint={state.plan?.gaps.length ? `Open ${state.plan.gaps.map(fmtWindow).join(", ")}` : state.goal ? "Closing lead 17:00–23:00" : "Not started"}
            />
            <Metric icon={CircleDollarSign} label="Extra spend" value={`S$${state.plan?.extraCost ?? 0}`} hint={`of S$${state.goal?.budget ?? BUSINESS.defaultBudget} allowed`} />
            <Metric icon={FileCheck2} label="Verified actions" value={String(receipts)} hint="With evidence receipts" />
          </section>

          <section className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0 space-y-6">
              {resolved && <ResolvedCard state={state} />}
              {pending.map((g) => (
                <ApprovalCard key={g.id} gate={g} act={act} now={now} />
              ))}
              {state.phase === "lobby" && <JoinCard state={state} meta={meta} source={source} />}
              <GoalCard state={state} act={act} />
              <PlanCard state={state} />
              <NegotiationCard state={state} now={now} selected={selected} onSelect={setSelected} />
              <TimetableCard state={state} />
              <CommsCard state={state} act={act} crew={chatCrew} onSelect={setSelected} />
              {state.phase !== "lobby" && <JoinCard state={state} meta={meta} source={source} />}
            </div>

            <aside className="space-y-6 xl:sticky xl:top-22">
              <AuditCard state={state} />
              <SystemsCard state={state} meta={meta} />
            </aside>
          </section>
        </div>
      </main>
    </div>
  );
}

// ───────────────────────────────── chrome

function ConnectionLine({ state, meta, offline }: { state: LiveState; meta: LiveMeta; offline: boolean }) {
  const [dot, text] = offline
    ? ["bg-red-500", "Server unreachable"]
    : state.mode === "rehearsal"
      ? ["bg-amber-500", "Rehearsal · simulated phones"]
      : meta.bot
        ? ["bg-emerald-500", `Telegram @${meta.bot} connected`]
        : ["bg-amber-500", state.telegram.error ? "Telegram error" : "No bot token · simulated crew"];
  return (
    <div className={`mt-4 flex items-center gap-2 text-xs ${dot === "bg-emerald-500" ? "text-emerald-700" : "text-muted-foreground"}`} title={state.telegram.error}>
      <span className={`size-2 rounded-full ${dot}`} />
      {text}
    </div>
  );
}

function PresenterControls({ state, meta, act }: { state: LiveState; meta: LiveMeta; act: Act }) {
  const [armed, setArmed] = useState(false);
  const fast = state.settings.chaseAfterSec <= 15;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => act({ action: "failure", on: !state.failureInjected })}
        aria-pressed={state.failureInjected}
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${state.failureInjected ? "animate-pulse border-red-300 bg-red-50 text-red-700" : "bg-background text-muted-foreground hover:text-foreground"}`}
      >
        <Zap className="size-3.5" />
        {state.failureInjected ? "Messaging down · restore" : "Break messaging"}
      </button>
      <button
        onClick={() => act({ action: "autoplay", on: !meta.autoplay })}
        aria-pressed={meta.autoplay}
        title="Simulated seats answer from a script"
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${meta.autoplay ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-background text-muted-foreground"}`}
      >
        <Bot className="size-3.5" />
        {meta.autoplay ? "Simulated crew auto-reply" : "Simulated crew wait"}
      </button>
      <button
        onClick={() => act({ action: "settings", settings: fast ? { chaseAfterSec: 40, giveUpAfterSec: 80 } : { chaseAfterSec: 12, giveUpAfterSec: 30 } })}
        aria-pressed={fast}
        className="hidden min-h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-medium text-muted-foreground sm:inline-flex"
      >
        <Clock3 className="size-3.5" />
        Reminder after {state.settings.chaseAfterSec}s
      </button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          if (!armed) return setArmed(true);
          setArmed(false);
          void act({ action: "reset" });
        }}
        onBlur={() => setArmed(false)}
        className={armed ? "border-red-300 text-red-700" : ""}
      >
        <RotateCcw className="size-3.5" />
        {armed ? "Confirm reset" : "Reset demo"}
      </Button>
    </div>
  );
}

// ───────────────────────────────── cards

function GoalCard({ state, act }: { state: LiveState; act: Act }) {
  const [text, setText] = useState("Aisha's sick, sort out tonight's close, keep extras under $150");
  const [busy, setBusy] = useState(false);
  const g = state.goal;
  return (
    <Card id="guardrails" className="scroll-mt-24">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>
              <h2 className="flex items-center gap-2">
                <Sparkles className="size-4" />
                Manager goal
              </h2>
            </CardTitle>
            <CardDescription>One message in the manager&apos;s own words, not a sequence of commands.</CardDescription>
          </div>
          <Badge variant="outline">
            {g ? `Understood · ${Math.round(g.confidence * 100)}% · ${g.via}` : state.manager.handle ? `Manager: ${state.manager.handle}` : "Type here or send via Telegram"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {g ? (
          <div className="rounded-xl border bg-muted/25 p-4 text-sm leading-6">&ldquo;{g.raw}&rdquo;</div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              await act({ action: "goal", text });
              setBusy(false);
            }}
          >
            <label htmlFor="goal-input" className="sr-only">
              Manager&apos;s goal
            </label>
            <textarea
              id="goal-input"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full resize-none rounded-xl border bg-muted/25 p-4 text-sm leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
            <Button type="submit" className="mt-4" disabled={busy || !text.trim()}>
              <Play className="size-4" />
              {busy ? "Reading the request…" : "Delegate recovery to agent"}
            </Button>
          </form>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Constraint label="Budget" value={`≤ S$${g?.budget ?? BUSINESS.defaultBudget} extras`} />
          <Constraint label="Shift" value={`${BUSINESS.outlet} close ${fmtWindow(g?.window ?? { start: BUSINESS.shift.start, end: BUSINESS.shift.end })}`} />
          <Constraint label="Safety" value="Food-safety certified lead" />
          <Constraint label="Fairness" value={`Max 44h · ${BUSINESS.minRestHours}h rest`} />
        </div>
        {g && g.assumptions.length > 0 && (
          <div className="mt-4 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            {g.assumptions.map((a) => (
              <p key={a} className="flex items-start gap-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Assumption: {a}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApprovalCard({ gate, act, now }: { gate: Gate; act: Act; now: number }) {
  return (
    <Card className="ring-1 ring-amber-300">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>
              <h2 className="flex items-center gap-2">
                <ShieldCheck className="size-4" />
                Manager approval
              </h2>
            </CardTitle>
            <CardDescription>The agent pauses before consequential actions. The same request is on the manager&apos;s phone.</CardDescription>
          </div>
          <Badge variant="secondary">Decision required · {fmtElapsed(now - gate.createdAt)}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="recovery-plan recovery-plan-selected">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-sm font-semibold">{gate.kind === "outreach" ? "1" : "2"}</span>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{gate.title}</span>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
              {gate.lines.map((l) => (
                <li key={l} className="flex gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                  {l}
                </li>
              ))}
            </ul>
          </span>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <p className="text-xs text-muted-foreground">
            {gate.kind === "outreach" ? "Approval lets the agent message crew. Nothing is final yet." : "Approval publishes the roster, confirms staff and authorises the spend."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => act({ action: "decide", gateId: gate.id, approve: false })}>
              Reject
            </Button>
            <Button onClick={() => act({ action: "decide", gateId: gate.id, approve: true })}>
              Approve
              <ShieldCheck className="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ResolvedCard({ state }: { state: LiveState }) {
  const ms = (state.finishedAt ?? 0) - (state.startedAt ?? 0);
  const handled = state.crew.reduce((a, c) => a + c.thread.filter((m) => m.tag !== "welcome" && m.from !== "manager").length, 0);
  const ok = state.verified?.filter((v) => v.ok).length ?? 0;
  return (
    <Card className="border-emerald-200 bg-emerald-50/30">
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2 text-emerald-900">
            <BadgeCheck className="size-5" />
            Disruption resolved in {fmtElapsed(ms)}
          </h2>
        </CardTitle>
        <CardDescription>Roster published and every confirmation delivered, within the manager&apos;s limits.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Outcome value={`${state.managerTaps}`} label="taps from the manager" />
          <Outcome value={`${handled}`} label="messages handled by the agent" />
          <Outcome value={`${ok}/${state.verified?.length ?? 0}`} label="confirmations with receipts" />
          <Outcome value={`S$${state.plan?.extraCost ?? 0}`} label="additional cost" />
        </div>
        <div className="mt-5 grid gap-3 rounded-xl border border-emerald-200 bg-background p-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">Before · manual</p>
            <p className="mt-1 text-sm">
              <span className="font-medium line-through decoration-red-400">~{state.baseline.minutes} min</span>, {state.baseline.messages} messages, {state.baseline.apps} apps
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">With ContinuityOS · measured</p>
            <p className="mt-1 text-sm font-medium text-emerald-800">
              {fmtElapsed(ms)}, {state.managerTaps} taps, no rules broken
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Before figures: {state.baseline.source}.</p>
      </CardContent>
    </Card>
  );
}

function JoinCard({ state, meta, source }: { state: LiveState; meta: LiveMeta; source: Source }) {
  const url = meta.joinUrl ?? `https://t.me/YourCrewBot?start=${state.code}`;
  const qr = useMemo(() => qrPath(url), [url]);
  const real = Boolean(meta.joinUrl);
  const order = rank(state.crew, { window: { start: BUSINESS.shift.start, end: BUSINESS.shift.end }, absent: BUSINESS.absent });
  const compact = state.phase !== "lobby";
  return (
    <Card id="join" className="scroll-mt-24">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>
              <h2 className="flex items-center gap-2">
                <QrCode className="size-4" />
                Join the crew
              </h2>
            </CardTitle>
            <CardDescription>Judges scan to receive real shift offers on Telegram. Open seats are played by simulated phones.</CardDescription>
          </div>
          <Badge variant="outline">
            {state.crew.filter((c) => c.seat?.kind === "telegram").length} of {order.length} seats taken
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-6 sm:flex-nowrap">
          <div className={`relative shrink-0 overflow-hidden rounded-2xl border bg-white p-2 ${compact ? "w-28" : "w-44"}`}>
            <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className={`block w-full ${real ? "" : "opacity-30"}`} style={{ shapeRendering: "crispEdges" }} role="img" aria-label="QR code to join the crew">
              <path d={qr.d} fill="#0a0a0a" />
            </svg>
            {!real && (
              <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-primary py-1 text-center text-[10px] font-semibold tracking-[0.14em] text-primary-foreground uppercase">
                {source === "local" ? "Rehearsal" : "Add bot token"}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs break-all text-muted-foreground">{real ? url.replace("https://", "") : "In a live session this QR opens the team's Telegram bot."}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {order.map(({ crewId }) => {
                const c = state.crew.find((x) => x.id === crewId)!;
                const on = c.seat?.kind === "telegram";
                return (
                  <span key={c.id} className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${on ? BADGE.good : "bg-background"}`}>
                    {on ? <Smartphone className="size-3.5" /> : <Bot className="size-3.5 text-muted-foreground" />}
                    <span className="font-medium">{c.name}</span>
                    <span className={on ? "" : "text-muted-foreground"}>{c.seat?.kind === "telegram" ? c.seat.handle : "simulated"}</span>
                  </span>
                );
              })}
            </div>
            {state.manager.handle && <p className="mt-3 text-xs text-muted-foreground">Manager connected: {state.manager.handle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PlanCard({ state }: { state: LiveState }) {
  return (
    <Card id="live-recovery" className="scroll-mt-24">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>
              <h2 className="flex items-center gap-2">
                <Sparkles className="size-4" />
                Live recovery plan
              </h2>
            </CardTitle>
            <CardDescription>The plan changes as new information arrives.</CardDescription>
          </div>
          <span className="text-xs text-muted-foreground">4 tools · 2 approval gates</span>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-0">
          {state.steps.map((s, i) => (
            <PlanStep
              key={s.id}
              number={String(i + 1)}
              title={s.title}
              detail={s.detail}
              status={s.status === "done" ? "done" : s.status === "active" ? (s.id.startsWith("approve") ? "approval" : "active") : "waiting"}
              last={i === state.steps.length - 1}
            />
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

const MW = 720;
const MH = 300;
const MCX = MW / 2;
const MCY = 205;

const STROKE: Record<Tone, string> = {
  good: "stroke-emerald-500",
  tent: "stroke-sky-500",
  wait: "stroke-amber-500",
  bad: "stroke-red-300",
  human: "stroke-violet-500",
  idle: "stroke-slate-200",
  off: "stroke-slate-200",
};
const FILL: Record<Tone, string> = {
  good: "fill-emerald-50",
  tent: "fill-sky-50",
  wait: "fill-amber-50",
  bad: "fill-red-50",
  human: "fill-violet-50",
  idle: "fill-white",
  off: "fill-slate-50",
};

function NegotiationCard({ state, now, selected, onSelect }: { state: LiveState; now: number; selected: string | null; onSelect: (id: string | null) => void }) {
  const goal = state.goal ?? { window: { start: BUSINESS.shift.start, end: BUSINESS.shift.end }, absent: BUSINESS.absent };
  const order = rank(state.crew, goal);
  const eligible = order.map((r) => state.crew.find((c) => c.id === r.crewId)!);
  const excluded = state.crew.filter((c) => !eligible.includes(c));
  const pos = new Map<string, { x: number; y: number }>();
  eligible.forEach((c, i) => {
    const a = Math.PI + (Math.PI * (i + 0.5)) / eligible.length;
    pos.set(c.id, { x: MCX + 290 * Math.cos(a), y: MCY + 140 * Math.sin(a) });
  });
  const detail = state.crew.find((c) => c.id === selected);
  const lastIn = (c: Crew) => [...c.thread].reverse().find((m) => m.dir === "in");
  return (
    <Card id="negotiation" className="scroll-mt-24">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>
              <h2 className="flex items-center gap-2">
                <MessageSquare className="size-4" />
                Availability negotiation
              </h2>
            </CardTitle>
            <CardDescription>Ranked by qualifications, fairness and travel time. Select anyone to see why they were or weren&apos;t asked.</CardDescription>
          </div>
          <Badge variant="outline">
            {eligible.length} eligible · {excluded.length} excluded
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border bg-muted/10">
          <svg viewBox={`0 0 ${MW} ${MH}`} className="block w-full" role="img" aria-label="Who the agent is negotiating with">
            {eligible.map((c) => {
              const p = pos.get(c.id)!;
              const tone = STATUS[c.status].tone;
              const live = ["contacted", "chased", "negotiating"].includes(c.status);
              return (
                <line
                  key={c.id}
                  x1={MCX}
                  y1={MCY}
                  x2={p.x}
                  y2={p.y}
                  strokeWidth={tone === "good" ? 3 : 2}
                  strokeDasharray={tone === "tent" ? "4 4" : undefined}
                  className={`${STROKE[tone]} ${live ? "live-edge" : ""}`}
                />
              );
            })}
            <g transform={`translate(${MCX}, ${MCY})`}>
              <rect x={-112} y={-30} width={224} height={60} rx={14} strokeWidth={2} className={state.plan?.gaps.length === 0 ? "fill-emerald-50 stroke-emerald-500" : "fill-white stroke-red-300"} />
              <text y={-5} textAnchor="middle" className="fill-foreground text-[14px] font-semibold">
                {BUSINESS.outlet} close · {fmtWindow(goal.window)}
              </text>
              <text y={15} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {state.goal ? `${state.plan ? Math.round((state.plan.coveredHours / state.plan.totalHours) * 100) : 0}% covered · ${goal.absent} out` : `${goal.absent} reported sick`}
              </text>
            </g>
            {eligible.map((c) => {
              const p = pos.get(c.id)!;
              const tone = STATUS[c.status].tone;
              const reply = lastIn(c);
              const pulsing = ["contacted", "chased", "negotiating", "human"].includes(c.status);
              return (
                <g
                  key={c.id}
                  transform={`translate(${p.x}, ${p.y})`}
                  className="cursor-pointer outline-none"
                  role="button"
                  tabIndex={0}
                  aria-label={`${c.name}: ${STATUS[c.status].label}`}
                  onClick={() => onSelect(c.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(c.id)}
                >
                  {pulsing && <circle r={30} fill="none" strokeWidth={2} className={`${STROKE[tone]} live-pulse`} />}
                  <circle r={22} strokeWidth={selected === c.id ? 3.5 : 2} className={`${FILL[tone]} ${tone === "idle" ? "stroke-slate-300" : STROKE[tone]}`} />
                  <text y={4} textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
                    {c.name.slice(0, 2).toUpperCase()}
                  </text>
                  {c.seat?.kind === "telegram" && <circle cx={17} cy={-17} r={5} className="fill-emerald-500" />}
                  <text y={-44} textAnchor="middle" className="fill-foreground text-[12px] font-medium">
                    {c.name}
                  </text>
                  <text y={-31} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                    {c.offer && (c.status === "accepted" || c.status === "confirmed") ? fmtWindow(c.offer.window) : STATUS[c.status].label}
                  </text>
                  {reply && now - reply.at < 25_000 && (
                    <foreignObject x={-76} y={30} width={152} height={52} style={{ overflow: "visible", pointerEvents: "none" }}>
                      <div className="rounded-lg border bg-background px-2 py-1 text-center text-[10px] leading-snug shadow-sm">
                        “{reply.text.length > 58 ? `${reply.text.slice(0, 56)}…` : reply.text}”
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="mt-4 space-y-3">
          {eligible.map((c, i) => (
            <Candidate key={c.id} rank={String(i + 1)} c={c} reasons={order[i].reasons} selected={selected === c.id} onSelect={() => onSelect(c.id)} />
          ))}
        </div>

        <p className="mt-5 mb-2 text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">Excluded by rules</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {excluded.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left hover:bg-muted/40 ${selected === c.id ? "border-foreground/30 bg-muted/40" : ""}`}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-[10px] font-semibold text-muted-foreground">{c.name.slice(0, 2).toUpperCase()}</span>
              <span className="min-w-0">
                <span className="block text-xs font-medium">
                  {c.name} <span className="font-normal text-muted-foreground">· {c.role}</span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-red-700">{whyNot(c, goal)}</span>
              </span>
            </button>
          ))}
        </div>

        {detail && <WhyPanel c={detail} state={state} onClose={() => onSelect(null)} />}
      </CardContent>
    </Card>
  );
}

function WhyPanel({ c, state, onClose }: { c: Crew; state: LiveState; onClose: () => void }) {
  const goal = state.goal ?? { window: { start: BUSINESS.shift.start, end: BUSINESS.shift.end }, absent: BUSINESS.absent };
  const reason = whyNot(c, goal);
  const order = rank(state.crew, goal);
  const r = order.findIndex((x) => x.crewId === c.id);
  return (
    <div className="mt-4 rounded-xl border bg-muted/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">{reason ? `Why not ${c.name}?` : `Why ${c.name}?`}</p>
          <p className="mt-1 text-sm font-medium">
            {c.name} · {c.role} · {c.outlet}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
      {reason ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{reason}</p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Ranked <span className="font-medium text-foreground">#{r + 1}</span> of {order.length}: {order[r]?.reasons.join(" · ")}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Constraint label="This week" value={`${c.hoursThisWeek}/${c.maxHours}h`} />
        <Constraint label="Travel" value={`${c.travelMin} min`} />
        <Constraint label="Rate" value={`S$${c.rate}/h`} />
        <Constraint label="Contact" value={c.seat?.kind === "telegram" ? `Telegram ${c.seat.handle}` : "Simulated phone"} />
      </div>
    </div>
  );
}

function TimetableCard({ state }: { state: LiveState }) {
  const g = state.goal?.window ?? { start: BUSINESS.shift.start, end: BUSINESS.shift.end };
  const final = state.phase === "executing" || state.phase === "done";
  const rows: number[] = [];
  for (let h = g.start; h < g.end; h++) rows.push(h);
  const name = (id: string) => state.crew.find((c) => c.id === id)?.name ?? id;
  return (
    <Card id="staffing-timetable" className="scroll-mt-24">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>
              <h2 className="flex items-center gap-2">
                <Table2 className="size-4" />
                Hourly staffing timetable
              </h2>
            </CardTitle>
            <CardDescription>Accepted replies fill the closing-lead cells automatically. Nothing is final until approved.</CardDescription>
          </div>
          <Badge variant="outline" className={final ? BADGE.good : ""}>
            {final ? (
              <>
                <Bot className="size-3" />
                Roster published
              </>
            ) : (
              "Tentative"
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border">
          <table className="staffing-grid w-full min-w-[40rem] text-left text-xs">
            <thead className="border-b bg-muted/55 text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              <tr>
                <th className="w-24 px-3 py-3 font-medium">Hour</th>
                <th className="px-3 py-3 font-medium">Rostered closing lead</th>
                <th className="px-3 py-3 font-medium">Recovery assignment</th>
                <th className="w-32 px-3 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((h) => {
                const segs = (state.plan?.segments ?? []).filter((s) => s.window.start < h + 1 && s.window.end > h);
                const gap = (state.plan?.gaps ?? [g]).some((w) => w.start < h + 1 && w.end > h);
                return (
                  <tr key={h} className="align-top hover:bg-muted/20">
                    <td className="px-3 py-3 font-mono">{fmtHour(h)}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-700 line-through">{state.goal?.absent ?? BUSINESS.absent}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex min-h-7 flex-wrap items-center gap-1.5">
                        {segs.map((s) => (
                          <span key={s.crewId} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 ${final ? BADGE.good : BADGE.tent}`}>
                            <Bot className="size-3" />
                            {name(s.crewId)}
                            {s.window.start > h || s.window.end < h + 1 ? <span className="opacity-70">({fmtWindow({ start: Math.max(h, s.window.start), end: Math.min(h + 1, s.window.end) })})</span> : null}
                            {s.extras.length > 0 && <span className="opacity-70">· ride</span>}
                          </span>
                        ))}
                        {segs.length === 0 && <span className="text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={gap ? BADGE.wait : final ? BADGE.good : BADGE.tent}>
                        {gap ? "1 lead needed" : final ? "Covered" : "Pencilled in"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-right text-[11px] leading-5 text-muted-foreground">
          <Bot className="mx-0.5 inline size-3" /> cells come from verified worker replies. Extra spend S${state.plan?.extraCost ?? 0} of S${state.goal?.budget ?? BUSINESS.defaultBudget}.
        </p>
      </CardContent>
    </Card>
  );
}

const QUICK = ["yes I can do the whole shift", "only after 7, and I'd need a grab", "who called in sick?", "can I talk to the manager?", "sorry can't tonight"];

function CommsCard({ state, act, crew, onSelect }: { state: LiveState; act: Act; crew?: Crew; onSelect: (id: string | null) => void }) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const msgs = crew?.thread.filter((m) => m.tag !== "welcome") ?? [];
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [msgs.length, crew?.id]);
  const directory = [...state.crew].sort((a, b) => Number(b.thread.length > 0) - Number(a.thread.length > 0));
  const sim = crew && crew.seat?.kind !== "telegram";
  const human = crew?.status === "human";
  const open = crew && !["confirmed", "released", "declined", "no_response", "unreachable", "ineligible", "bench"].includes(crew.status);
  const send = async (text: string) => {
    if (!crew || !text.trim()) return;
    setErr(null);
    const r = human ? await act({ action: "say", crewId: crew.id, text }) : await act({ action: "sim_reply", crewId: crew.id, text });
    if (!r.ok) setErr(r.error ?? "Could not send");
    setDraft("");
  };
  return (
    <Card id="worker-communications" className="scroll-mt-24">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>
              <h2 className="flex items-center gap-2">
                <MessagesSquare className="size-4" />
                Worker communications
              </h2>
            </CardTitle>
            <CardDescription>Real Telegram chats for crew who joined; simulated phones for open seats. The agent hands over when asked.</CardDescription>
          </div>
          <Badge variant="outline">
            {state.crew.length} workers · {state.crew.filter((c) => c.seat?.kind === "telegram").length} on Telegram
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid overflow-hidden rounded-xl border lg:grid-cols-[17rem_minmax(0,1fr)]">
          <div className="border-b bg-muted/20 lg:border-r lg:border-b-0">
            <div className="border-b px-4 py-3">
              <p className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">Restaurant workforce</p>
              <p className="mt-1 text-xs text-muted-foreground">Choose a person to open their conversation.</p>
            </div>
            <div className="max-h-[32rem] overflow-y-auto p-2">
              {directory.map((w) => {
                const active = crew?.id === w.id;
                const tone = STATUS[w.status].tone;
                return (
                  <button
                    key={w.id}
                    onClick={() => onSelect(w.id)}
                    className={`mb-1 flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  >
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${active ? "bg-primary-foreground/15" : "border bg-background"}`}>{w.name.slice(0, 2).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium">{w.name}</span>
                        <span className={`size-2 shrink-0 rounded-full ${DOT[tone]}`} />
                      </span>
                      <span className={`mt-0.5 block truncate text-[10px] ${active ? "text-primary-foreground/65" : "text-muted-foreground"}`}>
                        {w.role} · {w.outlet}
                      </span>
                      <span className={`mt-1 block text-[9px] ${active ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                        {STATUS[w.status].label} · {w.seat?.kind === "telegram" ? `Telegram ${w.seat.handle}` : "Simulated phone"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0 bg-background">
            {crew ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-muted text-xs font-semibold">{crew.name.slice(0, 2).toUpperCase()}</span>
                    <div>
                      <p className="text-sm font-medium">{crew.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {crew.role} · {crew.outlet} outlet
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] ${crew.seat?.kind === "telegram" ? "border-foreground bg-foreground text-background" : "bg-background"}`}
                    >
                      {crew.seat?.kind === "telegram" ? <Send className="size-3" /> : <Smartphone className="size-3" />}
                      {crew.seat?.kind === "telegram" ? `Telegram ${crew.seat.handle}` : "Simulated phone"}
                    </span>
                    <Badge variant="outline" className={BADGE[STATUS[crew.status].tone]}>
                      {STATUS[crew.status].label}
                    </Badge>
                  </div>
                </div>

                {human && (
                  <div className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div>
                      <p className="text-xs font-medium text-amber-900">Human conversation requested</p>
                      <p className="mt-0.5 text-[10px] text-amber-800">AI automation is paused for {crew.name}. The manager can continue below.</p>
                    </div>
                    <Button onClick={() => act({ action: "takeover", crewId: crew.id, on: false })} size="sm" variant="outline" className="bg-background">
                      <Bot className="size-3.5" />
                      Resume AI
                    </Button>
                  </div>
                )}

                <div ref={box} role="log" aria-label={`Conversation with ${crew.name}`} className="flex max-h-[24rem] min-h-64 flex-col gap-3 overflow-y-auto bg-muted/10 p-4 sm:p-5">
                  {msgs.length === 0 ? (
                    <div className="m-auto max-w-sm text-center">
                      <MessageSquare className="mx-auto size-6 text-muted-foreground" />
                      <p className="mt-3 text-sm font-medium">No conversation yet</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {crew.status === "ineligible" ? "Excluded by a rule, so the agent will not message this person." : "The agent messages people in rank order once the manager approves."}
                      </p>
                    </div>
                  ) : (
                    msgs.map((m) => <Bubble key={m.id} m={m} crew={crew} act={act} />)
                  )}
                </div>

                {open && sim && !human && (
                  <div className="border-t bg-muted/20 px-4 py-3 sm:px-5">
                    <p className="mb-2 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">Reply as {crew.name} (simulated phone)</p>
                    <div className="flex flex-wrap gap-2">
                      {QUICK.map((q) => (
                        <Button key={q} onClick={() => void send(q)} size="sm" variant="outline" className="bg-background">
                          {q}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {open && (sim || human) && (
                  <div className="border-t p-4 sm:p-5">
                    <div className="flex gap-2">
                      <label htmlFor="worker-message" className="sr-only">
                        Message
                      </label>
                      <input
                        id="worker-message"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void send(draft);
                        }}
                        placeholder={human ? `Reply to ${crew.name} as the manager…` : `Type a free-text reply as ${crew.name}…`}
                        className="min-h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                      />
                      <Button onClick={() => void send(draft)} disabled={!draft.trim()}>
                        <Send className="size-4" />
                        {human ? "Send as manager" : "Send reply"}
                      </Button>
                    </div>
                    {err && <p className="mt-2 text-[11px] text-red-700">{err}</p>}
                  </div>
                )}
                {crew.seat?.kind === "telegram" && !human && (
                  <p className="border-t px-4 py-3 text-[10px] text-muted-foreground sm:px-5">This is a real person. They reply from their own phone and replies appear here live.</p>
                )}
              </>
            ) : (
              <div className="flex min-h-64 items-center justify-center p-6 text-center text-xs text-muted-foreground">Conversations appear here the moment the agent starts messaging.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Bubble({ m, crew, act }: { m: Msg; crew: Crew; act: Act }) {
  const incoming = m.dir === "in";
  const lastOut = [...crew.thread].reverse().find((x) => x.dir === "out");
  const canTap = !incoming && m.buttons && m.id === lastOut?.id && crew.seat?.kind !== "telegram" && !["confirmed", "released", "declined", "human"].includes(crew.status);
  const tick: Record<string, string> = { queued: "sending…", sent: "delivered", retrying: `retrying (${m.attempts})`, abandoned: "failed", failed: "failed" };
  return (
    <div
      className={`max-w-[82%] rounded-xl border px-3 py-2.5 ${incoming ? "self-start bg-background" : m.from === "manager" ? "self-end border-violet-300 bg-violet-50 text-violet-950" : "self-end border-slate-800 bg-slate-900 text-white"}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-[9px] opacity-65">
        <span>{incoming ? crew.name : m.from === "manager" ? "Manager" : "AI agent"}</span>
        <span>·</span>
        <span>{crew.seat?.kind === "telegram" ? "Telegram" : "Simulated"}</span>
        <span>·</span>
        <span>{clock(m.at)}</span>
        {!incoming && (
          <>
            <span>·</span>
            <span className={m.status === "retrying" || m.status === "abandoned" ? "font-semibold text-amber-300" : ""} title={m.evidence ?? m.error}>
              {tick[m.status ?? "queued"]}
            </span>
          </>
        )}
      </div>
      <p className="mt-1 text-xs leading-5 whitespace-pre-wrap">{m.text.replace(/\*/g, "")}</p>
      {!incoming && m.buttons && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {m.buttons.map((b) => (
            <button
              key={b.data}
              disabled={!canTap}
              onClick={() => act({ action: "sim_button", crewId: crew.id, button: b.data.split(":")[2] })}
              className="rounded-md border border-white/20 px-2 py-1 text-[10px] enabled:hover:bg-white/10 disabled:opacity-50"
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
      {m.parsed && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground" title="How the agent understood this reply">
          <Bot className="size-2.5" />
          {m.parsed.intent.replace("_", " ")}
          {m.parsed.window ? ` ${fmtWindow(m.parsed.window)}` : ""}
          {m.parsed.transport ? " +ride" : ""}
          {m.parsed.premium ? " +premium" : ""} · {Math.round(m.parsed.confidence * 100)}% · {m.parsed.via}
        </p>
      )}
    </div>
  );
}

function AuditCard({ state }: { state: LiveState }) {
  const canDownload = !(globalThis as { __lvNoDownload?: boolean }).__lvNoDownload;
  const download = () => {
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), session: state.code, goal: state.goal, roster: state.publishedRoster, verified: state.verified, audit: state.audit }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `continuityos-live-${state.code}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Card id="audit-trail" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <Activity className="size-4" />
            Live activity
          </h2>
        </CardTitle>
        <CardDescription>What happened, where and with what proof.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[36rem] space-y-0 overflow-y-auto pr-1">
          {state.audit.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Every observation, decision, approval and receipt will be logged here.</p>}
          {[...state.audit].reverse().map((e) => (
            <AuditRow key={e.id} entry={e} />
          ))}
        </div>
        {canDownload && (
          <div className="mt-4 border-t pt-4">
            <Button onClick={download} variant="outline" className="w-full" disabled={state.audit.length === 0}>
              <Download className="size-4" />
              Export audit JSON
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SystemsCard({ state, meta }: { state: LiveState; meta: LiveMeta }) {
  const tg = state.mode === "server" && Boolean(meta.bot);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <Building2 className="size-4" />
            Tools the agent uses
          </h2>
        </CardTitle>
        <CardDescription>{state.mode === "rehearsal" ? "Rehearsal: messaging is simulated on this screen." : "Live connections for this session."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <System icon={Send} name="Telegram Bot API" status={tg ? `@${meta.bot} · real messages + receipts` : "Not connected · simulated phones"} ok={tg} />
        <System icon={Bot} name="Reply understanding" status={meta.llm ? "LLM with rule-based fallback" : "Rule-based parser · confidence scored"} ok />
        <System icon={Users} name="Roster rules + ranking" status="Certificates, hour caps, rest, fairness" ok />
        <System icon={Table2} name="Shift planner" status="Split shifts within budget" ok />
        <System icon={ShieldCheck} name="Approval gates" status="Before messaging · before confirming or spending" ok />
        <System icon={MapPin} name="Privacy rule" status="Never reveals who is absent or why" ok />
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────── building blocks (same as the ContinuityOS demo)

function NavItem({ icon: Icon, label, hint, active, onClick }: { icon: typeof House; label: string; hint: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
    >
      <Icon className="mt-0.5 size-[18px] shrink-0" />
      <span>
        <span className="block text-sm leading-5 font-medium">{label}</span>
        <span className={`block text-[10px] leading-4 ${active ? "text-primary-foreground/65" : "text-muted-foreground"}`}>{hint}</span>
      </span>
    </button>
  );
}

function Metric({ icon: Icon, label, value, hint, accent = false }: { icon: typeof Users; label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-background p-4 sm:p-5 ${accent ? "border-amber-300 bg-amber-50/30" : ""}`}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-4" />
      </div>
      <p className="mt-3 text-2xl font-medium tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Constraint({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2.5">
      <p className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-xs font-medium">{value}</p>
    </div>
  );
}

function PlanStep({ number, title, detail, status, last = false }: { number: string; title: string; detail: string; status: "done" | "active" | "approval" | "waiting"; last?: boolean }) {
  const style =
    status === "done" ? "bg-emerald-100 text-emerald-700" : status === "active" ? "bg-primary text-primary-foreground" : status === "approval" ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground";
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${style}`}>{status === "done" ? <Check className="size-3.5" /> : number}</span>
        {!last && <span className="h-9 w-px bg-border" />}
      </div>
      <div className="pb-4">
        <p className="text-sm font-medium">
          {title}
          {status === "approval" && <span className="ml-2 text-xs font-normal text-amber-700">Your approval</span>}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

function Candidate({ rank: n, c, reasons, selected, onSelect }: { rank: string; c: Crew; reasons: string[]; selected: boolean; onSelect: () => void }) {
  const s = STATUS[c.status];
  return (
    <button onClick={onSelect} className={`flex w-full flex-wrap items-center gap-3 rounded-xl border p-4 text-left hover:bg-muted/30 ${selected ? "border-foreground/30 bg-muted/30" : ""}`}>
      <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-xs font-medium">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {c.name}
          {c.seat?.kind === "telegram" && (
            <Badge variant="outline" className={BADGE.good}>
              <Smartphone className="size-3" />
              {c.seat.handle}
            </Badge>
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {c.outlet} · {c.role} · {reasons[0]} · {c.travelMin} min
          {c.offer ? ` · offered ${fmtWindow(c.offer.window)}${c.offer.conditions.length ? " + ride" : ""}` : ""}
        </p>
      </div>
      <Badge variant="outline" className={`ml-auto ${BADGE[s.tone]}`}>
        {s.tone === "good" && <Check className="size-3" />}
        {s.tone === "bad" && <X className="size-3" />}
        {s.label}
      </Badge>
    </button>
  );
}

function Outcome({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-background p-4">
      <p className="text-xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const dot = entry.status === "fail" ? "bg-red-500" : entry.status === "warn" ? "bg-amber-500" : entry.status === "wait" ? "bg-violet-500" : "bg-emerald-500";
  return (
    <div className="relative border-l pb-5 pl-4 last:pb-0">
      <span className={`absolute top-1 -left-1 size-2 rounded-full ${dot}`} />
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span className="font-mono">{clock(entry.at)}</span>
        <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
          {entry.tool}
        </Badge>
        <span>{entry.actor}</span>
      </div>
      <p className="mt-1.5 text-xs leading-5 font-medium">{entry.action}</p>
      {entry.evidence && <p className="mt-1 text-[11px] leading-4 break-words text-muted-foreground">{entry.evidence}</p>}
    </div>
  );
}

function System({ icon: Icon, name, status, ok }: { icon: typeof Users; name: string; status: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border p-3">
      <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{name}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{status}</p>
      </div>
      <span className={`size-2 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
    </div>
  );
}
