"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyAction, type LiveAction } from "../actions.ts";
import { Runtime } from "../runtime.ts";
import type { LiveState } from "../types.ts";

export type LiveMeta = { bot?: string; joinUrl?: string; managerUrl?: string; autoplay: boolean; llm: boolean };
export type Source = "server" | "local";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Shared browser-side runtime so the projector and the manager phone mock see the same session in rehearsal. */
let localRuntime: Runtime | null = null;
function getLocal() {
  if (!localRuntime) {
    localRuntime = new Runtime({ mode: "rehearsal", code: "DEMO" }).start();
    localRuntime.autoplay = true;
  }
  return localRuntime;
}

export function useLive(source: Source) {
  const [state, setState] = useState<LiveState | null>(null);
  const [meta, setMeta] = useState<LiveMeta>({ autoplay: source === "local", llm: false });
  const [offline, setOffline] = useState(false);
  const version = useRef(-1);

  useEffect(() => {
    if (source === "local") {
      const rt = getLocal();
      setState(rt.state);
      setMeta((m) => ({ ...m, autoplay: rt.autoplay }));
      const unsub = rt.subscribe(setState);
      return () => {
        unsub();
      };
    }
    let alive = true;
    (async () => {
      while (alive) {
        try {
          const r = await fetch(`/api/live?since=${version.current}`, { cache: "no-store" });
          if (r.status === 200) {
            const j = (await r.json()) as { state: LiveState; meta: LiveMeta };
            version.current = j.state.version;
            setState(j.state);
            setMeta(j.meta);
          }
          setOffline(!r.ok && r.status !== 204);
        } catch {
          setOffline(true);
        }
        await sleep(600);
      }
    })();
    return () => {
      alive = false;
    };
  }, [source]);

  const act = useCallback(
    async (a: LiveAction) => {
      if (source === "local") {
        const rt = getLocal();
        const res = await applyAction(rt, a);
        setState(rt.state);
        setMeta((m) => ({ ...m, autoplay: rt.autoplay }));
        return res;
      }
      const r = await fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) });
      const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
      if (j.state) {
        version.current = j.state.version;
        setState(j.state);
        setMeta(j.meta);
      }
      return j as { ok: boolean; error?: string };
    },
    [source],
  );

  return { state, meta, act, offline };
}

export function useNow(intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export const fmtElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const clock = (at: number) => new Date(at).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
