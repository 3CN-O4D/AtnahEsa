/**
 * WhatsApp marketing: status updates and group posts.
 *
 * The worker owns delivery because only it holds the socket. Drafts, approval
 * and wording live in the Next.js app; this module only:
 *
 *   1. discovers groups and stores them (disabled) for the admin panel,
 *   2. asks the app for a new AI-written draft on the configured cadence,
 *   3. sends approved, due rows to status or to an enabled group,
 *   4. composes a branded card from the real listing photo — never a fake
 *      house — and records the result.
 *
 * Rate limits are deliberate. Group blasting is the fastest way to lose a
 * WhatsApp number, so a group must be enabled by an admin, has its own
 * cadence, and the whole account has a daily cap.
 */

import sharp from 'sharp'

const DAY_MS = 24 * 60 * 60 * 1000
const STATUS_MAX_RECIPIENTS = 3000

const digits = (value) => String(value ?? '').replace(/\D/g, '')
const nowIso = () => new Date().toISOString()
const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

function xml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function wrap(text, maxChars, maxLines) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''

  for (const word of words) {
    if (line && (line + ' ' + word).length > maxChars) {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line && lines.length < maxLines) lines.push(line)

  if (lines.length === maxLines) {
    const consumed = lines.join(' ').length
    if (consumed < String(text ?? '').length) {
      lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, '') + '…'
    }
  }
  return lines
}

async function fetchBuffer(url, timeout = 15000) {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: 'follow' })
    if (!res.ok) return null
    const type = String(res.headers.get('content-type') || '')
    if (!type.startsWith('image/') && !type.includes('octet-stream')) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    return buffer.length > 1000 ? buffer : null
  } catch {
    return null
  }
}

function gradientSvg(width, height) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.30" stop-color="#04110d" stop-opacity="0.02"/>
        <stop offset="0.55" stop-color="#04110d" stop-opacity="0.52"/>
        <stop offset="0.78" stop-color="#04110d" stop-opacity="0.93"/>
        <stop offset="1" stop-color="#04110d" stop-opacity="0.99"/>
      </linearGradient>
      <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#10b981"/>
        <stop offset="1" stop-color="#0ea5a4"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#fade)"/>
    <rect x="0" y="0" width="${width}" height="10" fill="url(#brand)"/>
  </svg>`)
}

function cardSvg({ width, height, title, location, rent, cta, footer, brand = 'ASEHANTA' }) {
  const margin = Math.round(width * 0.065)
  const tall = height / width > 1.5
  const titleSize = tall ? 62 : 58
  const bodySize = tall ? 36 : 34
  const rentSize = tall ? 52 : 48
  const ctaSize = tall ? 30 : 29
  const titleLines = wrap(title, tall ? 24 : 26, 3)

  let y = Math.round(height * (tall ? 0.56 : 0.53))
  const parts = []

  parts.push(
    `<rect x="${margin}" y="${Math.round(height * 0.055)}" rx="999" width="${brand.length * (tall ? 26 : 24) + 58}" height="${tall ? 66 : 62}" fill="#10b981" fill-opacity="0.94"/>`,
    `<text x="${margin + (tall ? 29 : 27)}" y="${Math.round(height * 0.055) + (tall ? 44 : 41)}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${tall ? 28 : 26}" font-weight="bold" fill="#04110d" letter-spacing="1">${xml(brand)}</text>`
  )

  for (const line of titleLines) {
    parts.push(
      `<text x="${margin}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${titleSize}" font-weight="bold" fill="#ffffff">${xml(line)}</text>`
    )
    y += Math.round(titleSize * 1.18)
  }

  y += Math.round(titleSize * 0.12)
  if (location) {
    parts.push(
      `<text x="${margin}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${bodySize}" fill="#d1fae5">${xml(location)}</text>`
    )
    y += Math.round(bodySize * 1.55)
  }

  if (rent) {
    parts.push(
      `<text x="${margin}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${rentSize}" font-weight="bold" fill="#34d399">${xml(rent)}</text>`
    )
    y += Math.round(rentSize * 1.5)
  }

  if (cta) {
    parts.push(
      `<text x="${margin}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${ctaSize}" fill="#e5e7eb">${xml(cta)}</text>`
    )
  }

  parts.push(
    `<text x="${margin}" y="${height - Math.round(height * 0.045)}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${tall ? 28 : 26}" font-weight="bold" fill="#a7f3d0">${xml(footer)}</text>`
  )

  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
  )
}

function fallbackBackground(width, height) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#022c22"/>
        <stop offset="0.55" stop-color="#064e3b"/>
        <stop offset="1" stop-color="#0f766e"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.78" cy="0.18" r="0.55">
        <stop offset="0" stop-color="#34d399" stop-opacity="0.45"/>
        <stop offset="1" stop-color="#34d399" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <rect width="${width}" height="${height}" fill="url(#glow)"/>
  </svg>`)
}

