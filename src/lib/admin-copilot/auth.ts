import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addSecurityHeaders } from '@/lib/security'
import { getClientIp } from '@/lib/rate-limit'

export interface AdminContext {
  userId: string
  email: string
  ip: string
  /** Service-role client. Only created after the admin check passes. */
  db: ReturnType<typeof createAdminClient>
}

export type AdminAuthResult =
  | { ok: true; context: AdminContext }
  | { ok: false; response: NextResponse }

/**
 * Gate every copilot request on a real, server-verified admin session.
 *
 * The model never authorises anything: this check runs before any tool can be
 * proposed or executed, and the service-role client is only created after it
 * passes.
 */
export async function requireAdminRequest(req: Request): Promise<AdminAuthResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      response: addSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 })),
    }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .maybeSingle()

  if (error || profile?.role !== 'admin') {
    return {
      ok: false,
      response: addSecurityHeaders(NextResponse.json({ error: 'Forbidden' }, { status: 403 })),
    }
  }

  return {
    ok: true,
    context: {
      userId: user.id,
      email: profile.email || user.email || 'admin',
      ip: getClientIp(req),
      db: createAdminClient(),
    },
  }
}
