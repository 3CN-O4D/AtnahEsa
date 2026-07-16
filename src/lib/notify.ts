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

function html(title: string, lines: [string, string][]) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #2563EB; margin-bottom: 20px;">${title}</h2>
      <table style="width: 100%; border-collapse: collapse;">
        ${lines.map(([label, value]) => `
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; color: #6B7280; font-size: 13px; white-space: nowrap; vertical-align: top;">${label}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; color: #111827; font-size: 13px;">${value}</td>
          </tr>
        `).join('')}
      </table>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
      <p style="color: #9CA3AF; font-size: 12px;">AseHanta — Find your home in Kenya</p>
    </div>
  `
}

export async function notifyAdmins(subject: string, title: string, fields: Record<string, string>) {
  const lines = Object.entries(fields) as [string, string][]
  const body = html(title, lines)

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
