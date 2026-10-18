# ContinuityOS (built from ShiftPilot)

ContinuityOS is an autonomous disruption manager for multi-outlet businesses. When unexpected absences threaten service, it assesses customer and revenue impact, checks worker qualifications and fairness, negotiates availability, adapts when conditions change, requests approval, and verifies the resulting updates across workplace systems.

The original ShiftPilot scheduling application remains in the repository. The hackathon-ready, database-free ContinuityOS experience is available at `/demo`.

## Live Mode: the judges are the crew (`/live`)

The headline demo. A database-free session where real people join from their phones, the agent negotiates with them over Telegram, and the projector shows every step.

### What the room sees

1. **Join.** `/live` shows a QR code. Each judge who scans it gets a crew seat (Daniel, Farah, Mei, Jun, Priya), filled in rank order. Empty seats are played by simulated phones on screen.
2. **Goal.** The manager sends one message, from Telegram or the box on screen: *"Aisha's sick, sort out tonight's close, keep extras under $150."* The agent shows what it understood and any assumptions it made.
3. **Rules and ranking.** Four people are excluded, each with a reason (weekly hour cap, rest before an opening shift, no food-safety certificate, on leave). Tap any node for "Why not?".
4. **Approval gate 1.** Nothing is sent until the manager taps Approve.
5. **Parallel negotiation.** Offers go out, and judges reply in their own words: "only after 7, need a grab", "who called in sick?", "can I talk to the manager?". The agent parses each reply with a confidence score. It never reveals who is absent. It asks again when unsure, and pauses for a human when asked. It re-plans after every reply, so a partial yes turns into a split shift and the next people are asked only for the gap. Non-responders get one reminder and are then skipped.
6. **Approval gate 2.** The full package (who, when, extra spend against the budget) goes to the manager's phone with Approve / Reject buttons.
7. **Execute and verify.** The roster is published, the chosen people are confirmed and everyone else is released. Each confirmation carries a Telegram `message_id` as a delivery receipt.
8. **Before / after.** Measured elapsed time and manager taps, against your manual baseline.

**Break it live:** the presenter bar's *Break messaging* button makes every send fail. The agent retries with backoff and marks people unreachable after 3 attempts. It then moves on to the next person, and recovers once messaging is restored. Everything lands in the audit trail, which you can export as JSON.

### Run it

```bash
npm install
# 1. Create a bot: message @BotFather on Telegram → /newbot → copy the token
echo "TELEGRAM_BOT_TOKEN=123456:ABC..." >> .env.local
# 2. Optional: better understanding of free-text replies
echo "OPENROUTER_API_KEY=..." >> .env.local
npm run dev
```

- Projector: `http://localhost:3000/live`
- Manager phone: `http://localhost:3000/live/manager`. Alternatively, the presenter opens `https://t.me/<bot>?start=mgr-<CODE>` (the code is in the join link) to become the manager inside Telegram, where approvals arrive as buttons.
- Rehearsal with no bot, no keys and no network: `http://localhost:3000/live?rehearsal=1`, or `npm run build:rehearsal` for a single offline HTML file.

The server long-polls Telegram, so it works from a laptop on venue Wi-Fi with no tunnel. To deploy publicly instead, set `TELEGRAM_WEBHOOK_SECRET` and register `https://<host>/api/telegram/webhook` with `setWebhook`.

Before the pitch: replace the "before" numbers (45 min, 23 messages, 3 apps) in `src/live/scenario.ts` → `DEFAULT_BASELINE` with what a real manager tells you. Everything in `BUSINESS` and the crew list can be edited too.

### How it's built

| Piece | File |
| --- | --- |
| Agent as a pure state machine `(state, event) → (state, effects)` | `src/live/engine.ts` |
| Hard rules, ranking, split-shift optimiser | `src/live/planner.ts` |
| Reply and goal understanding (deterministic; LLM used when a key is set) | `src/live/parse.ts`, `src/live/server.ts` |
| Effect runner: Telegram sends, receipts, retries, simulated phones | `src/live/runtime.ts` |
| Telegram Bot API client | `src/integrations/telegram.ts` |
| Projector and manager UIs | `src/live/ui/` |
| Tests | `tests/live.test.mts` |

## ContinuityOS demonstration

```bash
npm install
npm run dev
```

Open `http://localhost:3000/demo`, then follow the on-screen flow:

1. Delegate the outcome-driven recovery goal.
2. Let the agent assess impact and start worker negotiation.
3. Edit the hourly staffing timetable manually by changing demand, required headcount, workers, or rows.
4. Open Worker communications, choose WhatsApp, Telegram, or SMS, and let the AI start the shift conversation.
5. Demonstrate the worker quick replies: accept, decline, or request a real person. Accepted replies update the timetable; human requests pause the AI.
6. Introduce the surprise: a candidate declines while demand rises, and accepted workers are inserted into the timetable automatically.
7. Compare the recalculated recovery plans.
8. Approve one plan before any consequential action occurs.
9. Execute, verify, and download the evidence trail.

