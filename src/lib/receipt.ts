import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, WHATSAPP_NUMBER } from '@/lib/constants'

/**
 * Branded PDF receipt for a house-booking payment.
 *
 * The receipt is deliberately generated from data we already store on the
 * booking, so the amount on the PDF can never drift from the amount the
 * hunter was actually charged.
 *
 * Layout notes: every block measures itself before it is drawn and the page
 * number is only added at the end. The old version advanced `y` without a
 * page-break guard, so PDFKit silently created a new page for each line after
 * the A4 height was exceeded (one sentence per page). This version fits the
 * whole receipt on one page and keeps the watermark, logo and stamp on every
 * page if the description forces an overflow.
 */

export type ReceiptInput = {
  bookingId: string
  receiptNumber: string
  listingTitle: string
  listingLocation: string
  /** Short description of the house as advertised, shown on the receipt. */
  listingDescription?: string
  amount: number
  payerName: string
  payerEmail: string
  payerPhone: string
  paidAt: string
  heldUntil: string | null
  paymentMethod: string
  listerName?: string
  /** Lister's contact number as shared after payment. */
  listerPhone?: string
}

const BLUE = '#2563EB'
const DARK = '#0F172A'
const GRAY = '#64748B'
const LIGHT = '#F1F5F9'
const BORDER = '#E2E8F0'
const GREEN = '#059669'
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 44
const CONTENT_W = PAGE_W - MARGIN * 2

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

function loadLogo(): Buffer | null {
  // Read the shipped brand mark. If a deployment does not expose public/ to
  // the serverless runtime, the vector fallback below keeps the receipt
  // branded rather than failing the whole PDF.
  const candidates = [
    path.join(process.cwd(), 'public', 'images', 'asehanta-logo.jpeg'),
    path.join(process.cwd(), 'public', 'images', 'asehanta-logo.jpg'),
    path.join(process.cwd(), 'public', 'images', 'asehanta-logo.png'),
  ]
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return fs.readFileSync(candidate)
    } catch {
      // Try the next candidate.
    }
  }
  return null
}

function drawWatermark(doc: PDFKit.PDFDocument) {
  doc.save()
  doc.translate(PAGE_W / 2, PAGE_H / 2)
  doc.rotate(-32)
  doc.opacity(0.05)
  doc
    .font('Helvetica-Bold')
    .fontSize(78)
    .fillColor(DARK)
    .text('ASEHANTA', -PAGE_W / 2, -34, { width: PAGE_W, align: 'center' })
  doc.restore()
  doc.opacity(1)
}

function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, height: number) {
  const logo = loadLogo()
  if (logo) {
    doc.image(logo, x, y, { fit: [height * 1.55, height] })
    return
  }
  // Vector fallback: green rounded tile with a simple white house mark.
  const size = height
  doc.roundedRect(x, y, size, size, 8).fill(GREEN)
  doc
    .moveTo(x + size * 0.24, y + size * 0.52)
    .lineTo(x + size * 0.5, y + size * 0.28)
    .lineTo(x + size * 0.76, y + size * 0.52)
    .strokeColor('#FFFFFF')
    .lineWidth(3)
    .stroke()
  doc.rect(x + size * 0.34, y + size * 0.52, size * 0.32, size * 0.24).fill('#FFFFFF')
}

function drawHeader(doc: PDFKit.PDFDocument, input: ReceiptInput) {
  doc.rect(0, 0, PAGE_W, 98).fill('#FFFFFF')
  drawLogo(doc, MARGIN, 22, 46)

  doc
    .fillColor(DARK)
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('AseHanta', MARGIN + 92, 26)
  doc
    .fillColor(GRAY)
    .font('Helvetica')
    .fontSize(8.5)
    .text('Find your home in Kenya  ·  asehanta.com', MARGIN + 92, 52, { width: 250 })

  doc
    .fillColor(BLUE)
    .font('Helvetica-Bold')
    .fontSize(15)
    .text('PAYMENT RECEIPT', 0, 30, { width: PAGE_W - MARGIN, align: 'right' })
  doc
    .fillColor(GRAY)
    .font('Helvetica')
    .fontSize(8)
    .text(`Issued ${formatDate(input.paidAt)}`, 0, 52, { width: PAGE_W - MARGIN, align: 'right' })

  doc.rect(0, 96, PAGE_W, 3).fill(BLUE)
}

function drawMeta(doc: PDFKit.PDFDocument, input: ReceiptInput, y: number): number {
  doc.roundedRect(MARGIN, y, CONTENT_W, 44, 8).fill(LIGHT)

  const colW = CONTENT_W / 3
  const cols: Array<[string, string]> = [
    ['RECEIPT NUMBER', input.receiptNumber || input.bookingId.slice(0, 12).toUpperCase()],
    ['DATE PAID', formatDate(input.paidAt)],
    ['BOOKING REFERENCE', input.bookingId.slice(0, 8).toUpperCase()],
  ]

  cols.forEach(([label, value], index) => {
    const x = MARGIN + 16 + index * colW
    doc.fillColor(GRAY).font('Helvetica').fontSize(7.5).text(label, x, y + 9, { width: colW - 20 })
    doc
      .fillColor(DARK)
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text(value, x, y + 22, { width: colW - 20, ellipsis: true })
  })

  return y + 58
}

