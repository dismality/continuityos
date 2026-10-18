import { BUSINESS, fmtHour, fmtWindow } from "./scenario.ts";
import type { Condition, Crew, Goal, Plan, Segment, Window } from "./types.ts";

/** Hard rules. Returns null when the worker may be offered (part of) the shift, else the reason. */
export function whyNot(c: Crew, goal: Pick<Goal, "window" | "absent">): string | null {
  if (c.name === goal.absent) return "Reported absent tonight";
  if (c.rostered) return "Already rostered on this shift";
  if (c.onLeave) return "On approved leave this week";
  if (!c.certified) return `No food-safety certificate: can't lead a close`;
  const left = c.maxHours - c.hoursThisWeek;
  if (left < 2) return `Only ${left}h left before the ${c.maxHours}h weekly cap (${c.hoursThisWeek}h worked)`;
  if (c.nextShiftStart != null) {
    const rest = c.nextShiftStart - goal.window.end;
    if (rest < BUSINESS.minRestHours)
      return `Opens tomorrow at ${fmtHour(c.nextShiftStart)}: closing tonight leaves ${rest}h rest (minimum ${BUSINESS.minRestHours}h)`;
  }
  return null;
}

export type Rank = { crewId: string; score: number; reasons: string[] };

/** Lower score = asked first. Fairness first, then travel. Explained in plain words. */
export function rank(crew: Crew[], goal: Pick<Goal, "window" | "absent">): Rank[] {
  return crew
    .filter((c) => whyNot(c, goal) === null)
    .map((c) => {
      const load = c.hoursThisWeek / c.maxHours;
      const score = 0.5 * load + 0.3 * Math.min(c.travelMin / 60, 1);
      return {
        crewId: c.id,
        score,
        reasons: [
          `${Math.round(load * 100)}% of weekly hours used (${c.hoursThisWeek}/${c.maxHours}h)`,
          `${c.travelMin} min from ${BUSINESS.outlet}`,
          c.outlet === BUSINESS.outlet ? "Knows this outlet" : `Based at ${c.outlet}`,
        ],
      };
    })
    .sort((a, b) => a.score - b.score);
}

export function transportCost(c: Crew) {
  return Math.round(8 + 0.6 * c.travelMin);
}

export function conditionsFor(c: Crew, transport?: boolean, premium?: boolean, hours = 0): Condition[] {
  const out: Condition[] = [];
  if (transport) out.push({ kind: "transport", label: `Ride both ways est. S$${transportCost(c)}`, cost: transportCost(c), allowed: true });
  if (premium) {
    const cost = Math.round(0.5 * c.rate * hours);
    out.push({ kind: "premium", label: `Time-and-a-half premium S$${cost}`, cost, allowed: true });
  }
  return out;
}

const SLOT = 0.5;

/** Choose who covers which part of the shift from the tentative offers. Exhaustive over small subsets. */
export function buildPlan(crew: Crew[], goal: Goal, previous?: Plan): Plan {
  const prevIds = new Set(previous?.segments.map((s) => s.crewId) ?? []);
  const { start, end } = goal.window;
  const slots: number[] = [];
  for (let h = start; h < end - 1e-9; h += SLOT) slots.push(h);
  const offers = crew.filter((c) => (c.status === "accepted" || c.status === "confirmed") && c.offer);

  type Cand = { crew: Crew; w: Window; extras: Condition[] };
  const cands: Cand[] = offers.map((c) => {
    const cap = c.maxHours - c.hoursThisWeek;
    const w = { start: Math.max(start, c.offer!.window.start), end: Math.min(end, c.offer!.window.end) };
    if (w.end - w.start > cap) w.start = w.end - cap; // never plan past the weekly cap
    return { crew: c, w, extras: c.offer!.conditions.filter((x) => x.allowed) };
  });

  let best: { segs: Segment[]; key: number[]; extra: number; base: number } | null = null;
  const n = cands.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const pick = cands.filter((_, i) => mask & (1 << i));
    if (pick.length > 3) continue;
    // assign each slot: keep the current person while they still cover it, else switch to whoever covers longest
    const owner: (Cand | null)[] = [];
    let cur: Cand | null = null;
    for (const s of slots) {
      const covers = (c: Cand) => c.w.start <= s + 1e-9 && c.w.end >= s + SLOT - 1e-9;
      if (!cur || !covers(cur)) cur = pick.filter(covers).sort((a, b) => b.w.end - a.w.end)[0] ?? null;
      owner.push(cur);
    }
    const segs: Segment[] = [];
    owner.forEach((o, i) => {
      if (!o) return;
      const last = segs[segs.length - 1];
      if (last && last.crewId === o.crew.id && Math.abs(last.window.end - slots[i]) < 1e-9) last.window.end += SLOT;
      else segs.push({ crewId: o.crew.id, window: { start: slots[i], end: slots[i] + SLOT }, base: 0, extras: o.extras });
    });
    const used = new Set(segs.map((s) => s.crewId));
    if (used.size !== pick.length) continue; // someone picked but not needed
    for (const s of segs) s.base = (s.window.end - s.window.start) * crew.find((c) => c.id === s.crewId)!.rate;
    const uncovered = owner.filter((o) => !o).length;
    const extra = [...used].reduce((sum, id) => sum + pick.find((p) => p.crew.id === id)!.extras.reduce((a, x) => a + x.cost, 0), 0);
    const base = segs.reduce((a, s) => a + s.base, 0);
    // lexicographic: fewest uncovered slots, within budget, fewest people, least churn vs. the last plan, cheapest
    const churn = [...used].filter((id) => !prevIds.has(id)).length;
    const key = [uncovered, extra > goal.budget ? 1 : 0, used.size, churn, extra];
    const cand = { segs, key, extra, base };
    const cmp = (a: number[], b: number[]) => a.findIndex((v, i) => v !== b[i]);
    const i = best ? cmp(key, best.key) : -1;
    const better = !best || (i >= 0 && key[i] < best.key[i]);
    if (better) best = cand;
  }

  const segments = best?.segs ?? [];
  const gaps: Window[] = [];
  for (const s of slots) {
    const covered = segments.some((g) => g.window.start <= s + 1e-9 && g.window.end >= s + SLOT - 1e-9);
    if (covered) continue;
    const last = gaps[gaps.length - 1];
    if (last && Math.abs(last.end - s) < 1e-9) last.end += SLOT;
    else gaps.push({ start: s, end: s + SLOT });
  }
  const totalHours = end - start;
  const coveredHours = totalHours - gaps.reduce((a, g) => a + g.end - g.start, 0);
  const extraCost = best?.extra ?? 0;
  const name = (id: string) => crew.find((c) => c.id === id)?.name ?? id;
  const explanation =
    segments.length === 0
      ? "No confirmed cover yet."
      : `${segments.map((s) => `${name(s.crewId)} ${fmtWindow(s.window)}`).join(" + ")}` +
        (gaps.length ? `; still open ${gaps.map(fmtWindow).join(", ")}` : "; full shift covered") +
        (extraCost ? `; extras S$${extraCost}` : "; no extra spend");
  return {
    segments,
    gaps,
    extraCost,
    baseCost: best?.base ?? 0,
    coveredHours,
    totalHours,
    withinBudget: extraCost <= goal.budget,
    explanation,
  };
}
