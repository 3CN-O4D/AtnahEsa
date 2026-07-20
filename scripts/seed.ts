import { createClient } from '@supabase/supabase-js'
import cloudinary from 'cloudinary'
import { readFileSync, writeFileSync, unlinkSync } from 'fs'

// Load .env
const env = readFileSync('.env', 'utf-8').split('\n').reduce<Record<string,string>>((acc, line) => {
  const [k, ...v] = line.split('=')
  if (k) acc[k.trim()] = v.join('=').trim()
  return acc
}, {})

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY!

cloudinary.v2.config({
  cloud_name: env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
})

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// 10 free Unsplash house photos
const IMAGE_URLS = [
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
  'https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=800',
  'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800',
  'https://images.unsplash.com/photo-1560185007-5f0bb1866cab?w=800',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800',
  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
]

async function downloadAndUpload(url: string, idx: number): Promise<string> {
  const res = await fetch(url)
  const buffer = Buffer.from(await res.arrayBuffer())
  const b64 = buffer.toString('base64')
  const dataUri = `data:image/jpeg;base64,${b64}`

  const result = await cloudinary.v2.uploader.upload(dataUri, {
    folder: 'asehanta/listings',
    public_id: `seed-house-${idx}`,
  })
  console.log(`  Uploaded image ${idx + 1}: ${result.secure_url}`)
  return result.secure_url
}

async function createUser(email: string, password: string, fullName: string, username: string, role: 'hunter' | 'lister', phone: string) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName, phone, role, terms_accepted: true },
  })
  if (error) {
    console.error(`  Failed to create ${email}: ${error.message}`)
    return null
  }
  console.log(`  Created user ${email} (${role}) — ID: ${data.user.id}`)
  return data.user.id
}

const LISTERS = [
  { email: 'lister1@asehanta.test', name: 'James Kamau', username: 'jameskamau', phone: '+254711100001' },
  { email: 'lister2@asehanta.test', name: 'Mary Wanjiku', username: 'marywanjiku', phone: '+254711100002' },
  { email: 'lister3@asehanta.test', name: 'Peter Ochieng', username: 'peterochieng', phone: '+254711100003' },
]

const HUNTERS = [
  { email: 'hunter1@asehanta.test', name: 'Faith Akinyi', username: 'faithakinyi', phone: '+254711100004' },
  { email: 'hunter2@asehanta.test', name: 'David Mwangi', username: 'davidmwangi', phone: '+254711100005' },
]

interface ListingInput {
  title: string
  description: string
  price: number
  rent: number
  deposit: number
  deposit_refundable: boolean
  location: string
  descriptive_location: string
  house_type: string
  building_type: string
  floor_number: string
  vacancy: string
  vacancy_type: string
  why_vacant: string
  electricity: string
  electric_bill: string
  water: string
  payment_method: string
  lister_phone: string
  issues: string[]
  issues_count: number
  images: string[]
}

