import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUser } from '@/lib/notify'
import { resolveListerIdentity } from '@/lib/lister-identity'

export async function notifyContactDetails(bookingId: string) {
  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, listings!inner(*), profiles!inner(*)')
    .eq('id', bookingId)
    .single()

  if (!booking) return { ok: false, error: 'Booking not found' }

  const listing = booking.listings
  const hunterId = booking.user_id
  const listerId = listing.uploader_id

  const { data: listerProfile } = await supabase
    .from('profiles')
    .select('phone, email, full_name, username')
    .eq('id', listerId)
    .single()

  const { data: hunterProfile } = await supabase
    .from('profiles')
    .select('phone, email, full_name, username')
    .eq('id', hunterId)
    .single()

  if (!hunterProfile) return { ok: false, error: 'Hunter profile not found' }

  const lister = await resolveListerIdentity(supabase, listing)

  if (hunterProfile.email) {
    await notifyUser(
      hunterProfile.email,
      'Contact Details Released',
      `You can now contact the lister of "${listing.title}"`,
      {
        Lister: lister.name,
        Phone: lister.phone || 'N/A',
        Email: listerProfile?.email || 'N/A',
      }
    )
  }

  if (listerProfile?.email) {
    await notifyUser(
      listerProfile.email,
      'Tenant Contact Details Released',
      `A tenant has released funds and their contact details are now available for "${listing.title}"`,
      {
        Tenant: hunterProfile.full_name || hunterProfile.username || 'Tenant',
        Phone: hunterProfile.phone || 'N/A',
        Email: hunterProfile.email || 'N/A',
      }
    )
  }

  return { ok: true }
}
