import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const key = searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    if (!key.startsWith('listings/')) return NextResponse.json({ error: 'Invalid key' }, { status: 403 })

    return NextResponse.redirect(`${process.env.R2_PUBLIC_URL}/${key}`, 302)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
