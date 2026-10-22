/**
 * Which day(s) someone means when they say they can't work: "tmr", "this sat", "on the 27th",
 * "27/10", "day after tomorrow", "this weekend", "sat and sun". Only today and the next 7 days count.
 *
 * Returns null when the text names no day at all (the agent then asks with a calendar),
 * [] when it names a day outside the next week, otherwise the dates as YYYY-MM-DD.
 */

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_RE = /\b(next\s+|this\s+|coming\s+|on\s+)?(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/gi;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (base: Date, n: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + n, 12);

/** Today plus the next 7 days, local time. */
export function weekAhead(now: number) {
  const base = new Date(now);
  return Array.from({ length: 8 }, (_, i) => {
    const d = addDays(base, i);
    return { iso: isoOf(d), label: d.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" }).replace(",", "") };
  });
}

/** Words that mean "I won't be at work", beyond the plain sick/can't-make-it phrases. */
export const ABSENCE =
  /\b(can'?t|cannot|can not|won'?t be able to|unable to|not able to)\s+(make it|make|come|come in|work|do|go|turn up)\b|\b(take|taking|on|need)\s+(leave|mc|medical leave|annual leave|a day off|the day off)\b|\b(mc|on leave|day off|off sick|not coming|won'?t be (in|there|coming))\b/i;

export function parseWhen(text: string, now: number): string[] | null {
  const t = ` ${text.toLowerCase().replace(/[’']/g, "'")} `;
  const base = new Date(now);
  const out = new Set<number>(); // day offsets from today
  let named = false;

  const hit = (n: number) => {
    named = true;
    out.add(n);
  };
  if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(t)) hit(0);
  if (/\b(day after (tomorrow|tmr|tmrw|tml))\b/.test(t)) hit(2);
  else if (/\b(tmr|tmrw|tml|tomorrow|tomolo|tomoro)\b/.test(t)) hit(1);
  const inN = t.match(/\bin (\d|one|two|three|four|five|six|seven) days?\b/);
  if (inN) {
    named = true;
    const n = Number(inN[1]) || ["one", "two", "three", "four", "five", "six", "seven"].indexOf(inN[1]) + 1;
    out.add(n);
  }
  if (/\b(this |the |coming )?weekend\b/.test(t)) {
    named = true;
    for (const wd of [6, 0]) out.add((wd - base.getDay() + 7) % 7);
  }
  for (const m of t.matchAll(DAY_RE)) {
    named = true;
    const wd = DAYS.indexOf(m[2].slice(0, 3));
    let n = (wd - base.getDay() + 7) % 7;
    // "next mon" said on a Thursday means the coming Monday (next calendar week); "next sat" means a week on Saturday
    if (m[1]?.trim() === "next" && n <= (7 - base.getDay()) % 7) n += 7;
    out.add(n);
  }
  // 27th / the 27th / 27 oct / oct 27 / 27/10
  const dm = [...t.matchAll(/\b(?:on |the )?(\d{1,2})(?:st|nd|rd|th)?(?:\s*(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|\s*[/.-]\s*(\d{1,2}))?\b/g)];
  for (const m of dm) {
    const day = Number(m[1]);
    const hasOrdinal = /\d(st|nd|rd|th)\b/.test(m[0]) || /\b(on|the)\s+\d/.test(m[0]);
    if (!m[2] && !m[3] && !hasOrdinal) continue; // a bare number is probably a time ("after 7")
    if (day < 1 || day > 31) continue;
    const month = m[2] ? MONTHS.indexOf(m[2]) : m[3] ? Number(m[3]) - 1 : null;
    named = true;
    for (let n = 0; n <= 7; n++) {
      const d = addDays(base, n);
      if (d.getDate() === day && (month === null || d.getMonth() === month)) out.add(n);
    }
    if (![...out].some((n) => addDays(base, n).getDate() === day)) out.add(99); // outside the week
  }
  const mon = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/);
  if (mon) {
    named = true;
    const month = MONTHS.indexOf(mon[1]);
    const day = Number(mon[2]);
    let found = false;
    for (let n = 0; n <= 7; n++) {
      const d = addDays(base, n);
      if (d.getDate() === day && d.getMonth() === month) {
        out.add(n);
        found = true;
      }
    }
    if (!found) out.add(99);
  }
  if (!named) return null;
  return [...out]
    .filter((n) => n >= 0 && n <= 7)
    .sort((a, b) => a - b)
    .map((n) => isoOf(addDays(base, n)));
}
