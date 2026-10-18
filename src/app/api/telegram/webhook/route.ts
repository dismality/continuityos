import type { TgUpdate } from "@/integrations/telegram";
import { live } from "@/live/server.ts";

/**
 * Optional: set TELEGRAM_WEBHOOK_SECRET and register this URL with setWebhook when the app is
 * deployed publicly. Without the secret the server long-polls Telegram instead (no tunnel needed).
 */
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) return new Response("forbidden", { status: 403 });
  const update = (await request.json()) as TgUpdate;
  await live().handle(update);
  return Response.json({ ok: true });
}
