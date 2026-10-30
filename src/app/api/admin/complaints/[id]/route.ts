import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { status?: string; priority?: string; admin_note?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const patch: Record<string, string> = { updated_at: new Date().toISOString() }
  if (body.status) {
    if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: 'Unsupported status' }, { status: 400 })
    }
    patch.status = body.status
  }
  if (body.priority) {
    if (!PRIORITIES.includes(body.priority as (typeof PRIORITIES)[number])) {
      return NextResponse.json({ error: 'Unsupported priority' }, { status: 400 })
    }
    patch.priority = body.priority
  }
  if (typeof body.admin_note === 'string') patch.admin_note = body.admin_note.slice(0, 4000)

  const admin = createAdminClient()
  const { data, error } = await admin.from('complaints').update(patch).eq('id', id).select('*').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
  return NextResponse.json(data)
}
