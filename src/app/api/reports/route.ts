import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/notify'

export async function POST(req: Request) {
  try {
    const { target_type, target_id, target_title, reason, description } = await req.json()

    if (!target_type || !target_id || !reason || !description) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('flagged_reports').insert({
      reporter_id: user?.id || null,
      reporter_email: user?.email || 'anonymous',
      target_type,
      target_id,
      target_title: target_title || '',
      reason,
      description,
      status: 'pending',
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    notifyAdmins(
      `Reported: ${target_type} - ${reason}`,
      'New Report Submitted',
      { 'Target Type': target_type, 'Target': target_title || target_id, Reason: reason, Description: description, Reporter: user?.email || 'Anonymous' }
    )

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data } = await supabase.from('flagged_reports').select('*').order('created_at', { ascending: false })
    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, status } = await req.json()
    if (!id || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await supabase.from('flagged_reports').update({ status }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
