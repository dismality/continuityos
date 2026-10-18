import { applyAction, type LiveAction } from "@/live/actions.ts";
import { live } from "@/live/server.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const server = live();
  const since = Number(new URL(request.url).searchParams.get("since") ?? -1);
  const state = server.rt.state;
  if (since === state.version) return new Response(null, { status: 204 });
  return Response.json({ state, meta: server.meta() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as LiveAction | null;
  if (!body?.action) return Response.json({ ok: false, error: "missing action" }, { status: 400 });
  const server = live();
  const result = await applyAction(server.rt, body);
  return Response.json({ ...result, state: server.rt.state, meta: server.meta() }, { status: result.ok ? 200 : 400 });
}
