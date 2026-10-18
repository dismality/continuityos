"use client";

import { useState } from "react";
import { BadgeCheck, Bot, Play, Send, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BUSINESS } from "../scenario.ts";
import { clock, fmtElapsed, useLive, useNow, type Source } from "./use-live.ts";

/** The manager's phone: one request in, one tap per decision out. Open /live/manager on a phone. */
export function ManagerApp({ source = "server" }: { source?: Source }) {
  const { state, act } = useLive(source);
  const now = useNow(1000);
  const [goal, setGoal] = useState("Aisha just called, she's sick tonight");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (!state) return <div className="dashboard flex min-h-screen items-center justify-center bg-muted/20 text-sm text-muted-foreground">Connecting…</div>;
  const pending = new Set(state.gates.filter((g) => g.status === "pending").map((g) => g.id));
  const waiting = state.crew.filter((c) => c.status === "human");
  return (
    <div className="dashboard min-h-screen bg-muted/20 text-foreground">
      <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-16 max-w-lg items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </span>
            <span>
              <span className="block font-semibold tracking-tight">ContinuityOS</span>
              <span className="block text-[10px] tracking-[0.13em] text-muted-foreground uppercase">{BUSINESS.name} manager</span>
            </span>
          </div>
          <Badge variant="outline" className="font-mono">
            {state.startedAt ? fmtElapsed((state.finishedAt ?? now) - state.startedAt) : "ready"}
          </Badge>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-4 px-4 py-5">
        {state.phase === "lobby" && (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Nothing needs you right now</h2>
              </CardTitle>
              <CardDescription>The agent watches tonight&apos;s roster. If someone calls in sick or doesn&apos;t show up, it finds cover within your rules and tells you here when it&apos;s done.</CardDescription>
            </CardHeader>
            <CardContent>
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">Report an absence yourself</summary>
                <form
                  className="mt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act({ action: "goal", text: goal });
                  }}
                >
                  <label htmlFor="mgr-goal" className="sr-only">
                    What happened
                  </label>
                  <textarea id="mgr-goal" rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} className="w-full resize-none rounded-xl border bg-muted/25 p-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
                  <Button type="submit" className="mt-3 w-full">
                    <Play className="size-4" />
                    Hand it to the agent
                  </Button>
                </form>
              </details>
            </CardContent>
          </Card>
        )}

        {state.phase === "done" && (
          <Card className="border-emerald-200 bg-emerald-50/30">
            <CardHeader>
              <CardTitle>
                <h2 className="flex items-center gap-2 text-emerald-900">
                  <BadgeCheck className="size-5" />
                  Covered in {fmtElapsed((state.finishedAt ?? 0) - (state.startedAt ?? 0))} with {state.managerTaps} taps
                </h2>
              </CardTitle>
              <CardDescription>{state.plan?.explanation}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {waiting.map((c) => (
          <Card key={c.id} className="ring-1 ring-amber-300">
            <CardHeader>
              <CardTitle>
                <h2>{c.name} wants to talk to you</h2>
              </CardTitle>
              <CardDescription>&ldquo;{[...c.thread].reverse().find((m) => m.dir === "in")?.text}&rdquo; · the agent has paused this chat</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act({ action: "say", crewId: c.id, text: drafts[c.id] ?? "" });
                  setDrafts((d) => ({ ...d, [c.id]: "" }));
                }}
              >
                <label htmlFor={`mgr-say-${c.id}`} className="sr-only">
                  Message {c.name}
                </label>
                <input
                  id={`mgr-say-${c.id}`}
                  value={drafts[c.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                  placeholder={`Message ${c.name}`}
                  className="min-h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
                <Button type="submit">
                  <Send className="size-4" />
                  Send
                </Button>
              </form>
              <Button variant="outline" className="w-full" onClick={() => act({ action: "takeover", crewId: c.id, on: false })}>
                <Bot className="size-4" />
                Hand back to the agent
              </Button>
            </CardContent>
          </Card>
        ))}

        <div className="space-y-3">
          {[...state.managerInbox].reverse().map((m) => {
            const gateId = m.buttons?.[0]?.data.split(":")[1];
            const live = gateId ? pending.has(gateId) : false;
            return (
              <div key={m.id} className={`rounded-2xl border bg-background p-4 ${live ? "ring-1 ring-amber-300" : ""}`}>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Bot className="size-3" />
                  ContinuityOS agent · {clock(m.at)}
                </div>
                <p className="mt-2 text-sm leading-6 whitespace-pre-wrap">{m.text.replace(/\*/g, "")}</p>
                {gateId && (
                  <div className="mt-3 flex gap-2">
                    {live ? (
                      <>
                        <Button className="flex-1" onClick={() => act({ action: "decide", gateId, approve: true, via: "phone" })}>
                          Approve
                          <ShieldCheck className="size-4" />
                        </Button>
                        <Button variant="outline" onClick={() => act({ action: "decide", gateId, approve: false, via: "phone" })}>
                          Reject
                        </Button>
                      </>
                    ) : (
                      <Badge variant="outline">{state.gates.find((g) => g.id === gateId)?.status ?? ""}</Badge>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {state.managerInbox.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">The agent reports here and asks before it messages anyone or spends anything.</p>}
        </div>
      </div>
    </div>
  );
}
