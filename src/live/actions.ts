import type { Runtime } from "./runtime.ts";
import type { Baseline, Settings } from "./types.ts";

/** Everything the projector and manager phone can ask for. Same shape locally and over HTTP. */
export type LiveAction =
  | { action: "goal"; text: string }
  | { action: "decide"; gateId: string; approve: boolean; via?: "projector" | "phone" }
  | { action: "failure"; on: boolean }
  | { action: "reset" }
  | { action: "no_show"; crewId: string }
  | { action: "assign"; slotId: string; crewId: string | null }
  | { action: "offer_to"; crewId: string }
  | { action: "ai_toggle"; crewId: string; on: boolean }
  | { action: "takeover"; crewId: string; on: boolean }
  | { action: "say"; crewId: string; text: string }
  | { action: "sim_reply"; crewId: string; text: string }
  | { action: "sim_button"; crewId: string; button: string }
  | { action: "autoplay"; on: boolean }
  | { action: "settings"; settings: Partial<Settings> }
  | { action: "baseline"; baseline: Partial<Baseline> }
  | { action: "business"; id: string }
  | { action: "leave"; crewId: string; day: "today" | "tomorrow" }
  | { action: "checkin_tomorrow" };

export async function applyAction(rt: Runtime, a: LiveAction): Promise<{ ok: boolean; error?: string }> {
  const simSeat = (id: string) => {
    const c = rt.state.crew.find((x) => x.id === id);
    return c && c.seat?.kind !== "telegram";
  };
  switch (a.action) {
    case "goal":
      if (!a.text?.trim()) return { ok: false, error: "empty goal" };
      await rt.goal(a.text.trim().slice(0, 500));
      return { ok: true };
    case "decide":
      rt.dispatch({ type: "decide", gateId: a.gateId, approve: !!a.approve, via: a.via ?? "projector" });
      return { ok: true };
    case "failure":
      rt.dispatch({ type: "failure", on: !!a.on });
      return { ok: true };
    case "reset":
      rt.dispatch({ type: "reset" });
      return { ok: true };
    case "no_show":
      rt.dispatch({ type: "no_show", crewId: a.crewId });
      return { ok: true };
    case "assign":
      rt.dispatch({ type: "assign", slotId: a.slotId, crewId: a.crewId ?? null });
      return { ok: true };
    case "offer_to":
      rt.dispatch({ type: "offer_to", crewId: a.crewId });
      return { ok: true };
    case "ai_toggle":
      rt.dispatch({ type: "ai_toggle", crewId: a.crewId, on: !!a.on });
      return { ok: true };
    case "takeover":
      rt.dispatch({ type: "takeover", crewId: a.crewId, on: !!a.on });
      return { ok: true };
    case "say":
      if (!a.text?.trim()) return { ok: false, error: "empty message" };
      rt.dispatch({ type: "manager_say", crewId: a.crewId, text: a.text.trim().slice(0, 500) });
      return { ok: true };
    case "sim_reply":
      // only simulated seats can be typed for: real people answer on their own phones
      if (!simSeat(a.crewId)) return { ok: false, error: "That crew member is a real person on Telegram" };
      await rt.inbound(a.crewId, a.text.slice(0, 500));
      return { ok: true };
    case "sim_button":
      if (!simSeat(a.crewId)) return { ok: false, error: "That crew member is a real person on Telegram" };
      rt.button(a.crewId, a.button);
      return { ok: true };
    case "autoplay":
      rt.autoplay = !!a.on;
      return { ok: true };
    case "settings":
      rt.dispatch({ type: "settings", settings: a.settings });
      return { ok: true };
    case "baseline":
      rt.dispatch({ type: "baseline", baseline: a.baseline });
      return { ok: true };
    case "business":
      rt.dispatch({ type: "business", id: String(a.id) });
      return { ok: true };
    case "leave":
      if (!rt.state.crew.some((c) => c.id === a.crewId)) return { ok: false, error: "Unknown staff member" };
      rt.dispatch({ type: "leave", crewId: a.crewId, day: a.day === "tomorrow" ? "tomorrow" : "today", via: "leave_link" });
      return { ok: true };
    case "checkin_tomorrow":
      rt.dispatch({ type: "checkin_tomorrow" });
      return { ok: true };
    default:
      return { ok: false, error: "unknown action" };
  }
}