function rentLabel(listing) {
  if (listing?.rent) return `KSh ${Number(listing.rent).toLocaleString('en-KE')}/month`
  if (listing?.price) return `KSh ${Number(listing.price).toLocaleString('en-KE')} booking fee`
  return null
}

export async function composeMarketingCard({ listing = null, tall = false, headline = null, subline = null }) {
  const width = 1080
  const height = tall ? 1920 : 1350
  const photoUrl = Array.isArray(listing?.images) ? listing.images.find(Boolean) : null
  const photo = await fetchBuffer(photoUrl)

  let base
  if (photo) {
    base = sharp(photo)
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .modulate({ brightness: 0.92 })
  } else {
    base = sharp(fallbackBackground(width, height))
  }

  const title = headline || listing?.title || 'Find your next home in Eldoret'
  const location =
    subline ||
    listing?.descriptive_location ||
    listing?.location ||
    (listing ? null : 'Verified houses · Movers · WiFi')

  const rent = listing ? rentLabel(listing) : null
  const cta = listing ? 'Book a viewing on asehanta.com' : 'Join AseHanta today'

  const svg = cardSvg({
    width,
    height,
    title,
    location,
    rent,
    cta,
    footer: 'asehanta.com',
    brand: 'ASEHANTA',
  })

  return base
    .composite([{ input: gradientSvg(width, height) }, { input: svg }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer()
}

export async function syncGroups(sock, supabase, log = console) {
  if (!sock?.groupFetchAllParticipating) return 0

  try {
    const groups = await sock.groupFetchAllParticipating()
    const rows = Object.values(groups ?? {}).map((group) => ({
      jid: group.id,
      name: group.subject || 'WhatsApp group',
      member_count: Array.isArray(group.participants) ? group.participants.length : null,
      updated_at: nowIso(),
    }))

    if (!rows.length) return 0

    const { error } = await supabase
      .from('whatsapp_marketing_groups')
      .upsert(rows, { onConflict: 'jid' })
    if (error) throw new Error(error.message)

    log.log?.(`[marketing] discovered ${rows.length} groups`)
    return rows.length
  } catch (error) {
    log.error?.('[marketing] group discovery failed:', error?.message ?? error)
    return 0
  }
}

export async function statusRecipients(supabase, { ownPhone, adminNumbers = [], blocklist = [] } = {}) {
  const phones = new Set()
  const blocked = new Set(blocklist.map(digits))

  const [{ data: sessions }, { data: outbox }] = await Promise.all([
    supabase
      .from('whatsapp_sessions')
      .select('phone')
      .not('phone', 'is', null)
      .gte('updated_at', hoursAgo(24 * 120))
      .limit(STATUS_MAX_RECIPIENTS),
    supabase
      .from('whatsapp_outbox')
      .select('phone')
      .eq('status', 'sent')
      .gte('created_at', hoursAgo(24 * 120))
      .limit(STATUS_MAX_RECIPIENTS),
  ])

  for (const row of [...(sessions ?? []), ...(outbox ?? [])]) {
    const phone = digits(row.phone)
    if (phone && !blocked.has(phone)) phones.add(phone)
  }
  for (const phone of adminNumbers) {
    const clean = digits(phone)
    if (clean && !blocked.has(clean)) phones.add(clean)
  }

  const own = digits(typeof ownPhone === 'function' ? ownPhone() : ownPhone)
  if (own) phones.delete(own)

  return [...phones].slice(0, STATUS_MAX_RECIPIENTS).map((phone) => `${phone}@s.whatsapp.net`)
}

async function listingFor(supabase, id) {
  if (!id) return null
  const { data } = await supabase
    .from('listings')
    .select('id, title, rent, price, location, descriptive_location, house_type, images, status, vacancy')
    .eq('id', id)
    .maybeSingle()
  return data ?? null
}

async function claim(supabase, row) {
  const { data, error } = await supabase
    .from('whatsapp_marketing')
    .update({ status: 'sending', updated_at: nowIso() })
    .eq('id', row.id)
    .eq('status', 'approved')
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[marketing] claim failed:', error.message)
    return null
  }
  return data ?? null
}

async function mark(supabase, id, patch) {
  const { error } = await supabase
    .from('whatsapp_marketing')
    .update({ ...patch, updated_at: nowIso() })
    .eq('id', id)
  if (error) console.error('[marketing] update failed:', error.message)
}

export async function sendMarketingRow({ sock, supabase, row, control, ownPhone, adminNumbers, log = console }) {
  const claimed = await claim(supabase, row)
  if (!claimed) return false

  try {
    const listing = await listingFor(supabase, claimed.listing_id)
    const tall = claimed.channel === 'status'
    const image = claimed.image_url
      ? (await fetchBuffer(claimed.image_url)) ||
        (await composeMarketingCard({ listing, tall, headline: claimed.meta?.headline, subline: claimed.meta?.subline }))
      : await composeMarketingCard({
          listing,
          tall,
          headline: claimed.meta?.headline,
          subline: claimed.meta?.subline,
        })

    const content = { image, caption: String(claimed.body || '').slice(0, 3000) }

    if (claimed.channel === 'status') {
      const snap = await control.read()
      const recipients = await statusRecipients(supabase, {
        ownPhone,
        adminNumbers,
        blocklist: snap.blocklist,
      })

      if (!recipients.length) throw new Error('no status recipients yet')

      await sock.sendMessage('status@broadcast', content, { statusJidList: recipients })
    } else {
      if (!claimed.target_jid) throw new Error('group post has no target')

      const { data: group } = await supabase
        .from('whatsapp_marketing_groups')
        .select('jid, enabled')
        .eq('jid', claimed.target_jid)
        .maybeSingle()

      if (!group?.enabled) {
        await mark(supabase, claimed.id, { status: 'skipped', error: 'group is disabled' })
        return false
      }

      await sock.sendMessage(claimed.target_jid, content)

      await supabase
        .from('whatsapp_marketing_groups')
        .update({ last_posted_at: nowIso(), updated_at: nowIso() })
        .eq('jid', claimed.target_jid)
    }

    await mark(supabase, claimed.id, { status: 'sent', sent_at: nowIso(), error: null })
    log.log?.(`[marketing] sent ${claimed.channel} post ${claimed.id}`)
    return true
  } catch (error) {
    const message = String(error?.message ?? error).slice(0, 500)
    await mark(supabase, claimed.id, { status: 'failed', error: message })
    log.error?.(`[marketing] ${claimed.channel} post failed:`, message)
    return false
  }
}

async function requestDraft({ apiUrl, secret, payload, log }) {
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/whatsapp/marketing/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bridge-secret': secret,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  })

  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.draft) {
    throw new Error(data?.error || `draft endpoint returned ${res.status}`)
  }
  return data
}

