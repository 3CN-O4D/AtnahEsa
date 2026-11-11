# AseHanta WhatsApp bot (Baileys)

Ase answers WhatsApp DMs on the official AseHanta number using **exactly the
same brain as the website** — same NVIDIA-powered prompt, same house search,
same WiFi/mover/house-request flows, same stats, same `notify_admin` escalation.

```
WhatsApp DM
   │
   ▼
Baileys worker (this folder, long-running Node process)
   │  POST /api/whatsapp/chat   (shared secret)
   ▼
Next.js app on Vercel → src/lib/chat/engine.ts → NVIDIA Nemotron + Supabase tools
   │
   ▼
Reply bubbles + listing cards sent back over WhatsApp
```

## ⚠️ Where it runs

The **brain** (`src/app/api/whatsapp/chat/route.ts`) runs on Vercel. The
**Baileys worker** cannot: Baileys holds a persistent WebSocket to WhatsApp and
keeps Signal keys in memory, while Vercel functions are short-lived and
stateless. Run this folder on any always-on host:

- Railway / Render / Fly.io (Dockerfile included)
- a small VPS (`pm2 start index.mjs --name asehanta-whatsapp`)
- a spare machine at the office

Pairing persists in Supabase, so restarts and redeploys never need a new QR
scan. If you ever need a 100% Vercel-only setup, that requires the official
Meta WhatsApp Cloud API (webhook-based) instead of Baileys.

## 1. Database

Run all three migrations on the production database:

```bash
supabase/migration-whatsapp.sql
supabase/migration-chat-handoff.sql
supabase/migration-whatsapp-outbox.sql
supabase/migration-whatsapp-control.sql
```

They create:

| Table | Purpose |
| --- | --- |
| `whatsapp_auth` | Baileys Signal credentials (one row per key) |
| `whatsapp_sessions` | flow state + last 12 messages per chat, `last_message_id` for dedupe, `ai_enabled` / `handoff_at` for human takeover |
| `chat_handoffs` | single-use web ⇄ WhatsApp hand-off tokens (state + history, 24h expiry) |
| `whatsapp_outbox` | queued WhatsApp copies of emails, OTPs and receipt PDFs |
| `whatsapp_bot_control` | singleton: pause, allow/block lists, marketing cadence |
| `whatsapp_messages` | full conversation transcript (120 days) |
| `whatsapp_urgent` | escalation feed for the admin panel |
| `whatsapp_marketing` | approval queue for status/group posts |
| `whatsapp_marketing_groups` | discovered groups, disabled until an admin enables them |
| `whatsapp_control_audit` | who paused, allowed, blocked or approved what |

All have RLS enabled with no policies, so only the service-role key can read
them.

## 2. Vercel environment

Add these to the Next.js project (Production **and** Preview if you test there):

| Variable | Value |
| --- | --- |
| `WHATSAPP_BRIDGE_SECRET` | long random string (same value as the worker) |
| `ADMIN_WHATSAPP_NUMBERS` | optional, comma-separated admin numbers (digits only) that receive a WhatsApp copy of admin emails |
| `WHATSAPP_NOTIFICATIONS` | optional, defaults to `on`; set `off` to stop mirroring emails/OTPs to WhatsApp |

The brain reuses the existing `NVIDIA_API_KEY`, `AI_*` and Supabase variables,
so no extra AI configuration is needed.

## 3. Worker environment

```bash
cd whatsapp
cp env.example .env
```

Fill in:

| Variable | Notes |
| --- | --- |
| `SUPABASE_URL` | `https://ewfyrnxwmqdhlzpcfxxg.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service role — keep on the worker only |
| `CHAT_API_URL` | `https://www.asehanta.com` (or `http://localhost:3000` while developing) |
| `WHATSAPP_BRIDGE_SECRET` | must match Vercel |
| `WHATSAPP_PAIR_NUMBER` | optional, e.g. `254712345678` — prints a pairing code instead of a QR |
| `WHATSAPP_PAIR_TOKEN` | optional secret for `/pair`, `/qr` and `/qr.png`; defaults to `WHATSAPP_BRIDGE_SECRET` |
| `WHATSAPP_SESSION_PREFIX` | optional, defaults to `asehanta`; use another value for a test number |
| `ADMIN_WHATSAPP_NUMBERS` | optional, comma-separated admin numbers (digits only) that get a WhatsApp copy of every request/booking/escalation and can issue bot commands |
| `WHATSAPP_TTS_VOICE` | optional Edge TTS voice for urgent voice notes, defaults to `en-KE-AsiliaNeural` |
| `URGENT_CALL_WEBHOOK` | optional POST target for real phone calls on urgent items |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | optional direct Twilio calling when the webhook is not used |
| `PORT` | health-check port, defaults to `10000` in Docker (Render) and `8080` locally |
| `WHATSAPP_OUTBOX_POLL_MS` | optional, how often to check the outbox, defaults to `3000` |
| `WHATSAPP_OUTBOX_MAX_ATTEMPTS` | optional, delivery attempts before a row is marked failed, defaults to `3` |

