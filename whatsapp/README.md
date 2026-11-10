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
```

They create:

| Table | Purpose |
| --- | --- |
| `whatsapp_auth` | Baileys Signal credentials (one row per key) |
| `whatsapp_sessions` | flow state + last 12 messages per chat, `last_message_id` for dedupe |
| `chat_handoffs` | single-use web ⇄ WhatsApp hand-off tokens (state + history, 24h expiry) |
| `whatsapp_outbox` | queued WhatsApp copies of emails, OTPs and receipt PDFs |

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
| `WHATSAPP_SESSION_PREFIX` | optional, defaults to `asehanta`; use another value for a test number |
| `ADMIN_WHATSAPP_NUMBERS` | optional, comma-separated admin numbers (digits only) that get a WhatsApp copy of every request/booking/escalation |
| `PORT` | health-check port, defaults to `8080` |
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

The process prints `connected and ready ✅` when the number is live.
Leave it running (pm2, systemd, Docker, or the host's process manager).

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

## 6. Security

- The brain endpoint requires `x-bridge-secret`; it is not reachable from the
  public website bundle.
- Per-sender rate limit: 20 messages/minute on the brain, plus Baileys dedupe by
  message id.
- Groups and status broadcasts are ignored.
- Nothing is written to WhatsApp status; `markOnline` is off.
- Hand-off tokens are unguessable, single-use and expire in 24 hours.
- If the phone logs out all devices, clear the stored pairing and re-pair:

```sql
delete from public.whatsapp_auth where key like 'asehanta:%';
```

Then restart the worker.

## 7. Docker

```bash
docker build -t asehanta-whatsapp .
docker run --env-file .env -p 8080:8080 asehanta-whatsapp
```

Mount nothing — the auth state lives in Supabase.
