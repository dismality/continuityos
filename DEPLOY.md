# Run ContinuityOS as a real app

The public demo on Cloudflare is a simulation in the browser. The real app is a server that:

- runs the Telegram bot around the clock (staff text it, the agent works, the dashboard shows the same chats),
- saves timetables, chats, notices and logs in a database, so nothing is lost on restart,
- asks the manager for a password before showing the dashboard,
- gives staff a public leave link (`/live/leave`) that shows only names and shifts.

```
Staff's phone ⇄ Telegram ⇄ ContinuityOS server (Render) ⇄ Manager's dashboard (/live)
                                   │
                                   └ Postgres (Neon): saved state
```

Everything below is free. It takes about 20 minutes.

## 1. Database (Neon)
1. Sign up at **neon.tech** and create a project (region: Singapore if offered).
2. Copy the **connection string** (starts with `postgres://`). Keep it private.

## 2. Server (Render)
1. Sign up at **render.com** with your GitHub account.
2. **New → Blueprint**, pick the `continuityos` repo. Render reads `render.yaml`.
3. Fill in the settings it asks for:
   | Setting | What to put |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | the token from @BotFather |
   | `DATABASE_URL` | the Neon connection string |
   | `DASHBOARD_PASSWORD` | a password for the manager dashboard |
   | `LIVE_PUBLIC_URL` | leave empty for now |
   | `OPENROUTER_API_KEY` | optional |
4. Click **Apply**. The first build takes a few minutes.
5. Copy your app's address from the top of the Render page (e.g. `https://continuityos.onrender.com`).
6. **Environment → `LIVE_PUBLIC_URL`** = that address → **Save**. Render restarts the app and the bot switches to webhooks.

## 3. Use it
- Manager: open `https://<your-app>.onrender.com/live`. The browser asks for a password: any username, your `DASHBOARD_PASSWORD`.
- Staff: scan the QR code on the dashboard, press **Start** in Telegram. Then text it like a person: "fever, can't come in", "can't make it Saturday", or send `/leave`.
- Leave link for staff: `https://<your-app>.onrender.com/live/leave`.

## Good to know
- **One bot, one server.** While the hosted app runs, don't also run `npm run dev` with the same bot token on your laptop: the laptop would take the bot over. Use a second bot from @BotFather for laptop testing.
- **Free plan sleeps** after about 15 minutes without visitors. A Telegram message or opening the dashboard wakes it (the first reply can take ~30–50 seconds). Because state is saved in Neon, nothing is lost.
- **Reset** under Demo controls starts a fresh day; joined phones stay joined.
