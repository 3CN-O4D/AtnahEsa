import { NextResponse } from 'next/server'

/**
 * Keeps the Render WhatsApp worker awake.
 *
 * Render's free tier spins a web service down after ~15 minutes without
 * traffic. The Baileys worker holds a persistent WebSocket to WhatsApp, so a
 * spin-down kills the socket and the 3-hourly marketing scheduler stops until
 * someone visits the site or the health check runs.
 *
 * Vercel cron calls this every 14 minutes, which GETs `WHATSAPP_RENDER_URL`
 * (default https://atnahesa.onrender.com/health). `/health` always returns 200,
 * even before pairing, so Render marks the service healthy and keeps it up.
 *
 * Protected by CRON_SECRET so only Vercel (or someone with the secret) can
 * trigger it.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url =
    process.env.WHATSAPP_RENDER_URL ||
    'https://atnahesa.onrender.com'
  const health = url.replace(/\/$/, '') + '/health'

  try {
    const res = await fetch(health, { signal: AbortSignal.timeout(20_000) })
    const body = await res.json().catch(() => ({}))
    return NextResponse.json(
      { ok: res.ok, status: res.status, health: body },
      { status: res.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