## 4. Install and pair

```bash
cd whatsapp
npm install
npm start
```

**QR pairing:** a QR appears in the terminal. On the official AseHanta phone:
WhatsApp → Settings → Linked devices → Link a device → scan it.

**Pairing-code pairing:** set `WHATSAPP_PAIR_NUMBER`, then on the phone:
Linked devices → Link with phone number → enter the 8-character code printed in
the terminal.

Pairing codes are requested **once per socket**, only after the socket is ready.
Do not poll `requestPairingCode` on a timer: each call starts a new companion
handshake and WhatsApp answers `401 Connection Failure`. If a code expires the
socket closes, a new socket is created and a fresh code is printed automatically.

The worker also serves the live pairing state (protected by `WHATSAPP_PAIR_TOKEN`,
which defaults to `WHATSAPP_BRIDGE_SECRET`):

| Endpoint | What it returns |
| --- | --- |
| `GET /pair?token=…` | current code, its age, whether a QR is live, registration state |
| `GET /qr.png?token=…` | the live QR as a scannable 512×512 PNG |
| `GET /pair/new?token=…` | drops the current socket and prints a genuinely fresh code on reconnect |
| `GET /transcript?token=…&phone=…&format=html` | printable conversation view (`txt` or `html`) |

The process prints `connected and ready ✅` when the number is live.
Leave it running (pm2, systemd, Docker, or the host's process manager).

### LID-addressed chats

WhatsApp now addresses most DMs by LID (`…@lid`) instead of phone number.
The worker uses Baileys 7, which persists `lid-mapping` rows and migrates Signal
sessions, and keys every conversation by the sender's phone-number JID
(`senderPn`) so a person has one session regardless of addressing mode.

An LID-addressed *incoming* message can only be decrypted once a Signal session
exists under that LID. That session is created the first time the worker sends to
the person (a reply or any outbox message). If a brand-new contact's very first
message fails to decrypt, send them one message from the worker, then ask them to
send it again — from then on their replies decrypt normally.

## 5. What it can do

Identical to the website bot:

- house search with hard budget filtering and image cards per listing
- single-house lookup by listing id or pasted link (`get_house`), sending up to
  three photos and the full details
- house requests, WiFi bookings, mover requests (saved to Supabase, emailed to
  admins, and — when `ADMIN_WHATSAPP_NUMBERS` is set — texted to the admin team)
- live stats, WiFi packages, movers, contact info, page links
- complaints/escalations via `notify_admin` (email in English to the admin team,
  plus a WhatsApp copy)
- password reset by email OTP
- anything the NVIDIA model can answer from `PLATFORM_KNOWLEDGE`

Account changes that need a signed-in browser session (change email, delete
account, change profile picture) are redirected to
`https://www.asehanta.com/profile`, because the worker has no browser session.
Users can also send `reset` / `start over` to abandon a half-finished flow.

## 5b. Web ⇄ WhatsApp hand-off

Conversations move between channels without starting over:

- **Web → WhatsApp:** the chat panel's WhatsApp button mints a single-use token
  and opens `wa.me` with an `AS-<token>` reference. The worker redeems it,
  restores the engine state and last messages, and carries on.
- **WhatsApp → web:** sending "continue on web" makes the bot reply with
  `https://www.asehanta.com/chat?h=<token>`. The page redeems the token and
  restores the same state + history.

Tokens live in `chat_handoffs`, are single-use, expire after 24 hours, and are
consumed atomically so a link can't be replayed.

## 5c. Email mirroring (outbox)

Email stays the source of truth, but every notification is also delivered over
WhatsApp when the recipient has a phone number on their profile:

- `notifyUser()` → user notification (booking status, request updates, etc.)
- `notifyAdmins()` → admin alert at `ADMIN_WHATSAPP_NUMBERS`
- `sendOtpEmail()` → signup/login/password-reset codes
- `sendPaymentReceiptEmail()` → receipt summary **and the PDF** as a document

The website can't hold a WhatsApp socket, so it writes rows to
`whatsapp_outbox`. The worker polls every few seconds, claims each row
atomically (`pending` → `sending`), sends it, and marks it `sent` or retries up
to three times before `failed`. Media can be a public `media_url` or a small
base64 payload (receipt PDFs).

Set `WHATSAPP_NOTIFICATIONS=off` on Vercel to disable mirroring without touching
the worker. Failures here never break email, OTP or payment flows.

## 5d. Admin control, transcripts and marketing

The bot is controlled from **`/admin/whatsapp`** and from WhatsApp itself. Both
read the singleton `whatsapp_bot_control` row, so a change in the panel takes
effect within seconds without a redeploy.

### WhatsApp commands

Admins (the numbers in `ADMIN_WHATSAPP_NUMBERS`) can send these in a DM to the
bot; the bot's own self-chat works too:

| Command | Effect |
| --- | --- |
| `.pause` / `.start` | stop / resume all AI replies |
| `.status` | connection, allow/block counts, marketing cadence |
| `.allow <phone>` / `.deny <phone>` | allow or block one number |
| `.allowlist` | show both lists |
| `.handover <phone>` / `.ai <phone>` | human takeover / give the chat back to Ase |
| `.chats` | recent conversations |
| `.transcript <phone>` | send the full chat as a `.txt` file |
| `.help` | the command list |

When AI is paused, or a chat is handed over, the customer gets **one** polite
holding message and the admin team is pinged once — never a bot reply, never a
notification loop.

### Human-style replies

`lib/format.mjs` splits the engine reply on blank lines, `---` markers, sentence
boundaries and word boundaries, capped at **10 bubbles**. The worker types each
bubble with a delay proportional to its length, so a reply reads like a person
texting rather than one wall of text.

### Transcripts

Every inbound and outbound message is mirrored into `whatsapp_messages`. Admins
can:

- pull `.txt` over WhatsApp (`.transcript <phone>`);
- open the chat viewer in `/admin/whatsapp` (live JSON from
  `/api/admin/whatsapp/transcript`);
- open the **printable WhatsApp-style page** (`?format=html`), which is the
  closest honest equivalent to a screenshot — WhatsApp exposes no screenshot API.

OTP rows are stored with `kind = 'otp'` and hidden from exports.

### Urgent alerts

Escalations still go to the admin team as WhatsApp text. Urgent ones also get:

- a spoken **voice note** (Edge TTS → ffmpeg OGG/Opus, no API key needed);
- a real **phone call** when `URGENT_CALL_WEBHOOK` or the Twilio values are set.

Baileys cannot originate WhatsApp voice calls (it only exposes `rejectCall`), so
calling needs one of those two providers. Without them the text + voice note
still go out.

### Marketing

The AI writes the wording from **real listing rows** (never invented facts), with
a deterministic template as fallback. Statuses and group posts land in
`whatsapp_marketing` as `draft` while `require_approval` is on; an admin approves,
edits or skips them in the panel. The worker sends only approved rows that are due.

Safety rails:

- marketing defaults **off**, approval defaults **on**;
- groups are discovered disabled and must be enabled one by one, each with its
  own cadence;
- account-wide daily caps for statuses and group posts;
- status posts go to recent contacts, outbox recipients and admins (max 3000),
  never the official number itself or a blocked contact;
- real listing photos are used for the card; a branded gradient is the fallback,
  never a fake house.

Group blasting is the fastest way to lose a WhatsApp number. Keep the caps low
and only enable groups where promotion is welcome.

## 6. Security

- The brain endpoint requires `x-bridge-secret`; it is not reachable from the
  public website bundle.
- Per-sender rate limit: 20 messages/minute on the brain, plus Baileys dedupe by
  message id.
- Groups are never AI-replied to; status broadcasts are ignored on the inbound
  side. Outbound group posts and statuses only happen through the approval queue
  and only for enabled groups.
- `markOnline` is off. The number only posts to status/group when marketing is
  enabled and a post is approved.
- `.pause`, `.start` and the allow/block lists are writable only by admin
  numbers, the self-chat, or an authenticated admin session in the panel; every
  change is recorded in `whatsapp_control_audit`.
- Hand-off tokens are unguessable, single-use and expire in 24 hours.
- If the phone logs out all devices, clear the stored pairing and re-pair:

```sql
delete from public.whatsapp_auth where key like 'asehanta:%';
```

Then restart the worker.

## 7. Render

The repo ships `whatsapp/Dockerfile`, so deploy this folder as a **Web Service
(Docker)**:

| Setting | Value |
| --- | --- |
| Root directory | `whatsapp` |
| Dockerfile path | `Dockerfile` |
| Health check path | `/health` |
| Port | Render injects `PORT` (the image defaults to `10000`) |

Set the same env vars as section 3, plus `WHATSAPP_PAIR_NUMBER` and
`WHATSAPP_PAIR_TOKEN`. Then open
`https://<service>.onrender.com/qr?token=<WHATSAPP_PAIR_TOKEN>` on a second
screen to scan, or `/pair` to read the current code.

`/health` always answers `200` (liveness). `/` is readiness and answers `503`
until WhatsApp is connected. The health check **must** point at `/health`,
otherwise Render rolls the deploy back while the number is still unpaired.

Free instances sleep after 15 minutes without inbound traffic. An active
WhatsApp socket usually counts as inbound WebSocket traffic, but Render reserves
the right to restart free services at any time. For an always-on production bot,
use the Starter plan, or ping `/health` every 10 minutes from an external cron.

## 8. Docker

```bash
docker build -t asehanta-whatsapp .
docker run --env-file .env -p 10000:10000 asehanta-whatsapp
```

Mount nothing — the auth state lives in Supabase.
