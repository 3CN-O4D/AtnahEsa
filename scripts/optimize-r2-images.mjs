#!/usr/bin/env node
/**
 * Generate the WebP variants the site serves for every listing photo in R2.
 *
 *   photo-0.jpg  ->  photo-0-480.webp, -960.webp, -1600.webp, -1920.webp
 *
 * Originals are left alone: they are the fallback if a variant is missing.
 * New uploads do this automatically in `api/upload/finalize`; this script is
 * the one-off backfill (and is safe to re-run — existing variants are skipped).
 *
 * Usage:
 *   node --env-file=.env scripts/optimize-r2-images.mjs [--force] [--dry-run]
 */

import sharp from 'sharp'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

const WIDTHS = [480, 960, 1600, 1920]
const PREFIX = 'asehanta/listings/'
const IMAGE_EXT = /\.(jpe?g|png|webp|avif)$/i
const VARIANT_EXT = /-(480|960|1600|1920)\.webp$/i
const MASTER_QUALITY = 82
const VARIANT_QUALITY = 78
const CONCURRENCY = 3

const force = process.argv.includes('--force')
const dryRun = process.argv.includes('--dry-run')

const bucket = process.env.R2_BUCKET
const publicUrl = (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '')
if (!bucket || !process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID) {
  console.error('Missing R2_* environment. Run with: node --env-file=.env scripts/optimize-r2-images.mjs')
  process.exit(1)
}

const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
})

async function listKeys() {
  const keys = []
  let token
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token, MaxKeys: 1000 })
    )
    for (const object of res.Contents ?? []) if (object.Key) keys.push(object.Key)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return keys
}

async function exists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch {
    return false
  }
}

function variantKey(key, width) {
  return `${key.replace(/\.[a-z0-9]+$/i, '')}-${width}.webp`
}

async function encode(input, width) {
  return sharp(input, { failOn: 'none' })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: VARIANT_QUALITY, effort: 4 })
    .toBuffer()
}

async function put(key, body) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'image/webp',
      ContentDisposition: 'inline',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  )
}

async function optimize(key) {
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const input = Buffer.from(await object.Body.transformToByteArray())

  let made = 0
  for (const width of WIDTHS) {
    const target = variantKey(key, width)
    if (!force && (await exists(target))) continue
    if (dryRun) {
      made++
      continue
    }
    await put(target, await encode(input, width))
    made++
  }

  // A listing that was re-uploaded as WebP can also be shrunk in place.
  if (/\.webp$/i.test(key) && force) {
    const master = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: MASTER_QUALITY, effort: 4 })
      .toBuffer()
    if (!dryRun) await put(key, master)
  }

  return { made, bytes: input.length }
}

const all = await listKeys()
const masters = all.filter((key) => IMAGE_EXT.test(key) && !VARIANT_EXT.test(key))
console.log(`${masters.length} source photos, ${all.length} objects in ${PREFIX}${dryRun ? ' (dry run)' : ''}`)

let cursor = 0
let done = 0
let variants = 0
let before = 0

await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < masters.length) {
      const key = masters[cursor++]
      try {
        const result = await optimize(key)
        done++
        variants += result.made
        before += result.bytes
        const mb = (result.bytes / 1048576).toFixed(1)
        console.log(`[${done}/${masters.length}] ${key.split('/').pop()} ${mb}MB -> ${result.made} variants`)
      } catch (err) {
        console.error(`failed: ${key}`, err instanceof Error ? err.message : err)
      }
    }
  })
)

console.log(`\nDone. ${done} photos, ${variants} variants written. Source bytes scanned: ${(before / 1048576).toFixed(1)}MB`)
if (publicUrl) console.log(`Serving from ${publicUrl}/${PREFIX}`)
