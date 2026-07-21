import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createAdminClient } from '@/lib/supabase/admin'

const transporter = nodemailer.createTransport({
  host: process.env.BREVO_SMTP_HOST,
  port: Number(process.env.BREVO_SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_KEY,
  },
})

const ADMIN_EMAILS = ['asehanta@gmail.com', 'derrickom005@gmail.com']
const BRAND = { name: 'AseHanta', blue: '#2563EB', dark: '#1E293B', gray: '#64748B', bg: '#F8FAFC', card: '#FFFFFF', border: '#E2E8F0' }

function baseHtml(body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg}">
<tr><td align="center" style="padding:40px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
<tr><td style="background:${BRAND.card};border-radius:12px;padding:0;box-shadow:0 1px 3px rgba(0,0,0,.08)">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px 32px 0">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="vertical-align:middle"><span style="font-size:22px;font-weight:700;color:${BRAND.blue}">${BRAND.name}</span></td>
<td style="vertical-align:middle;text-align:right"><span style="font-size:12px;color:${BRAND.gray}">Notification</span></td>
</tr>
</table>
</td></tr>
${body}
<tr><td style="padding:0 32px 32px">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="border-top:1px solid ${BRAND.border};padding-top:20px;text-align:center">
<p style="margin:0;font-size:12px;color:${BRAND.gray};line-height:1.6">
AseHanta &bull; Kenya<br>
If you have questions, reply to this email or contact support.
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

interface ActionDetail {
  emoji: string
  color: string
  badge: string
  title: string
  message: string
  fields: Record<string, string>
}

const actionTemplates: Record<string, (data: Record<string, string>) => ActionDetail> = {
  listing_approved: (d) => ({
    emoji: '✅',
    color: '#059669',
    badge: 'Listing Approved',
    title: 'Your listing has been published!',
    message: `Great news! Your property "${d.title}" has been reviewed and approved. It's now live and visible to potential tenants.`,
    fields: { Property: d.title || 'N/A', Location: d.location || 'N/A', 'Listing URL': d.url || 'N/A' },
  }),
  listing_rejected: (d) => ({
    emoji: '📋',
    color: '#DC2626',
    badge: 'Listing Not Approved',
    title: 'Update needed for your listing',
    message: `After review, we were unable to approve "${d.title}". Please check the feedback below and make the necessary updates.`,
    fields: { Property: d.title || 'N/A', Reason: d.reason || 'Not specified', 'Next Step': 'Edit and resubmit from your dashboard' },
  }),
  listing_taken: (d) => ({
    emoji: '🔑',
    color: '#2563EB',
    badge: 'Listing Marked Taken',
    title: 'Your property has been taken',
    message: `Your property "${d.title}" has been marked as taken. Congratulations on finding a tenant!`,
    fields: { Property: d.title || 'N/A', Location: d.location || 'N/A' },
  }),
  listing_booked: (d) => ({
    emoji: '📋',
    color: '#0891B2',
    badge: 'Booking Confirmed',
    title: 'New booking on your property',
    message: `A tenant has booked a viewing for "${d.title}". Please prepare for the visit.`,
    fields: { Property: d.title || 'N/A', 'Viewing Date': d.date || 'Scheduled', Contact: d.phone || 'N/A' },
  }),
  listing_deleted: (d) => ({
    emoji: '🗑️',
    color: '#DC2626',
    badge: 'Listing Removed',
    title: 'Your listing has been removed',
    message: `Your property "${d.title}" has been removed from the platform by an admin.`,
    fields: { Property: d.title || 'N/A', Reason: d.reason || 'Administrative action' },
  }),
  account_deleted: () => ({
    emoji: '⚠️',
    color: '#DC2626',
    badge: 'Account Deleted',
    title: 'Your AseHanta account has been deleted',
    message: 'Your account and all associated data have been permanently removed from our platform by an administrator.',
    fields: { 'Account Status': 'Deleted', 'Data': 'All data permanently removed' },
  }),
  role_changed: (d) => ({
    emoji: '🔄',
    color: '#7C3AED',
    badge: 'Role Updated',
    title: 'Your account role has been updated',
    message: `An administrator has changed your account role from "${d.old_role}" to "${d.new_role}".`,
    fields: { 'Previous Role': d.old_role || 'N/A', 'New Role': d.new_role || 'N/A' },
  }),
  booking_completed: (d) => ({
    emoji: '🎉',
    color: '#059669',
    badge: 'Visit Completed',
    title: 'Your property visit is complete',
    message: `The viewing for "${d.title}" has been marked as completed. We hope it went well!`,
    fields: { Property: d.title || 'N/A', Status: 'Completed' },
  }),
  refund_processed: (d) => ({
    emoji: '💰',
    color: '#D97706',
    badge: 'Refund Processed',
    title: 'Your refund has been processed',
    message: `A refund of ${d.amount} has been processed for your booking on "${d.title}".`,
    fields: { Property: d.title || 'N/A', 'Refund Amount': d.amount || 'N/A', Status: 'Processed' },
  }),
  request_contacted: (d) => ({
    emoji: '📞',
    color: '#2563EB',
    badge: 'Request Updated',
    title: 'Your house request has been updated',
    message: `Your house request has been marked as "${d.status}". We'll be in touch if more information is needed.`,
    fields: { Location: d.location || 'N/A', Status: d.status || 'N/A' },
  }),
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { to, user_id, action, data } = body as { to?: string; user_id?: string; action: string; data: Record<string, string> }

  let recipient = to
  if (!recipient && user_id) {
    const { data: authUser } = await supabase.auth.admin.getUserById(user_id)
    recipient = authUser?.user?.email || undefined
  }
  if (!recipient || !action) {
    return NextResponse.json({ error: 'to (or user_id) and action required' }, { status: 400 })
  }

  const template = actionTemplates[action]
  if (!template) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }

  const tpl = template(data || {})

  const fieldsHtml = Object.entries(tpl.fields).map(([label, value]) => `
    <tr><td style="padding:10px 0 4px;font-size:12px;font-weight:600;color:${BRAND.gray};text-transform:uppercase;letter-spacing:.5px">${label}</td></tr>
    <tr><td style="padding:0 0 10px;font-size:15px;color:${BRAND.dark};border-bottom:1px solid ${BRAND.border}">${value}</td></tr>
  `).join('')

  const bodyHtml = `
<tr><td style="padding:24px 32px;text-align:center">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font-size:40px;line-height:1;padding-bottom:8px">${tpl.emoji}</td></tr>
<tr><td><span style="display:inline-block;background:${tpl.color}15;color:${tpl.color};font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;letter-spacing:.3px">${tpl.badge}</span></td></tr>
<tr><td style="padding-top:16px"><h1 style="margin:0;font-size:20px;font-weight:700;color:${BRAND.dark}">${tpl.title}</h1></td></tr>
<tr><td style="padding-top:8px"><p style="margin:0;font-size:15px;color:${BRAND.gray};line-height:1.5">${tpl.message}</p></td></tr>
</table>
</td></tr>
<tr><td style="padding:8px 32px 24px"><table width="100%" cellpadding="0" cellspacing="0">${fieldsHtml}</table></td></tr>`

  try {
    await transporter.sendMail({
      from: `"${process.env.BREVO_FROM_NAME}" <${process.env.BREVO_FROM_EMAIL}>`,
      to,
      subject: `[AseHanta] ${tpl.badge}`,
      html: baseHtml(bodyHtml),
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to send user notification:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
