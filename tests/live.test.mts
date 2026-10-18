import assert from "node:assert/strict";
import { test } from "node:test";
import { initialState, step } from "../src/live/engine.ts";
import { parseGoal, parseReply } from "../src/live/parse.ts";
import { qrMatrix } from "../src/live/qr.ts";
import type { Effect, LiveEvent, LiveState } from "../src/live/types.ts";

/** Drives the pure engine with a fake clock; every send succeeds unless `fail` says otherwise. */
function harness() {
  let s: LiveState = initialState({ mode: "rehearsal", code: "TEST" });
  let now = 1_000_000;
  const sent: Effect[] = [];
  const fail = new Set<string>();
  const go = (ev: LiveEvent) => {
    const r = step(s, ev, now);
    s = r.state;
    for (const fx of r.effects) {
      sent.push(fx);
      if (fx.kind === "send") go({ type: "send_result", crewId: fx.crewId, msgId: fx.msgId, ok: !fail.has(fx.crewId), evidence: "test", error: "down" });
    }
  };
  const reply = (crewId: string, text: string) => go({ type: "reply", crewId, text, parsed: parseReply(text, s.crew.find((c) => c.id === crewId)!.askedWindow) });
  const start = (goal = "Aisha's sick, sort out tonight's close, keep extras under $150") => {
    go({ type: "goal", text: goal, goal: parseGoal(goal) });
    go({ type: "decide", gateId: s.gates[0].id, approve: true, via: "projector" });
  };
  return { get s() { return s; }, go, reply, start, sent, fail, tick: (sec: number) => { now += sec * 1000; go({ type: "tick" }); } };
}

test("parser reads messy replies", () => {
  const a = parseReply("ok can do but only from 7pm, and I'd need a grab, no car tonight");
  assert.equal(a.intent, "partial");
  assert.deepEqual(a.window, { start: 19, end: 23 });
  assert.equal(a.transport, true);
  assert.deepEqual(parseReply("I can do 5 to 7 if that helps").window, { start: 17, end: 19 });
  assert.equal(parseReply("who called in sick?").intent, "ask_who");
  assert.equal(parseReply("can I talk to the manager first?").intent, "human");
  assert.equal(parseReply("sorry can't tonight").intent, "decline");
  assert.equal(parseReply("hmm").intent, "unclear");
});

test("goal parsing surfaces assumptions", () => {
  assert.equal(parseGoal("Aisha's sick, sort out tonight's close, under $120").budget, 120);
  assert.ok(parseGoal("need cover pls").assumptions.length >= 2);
});

test("hard rules exclude with reasons, and nothing is sent before approval", () => {
  const h = harness();
  h.go({ type: "goal", text: "Aisha's sick tonight", goal: parseGoal("Aisha's sick tonight") });
  const excluded = h.s.crew.filter((c) => c.status === "ineligible").map((c) => c.name).sort();
  assert.deepEqual(excluded, ["Chloe", "Leon", "Marcus", "Raj"]);
  assert.equal(h.sent.filter((f) => f.kind === "send").length, 0);
  assert.equal(h.s.phase, "awaiting_outreach");
});

test("split shift: partial yes + bridge, then approval, then verified", () => {
  const h = harness();
  h.start();
  assert.deepEqual(h.s.crew.filter((c) => c.status === "contacted").map((c) => c.name), ["Daniel", "Farah", "Mei"]);
  h.reply("daniel", "only from 7pm and I need a grab");
  assert.deepEqual(h.s.plan!.gaps, [{ start: 17, end: 19 }]);
  h.reply("mei", "who called in sick?");
  const privacy = h.s.crew.find((c) => c.id === "mei")!.thread.at(-1)!.text;
  assert.match(privacy, /can't share/);
  assert.doesNotMatch(privacy, /Aisha/);
  h.reply("mei", "sorry can't tonight");
  const asked = h.s.crew.filter((c) => c.askedWindow?.start === 17 && c.askedWindow.end === 19).map((c) => c.name);
  assert.ok(asked.length >= 1, "asks the next people only for the gap");
  h.reply(h.s.crew.find((c) => c.name === asked[0])!.id, "yes");
  assert.equal(h.s.phase, "awaiting_package");
  const pkg = h.s.gates.find((g) => g.kind === "package")!;
  assert.equal(pkg.extraCost, 19);
  h.go({ type: "decide", gateId: pkg.id, approve: true, via: "projector" });
  assert.equal(h.s.phase, "done");
  assert.ok(h.s.verified!.every((v) => v.ok));
  assert.equal(h.s.managerTaps, 2);
});

test("over-budget conditions are refused, not committed", () => {
  const h = harness();
  h.start("Aisha's sick, sort out tonight's close, keep extras under $10");
  h.reply("daniel", "yes but I need a grab");
  const d = h.s.crew.find((c) => c.id === "daniel")!;
  assert.equal(d.status, "negotiating");
  assert.match(d.thread.at(-1)!.text, /more than I'm allowed/);
});

test("failed sends retry, then the agent moves to the next person", () => {
  const h = harness();
  h.fail.add("daniel");
  h.start();
  for (let i = 0; i < 4; i++) h.tick(10);
  assert.equal(h.s.crew.find((c) => c.id === "daniel")!.status, "unreachable");
  assert.ok(h.s.crew.find((c) => c.id === "jun")!.contactedAt, "next-ranked person was asked instead");
});

test("non-responders get one reminder, then are skipped", () => {
  const h = harness();
  h.start();
  h.tick(41);
  assert.equal(h.s.crew.find((c) => c.id === "farah")!.status, "chased");
  h.tick(41);
  assert.equal(h.s.crew.find((c) => c.id === "farah")!.status, "no_response");
});

test("QR encoder produces a valid-size symbol", () => {
  assert.equal(qrMatrix("https://t.me/KopiCoCrewBot?start=KX7Q").length, 29);
});
