import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { queryStatus } from '@/lib/daraja'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { checkout_request_id } = await req.json()

    if (!checkout_request_id) {
      return NextResponse.json({ error: 'Missing checkout_request_id' }, { status: 400 })
    }

    const result = await queryStatus(checkout_request_id)

    return NextResponse.json(result)
  } catch (err) {
    console.error('Status query error:', err)
    return NextResponse.json({ error: 'Failed to query status' }, { status: 500 })
  }
}