import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const format = searchParams.get('format') || 'json'

    const adminSupabase = createAdminClient()

    let q = adminSupabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })

    if (from) q = q.gte('created_at', from)
    if (to) q = q.lte('created_at', to)

    const { data: transactions, error } = await q

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const txList = transactions || []
    const total = txList.reduce((sum, tx) => sum + (tx.amount || 0), 0)
    const successTotal = txList
      .filter((tx) => tx.status === 'success')
      .reduce((sum, tx) => sum + (tx.amount || 0), 0)

    if (format === 'pdf') {
      const rows = txList.map((tx, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${tx.mpesa_receipt || '-'}</td>
          <td>${tx.phone}</td>
          <td>KES ${tx.amount?.toLocaleString() || 0}</td>
          <td>${tx.status}</td>
          <td>${tx.created_at ? new Date(tx.created_at).toLocaleString() : '-'}</td>
        </tr>
      `).join('')

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>AseHanta Payment Report</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; }
    h1 { color: #1e40af; margin-bottom: 8px; }
    .meta { color: #666; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1e40af; color: white; padding: 10px 12px; text-align: left; font-size: 13px; }
    td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    tr:nth-child(even) { background: #f9fafb; }
    .total { font-weight: bold; font-size: 15px; margin-top: 16px; }
  </style>
</head>
<body>
  <h1>AseHanta Payment Report</h1>
  <p class="meta">Generated: ${new Date().toLocaleString()}</p>
  ${from ? `<p class="meta">From: ${new Date(from).toLocaleDateString()}</p>` : ''}
  ${to ? `<p class="meta">To: ${new Date(to).toLocaleDateString()}</p>` : ''}
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Receipt</th>
        <th>Phone</th>
        <th>Amount</th>
        <th>Status</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <p class="total">Total: KES ${total.toLocaleString()}</p>
  <p class="total">Successful: KES ${successTotal.toLocaleString()}</p>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  return NextResponse.json(transactions)
  } catch (err) {
    console.error('Report error:', err)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}