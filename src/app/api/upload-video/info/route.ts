import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { presignPut, generateVideoKey, mimeFromName, MAX_VIDEO_SIZE } from '@/lib/s3'

const ALLOWED_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv', '3gp']

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const name = searchParams.get('name') || 'video.mp4'
    const ext = (name.split('.').pop() || '').toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: `Unsupported format .${ext}` }, { status: 400 })
    }

    const contentType = mimeFromName(name)
    const key = generateVideoKey(ext)

    // Read optional Content-Length hint from query (browser sends file size)
    const contentLengthHint = searchParams.get('content-length')
    const contentLength = contentLengthHint ? parseInt(contentLengthHint, 10) : 0
    if (contentLength > MAX_VIDEO_SIZE) {
      return NextResponse.json({ error: `File too large. Max ${MAX_VIDEO_SIZE / 1024 / 1024} MB` }, { status: 413 })
    }

    const uploadUrl = await presignPut(key, contentType, contentLength)
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`

    return NextResponse.json({ key, uploadUrl, publicUrl, contentType })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to get upload info' }, { status: 500 })
  }
}