export function createMarketing({
  supabase,
  control,
  apiUrl,
  secret,
  ownPhone,
  adminNumbers = [],
  sendText,
  log = console,
}) {
  let timer = null
  let busy = false

  function start(sock) {
    if (sock) currentSock = sock
    if (timer) return
    timer = setInterval(() => void tick(), 60_000)
    void tick(sock)
  }

  function stop() {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  async function pending(channel, targetJid = null) {
    let query = supabase
      .from('whatsapp_marketing')
      .select('id', { count: 'exact', head: true })
      .eq('channel', channel)
      .in('status', ['draft', 'approved', 'scheduled', 'sending'])

    if (targetJid) query = query.eq('target_jid', targetJid)
    const { count } = await query
    return count ?? 0
  }

  async function sentToday(channel) {
    let query = supabase
      .from('whatsapp_marketing')
      .select('id', { count: 'exact', head: true })
      .eq('channel', channel)
      .eq('status', 'sent')
      .gte('sent_at', hoursAgo(24))

    const { count } = await query
    return count ?? 0
  }

  async function notifyDraft(draft) {
    if (!sendText) return
    const where = draft.channel === 'group' ? `group ${draft.target_jid}` : 'WhatsApp status'
    const text = [
      `📣 *New marketing draft* (${where})`,
      '',
      String(draft.body || '').slice(0, 700),
      '',
      'Approve or edit it in the admin panel:',
      'https://www.asehanta.com/admin/whatsapp',
    ].join('\n')

    for (const number of adminNumbers) {
      try {
        await sendText(`${digits(number)}@s.whatsapp.net`, text)
      } catch (error) {
        log.error?.(`[marketing] draft notice to ${number} failed:`, error?.message ?? error)
      }
    }
  }

  async function generateStatus(snap) {
    if (tooSoon(snap.last_status_at, snap.status_interval_minutes)) return
    if ((await sentToday('status')) >= snap.status_daily_limit) return
    if ((await pending('status')) > 0) return

    try {
      const data = await requestDraft({
        apiUrl,
        secret,
        log,
        payload: { channel: 'status', topic: 'auto', auto: true },
      })
      await control.touchStatus('marketing')
      if (data.draft.status === 'draft') await notifyDraft(data.draft)
      else if (data.draft.status === 'approved') {
        await sendMarketingRow({ sock: currentSock, supabase, row: data.draft, control, ownPhone, adminNumbers, log })
      }
    } catch (error) {
      log.error?.('[marketing] status draft failed:', error?.message ?? error)
      await control.touchStatus('marketing')
    }
  }

  async function generateGroup(snap) {
    if (tooSoon(snap.last_group_at, snap.group_interval_minutes)) return
    if ((await sentToday('group')) >= snap.group_daily_limit) return

    const { data: groups } = await supabase
      .from('whatsapp_marketing_groups')
      .select('jid, name, cadence_minutes, last_posted_at')
      .eq('enabled', true)
      .order('last_posted_at', { ascending: true, nullsFirst: true })
      .limit(10)

    const due = (groups ?? []).find(
      (group) => !tooSoon(group.last_posted_at, Math.max(Number(group.cadence_minutes) || 1440, 180))
    )
    if (!due) return
    if ((await pending('group', due.jid)) > 0) return

    try {
      const data = await requestDraft({
        apiUrl,
        secret,
        log,
        payload: { channel: 'group', target_jid: due.jid, topic: 'auto', auto: true },
      })
      await control.touchGroup('marketing')
      if (data.draft.status === 'draft') await notifyDraft(data.draft)
      else if (data.draft.status === 'approved') {
        await sendMarketingRow({ sock: currentSock, supabase, row: data.draft, control, ownPhone, adminNumbers, log })
      }
    } catch (error) {
      log.error?.('[marketing] group draft failed:', error?.message ?? error)
      await control.touchGroup('marketing')
    }
  }

  let currentSock = null

  async function tick(sock = currentSock) {
    currentSock = sock
    if (!sock || busy) return

    busy = true
    try {
      const snap = await control.read()
      if (!snap.marketing_enabled) return

      const { data: due } = await supabase
        .from('whatsapp_marketing')
        .select('*')
        .eq('status', 'approved')
        .lte('scheduled_for', nowIso())
        .order('scheduled_for', { ascending: true })
        .limit(3)

      for (const row of due ?? []) {
        await sendMarketingRow({ sock, supabase, row, control, ownPhone, adminNumbers, log })
      }

      await generateStatus(snap)
      await generateGroup(snap)
    } catch (error) {
      log.error?.('[marketing] tick failed:', error?.message ?? error)
    } finally {
      busy = false
    }
  }

  return { start, stop, tick }
}

function tooSoon(lastAt, intervalMinutes) {
  if (!lastAt) return false
  const last = new Date(lastAt).getTime()
  if (Number.isNaN(last)) return false
  return Date.now() - last < Math.max(Number(intervalMinutes) || 0, 1) * 60 * 1000
}
