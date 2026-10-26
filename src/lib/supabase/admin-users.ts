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
