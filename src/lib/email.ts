import nodemailer from 'nodemailer'
import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_DISPLAY, WHATSAPP_NUMBER } from '@/lib/constants'

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
  login: { emoji: '🔓', color: '#2563EB', badge: 'Sign-in Code' },
  password_reset: { emoji: '🔐', color: '#D97706', badge: 'Password Reset' },
  password_create: { emoji: '🔑', color: '#7C3AED', badge: 'Create Password' },
  profile_update: { emoji: '👤', color: '#2563EB', badge: 'Profile Update' },
  email_change: { emoji: '📧', color: '#0891B2', badge: 'Email Change' },
}

export async function sendBulkAnnouncementEmail(email: string) {
  const subject = 'AseHanta is back – New listings coming Monday'

  const body = `
<tr><td style="padding:32px">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding-bottom:24px"><h1 style="margin:0;font-size:24px;font-weight:700;color:${BRAND.dark}">AseHanta is back</h1></td></tr>
    <tr><td style="padding-bottom:16px"><p style="margin:0;font-size:15px;color:${BRAND.dark};line-height:1.7">Hello,</p></td></tr>
    <tr><td style="padding-bottom:16px"><p style="margin:0;font-size:15px;color:${BRAND.dark};line-height:1.7">We're pleased to let you know that <strong>AseHanta</strong> is back from a short break.</p></td></tr>
    <tr><td style="padding-bottom:16px"><p style="margin:0;font-size:15px;color:${BRAND.dark};line-height:1.7">New property listings are expected to go live starting <strong>Monday</strong>. We'll be adding fresh houses across Kenya for you to browse, book and connect with listers.</p></td></tr>
    <tr><td style="padding-bottom:24px"><p style="margin:0;font-size:15px;color:${BRAND.dark};line-height:1.7">Thank you for your patience and continued trust in AseHanta.</p></td></tr>
    <tr><td style="padding-bottom:32px">
      <table cellpadding="0" cellspacing="0">
        <tr><td style="background:${BRAND.blue};border-radius:8px"><a href="https://www.asehanta.com/listings" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px">Browse Listings</a></td></tr>
      </table>
    </td></tr>
    <tr><td><p style="margin:0;font-size:15px;color:${BRAND.dark};line-height:1.7">Kind regards,<br><strong>The AseHanta Team</strong></p></td></tr>
  </table>
</td></tr>`

  await transporter.sendMail({
    from: `"${process.env.BREVO_FROM_NAME}" <${process.env.BREVO_FROM_EMAIL}>`,
    to: email,
    subject,
    html: baseHtml(body),
  })
}

