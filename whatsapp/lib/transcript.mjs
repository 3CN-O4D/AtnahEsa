/**
 * Conversation transcripts for admins.
 *
 * Every inbound/outbound message is mirrored into `whatsapp_messages`, because
 * `whatsapp_sessions.history` only keeps the last 12 turns for the prompt.
 * Admins can pull a `.txt` over WhatsApp or open a printable chat view from
 * the admin panel (which is the closest thing WhatsApp offers to a screenshot —
 * the API cannot capture the phone's screen).
 */

const TZ = 'Africa/Nairobi'
const LIMIT = 500

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const stampFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const roleLabel = {
  user: 'Customer',
  assistant: 'Ase',
  admin: 'Team',
  system: 'System',
}

const digits = (value) => String(value ?? '').replace(/\D/g, '')

export const transcriptPhone = digits

function when(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return timeFmt.format(date)
}

function stamp(value) {
  const date = value ? new Date(value) : new Date()
  return stampFmt.format(date).replace(',', '').replace(/[/:]/g, '-').replace(' ', '-')
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Mirror one message into the transcript table. Never throws into the chat. */
export async function logMessage(
  supabase,
  { jid, phone, role = 'user', body, messageId = null, kind = null, log = console }
) {
  const text = String(body ?? '').trim()
  if (!jid || !text) return

  const { error } = await supabase.from('whatsapp_messages').insert({
    wa_jid: jid,
    phone: phone ? digits(phone) : null,
    role,
    body: text.slice(0, 8000),
    message_id: messageId,
    kind,
  })

  if (error) log.error?.('[transcript] log failed:', error.message)
}

async function resolveSession(supabase, { phone, jid }) {
  if (jid) {
    const { data } = await supabase
      .from('whatsapp_sessions')
      .select('wa_jid, phone, profile_name, history, updated_at')
      .eq('wa_jid', jid)
      .maybeSingle()
    return data ?? { wa_jid: jid, phone: phone ? digits(phone) : null }
  }

  const clean = digits(phone)
  if (!clean) return null

  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('wa_jid, phone, profile_name, history, updated_at')
    .eq('phone', clean)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data ?? { wa_jid: null, phone: clean }
}

async function loadRows(supabase, { phone, jid, limit }) {
  let query = supabase
    .from('whatsapp_messages')
    .select('role, body, kind, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (jid) query = query.eq('wa_jid', jid)
  else query = query.eq('phone', digits(phone))

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? [])
    .filter((row) => row.kind !== 'otp')
    .reverse()
    .map((row) => ({
      role: row.role,
      body: row.body,
      at: row.created_at,
    }))
}

function textTranscript({ name, phone, jid, rows }) {
  const header = [
    'AseHanta — WhatsApp conversation',
    name ? `Customer: ${name}` : null,
    phone ? `Phone: ${phone}` : null,
    jid ? `Chat: ${jid}` : null,
    `Exported: ${when(new Date().toISOString())} (EAT)`,
    `Messages: ${rows.length}`,
    '',
    '────────────────────────────────────────',
    '',
  ].filter((line) => line !== null)

  const body = rows.map((row) => {
    const label = roleLabel[row.role] ?? row.role
    const at = when(row.at)
    return `${at ? `[${at}] ` : ''}${label}:\n${row.body}\n`
  })

  return [...header, ...body].join('\n')
}

function htmlTranscript({ name, phone, jid, rows }) {
  const bubbles = rows
    .map((row) => {
      const side = row.role === 'user' ? 'left' : 'right'
      const who = roleLabel[row.role] ?? row.role
      const at = when(row.at)
      return `<div class="row ${side}">
        <div class="bubble ${escapeHtml(row.role)}">
          <div class="meta"><span>${escapeHtml(who)}</span>${at ? `<span>${escapeHtml(at)}</span>` : ''}</div>
          <div class="text">${escapeHtml(row.body).replace(/\n/g, '<br>')}</div>
        </div>
      </div>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AseHanta chat — ${escapeHtml(phone || jid || 'conversation')}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0b141a; color: #e9edef; font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { position: sticky; top: 0; z-index: 2; background: #111b21; border-bottom: 1px solid #223; padding: 14px 18px; display: flex; justify-content: space-between; gap: 12px; align-items: center; }
  header h1 { font-size: 15px; margin: 0; font-weight: 600; }
  header p { margin: 2px 0 0; color: #8696a0; font-size: 12px; }
  header button { background: #00a884; color: #06281f; border: 0; border-radius: 8px; padding: 8px 12px; font-weight: 700; cursor: pointer; }
  main { max-width: 820px; margin: 0 auto; padding: 18px 14px 60px; }
  .row { display: flex; margin: 6px 0; }
  .row.left { justify-content: flex-start; }
  .row.right { justify-content: flex-end; }
  .bubble { max-width: 82%; border-radius: 12px; padding: 8px 10px 6px; background: #202c33; }
  .bubble.assistant { background: #005c4b; }
  .bubble.admin { background: #1f4b6e; }
  .bubble.system { background: #2a3942; color: #8696a0; max-width: 100%; }
  .meta { display: flex; gap: 10px; justify-content: space-between; color: #aebac1; font-size: 11px; margin-bottom: 3px; }
  .text { white-space: pre-wrap; word-wrap: break-word; }
  @media print { header button { display: none; } body { background: #fff; color: #111; } .bubble { border: 1px solid #ddd; } .bubble.assistant { background: #dcf8c6; color: #111; } .bubble.admin { background: #dbeafe; color: #111; } .meta { color: #555; } }
</style>
</head>
<body>
<header>
  <div>
    <h1>${escapeHtml(name || 'WhatsApp conversation')}</h1>
    <p>${escapeHtml(phone || '')}${jid ? ` · ${escapeHtml(jid)}` : ''} · ${rows.length} messages</p>
  </div>
  <button onclick="window.print()">Print / Save PDF</button>
</header>
<main>${bubbles || '<p>No messages.</p>'}</main>
</body>
</html>`
}

export async function buildTranscript(supabase, { phone, jid, limit = 200, format = 'txt' } = {}) {
  const clean = digits(phone)
  if (!jid && !clean) throw new Error('phone or jid is required')

  const session = await resolveSession(supabase, { phone: clean, jid })
  const waJid = jid || session?.wa_jid || null
  const chatPhone = clean || digits(session?.phone)
  const name = session?.profile_name || null
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), LIMIT)

  let rows = waJid || chatPhone ? await loadRows(supabase, { phone: chatPhone, jid: waJid, limit: safeLimit }) : []

  let limited = false
  if (!rows.length && Array.isArray(session?.history) && session.history.length) {
    limited = true
    rows = session.history.map((message) => ({
      role: message?.role === 'assistant' ? 'assistant' : message?.role === 'system' ? 'system' : 'user',
      body: String(message?.content ?? ''),
      at: null,
    }))
  }

  if (!rows.length) {
    return { found: false, count: 0, name, phone: chatPhone, jid: waJid }
  }

  const payload = { name, phone: chatPhone, jid: waJid, rows }
  const text = textTranscript(payload)
  const html = htmlTranscript(payload)
  const filename = `asehanta-chat-${chatPhone || 'unknown'}-${stamp()}.${format === 'html' ? 'html' : 'txt'}`

  return {
    found: true,
    count: rows.length,
    limited,
    name,
    phone: chatPhone,
    jid: waJid,
    text,
    html,
    filename,
  }
}
