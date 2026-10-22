import { applyAction } from "@/live/actions.ts";
import { live } from "@/live/server.ts";

/**
 * Public endpoint behind the staff leave link. Staff see only names, roles and who works which slot,
 * never chats, logs or reasons, and can only report a day they can't work.
 */
export const dynamic = "force-dynamic";

function view() {
  const s = live().rt.state;
  return {
    businessId: s.businessId,
    mode: s.mode,
    crew: s.crew.map((c) => ({ id: c.id, name: c.name, role: c.role, onLeave: c.onLeave })),
    slots: s.slots.map((sl) => ({ id: sl.id, role: sl.role, window: sl.window, assignments: sl.assignments.map((a) => ({ crewId: a.crewId })) })),
    tomorrow: s.tomorrow.map((sl) => ({ id: sl.id, role: sl.role, window: sl.window, assignments: sl.assignments.map((a) => ({ crewId: a.crewId })) })),
    usual: s.usual,
    notices: s.notices.map((n) => ({ crewId: n.crewId, date: n.date, day: n.day })),
  };
}

export async function GET() {
  await live().ready;
  return Response.json(view(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { crewId?: string; day?: string; date?: string } | null;
  if (!body?.crewId) return Response.json({ ok: false, error: "Choose your name" }, { status: 400 });
  const server = live();
  await server.ready;
  const day = body.day === "tomorrow" ? "tomorrow" : body.day === "later" ? "later" : "today";
  const r = await applyAction(server.rt, { action: "leave", crewId: body.crewId, day, date: body.date });
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
