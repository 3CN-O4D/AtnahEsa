import PDFDocument from 'pdfkit'

/**
 * Branded PDF receipt for a house-booking payment.
 *
 * The receipt is deliberately generated from data we already store on the
 * booking, so the amount on the PDF can never drift from the amount the
 * hunter was actually charged.
 */

export type ReceiptInput = {
  bookingId: string
  receiptNumber: string
  listingTitle: string
  listingLocation: string
  amount: number
  payerName: string
  payerEmail: string
  payerPhone: string
  paidAt: string
  heldUntil: string | null
  paymentMethod: string
  listerName?: string
}

const BLUE = '#2563EB'
const DARK = '#0F172A'
const GRAY = '#64748B'
const LIGHT = '#F1F5F9'
const BORDER = '#E2E8F0'
const GREEN = '#059669'

function money(value: number): string {
  return `KES ${Math.round(value).toLocaleString('en-KE')}`
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export async function generateReceiptPdf(input: ReceiptInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0 })
      const chunks: Buffer[] = []

      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const pageWidth = doc.page.width
      const margin = 48
      const contentWidth = pageWidth - margin * 2

      // ---- Header band -------------------------------------------------
      doc.rect(0, 0, pageWidth, 132).fill(BLUE)
      doc
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(26)
        .text('AseHanta', margin, 40)
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#DBEAFE')
        .text('Find your home in Kenya  ·  asehanta.com', margin, 72)
      doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor('#FFFFFF')
        .text('PAYMENT RECEIPT', margin, 92, { width: contentWidth, align: 'right' })

      // ---- Receipt meta -------------------------------------------------
      let y = 168
      doc.fillColor(GRAY).font('Helvetica').fontSize(9).text('RECEIPT NUMBER', margin, y)
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text(input.receiptNumber || input.bookingId.slice(0, 12).toUpperCase(), margin, y + 14)

      doc.fillColor(GRAY).font('Helvetica').fontSize(9).text('DATE PAID', margin + 250, y)
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text(formatDate(input.paidAt), margin + 250, y + 14, { width: contentWidth - 250 })

      y += 58

      // ---- Amount panel -------------------------------------------------
      doc.roundedRect(margin, y, contentWidth, 92, 12).fill(LIGHT)
      doc.fillColor(GRAY).font('Helvetica').fontSize(10).text('AMOUNT PAID', margin + 20, y + 18)
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(28).text(money(input.amount), margin + 20, y + 34)

      doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(10).text('HELD IN ESCROW', margin + 20, y + 70)
      doc
        .fillColor(GRAY)
        .font('Helvetica')
        .fontSize(9)
        .text(
          input.heldUntil ? `Release review opens ${formatDate(input.heldUntil)}` : 'Escrow review pending',
          margin + 130,
          y + 70,
          { width: contentWidth - 150 }
        )

      y += 122

      // ---- Details table ------------------------------------------------
      const rows: Array<[string, string]> = [
        ['Property', input.listingTitle || 'House listing'],
        ['Location', input.listingLocation || '—'],
        ['Payer', input.payerName || '—'],
        ['Email', input.payerEmail || '—'],
        ['Phone', input.payerPhone || '—'],
        ['Payment method', input.paymentMethod === 'paywave' ? 'PayWave / M-Pesa' : input.paymentMethod || 'M-Pesa'],
        ['M-Pesa receipt', input.receiptNumber || '—'],
        ['Lister', input.listerName || 'AseHanta verified lister'],
      ]

      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13).text('Payment details', margin, y)
      y += 24
      doc.moveTo(margin, y).lineTo(margin + contentWidth, y).strokeColor(BORDER).lineWidth(1).stroke()
      y += 8

      for (const [label, value] of rows) {
        doc.fillColor(GRAY).font('Helvetica').fontSize(9.5).text(label, margin, y)
        doc
          .fillColor(DARK)
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .text(value, margin + 150, y, { width: contentWidth - 150, align: 'right' })
        y += 26
        doc.moveTo(margin, y - 8).lineTo(margin + contentWidth, y - 8).strokeColor(BORDER).lineWidth(0.5).stroke()
      }

      // ---- Escrow rules -------------------------------------------------
      y += 22
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13).text('Your escrow cover', margin, y)
      y += 22

      const rules = [
        `Your ${money(input.amount)} is held by AseHanta, not paid to the lister yet.`,
        `You have 24 hours from payment to view the house and confirm you are happy.`,
        'Happy with the house? Confirm in My Bookings and we release the lister\u2019s share.',
        'Changed your mind after viewing? You get 85% back and the platform keeps 15%.',
        'Fake listing, wrong house or no show? Report it and you get 100% back.',
        'Keep this receipt. It is proof of payment and of the escrow terms above.',
      ]

      for (const rule of rules) {
        doc.circle(margin + 3, y + 5, 2.2).fill(BLUE)
        doc
          .fillColor('#334155')
          .font('Helvetica')
          .fontSize(10)
          .text(rule, margin + 16, y, { width: contentWidth - 16, lineGap: 2 })
        y += doc.heightOfString(rule, { width: contentWidth - 16 }) + 9
      }

      // ---- Footer -------------------------------------------------------
      const footerY = doc.page.height - 92
      doc.moveTo(margin, footerY).lineTo(margin + contentWidth, footerY).strokeColor(BORDER).lineWidth(1).stroke()
      doc
        .fillColor(GRAY)
        .font('Helvetica')
        .fontSize(8.5)
        .text(
          'This receipt was generated automatically by AseHanta. For help, email support@asehanta.com or use the contact page.',
          margin,
          footerY + 14,
          { width: contentWidth, align: 'center' }
        )
      doc
        .fillColor(GRAY)
        .fontSize(8.5)
        .text(`Booking reference: ${input.bookingId}`, margin, footerY + 42, { width: contentWidth, align: 'center' })

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
