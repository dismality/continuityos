import { z } from "zod";
import { answerCallback, clearButtons, deleteWebhook, getMe, getUpdates, sendTelegram, telegramEnabled, type TgUpdate } from "@/integrations/telegram";
import { llmJson } from "@/integrations/llm";
import { env } from "@/lib/env";
import { parseGoal, parseReply, toHour } from "./parse.ts";
import { Runtime, type Understanding } from "./runtime.ts";
import { BUSINESS, fmtWindow } from "./scenario.ts";
import type { ParsedReply } from "./types.ts";

/**
 * Server-side Live Mode: one in-memory session per server process. No database needed.
 * Telegram via long polling (works behind NAT, no tunnel) or the optional webhook route.
 */

const ReplySchema = z.object({
  intent: z.enum(["accept", "partial", "conditional", "decline", "ask_who", "ask_pay", "ask_where", "question", "human", "withdraw", "cannot_work", "on_way", "unclear"]),
  start: z.string().nullable().describe("HH:MM 24h start of the hours they can work, if they limited it"),
  end: z.string().nullable().describe("HH:MM 24h end of the hours they can work, if they limited it"),
  transport: z.boolean().describe("They need a ride / taxi / transport"),
  premium: z.boolean().describe("They ask for overtime or extra pay"),
  confidence: z.number().min(0).max(1),
});

const llmUnderstanding: Understanding = {
  async reply(text, asked, crew) {
    const fallback = parseReply(text, asked);
    if (!env.openrouterKey) return fallback;
    try {
      const { data } = await llmJson({
        name: "shift_reply",
        schema: ReplySchema,
        effort: "none",
        system:
          "You read a part-time worker's chat reply to a shift-cover request and classify it. accept = yes to the whole window asked; partial = yes but only some hours; conditional = yes if a ride or extra pay is given; ask_who = asks who is absent or why; human = wants to talk to the manager or a person; withdraw = takes back an earlier yes; cannot_work = says they are sick or cannot come in for their own shift; on_way = says they are coming or running late; unclear = cannot tell. Be calibrated: use low confidence when unsure.",
        user: JSON.stringify({ asked_window: fmtWindow(asked), worker: crew.name, reply: text }),
      });
      const s = data.start ? toHour(data.start) : null;
      const e = data.end ? toHour(data.end) : null;
      const window = s != null || e != null ? { start: Math.max(asked.start, s ?? asked.start), end: Math.min(asked.end, e ?? asked.end) } : undefined;
      const parsed: ParsedReply = { intent: data.intent, window: window && window.end > window.start ? window : undefined, transport: data.transport, premium: data.premium, confidence: data.confidence, via: "llm" };
      if (parsed.confidence < 0.6 && fallback.confidence >= 0.8 && fallback.intent === parsed.intent) return fallback;
      return parsed;
    } catch {
      return fallback;
    }
  },
  async goal(text) {
    return parseGoal(text); // deterministic: the assumptions it surfaces are part of the demo
  },
};

type Meta = { bot?: string; joinUrl?: string; managerUrl?: string; autoplay: boolean; llm: boolean };

class LiveServer {
  rt: Runtime;
  bot?: string;
  private offset = 0;
  private polling = false;

  constructor() {
    const code = Math.random().toString(36).slice(2, 6).toUpperCase();
    this.rt = new Runtime(
      { mode: "server", code, telegram: { enabled: telegramEnabled() } },
      telegramEnabled()
        ? {
            send: async (chatId, text, buttons) => {
              const id = await sendTelegram(chatId, text, buttons);
              return { ok: true, evidence: `Telegram message_id ${id} · chat …${String(chatId).slice(-4)}` };
            },
          }
        : undefined,
      llmUnderstanding,
    ).start();
    // pretend staff answer by themselves, so real people on Telegram see the agent finish its work;
    // the presenter can switch this off under Demo controls
    this.rt.autoplay = true;
    if (telegramEnabled()) void this.boot();
  }

  meta(): Meta {
    const code = this.rt.state.code;
    return {
      bot: this.bot,
      joinUrl: this.bot ? `https://t.me/${this.bot}?start=${code}` : undefined,
      managerUrl: this.bot ? `https://t.me/${this.bot}?start=mgr-${code}` : undefined,
      autoplay: this.rt.autoplay,
      llm: Boolean(env.openrouterKey),
    };
  }

