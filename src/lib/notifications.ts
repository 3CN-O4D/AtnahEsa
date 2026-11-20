import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeAudiences, type NotificationAudience } from '@/lib/notification-audience'
import { getAdminNotificationPreference, notificationTypeForCategory } from '@/lib/notification-preferences'

export type NotificationCategory =
  | 'advert'
  | 'new_house'
  | 'transaction'
  | 'linking'
  | 'booking'
  | 'listing'
  | 'system'

type CreateNotificationInput = {
  userId?: string | null
  role?: string
  /** Explicit audience. Only used for broadcasts / role messages. */
  audiences?: NotificationAudience[] | string
  /** Set true only for messages every signed-in user should see. */
  broadcast?: boolean
  category?: NotificationCategory
  title: string
  body?: string
  link?: string
  data?: Record<string, unknown>
}

/**
 * Create one in-app notification.
 *
 * Privacy rule: a notification is delivered to exactly one audience — a user,
 * a role, or (when explicitly asked) everyone. A message with no resolvable
 * recipient is dropped instead of silently becoming a broadcast, so
 * transactional alerts can never leak to unrelated users.
 */
export async function createNotification(input: CreateNotificationInput) {
  const {
    userId,
    role,
    audiences,
    broadcast = false,
    category = 'system',
    title,
    body = '',
    link = '',
    data = {},
  } = input

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return

  const recipientId = typeof userId === 'string' && userId.trim() ? userId : null
  const roleKey = role && role.trim() ? role.trim() : ''

  if (!recipientId && !roleKey && !broadcast) {
    console.warn('[notifications] Skipped a notification with no recipient:', { category, title })
    return
  }

  const resolvedAudiences = recipientId
    ? null
    : broadcast
      ? normalizeAudiences(audiences ?? ['everyone'])
      : normalizeAudiences(audiences ?? [roleKey])

  // Broadcast audiences are governed by the admin's per-type preferences.
  // Personal notifications always go to their owner and skip this check.
  let finalAudiences = resolvedAudiences
  if (!recipientId && resolvedAudiences) {
    const preference = await getAdminNotificationPreference(notificationTypeForCategory(category))
    finalAudiences = resolvedAudiences.filter((audience) => preference.audiences.includes(audience))
    if (!finalAudiences.length) {
      console.warn('[notifications] Skipped a broadcast outside its configured audience:', {
        category,
        title,
        requested: resolvedAudiences,
        allowed: preference.audiences,
      })
      return
    }
  }

  try {
    const admin = createAdminClient()
    await admin.from('notifications').insert({
      user_id: recipientId,
      // Broadcasts stay visible at the RLS level; the API filters by audience.
      role: recipientId || broadcast ? '' : roleKey,
      category,
      title,
      body,
      link,
      data: finalAudiences ? { ...data, audiences: finalAudiences } : data,
      is_broadcast: !recipientId,
    })
  } catch (err) {
    console.error('createNotification failed:', err)
  }
}
