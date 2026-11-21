import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A listing can be created by an AseHanta admin on behalf of a real lister.
 * `uploader_id` remains the platform/RLS owner, while `uploader_name` and
 * `lister_phone` carry the real person's public identity. Never overwrite
 * those values with the uploader profile when they are already present.
 */
export type ListerListingRow = {
  uploader_id?: string | null
  uploader_name?: string | null
  lister_phone?: string | null
  /** Optional future field; safe to leave unset on deployments without it. */
  lister_name?: string | null
}

export type ListerIdentity = {
  name: string
  phone: string | null
  profile: {
    id: string
    full_name: string | null
    phone: string | null
    role: string | null
  } | null
}

export async function resolveListerIdentity(
  admin: SupabaseClient,
  listing: ListerListingRow | null | undefined
): Promise<ListerIdentity> {
  if (!listing) {
    return { name: 'AseHanta lister', phone: null, profile: null }
  }

  let profile: ListerIdentity['profile'] = null
  if (listing.uploader_id) {
    const { data } = await admin
      .from('profiles')
      .select('id, full_name, phone, role')
      .eq('id', listing.uploader_id)
      .maybeSingle()
    profile = data
      ? {
          id: data.id,
          full_name: data.full_name ?? null,
          phone: data.phone ?? null,
          role: data.role ?? null,
        }
      : null
  }

  const name =
    listing.lister_name ||
    listing.uploader_name ||
    profile?.full_name ||
    'AseHanta lister'
  const phone = listing.lister_phone || profile?.phone || null

  return { name, phone, profile }
}
