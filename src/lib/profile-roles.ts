import type { SupabaseClient } from '@supabase/supabase-js'
import { roleFromInput, rolesForMetadata, type UserRole } from './roles'

type RoleClient = SupabaseClient

/**
 * Persist a user's role selection in both places the app reads:
 * - auth.user_metadata.roles (source of truth for the profile checkboxes)
 * - profiles.role (legacy single value, kept for admin/RLS compatibility)
 *
 * The legacy column used to allow only hunter/lister/admin. Until the
 * flexible-roles migration is applied, "both" is stored as "hunter"; the
 * metadata array still records the real selection and the app deliberately
 * allows both hunter and lister tools for every signed-in user.
 */
export async function saveUserRoles(
  admin: RoleClient,
  userId: string,
  input: { roles?: unknown; role?: unknown },
  options: {
    currentRole?: unknown
    currentMetadata?: Record<string, unknown>
    allowAdmin?: boolean
  } = {}
) {
  const currentRole = options.currentRole
  let role: UserRole = roleFromInput(input.roles, input.role, currentRole)

  if (!options.allowAdmin && role === 'admin') role = 'hunter'

  const roles = rolesForMetadata(role === 'admin' ? 'both' : role)
  const metadata = {
    ...(options.currentMetadata ?? {}),
    role,
    roles,
  }

  const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: metadata,
  })
  if (metadataError) return { error: metadataError }

  const timestamp = new Date().toISOString()
  let { error: profileError } = await admin
    .from('profiles')
    .update({ role, updated_at: timestamp })
    .eq('id', userId)

  if (profileError && role === 'both') {
    profileError = (
      await admin
        .from('profiles')
        .update({ role: 'hunter', updated_at: timestamp })
        .eq('id', userId)
    ).error
  }

  return { error: profileError, role, roles }
}
