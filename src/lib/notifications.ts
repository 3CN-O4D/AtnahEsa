import { createAdminClient } from '@/lib/supabase/admin'

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
  category?: NotificationCategory
  title: string
  body?: string
  link?: string
  data?: Record<string, unknown>
}

export async function createNotification(input: CreateNotificationInput) {
  const {
    userId,
    role,
    category = 'system',
    title,
    body = '',
    link = '',
    data = {},
  } = input

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return

  try {
    const admin = createAdminClient()
    await admin.from('notifications').insert({
      user_id: userId || null,
      role: role || '',
      category,
      title,
      body,
      link,
      data,
      is_broadcast: !userId,
    })
  } catch (err) {
    console.error('createNotification failed:', err)
  }
}
