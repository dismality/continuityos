import { businessById, type BusinessProfile } from "./businesses.ts";
import type { Baseline, Crew, Settings, Slot } from "./types.ts";

/**
 * The business the live demo runs against. It starts as Kopi & Co and is swapped in place by applyProfile()
 * when the presenter switches business, so every module that imported it sees the new labels.
 */
export const BUSINESS = {
  id: "kopi",
  name: "Kopi & Co",
  outlet: "Orchard",
  address: "Kopi & Co Orchard, level B2 (demo outlet)",
  industry: "Café" as BusinessProfile["industry"],
  coords: { lat: 1.3036, lng: 103.8318 },
  shift: { role: "Closing lead", start: 17, end: 23 },
  absent: "Aisha",
  minRestHours: 10,
  requirement: "food-safety certificate (required to lead a close)",
  certShort: "food-safety certificate",
  certNeed: "a certified lead",
  certMissing: "No food-safety certificate: can't lead a shift",
};

let profile: BusinessProfile = businessById("kopi");

export function applyProfile(id: string) {
  profile = businessById(id);
  Object.assign(BUSINESS, {
    id: profile.id,
    name: profile.name,
    outlet: profile.outlet,
    address: profile.address,
    industry: profile.industry,
    coords: profile.coords,
    shift: { role: profile.slotRoles["close-lead"], start: 17, end: 23 },
    absent: profile.names.aisha,
    requirement: `${profile.certShort} (required for lead shifts)`,
    certShort: profile.certShort,
    certNeed: profile.certNeed,
    certMissing: profile.certMissing,
  });
  return profile;
}

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
  const p = profile;
  const branch = (o: string) => (o === "Orchard" ? p.outlet : (p.branches[o as keyof typeof p.branches] ?? o));
  return seeds.map((s) => ({
    ...s,
    name: p.names[s.id] ?? s.name,
    role: p.roles[s.role] ?? s.role,
    outlet: branch(s.outlet),
    persona: s.id === "aisha" ? [p.sickText] : s.persona,
    seat: null,
    status: "bench",
    thread: [],
    chases: 0,
  }));
}

/** Today's timetable at the outlet. The agent watches every slot and edits it when someone drops out. */
export function freshSlots(): Slot[] {
  const a = (crewId: string, start: number, end: number) => [{ crewId, window: { start, end }, source: "plan" as const }];
  const r = profile.slotRoles;
  return [
    { id: "open-lead", role: r["open-lead"], window: { start: 7, end: 15 }, needsCert: true, assignments: a("wei", 7, 15) },
    { id: "barista-am", role: r["barista-am"], window: { start: 7, end: 15 }, needsCert: false, assignments: a("siti", 7, 15) },
    { id: "kitchen", role: r["kitchen"], window: { start: 11, end: 19 }, needsCert: false, assignments: a("raj", 11, 19) },
    { id: "barista-pm", role: r["barista-pm"], window: { start: 15, end: 23 }, needsCert: false, assignments: a("ben", 15, 23) },
    { id: "close-lead", role: r["close-lead"], window: { start: 17, end: 23 }, needsCert: true, assignments: a("aisha", 17, 23) },
    { id: "service-pm", role: r["service-pm"], window: { start: 18, end: 23 }, needsCert: false, assignments: a("hana", 18, 23) },
  ];
}

/**
 * Doing it by hand. From one manager interview (a Singapore public-sector tech team): about 7 no-shows a month.
 * Minutes and messages per gap are our estimates until confirmed by more interviews.
 */
export const DEFAULT_BASELINE: Baseline = {
  minutes: 40,
  messages: 12,
  apps: 2,
  gapsPerMonth: 7,
  source: "1 manager interview: ~7 no-shows a month; minutes and messages per gap are estimates",
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
