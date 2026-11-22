import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Admin proxy for the WhatsApp worker's live auth controls.
 *
 * GET  — connection state, linked number, current pairing code.
 * POST — { action: 'code' | 'restart' | 'refresh_session' | 'switch', number? }
 *
 * The worker owns the socket, so it is the only process that can pair or
 * restart. All calls use the shared bridge secret; it is never sent to the
 * browser.
 */

const WORKER_URL = (
  process.env.WHATSAPP_WORKER_URL || 'https://atnahesa.onrender.com'
).replace(/\/$/, '')
const SECRET = process.env.WHATSAPP_BRIDGE_SECRET || ''
const ACTIONS = ['code', 'restart', 'refresh_session', 'switch'] as const

function workerHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-bridge-secret': SECRET,
  }
}

async function callWorker(path: string, init?: RequestInit) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    ...init,
    headers: workerHeaders(),
    cache: 'no-store',
    signal: AbortSignal.timeout(25_000),
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

export async function GET(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response

  if (!SECRET) {
    return NextResponse.json({ error: 'WHATSAPP_BRIDGE_SECRET is not configured.' }, { status: 503 })
  }

  try {
    const result = await callWorker('/bot/auth')
    return NextResponse.json(result.body, {
      status: result.ok ? 200 : result.status,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[admin/whatsapp/auth] worker unreachable:', error)
    return NextResponse.json({ error: 'WhatsApp worker is unreachable.' }, { status: 502 })
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db, email } = auth.context

  if (!SECRET) {
    return NextResponse.json({ error: 'WHATSAPP_BRIDGE_SECRET is not configured.' }, { status: 503 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const action = String(body.action || '')
  if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  }
  if (action === 'switch') {
    const number = String(body.number || '').replace(/\D/g, '')
    if (!/^\d{8,15}$/.test(number)) {
      return NextResponse.json({ error: 'Enter digits only, including country code.' }, { status: 400 })
    }
    body.number = number
  }
  if (action === 'refresh_session') {
    body.confirmed = true
  }

  try {
    const result = await callWorker('/bot/auth', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    await db.from('whatsapp_control_audit').insert({
      actor: email,
      action: `auth:${action}`,
      detail: { ok: result.ok, number: action === 'switch' ? body.number : null },
    })
    return NextResponse.json(result.body, {
      status: result.ok ? 200 : result.status,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[admin/whatsapp/auth] worker action failed:', error)
    return NextResponse.json({ error: 'WhatsApp worker is unreachable.' }, { status: 502 })
  }
}
