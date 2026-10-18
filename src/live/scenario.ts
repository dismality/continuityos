import type { Baseline, Crew, Settings, Slot } from "./types.ts";

/** The business the live demo runs against. Edit freely: everything else is derived from it. */
export const BUSINESS = {
  name: "Kopi & Co",
  outlet: "Orchard",
  address: "Kopi & Co Orchard, level B2 (demo outlet)",
  shift: { role: "Closing lead", start: 17, end: 23 },
  absent: "Aisha",
  minRestHours: 10,
  requirement: "food-safety certificate (required to lead a close)",
};

type CrewSeed = Omit<Crew, "seat" | "status" | "thread" | "chases">;

const seeds: CrewSeed[] = [
  { id: "aisha", name: "Aisha", role: "Closing lead", outlet: "Orchard", certified: true, hoursThisWeek: 24, maxHours: 44, travelMin: 12, rate: 15, persona: ["so sorry, fever since this afternoon 🤒 can't make tonight's close"] },
  { id: "wei", name: "Wei", role: "Opening lead", outlet: "Orchard", certified: true, hoursThisWeek: 30, maxHours: 44, travelMin: 15, rate: 15, persona: [] },
  { id: "siti", name: "Siti", role: "Barista", outlet: "Orchard", certified: false, hoursThisWeek: 26, maxHours: 44, travelMin: 9, rate: 12, persona: [] },
  { id: "ben", name: "Ben", role: "Barista", outlet: "Orchard", certified: false, hoursThisWeek: 22, maxHours: 44, travelMin: 14, rate: 12, persona: [] },
  { id: "hana", name: "Hana", role: "Service crew", outlet: "Orchard", certified: false, hoursThisWeek: 18, maxHours: 44, travelMin: 20, rate: 11, persona: [] },
  { id: "daniel", name: "Daniel", role: "Food-safety lead", outlet: "Somerset", certified: true, hoursThisWeek: 22, maxHours: 44, travelMin: 18, rate: 15, persona: ["ok can do but only from 7pm, and I'd need a grab, no car tonight"] },
  { id: "farah", name: "Farah", role: "Senior crew", outlet: "Orchard", certified: true, hoursThisWeek: 30, maxHours: 44, travelMin: 5, rate: 14, persona: ["", "sorry just saw this!! I can do 5 to 7 if that helps"] },
  { id: "mei", name: "Mei", role: "Shift lead", outlet: "Tampines", certified: true, hoursThisWeek: 16, maxHours: 44, travelMin: 40, rate: 15, persona: ["who called in sick?", "ah ok. sorry can't tonight, my kid has a recital"] },
  { id: "jun", name: "Jun", role: "Closing lead", outlet: "Bugis", certified: true, hoursThisWeek: 28, maxHours: 44, travelMin: 25, rate: 15, persona: ["can I talk to the manager first?"] },
  { id: "priya", name: "Priya", role: "Shift lead", outlet: "Orchard", certified: true, hoursThisWeek: 36, maxHours: 44, travelMin: 10, rate: 15, persona: ["yes I can do the whole shift"] },
  { id: "marcus", name: "Marcus", role: "Food-safety lead", outlet: "Bugis", certified: true, hoursThisWeek: 43, maxHours: 44, travelMin: 22, rate: 15, persona: [] },
  { id: "chloe", name: "Chloe", role: "Shift lead", outlet: "Orchard", certified: true, hoursThisWeek: 24, maxHours: 44, nextShiftStart: 31, travelMin: 8, rate: 15, persona: [] },
  { id: "raj", name: "Raj", role: "Kitchen crew", outlet: "Orchard", certified: false, hoursThisWeek: 20, maxHours: 44, travelMin: 6, rate: 12, persona: [] },
  { id: "leon", name: "Leon", role: "Closing lead", outlet: "Somerset", certified: true, hoursThisWeek: 0, maxHours: 44, onLeave: true, travelMin: 20, rate: 15, persona: [] },
];

export function freshCrew(): Crew[] {
  return seeds.map((s) => ({ ...s, seat: null, status: "bench", thread: [], chases: 0 }));
}

/** Today's timetable at the outlet. The agent watches every slot and edits it when someone drops out. */
export function freshSlots(): Slot[] {
  const a = (crewId: string, start: number, end: number) => [{ crewId, window: { start, end }, source: "plan" as const }];
  return [
    { id: "open-lead", role: "Opening lead", window: { start: 7, end: 15 }, needsCert: true, assignments: a("wei", 7, 15) },
    { id: "barista-am", role: "Barista", window: { start: 7, end: 15 }, needsCert: false, assignments: a("siti", 7, 15) },
    { id: "kitchen", role: "Kitchen crew", window: { start: 11, end: 19 }, needsCert: false, assignments: a("raj", 11, 19) },
    { id: "barista-pm", role: "Barista", window: { start: 15, end: 23 }, needsCert: false, assignments: a("ben", 15, 23) },
    { id: "close-lead", role: "Closing lead", window: { start: 17, end: 23 }, needsCert: true, assignments: a("aisha", 17, 23) },
    { id: "service-pm", role: "Service crew", window: { start: 18, end: 23 }, needsCert: false, assignments: a("hana", 18, 23) },
  ];
}

export const DEFAULT_BASELINE: Baseline = {
  minutes: 45,
  messages: 23,
  apps: 3,
  source: "placeholder estimate. Replace with what a real manager tells you",
};

export const DEFAULT_SETTINGS: Settings = {
  waveSize: 3,
  maxContacts: 5,
  chaseAfterSec: 40,
  giveUpAfterSec: 80,
  retryDelaySec: 4,
  maxAttempts: 3,
  autoOutreach: true,
  autoApproveSpend: 30,
  noShowWaitSec: 30,
};

export const fmtHour = (h: number) => {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

export const fmtWindow = (w: { start: number; end: number }) => `${fmtHour(w.start)}–${fmtHour(w.end)}`;

export const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;