const LISTINGS: Omit<ListingInput, 'images'>[] = [
  // lister1 — 3 houses (Eldoret)
  {
    title: 'Spacious 2-Bedroom in Elgon View Estate',
    description: 'Well-maintained 2-bedroom unit with a modern kitchen, tiled floors, and ample parking. Located in a quiet neighbourhood with good security. Close to shops and public transport.',
    price: 500, rent: 12000, deposit: 12000, deposit_refundable: true,
    location: 'Eldoret', descriptive_location: 'Elgon View Estate, near SOS',
    house_type: '2-bedroom', building_type: 'flat', floor_number: '1st',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Previous tenant relocated for work',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'metered',
    payment_method: 'monthly', lister_phone: '+254711100001',
    issues: ['No hot water'], issues_count: 1,
  },
  {
    title: 'Modern 1-Bedroom Near Moi University',
    description: 'Furnished 1-bedroom unit ideal for a student or young professional. Includes WiFi-ready connection, water included in rent, and secure gated compound.',
    price: 400, rent: 8000, deposit: 8000, deposit_refundable: true,
    location: 'Eldoret', descriptive_location: 'Near Moi University main gate',
    house_type: '1-bedroom', building_type: 'flat', floor_number: '2nd',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'New unit just completed',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'included',
    payment_method: 'monthly', lister_phone: '+254711100001',
    issues: [], issues_count: 0,
  },
  {
    title: 'Self-Contained Bedsitter — Kapsoya',
    description: 'Cozy self-contained bedsitter with separate kitchen area. Ideal for a single person. Water and garbage collection included. Ample cupboard space.',
    price: 350, rent: 5500, deposit: 5500, deposit_refundable: true,
    location: 'Eldoret', descriptive_location: 'Kapsoya, near the market',
    house_type: 'bedsitter', building_type: 'flat', floor_number: 'Ground',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Tenant moved out after studies',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'included',
    payment_method: 'monthly', lister_phone: '+254711100001',
    issues: ['Limited parking'], issues_count: 1,
  },
  // lister2 — 3 houses (Nairobi)
  {
    title: '3-Bedroom Townhouse in South B',
    description: 'Beautiful 3-bedroom townhouse with a spacious living room, modern kitchen, and a small garden. Gated community with 24hr security and visitor parking.',
    price: 800, rent: 35000, deposit: 35000, deposit_refundable: true,
    location: 'Nairobi', descriptive_location: 'South B, off Mombasa Road',
    house_type: '3-bedroom', building_type: 'storey', floor_number: 'Ground+1',
    vacancy: 'vacant', vacancy_type: 'in 2 weeks', why_vacant: 'Family relocating upcountry',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'metered',
    payment_method: 'monthly', lister_phone: '+254711100002',
    issues: [], issues_count: 0,
  },
  {
    title: '2-Bedroom Apartment in Kileleshwa',
    description: 'Premium 2-bedroom apartment with an open-plan living area, fitted kitchen, and a balcony with city views. Underground parking and gym access included.',
    price: 1000, rent: 45000, deposit: 90000, deposit_refundable: true,
    location: 'Nairobi', descriptive_location: 'Kileleshwa, along Mandera Road',
    house_type: '2-bedroom', building_type: 'storey', floor_number: '4th',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Unit recently renovated',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'included',
    payment_method: 'monthly', lister_phone: '+254711100002',
    issues: ['No visitors after 8pm'], issues_count: 1,
  },
  {
    title: 'Studio Apartment — Westlands',
    description: 'Modern studio apartment in the heart of Westlands. Perfect for a young professional. Fully tiled, fitted kitchen, and high-speed internet ready.',
    price: 600, rent: 22000, deposit: 22000, deposit_refundable: true,
    location: 'Nairobi', descriptive_location: 'Westlands, near Sarit Centre',
    house_type: 'studio', building_type: 'flat', floor_number: '3rd',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Newly constructed',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'included',
    payment_method: 'monthly', lister_phone: '+254711100002',
    issues: ['No parking included'], issues_count: 1,
  },
  // lister3 — 4 houses (Kisumu & Mombasa)
  {
    title: '4-Bedroom Bungalow in Milimani',
    description: 'Stunning 4-bedroom bungalow with a large compound, mature trees, and a servant\'s quarter. Ideal for a family. Borehole water and backup generator.',
    price: 1200, rent: 60000, deposit: 60000, deposit_refundable: true,
    location: 'Kisumu', descriptive_location: 'Milimani Estate',
    house_type: '4-bedroom', building_type: 'flat', floor_number: 'Ground',
    vacancy: 'vacant', vacancy_type: 'in 1 month', why_vacant: 'Owner relocating abroad',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'borehole',
    payment_method: 'monthly', lister_phone: '+254711100003',
    issues: [], issues_count: 0,
  },
  {
    title: '1-Bedroom Near Kisumu CBD',
    description: 'Affordable 1-bedroom unit within walking distance to Kisumu CBD. Good for a single person or couple. Water and security included in rent.',
    price: 350, rent: 7500, deposit: 7500, deposit_refundable: true,
    location: 'Kisumu', descriptive_location: 'Kondele, near the roundabout',
    house_type: '1-bedroom', building_type: 'flat', floor_number: '1st',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Previous tenant got married',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'included',
    payment_method: 'monthly', lister_phone: '+254711100003',
    issues: ['Street noise'], issues_count: 1,
  },
  {
    title: '2-Bedroom Beach House in Nyali',
    description: 'Beautiful beach-facing 2-bedroom house in Nyali. Walking distance to the beach. Tiled throughout, modern kitchen, and a rooftop terrace with ocean views.',
    price: 1500, rent: 55000, deposit: 55000, deposit_refundable: true,
    location: 'Mombasa', descriptive_location: 'Nyali, beach road',
    house_type: '2-bedroom', building_type: 'storey', floor_number: 'Ground+1',
    vacancy: 'vacant', vacancy_type: 'in 2 weeks', why_vacant: 'Seasonal rental available',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'metered',
    payment_method: 'monthly', lister_phone: '+254711100003',
    issues: ['No parking'], issues_count: 1,
  },
  {
    title: 'Bedsitter in Mtwapa',
    description: 'Budget-friendly bedsitter in Mtwapa. Close to bars, restaurants, and the beach. Water included. Good for a student or young worker.',
    price: 300, rent: 5000, deposit: 5000, deposit_refundable: true,
    location: 'Mombasa', descriptive_location: 'Mtwapa, near the bridge',
    house_type: 'bedsitter', building_type: 'flat', floor_number: '2nd',
    vacancy: 'vacant', vacancy_type: 'immediately', why_vacant: 'Tenant transferred',
    electricity: 'metered', electric_bill: 'paid by tenant', water: 'included',
    payment_method: 'monthly', lister_phone: '+254711100003',
    issues: ['Noisy area at night'], issues_count: 1,
  },
]