  private async boot() {
    try {
      const me = await getMe();
      this.bot = me.username;
      this.rt.state = { ...this.rt.state, telegram: { enabled: true, bot: me.username } };
      if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
        await deleteWebhook();
        void this.poll();
      }
    } catch (e) {
      this.rt.state = { ...this.rt.state, telegram: { enabled: false, error: (e as Error).message } };
    }
  }

  private async poll() {
    if (this.polling) return;
    this.polling = true;
    while (this.polling) {
      try {
        const updates = await getUpdates(this.offset);
        for (const u of updates) {
          this.offset = u.update_id + 1;
          await this.handle(u).catch((e) => console.error("[live] update failed", e));
        }
      } catch (e) {
        console.error("[live] getUpdates", (e as Error).message);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  async handle(u: TgUpdate) {
    const rt = this.rt;
    if (u.callback_query) {
      const q = u.callback_query;
      const chatId = q.message?.chat.id;
      const [kind, id, action] = (q.data ?? "").split(":");
      if (kind === "r") {
        const crew = rt.state.crew.find((c) => c.id === id);
        if (crew?.seat?.kind === "telegram" && crew.seat.chatId === chatId) rt.button(id, action);
      } else if (kind === "l") {
        // calendar tap: l:<crewId>:<YYYY-MM-DD>; the agent works out whether it's today, tomorrow or later
        const crew = rt.state.crew.find((c) => c.id === id);
        if (crew?.seat?.kind === "telegram" && crew.seat.chatId === chatId && /^\d{4}-\d{2}-\d{2}$/.test(action)) rt.dispatch({ type: "leave", crewId: id, day: "later", date: action, via: "leave_link" });
      } else if (kind === "g" && chatId && chatId === rt.state.manager.chatId) {
        rt.dispatch({ type: "decide", gateId: id, approve: action === "1", via: "telegram" });
      }
      await answerCallback(q.id, "Got it");
      if (chatId && q.message) await clearButtons(chatId, q.message.message_id);
      return;
    }
    const m = u.message;
    if (!m) return;
    const chatId = m.chat.id;
    const handle = m.from?.username ? `@${m.from.username}` : (m.from?.first_name ?? "guest");
    const text = (m.text ?? "").trim();

    if (text.startsWith("/start")) {
      const payload = text.split(/\s+/)[1] ?? "";
      if (payload.toLowerCase().startsWith("mgr-")) rt.dispatch({ type: "manager_join", chatId, handle });
      else rt.dispatch({ type: "join", chatId, handle });
      return;
    }
    if (chatId === rt.state.manager.chatId) {
      if (m.voice) {
        await sendTelegram(chatId, "I can't transcribe voice notes in this build yet. Please type the request.");
        return;
      }
      const to = text.match(/^@?(\w+)[:,]\s*([\s\S]+)$/);
      const target = to && rt.state.crew.find((c) => c.name.toLowerCase() === to[1].toLowerCase());
      if (target && to) {
        rt.dispatch({ type: "manager_say", crewId: target.id, text: to[2] });
        return;
      }
      if (/^(back|hand back|resume)\s+(\w+)/i.test(text)) {
        const name = text.split(/\s+/).pop()!;
        const c = rt.state.crew.find((x) => x.name.toLowerCase() === name.toLowerCase());
        if (c) rt.dispatch({ type: "takeover", crewId: c.id, on: false });
        return;
      }
      if (rt.state.phase === "lobby") await rt.goal(text);
      else await sendTelegram(chatId, `A recovery is running. To message someone write "Jun: your message". To hand them back to me write "back Jun".`);
      return;
    }
    const crew = rt.state.crew.find((c) => c.seat?.kind === "telegram" && c.seat.chatId === chatId);
    if (crew && /^\/leave\b/i.test(text)) {
      const base = process.env.LIVE_PUBLIC_URL?.replace(/\/$/, "");
      await sendTelegram(chatId, base ? `Can't make a shift? Use the leave link: ${base}/live/leave\n\nOr just tell me here, e.g. "can't make it tmr".` : `Can't make a shift? Just tell me here, e.g. "can't make it tmr", and I'll arrange cover early.`);
      return;
    }
    if (crew) {
      if (!text) return;
      await rt.inbound(crew.id, text);
      return;
    }
    await sendTelegram(chatId, `Hi! Tap the link on the screen (or send /start) to join the ${BUSINESS.name} crew.`);
  }
}

const g = globalThis as unknown as { __continuityLive?: LiveServer };

export function live(): LiveServer {
  if (!g.__continuityLive) g.__continuityLive = new LiveServer();
  return g.__continuityLive;
}
