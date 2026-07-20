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

export async function sendOtpEmail(email: string, otp: string, type: 'signup' | 'password_reset' | 'profile_update') {
  const subject = type === 'signup' ? 'Verify your AseHanta account' : type === 'password_reset' ? 'Reset your AseHanta password' : 'Confirm your AseHanta profile changes'
  const message = type === 'signup'
    ? `Your verification code is: <strong>${otp}</strong><br/><br/>Enter this code in the app to verify your email address.`
    : type === 'password_reset'
    ? `Your password reset code is: <strong>${otp}</strong><br/><br/>Enter this code in the app to reset your password.`
    : `Your profile update code is: <strong>${otp}</strong><br/><br/>Enter this code in the app to confirm your profile changes.`

  await transporter.sendMail({
    from: `"${process.env.BREVO_FROM_NAME}" <${process.env.BREVO_FROM_EMAIL}>`,
    to: email,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2563EB;">${subject}</h2>
        <p style="color: #374151; font-size: 15px; line-height: 1.5;">${message}</p>
        <p style="color: #9CA3AF; font-size: 13px;">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
        <p style="color: #9CA3AF; font-size: 12px;">AseHanta — Find your home in Kenya</p>
      </div>
    `,
  })
}
