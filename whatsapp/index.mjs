import { createServer } from 'node:http'
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  Browsers,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import QRCode from 'qrcode'

import { createSupabase, useSupabaseAuthState, clearAuthState } from './lib/auth-state.mjs'
import { loadSession, saveSession, resetSession } from './lib/session.mjs'
import { emptyState } from './lib/chat-state.mjs'
import { createBrain } from './lib/brain.mjs'
import {
  splitBubbles,
  renderBubble,
  linksFromActions,
  cardsFromActions,
  quickReplyLine,
  cardCaption,
} from './lib/format.mjs'

/* ------------------------------------------------------------------ config */

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CHAT_API_URL = 'https://www.asehanta.com',
  WHATSAPP_BRIDGE_SECRET,
  WHATSAPP_PAIR_NUMBER,
  WHATSAPP_SESSION_PREFIX = 'asehanta',
  ADMIN_WHATSAPP_NUMBERS = '',
  PORT = '8080',
} = process.env

const missing = [
  ['SUPABASE_URL', SUPABASE_URL],
  ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
  ['WHATSAPP_BRIDGE_SECRET', WHATSAPP_BRIDGE_SECRET],
].filter(([, value]) => !value)

if (missing.length) {
  console.error(`[whatsapp] missing env: ${missing.map(([name]) => name).join(', ')}`)
  process.exit(1)
}

const supabase = createSupabase()
const askBrain = createBrain({ url: CHAT_API_URL, secret: WHATSAPP_BRIDGE_SECRET })
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' })

const RESET_RE = /^(reset|restart|start over|clear chat|new chat|fresh start)$/i

/** `AS-<token>` is written into the wa.me message by the website hand-off. */
const HANDOFF_RE = /\bAS-([A-Za-z0-9_-]{16,64})\b/

/** Admin phone numbers that get a WhatsApp copy of requests and escalations. */
const adminNumbers = ADMIN_WHATSAPP_NUMBERS.split(',')
  .map((n) => n.replace(/\D/g, ''))
  .filter(Boolean)

/* ------------------------------------------------------------------ helpers */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Small LRU-ish guard so a WhatsApp redelivery can't answer twice. */
const seenMessages = new Set()
function remember(id) {
  seenMessages.add(id)
  if (seenMessages.size > 1000) {
    const first = seenMessages.values().next().value
    seenMessages.delete(first)
  }
}

/** Serialise work per chat so two fast messages can't clobber session state. */
const queues = new Map()
function enqueue(jid, task) {
  const previous = queues.get(jid) ?? Promise.resolve()
  const next = previous.then(task, task)
  queues.set(
    jid,
    next.catch(() => {}).finally(() => {
      if (queues.get(jid) === next) queues.delete(jid)
    })
  )
  return next
}

/** Redeem a single-use web → WhatsApp hand-off token. */
async function consumeHandoff(token) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null
  const { data, error } = await supabase
    .from('chat_handoffs')
    .select('*')
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error || !data) return null

  const { data: claimed } = await supabase
    .from('chat_handoffs')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)
    .is('used_at', null)
    .select('*')
    .maybeSingle()

  return claimed ?? null
}

