import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/whatsapp'

/**
 * WhatsApp outbox.
 *
 * The website cannot hold a Baileys socket (Vercel functions are short-lived),
 * so anything that should reach a user or admin on WhatsApp is written here and
 * delivered by the always-on worker. Nothing here throws: notifications must
 * never break the email/payment flow that triggered them.
 */

export type WhatsAppKind = 'notification' | 'otp' | 'receipt' | 'alert' | 'document'

export interface EnqueueWhatsAppInput {
  to: string | null | undefined
  text: string
  kind?: WhatsAppKind
  /** Public URL of an image/document. */
  mediaUrl?: string | null
  /** Small binary payload (e.g. a generated receipt PDF), base64 encoded. */
  mediaBase64?: string | null
  mediaMime?: string | null
  fileName?: string | null
  meta?: Record<string, unknown>
}

function enabled(): boolean {
  return (process.env.WHATSAPP_NOTIFICATIONS || 'on').toLowerCase() !== 'off'
}

/** Kenyan numbers are normalised to 2547… / 2541…; others to raw digits. */
export function toWhatsAppNumber(input: string | null | undefined): string | null {
  const normalised = normalizePhone(input ?? '')
  return normalised && normalised.length >= 10 ? normalised : null
}

export async function phoneForEmail(email: string | null | undefined): Promise<string | null> {
  if (!email || !email.includes('@')) return null
  const value = email.trim()
  try {
    const supabase = createAdminClient()
    // Emails are usually stored lower-case; try that first, then the raw value.
    const candidates = [...new Set([value.toLowerCase(), value])]
    for (const candidate of candidates) {
      const { data } = await supabase.from('profiles').select('phone').eq('email', candidate).maybeSingle()
      const phone = toWhatsAppNumber(data?.phone)
      if (phone) return phone
    }
    return null
  } catch {
    return null
  }
}

export async function phoneForUserId(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null
  try {
    const supabase = createAdminClient()
    const { data } = await supabase.from('profiles').select('phone').eq('id', userId).maybeSingle()
    return toWhatsAppNumber(data?.phone)
  } catch {
    return null
  }
}

/** Queue one WhatsApp message. Returns true when a row was written. */
export async function enqueueWhatsApp(input: EnqueueWhatsAppInput): Promise<boolean> {
  if (!enabled()) return false
  const phone = toWhatsAppNumber(input.to)
  if (!phone) return false

  const text = String(input.text || '').trim().slice(0, 4000)
  if (!text) return false

  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('whatsapp_outbox').insert({
      phone,
      kind: input.kind ?? 'notification',
      body: text,
      media_url: input.mediaUrl ?? null,
      media_base64: input.mediaBase64 ?? null,
      media_mime: input.mediaMime ?? null,
      file_name: input.fileName ?? null,
      meta: input.meta ?? {},
    })
    if (error) {
      console.error('[whatsapp-outbox] insert failed:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('[whatsapp-outbox] enqueue failed:', err)
    return false
  }
}

/** Turn a notification's subject + fields into a tidy WhatsApp message. */
export function renderNotification(subject: string, title: string, fields: Record<string, string>): string {
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => `• *${label}:* ${String(value).slice(0, 400)}`)

  return [`*${subject}*`, title, '', ...lines].filter((line, i) => line !== '' || i === 2).join('\n').slice(0, 4000)
}

/** Mirror a user notification to WhatsApp when the account has a phone number. */
export async function notifyUserWhatsApp(
  email: string | null | undefined,
  subject: string,
  title: string,
  fields: Record<string, string>
): Promise<void> {
  try {
    const phone = await phoneForEmail(email)
    if (!phone) return
    await enqueueWhatsApp({
      to: phone,
      kind: 'notification',
      text: renderNotification(subject, title, fields),
      meta: { email: email ?? null, source: 'email-mirror' },
    })
  } catch {
    /* notifications are best-effort */
  }
}

/** Mirror an admin notification to the configured admin WhatsApp numbers. */
export async function notifyAdminsWhatsApp(
  subject: string,
  title: string,
  fields: Record<string, string>
): Promise<void> {
  const numbers = (process.env.ADMIN_WHATSAPP_NUMBERS || '')
    .split(',')
    .map((n) => toWhatsAppNumber(n))
    .filter((n): n is string => Boolean(n))

  if (numbers.length === 0) return
  const text = renderNotification(subject, title, fields)
  await Promise.allSettled(
    numbers.map((phone) => enqueueWhatsApp({ to: phone, kind: 'alert', text, meta: { source: 'admin-email-mirror' } }))
  )
}

/** WhatsApp copy of an email OTP (only when the account has a phone number). */
export async function sendOtpWhatsApp(email: string, otp: string, type: string): Promise<void> {
  try {
    const phone = await phoneForEmail(email)
    if (!phone) return

    const labels: Record<string, string> = {
      signup: 'Verify your AseHanta account',
      login: 'Your AseHanta sign-in code',
      password_reset: 'Reset your AseHanta password',
      password_create: 'Create your AseHanta password',
      profile_update: 'Confirm your AseHanta profile changes',
      email_change: 'Verify your new email address',
      delete_account: 'Confirm the deletion of your AseHanta account',
    }
    const reason = labels[type] ?? 'Your AseHanta verification code'

    await enqueueWhatsApp({
      to: phone,
      kind: 'otp',
      text: [
        `🔐 *${reason}*`,
        '',
        `*${otp}*`,
        '',
        'This code expires in 10 minutes.',
        'If you did not request it, ignore this message — your account is safe.',
        '',
        'AseHanta',
      ].join('\n'),
      meta: { email, type },
    })
  } catch {
    /* OTP delivery over WhatsApp is best-effort; email still went out */
  }
}
