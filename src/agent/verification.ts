import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit } from "./audit";

/** Reads the roster back after a write and records what the database actually contains. */
export async function verifyRosterUpdate(weekId: number, reason: string): Promise<void> {
  const db = getDb();
  const shifts = await db.select().from(schema.shifts).where(eq(schema.shifts.weekId, weekId));
  const shiftIds = shifts.map((shift) => shift.id);
  const assignments = shiftIds.length
    ? await db.select().from(schema.assignments).where(inArray(schema.assignments.shiftId, shiftIds))
    : [];
  const active = assignments.filter((assignment) => assignment.status === "active");
  const required = shifts.reduce((total, shift) => total + shift.requiredCount, 0);
  const outletIds = new Set(shifts.map((shift) => shift.outletId).filter((id): id is number => id !== null));

  await audit({
    actor: "system",
    tool: "verification",
    action: "roster.verified",
    summary: "Verified roster update: " + active.length + "/" + required + " active assignments across " + (outletIds.size || 1) + " outlet(s).",
    details: { reason, shiftCount: shifts.length, activeAssignments: active.length, requiredAssignments: required, outletIds: [...outletIds] },
    weekId,
  });
}

/** Reads an outbound message back after each state change and records the observed delivery state. */
export async function verifyMessageUpdate(messageId: number, weekId?: number | null, incidentId?: number | null): Promise<void> {
  const [message] = await getDb().select().from(schema.messages).where(eq(schema.messages.id, messageId));
  if (!message) {
    await audit({
      actor: "system",
      tool: "verification",
      action: "message.verification_failed",
      summary: "Could not verify message #" + messageId + ": record missing.",
      details: { messageId },
      weekId,
      incidentId,
    });
    return;
  }
  const final = ["simulated", "delivered", "read", "failed"].includes(message.status);
  await audit({
    actor: "system",
    tool: "verification",
    action: final ? "message.verified" : "message.pending_verification",
    summary: "Verified message #" + message.id + ": " + message.status + ".",
    details: { messageId: message.id, observedStatus: message.status, providerMessageId: message.waMessageId ?? null, error: message.error ?? null },
    weekId,
    incidentId,
  });
}
