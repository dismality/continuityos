import type { Button } from "@/live/types.ts";

/** Minimal Telegram Bot API client. Docs: https://core.telegram.org/bots/api */

const token = () => process.env.TELEGRAM_BOT_TOKEN?.trim();
export const telegramEnabled = () => Boolean(token());

type TgResult<T> = { ok: boolean; result?: T; description?: string; error_code?: number };

async function call<T>(method: string, body?: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }))) as TgResult<T>;
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`);
  return json.result as T;
}

export async function getMe() {
  return call<{ id: number; username: string; first_name: string }>("getMe");
}

const keyboard = (buttons?: Button[]) =>
  buttons?.length ? { inline_keyboard: buttons.map((b) => [{ text: b.label, callback_data: b.data.slice(0, 64) }]) } : undefined;

export async function sendTelegram(chatId: number, text: string, buttons?: Button[]) {
  const base = { chat_id: chatId, text, reply_markup: keyboard(buttons), link_preview_options: { is_disabled: true } };
  try {
    const r = await call<{ message_id: number }>("sendMessage", { ...base, parse_mode: "Markdown" });
    return r.message_id;
  } catch (e) {
    // a stray "_" or "*" breaks Markdown; resend as plain text rather than failing
    if (!/parse entities/i.test((e as Error).message)) throw e;
    const r = await call<{ message_id: number }>("sendMessage", { ...base, text: text.replace(/\*/g, "") });
    return r.message_id;
  }
}

export async function answerCallback(id: string, text?: string) {
  await call("answerCallbackQuery", { callback_query_id: id, text }).catch(() => undefined);
}

export async function clearButtons(chatId: number, messageId: number) {
  await call("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
}

export type TgUpdate = {
  update_id: number;
  message?: { message_id: number; chat: { id: number }; from?: { first_name?: string; username?: string }; text?: string; voice?: unknown };
  callback_query?: { id: string; data?: string; from: { first_name?: string; username?: string }; message?: { message_id: number; chat: { id: number } } };
};

export async function getUpdates(offset: number) {
  return call<TgUpdate[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] }, 35_000);
}

export async function deleteWebhook() {
  await call("deleteWebhook", { drop_pending_updates: false }).catch(() => undefined);
}
