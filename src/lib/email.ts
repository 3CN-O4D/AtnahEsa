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
<td style="vertical-align:middle;text-align:right"><span style="font-size:12px;color:${BRAND.gray}">Find your home in Kenya</span></td>
</tr>
</table>
</td></tr>
${body}
<tr><td style="padding:0 32px 32px">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="border-top:1px solid ${BRAND.border};padding-top:20px;text-align:center">
<p style="margin:0;font-size:12px;color:${BRAND.gray};line-height:1.6">
AseHanta &bull; Kenya<br>
If you didn&rsquo;t request this, you can ignore this email.
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

const typeConfig: Record<string, { emoji: string; color: string; badge: string }> = {
  signup: { emoji: '🎉', color: '#059669', badge: 'Email Verification' },
  password_reset: { emoji: '🔐', color: '#D97706', badge: 'Password Reset' },
  password_create: { emoji: '🔑', color: '#7C3AED', badge: 'Create Password' },
  profile_update: { emoji: '👤', color: '#2563EB', badge: 'Profile Update' },
  email_change: { emoji: '📧', color: '#0891B2', badge: 'Email Change' },
}

export async function sendOtpEmail(email: string, otp: string, type: string) {
  const cfg = typeConfig[type] || { emoji: '✉️', color: '#2563EB', badge: 'Verification' }

  const subjects: Record<string, string> = {
    signup: 'Verify your AseHanta account',
    password_reset: 'Reset your AseHanta password',
    password_create: 'Create your AseHanta password',
    profile_update: 'Confirm your AseHanta profile changes',
    email_change: 'Verify your new email address',
  }

  const messages: Record<string, string> = {
    signup: 'Thanks for joining! Use the code below to verify your email address and activate your account.',
    password_reset: 'We received a password reset request. Use the code below to create a new password.',
    password_create: 'Use the code below to set a password for your AseHanta account.',
    profile_update: 'Use the code below to confirm the changes to your profile.',
    email_change: 'Use the code below to confirm your new email address.',
  }

  const subject = subjects[type] || 'AseHanta verification code'
  const message = messages[type] || 'Use the code below to verify.'

  const body = `
<tr><td style="padding:24px 32px;text-align:center">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font-size:40px;line-height:1;padding-bottom:8px">${cfg.emoji}</td></tr>
<tr><td><span style="display:inline-block;background:${cfg.color}15;color:${cfg.color};font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;letter-spacing:.3px">${cfg.badge}</span></td></tr>
<tr><td style="padding-top:16px"><h1 style="margin:0;font-size:20px;font-weight:700;color:${BRAND.dark}">${subject}</h1></td></tr>
<tr><td style="padding-top:8px"><p style="margin:0;font-size:15px;color:${BRAND.gray};line-height:1.5">${message}</p></td></tr>
<tr><td style="padding-top:24px">
<table cellpadding="0" cellspacing="0" style="margin:0 auto">
<tr><td style="background:${BRAND.bg};border-radius:10px;padding:20px 40px;letter-spacing:8px;font-size:32px;font-weight:700;color:${BRAND.dark};font-family:monospace">${otp}</td></tr>
</table>
</td></tr>
<tr><td style="padding-top:20px"><p style="margin:0;font-size:13px;color:#EF4444">⏱ Expires in 10 minutes</p></td></tr>
</table>
</td></tr>`

  await transporter.sendMail({
    from: `"${process.env.BREVO_FROM_NAME}" <${process.env.BREVO_FROM_EMAIL}>`,
    to: email,
    subject,
    html: baseHtml(body),
  })
}
