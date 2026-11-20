import { createAdminClient } from './admin'

/**
 * Find an auth user by email, paginating through all pages.
 * admin.listUsers() defaults to 50 per page; without pagination, users
 * beyond the first page cannot confirm signup or reset passwords.
 */
export async function findAuthUserByEmail(email: string) {
  const admin = createAdminClient()
  let page = 1
  const perPage = 1000

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    if (!data.users.length) return null
    const found = data.users.find((u) => u.email === email)
    if (found) return found
    if (data.users.length < perPage) return null
    page++
  }
}

/**
 * Find an auth user by phone number.
 *
 * OTP delivery is email-keyed in the `otps` table, so callers resolve the
 * phone back to the account's email. Phones are matched against both the
 * profile row and the auth user's raw_user_meta_data, and the input is tried
 * in the common Kenyan formats (072…, +2547…, 2547…, 7…).
 */
export async function findAuthUserByPhone(phone: string) {
  const admin = createAdminClient()
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null

  const candidates = [...new Set([
    digits,
    digits.replace(/^0/, '254'),
    digits.replace(/^254/, '0'),
    `+${digits}`,
    `+${digits.replace(/^0/, '254')}`,
  ])].filter(Boolean)

  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    if (!data.users.length) return null

    const found = data.users.find((u) => {
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>
      const metaPhone = String(meta.phone ?? meta.phone_number ?? '')
      const profilePhone = String((u as unknown as { phone?: unknown }).phone ?? '')
      const candidate = [metaPhone, profilePhone].find((value) => {
        const valueDigits = String(value || '').replace(/\D/g, '')
        return Boolean(valueDigits) && candidates.includes(valueDigits)
      })
      return Boolean(candidate)
    })

    if (found) return found
    if (data.users.length < perPage) return null
    page++
  }
}
