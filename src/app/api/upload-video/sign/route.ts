import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const bucket = searchParams.get('bucket')
    const key = searchParams.get('key')
    if (!bucket || !key) return NextResponse.json({ error: 'Missing bucket or key' }, { status: 400 })

    const expectedBucket = process.env.S3_BUCKET || 'videos'
    if (bucket !== expectedBucket) return NextResponse.json({ error: 'Invalid bucket' }, { status: 403 })
    if (!key.startsWith('listings/')) return NextResponse.json({ error: 'Invalid key' }, { status: 403 })

    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(key, 604800)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ url: data.signedUrl })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to sign URL' }, { status: 500 })
  }
}