function drawAmount(doc: PDFKit.PDFDocument, input: ReceiptInput, y: number): number {
  doc.roundedRect(MARGIN, y, CONTENT_W, 82, 10).fill('#EFF6FF')
  doc.roundedRect(MARGIN, y, 6, 82, 3).fill(BLUE)

  doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8.5).text('TOTAL PAID', MARGIN + 24, y + 16)
  doc
    .fillColor(DARK)
    .font('Helvetica-Bold')
    .fontSize(28)
    .text(money(input.amount), MARGIN + 24, y + 30, { width: CONTENT_W / 2 })

  doc
    .fillColor(GREEN)
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .text('HELD IN ESCROW', MARGIN + CONTENT_W / 2 + 10, y + 20, {
      width: CONTENT_W / 2 - 34,
      align: 'right',
    })
  doc
    .fillColor(GRAY)
    .font('Helvetica')
    .fontSize(8.5)
    .text(
      input.heldUntil ? `Review opens ${formatDate(input.heldUntil)}` : 'Review pending',
      MARGIN + CONTENT_W / 2 + 10,
      y + 34,
      { width: CONTENT_W / 2 - 34, align: 'right' }
    )
  doc
    .fillColor(GRAY)
    .font('Helvetica')
    .fontSize(8)
    .text('Payment via PayWave / M-Pesa', MARGIN + CONTENT_W / 2 + 10, y + 52, {
      width: CONTENT_W / 2 - 34,
      align: 'right',
    })

  return y + 96
}

function drawDetailRows(doc: PDFKit.PDFDocument, input: ReceiptInput, y: number): number {
  const rows: Array<[string, string]> = [
    ['Property', input.listingTitle || 'House listing'],
    ['Location', input.listingLocation || '—'],
    ['Payer', input.payerName || '—'],
    ['Phone', input.payerPhone || '—'],
    ['Email', input.payerEmail || '—'],
    ['M-Pesa receipt', input.receiptNumber || '—'],
    ['Lister', input.listerName || 'AseHanta verified lister'],
    ['Lister phone', input.listerPhone || 'Revealed in My Bookings'],
  ]

  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12).text('Payment details', MARGIN, y)
  y += 20
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).strokeColor(BORDER).lineWidth(1).stroke()
  y += 6

  for (const [label, value] of rows) {
    doc.fillColor(GRAY).font('Helvetica').fontSize(9).text(label, MARGIN, y)
    doc
      .fillColor(DARK)
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text(value, MARGIN + 150, y - 0.5, { width: CONTENT_W - 150, align: 'right', ellipsis: true, lineBreak: false })
    y += 19
    doc.moveTo(MARGIN, y - 5).lineTo(MARGIN + CONTENT_W, y - 5).strokeColor(BORDER).lineWidth(0.5).stroke()
  }

  return y + 8
}

function drawDescription(doc: PDFKit.PDFDocument, input: ReceiptInput, y: number): number {
  const text = (input.listingDescription || '').trim()
  if (!text) return y

  const snippet = text.length > 380 ? `${text.slice(0, 377).trimEnd()}…` : text

  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text('About this house', MARGIN, y)
  y += 17
  doc.font('Helvetica').fontSize(9.5)
  const height = doc.heightOfString(snippet, { width: CONTENT_W, lineGap: 1.5 })
  doc.fillColor('#334155').font('Helvetica').fontSize(9.5).text(snippet, MARGIN, y, {
    width: CONTENT_W,
    lineGap: 1.5,
  })
  return y + height + 12
}

function drawEscrow(doc: PDFKit.PDFDocument, input: ReceiptInput, y: number): number {
  const rules = [
    `Your ${money(input.amount)} is held by AseHanta, not paid to the lister yet.`,
    'You have 24 hours to view the house and confirm you are happy.',
    'Happy with the house? Confirm in My Bookings and we release the lister.',
    'Changed your mind after viewing? You get 85% back.',
    'Fake listing, wrong house or no show? You get 100% back.',
    'Keep this receipt: it is proof of payment and of these terms.',
  ]

  const leftW = CONTENT_W - 150
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text('Your escrow cover', MARGIN, y)
  y += 16

  for (const rule of rules) {
    doc.circle(MARGIN + 3, y + 4.5, 2).fill(BLUE)
    const height = doc.heightOfString(rule, { width: leftW - 16 })
    doc
      .fillColor('#334155')
      .font('Helvetica')
      .fontSize(9)
      .text(rule, MARGIN + 14, y, { width: leftW - 16, lineGap: 1 })
    y += height + 5
  }

  return y
}

