import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeAudiences, type NotificationAudience } from '@/lib/notification-audience'

/**
 * Admin-controlled delivery preferences.
 *
 * `web` means the normal website path (in-app notification + admin email).
 * `whatsapp` is the outbox mirror. Stored in `admin_notification_preferences`;
 * when that table has not been migrated yet we fall back to the defaults below
 * so notifications never stop working on a fresh deployment.
 */

export const ADMIN_CHANNELS = ['web', 'whatsapp'] as const
export type AdminChannel = (typeof ADMIN_CHANNELS)[number]

export type AdminNotificationTypeDefinition = {
  id: string
  label: string
  description: string
  channels: AdminChannel[]
  audiences: NotificationAudience[]
}

export const ADMIN_NOTIFICATION_TYPES: AdminNotificationTypeDefinition[] = [
  {
    id: 'house_request',
    label: 'House & mover requests',
    description: 'New house-hunting and mover requests from the website or Ase chat.',
    channels: ['web', 'whatsapp'],
    audiences: ['admin'],
  },
  {
    id: 'listing',
    label: 'Listing uploads',
    description: 'New houses uploaded for admin review.',
    channels: ['web', 'whatsapp'],
    audiences: ['admin'],
  },
  {
    id: 'booking',
    label: 'Bookings & viewings',
    description: 'Viewing requests, booking feedback and escrow view windows.',
    channels: ['web', 'whatsapp'],
    audiences: ['admin'],
  },
  {
    id: 'payment',
    label: 'Payments',
    description: 'STK push, till, Tuma, PayWave and manual payment alerts.',
    channels: ['web', 'whatsapp'],
    audiences: ['admin'],
  },
  {
    id: 'refund',
    label: 'Refunds',
    description: 'Approved refunds, B2C reversals and failed refunds.',
    channels: ['web', 'whatsapp'],
    audiences: ['admin'],
  },
  {
    id: 'payout',
    label: 'Lister payouts',
    description: 'Escrow releases and recorded lister payouts.',
    channels: ['web', 'whatsapp'],
    audiences: ['admin'],
  },
  {
    id: 'complaint',
    label: 'Complaints & reports',
    description: 'Contact-form messages, complaints and reported listings.',
    channels: ['web', 'whatsapp'],
    audiences: ['admin'],
  },
  {
    id: 'registration',
    label: 'New registrations',
    description: 'New hunter, lister and admin accounts.',
    channels: ['web', 'whatsapp'],
    audiences: ['admin'],
  },
  {
    id: 'wifi',
    label: 'WiFi & services',
    description: 'WiFi bookings, mover requests and service enquiries.',
    channels: ['web', 'whatsapp'],
    audiences: ['admin'],
  },
  {
    id: 'system',
    label: 'System & other',
    description: 'Everything that does not match another notification type.',
    channels: ['web', 'whatsapp'],
    audiences: ['admin'],
  },
]

export type AdminNotificationPreference = AdminNotificationTypeDefinition & {
  updated_at: string | null
  updated_by: string | null
  customised: boolean
}

function definitionFor(type: string): AdminNotificationTypeDefinition {
  return (
    ADMIN_NOTIFICATION_TYPES.find((item) => item.id === type) ??
    ADMIN_NOTIFICATION_TYPES[ADMIN_NOTIFICATION_TYPES.length - 1]
  )
}

function normalizeChannels(value: unknown, fallback: AdminChannel[]): AdminChannel[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const set = new Set<AdminChannel>()
  for (const item of raw) {
    const key = String(item).trim().toLowerCase()
    if ((ADMIN_CHANNELS as readonly string[]).includes(key)) set.add(key as AdminChannel)
  }
  return set.size ? [...set] : [...fallback]
}

export function normalizeNotificationChannels(value: unknown): AdminChannel[] {
  return normalizeChannels(value, ['web', 'whatsapp'])
}

