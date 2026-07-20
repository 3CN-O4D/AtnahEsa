import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env', 'utf-8').split('\n').reduce<Record<string,string>>((acc, line) => {
  const [k, ...v] = line.split('=')
  if (k) acc[k.trim()] = v.join('=').trim()
  return acc
}, {})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface ReviewInput {
  titleMatch: string
  user_email: string
  rating: number
  comment: string
}

const REVIEWS: ReviewInput[] = [
  { titleMatch: 'Elgon View', user_email: 'hunter1@asehanta.test', rating: 4, comment: 'Nice spacious house. Quiet neighbourhood and very secure.' },
  { titleMatch: 'Elgon View', user_email: 'hunter2@asehanta.test', rating: 5, comment: 'Great location and responsive landlord. Love the tiled floors!' },
  { titleMatch: 'Moi University', user_email: 'hunter1@asehanta.test', rating: 5, comment: 'Perfect for a student. WiFi ready and water included is a bonus.' },
  { titleMatch: 'Kapsoya', user_email: 'hunter2@asehanta.test', rating: 4, comment: 'Cozy bedsitter, good value. Parking tight but manageable.' },
  { titleMatch: 'South B', user_email: 'hunter1@asehanta.test', rating: 5, comment: 'Beautiful townhouse, very secure estate. The garden is wonderful.' },
  { titleMatch: 'Kileleshwa', user_email: 'hunter2@asehanta.test', rating: 5, comment: 'Premium finish! Gym and balcony views are top-notch.' },
  { titleMatch: 'Kileleshwa', user_email: 'hunter1@asehanta.test', rating: 4, comment: 'Loved it but visitor rules are a bit strict.' },
  { titleMatch: 'Westlands', user_email: 'hunter2@asehanta.test', rating: 4, comment: 'Modern studio, excellent location for working in Westlands.' },
  { titleMatch: 'Milimani', user_email: 'hunter1@asehanta.test', rating: 5, comment: 'Stunning home with a beautiful compound. Borehole water is a huge plus.' },
  { titleMatch: 'Kisumu CBD', user_email: 'hunter2@asehanta.test', rating: 4, comment: 'Affordable and well located near town.' },
  { titleMatch: 'Nyali', user_email: 'hunter1@asehanta.test', rating: 5, comment: 'Incredible beach views from the rooftop! Best on AseHanta.' },
  { titleMatch: 'Nyali', user_email: 'hunter2@asehanta.test', rating: 4, comment: 'Beautiful location but no parking is tough in Nyali.' },
  { titleMatch: 'Mtwapa', user_email: 'hunter1@asehanta.test', rating: 3, comment: 'Basic but affordable. Noisy at night.' },
]

async function main() {
  console.log('=== FIXING LISTING 7 + ADDING REVIEWS ===\n')

  // Get hunters
  const { data: { users } } = await supabase.auth.admin.listUsers()
  const hunterMap = new Map(users.filter(u => u.email?.startsWith('hunter')).map(u => [u.email!, u.id]))
  console.log(`Hunters found: ${hunterMap.size}\n`)

  // Fix listing 7 — delete then re-insert
  await supabase.from('listings').delete().eq('title', '4-Bedroom Bungalow in Milimani')
  const lister3 = users.find(u => u.email === 'lister3@asehanta.test')
  if (lister3) {
    await supabase.from('listings').insert({
      title: '4-Bedroom Bungalow in Milimani',
      description: "Stunning 4-bedroom bungalow with a large compound, mature trees, and a servant's quarter.",
      price: 1200, rent: 60000, deposit: 60000, deposit_refundable: true,
      location: 'Kisumu', descriptive_location: 'Milimani Estate',
      house_type: '4-bedroom', building_type: 'flat', floor_number: 'Ground',
      vacancy: 'vacant', vacancy_type: 'in 1 month', why_vacant: 'Owner relocating abroad',
      electricity: 'metered', electric_bill: 'paid by tenant', water: 'borehole',
      payment_method: 'monthly', lister_phone: '+254711100003',
      images: [
        'https://res.cloudinary.com/dnm5a2xvh/image/upload/v1784579127/asehanta/listings/seed-house-7.jpg',
        'https://res.cloudinary.com/dnm5a2xvh/image/upload/v1784579129/asehanta/listings/seed-house-8.jpg',
      ],
      uploader_id: lister3.id, uploader_name: 'Peter Ochieng', status: 'published',
      issues: [], issues_count: 0,
    })
    console.log('Re-created 4-Bedroom Bungalow in Milimani ✓\n')
  }

  // Get all listings
  const { data: allListings } = await supabase
    .from('listings')
    .select('id, title')
    .eq('status', 'published')

  if (!allListings?.length) { console.error('No listings found'); return }
  console.log(`Total listings: ${allListings.length}\n`)

  // Match reviews to listings by title substring
  console.log('Inserting reviews...')
  let count = 0
  for (const rev of REVIEWS) {
    const listing = allListings.find(l => l.title.includes(rev.titleMatch))
    if (!listing) { console.error(`  No match for: ${rev.titleMatch}`); continue }

    const userId = hunterMap.get(rev.user_email)
    if (!userId) { console.error(`  No user: ${rev.user_email}`); continue }

    // Delete existing review by same user on same listing before re-inserting
    await supabase.from('reviews').delete().eq('listing_id', listing.id).eq('user_id', userId)

    const { error } = await supabase.from('reviews').insert({
      listing_id: listing.id, user_id: userId,
      rating: rev.rating, comment: rev.comment,
    })
    if (error) {
      console.error(`  FAILED "${listing.title}": ${error.message}`)
    } else {
      count++
      console.log(`  ${rev.rating}★ — ${listing.title}`)
    }
  }

  console.log(`\nInserted ${count} reviews ✓`)
  console.log('=== DONE ===')
}

main().catch(console.error)
