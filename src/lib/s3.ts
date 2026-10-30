import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

export const R2_BUCKET = process.env.R2_BUCKET ?? ''
export const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '')
export const R2_REGION = process.env.R2_REGION ?? 'auto'

export const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100 MB
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
export const VIDEO_UPLOAD_EXPIRY = 300 // seconds

/**
 * Formats we accept for new uploads. Every one of these can be played by at
 * least one major browser, so a successful upload never turns into a video
 * that silently refuses to play.
 */
export const VIDEO_EXT_MIME = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  ogv: 'video/ogg',
} as const

export type VideoExt = keyof typeof VIDEO_EXT_MIME
export const VIDEO_EXTENSIONS = Object.keys(VIDEO_EXT_MIME) as VideoExt[]

/**
 * Images uploaded directly to R2 (never proxied through the app, which keeps
 * them under Vercel's 4.5MB serverless body limit). `jpeg` is accepted as an
 * alias but stored as `jpg` so keys stay canonical.
 */
export const IMAGE_EXT_MIME = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
} as const

export type ImageExt = keyof typeof IMAGE_EXT_MIME
export const IMAGE_EXTENSIONS = Object.keys(IMAGE_EXT_MIME) as ImageExt[]

/**
 * Keys already stored in the bucket may use legacy extensions too. Reading
 * stays permissive; only *new* uploads are restricted by VIDEO_EXTENSIONS.
 */
const VIDEO_KEY_RE = /^listings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm|mov|avi|mkv|m4v|ogv|3gp)$/i

const IMAGE_KEY_RE = /^asehanta\/listings\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/

export function extFromName(name: string): string {
  const clean = name.split('?')[0].split('#')[0]
  return (clean.split('.').pop() ?? '').toLowerCase()
}

export function mimeFromName(name: string): string {
  const ext = extFromName(name)
  return VIDEO_EXT_MIME[ext as VideoExt] ?? ''
}

export function isSupportedVideoExt(ext: string): ext is VideoExt {
  return (VIDEO_EXTENSIONS as string[]).includes(ext)
}

/** jpeg and jpg are the same format; keys always use `jpg`. */
export function normalizeImageExt(ext: string): string {
  const lower = ext.toLowerCase()
  return lower === 'jpeg' ? 'jpg' : lower
}

export function isSupportedImageExt(ext: string): boolean {
  return (IMAGE_EXTENSIONS as string[]).includes(normalizeImageExt(ext))
}

export function imageMimeFromName(name: string): string {
  const ext = normalizeImageExt(extFromName(name))
  return IMAGE_EXT_MIME[ext as ImageExt] ?? ''
}

export function validateVideoKey(key: string): boolean {
  return VIDEO_KEY_RE.test(key)
}

export function validateImageKey(key: string): boolean {
  return IMAGE_KEY_RE.test(key)
}

export function r2PublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`
}

/** Extract the R2 object key from one of our own public URLs. */
export function r2KeyFromUrl(url: string): string | null {
  if (!url || !R2_PUBLIC_URL) return null
  const prefix = `${R2_PUBLIC_URL}/`
  if (!url.startsWith(prefix)) return null
  const key = decodeURIComponent(url.slice(prefix.length).split('?')[0].split('#')[0])
  return validateImageKey(key) || validateVideoKey(key) ? key : null
}

export function r2Client() {
  return new S3Client({
    endpoint: process.env.R2_ENDPOINT!,
    region: R2_REGION,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    // AWS SDK v3 adds a CRC32 checksum to PutObject by default. That checksum
    // is baked into presigned URLs as the checksum of an *empty* body, which
    // makes every browser upload fail with a signature/checksum mismatch.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
}

export function generateVideoKey(ext: string): string {
  return `listings/${randomUUID()}.${ext.toLowerCase()}`
}

/**
 * Image keys keep the long-standing `asehanta/listings/<user>/<file>` shape so
 * existing DB rows, `r2KeyFromUrl`, and delete-image keep working unchanged.
 */
export function generateImageKey(userId: string, ext: string, index = 0): string {
  const safeIndex = Number.isFinite(index) ? Math.min(Math.max(Math.trunc(index), 0), 999) : 0
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `asehanta/listings/${userId}/${timestamp}-${random}-${safeIndex}.${normalizeImageExt(ext)}`
}

/**
 * Presign a single PUT. Only Content-Type is signed: Content-Length is left to
 * the browser, because some browsers/proxies use chunked encoding and a signed
 * content-length would reject otherwise valid uploads.
 */
export async function presignPut(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(r2Client(), command, { expiresIn: VIDEO_UPLOAD_EXPIRY })
}

export async function deleteR2Object(key: string) {
  const command = new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })
  return r2Client().send(command)
}
