import { createServer } from 'node:http'
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'

import { createSupabase, useSupabaseAuthState } from './lib/auth-state.mjs'
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

async function start() {
  if (starting) return
  starting = true

  try {
    const { state, saveCreds } = await useSupabaseAuthState(supabase, WHATSAPP_SESSION_PREFIX)
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
      version,
      logger,
      auth: state,
      browser: Browsers.ubuntu('AseHanta'),
      markOnline: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
    })

    sock.ev.on('creds.update', saveCreds)

    if (!state.creds.registered && WHATSAPP_PAIR_NUMBER) {
      try {
        const code = await sock.requestPairingCode(WHATSAPP_PAIR_NUMBER.replace(/\D/g, ''))
        console.log('\n==============================================================')
        console.log(` Pair AseHanta WhatsApp with: ${code}`)
        console.log(' WhatsApp → Settings → Linked devices → Link with phone number')
        console.log('==============================================================\n')
      } catch (error) {
        console.error('[whatsapp] pairing code failed:', error?.message ?? error)
      }
    }

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        console.log('\n[whatsapp] scan this QR with the official AseHanta number:')
        qrcode.generate(qr, { small: true })
      }

      if (connection === 'open') {
        connected = true
        starting = false
        console.log('[whatsapp] connected and ready ✅')
        startOutbox()
      }

      if (connection === 'close') {
        connected = false
        starting = false
        stopOutbox()
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut

        if (loggedOut) {
          console.error(
            '[whatsapp] this device was logged out. Re-pair it, or clear whatsapp_auth rows for this prefix first.'
          )
          process.exit(1)
        }

        const delay = statusCode === DisconnectReason.restartRequired ? 500 : 3000
        console.warn(`[whatsapp] connection closed (${statusCode ?? 'unknown'}), reconnecting in ${delay}ms`)
        setTimeout(start, delay)
      }
    })

    sock.ev.on('messages.upsert', (event) => {
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
  const jid = message?.key?.remoteJid
  if (!jid) return
  if (message.key.fromMe) return
  if (jid === 'status@broadcast') return
  if (jid.endsWith('@g.us')) return // group chats stay quiet

  const id = message.key.id
  if (!id || seenMessages.has(id)) return
  remember(id)

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

const health = createServer((req, res) => {
  const payload = JSON.stringify({
    ok: connected,
    service: 'asehanta-whatsapp',
    uptime: Math.round(process.uptime()),
  })
  res.writeHead(connected ? 200 : 503, { 'Content-Type': 'application/json' })
  res.end(payload)
})
health.listen(Number(PORT), () => {
  console.log(`[whatsapp] health check on :${PORT}`)
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
