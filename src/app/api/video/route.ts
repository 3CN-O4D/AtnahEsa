import { NextResponse } from 'next/server'

const KEY_RE = /^listings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm|mov|avi|mkv|m4v|ogv|3gp)$/i

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const key = searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    if (!KEY_RE.test(key)) return NextResponse.json({ error: 'Invalid key' }, { status: 403 })

    return NextResponse.redirect(`${process.env.R2_PUBLIC_URL}/${key}`, 302)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