The demo uses explicit sandbox connectors so it never claims that a real worker was messaged. Every simulated tool action produces a receipt in the audit trail.

## Original ShiftPilot application

A WhatsApp agent that staffs a week of part-time shifts: it asks everyone for availability, chases non-responders, builds the roster, and finds cover when someone calls in sick. The manager approves before anything is sent or published.

## How it works

| Layer | Does | Where |
| --- | --- | --- |
| Deterministic code | Reminder timers, constraint solver (coverage, skills, hour caps, rest, fairness), replacement ranking, approval policy, privacy rules | `src/agent/solver.ts`, `ranking.ts`, `tick.ts`, `cover.ts` |
| Jev (TypeSafe, via OpenRouter) | Reads worker messages: intent, per-shift availability, which shift a sick call refers to, health mentions. Returns calibrated confidence | `src/agent/understand.ts` |
| GPT-6 Sol (via OpenRouter) | Turns the manager's goal into constraints, second opinion when Jev is unsure, explains the roster, drafts options when nobody can cover | `weekly.ts`, `cover.ts` |
| WhatsApp Cloud API | Messages, reply buttons, delivery receipts, 24-hour-window handling | `src/integrations/whatsapp.ts`, `src/agent/outbox.ts` |
| Google Sheets (optional) | Publishes the roster to a shared sheet | `src/integrations/sheets.ts` |

Approval gates: messaging the team, publishing the roster, any overtime offer, and what to do when nobody can cover. Replacement offers within everyone's limits are pre-approved (toggle in Settings). Shift offers never say who dropped out or why.

Everything the agent observes and does is written to the audit log (`/activity`), including Jev probabilities and costs.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in values, see below
npm run db:push              # creates tables
npm run dev                  # http://localhost:3000
```

In a second terminal, expose the webhook (install once with `winget install --id Cloudflare.cloudflared`):

```bash
npm run tunnel               # prints https://<random>.trycloudflare.com
```

### WhatsApp Cloud API

1. In your Meta developer app, open **WhatsApp → API Setup**. Copy the **Phone number ID** (not the phone number) into `WHATSAPP_PHONE_NUMBER_ID`.
2. Add your 3 test phones under **To → Manage phone number list** and verify each one.
3. Create a permanent token (Business Settings → System users → Generate token, with `whatsapp_business_messaging` and `whatsapp_business_management`) and put it in `WHATSAPP_ACCESS_TOKEN`. The temporary token on API Setup expires in 24h.
4. **App settings → Basic → App secret** goes into `WHATSAPP_APP_SECRET`.
5. **WhatsApp → Configuration → Webhook**: callback `https://<tunnel>/api/whatsapp/webhook`, verify token = your `WHATSAPP_VERIFY_TOKEN`. Subscribe to the `messages` field.
6. Add the same three numbers as workers on `/workers` (with country code).

Meta only allows free-form messages within 24 hours of the worker's last message. Outside that window ShiftPilot sends the template in `WHATSAPP_TEMPLATE_NAME` (default `hello_world`) and queues the real message until the worker replies. For a smoother demo, create a Utility template such as `shiftpilot_update` with body `ShiftPilot update: {{1}}`, then set `WHATSAPP_TEMPLATE_NAME=shiftpilot_update` and `WHATSAPP_TEMPLATE_HAS_BODY_PARAM=true`.

The project's `.cursor/mcp.json` registers Meta's WhatsApp Business Tools MCP, which can list numbers, create that template, and configure the webhook from Cursor after you sign in.

## Demo script

For a database-free preview of the stronger multi-outlet recovery experience, run `npm run dev` and open `http://localhost:3000/demo`. Click through the disruption stages to see the agent re-rank plans after a worker declines and demand changes.

1. `/workers`: add the 3 real phones, then **Add simulated workers** to fill out the roster.
2. `/`: type a goal, e.g. *"Staff next week. We're closed Monday, and weekend closing shifts need 3 people."* Show how the agent read it, then **Approve** messaging.
3. On the phones: reply in free text ("mornings tue-thu, not fri, weekends anything"). Leave one phone silent.
4. Header clock: **+12h** twice, so the silent worker gets two reminders and is then flagged.
5. Review the roster and summary, then **Approve** publishing. Everyone gets their shifts.
6. Move the clock to the day before a real worker's shift. From that phone: *"sorry cant come tmr, got fever"*. The agent releases the shift, ranks replacements, and offers it (with buttons) to the next person without mentioning who or why.
7. Decline on one phone, accept on another. Show the timeline on `/activity` and the numbers in **Value so far**.

No phones handy? The **Test console** on `/workers` sends a message through the same pipeline.

## Checks

```bash
npm test                 # solver + ranking unit tests
npm run typecheck
npx tsx scripts/e2e.ts   # full scenario against DATABASE_URL (resets demo data; uses OpenRouter)
```
