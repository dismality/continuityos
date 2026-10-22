# Telegram bot preview (branch `telegram-preview`)

This branch is a preview of the real Telegram bot. It is **not merged into `main`**, so the public demo site is unchanged.

## The idea

Staff never install an app. They chat with one Telegram bot, the same chat the agent already uses:

| Staff do this in Telegram | What the agent does |
|---|---|
| Text "fever, can't make it today" in their own words | Understands it's a sick call, takes them off today's timetable, messages the right replacements, confirms one, tells the manager once |
| Text "can't make it tmr" | Takes them off **tomorrow's** timetable and arranges cover the day before |
| Send **/leave** | Gets a tap-to-pick calendar (today + next 7 days). Tapping a day reports it, no reason needed |
| Send **/shift** | Sees when they're working today and tomorrow |
| Send **/help** | Gets a short explanation |
| Reply "yes", "only after 7", "need a ride"… to an offer | The agent understands partial and conditional answers and rebuilds the plan |

The manager's dashboard (`/live`) shows every message, the timetable changing and the logs, live.

## Run it on your laptop (about 10 minutes)

The bot needs a server that stays on, so it runs on your laptop during the demo (the Cloudflare site can't host it).

1. **Create the bot.** In Telegram, message **@BotFather**, send `/newbot`, pick a name and a username ending in `bot`. Copy the token it gives you. Never paste the token in a chat or commit it.
2. **Get this branch.** In your `continuityos` folder:
   ```bash
   git fetch
   git checkout telegram-preview
   npm install
   ```
3. **Add the token.** Copy `.env.example` to `.env.local` and set:
   ```
   TELEGRAM_BOT_TOKEN=paste-your-token-here
   ```
   Optional: `OPENROUTER_API_KEY` so the AI reads very messy replies better (it works without one).
4. **Start it.**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000/live. The header should say "Telegram @yourbot".
5. **Join as staff.** Scan the QR code on the page (or open the `t.me/...` link under it) on your phone and press **Start**. The first person to join plays the evening lead who calls in sick; everyone after plays staff the agent can ask. Friends can join on their phones too.
6. **Try it.**
   - As the first person: text *"so sorry, fever, can't make tonight's close"* and watch the dashboard.
   - As anyone: send `/leave`, tap a day, and watch "Tomorrow & leave" on the dashboard.
   - Send `/shift` and `/help`.
7. **Go back to the normal version** any time with `git checkout main`.

## Notes
- Long polling is used, so no tunnel or webhook is needed while it runs on your laptop.
- Data is kept in memory; restarting `npm run dev` starts a fresh day.
- Reasons for absence are never stored or shown to other staff.
