"use client";

import { useMemo, useState } from "react";
import { businessById } from "../businesses.ts";
import { fmtWindow } from "../scenario.ts";
import type { LiveState } from "../types.ts";
import type { LiveAction } from "../actions.ts";
import { CalendarPlus, Check, Waves } from "./icons.tsx";
import { useLive } from "./use-live.ts";

type Act = (a: LiveAction) => Promise<{ ok: boolean; error?: string }>;

/** Today plus the next 7 days, in the browser's local time. */
function nextDays() {
  const out: { iso: string; wd: string; day: number; mon: string; long: string }[] = [];
  const base = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 12);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ iso, wd: d.toLocaleDateString("en-SG", { weekday: "short" }), day: d.getDate(), mon: d.toLocaleDateString("en-SG", { month: "short" }), long: d.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" }) });
  }
  return out;
}

/** The leave form staff open from the leave link. No reason is asked for, so none can leak. */
export function LeaveForm({ state, act }: { state: LiveState; act: Act }) {
  const crew = useMemo(() => [...state.crew].filter((c) => !c.onLeave).sort((a, b) => a.name.localeCompare(b.name)), [state.crew]);
  const [who, setWho] = useState("");
  const days = useMemo(nextDays, []);
  const [pick, setPick] = useState(1);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const c = crew.find((x) => x.id === who);
  const d = days[pick];
  const already = c && pick > 1 ? state.notices.some((n) => n.crewId === c.id && n.date === d.iso) : false;
  const mine = !c
    ? undefined
    : pick === 0
      ? state.slots.find((sl) => sl.assignments.some((a) => a.crewId === c.id))
      : pick === 1
        ? state.tomorrow.find((sl) => sl.assignments.some((a) => a.crewId === c.id))
        : already
          ? undefined
          : state.tomorrow.find((sl) => state.usual?.[sl.id] === c.id);
  const when = pick === 0 ? "today" : pick === 1 ? "tomorrow" : `on ${d.long}`;

  if (done)
    return (
      <div className="lv-pop space-y-3 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full border-[1.5px] border-foreground bg-[#1f5f5b] text-white shadow-[2px_2px_0_0_#111]">
          <Check className="size-6" />
        </span>
        <p className="font-display text-xl font-bold">Thanks, {done}.</p>
        <p className="text-sm text-muted-foreground">The agent is finding cover now and will update the timetable. You don&apos;t need to do anything else.</p>
        <button onClick={() => {
            setDone(null);
            setWho("");
          }} className="text-xs font-semibold underline underline-offset-2">
          Report another
        </button>
      </div>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!c || !mine) return;
        const r = await act({ action: "leave", crewId: c.id, day: pick === 0 ? "today" : pick === 1 ? "tomorrow" : "later", date: pick > 1 ? d.iso : undefined });
        if (r.ok) setDone(c.name);
        else setErr(r.error ?? "Couldn't send. Try again.");
      }}
    >
      <div>
        <label htmlFor="leave-who" className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Who are you?
        </label>
        <select id="leave-who" value={who} onChange={(e) => setWho(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border-[1.5px] border-foreground bg-background px-3 text-sm">
          <option value="">Choose your name</option>
          {crew.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} · {x.role}
            </option>
          ))}
        </select>
      </div>
      <fieldset>
        <legend className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Which day can&apos;t you make?</legend>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-8">
          {days.map((x, i) => (
            <button
              key={x.iso}
              type="button"
              aria-pressed={pick === i}
              aria-label={x.long}
              onClick={() => setPick(i)}
              className={`flex flex-col items-center rounded-xl border-[1.5px] border-foreground py-1.5 shadow-[2px_2px_0_0_#111] transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${pick === i ? "bg-foreground text-background" : "bg-background hover:bg-[#f4efe6]"}`}
            >
              <span className={`text-[9px] font-semibold tracking-wider uppercase ${pick === i ? "opacity-70" : "text-muted-foreground"}`}>{i === 0 ? "Today" : i === 1 ? "Tmr" : x.wd}</span>
              <span className="font-display text-lg leading-tight font-bold">{x.day}</span>
              <span className={`text-[9px] ${pick === i ? "opacity-70" : "text-muted-foreground"}`}>{x.mon}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {c && (
        <p className={`rounded-xl border-[1.5px] p-3 text-xs ${mine ? "border-foreground bg-[#f4efe6]" : "border-dashed border-foreground/40 text-muted-foreground"}`}>
          {mine ? (
            <>
              Your shift {when}: <b>{mine.role}</b> {fmtWindow(mine.window)}
            </>
          ) : (
            already ? `You've already reported ${d.long}. The agent is on it.` : `You're not on the timetable ${when}, so there's nothing to change.`
          )}
        </p>
      )}
      <button type="submit" disabled={!c || !mine} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-foreground bg-[#1f5f5b] text-sm font-bold text-white shadow-[3px_3px_0_0_#111] transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-40 disabled:shadow-none">
        <CalendarPlus className="size-4" />
        I can&apos;t make it
      </button>
      {err && <p className="text-xs text-foreground">{err}</p>}
      <p className="text-center text-[11px] text-muted-foreground">No reason needed. Reasons are never shared with other staff.</p>
    </form>
  );
}

/** Standalone page at /live/leave for staff on their phones (server mode). */
export function LeaveApp() {
  const { state, act } = useLive("server");
  const biz = businessById(state?.businessId);
  return (
    <div className="dashboard beach beach-ground flex min-h-screen items-start justify-center px-4 py-10 text-foreground">
      <div className="lv-rise w-full max-w-md rounded-2xl border-[1.5px] border-foreground bg-background p-6 shadow-[4px_4px_0_0_#111]">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-foreground text-background">
            <Waves className="size-5" />
          </span>
          <div>
            <p className="font-display text-lg leading-tight font-bold">Can&apos;t make a shift?</p>
            <p className="text-xs text-muted-foreground">
              {biz.name} · {biz.outlet}
            </p>
          </div>
        </div>
        {state ? <LeaveForm state={state} act={act} /> : <p className="text-sm text-muted-foreground">Loading…</p>}
      </div>
    </div>
  );
}
