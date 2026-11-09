import { NextResponse } from 'next/server'
import { aiStatus } from '@/lib/chat/ai'
import { addSecurityHeaders } from '@/lib/security'

export const runtime = 'nodejs'

/** Key-free AI configuration check, e.g. GET /api/chat/status. */
export async function GET() {
  return addSecurityHeaders(
    NextResponse.json(aiStatus(), {
      headers: { 'Cache-Control': 'no-store' },
    })
  )
}
