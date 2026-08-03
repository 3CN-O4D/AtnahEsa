import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyAdmins, notifyUser } from '@/lib/notify'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import nodemailer from 'nodemailer'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://asehanta.com'

const transporter = nodemailer.createTransport({
  host: process.env.BREVO_SMTP_HOST,
  port: Number(process.env.BREVO_SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_KEY,
  },
})

const ADMINS = (process.env.ADMIN_EMAILS || 'asehanta@gmail.com')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const BRAND = { name: 'AseHanta', blue: '#2563EB', dark: '#1E293B', gray: '#64748B', bg: '#F8FAFC', card: '#FFFFFF', border: '#E2E8F0' }

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function baseHtml(body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg}">
<tr><td align="center" style="padding:40px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="background:${BRAND.card};border-radius:12px;padding:0;box-shadow:0 1px 3px rgba(0,0,0,.08)">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px 32px 0">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="vertical-align:middle"><span style="font-size:22px;font-weight:700;color:${BRAND.blue}">${BRAND.name}</span></td>
<td style="vertical-align:middle;text-align:right"><span style="font-size:12px;color:${BRAND.gray}">Admin Notification</span></td>
</tr>
</table>
</td></tr>
${body}
<tr><td style="padding:0 32px 32px">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="border-top:1px solid ${BRAND.border};padding-top:20px;text-align:center">
<p style="margin:0;font-size:12px;color:${BRAND.gray};line-height:1.6">
AseHanta &bull; Kenya &bull; <a href="${BASE}" style="color:${BRAND.blue};text-decoration:none">${BASE}</a>
</p>
</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function field(label: string, value: string) {
  return `<tr>
<td style="padding:10px 0 4px;font-size:12px;font-weight:600;color:${BRAND.gray};text-transform:uppercase;letter-spacing:.5px">${label}</td>
</tr>
<tr>
<td style="padding:0 0 10px;font-size:15px;color:${BRAND.dark};border-bottom:1px solid ${BRAND.border}">${value}</td>
</tr>`
}

export async function POST(req: Request) {
  try {
    const { allowed, retryAfter } = await checkRateLimit(`report:${getClientIp(req)}`, 5, 300)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
    }

    const { target_type, target_id, target_title, reasons, description } = await req.json()

    if (!target_type || !target_id || !reasons || !Array.isArray(reasons) || reasons.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const reasonStr = reasons.join(', ')

    const { error } = await supabase.from('flagged_reports').insert({
      reporter_id: user?.id || null,
      reporter_email: user?.email || 'anonymous',
      target_type,
      target_id,
      target_title: target_title || '',
      reason: reasonStr,
      description: description || '',
      status: 'pending',
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const lines: [string, string][] = [
      ['Target Type', esc(target_type)],
      ['Target', esc(target_title || target_id)],
      ['Reasons', esc(reasonStr)],
      ['Description', esc(description || 'N/A')],
      ['Reporter', esc(user?.email || 'Anonymous')],
    ]

    if (target_type === 'listing') {
      const { data: listing } = await supabase
        .from('listings')
        .select('title, price, location, uploader_id, created_at')
        .eq('id', target_id)
        .maybeSingle()

      if (listing) {
        lines.push(['Price', `KSh ${(listing.price).toLocaleString()}`])
        lines.push(['Location', listing.location])
        if (listing.uploader_id) {
          const { data: lister } = await supabase
            .from('profiles_public')
            .select('full_name, username')
            .eq('id', listing.uploader_id)
            .maybeSingle()
          lines.push(['Listed By', lister?.full_name || lister?.username || 'Unknown'])
        }
        lines.push(['Listing Link', `<a href="${esc(`${BASE}/listings/${target_id}`)}" style="color:${BRAND.blue}">${esc(`${BASE}/listings/${target_id}`)}</a>`])
        lines.push(['Admin Listing Link', `<a href="${esc(`${BASE}/admin?listing=${target_id}`)}" style="color:${BRAND.blue}">Open in Admin</a>`])
        if (listing.uploader_id) {
          lines.push(['Lister Profile', `<a href="${esc(`${BASE}/listers/${listing.uploader_id}`)}" style="color:${BRAND.blue}">${esc(`${BASE}/listers/${listing.uploader_id}`)}</a>`])
        }
      }
    }

    if (user?.id) {
      lines.push(['Reporter Profile', `<a href="${esc(`${BASE}/listers/${user.id}`)}" style="color:${BRAND.blue}">${esc(`${BASE}/listers/${user.id}`)}</a>`])
    }

    const fieldsHtml = lines.map(([l, v]) => field(l, v)).join('')

    const bodyHtml = `
<tr><td style="padding:24px 32px;text-align:center">
<span style="display:inline-block;background:#DC262615;color:#DC2626;font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;letter-spacing:.3px">🚩 New Report</span>
<h1 style="margin:16px 0 0;font-size:20px;font-weight:700;color:${BRAND.dark}">${esc(target_type)} has been reported</h1>
<p style="margin:8px 0 0;font-size:15px;color:${BRAND.gray};line-height:1.5">A user has flagged this content for review. Inspect it below.</p>
</td></tr>
<tr><td style="padding:8px 32px 24px"><table width="100%" cellpadding="0" cellspacing="0">${fieldsHtml}</table></td></tr>`

    const safeSubject = `Report: ${target_title || target_id} (${reasonStr})`.replace(/[\r\n\u0000-\u001F\u007F]/g, ' ').trim()

    for (const to of ADMINS) {
      await transporter.sendMail({
        from: `"${process.env.BREVO_FROM_NAME}" <${process.env.BREVO_FROM_EMAIL}>`,
        to,
        subject: `[AseHanta] ${safeSubject}`,
        html: baseHtml(bodyHtml),
      })
    }

    notifyUser(user?.email || '', 'Report Submitted', 'Your report has been received',
      { 'Reported': target_title || target_id, Reasons: reasonStr, Status: 'Under review' }
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
