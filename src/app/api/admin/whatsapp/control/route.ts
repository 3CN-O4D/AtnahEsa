import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Admin control for the WhatsApp bot.
 *
 * GET  — current singleton settings plus a few live counts.
 * PATCH — pause/resume, allow/block lists, per-chat AI, marketing cadence.
 *
 * The worker reads the same row, so a save here takes effect within a few
 * seconds without a redeploy.
 */

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '')

/**
 * The live table may still carry the pre-autonomy `active|paused` constraint.
 * Encode autonomy as `active` + `require_approval = false` and read it back the
 * same way, so the three-state control works before the migration lands.
 */
const LEGACY_MODE_ERROR = /mode_check|violates check constraint/i

function modeFromRow(row: { mode?: unknown; require_approval?: unknown } | null): 'autonomous' | 'regular' | 'off' {
  if (!row) return 'regular'
  if (row.mode === 'autonomous') return 'autonomous'
  if (row.mode === 'off') return 'off'
  if (row.mode === 'paused') return 'off'
  if (row.mode === 'active') return row.require_approval === false ? 'autonomous' : 'regular'
  return 'regular'
}

function legacyModePatch(patch: Record<string, unknown>) {
  const legacy = { ...patch }
  if (patch.mode === 'off') {
    legacy.mode = 'paused'
  } else {
    legacy.mode = 'active'
    legacy.require_approval = patch.mode === 'autonomous' ? false : true
  }
  return legacy
}

function normaliseList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(digits).filter(Boolean))]
}

const NUMERIC_KEYS = [
  'status_interval_minutes',
  'group_interval_minutes',
  'status_daily_limit',
  'group_daily_limit',
] as const

export async function GET(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db } = auth.context

  let { data: control } = await db
    .from('whatsapp_bot_control')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (!control) {
    const { data } = await db.from('whatsapp_bot_control').insert({ id: 1 }).select('*').maybeSingle()
    control = data
  }

  // Rows created before the three-state model used `active` / `paused`.
  if (control) control.mode = modeFromRow(control)

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const [chats, humanChats, messagesToday, pendingMarketing, urgentOpen] = await Promise.all([
    db.from('whatsapp_sessions').select('id', { count: 'exact', head: true }),
    db
      .from('whatsapp_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('ai_enabled', false),
    db
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfDay.toISOString()),
    db
      .from('whatsapp_marketing')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'approved', 'scheduled']),
    db
      .from('whatsapp_urgent')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),
  ])

  return NextResponse.json(
    {
      control: control ?? null,
      stats: {
        chats: chats.count ?? 0,
        humanChats: humanChats.count ?? 0,
        messagesToday: messagesToday.count ?? 0,
        pendingMarketing: pendingMarketing.count ?? 0,
        urgentOpen: urgentOpen.count ?? 0,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function PATCH(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db, email } = auth.context

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const actor = email || 'admin'
  const patch: Record<string, unknown> = { updated_by: actor, updated_at: new Date().toISOString() }
  const actions: Array<{ action: string; detail: Record<string, unknown> }> = []

  if (body.mode === 'autonomous' || body.mode === 'regular' || body.mode === 'off') {
    patch.mode = body.mode
    /*
     * One state at a time. Autonomous never waits for an approval; regular
     * always queues marketing for a human. Keep `require_approval` in sync so
     * older worker builds and the marketing picker agree with the mode.
     */
    if (body.mode === 'autonomous') patch.require_approval = false
    if (body.mode === 'regular') patch.require_approval = true
    actions.push({ action: `mode:${body.mode}`, detail: {} })
  }

  for (const key of ['marketing_enabled', 'require_approval'] as const) {
    if (typeof body[key] === 'boolean') patch[key] = body[key]
  }

  for (const key of NUMERIC_KEYS) {
    if (body[key] != null && Number.isFinite(Number(body[key]))) {
      patch[key] = Math.trunc(Number(body[key]))
    }
  }

  if (body.allowlist !== undefined) {
    patch.allowlist = normaliseList(body.allowlist)
    actions.push({ action: 'allowlist:set', detail: { count: (patch.allowlist as string[]).length } })
  }
  if (body.blocklist !== undefined) {
    patch.blocklist = normaliseList(body.blocklist)
    actions.push({ action: 'blocklist:set', detail: { count: (patch.blocklist as string[]).length } })
  }

  // Convenience actions from the UI's add/remove buttons.
  if (typeof body.list_action === 'string' && typeof body.phone === 'string') {
    const phone = digits(body.phone)
    if (!phone) return NextResponse.json({ error: 'phone is required' }, { status: 400 })

    const { data: current } = await db
      .from('whatsapp_bot_control')
      .select('allowlist, blocklist')
      .eq('id', 1)
      .maybeSingle()

    const allow = new Set(normaliseList(current?.allowlist))
    const block = new Set(normaliseList(current?.blocklist))

    if (body.list_action === 'allow-add') {
      allow.add(phone)
      block.delete(phone)
    } else if (body.list_action === 'allow-remove') {
      allow.delete(phone)
    } else if (body.list_action === 'block-add') {
      block.add(phone)
      allow.delete(phone)
    } else if (body.list_action === 'block-remove') {
      block.delete(phone)
    } else {
      return NextResponse.json({ error: 'Unknown list_action' }, { status: 400 })
    }

    patch.allowlist = [...allow]
    patch.blocklist = [...block]
    actions.push({ action: `list:${body.list_action}`, detail: { phone } })
  }

  // Per-chat AI toggle, used by the chat drawer.
  if (typeof body.ai_enabled === 'boolean' && (body.jid || body.phone)) {
    const jid = typeof body.jid === 'string' ? body.jid : null
    const phone = digits(body.phone)

    const { data: existing } = jid
      ? await db.from('whatsapp_sessions').select('wa_jid, phone').eq('wa_jid', jid).maybeSingle()
      : await db
          .from('whatsapp_sessions')
          .select('wa_jid, phone')
          .eq('phone', phone)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

    const targetJid = existing?.wa_jid || jid || `${phone}@s.whatsapp.net`
    const targetPhone = digits(existing?.phone || phone) || null

    const { error: chatError } = await db.from('whatsapp_sessions').upsert(
      {
        wa_jid: targetJid,
        phone: targetPhone,
        ai_enabled: body.ai_enabled,
        handoff_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'wa_jid' }
    )

    if (chatError) {
      console.error('[admin/whatsapp] chat toggle failed:', chatError.message)
      return NextResponse.json({ error: 'Could not update that chat.' }, { status: 500 })
    }

    actions.push({
      action: body.ai_enabled ? 'chat:ai-on' : 'chat:ai-off',
      detail: { jid: targetJid, phone: targetPhone },
    })
  }

  const apply = (values: Record<string, unknown>) =>
    db.from('whatsapp_bot_control').update(values).eq('id', 1).select('*').maybeSingle()

  let { data, error } = await apply(patch)

  /*
   * Pre-migration databases reject the new mode values. Retry with the legacy
   * encoding instead of failing the admin's click.
   */
  if (error && patch.mode && LEGACY_MODE_ERROR.test(error.message)) {
    const retry = await apply(legacyModePatch(patch))
    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error('[admin/whatsapp] control update failed:', error.message)
    return NextResponse.json({ error: 'Could not save the settings.' }, { status: 500 })
  }

  if (data) data.mode = modeFromRow(data)

  if (actions.length) {
    await db.from('whatsapp_control_audit').insert(
      actions.map((entry) => ({ actor, action: entry.action, detail: entry.detail }))
    )
  }

  return NextResponse.json({ control: data }, { headers: { 'Cache-Control': 'no-store' } })
}
