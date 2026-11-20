import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'
import {
  ADMIN_NOTIFICATION_TYPES,
  getAllAdminNotificationPreferences,
  saveAdminNotificationPreference,
} from '@/lib/notification-preferences'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'no-store' }

type PreferenceInput = {
  type: string
  channels: unknown
  audiences: unknown
}

function parseItems(body: Record<string, unknown>): PreferenceInput[] {
  const raw = Array.isArray(body.items)
    ? body.items
    : body.type
      ? [body]
      : []
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      type: typeof item.type === 'string' ? item.type : '',
      channels: item.channels,
      audiences: item.audiences,
    }))
}

export async function GET(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response

  const items = await getAllAdminNotificationPreferences()
  return NextResponse.json({ items, types: ADMIN_NOTIFICATION_TYPES }, { headers: noStore })
}

async function save(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { email } = auth.context

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const inputs = parseItems(body)
  if (!inputs.length) return NextResponse.json({ error: 'No preferences supplied.' }, { status: 400 })

  const allowed = new Set(ADMIN_NOTIFICATION_TYPES.map((item) => item.id))
  if (inputs.some((item) => !allowed.has(item.type))) {
    return NextResponse.json({ error: 'Unknown notification type.' }, { status: 400 })
  }
  if (
    inputs.some(
      (item) =>
        !Array.isArray(item.channels) ||
        !item.channels.length ||
        !Array.isArray(item.audiences) ||
        !item.audiences.length
    )
  ) {
    return NextResponse.json({ error: 'Choose at least one channel and one audience.' }, { status: 400 })
  }

  try {
    const saved = []
    for (const item of inputs) {
      saved.push(await saveAdminNotificationPreference({ ...item, updatedBy: email }))
    }
    await auth.context.db.from('whatsapp_control_audit').insert({
      actor: email,
      action: 'notification_preferences:update',
      detail: { types: saved.map((item) => item.id) },
    })
    const all = await getAllAdminNotificationPreferences()
    return NextResponse.json({ items: all, saved }, { headers: noStore })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save preferences.'
    console.error('[admin/notification-preferences] save failed:', message)
    return NextResponse.json(
      {
        error: message.includes('admin_notification_preferences')
          ? 'Run supabase/migration-admin-notification-preferences.sql once, then save again.'
          : 'Could not save preferences.',
      },
      { status: 500 }
    )
  }
}

export async function PUT(req: Request) {
  return save(req)
}

export async function PATCH(req: Request) {
  return save(req)
}
