"use client";

/**
 * Small, dependency-free versions of the effects the Live UI uses:
 * number ticker (Magic UI), toasts (Sonner), command bar (cmdk), bottom drawer (Vaul),
 * donut and bar charts (Tremor), animated outreach beams (Magic UI) and a live activity feed.
 * Built by hand so the page stays a single light bundle with no extra packages.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LiveState } from "../types.ts";
import { fmtWindow } from "../scenario.ts";
import { clock } from "./use-live.ts";
import { AlertTriangle, ArrowRight, Check, Checks, Command, Search, X } from "./icons.tsx";

export const TEAL = "#1f5f5b";

// ───────────────────────────────── media query

export function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

// ───────────────────────────────── number ticker

export function Ticker({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || a === value) {
      from.current = value;
      setShown(value);
      return;
    }
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value]);
  return <span className="tabular-nums">{format(shown)}</span>;
}

// ───────────────────────────────── toasts (Sonner-style)

type Toast = { id: number; title: string; body?: string; kind: "ai" | "warn" | "info" };

export function Toaster({ state }: { state: LiveState }) {
  const [list, setList] = useState<Toast[]>([]);
  const [hover, setHover] = useState(false);
  const prev = useRef<LiveState | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    if (!p) return;
    if (p.businessId !== state.businessId) {
      setList([]);
      return;
    }
    const add: Omit<Toast, "id">[] = [];
    const name = (id: string) => state.crew.find((c) => c.id === id)?.name ?? id;
    for (const n of state.notices ?? []) {
      const was = (p.notices ?? []).find((x) => x.id === n.id);
      if (!was) add.push({ kind: "info", title: `Early notice from ${name(n.crewId)}`, body: `Can't make ${n.day === "later" ? n.label : n.day}'s shift · the agent is finding cover now` });
      else if (was.status !== n.status && n.status === "covered") add.push({ kind: "ai", title: `${n.day === "later" ? n.label : "Tomorrow"} sorted early`, body: `${name(n.coverId!)} covers for ${name(n.crewId)} · nothing needed from you` });
      else if (was.status !== n.status && n.status === "no_cover") add.push({ kind: "warn", title: `Nobody free for ${n.day === "later" ? n.label : "tomorrow"}`, body: `The manager was told about ${name(n.crewId)}'s shift` });
    }
    if (p.phase !== state.phase && state.goal && (state.phase === "negotiating" || state.phase === "awaiting_outreach") && (p.phase === "lobby" || p.phase === "done" || p.phase === "checking"))
      add.push({ kind: "ai", title: "Gap spotted", body: `The agent is finding cover for ${state.goal.role.toLowerCase()} ${fmtWindow(state.goal.window)}` });
    for (const c of state.crew) {
      const was = p.crew.find((x) => x.id === c.id)?.status;
      if (was === c.status) continue;
      if (c.status === "confirmed") {
        const a = state.slots.flatMap((s) => s.assignments).find((x) => x.crewId === c.id && x.source === "ai");
        add.push({ kind: "ai", title: `${c.name} confirmed`, body: a ? `Covering ${fmtWindow(a.window)} · timetable updated` : "Timetable updated" });
      }
      if (c.status === "human") add.push({ kind: "warn", title: `${c.name} wants a person`, body: "The agent paused that chat and kept going with everyone else" });
      if (c.status === "checking") add.push({ kind: "info", title: `${c.name} hasn't checked in`, body: "The agent sent one check-in message" });
    }
    const newGate = state.gates.find((g) => g.status === "pending" && !p.gates.some((x) => x.id === g.id));
    if (newGate) add.push({ kind: "warn", title: "One decision needed", body: newGate.title });
    if (state.history.length > p.history.length) {
      const h = state.history[state.history.length - 1];
      add.push({ kind: "ai", title: "Covered. Nothing needed from you.", body: `${h.role} ${fmtWindow(h.window)} · ${h.taps} manager taps` });
    }
    if (state.failureInjected !== p.failureInjected) add.push({ kind: state.failureInjected ? "warn" : "info", title: state.failureInjected ? "Messaging is down" : "Messaging restored", body: state.failureInjected ? "The agent will retry, then move to the next person" : undefined });
    if (!add.length) return;
    const fresh = add.map((t) => ({ ...t, id: ++seq.current }));
    setList((l) => [...l, ...fresh].slice(-5));
    for (const t of fresh) setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 4600);
  }, [state]);

  const shown = list.slice(-3);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 w-[min(22rem,calc(100vw-2rem))]" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <ol className="relative flex flex-col-reverse gap-2">
        {[...shown].reverse().map((t, i) => (
          <li
            key={t.id}
            className={`lv-toast pointer-events-auto flex items-start gap-3 bg-background p-3 soft-card transition-all duration-300 ${hover || i === 0 ? "" : "[&>*]:opacity-0"}`}
            style={hover || i === 0 ? undefined : { marginTop: "-3.4rem", transform: `scale(${1 - i * 0.05})`, opacity: 1 - i * 0.25 }}
          >
            <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${t.kind === "ai" ? "bg-[#1f5f5b] text-white" : t.kind === "warn" ? "border-[1.5px] border-foreground bg-[#ece6da]" : "bg-foreground text-background"}`}>
              {t.kind === "ai" ? <Checks className="size-3.5" /> : t.kind === "warn" ? <AlertTriangle className="size-3.5" /> : <Check className="size-3.5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t.title}</span>
              {t.body && <span className="block text-xs leading-5 text-muted-foreground">{t.body}</span>}
            </span>
            <button onClick={() => setList((l) => l.filter((x) => x.id !== t.id))} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ───────────────────────────────── command bar (cmdk-style)

export type Cmd = { id: string; group: string; label: string; hint?: string; run: () => void };

export function CommandBar({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Cmd[] }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? commands.filter((c) => `${c.group} ${c.label} ${c.hint ?? ""}`.toLowerCase().includes(t)) : commands;
  }, [q, commands]);
  useEffect(() => {
    if (open) {
      setQ("");
      setI(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);
  useEffect(() => setI(0), [q]);
  useEffect(() => {
    document.getElementById(`cmd-${i}`)?.scrollIntoView({ block: "nearest" });
  }, [i]);
  if (!open) return null;
  const pick = (c?: Cmd) => {
    if (!c) return;
    onClose();
    c.run();
  };
  let lastGroup = "";
  return createPortal(
    <div className="beach fixed inset-0 z-50 flex items-start justify-center text-foreground bg-[#111]/40 p-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Command bar" className="lv-pop w-full max-w-xl overflow-hidden bg-background soft-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-foreground/10 px-4">
          <Search className="size-4 text-muted-foreground" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setI((x) => Math.min(list.length - 1, x + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setI((x) => Math.max(0, x - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(list[i]);
              } else if (e.key === "Escape") onClose();
            }}
            placeholder="Mark someone sick, clear a shift, open a chat…"
            aria-label="Search actions"
            className="min-h-13 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="rounded-md border border-foreground/30 px-1.5 font-mono text-[10px] text-muted-foreground">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {list.length === 0 && <li className="p-6 text-center text-xs text-muted-foreground">Nothing matches &ldquo;{q}&rdquo;</li>}
          {list.map((c, n) => {
            const head = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <li key={c.id}>
                {head && <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{head}</p>}
                <button id={`cmd-${n}`} role="option" aria-selected={n === i} onMouseMove={() => setI(n)} onClick={() => pick(c)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${n === i ? "bg-foreground text-background" : ""}`}>
                  <span>{c.label}</span>
                  <span className={`flex items-center gap-1 text-[11px] ${n === i ? "opacity-70" : "text-muted-foreground"}`}>
                    {c.hint}
                    <ArrowRight className="size-3" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 border-t-[1.5px] border-foreground/15 px-4 py-2 text-[10px] text-muted-foreground">
          <Command className="size-3" /> ↑↓ to move · Enter to run · works anywhere with Ctrl K
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ───────────────────────────────── bottom drawer (Vaul-style)

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    setDy(0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", esc);
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="beach fixed inset-0 z-40 text-foreground">
      <div className="absolute inset-0 bg-[#111]/40" style={{ opacity: Math.max(0.2, 1 - dy / 400) }} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="lv-sheet absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col overflow-hidden rounded-t-3xl border-[1.5px] border-b-0 border-foreground bg-background" style={{ transform: `translateY(${dy}px)`, transition: start.current === null ? "transform .25s cubic-bezier(.2,.8,.2,1)" : "none" }}>
        <div
          className="flex cursor-grab touch-none justify-center py-3"
          onPointerDown={(e) => {
            start.current = e.clientY;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => start.current !== null && setDy(Math.max(0, e.clientY - start.current))}
          onPointerUp={() => {
            const close = dy > 110;
            start.current = null;
            if (close) onClose();
            else setDy(0);
          }}
        >
          <span className="h-1.5 w-12 rounded-full bg-foreground/30" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ───────────────────────────────── charts (Tremor-style)

export function Donut({ parts, size = 132, stroke = 16, children }: { parts: { value: number; color: string; dashed?: boolean }[]; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  let off = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ece6da" strokeWidth={stroke} />
        {parts.map((p, i) => {
          const len = (p.value / total) * C;
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke} strokeDasharray={`${Math.max(0, len - (p.value ? 1.5 : 0))} ${C}`} strokeDashoffset={-off} style={{ transition: "stroke-dasharray .7s cubic-bezier(.2,.8,.2,1), stroke-dashoffset .7s" }} />;
          off += len;
          return el;
        })}
        <circle cx={size / 2} cy={size / 2} r={r + stroke / 2} fill="none" stroke="#111" strokeWidth={1.5} />
        <circle cx={size / 2} cy={size / 2} r={r - stroke / 2} fill="none" stroke="#111" strokeWidth={1.5} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

// ───────────────────────────────── outreach beams (Magic UI-style animated beam)

type Node = { id: string; name: string; label: string; kind: "asking" | "yes" | "no" | "person" };

export function OutreachBeams({ nodes }: { nodes: Node[] }) {
  if (!nodes.length) return null;
  const rowH = 40;
  const H = Math.max(nodes.length * rowH + 16, 96);
  const W = 560;
  const ax = 64;
  const ay = H / 2;
  const sx = 330;
  return (
    <div className="overflow-hidden rounded-xl border-[1.5px] border-foreground bg-[#f4efe6]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Agent is talking to ${nodes.length} staff`}>
        <defs>
          <linearGradient id="beam" x1="0" x2="1">
            <stop offset="0" stopColor={TEAL} stopOpacity="0.1" />
            <stop offset="1" stopColor={TEAL} />
          </linearGradient>
        </defs>
        {nodes.map((n, i) => {
          const y = 8 + rowH * i + rowH / 2;
          const d = `M${ax + 26},${ay} C${(ax + sx) / 2},${ay} ${(ax + sx) / 2},${y} ${sx - 14},${y}`;
          const stroke = n.kind === "yes" ? "#111" : n.kind === "no" ? "#111" : n.kind === "person" ? "#111" : "url(#beam)";
          return (
            <g key={n.id}>
              <path d={d} fill="none" stroke="#111" strokeOpacity={0.08} strokeWidth={4} />
              <path d={d} fill="none" stroke={stroke} strokeWidth={n.kind === "yes" ? 2.5 : 2} strokeOpacity={n.kind === "no" ? 0.2 : 1} className={n.kind === "asking" ? "live-edge" : ""} strokeDasharray={n.kind === "person" ? "2 5" : undefined} />
              <circle cx={sx} cy={y} r={14} fill={n.kind === "yes" ? TEAL : "#fbf8f2"} stroke="#111" strokeWidth={1.5} opacity={n.kind === "no" ? 0.45 : 1} />
              <text x={sx} y={y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={n.kind === "yes" ? "#fff" : "#111"} opacity={n.kind === "no" ? 0.5 : 1}>
                {n.name.slice(0, 2).toUpperCase()}
              </text>
              <text x={sx + 24} y={y - 2} fontSize="13" fontWeight="600" fill="#111" opacity={n.kind === "no" ? 0.45 : 1}>
                {n.name}
              </text>
              <text x={sx + 24} y={y + 12} fontSize="10.5" fill="#5f5a52">
                {n.label}
              </text>
            </g>
          );
        })}
        <circle cx={ax} cy={ay} r={30} fill={TEAL} opacity={0.18} className="live-pulse" />
        <circle cx={ax} cy={ay} r={26} fill={TEAL} stroke="#111" strokeWidth={1.5} />
        <text x={ax} y={ay + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
          AGENT
        </text>
      </svg>
    </div>
  );
}

// ───────────────────────────────── live activity feed

export function ActivityFeed({ state, limit = 7 }: { state: LiveState; limit?: number }) {
  const items = [...state.audit].reverse().slice(0, limit);
  if (!items.length) return <p className="text-[11px] leading-4 text-muted-foreground">Quiet for now. Every step the agent takes streams in here.</p>;
  return (
    <ol className="space-y-2">
      {items.map((e, i) => (
        <li key={e.id} className={`flex gap-2.5 text-[11px] leading-4 ${i === 0 ? "lv-pop" : ""}`}>
          <span className={`mt-1 size-2 shrink-0 rounded-full ${e.actor === "agent" ? "bg-[#1f5f5b]" : e.status === "fail" ? "border-[1.5px] border-foreground" : "bg-foreground"}`} />
          <span className="min-w-0">
            <span className={e.status === "fail" ? "line-through decoration-foreground/40" : ""}>{e.action}</span>
            <span className="ml-1.5 font-mono text-[9.5px] text-muted-foreground">{clock(e.at)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