function adminAlertText(alert, { phone, profileName }) {
  const icon = alert.priority === 'urgent' ? '🚨' : '🔔'
  const contact = String(alert.phone || phone || '').replace(/\D/g, '')
  return [
    `${icon} *${String(alert.topic || 'New message').toUpperCase()} — WhatsApp*`,
    alert.subject ? `*${alert.subject}*` : '',
    '',
    alert.message || '',
    '',
    `Customer: ${alert.name || profileName || 'unknown'}`,
    `Phone: ${alert.phone || phone || 'unknown'}`,
    contact ? `Open chat: https://wa.me/${contact}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n')
    .slice(0, 4000)
}

/** Send the admin team a WhatsApp copy of a request or escalation (English). */
async function sendAdminAlerts(alert, meta) {
  if (!alert || adminNumbers.length === 0) return
  const text = adminAlertText(alert, meta)
  for (const number of adminNumbers) {
    try {
      await sock.sendMessage(`${number}@s.whatsapp.net`, { text })
    } catch (error) {
      console.error(`[whatsapp] admin alert to ${number} failed:`, error?.message ?? error)
    }
  }
}

/* ------------------------------------------------------------------ pairing */

/*
 * Pairing is deliberately *not* on a timer.
 *
 * Every `requestPairingCode` call starts a fresh companion-registration
 * handshake. Requesting one every 45s (what this worker used to do) makes
 * WhatsApp answer with `<failure reason="401">`, which Baileys reports as
 * "Connection Failure" / loggedOut. One request per socket is enough: if the
 * code expires the socket closes, the reconnect creates a new socket and a
 * new code is printed automatically.
 */
const pair = {
  qr: null,
  qrAt: 0,
  code: null,
  codeAt: 0,
  requested: false,
  error: null,
}

const pairedNumber = String(WHATSAPP_PAIR_NUMBER || '').replace(/\D/g, '')

if (WHATSAPP_PAIR_NUMBER && !/^\d{8,15}$/.test(pairedNumber)) {
  console.error(
    `[whatsapp] WHATSAPP_PAIR_NUMBER must be digits only with the country code and no "+": got "${WHATSAPP_PAIR_NUMBER}"`
  )
  process.exit(1)
}

/** 254791410625 -> "+254 791 410 625" so the number can be eyeballed in logs. */
function formatPhone(number) {
  const m = /^(\d{1,3})(\d{3})(\d{3})(\d{3})$/.exec(String(number))
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]}` : `+${number}`
}

async function requestPairingCode(socket) {
  if (!pairedNumber || pair.requested) return pair.code
  pair.requested = true

  try {
    const code = await socket.requestPairingCode(pairedNumber)
    pair.code = code
    pair.codeAt = Date.now()
    pair.error = null
    console.log('\n==============================================================')
    console.log(` Pair ${formatPhone(pairedNumber)} with: ${code}`)
    console.log(' WhatsApp → Settings → Linked devices → Link with phone number')
    console.log('==============================================================\n')
    return code
  } catch (error) {
    pair.error = String(error?.message ?? error)
    console.error('[whatsapp] pairing code failed:', pair.error)
    return null
  }
}

/** A new socket needs a new companion handshake, so forget the old code. */
function resetPairForSocket() {
  pair.qr = null
  pair.qrAt = 0
  pair.code = null
  pair.codeAt = 0
  pair.requested = false
  pair.error = null
}

/**
 * `fetchLatestWaWebVersion` tracks the live WhatsApp Web build; the Baileys
 * table can lag and a stale build is rejected at registration.
 */
async function resolveVersion() {
  try {
    const live = await fetchLatestWaWebVersion()
    if (live?.version?.length) return live.version
  } catch {
    /* fall through to the Baileys table */
  }
  try {
    const { version } = await fetchLatestBaileysVersion()
    if (version?.length) return version
  } catch {
    /* let Baileys use its bundled default */
  }
  return null
}

function extractText(message) {
  const m = message?.message
  if (!m) return ''

  if (typeof m.conversation === 'string') return m.conversation.trim()
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text.trim()
  if (m.imageMessage?.caption) return m.imageMessage.caption.trim()
  if (m.videoMessage?.caption) return m.videoMessage.caption.trim()
  if (m.documentMessage?.caption) return m.documentMessage.caption.trim()
  if (m.buttonsResponseMessage?.selectedDisplayText) return m.buttonsResponseMessage.selectedDisplayText.trim()
  if (m.listResponseMessage?.title) return m.listResponseMessage.title.trim()
  if (m.templateButtonReplyMessage?.selectedDisplayText) return m.templateButtonReplyMessage.selectedDisplayText.trim()

  return ''
}

function hasUnsupportedMedia(message) {
  const m = message?.message
  if (!m) return false
  return Boolean(
    m.imageMessage ||
      m.audioMessage ||
      m.videoMessage ||
      m.documentMessage ||
      m.stickerMessage ||
      m.locationMessage ||
      m.contactMessage
  )
}

/* ------------------------------------------------------------------ socket */

let sock = null
let connected = false
let starting = false
let socketGen = 0
let reconnectAttempts = 0

async function start() {
  if (starting) return
  starting = true
  const gen = ++socketGen

  try {
    const { state, saveCreds } = await useSupabaseAuthState(supabase, WHATSAPP_SESSION_PREFIX)
    const version = await resolveVersion()

    // A newer start() won the race while we were awaiting Supabase/version.
    if (gen !== socketGen) return

    resetPairForSocket()

    const socket = makeWASocket({
      ...(version ? { version } : {}),
      logger,
      auth: state,
      /*
       * WhatsApp rejects unknown browser names when registering a companion.
       * The macOS "Desktop" sub-platform is also refused since mid-2026, so
       * macOS + Chrome is the combination that still links.
       */
      browser: Browsers.macOS('Chrome'),
      /*
       * A pairing code is only valid while this socket is alive. Baileys ends
       * the socket once its QR refs run out (60s for the first, 20s after), so
       * a code requested by phone number gets killed while the user is still
       * navigating WhatsApp's menus. Hold the socket open long enough to type
       * the code.
       */
      ...(pairedNumber ? { qrTimeout: 5 * 60 * 1000 } : {}),
      markOnline: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
    })
    sock = socket

    socket.ev.on('creds.update', () => {
      saveCreds()
    })

    socket.ev.on('connection.update', async (update) => {
      if (gen !== socketGen) return
      const { connection, lastDisconnect, qr, isNewLogin } = update

      if (qr) {
        pair.qr = qr
        pair.qrAt = Date.now()

        if (pairedNumber) {
          // The socket is now talking to WhatsApp, which is the only moment
          // requestPairingCode() can succeed. One call per socket.
          void requestPairingCode(socket)
        } else {
          console.log('\n[whatsapp] scan this QR with the official AseHanta number:')
          qrcode.generate(qr, { small: true })
        }
      }

      if (isNewLogin) {
        console.log('[whatsapp] device linked — restarting the socket with the new credentials')
      }

      if (connection === 'open') {
        connected = true
        starting = false
        reconnectAttempts = 0
        pair.qr = null
        pair.code = null
        const lid = socket?.authState?.creds?.me?.lid
        console.log(`[whatsapp] connected and ready ✅${lid ? ` (lid ${lid})` : ''}`)
        startOutbox()
      }

      if (connection === 'close') {
        connected = false
        starting = false
        stopOutbox()
        pair.qr = null

        const statusCode = lastDisconnect?.error?.output?.statusCode
        const registered = !!socket?.authState?.creds?.registered
        const failure = lastDisconnect?.error?.data
          ? JSON.stringify(lastDisconnect.error.data)
          : ''

        if (statusCode === DisconnectReason.loggedOut && registered) {
          /*
           * WhatsApp removed this device, so the stored credentials are dead.
           * Exiting here just makes a host restart loop on the same bad creds,
           * so wipe them and pair again instead.
           */
          console.error('[whatsapp] this device was logged out of WhatsApp — clearing credentials to re-pair')
          try {
            await clearAuthState(supabase, WHATSAPP_SESSION_PREFIX)
          } catch (error) {
            console.error('[whatsapp] could not clear auth state:', error?.message ?? error)
          }
          resetPairForSocket()
          reconnectAttempts = 0
          setTimeout(start, 2000)
          return
        }

        reconnectAttempts += 1

        let delay
        if (statusCode === DisconnectReason.restartRequired) delay = 500
        else if (statusCode === DisconnectReason.loggedOut) delay = 2000
        else delay = Math.min(2000 * reconnectAttempts, 15000)

        const detail = statusCode ? `${statusCode}${failure ? ` ${failure}` : ''}` : 'no status'
        if (!registered) {
          console.warn(`[whatsapp] pairing attempt ended (${detail}) — new code in ${delay}ms`)
        } else {
          console.warn(`[whatsapp] connection closed (${detail}), reconnecting in ${delay}ms`)
        }

        setTimeout(start, delay)
      }
    })

    socket.ev.on('messages.upsert', (event) => {
      if (gen !== socketGen) return
      if (event.type !== 'notify') return
      for (const message of event.messages) {
        void onMessage(message)
      }
    })
  } catch (error) {
    starting = false
    console.error('[whatsapp] failed to start:', error)
    setTimeout(start, 5000)
  }
}

/* ------------------------------------------------------------- message flow */

async function onMessage(message) {
  const rawJid = message?.key?.remoteJid
  if (!rawJid) return
  if (message.key.fromMe) return
  if (rawJid === 'status@broadcast') return
  if (rawJid.endsWith('@g.us')) return // group chats stay quiet

  const id = message.key.id
  if (!id || seenMessages.has(id)) return
  remember(id)

  /*
   * WhatsApp is migrating DMs from phone-number JIDs to LIDs (`@lid`).
   * `senderPn` carries the same person's phone-number JID, so key the
   * conversation by that: one session per human instead of one per addressing
   * mode, and the reply goes through Baileys' LID resolution.
   */
  const jid = message.key.senderPn || rawJid

  return enqueue(jid, () => handleMessage({ message, jid, id }))
}

async function handleMessage({ message, jid, id }) {
  let text = extractText(message)

  if (!text) {
    if (hasUnsupportedMedia(message)) {
      await sendText(
        jid,
        "I can only read text for now 🙂 Tell me what you need — houses, WiFi, movers or escrow — and I'll sort it."
      )
    }
    return
  }

  const session = await loadSession(supabase, jid)
  if (session.lastMessageId === id) return

  const phone = String(message.key.senderPn || jid).split('@')[0]
  const profileName = message.pushName || session.profileName || null

  // Web → WhatsApp hand-off: the website opened wa.me with an `AS-<token>`
  // reference. Redeem it and restore the exact state + history so the chat
  // carries on instead of starting over.
  const handoff = text.match(HANDOFF_RE)
  if (handoff) {
    const row = await consumeHandoff(handoff[1])
    if (row) {
      if (row.state && typeof row.state === 'object' && Object.keys(row.state).length) {
        session.state = row.state
      }
      if (Array.isArray(row.history) && row.history.length) {
        session.history = row.history
      }
      text = text
        .replace(handoff[0], '')
        .replace(/\s+/g, ' ')
        .trim()
      if (!text || /chatting with ase on the website/i.test(text)) {
        text = 'Hi Ase — I was chatting with you on the website just now. Please continue from where we left off.'
      }
      console.log(`[whatsapp] resumed web hand-off for ${phone}`)
    } else {
      console.warn('[whatsapp] hand-off token was expired or already used')
      text = text.replace(handoff[0], '').replace(/\s+/g, ' ').trim() || 'Hi'
    }
  }

  // A quick way to abandon a half-finished guided flow.
  if (RESET_RE.test(text)) {
    await resetSession(supabase, jid)
    await sendText(jid, 'Fresh start ✅ What would you like to do?')
    return
  }

  try {
    await safePresence(jid, 'composing')

    const result = await askBrain({
      message: text,
      state: session.state ?? emptyState(),
      history: session.history,
      phone,
      name: profileName,
    })

    const bubbles = splitBubbles(result.reply)
    if (bubbles.length === 0) bubbles.push({ text: result.reply || '…', links: [] })

    // Link actions from the engine (FAQ/stats/contact) are buttons on the web;
    // on WhatsApp they become plain tappable links on the last bubble.
    const linkActions = linksFromActions(result.actions)
    if (linkActions.length) {
      bubbles[bubbles.length - 1].text +=
        '\n\n' + linkActions.map((link) => `${link.label}: ${link.href}`).join('\n')
    }

    const quickLine = quickReplyLine(result.quickReplies)
    if (quickLine) bubbles[bubbles.length - 1].text += '\n\n' + quickLine

    const outgoing = bubbles.slice(0, 8)
    for (const bubble of outgoing) {
      await sleep(outgoing.length > 1 ? 300 + Math.random() * 400 : 0)
      await safePresence(jid, 'composing')
      await sendText(jid, renderBubble(bubble))
    }

    // House results as image cards with a caption, like the web cards. When a
    // listing has several photos (e.g. a `get_house` detail reply) send up to
    // three of them, cover photo first with the caption.
    for (const card of cardsFromActions(result.actions).slice(0, 5)) {
      const caption = cardCaption(card)
      const photos =
        Array.isArray(card.images) && card.images.length
          ? card.images.filter(Boolean)
          : card.image
            ? [card.image]
            : []
      const gallery = photos.slice(0, 3)

      if (gallery.length === 0) {
        try {
          await sock.sendMessage(jid, { text: caption })
        } catch {
          /* card is best-effort; the text reply already listed it */
        }
        continue
      }

      for (let i = 0; i < gallery.length; i += 1) {
        try {
          await sock.sendMessage(jid, {
            image: { url: gallery[i] },
            caption: i === 0 ? caption : undefined,
          })
        } catch {
          if (i === 0) {
            try {
              await sock.sendMessage(jid, { text: caption })
            } catch {
              /* card is best-effort; the text reply already listed it */
            }
          }
        }
      }
    }

    // Requests, bookings and escalations also go to the admin team on WhatsApp.
    if (result.adminAlert) {
      await sendAdminAlerts(result.adminAlert, { phone, profileName })
    }

    const history = [
      ...session.history,
      { role: 'user', content: text },
      { role: 'assistant', content: result.reply },
    ].slice(-12)

    await saveSession(supabase, jid, {
      phone,
      profileName,
      state: result.state ?? emptyState(),
      history,
      lastMessageId: id,
    })
  } catch (error) {
    console.error('[whatsapp] reply failed:', error?.message ?? error)
    await sendText(jid, "Sorry — I hit a hiccup on my side. Please try again in a moment. 🙏")
  } finally {
    await safePresence(jid, 'paused')
  }
}

async function sendText(jid, text) {
  if (!sock) throw new Error('socket not ready')
  await sock.sendMessage(jid, { text: String(text).slice(0, 4000) })
}

async function safePresence(jid, state) {
  try {
    await sock?.sendPresenceUpdate(state, jid)
  } catch {
    /* presence is cosmetic */
  }
}

/* ------------------------------------------------------------------ outbox */

/*
 * The website never holds a WhatsApp socket, so every email notification, OTP
 * and receipt PDF is written to `whatsapp_outbox` and delivered from here.
 * Rows are claimed atomically (`pending` → `sending`) so a restart or a second
 * worker can't double-send, then retried a few times before being marked failed.
 */

const OUTBOX_POLL_MS = Number(process.env.WHATSAPP_OUTBOX_POLL_MS || 3000)
const OUTBOX_MAX_ATTEMPTS = Number(process.env.WHATSAPP_OUTBOX_MAX_ATTEMPTS || 3)

let outboxTimer = null
let outboxBusy = false

const outboxJid = (phone) => `${String(phone).replace(/\D/g, '')}@s.whatsapp.net`

function isImageMedia(row) {
  const mime = String(row.media_mime || '').toLowerCase()
  if (mime.startsWith('image/')) return true
  const url = String(row.media_url || '').split('?')[0]
  return /\.(png|jpe?g|webp|gif)$/i.test(url)
}

/** Claim one pending row. Returns the claimed row, or null if another worker won. */
async function claimOutbox(row) {
  const { data, error } = await supabase
    .from('whatsapp_outbox')
    .update({
      status: 'sending',
      attempts: (row.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[outbox] claim failed:', error.message)
    return null
  }
  return data ?? null
}

/** Send one claimed row: text first, then any image/document attachment. */
async function deliverOutbox(row) {
  if (!sock) throw new Error('socket not ready')
  const jid = outboxJid(row.phone)
  const body = String(row.body ?? '').trim().slice(0, 4000)

  if (body) {
    await sock.sendMessage(jid, { text: body })
  }

  if (row.media_base64) {
    const buffer = Buffer.from(row.media_base64, 'base64')
    const mimetype = row.media_mime || 'application/octet-stream'
    await sock.sendMessage(jid, {
      document: buffer,
      mimetype,
      fileName: row.file_name || 'AseHanta-document.pdf',
    })
    return
  }

  if (row.media_url) {
    if (isImageMedia(row)) {
      await sock.sendMessage(jid, {
        image: { url: row.media_url },
        caption: body ? undefined : row.file_name || undefined,
      })
    } else {
      await sock.sendMessage(jid, {
        document: { url: row.media_url },
        mimetype: row.media_mime || 'application/pdf',
        fileName: row.file_name || 'AseHanta-document.pdf',
      })
    }
  }
}

async function markOutbox(id, patch) {
  const { error } = await supabase
    .from('whatsapp_outbox')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error('[outbox] update failed:', error.message)
}

async function pollOutbox() {
  if (!connected || !sock || outboxBusy) return
  outboxBusy = true

  try {
    const { data, error } = await supabase
      .from('whatsapp_outbox')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10)

    if (error) {
      console.error('[outbox] poll failed:', error.message)
      return
    }

    for (const row of data ?? []) {
      const claimed = await claimOutbox(row)
      if (!claimed) continue

      try {
        await deliverOutbox(claimed)
        await markOutbox(claimed.id, { status: 'sent', sent_at: new Date().toISOString(), last_error: null })
      } catch (err) {
        const attempts = claimed.attempts ?? 1
        const failed = attempts >= OUTBOX_MAX_ATTEMPTS
        const message = String(err?.message ?? err).slice(0, 500)
        await markOutbox(claimed.id, {
          status: failed ? 'failed' : 'pending',
          last_error: message,
        })
        console.error(
          `[outbox] ${failed ? 'gave up on' : 'retry'} ${claimed.kind} to ${claimed.phone} (attempt ${attempts}):`,
          message
        )
      }
    }
  } finally {
    outboxBusy = false
  }
}

function startOutbox() {
  if (outboxTimer) return
  outboxTimer = setInterval(() => void pollOutbox(), OUTBOX_POLL_MS)
  void pollOutbox()
}

function stopOutbox() {
  if (!outboxTimer) return
  clearInterval(outboxTimer)
  outboxTimer = null
}

/* -------------------------------------------------------------- healthcheck */

/*
 * A QR rendered as ASCII in the logs is unreadable/truncated when it is copied
 * into chat, which is why scanning kept "failing". These endpoints serve the
 * live QR as a real PNG plus the current pairing code.
 *
 * They are protected by WHATSAPP_PAIR_TOKEN (defaults to the bridge secret) so
 * a public host can't hand the bot's QR to somebody else.
 */
const PAIR_TOKEN = process.env.WHATSAPP_PAIR_TOKEN || WHATSAPP_BRIDGE_SECRET

function pairingAuthorized(req, url) {
  if (!PAIR_TOKEN) return false
  const token = url.searchParams.get('token') || req.headers['x-pair-token']
  return token === PAIR_TOKEN
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

const health = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const registered = !!sock?.authState?.creds?.registered

  if (url.pathname === '/qr') {
    if (!pairingAuthorized(req, url)) return sendJson(res, 401, { error: 'unauthorized' })
    const token = encodeURIComponent(url.searchParams.get('token') || '')
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AseHanta — WhatsApp pairing</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b1120; color: #e2e8f0; }
  main { text-align: center; padding: 24px; }
  h1 { font-size: 1.1rem; font-weight: 600; margin: 0 0 4px; }
  p { color: #94a3b8; font-size: .85rem; margin: 4px 0; }
  img { width: min(78vw, 420px); height: auto; background: #fff; padding: 12px; border-radius: 12px; display: block; margin: 16px auto; }
  .code { font-size: 2.4rem; letter-spacing: .35rem; font-weight: 700; color: #f8fafc; margin: 12px 0 0; font-family: ui-monospace, monospace; }
  .ok { color: #4ade80; font-size: 1.4rem; font-weight: 700; }
  .warn { color: #fbbf24; }
</style>
</head>
<body><main>
  <h1>Link the official AseHanta WhatsApp</h1>
  <p id="status">Connecting to WhatsApp…</p>
  <img id="qr" alt="WhatsApp QR" src="/qr.png?token=${token}&amp;t=0">
  <p class="code" id="code"></p>
  <p>WhatsApp → Settings → Linked devices → Link a device</p>
  <p>Page refreshes by itself — scan whatever is on screen right now.</p>
  <p>Only one phone? Use <b>Link with phone number</b> and the code above.</p>
</main>
<script>
const token = ${JSON.stringify(url.searchParams.get('token') || '')};
const img = document.getElementById('qr');
const status = document.getElementById('status');
const code = document.getElementById('code');
let done = false;

async function tick() {
  if (done) return;
  // cache-bust so the browser always fetches the QR that is live right now
  img.src = '/qr.png?token=' + encodeURIComponent(token) + '&t=' + Date.now();
  try {
    const res = await fetch('/pair?token=' + encodeURIComponent(token), { cache: 'no-store' });
    const data = await res.json();
    if (data.connected) {
      done = true;
      status.textContent = '';
      status.className = 'ok';
      status.textContent = 'Connected ✅';
      img.style.display = 'none';
      code.textContent = '';
      return;
    }
    status.className = data.code ? 'warn' : '';
    status.textContent = data.registered ? 'Linked, starting…' : (data.hasQr ? 'Scan the QR, or enter the code' : 'Waiting for WhatsApp…');
    code.textContent = data.code || '';
  } catch {
    status.textContent = 'Reconnecting…';
  }
}
tick();
setInterval(tick, 4000);
</script>
</body></html>`
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(html)
    return
  }

  if (url.pathname === '/qr.png') {
    if (!pairingAuthorized(req, url)) return sendJson(res, 401, { error: 'unauthorized' })
    if (!pair.qr) return sendJson(res, 409, { error: 'no active QR', hint: 'wait for the next refresh' })

    try {
      const png = await QRCode.toBuffer(pair.qr, {
        width: 512,
        margin: 2,
        errorCorrectionLevel: 'M',
      })
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
      res.end(png)
    } catch (error) {
      sendJson(res, 500, { error: String(error?.message ?? error) })
    }
    return
  }

  if (url.pathname === '/pair') {
    if (!pairingAuthorized(req, url)) return sendJson(res, 401, { error: 'unauthorized' })
    return sendJson(res, 200, {
      number: pairedNumber ? formatPhone(pairedNumber) : null,
      code: pair.code,
      codeAgeSeconds: pair.codeAt ? Math.round((Date.now() - pair.codeAt) / 1000) : null,
      error: pair.error,
      hasQr: Boolean(pair.qr),
      connected,
      registered,
    })
  }

  if (url.pathname === '/pair/new') {
    if (!pairingAuthorized(req, url)) return sendJson(res, 401, { error: 'unauthorized' })
    if (!sock || !pairedNumber) {
      return sendJson(res, 409, { error: 'pairing is not configured' })
    }
    if (registered || connected) {
      return sendJson(res, 409, { error: 'already paired' })
    }
    /*
     * A code belongs to one socket. Re-requesting on the same socket restarts
     * the companion handshake (the old 401 loop), so drop the socket and let
     * the reconnect print a genuinely fresh code.
     */
    pair.requested = false
    pair.code = null
    pair.codeAt = 0
    pair.error = null
    try {
      sock.end(undefined)
    } catch {
      /* already closed */
    }
    return sendJson(res, 202, { number: formatPhone(pairedNumber), restarted: true })
  }

  if (url.pathname === '/health' || url.pathname === '/live') {
    /*
     * Liveness for hosts like Render: must return 200 even before the number
     * is paired. Their health check fs the service right after boot, so a
     * "not connected yet" 503 gets the whole deploy marked unhealthy and rolled
     * back. Readiness stays on "/" below.
     */
    return sendJson(res, 200, {
      ok: true,
      connected,
      registered,
      uptime: Math.round(process.uptime()),
      pairing: pairedNumber
        ? { number: formatPhone(pairedNumber), hasCode: Boolean(pair.code), hasQr: Boolean(pair.qr) }
        : null,
    })
  }

  sendJson(res, connected ? 200 : 503, {
    ok: connected,
    service: 'asehanta-whatsapp',
    uptime: Math.round(process.uptime()),
    registered,
    pairing: pairedNumber
      ? { number: formatPhone(pairedNumber), hasCode: Boolean(pair.code), hasQr: Boolean(pair.qr) }
      : null,
  })
})

health.listen(Number(PORT), () => {
  console.log(`[whatsapp] health check on :${PORT}`)
  if (pairedNumber) {
    console.log(`[whatsapp] pairing number: ${formatPhone(pairedNumber)}`)
    console.log(
      `[whatsapp] pair status: /pair?token=… | QR image: /qr.png?token=… | new code: /pair/new?token=…`
    )
  }
})

async function shutdown(signal) {
  console.log(`[whatsapp] ${signal} received, closing`)
  stopOutbox()
  health.close()
  try {
    sock?.end(undefined)
  } catch {
    /* ignore */
  }
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('unhandledRejection', (reason) => {
  console.error('[whatsapp] unhandled rejection:', reason)
})

start()
