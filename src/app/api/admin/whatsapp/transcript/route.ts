import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'
import {
  loadTranscript,
  renderTranscriptHtml,
  renderTranscriptText,
} from '@/lib/whatsapp/transcript'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Full conversation for one chat.
 *
 * `?format=json` (default) powers the in-panel chat viewer.
 * `?format=html` returns a printable WhatsApp-style page — the closest honest
 * equivalent to a screenshot, since WhatsApp exposes no screenshot API.
 * `?format=txt` returns a plain text export.
 */
export async function GET(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db } = auth.context

  const url = new URL(req.url)
  const phone = url.searchParams.get('phone')
  const jid = url.searchParams.get('jid')
  const format = url.searchParams.get('format') || 'json'
  const limit = Number(url.searchParams.get('limit')) || 300

  if (!phone && !jid) {
    return NextResponse.json({ error: 'phone or jid is required' }, { status: 400 })
  }

  try {
    const transcript = await loadTranscript(db, { phone, jid, limit })

    if (format === 'html') {
      return new Response(renderTranscriptHtml(transcript), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      })
    }

    if (format === 'txt') {
      return new Response(renderTranscriptText(transcript), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="asehanta-chat-${transcript.phone || 'unknown'}.txt"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    return NextResponse.json(transcript, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[admin/whatsapp] transcript failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Could not load that transcript.' }, { status: 500 })
  }
}
