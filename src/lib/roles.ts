/**
 * AseHanta roles.
 *
 * `profiles.role` remains a single text column, but it now stores one of:
 * hunter, lister, both, or admin. Admin access stays explicit — the flexible
 * role helpers below only decide whether a user may use hunter/lister tools.
 */
export type UserRole = 'hunter' | 'lister' | 'both' | 'admin'
export type AccessRole = 'hunter' | 'lister' | 'admin'

export type RoleSelection = {
  hunter: boolean
  lister: boolean
}

/** Accepts legacy values, comma strings, and arrays from older clients. */
export function normalizeRole(value: unknown): UserRole {
  if (Array.isArray(value)) {
    const parts = value.map((item) => String(item).trim().toLowerCase())
    if (parts.includes('admin')) return 'admin'
    if (parts.includes('hunter') && parts.includes('lister')) return 'both'
    return parts.includes('lister') ? 'lister' : 'hunter'
  }

  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'admin') return 'admin'
  if (raw === 'both' || raw === 'hunter,lister' || raw === 'lister,hunter') return 'both'
  if (raw === 'lister') return 'lister'
  return 'hunter'
}

export function hasRole(value: unknown, role: AccessRole): boolean {
  const current = normalizeRole(value)
  if (role === 'admin') return current === 'admin'
  // Hunters already list and listers must be able to hunt. Role checkboxes are
  // a preference/label, not a wall between the two halves of the marketplace.
  return true
}

export const hasHunterRole = (value: unknown) => hasRole(value, 'hunter')
export const hasListerRole = (value: unknown) => hasRole(value, 'lister')

export function selectionFromRole(value: unknown): RoleSelection {
  const role = normalizeRole(value)
  return {
    hunter: role === 'hunter' || role === 'both' || role === 'admin',
    lister: role === 'lister' || role === 'both' || role === 'admin',
  }
}

/** Never let a profile edit downgrade an admin account. */
export function roleFromSelection(selection: RoleSelection, current?: unknown): UserRole {
  if (normalizeRole(current) === 'admin') return 'admin'
  if (selection.hunter && selection.lister) return 'both'
  return selection.lister ? 'lister' : 'hunter'
}

export function roleFromInput(
  roles: unknown,
  role: unknown,
  current?: unknown
): UserRole {
  if (normalizeRole(current) === 'admin') return 'admin'
  if (Array.isArray(roles) && roles.length > 0) {
    const values = roles.map((item) => String(item).trim().toLowerCase())
    return roleFromSelection(
      { hunter: values.includes('hunter'), lister: values.includes('lister') },
      current
    )
  }
  return normalizeRole(role ?? current)
}

export function roleLabel(value: unknown): string {
  const role = normalizeRole(value)
  if (role === 'both') return 'Hunter & Lister'
  if (role === 'admin') return 'Admin'
  return role === 'lister' ? 'Lister' : 'Hunter'
}

/** Audiences used by notifications, where "both" must reach both groups. */
export function roleAudiences(value: unknown): Array<'hunter' | 'lister' | 'admin'> {
  const role = normalizeRole(value)
  if (role === 'admin') return ['admin']
  if (role === 'both') return ['hunter', 'lister']
  return [role]
}

/** Roles saved in auth.user_metadata. Kept alongside the profile role column. */
export function selectionFromMetadata(value: unknown): RoleSelection | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const values = value.map((item) => String(item).trim().toLowerCase())
  return {
    hunter: values.includes('hunter') || values.includes('both'),
    lister: values.includes('lister') || values.includes('both'),
  }
}

export function rolesForMetadata(value: unknown): string[] {
  const selection = selectionFromRole(value)
  const roles: string[] = []
  if (selection.hunter) roles.push('hunter')
  if (selection.lister) roles.push('lister')
  return roles
}