function drawStamp(doc: PDFKit.PDFDocument, input: ReceiptInput, top: number) {
  const cx = MARGIN + CONTENT_W - 58
  const cy = top + 52
  const stampDate = formatDate(input.paidAt).slice(0, 11)

  doc.save()
  doc.translate(cx, cy)
  doc.rotate(-11)
  doc.opacity(0.9)
  doc.circle(0, 0, 48).lineWidth(2.4).strokeColor(GREEN).stroke()
  doc.circle(0, 0, 39).lineWidth(0.9).strokeColor(GREEN).stroke()

  doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(9).text('ASEHANTA', -40, -24, { width: 80, align: 'center' })
  doc.font('Helvetica').fontSize(6.4).text('OFFICIAL RECEIPT', -40, -12, { width: 80, align: 'center' })
  doc.font('Helvetica-Bold').fontSize(10).text('VERIFIED', -40, -1, { width: 80, align: 'center' })
  doc.font('Helvetica').fontSize(6.4).text(stampDate, -40, 13, { width: 80, align: 'center' })
  doc.font('Helvetica-Bold').fontSize(6.4).text('PAID', -40, 23, { width: 80, align: 'center' })
  doc.restore()

  doc.opacity(1)
  doc
    .fillColor(GRAY)
    .font('Helvetica')
    .fontSize(7)
    .text('Authorised by AseHanta', MARGIN + CONTENT_W - 140, top + 106, { width: 140, align: 'center' })
}

function drawSupport(doc: PDFKit.PDFDocument, y: number): number {
  doc.roundedRect(MARGIN, y, CONTENT_W, 66, 8).fill('#FFFBEB').strokeColor('#FDE68A').lineWidth(1).stroke()
  doc
    .fillColor('#B45309')
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('If something goes wrong', MARGIN + 14, y + 9)
  doc
    .fillColor('#78350F')
    .font('Helvetica')
    .fontSize(8.2)
    .text(
      'No show, the house is not as advertised, or the lister is unreachable? Do not pay anyone again. ' +
        'Report it in My Bookings within 24 hours for a 100% refund.',
      MARGIN + 14,
      y + 22,
      { width: CONTENT_W - 28, lineGap: 1 }
    )
  doc
    .fillColor('#B45309')
    .font('Helvetica-Bold')
    .fontSize(8.2)
    .text(
      `Support: ${CONTACT_PHONE_DISPLAY}  ·  ${CONTACT_EMAIL}  ·  wa.me/${WHATSAPP_NUMBER}`,
      MARGIN + 14,
      y + 46,
      { width: CONTENT_W - 28 }
    )

  return y + 78
}

function drawFooters(doc: PDFKit.PDFDocument, input: ReceiptInput) {
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i)

    const footerY = PAGE_H - 46
    doc.moveTo(MARGIN, footerY).lineTo(MARGIN + CONTENT_W, footerY).strokeColor(BORDER).lineWidth(1).stroke()
    doc
      .fillColor(GRAY)
      .font('Helvetica')
      .fontSize(7)
      .text(
        `Generated automatically by AseHanta · ${CONTACT_EMAIL} · ${CONTACT_PHONE_DISPLAY}`,
        MARGIN,
        footerY + 8,
        { width: CONTENT_W - 60 }
      )
    doc
      .fillColor(GRAY)
      .fontSize(7)
      .text(`Page ${i + 1} of ${range.count}`, MARGIN, footerY + 8, { width: CONTENT_W, align: 'right' })
    doc
      .fillColor('#94A3B8')
      .fontSize(6.6)
      .text(`Booking reference: ${input.bookingId}`, MARGIN, footerY + 20, {
        width: CONTENT_W,
        align: 'center',
      })
  }
}

export async function generateReceiptPdf(input: ReceiptInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        bufferPages: true,
        info: {
          Title: `AseHanta receipt ${input.receiptNumber || input.bookingId.slice(0, 8)}`,
          Author: 'AseHanta',
          Subject: 'House booking payment receipt',
          Creator: 'AseHanta',
        },
      })
      const chunks: Buffer[] = []

      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // Watermark sits behind everything, including any overflow page.
      drawWatermark(doc)
      doc.on('pageAdded', () => {
        drawWatermark(doc)
      })

      drawHeader(doc, input)

      let y = drawMeta(doc, input, 114)
      y = drawAmount(doc, input, y)
      y = drawDetailRows(doc, input, y)
      y = drawDescription(doc, input, y)

      // Keep the stamp inside the page: the escrow block ends well above the
      // footer, so reserve 112pt for the stamp + signature line.
      const escrowTop = y + 4
      const escrowBottom = drawEscrow(doc, input, escrowTop)
      drawStamp(doc, input, escrowTop)

      y = Math.max(escrowBottom, escrowTop + 112) + 12
      y = drawSupport(doc, y)

      if (y > PAGE_H - 70) {
        // Extremely long descriptions can push the support box down. Move it
        // to a clean page instead of letting PDFKit add one line per page.
        doc.addPage()
        y = 84
        drawSupport(doc, y)
      }

      drawFooters(doc, input)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