export async function sendOtpEmail(email: string, otp: string, type: string) {
  const cfg = typeConfig[type] || { emoji: '✉️', color: '#2563EB', badge: 'Verification' }

  const subjects: Record<string, string> = {
    signup: 'Verify your AseHanta account',
    login: 'Your AseHanta sign-in code',
    password_reset: 'Reset your AseHanta password',
    password_create: 'Create your AseHanta password',
    profile_update: 'Confirm your AseHanta profile changes',
    email_change: 'Verify your new email address',
  }

  const messages: Record<string, string> = {
    signup: 'Thanks for joining! Use the code below to verify your email address and activate your account.',
    login: 'Use the code below to sign in to your AseHanta account. If this was not you, you can safely ignore this email.',
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

/**
 * Payment receipt email with the branded PDF attached.
 *
 * The escrow rules are repeated in the email body (not only in the PDF) so a
 * hunter who never opens the attachment still knows exactly what they bought.
 */
export async function sendPaymentReceiptEmail(params: {
  to: string
  name?: string
  listingTitle: string
  listingLocation?: string
  listingDescription?: string
  listerName?: string
  listerPhone?: string
  amount: number
  receiptNumber: string
  heldUntil?: string | null
  /** Optional: if PDF rendering fails the email still goes out. */
  pdf?: Buffer
  bookingId: string
}) {
  const {
    to,
    name,
    listingTitle,
    listingLocation,
    listingDescription,
    listerName,
    listerPhone,
    amount,
    receiptNumber,
    heldUntil,
    pdf,
    bookingId,
  } = params
  const escape = (value: string) => value.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c))
  const safeTitle = escape(listingTitle)
  const amountText = `KES ${Math.round(amount).toLocaleString()}`
  const heldText = heldUntil
    ? new Date(heldUntil).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '24 hours'

  const body = `
<tr><td style="padding:32px 32px 8px">
  <span style="display:inline-block;background:#D1FAE5;color:#059669;font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;letter-spacing:.3px">✅ Payment received</span>
  <h1 style="margin:14px 0 0;font-size:22px;font-weight:700;color:${BRAND.dark}">Your payment is safe in escrow</h1>
  <p style="margin:10px 0 0;font-size:15px;color:${BRAND.gray};line-height:1.6">
    Hi ${name ? escape(name) : 'there'}, we received <strong style="color:${BRAND.dark}">${amountText}</strong> for
    <strong style="color:${BRAND.dark}">${safeTitle}</strong>. ${pdf ? 'Your branded receipt is attached as a PDF.' : 'Your receipt number is below and is always available in My Bookings.'}
  </p>
</td></tr>
<tr><td style="padding:8px 32px 12px">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};border-radius:10px">
    <tr><td style="padding:18px 20px">
      <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:${BRAND.gray};text-transform:uppercase;letter-spacing:.5px">Escrow rules</p>
      <p style="margin:0;font-size:13px;color:${BRAND.dark};line-height:1.7">
        • We hold your money for <strong>24 hours</strong> (until ${heldText}) while you view the house.<br>
        • Happy? Confirm in My Bookings and we pay the lister.<br>
        • Changed your mind? You get <strong>85% back</strong>.<br>
        • Fake listing or no show? You get <strong>100% back</strong>.
      </p>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 32px 12px">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};border-radius:10px">
    <tr><td style="padding:18px 20px">
      <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:${BRAND.gray};text-transform:uppercase;letter-spacing:.5px">${listerName ? 'The house contact' : 'House details'}</p>
      <p style="margin:0;font-size:13px;color:${BRAND.dark};line-height:1.7">
        <strong>${safeTitle}</strong>${listingLocation ? ` — ${escape(listingLocation)}` : ''}<br>
        ${listingDescription ? `${escape(listingDescription.slice(0, 400))}<br>` : ''}
        ${listerPhone
          ? `Lister: <strong>${escape(listerName || 'AseHanta lister')}</strong> · <a href="tel:${listerPhone}" style="color:${BRAND.blue};text-decoration:none"><strong>${escape(listerPhone)}</strong></a>`
          : 'The lister&rsquo;s phone number is unlocked in My Bookings after payment.'}
      </p>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 32px 12px">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px">
    <tr><td style="padding:18px 20px">
      <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#B45309;text-transform:uppercase;letter-spacing:.5px">What to do next</p>
      <p style="margin:0;font-size:13px;color:#78350F;line-height:1.7">
        • Call the lister (or WhatsApp) and agree on a viewing time within the next 24 hours.<br>
        • Never send money directly to a lister — everything goes through AseHanta escrow.<br>
        • No show, wrong house, or the phone is unavailable? Report it in My Bookings for a <strong>100% refund</strong>.
      </p>
      <p style="margin:12px 0 0;font-size:12px;color:#78350F;line-height:1.7">
        Need a human? AseHanta support is on <a href="tel:${CONTACT_PHONE}" style="color:#B45309;font-weight:600;text-decoration:none">${CONTACT_PHONE_DISPLAY}</a>,
        <a href="mailto:${CONTACT_EMAIL}" style="color:#B45309;font-weight:600;text-decoration:none">${CONTACT_EMAIL}</a> or
        <a href="https://wa.me/${WHATSAPP_NUMBER}" style="color:#B45309;font-weight:600;text-decoration:none">WhatsApp</a>.
      </p>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 32px 24px">
  <table cellpadding="0" cellspacing="0">
    <tr><td style="background:${BRAND.blue};border-radius:8px">
      <a href="https://www.asehanta.com/my-bookings?tab=payments" style="display:inline-block;padding:12px 26px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px">Open My Bookings</a>
    </td></tr>
  </table>
  <p style="margin:14px 0 0;font-size:12px;color:${BRAND.gray}">M-Pesa receipt: ${receiptNumber || '—'} · Booking ${bookingId.slice(0, 8)}</p>
</td></tr>`

  await transporter.sendMail({
    from: `"${process.env.BREVO_FROM_NAME}" <${process.env.BREVO_FROM_EMAIL}>`,
    to,
    subject: `[AseHanta] Payment receipt — ${amountText} for ${listingTitle}`,
    html: baseHtml(body),
    ...(pdf
      ? {
          attachments: [
            {
              filename: `AseHanta-receipt-${bookingId.slice(0, 8)}.pdf`,
              content: pdf,
              contentType: 'application/pdf',
            },
          ],
        }
      : {}),
  })
}

/**
 * Sent to admins when a hunter confirms they are happy with the house.
 * It is the trigger for the lister payout: the panel carries every number the
 * admin needs (hunter payment details + lister M-Pesa number) and links to the
 * Treasury panel where the number can be copied and the payout SMS pasted.
 */
