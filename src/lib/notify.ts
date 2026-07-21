import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.BREVO_SMTP_HOST,
  port: Number(process.env.BREVO_SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_KEY,
  },
})

const ADMINS = ['asehanta@gmail.com', 'derrickom005@gmail.com']
const BRAND = { name: 'AseHanta', blue: '#2563EB', dark: '#1E293B', gray: '#64748B', bg: '#F8FAFC', card: '#FFFFFF', border: '#E2E8F0' }

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
AseHanta &bull; Kenya &bull; <a href="https://asehanta.com" style="color:${BRAND.blue};text-decoration:none">asehanta.com</a>
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

function section(title: string, color: string, emoji: string, lines: [string, string][]) {
  return `
<tr><td style="padding:24px 32px 8px">
<span style="display:inline-block;background:${color}15;color:${color};font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;letter-spacing:.3px">${emoji} ${title}</span>
</td></tr>
<tr><td style="padding:8px 32px 24px">
<table width="100%" cellpadding="0" cellspacing="0">
${lines.map(([l, v]) => field(l, v)).join('')}
</table>
</td></tr>`
}

function badge(text: string, bg: string, color: string) {
  return `<span style="display:inline-block;background:${bg};color:${color};font-size:12px;font-weight:600;padding:3px 10px;border-radius:5px">${text}</span>`
}

type Template = {
  emoji: string
  color: string
  label: string
  format?: (lines: [string, string][]) => string
}

const templates: Record<string, Template> = {
  'New House Request': { emoji: '🏠', color: '#2563EB', label: 'House Request' },
  'New Contact Submission': { emoji: '📬', color: '#7C3AED', label: 'Contact Form' },
  'New User Registration': { emoji: '👤', color: '#059669', label: 'New User' },
  'New Listing Uploaded': { emoji: '🏡', color: '#D97706', label: 'New Listing' },
  'New House Booking': { emoji: '📋', color: '#0891B2', label: 'Booking' },
  'STK Push Initiated': { emoji: '💳', color: '#2563EB', label: 'STK Push' },
  'Payment Successful': { emoji: '✅', color: '#059669', label: 'Payment Received' },
  'Payment Failed': { emoji: '❌', color: '#DC2626', label: 'Payment Failed' },
  'Manual Payment Verified': { emoji: '📱', color: '#7C3AED', label: 'Manual Payment' },
  'Manual Payment Submitted for Verification': { emoji: '⏳', color: '#D97706', label: 'Manual Payment Pending' },
  'Manual Payment Verification Failed': { emoji: '⚠️', color: '#DC2626', label: 'Verification Failed' },
  'Manual Payment Verified by Daraja': { emoji: '✅', color: '#059669', label: 'Payment Confirmed' },
  'B2C Refund Initiated': { emoji: '💰', color: '#059669', label: 'B2C Refund' },
  'B2C Refund Failed': { emoji: '❌', color: '#DC2626', label: 'B2C Failed' },
}

function detectTemplate(subject: string): Template {
  for (const [key, tmpl] of Object.entries(templates)) {
    if (subject.startsWith(key)) return tmpl
  }
  if (subject.startsWith('Reported')) return { emoji: '🚩', color: '#DC2626', label: 'Report' }
  if (subject.startsWith('WIFI')) return { emoji: '📶', color: '#0891B2', label: 'WiFi Request' }
  return { emoji: '📌', color: BRAND.blue, label: 'Notification' }
}

function statusBadge(status: string) {
  const s = status.toLowerCase()
  if (s === 'pending') return badge('Pending', '#FEF3C7', '#D97706')
  if (s === 'success' || s === 'contacted' || s === 'fulfilled') return badge('Active', '#D1FAE5', '#059669')
  if (s === 'failed') return badge('Failed', '#FEE2E2', '#DC2626')
  if (s === 'paid') return badge('Paid', '#D1FAE5', '#059669')
  return badge(status, '#E2E8F0', BRAND.gray)
}

export async function notifyUser(to: string, subject: string, title: string, fields: Record<string, string>) {
  const body = render(subject, title, fields)
  try {
    await transporter.sendMail({
      from: `"${process.env.BREVO_FROM_NAME}" <${process.env.BREVO_FROM_EMAIL}>`,
      to,
      subject: `[AseHanta] ${subject}`,
      html: body,
    })
  } catch (err) {
    console.error(`Failed to notify ${to}:`, err)
  }
}

function render(subject: string, title: string, fields: Record<string, string>) {
  const tmpl = detectTemplate(subject)
  const lines = Object.entries(fields) as [string, string][]

  const body = section(tmpl.label, tmpl.color, tmpl.emoji, lines)
  return baseHtml(body)
}

export async function notifyAdmins(subject: string, title: string, fields: Record<string, string>) {
  const body = render(subject, title, fields)

  for (const to of ADMINS) {
    try {
      await transporter.sendMail({
        from: `"${process.env.BREVO_FROM_NAME}" <${process.env.BREVO_FROM_EMAIL}>`,
        to,
        subject: `[AseHanta] ${subject}`,
        html: body,
      })
    } catch (err) {
      console.error(`Failed to notify ${to}:`, err)
    }
  }
}
