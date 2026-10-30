/**
 * Helpers for turning a phone number or WhatsApp username into a safe
 * click-to-chat link. WhatsApp accepts both:
 *
 *   https://wa.me/254712345678
 *   https://wa.me/janedoe
 *
 * Kenyan mobile numbers are normalised to the 2547… / 2541… form so that
 * `0712…`, `712…`, `+254712…` and `254712…` all produce the same link.
 */

export type WhatsAppTarget = {
  kind: 'phone' | 'username'
  /** Value used in the wa.me path (no leading + or @). */
  value: string
  /** Human-friendly value, e.g. `+254712345678` or `@janedoe`. */
  display: string
}

const KENYAN_MOBILE_REST = /^[17]\d{8}$/

/** Normalise a phone number to digits only, in international form when possible. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed || /[a-z]/i.test(trimmed)) return null

  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null

  // 254 7XX XXX XXX / 254 1XX XXX XXX
  if (digits.startsWith('254')) {
    const rest = digits.slice(3)
    if (KENYAN_MOBILE_REST.test(rest)) return `254${rest}`
    if (digits.length >= 10 && digits.length <= 15) return digits
    return null
  }

  // 07XX XXX XXX / 01XX XXX XXX
  if (digits.startsWith('0')) {
    const rest = digits.slice(1)
    if (KENYAN_MOBILE_REST.test(rest)) return `254${rest}`
    if (digits.length >= 9 && digits.length <= 15) return digits
    return null
  }

  // 7XX XXX XXX / 1XX XXX XXX
  if (KENYAN_MOBILE_REST.test(digits)) return `254${digits}`

  // Other international numbers (10–15 digits).
  if (digits.length >= 10 && digits.length <= 15) return digits
  return null
}

/** Validate a phone number without forcing a Kenyan prefix. */
export function isValidPhone(input: string | null | undefined): boolean {
  return normalizePhone(input) !== null
}

/** Normalise a WhatsApp username (the @ is optional). */
export function normalizeUsername(input: string | null | undefined): string | null {
  if (!input) return null
  const handle = input.trim().replace(/^@+/, '').replace(/\s+/g, '')
  if (!handle) return null
  // WhatsApp usernames are letters, numbers, dots and underscores.
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(handle)) return null
  // An all-digit handle is a phone number, not a username.
  if (/^\d+$/.test(handle)) return null
  return handle
}

/** Parse either a phone number or a username into a WhatsApp target. */
export function parseWhatsAppContact(input: string | null | undefined): WhatsAppTarget | null {
  if (!input) return null
  const value = input.trim()
  if (!value) return null

  // Phone-looking values (digits plus common punctuation only).
  if (/^[+\d][\d\s().-]*$/.test(value)) {
    const phone = normalizePhone(value)
    if (phone) return { kind: 'phone', value: phone, display: `+${phone}` }
  }

  const username = normalizeUsername(value)
  if (username) return { kind: 'username', value: username, display: `@${username}` }

  // Last chance: tolerate an oddly formatted phone number.
  const phone = normalizePhone(value)
  if (phone) return { kind: 'phone', value: phone, display: `+${phone}` }

  return null
}

/** True when a value can be used as a WhatsApp phone number or username. */
export function isValidWhatsAppContact(input: string | null | undefined): boolean {
  return parseWhatsAppContact(input) !== null
}

/**
 * Build a wa.me link for a phone number or username.
 * Returns null when the contact cannot be understood, so callers can hide
 * the action instead of rendering a broken link.
 */
export function getWhatsAppLink(
  contact: string | null | undefined,
  message?: string
): string | null {
  const target = parseWhatsAppContact(contact)
  if (!target) return null
  const base = `https://wa.me/${encodeURIComponent(target.value)}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

/** Format a contact for display, falling back to the raw value. */
export function formatWhatsAppContact(contact: string | null | undefined): string {
  const target = parseWhatsAppContact(contact)
  return target?.display || (contact || '').trim()
}

/** Store a canonical value (`2547…` for numbers, `@handle` for usernames). */
export function canonicalWhatsAppContact(input: string | null | undefined): string | null {
  const target = parseWhatsAppContact(input)
  if (!target) return null
  return target.kind === 'phone' ? target.value : `@${target.value}`
}
