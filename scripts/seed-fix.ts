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

const FIX_LISTINGS = [
  {
    title: 'Single Room in Huruma',
    description: 'Clean single room with shared amenities. Perfect for a single working person. Located in a peaceful area with good neighbours.',
    price: 300, rent: 3500, deposit: 3500, deposit_refundable: true,
    location: 'Eldoret', descriptive_location: 'Huruma, near the stadium',
    house_type: 'single room', building_type: 'flat', floor_number: 'Ground',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Tenant completed studies',
    electricity: 'metered', electric_bill: 'shared', water: 'included',
    payment_method: 'monthly', lister_phone: '+254711100001',
    issues: ['Shared bathroom'], issues_count: 1,
    images: ['https://picsum.photos/seed/hsefix1/800/600', 'https://picsum.photos/seed/hsefix2/800/600'],
  },
  {
    title: 'Bedsitter in Chicago Estate',
    description: 'Affordable bedsitter in Chicago Estate. Close to the main highway, making it easy to commute. Water included. Good for a single person.',
    price: 300, rent: 4500, deposit: 4500, deposit_refundable: true,
    location: 'Eldoret', descriptive_location: 'Chicago Estate, near the highway',
    house_type: 'bedsitter', building_type: 'flat', floor_number: 'Ground',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Tenant moved upcountry',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'included',
    payment_method: 'monthly', lister_phone: '+254711100001',
    issues: [], issues_count: 0,
    images: ['https://picsum.photos/seed/hsefix3/800/600'],
  },
]

async function main() {
  console.log('=== FIXING MISSING LISTINGS + ALL REVIEWS ===\n')

  const { data: { users } } = await supabase.auth.admin.listUsers()
  const lister1 = users.find(u => u.email === 'lister1@asehanta.test')
  if (!lister1) { console.error('lister1 not found'); return }

  for (const listing of FIX_LISTINGS) {
    await supabase.from('listings').delete().eq('title', listing.title)
    const { error } = await supabase.from('listings').insert({
      ...listing,
      uploader_id: lister1.id,
      uploader_name: 'James Kamau',
      status: 'published',
    })
    console.log(`  ${error ? 'FAILED' : 'OK'} — ${listing.title}: ${error?.message ?? ''}`)
  }

  // Add reviews for ALL listings (ensure each has at least 1)
  const { data: all } = await supabase.from('listings').select('id, title').eq('status', 'published').order('created_at', { ascending: true })
  const hunterIds = users.filter(u => u.email?.startsWith('hunter')).map(u => u.id)
  const comments = [
    'Decent place, fair price. Would recommend.',
    'Clean and well maintained. Happy tenant.',
    'Exactly as advertised. The landlord was helpful.',
    'Average condition but good value for money.',
    'Spacious and quiet neighbourhood. Loved it.',
  ]
  let count = 0
  for (const listing of all ?? []) {
    const hunterId = hunterIds[Math.floor(Math.random() * hunterIds.length)]
    await supabase.from('reviews').delete().eq('listing_id', listing.id).eq('user_id', hunterId)
    const { error } = await supabase.from('reviews').insert({
      listing_id: listing.id,
      user_id: hunterId,
      rating: 3 + Math.floor(Math.random() * 3),
      comment: comments[Math.floor(Math.random() * comments.length)],
    })
    if (!error) count++
  }
  console.log(`\n${count} reviews across ${all?.length ?? 0} listings ✓`)
  console.log('=== DONE ===')
}

main().catch(console.error)
