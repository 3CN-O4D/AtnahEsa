import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Server-side transcript reader for the admin panel.
 *
 * The worker mirrors every message into `whatsapp_messages`; this module turns
 * a phone/jid into either JSON for the chat viewer or a printable HTML page.
 * WhatsApp has no screenshot API, so the HTML view (with a print button) is the
 * honest equivalent.
 */

export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'admin' | 'system'
  body: string
  at: string | null
}

export const TRANSCRIPT_TZ = 'Africa/Nairobi'
const MAX = 500

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TRANSCRIPT_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const label: Record<string, string> = {
  user: 'Customer',
  assistant: 'Ase',
  admin: 'Team',
  system: 'System',
}

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '')

export function transcriptionPhone(value: unknown) {
  return digits(value)
}

function when(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return timeFmt.format(date)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function loadTranscript(
  db: ReturnType<typeof createAdminClient>,
  { phone, jid, limit = 200 }: { phone?: string | null; jid?: string | null; limit?: number }
) {
  const cleanPhone = digits(phone)
  const cleanJid = jid ? String(jid).trim() : null

  if (!cleanPhone && !cleanJid) throw new Error('phone or jid is required')

  let waJid = cleanJid
  let chatPhone = cleanPhone
  let name: string | null = null

  if (!waJid && cleanPhone) {
    const { data: session } = await db
      .from('whatsapp_sessions')
      .select('wa_jid, phone, profile_name')
      .eq('phone', cleanPhone)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    waJid = session?.wa_jid ?? null
    name = session?.profile_name ?? null
  }

  if (waJid && !chatPhone) {
    const { data: session } = await db
      .from('whatsapp_sessions')
      .select('phone, profile_name')
      .eq('wa_jid', waJid)
      .maybeSingle()
    chatPhone = digits(session?.phone)
    name = name ?? session?.profile_name ?? null
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), MAX)

  let query = db
    .from('whatsapp_messages')
    .select('role, body, kind, created_at')
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  query = waJid ? query.eq('wa_jid', waJid) : query.eq('phone', chatPhone)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const messages: TranscriptMessage[] = (data ?? [])
    .filter((row) => row.kind !== 'otp')
    .reverse()
    .map((row) => ({
      role: (row.role as TranscriptMessage['role']) ?? 'user',
      body: String(row.body ?? ''),
      at: row.created_at ?? null,
    }))

  return {
    found: messages.length > 0,
    phone: chatPhone,
    jid: waJid,
    name,
    count: messages.length,
    messages,
  }
}

export function renderTranscriptHtml({
  name,
  phone,
  jid,
  messages,
}: {
  name: string | null
  phone: string
  jid: string | null
  messages: TranscriptMessage[]
}) {
  const bubbles = messages
    .map((row) => {
      const side = row.role === 'user' ? 'left' : 'right'
      const who = label[row.role] ?? row.role
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
  header button { background: #1D4ED8; color: #06281f; border: 0; border-radius: 8px; padding: 8px 12px; font-weight: 700; cursor: pointer; }
  main { max-width: 820px; margin: 0 auto; padding: 18px 14px 60px; }
  .row { display: flex; margin: 6px 0; }
  .row.left { justify-content: flex-start; }
  .row.right { justify-content: flex-end; }
  .bubble { max-width: 82%; border-radius: 12px; padding: 8px 10px 6px; background: #202c33; }
  .bubble.assistant { background: #1E3A8A; }
  .bubble.admin { background: #1f4b6e; }
  .bubble.system { background: #2a3942; color: #8696a0; max-width: 100%; }
  .meta { display: flex; gap: 10px; justify-content: space-between; color: #aebac1; font-size: 11px; margin-bottom: 3px; }
  .text { white-space: pre-wrap; word-wrap: break-word; }
  @media print { header button { display: none; } body { background: #fff; color: #111; } .bubble { border: 1px solid #ddd; } .bubble.assistant { background: #DBEAFE; color: #111; } .bubble.admin { background: #dbeafe; color: #111; } .meta { color: #555; } }
</style>
</head>
<body>
<header>
  <div>
    <h1>${escapeHtml(name || 'WhatsApp conversation')}</h1>
    <p>${escapeHtml(phone || '')}${jid ? ` · ${escapeHtml(jid)}` : ''} · ${messages.length} messages</p>
  </div>
  <button onclick="window.print()">Print / Save PDF</button>
</header>
<main>${bubbles || '<p>No messages.</p>'}</main>
</body>
</html>`
}

export function renderTranscriptText({
  name,
  phone,
  jid,
  messages,
}: {
  name: string | null
  phone: string
  jid: string | null
  messages: TranscriptMessage[]
}) {
  const header = [
    'AseHanta — WhatsApp conversation',
    name ? `Customer: ${name}` : null,
    phone ? `Phone: ${phone}` : null,
    jid ? `Chat: ${jid}` : null,
    `Exported: ${when(new Date().toISOString())} (EAT)`,
    `Messages: ${messages.length}`,
    '',
    '────────────────────────────────────────',
    '',
  ].filter((line): line is string => line !== null)

  const body = messages.map((row) => {
    const at = when(row.at)
    return `${at ? `[${at}] ` : ''}${label[row.role] ?? row.role}:\n${row.body}\n`
  })

  return [...header, ...body].join('\n')
}
