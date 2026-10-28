import 'dotenv/config';
import { createAdminClient } from '../src/lib/supabase/admin'
import cloudinary from 'cloudinary'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

cloudinary.v2.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
})

const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT!,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
})

const BUCKET = process.env.R2_BUCKET!
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!

async function migrate() {
  const admin = createAdminClient()
  
  const { data: listings } = await admin
    .from('listings')
    .select('id, images')
    .not('images', 'is', '{}')
    .neq('images', '{}')

  if (!listings?.length) {
    console.log('No listings to migrate')
    return
  }

  console.log(`Found ${listings.length} listings with images`)

  for (const listing of listings) {
    const newImages: string[] = []
    
    for (const url of listing.images) {
      try {
        if (url.includes('r2.cloudflarestorage.com') || url.includes('media.asehanta.com')) {
          newImages.push(url)
          continue
        }

        const response = await fetch(url)
        if (!response.ok) throw new Error(`Failed to download: ${url}`)
        
        const buffer = Buffer.from(await response.arrayBuffer())
        const ext = url.split('.').pop()?.toLowerCase() || 'jpg'
        
        const timestamp = Date.now().toString(36)
        const random = Math.random().toString(36).slice(2, 8)
        const key = `asehanta/listings/${listing.id}/${timestamp}-${random}.${ext}`

        await s3.send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET!,
          Key: `asehanta/listings/${listing.id}/${key}`,
          Body: buffer,
          ContentType: `image/${ext}`,
          CacheControl: 'public, max-age=31536000, immutable',
        }))

        newImages.push(`${process.env.R2_PUBLIC_URL}/asehanta/listings/${listing.id}/${key}`)
        console.log(`  Migrated ${url}`)
      } catch (err) {
        console.error(`Failed ${url}:`, err)
        newImages.push(url)
      }
    }

    if (newImages.length !== listing.images.length || newImages.some((u, i) => u !== listing.images[i])) {
      const { error } = await admin
        .from('listings')
        .update({ images: newImages })
        .eq('id', listing.id)
      
      if (error) console.error(`DB update failed for ${listing.id}:`, error)
      else console.log(`Updated listing ${listing.id}`)
    }
  }

  console.log('Migration complete')
}

migrate().catch(console.error)
