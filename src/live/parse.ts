import { BUSINESS } from "./scenario.ts";
import type { Goal, ParsedReply, Window } from "./types.ts";

/**
 * Deterministic understanding of worker replies. Used offline and as the fallback when the
 * LLM is unavailable. Returns a calibrated-ish confidence so the agent asks instead of guessing.
 */

const SHIFT = BUSINESS.shift;

/** "7", "7pm", "19:00", "7.30", "6:30pm" → decimal hour in the evening shift's frame */
export function toHour(raw: string): number | null {
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 24 || min >= 60) return null;
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  if (!m[3] && h >= 1 && h <= 11) h += 12; // "7" during an evening shift means 19:00
  return h + min / 60;
}

const T = String.raw`(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)`;

export function extractWindow(text: string, full: Window = SHIFT): Window | undefined {
  const t = text.toLowerCase();
  const clamp = (w: Window): Window | undefined => {
    const start = Math.max(full.start, w.start);
    const end = Math.min(full.end, w.end);
    return end - start >= 0.5 ? { start, end } : undefined;
  };
  const range = t.match(new RegExp(`${T}\\s*(?:-|–|to|till|until)\\s*${T}`));
  if (range) {
    const a = toHour(range[1]);
    const b = toHour(range[2]);
    if (a != null && b != null) return clamp({ start: a, end: b > a ? b : b + 12 });
  }
  const from = t.match(new RegExp(`(?:from|after|only after|earliest|by|at|reach(?:ing)? by|onwards from)\\s*${T}`)) ?? t.match(new RegExp(`${T}\\s*(?:onwards|onward|on|or later)`));
  if (from) {
    const a = toHour(from[1]);
    if (a != null && a > full.start) return clamp({ start: a, end: full.end });
  }
  const until = t.match(new RegExp(`(?:until|till|til|up to|before|leave at|leave by|must go at)\\s*${T}`));
  if (until) {
    const b = toHour(until[1]);
    if (b != null && b < full.end) return clamp({ start: full.start, end: b });
  }
  const hoursOnly = t.match(/(?:only|just|max|maximum)\s*(\d)\s*(?:h|hr|hrs|hours)/);
  if (hoursOnly) return clamp({ start: full.end - Number(hoursOnly[1]), end: full.end });
  return undefined;
}

const has = (t: string, words: RegExp) => words.test(t);

export function parseReply(text: string, asked: Window = SHIFT): ParsedReply {
  const t = ` ${text.toLowerCase().replace(/[’']/g, "'")} `;
  const window = extractWindow(text, asked);
  const transport = has(t, /\b(grab|gojek|taxi|cab|ride|transport|no car|lift|pick me up|uber)\b/);
  const premium = has(t, /\b(overtime|ot rate|1\.5x|time and a half|double pay|extra pay|bonus)\b/);

  if (has(t, /\b(manager|real person|human|talk to someone|speak to someone|call me|call someone)\b/))
    return { intent: "human", confidence: 0.92, via: "heuristic" };
  if (has(t, /\b(who|why)\b.*\b(sick|off|called|out|absent|cancel|dropped|mc|leave|missing)\b|\bwho('s| is) (out|off|sick)\b/))
    return { intent: "ask_who", confidence: 0.9, via: "heuristic" };
  if (has(t, /\b(no longer|not anymore|can't anymore|cannot anymore|something came up|have to cancel|need to cancel|take it back)\b/))
    return { intent: "withdraw", confidence: 0.85, via: "heuristic" };

  if (has(t, /\b(on my way|omw|otw|coming now|running late|almost there|be there in|reaching soon|leaving now)\b/))
    return { intent: "on_way", confidence: 0.88, via: "heuristic" };
  if (has(t, /\b(sick|fever|unwell|ill|mc|flu|covid|not feeling well|throwing up|vomit\w*|emergency|hospital|can't make (it|tonight|today)|cannot make|won't make it|not coming|can't come in)\b/) && !window)
    return { intent: "cannot_work", confidence: 0.9, via: "heuristic" };

  const negative = has(t, /\b(no|nope|can't|cannot|cant|unable|not available|busy|sorry,? (i )?can't|not tonight|pass|won't)\b/);
  const positive = has(t, /\b(yes|yeah|yep|yup|ok|okay|sure|can do|i can|count me in|on it|i'm in|im in|will do|ya|can)\b/);

  if (window || transport || premium) {
    const conds = transport || premium;
    const partial = window && (window.start > asked.start || window.end < asked.end);
    if (negative && !positive && !window) return { intent: "decline", confidence: 0.7, via: "heuristic" };
    return {
      intent: partial ? "partial" : conds ? "conditional" : "accept",
      window: window ?? asked,
      transport,
      premium,
      confidence: window ? 0.86 : 0.8,
      via: "heuristic",
    };
  }
  if (negative && !has(t, /\b(no problem|no worries|can do)\b/)) return { intent: "decline", confidence: 0.84, via: "heuristic" };
  if (has(t, /\b(pay|rate|how much|paid|\$)\b/)) return { intent: "ask_pay", confidence: 0.8, via: "heuristic" };
  if (has(t, /\b(where|which outlet|address|location)\b/)) return { intent: "ask_where", confidence: 0.8, via: "heuristic" };
  if (t.includes("?")) return { intent: "question", confidence: 0.6, via: "heuristic" };
  if (positive) return { intent: "accept", window: asked, confidence: has(t, /\b(whole|full|entire|all)\b/) ? 0.93 : 0.82, via: "heuristic" };
  return { intent: "unclear", confidence: 0.3, via: "heuristic" };
}

/** Manager's goal → structured constraints, with the assumptions made visible. */
export function parseGoal(text: string): Goal {
  const assumptions: string[] = [];
  const t = text.trim();
  const budgetMatch = t.match(/(?:s\$|\$|sgd\s?)(\d{2,4})|(\d{2,4})\s*(?:dollars|sgd|bucks)|(?:under|below|max|budget(?: of)?)\s*\$?(\d{2,4})/i);
  const budget = budgetMatch ? Number(budgetMatch[1] ?? budgetMatch[2] ?? budgetMatch[3]) : BUSINESS.defaultBudget;
  if (!budgetMatch) assumptions.push(`No budget given: using the standing limit of S$${BUSINESS.defaultBudget} for extras`);

  const nameMatch = t.match(/\b([A-Z][a-z]+)(?:'s| is| has| called| can't| cannot| won't| just| texted| messaged| will)\b/);
  const absent = nameMatch && !["Tonight", "Today", "Please", "Need", "Sort", "Can", "The"].includes(nameMatch[1]) ? nameMatch[1] : BUSINESS.absent;
  if (!nameMatch) assumptions.push(`Absent worker not named: assumed ${BUSINESS.absent}, the only scheduled lead with a reported absence`);
  else if (absent !== BUSINESS.absent) assumptions.push(`${absent} is not on tonight's roster: treating the open slot as ${BUSINESS.absent}'s close`);

  if (!/\b(close|closing|tonight|evening|night)\b/i.test(t)) assumptions.push(`Shift not named: assumed tonight's ${BUSINESS.outlet} close (17:00–23:00)`);

  return {
    raw: t,
    absent: absent === BUSINESS.absent ? absent : BUSINESS.absent,
    outlet: BUSINESS.outlet,
    role: BUSINESS.shift.role,
    window: { start: BUSINESS.shift.start, end: BUSINESS.shift.end },
    budget,
    via: "heuristic",
    confidence: assumptions.length === 0 ? 0.9 : assumptions.length === 1 ? 0.75 : 0.6,
    assumptions,
  };
}
