import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const EXT_MIME: Record<string, string> = {
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  avi: 'video/x-msvideo', mkv: 'video/x-matroska', m4v: 'video/mp4',
  ogv: 'video/ogg', '3gp': 'video/3gpp',
}

const ALLOWED_EXTENSIONS = Object.keys(EXT_MIME)

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  return EXT_MIME[ext || ''] || 'video/mp4'
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const fileName = searchParams.get('name') || 'video.mp4'
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: `Unsupported format .${ext}` }, { status: 400 })
    }

    const key = `listings/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const bucket = process.env.S3_BUCKET || 'videos'

    return NextResponse.json({ bucket, key })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to get upload info' }, { status: 500 })
  }
}
