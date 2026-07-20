import { createClient } from '@supabase/supabase-js'
import cloudinary from 'cloudinary'
import { readFileSync } from 'fs'

const env = readFileSync('.env', 'utf-8').split('\n').reduce<Record<string,string>>((acc, line) => {
  const [k, ...v] = line.split('=')
  if (k) acc[k.trim()] = v.join('=').trim()
  return acc
}, {})

cloudinary.v2.config({
  cloud_name: env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// 4 mover + 15 house images using picsum (reliable placeholders)
const IMAGE_URLS = [
  'https://picsum.photos/seed/mover1/800/600',
  'https://picsum.photos/seed/mover2/800/600',
  'https://picsum.photos/seed/mover3/800/600',
  'https://picsum.photos/seed/mover4/800/600',
  'https://picsum.photos/seed/hse11/800/600',
  'https://picsum.photos/seed/hse12/800/600',
  'https://picsum.photos/seed/hse13/800/600',
  'https://picsum.photos/seed/hse14/800/600',
  'https://picsum.photos/seed/hse15/800/600',
  'https://picsum.photos/seed/hse16/800/600',
  'https://picsum.photos/seed/hse17/800/600',
  'https://picsum.photos/seed/hse18/800/600',
  'https://picsum.photos/seed/hse19/800/600',
  'https://picsum.photos/seed/hse20/800/600',
  'https://picsum.photos/seed/hse21/800/600',
  'https://picsum.photos/seed/hse22/800/600',
  'https://picsum.photos/seed/hse23/800/600',
  'https://picsum.photos/seed/hse24/800/600',
  'https://picsum.photos/seed/hse25/800/600',
]

const MOVERS = [
  {
    name: 'SwiftMove Kenya',
    description: 'Reliable moving services across Eldoret and the Rift Valley. We handle everything from furniture to fragile items. 24/7 availability and insurance coverage on all moves.',
    price: 5000, location: 'Eldoret', phone: '+254722100011',
  },
  {
    name: 'CityLink Movers',
    description: 'Professional moving company serving Nairobi and its environs. Fleet of modern trucks, trained staff, and competitive rates. Free packing materials included.',
    price: 8000, location: 'Nairobi', phone: '+254733100022',
  },
  {
    name: 'Coastline Cargo',
    description: 'Expert movers based in Mombasa serving the coastal region. Specialize in both residential and office moves. Storage solutions available.',
    price: 6000, location: 'Mombasa', phone: '+254744100033',
  },
  {
    name: 'LakeZone Logistics',
    description: 'Trusted movers in Kisumu and Western Kenya. Affordable rates, careful handling, and timely delivery. Long-distance moves across Kenya available.',
    price: 4500, location: 'Kisumu', phone: '+254755100044',
  },
]

const NEW_LISTINGS = [
  // 3 more for lister1 (Eldoret)
  {
    title: 'Executive 3-Bedroom in Naiberi',
    description: 'High-end 3-bedroom house with modern finishes, spacious compound, and panoramic views of the valley. Fitted kitchen, walk-in closets, and a beautiful garden. Staff quarters included.',
    price: 1500, rent: 75000, deposit: 75000, deposit_refundable: true,
    location: 'Eldoret', descriptive_location: 'Naiberi, along the Kaptagat road',
    house_type: '3-bedroom', building_type: 'storey', floor_number: 'Ground+1',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Recently completed construction',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'borehole',
    payment_method: 'monthly', lister_phone: '+254711100001',
    issues: [], issues_count: 0,
  },
  {
    title: 'Affordable 2-Bedroom in Langas',
    description: 'Budget-friendly 2-bedroom unit in a growing neighbourhood. Close to shopping centres and public transport. Water and garbage collection included.',
    price: 350, rent: 6500, deposit: 6500, deposit_refundable: true,
    location: 'Eldoret', descriptive_location: 'Langas, near the shopping centre',
    house_type: '2-bedroom', building_type: 'flat', floor_number: '1st',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Previous tenant relocated',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'included',
    payment_method: 'monthly', lister_phone: '+254711100001',
    issues: ['Occasional water shortages'], issues_count: 1,
  },
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
  },
  // 5 more for lister2 (Nairobi)
  {
    title: 'Luxury 4-Bedroom in Runda',
    description: 'Stunning 4-bedroom mansion in prestigious Runda estate. Large compound with swimming pool, manicured garden, and staff house. 24-hour security and backup generator.',
    price: 2500, rent: 150000, deposit: 300000, deposit_refundable: true,
    location: 'Nairobi', descriptive_location: 'Runda Estate',
    house_type: '4-bedroom', building_type: 'storey', floor_number: 'Ground+1',
    vacancy: 'vacant', vacancy_type: 'in 1 month', why_vacant: 'Owner relocating abroad',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'borehole',
    payment_method: 'monthly', lister_phone: '+254711100002',
    issues: [], issues_count: 0,
  },
  {
    title: '1-Bedroom Apartment in Kilimani',
    description: 'Modern 1-bedroom with an open-plan layout, granite countertops, and a balcony. Gym and pool access. Ideally located near restaurants and shopping malls.',
    price: 800, rent: 28000, deposit: 28000, deposit_refundable: true,
    location: 'Nairobi', descriptive_location: 'Kilimani, along Riara Road',
    house_type: '1-bedroom', building_type: 'storey', floor_number: '5th',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Recently renovated',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'included',
    payment_method: 'monthly', lister_phone: '+254711100002',
    issues: ['No visitors after 9pm'], issues_count: 1,
  },
  {
    title: 'Bedsitter in Eastlands (Umoja)',
    description: 'Affordable bedsitter in the heart of Umoja. Close to bus stops, markets, and social amenities. Water and security included.',
    price: 300, rent: 5500, deposit: 5500, deposit_refundable: true,
    location: 'Nairobi', descriptive_location: 'Umoja Inner Core',
    house_type: 'bedsitter', building_type: 'flat', floor_number: '2nd',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Tenant moved to a bigger house',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'included',
    payment_method: 'monthly', lister_phone: '+254711100002',
    issues: ['Street noise at peak hours'], issues_count: 1,
  },
  {
    title: '2-Bedroom in Donholm',
    description: 'Spacious 2-bedroom in a mature estate with great security. Tiled living room, fitted kitchen, and plenty of natural light. Close to Donholm shopping centre.',
    price: 500, rent: 18000, deposit: 18000, deposit_refundable: true,
    location: 'Nairobi', descriptive_location: 'Donholm, Phase 6',
    house_type: '2-bedroom', building_type: 'flat', floor_number: '3rd',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Family moved to new home',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'metered',
    payment_method: 'monthly', lister_phone: '+254711100002',
    issues: [], issues_count: 0,
  },
  {
    title: 'Studio in Upperhill',
    description: 'Executive studio in the business district. Perfect for a professional. Furnished with a kitchenette, ensuite bathroom, and high-speed internet ready.',
    price: 700, rent: 25000, deposit: 25000, deposit_refundable: true,
    location: 'Nairobi', descriptive_location: 'Upperhill, near the Windsor',
    house_type: 'studio', building_type: 'storey', floor_number: '7th',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Newly finished unit',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'included',
    payment_method: 'monthly', lister_phone: '+254711100002',
    issues: ['No parking slot'], issues_count: 1,
  },
  // 4 more for lister3 (Kisumu & Mombasa)
  {
    title: '3-Bedroom in Kisumu (Kibos)',
    description: 'Well-kept 3-bedroom house near Kibos sugar belt. Large compound with fruit trees, garage, and a servant quarter. Ideal for a growing family.',
    price: 700, rent: 25000, deposit: 25000, deposit_refundable: true,
    location: 'Kisumu', descriptive_location: 'Kibos, off the Kisumu-Busia road',
    house_type: '3-bedroom', building_type: 'flat', floor_number: 'Ground',
    vacancy: 'vacant', vacancy_type: 'in 2 weeks', why_vacant: 'Tenant transferred to Nairobi',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'metered',
    payment_method: 'monthly', lister_phone: '+254711100003',
    issues: [], issues_count: 0,
  },
  {
    title: 'Bedsitter in Kisumu (Migosi)',
    description: 'Compact bedsitter in Migosi estate. Water and garbage included. Close to Kisumu CBD and the lakefront. Good security.',
    price: 300, rent: 6000, deposit: 6000, deposit_refundable: true,
    location: 'Kisumu', descriptive_location: 'Migosi, near the lake',
    house_type: 'bedsitter', building_type: 'flat', floor_number: '1st',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Tenant relocated',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'included',
    payment_method: 'monthly', lister_phone: '+254711100003',
    issues: ['Dampness during rainy season'], issues_count: 1,
  },
  {
    title: '2-Bedroom Apartment in Bamburi',
    description: 'Modern 2-bedroom apartment near Bamburi beach. Tiled throughout, fitted kitchen, and a balcony with partial ocean views. Swimming pool and gym in the complex.',
    price: 1000, rent: 40000, deposit: 40000, deposit_refundable: true,
    location: 'Mombasa', descriptive_location: 'Bamburi, beach road',
    house_type: '2-bedroom', building_type: 'storey', floor_number: '2nd',
    vacancy: 'vacant', vacancy_type: 'in 2 weeks', why_vacant: 'Currently being painted',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'metered',
    payment_method: 'monthly', lister_phone: '+254711100003',
    issues: ['No borehole backup'], issues_count: 1,
  },
  {
    title: 'Studio in Diani Beach',
    description: 'Beautiful studio steps away from Diani Beach. Open-plan living with a kitchenette. Perfect for remote workers or a holiday let. Fast fibre internet installed.',
    price: 1200, rent: 45000, deposit: 45000, deposit_refundable: true,
    location: 'Mombasa', descriptive_location: 'Diani Beach, south coast',
    house_type: 'studio', building_type: 'flat', floor_number: 'Ground',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Short-term let available',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'borehole',
    payment_method: 'monthly', lister_phone: '+254711100003',
    issues: ['Far from supermarkets'], issues_count: 1,
  },
  // 3 more for lister1 (Eldoret - bonus)
  {
    title: '1-Bedroom in Pioneer Estate',
    description: 'Neat 1-bedroom unit in the popular Pioneer Estate. Tiled floors, modern bathroom, and a kitchen with ample storage. Quiet area with friendly neighbours.',
    price: 350, rent: 7000, deposit: 7000, deposit_refundable: true,
    location: 'Eldoret', descriptive_location: 'Pioneer Estate, near the primary school',
    house_type: '1-bedroom', building_type: 'flat', floor_number: '1st',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Tenant bought own house',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'included',
    payment_method: 'monthly', lister_phone: '+254711100001',
    issues: [], issues_count: 0,
  },
  {
    title: '2-Bedroom in Kipkenyo Estate',
    description: 'Recently renovated 2-bedroom house in Kipkenyo. New paint, new plumbing, and a fresh coat of waterproofing. Good road access and ample parking.',
    price: 400, rent: 10000, deposit: 10000, deposit_refundable: true,
    location: 'Eldoret', descriptive_location: 'Kipkenyo, behind the military base',
    house_type: '2-bedroom', building_type: 'flat', floor_number: 'Ground',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Refurbished unit',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'metered',
    payment_method: 'monthly', lister_phone: '+254711100001',
    issues: ['Unpaved access road'], issues_count: 1,
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
  },
]

async function uploadImage(url: string, folder: string, idx: number): Promise<string> {
  const res = await fetch(url)
  const buf = Buffer.from(await res.arrayBuffer())
  const b64 = buf.toString('base64')
  const result = await cloudinary.v2.uploader.upload(`data:image/jpeg;base64,${b64}`, {
    folder: `asehanta/${folder}`,
    public_id: `seed-extra-${idx}`,
  })
  console.log(`  Uploaded ${folder} ${idx}: ${result.secure_url}`)
  return result.secure_url
}

async function main() {
  console.log('=== SEEDING MOVERS + 15 NEW LISTINGS ===\n')

  // Step 1: Upload all images to Cloudinary
  console.log('Step 1: Uploading images...')
  const uploaded: string[] = []
  for (let i = 0; i < IMAGE_URLS.length; i++) {
    const folder = i < 4 ? 'movers' : 'listings'
    const url = await uploadImage(IMAGE_URLS[i], folder, i + 1)
    uploaded.push(url)
  }
  const moverImages = uploaded.slice(0, 4)
  const houseImages = uploaded.slice(4)
  console.log(`  Uploaded ${moverImages.length} mover + ${houseImages.length} house images\n`)

  // Step 2: Get lister IDs
  const { data: { users } } = await supabase.auth.admin.listUsers()
  const listerMap = new Map(users.filter(u => u.email?.startsWith('lister')).map(u => [u.email!, u.id]))
  const listerNames = ['jameskamau', 'marywanjiku', 'peterochieng']
  console.log('Listers found:', listerMap.size, '\n')

  // Step 3: Create movers
  console.log('Step 2: Creating movers...')
  for (let i = 0; i < MOVERS.length; i++) {
    const m = MOVERS[i]
    const { error } = await supabase.from('movers').insert({
      ...m,
      image: moverImages[i % moverImages.length],
    })
    if (error && !error.message.includes('duplicate')) {
      console.error(`  Failed: ${m.name}: ${error.message}`)
    } else {
      console.log(`  Created mover: ${m.name}`)
    }
  }
  console.log()

  // Step 4: Create 15 new listings
  console.log('Step 3: Creating 15 new listings...')
  const listerEmails = ['lister1@asehanta.test', 'lister2@asehanta.test', 'lister3@asehanta.test']
  const listerNameMap: Record<string, string> = {
    'lister1@asehanta.test': 'James Kamau',
    'lister2@asehanta.test': 'Mary Wanjiku',
    'lister3@asehanta.test': 'Peter Ochieng',
  }
  let count = 0
  let skipped = 0
  for (let i = 0; i < NEW_LISTINGS.length; i++) {
    // Rotate listers: indices 0-2 → lister1, 3-7 → lister2, 8-11 → lister3, 12-14 → lister1
    const emailIdx = i < 3 ? 0 : i < 8 ? 1 : i < 12 ? 2 : 0
    const listerEmail = listerEmails[emailIdx]
    const uploaderId = listerMap.get(listerEmail)
    if (!uploaderId) { console.error(`  No user for ${listerEmail}`); continue }

    const imgCount = 2 + (i % 2) // 2 or 3 images
    const offset = (i * 3) % 7
    const images = houseImages.slice(offset, offset + imgCount)
    if (images.length === 0) continue

    const listing = NEW_LISTINGS[i]
    const { error } = await supabase.from('listings').insert({
      ...listing,
      images,
      uploader_id: uploaderId,
      uploader_name: listerNameMap[listerEmail],
      status: 'published',
    })
    if (error) {
      console.error(`  FAILED "${listing.title}": ${error.message}`)
      skipped++
    } else {
      count++
      console.log(`  ${count}. ${listing.title}`)
    }
  }
  console.log(`\nCreated ${count} listings (${skipped} skipped)\n`)

  // Step 5: Add reviews for new listings
  console.log('Step 4: Adding reviews...')
  const hunterEmails = ['hunter1@asehanta.test', 'hunter2@asehanta.test']
  const { data: allListings } = await supabase
    .from('listings')
    .select('id, title')
    .eq('status', 'published')
    .order('created_at', { ascending: true })

  // The new ones are the last 15
  const newOnes = allListings?.slice(-15) ?? []
  const hunterIds = hunterEmails.map(e => users.find(u => u.email === e)?.id).filter(Boolean)
  let reviewCount = 0
  for (const listing of newOnes) {
    const rating = 3 + Math.floor(Math.random() * 3) // 3-5 stars
    const hunterId = hunterIds[Math.floor(Math.random() * hunterIds.length)]
    if (!hunterId) continue

    // Delete existing review by this user on this listing
    await supabase.from('reviews').delete().eq('listing_id', listing.id).eq('user_id', hunterId)

    const comments = [
      'Great house, exactly as described. The landlord was very helpful during the viewing.',
      'Spacious and well maintained. Good value for the location.',
      'Decent place. A few minor issues but overall satisfied.',
      'Beautiful home! The neighbourhood is peaceful and secure.',
      'Average condition but the price is fair. Would recommend.',
      'Loved the interior design. Very modern and clean.',
    ]
    const { error } = await supabase.from('reviews').insert({
      listing_id: listing.id, user_id: hunterId,
      rating, comment: comments[Math.floor(Math.random() * comments.length)],
    })
    if (!error) reviewCount++
  }
  console.log(`Added ${reviewCount} reviews\n`)
  console.log('=== DONE ===')
}

main().catch(console.error)