export async function sendAdminPayoutPanelEmail(params: {
  bookingId: string
  listingTitle: string
  listingLocation?: string
  hunterName?: string
  hunterPhone?: string
  hunterEmail?: string
  amount: number
  receipt?: string | null
  paymentMethod?: string | null
  listerName?: string
  listerPhone?: string | null
  payoutAmount: number
  confirmedAt?: string | null
  rating?: number | null
  reviewComment?: string | null
}) {
  const admins = (process.env.ADMIN_EMAILS || 'asehanta@gmail.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!admins.length) return

  const escape = (value: unknown) =>
    String(value ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] || c))
  const amountText = `KES ${Math.round(params.amount).toLocaleString()}`
  const payoutText = `KES ${Math.round(params.payoutAmount).toLocaleString()}`
  const treasuryUrl = `https://www.asehanta.com/admin/treasury?booking=${encodeURIComponent(params.bookingId)}`
  const confirmedText = params.confirmedAt
    ? new Date(params.confirmedAt).toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'just now'

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid ${BRAND.border};font-size:12px;color:${BRAND.gray};width:42%">${escape(label)}</td>
      <td style="padding:9px 0;border-bottom:1px solid ${BRAND.border};font-size:13px;font-weight:600;color:${BRAND.dark};text-align:right">${value}</td>
    </tr>`

  const hunterPhone = params.hunterPhone
    ? `<a href="tel:${escape(params.hunterPhone)}" style="color:${BRAND.blue};text-decoration:none">${escape(params.hunterPhone)}</a>`
    : '—'
  const listerNumber = params.listerPhone
    ? `<span style="display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;letter-spacing:.5px;background:#ECFDF5;color:#047857;border:1px solid #A7F3D0;border-radius:8px;padding:6px 12px">${escape(params.listerPhone)}</span>`
    : `<span style="color:#B45309">No lister M-Pesa number on file — ask the lister before paying.</span>`

  const body = `
<tr><td style="padding:32px 32px 8px">
  <span style="display:inline-block;background:#D1FAE5;color:#059669;font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;letter-spacing:.3px">✅ Hunter confirmed — payout ready</span>
  <h1 style="margin:14px 0 0;font-size:22px;font-weight:700;color:${BRAND.dark}">Release the lister payout</h1>
  <p style="margin:10px 0 0;font-size:14px;color:${BRAND.gray};line-height:1.6">
    The hunter confirmed they are happy with <strong style="color:${BRAND.dark}">${escape(params.listingTitle)}</strong>
    on ${escape(confirmedText)}. Pay the lister their share, then paste the M-Pesa SMS into the Treasury panel to close the escrow.
  </p>
</td></tr>
<tr><td style="padding:8px 32px 4px">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};border-radius:10px">
    <tr><td style="padding:16px 20px">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${BRAND.gray};text-transform:uppercase;letter-spacing:.6px">Hunter payment</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${row('House', escape(params.listingTitle))}
        ${row('Location', escape(params.listingLocation || '—'))}
        ${row('Hunter', escape(params.hunterName || '—'))}
        ${row('Hunter phone', hunterPhone)}
        ${row('Hunter email', escape(params.hunterEmail || '—'))}
        ${row('Amount paid', `${amountText} <span style="color:${BRAND.gray};font-weight:400">(${escape(params.paymentMethod || 'payment')})</span>`)}
        ${row('M-Pesa receipt', escape(params.receipt || '—'))}
        ${row('Booking ref', `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escape(params.bookingId.slice(0, 8).toUpperCase())}</span>`)}
        ${params.rating ? row('Hunter rating', `${params.rating}/5 ${'★'.repeat(Math.max(0, Math.min(5, params.rating)))}`) : ''}
      </table>
    </td></tr>
  </table>
</td></tr>
${params.reviewComment ? `<tr><td style="padding:12px 32px 4px">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px">
    <tr><td style="padding:14px 18px">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#B45309;text-transform:uppercase;letter-spacing:.6px">Hunter review</p>
      <p style="margin:0;font-size:13px;color:#78350F;line-height:1.55">&ldquo;${escape(params.reviewComment)}&rdquo;</p>
    </td></tr>
  </table>
</td></tr>` : ''}
<tr><td style="padding:12px 32px 4px">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px">
    <tr><td style="padding:16px 20px">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#047857;text-transform:uppercase;letter-spacing:.6px">Lister payout · 50% share</p>
      <p style="margin:0 0 10px;font-size:24px;font-weight:700;color:#065F46">${payoutText}</p>
      <p style="margin:0 0 6px;font-size:12px;color:#065F46">${escape(params.listerName || 'Lister')} · M-Pesa number:</p>
      <p style="margin:0 0 10px">${listerNumber}</p>
      <p style="margin:0;font-size:12px;color:#065F46">
        Copy this number from the Treasury panel (the panel has a one-tap copy button), send the payout in M-Pesa,
        then paste the confirmation SMS there. The transaction code and amount are parsed and saved to the audit trail.
      </p>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:16px 32px 8px">
  <table cellpadding="0" cellspacing="0">
    <tr><td style="background:${BRAND.blue};border-radius:8px">
      <a href="${treasuryUrl}" style="display:inline-block;padding:12px 26px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px">Open payout panel</a>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 32px 24px">
  <p style="margin:16px 0 0;font-size:12px;color:${BRAND.gray}">Booking ${escape(params.bookingId)} · AseHanta Treasury</p>
</td></tr>`

  await transporter.sendMail({
    from: `"${process.env.BREVO_FROM_NAME}" <${process.env.BREVO_FROM_EMAIL}>`,
    to: admins.join(','),
    subject: `[AseHanta] Payout ready — ${amountText} for ${params.listingTitle}`,
    html: baseHtml(body),
  })
}

