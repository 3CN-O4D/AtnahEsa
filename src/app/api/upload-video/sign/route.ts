import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const key = searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    if (!key.startsWith('listings/')) return NextResponse.json({ error: 'Invalid key' }, { status: 403 })

    return NextResponse.json({ url: `${process.env.R2_PUBLIC_URL}/${key}` })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to sign URL' }, { status: 500 })
  }
}
