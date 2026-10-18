import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Outlet, Shift, Week, Worker, Workspace } from "@/db/schema";
import { DEFAULT_BASELINES, DEFAULT_RULES, getPreset } from "@/lib/presets";
import { formatDate, shiftWindow } from "@/lib/time";
import type { Rules } from "@/lib/types";
import { availabilityKey, type AvailabilityStatus, type SolverShift, type SolverWorker } from "./solver";

export async function getWorkspace(): Promise<Workspace> {
  const db = getDb();
  const [row] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, 1));
  if (row) return row;
  const preset = getPreset("cafe");
  const [created] = await db
    .insert(schema.workspace)
    .values({
      id: 1,
      businessName: "Kopi & Co. Café",
      presetKey: preset.key,
      timezone: "Asia/Singapore",
      skills: preset.skills,
      shiftTemplates: preset.shiftTemplates,
      rules: { ...DEFAULT_RULES, ...preset.rules },
      baselines: DEFAULT_BASELINES,
    })
    .onConflictDoNothing()
    .returning();
  return created ?? (await getWorkspace());
}

async function linkUnassignedWorkers(outletId: number): Promise<void> {
  const db = getDb();
  const workers = await db.select({ id: schema.workers.id }).from(schema.workers);
  const links = await db.select({ workerId: schema.workerOutlets.workerId }).from(schema.workerOutlets);
  const linked = new Set(links.map((link) => link.workerId));
  const missing = workers.filter((worker) => !linked.has(worker.id));
  if (missing.length) {
    await db.insert(schema.workerOutlets).values(missing.map((worker) => ({ workerId: worker.id, outletId, isHome: true }))).onConflictDoNothing();
  }
}

/** Keeps existing single-site workspaces working while enabling multi-outlet rosters. */
export async function getOutlets(): Promise<Outlet[]> {
  const db = getDb();
  const current = await db.select().from(schema.outlets).where(eq(schema.outlets.active, true)).orderBy(schema.outlets.id);
  if (current.length) {
    await linkUnassignedWorkers(current[0].id);
    return current;
  }
  const [existing] = await db.select().from(schema.outlets).orderBy(schema.outlets.id).limit(1);
  if (existing) {
    const [reactivated] = await db.update(schema.outlets).set({ active: true }).where(eq(schema.outlets.id, existing.id)).returning();
    await linkUnassignedWorkers(reactivated.id);
    return [reactivated];
  }
  const [created] = await db
    .insert(schema.outlets)
    .values({ name: "Main outlet", code: "MAIN", rules: { minimumStaff: 1 } })
    .onConflictDoNothing()
    .returning();
  const result = created ? [created] : await db.select().from(schema.outlets).where(eq(schema.outlets.active, true)).orderBy(schema.outlets.id);
  if (result[0]) await linkUnassignedWorkers(result[0].id);
  return result;
}

/** Agent time: wall clock plus the demo clock offset, so reminders and timeouts can be fast-forwarded. */
export function nowMs(ws: Pick<Workspace, "clockOffsetMinutes">): number {
  return Date.now() + ws.clockOffsetMinutes * 60_000;
}

export const nowDate = (ws: Pick<Workspace, "clockOffsetMinutes">) => new Date(nowMs(ws));

export function effectiveMaxHours(worker: Worker, rules: Rules, week?: Week | null): number {
  const personal = worker.maxHoursPerWeek ?? rules.maxHoursPerWeek;
  const cap = week?.constraints.maxHoursPerWeek;
  return cap ? Math.min(personal, cap) : personal;
}

export function shiftLabel(shift: Pick<Shift, "date" | "label" | "start" | "end">): string {
  return `${formatDate(shift.date)}, ${shift.label} ${shift.start}–${shift.end}`;
}

export function toSolverShift(shift: Shift, tz: string, outlet?: Outlet): SolverShift {
  return {
    id: shift.id,
    outletId: shift.outletId,
    date: shift.date,
    label: shiftLabel(shift),
    ...shiftWindow(shift.date, shift.start, shift.end, tz),
    requiredCount: shift.requiredCount,
    requiredSkills: shift.requiredSkills,
    outletRules: outlet ? { minRestHours: outlet.rules.minRestHours, maxShiftsPerDay: outlet.rules.maxShiftsPerDay } : undefined,
  };
}

export function toSolverWorker(worker: Worker, rules: Rules, week?: Week | null, outletIds: number[] = [], outletMaxHours: number[] = []): SolverWorker {
  const base = effectiveMaxHours(worker, rules, week);
  const maxHours = outletMaxHours.length ? Math.min(base, ...outletMaxHours) : base;
  return { id: worker.id, name: worker.name, skills: worker.skills, maxHours, outletIds };
}

export async function loadWeekState(weekId: number) {
  const db = getDb();
  const ws = await getWorkspace();
  const [week] = await db.select().from(schema.weeks).where(eq(schema.weeks.id, weekId));
  if (!week) throw new Error(`Week ${weekId} not found`);
  const outlets = await getOutlets();
  const shifts = await db.select().from(schema.shifts).where(eq(schema.shifts.weekId, weekId)).orderBy(schema.shifts.date, schema.shifts.start);
  const workers = await db.select().from(schema.workers).where(eq(schema.workers.active, true)).orderBy(schema.workers.id);
  const workerOutletLinks = await db.select().from(schema.workerOutlets);
  const avail = await db.select().from(schema.availability).where(eq(schema.availability.weekId, weekId));
  const shiftIds = shifts.map((s) => s.id);
  const assignments = shiftIds.length
    ? await db
        .select()
        .from(schema.assignments)
        .where(and(inArray(schema.assignments.shiftId, shiftIds), eq(schema.assignments.status, "active")))
    : [];

  const availability = new Map<string, AvailabilityStatus>();
  for (const a of avail) availability.set(availabilityKey(a.workerId, a.shiftId), a.status);

  const outletById = new Map(outlets.map((outlet) => [outlet.id, outlet]));
  const solverShifts = shifts.map((s) => toSolverShift(s, ws.timezone, s.outletId ? outletById.get(s.outletId) : undefined));
  const solverWorkers = workers.map((w) => {
    const outletIds = workerOutletLinks.filter((link) => link.workerId === w.id).map((link) => link.outletId);
    const outletMaxHours = outletIds.map((id) => outletById.get(id)?.rules.maxHoursPerWeek).filter((hours): hours is number => typeof hours === "number");
    return toSolverWorker(w, ws.rules, week, outletIds, outletMaxHours);
  });
  const shiftById = new Map(solverShifts.map((s) => [s.id, s]));

  return { ws, week, outlets, outletById, shifts, workers, availability, assignments, solverShifts, solverWorkers, shiftById };
}

export type WeekState = Awaited<ReturnType<typeof loadWeekState>>;