async function main() {
  console.log('=== SEEDING ASEHANTA ===\n')

  // Step 1: Download + upload images to Cloudinary
  console.log('Step 1: Uploading images to Cloudinary...')
  const cloudinaryUrls: string[] = []
  for (let i = 0; i < IMAGE_URLS.length; i++) {
    const url = await downloadAndUpload(IMAGE_URLS[i], i + 1)
    cloudinaryUrls.push(url)
  }
  console.log(`Uploaded ${cloudinaryUrls.length} images\n`)

  // Step 2: Create users
  console.log('Step 2: Creating users...')
  const password = 'AseHanta.1'
  const listerIds: string[] = []
  for (const l of LISTERS) {
    const id = await createUser(l.email, password, l.name, l.username, 'lister', l.phone)
    if (id) listerIds.push(id)
  }
  for (const h of HUNTERS) {
    await createUser(h.email, password, h.name, h.username, 'hunter', h.phone)
  }
  console.log(`Created ${listerIds.length} listers\n`)

  // Step 3: Create listings
  console.log('Step 3: Creating listings...')
  let listingCount = 0
  for (let i = 0; i < LISTINGS.length; i++) {
    const listerId = listerIds[Math.floor(i / 3) % listerIds.length]
    // Each listing gets 1-3 images
    const imgCount = 1 + (i % 3)
    const images = cloudinaryUrls.slice(i % 7, i % 7 + imgCount)

    const { error } = await supabase.from('listings').insert({
      ...LISTINGS[i],
      images,
      uploader_id: listerId,
      uploader_name: LISTERS.find(l => l.phone === LISTINGS[i].lister_phone)?.name ?? 'Unknown',
      status: 'published',
    })
    if (error) {
      console.error(`  Failed to create listing ${i + 1}: ${error.message}`)
    } else {
      listingCount++
      console.log(`  Created listing ${i + 1}: ${LISTINGS[i].title}`)
    }
  }
  console.log(`\nCreated ${listingCount} listings`)

  console.log('\n=== SEED COMPLETE ===')
  console.log('Users (password: AseHanta.1):')
  console.log('  lister1@asehanta.test — Lister')
  console.log('  lister2@asehanta.test — Lister')
  console.log('  lister3@asehanta.test — Lister')
  console.log('  hunter1@asehanta.test — Hunter')
  console.log('  hunter2@asehanta.test — Hunter')
}

main().catch(console.error)