function preferenceFromRow(row: Record<string, unknown> | null, type: string): AdminNotificationPreference {
  const base = definitionFor(type)
  return {
    ...base,
    channels: normalizeChannels(row?.channels, base.channels),
    audiences: normalizeAudiences(row?.audiences ?? base.audiences),
    updated_at: typeof row?.updated_at === 'string' ? row.updated_at : null,
    updated_by: typeof row?.updated_by === 'string' ? row.updated_by : null,
    customised: Boolean(row),
  }
}

function defaults(): AdminNotificationPreference[] {
  return ADMIN_NOTIFICATION_TYPES.map((item) => preferenceFromRow(null, item.id))
}

/** Map an admin email subject to a configurable notification type. */
export function notificationTypeForSubject(subject: string): string {
  const value = String(subject || '').toLowerCase()
  if (/house request|request house|house uploaded|mover request/.test(value)) return 'house_request'
  if (/listing/.test(value)) return 'listing'
  if (/refund|b2c/.test(value)) return 'refund'
  if (/payout|lister paid/.test(value)) return 'payout'
  if (/wifi|service/.test(value)) return 'wifi'
  if (/contact|complaint|reported/.test(value)) return 'complaint'
  if (/registration|new user/.test(value)) return 'registration'
  if (/payment|stk|till|tuma|daraja|verification|escrow/.test(value)) return 'payment'
  if (/booking|viewing/.test(value)) return 'booking'
  return 'system'
}

/** Map an in-app notification category to a configurable notification type. */
export function notificationTypeForCategory(category: string | null | undefined): string {
  const value = String(category || '').toLowerCase()
  if (value === 'new_house') return 'house_request'
  if (value === 'listing') return 'listing'
  if (value === 'transaction') return 'payment'
  if (value === 'booking') return 'booking'
  if (value === 'advert') return 'system'
  return 'system'
}

export async function getAllAdminNotificationPreferences(): Promise<AdminNotificationPreference[]> {
  try {
    const db = createAdminClient()
    const { data, error } = await db.from('admin_notification_preferences').select('*')
    if (error) {
      // Fresh deployments may not have the migration yet; defaults keep alerts on.
      console.warn('[notification-preferences] using defaults:', error.message)
      return defaults()
    }
    const byType = new Map<string, Record<string, unknown>>()
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      if (typeof row.notification_type === 'string') byType.set(row.notification_type, row)
    }
    return ADMIN_NOTIFICATION_TYPES.map((item) => preferenceFromRow(byType.get(item.id) ?? null, item.id))
  } catch (error) {
    console.warn('[notification-preferences] using defaults:', error)
    return defaults()
  }
}

export async function getAdminNotificationPreference(type: string): Promise<AdminNotificationPreference> {
  const key = definitionFor(type).id
  try {
    const db = createAdminClient()
    const { data, error } = await db
      .from('admin_notification_preferences')
      .select('*')
      .eq('notification_type', key)
      .maybeSingle()
    if (error || !data) return preferenceFromRow(null, key)
    return preferenceFromRow(data as Record<string, unknown>, key)
  } catch {
    return preferenceFromRow(null, key)
  }
}

export async function saveAdminNotificationPreference(input: {
  type: string
  channels: unknown
  audiences: unknown
  updatedBy: string
}): Promise<AdminNotificationPreference> {
  const type = definitionFor(input.type).id
  const channels = normalizeChannels(input.channels, definitionFor(type).channels)
  const audiences = normalizeAudiences(input.audiences ?? ['admin'])
  const db = createAdminClient()
  const { data, error } = await db
    .from('admin_notification_preferences')
    .upsert(
      {
        notification_type: type,
        channels,
        audiences,
        updated_at: new Date().toISOString(),
        updated_by: input.updatedBy.slice(0, 200),
      },
      { onConflict: 'notification_type' }
    )
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return preferenceFromRow((data as Record<string, unknown>) ?? null, type)
}
