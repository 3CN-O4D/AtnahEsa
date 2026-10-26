import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

export const R2_BUCKET = process.env.R2_BUCKET!
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!
export const R2_REGION = process.env.R2_REGION ?? 'auto'

export const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100 MB

const EXT_MIME: Record<string, string> = {
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  avi: 'video/x-msvideo', mkv: 'video/x-matroska', m4v: 'video/mp4',
  ogv: 'video/ogg', '3gp': 'video/3gpp',
}

export function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  return EXT_MIME[ext || ''] || 'video/mp4'
}

export function validateVideoKey(key: string): boolean {
  return /^listings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm|mov|avi|mkv|m4v|ogv|3gp)$/i.test(key)
}

export function r2PublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`
}

export function r2Client() {
  return new S3Client({
    endpoint: process.env.R2_ENDPOINT!,
    region: R2_REGION,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

export function generateVideoKey(ext: string): string {
  return `listings/${randomUUID()}.${ext}`
}

export async function presignPut(key: string, contentType: string, contentLength: number) {
  const s3 = r2Client()
  if (contentLength > MAX_VIDEO_SIZE) {
    throw new Error(`File too large: max ${MAX_VIDEO_SIZE / 1024 / 1024} MB`)
  }
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  })
  return getSignedUrl(s3, command, { expiresIn: 300 })
}

export async function deleteR2Object(key: string) {
  const s3 = r2Client()
  const command = new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })
  return s3.send(command)
}
