export type NotificationAudience = 'everyone' | 'hunter' | 'lister' | 'admin'

export type NotificationRow = {
  id: string | number
  user_id: string | null
  role?: string | null
  category?: string
  title?: string
  body?: string | null
  link?: string | null
  data?: Record<string, unknown> | null
  is_broadcast?: boolean | null
  read_at?: string | null
  created_at?: string
}

const VALID: NotificationAudience[] = ['everyone', 'hunter', 'lister', 'admin']

/** Accepts "hunters", ["hunter","admin"], a comma string, etc. */
export function normalizeAudiences(input: unknown): NotificationAudience[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : input == null
        ? []
        : [input]

  const set = new Set<NotificationAudience>()
  for (const value of raw) {
    const key = String(value).trim().toLowerCase().replace(/s$/, '')
    if ((VALID as string[]).includes(key)) set.add(key as NotificationAudience)
  }
  if (set.size === 0) set.add('everyone')
  if (set.has('everyone')) return ['everyone']
  return [...set]
}

export function getNotificationAudiences(row: NotificationRow): NotificationAudience[] {
  const fromData = row.data?.audiences
  if (Array.isArray(fromData) && fromData.length > 0) return normalizeAudiences(fromData)
  if (!row.role) return ['everyone']
  return normalizeAudiences(row.role)
}

export function isNotificationVisibleTo(
  row: NotificationRow,
  userId: string,
  role: string | null | undefined
): boolean {
  if (row.user_id && row.user_id !== userId) return false
  const audiences = getNotificationAudiences(row)
  return audiences.includes('everyone') || audiences.includes((role || '') as NotificationAudience)
}

export function isNotificationExpired(row: NotificationRow, now = Date.now()): boolean {
  const expiresAt = row.data?.expires_at
  if (typeof expiresAt !== 'string') return false
  const ts = new Date(expiresAt).getTime()
  return Number.isFinite(ts) && ts <= now
}

export function isNotificationDismissed(row: NotificationRow, userId: string): boolean {
  const dismissed = row.data?.dismissed_by
  return Array.isArray(dismissed) && dismissed.includes(userId)
}

export function effectiveReadAt(row: NotificationRow, userId: string): string | null {
  if (row.user_id === userId) return row.read_at || null
  const readBy = row.data?.read_by
  if (Array.isArray(readBy) && readBy.includes(userId)) {
    const at = row.data?.read_at_by_user
    return typeof at === 'string' ? at : 'read'
  }
  return row.read_at || null
}
