import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addSecurityHeaders } from '@/lib/security'
import { processAutoReleases } from '@/lib/escrow'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return addSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
  }

  try {
    const processed = await processAutoReleases()
    return addSecurityHeaders(NextResponse.json({ success: true, processed }))
  } catch (err) {
    return addSecurityHeaders(NextResponse.json({ error: 'Cron failed' }, { status: 500 }))
  }
}
