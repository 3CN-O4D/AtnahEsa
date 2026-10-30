import type { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { notifyUser, notifyAdmins } from '@/lib/notify'
import { sendPaymentReceiptEmail } from '@/lib/email'
import { generateReceiptPdf } from '@/lib/receipt'
import { moveMediaToTaken } from '@/lib/move-media'
import {
  initiateStkPush,
  verifyTransaction,
  isValidMpesaMessage,
  extractTransactionCode,
  extractAmountFromMessage,
  normalizeMsisdn,
} from '@/lib/paywave'
import { OWNER_SHARE, VIEW_WINDOW_HOURS } from '@/lib/constants'

type Admin = ReturnType<typeof createAdminClient>

export class PaymentError extends Error {
  code: string
  status: number
  details?: Record<string, unknown>

  constructor(code: string, message: string, status = 400, details?: Record<string, unknown>) {
    super(message)
    this.name = 'PaymentError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export type HouseBookingRow = {
  id: string
  listing_id: string
  listing_title: string | null
  listing_location: string | null
  listing_price: number
  name: string | null
  phone: string | null
  area: string | null
  id_number: string | null
  mpesa_message: string | null
  status: string
  user_id: string | null
  release_status: string
  held_until: string | null
  rating: number | null
  displeased_reason: string | null
  confirmed_at: string | null
  paid_at: string | null
  refunded_at: string | null
  payment_method: string | null
  email: string | null
  mpesa_receipt: string | null
  created_at: string
}

export type TransactionRow = {
  id: string
  booking_id: string | null
  user_id: string | null
  listing_id: string | null
  phone: string | null
  amount: number
  mpesa_receipt: string | null
  mpesa_message: string | null
  checkout_request_id: string | null
  originator_conversation_id: string | null
  merchant_request_id: string | null
  result_code: number | null
  result_desc: string | null
  raw_callback: Record<string, unknown> | null
  status: string
  payment_method: string | null
  created_at: string
}

function isConfirmed(booking: HouseBookingRow): boolean {
  return booking.status === 'confirmed' || ['held', 'paid', 'released'].includes(booking.release_status)
}

function holdUntil(): string {
  return new Date(Date.now() + VIEW_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
}

function mergeRaw(existing: unknown, next: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(existing && typeof existing === 'object' ? (existing as Record<string, unknown>) : {}),
    ...next,
  }
}

async function findTransaction(
  admin: Admin,
  bookingId: string,
  transactionRequestId?: string | null
): Promise<TransactionRow | null> {
  if (transactionRequestId) {
    const { data } = await admin
      .from('transactions')
      .select('*')
      .eq('originator_conversation_id', transactionRequestId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) return data as TransactionRow
  }

  const { data } = await admin
    .from('transactions')
    .select('*')
    .filter('raw_callback->>house_booking_id', 'eq', bookingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as TransactionRow | null) ?? null
}

async function getBookingContext(admin: Admin, booking: HouseBookingRow) {
  const { data: listing } = await admin
    .from('listings')
    .select('id, title, location, uploader_id, price')
    .eq('id', booking.listing_id)
    .maybeSingle()

  const listerId: string | null = listing?.uploader_id ?? null

  const profileIds = [booking.user_id, listerId].filter((id): id is string => Boolean(id))
  const { data: profiles } = profileIds.length
    ? await admin.from('profiles').select('id, email, full_name, phone').in('id', profileIds)
    : { data: [] as Array<{ id: string; email: string | null; full_name: string | null; phone: string | null }> }

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]))
  const hunterProfile = booking.user_id ? byId.get(booking.user_id) : undefined
  const listerProfile = listerId ? byId.get(listerId) : undefined

  return {
    listing,
    listerId,
    hunterEmail: hunterProfile?.email || booking.email || '',
    hunterName: hunterProfile?.full_name || booking.name || 'Hunter',
    listerEmail: listerProfile?.email || '',
    listerName: listerProfile?.full_name || 'Lister',
  }
}

/**
 * Mark a house booking as paid and put the exact listing price into escrow.
 *
 * Idempotent: calling it twice (webhook + status poll + manual verification)
 * only ever produces one confirmation, one receipt and one set of emails.
 */
export async function confirmHouseBookingPayment(
  admin: Admin,
  params: {
    bookingId: string
    amount: number
    receiptNumber: string
    paymentMethod?: string
    transactionRequestId?: string | null
    phone?: string | null
    source: 'paywave' | 'webhook' | 'status' | 'admin'
    raw?: Record<string, unknown>
  }
): Promise<{ booking: HouseBookingRow; alreadyProcessed: boolean; receiptEmailed: boolean }> {
  const { bookingId, amount, receiptNumber, source } = params

  const { data: existing } = await admin
    .from('house_bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle()

  if (!existing) throw new PaymentError('NOT_FOUND', 'Booking not found', 404)

  const booking = existing as HouseBookingRow

  if (isConfirmed(booking)) {
    return { booking, alreadyProcessed: true, receiptEmailed: false }
  }

  const expected = Number(booking.listing_price)
  if (!Number.isFinite(amount) || Math.round(amount) !== Math.round(expected)) {
    throw new PaymentError(
      'AMOUNT_MISMATCH',
      `Amount mismatch: received KES ${Math.round(amount)}, expected exactly KES ${expected}`,
      409,
      { received: amount, expected }
    )
  }

  if (!receiptNumber) {
    throw new PaymentError('MISSING_RECEIPT', 'A payment receipt number is required to confirm this booking', 400)
  }

  const now = new Date().toISOString()
  const heldUntil = holdUntil()

  // Guard against two concurrent confirmations: only update a booking that is
  // still pending. If no row comes back another request already confirmed it.
  const { data: updated, error: updateError } = await admin
    .from('house_bookings')
    .update({
      status: 'confirmed',
      release_status: 'held',
      held_until: heldUntil,
      mpesa_receipt: receiptNumber,
      mpesa_message: booking.mpesa_message || `Payment confirmed (${source})`,
      payment_method: params.paymentMethod || booking.payment_method || 'paywave',
      paid_at: booking.paid_at || now,
      confirmed_at: booking.confirmed_at || now,
    })
    .eq('id', booking.id)
    .in('status', ['pending', 'contacted', 'cancelled'])
    .select('*')
    .maybeSingle()

  if (updateError) {
    throw new PaymentError('DB_ERROR', updateError.message, 500)
  }

  if (!updated) {
    const { data: current } = await admin.from('house_bookings').select('*').eq('id', booking.id).maybeSingle()
    if (current && isConfirmed(current as HouseBookingRow)) {
      return { booking: current as HouseBookingRow, alreadyProcessed: true, receiptEmailed: false }
    }
    throw new PaymentError('CONFLICT', 'Booking could not be confirmed because its status changed', 409)
  }

  const confirmed = updated as HouseBookingRow

  // The house is now taken. Media moves are queued; failures must never undo
  // a confirmed payment.
  try {
    await admin.from('listings').update({ status: 'booked' }).eq('id', booking.listing_id)
    await moveMediaToTaken(booking.listing_id)
  } catch (err) {
    console.error('Failed to mark listing as booked:', err)
  }

  const tx = await findTransaction(admin, booking.id, params.transactionRequestId)
  const rawCallback = mergeRaw(tx?.raw_callback, {
    house_booking_id: booking.id,
    confirmed_at: now,
    confirmation_source: source,
    ...(params.raw ?? {}),
  })

  if (tx) {
    const { error: txError } = await admin
      .from('transactions')
      .update({
        status: 'success',
        amount: Math.round(expected),
        mpesa_receipt: receiptNumber,
        mpesa_message: `Payment confirmed via ${source}`,
        result_code: 0,
        result_desc: 'Success',
        payment_method: params.paymentMethod || tx.payment_method || 'paywave',
        ...(params.transactionRequestId && !tx.originator_conversation_id
          ? { originator_conversation_id: params.transactionRequestId }
          : {}),
        raw_callback: rawCallback,
      })
      .eq('id', tx.id)
    if (txError) console.error('Failed to update transaction:', txError)
  } else {
    const { error: txError } = await admin.from('transactions').insert({
      booking_id: null,
      user_id: booking.user_id,
      listing_id: booking.listing_id,
      phone: params.phone || booking.phone || '',
      amount: Math.round(expected),
      mpesa_receipt: receiptNumber,
      mpesa_message: `Payment confirmed via ${source}`,
      checkout_request_id: '',
      originator_conversation_id: params.transactionRequestId || '',
      merchant_request_id: '',
      status: 'success',
      result_code: 0,
      result_desc: 'Success',
      payment_method: params.paymentMethod || 'paywave',
      raw_callback: rawCallback,
    })
    if (txError) console.error('Failed to record transaction:', txError)
  }

  const ctx = await getBookingContext(admin, confirmed)

  // In-app notifications (best effort).
  const notifyTasks: Promise<unknown>[] = []

  if (confirmed.user_id) {
    notifyTasks.push(
      createNotification({
        userId: confirmed.user_id,
        category: 'transaction',
        title: `Payment confirmed — KES ${Math.round(expected).toLocaleString()} in escrow`,
        body: `Your payment for ${confirmed.listing_title || 'your house'} is held for ${VIEW_WINDOW_HOURS} hours. Contact the lister to arrange the visit.`,
        link: '/my-bookings?tab=payments',
        data: { house_booking_id: confirmed.id, amount: expected },
      })
    )
  }

  if (ctx.listerId) {
    notifyTasks.push(
      createNotification({
        userId: ctx.listerId,
        category: 'transaction',
        title: `A hunter paid for "${confirmed.listing_title || 'your house'}"`,
        body: `KES ${Math.round(expected).toLocaleString()} is in escrow. Call ${confirmed.phone || 'the hunter'} to arrange the visit.`,
        link: '/my-bookings?tab=payments',
        data: { house_booking_id: confirmed.id, hunter_phone: confirmed.phone, amount: expected },
      })
    )
  }

  notifyTasks.push(
    createNotification({
      role: 'admin',
      category: 'transaction',
      title: `Escrow opened — ${confirmed.listing_title || 'house booking'}`,
      body: `KES ${Math.round(expected).toLocaleString()} confirmed from ${confirmed.phone || 'hunter'}. Receipt ${receiptNumber}.`,
      link: '/admin/treasury',
      data: { house_booking_id: confirmed.id, amount: expected },
    })
  )

  await Promise.allSettled(notifyTasks)

  // Emails: branded PDF receipt to the payer, details to the lister, summary
  // to admins. Email failures never roll back a confirmed payment.
  let receiptEmailed = false
  try {
    const pdf = await generateReceiptPdf({
      bookingId: confirmed.id,
      receiptNumber,
      listingTitle: confirmed.listing_title || 'House listing',
      listingLocation: confirmed.listing_location || confirmed.area || '',
      amount: expected,
      payerName: ctx.hunterName,
      payerEmail: ctx.hunterEmail,
      payerPhone: confirmed.phone || '',
      paidAt: now,
      heldUntil,
      paymentMethod: params.paymentMethod || 'paywave',
      listerName: ctx.listerName,
    })

    if (ctx.hunterEmail) {
      await sendPaymentReceiptEmail({
        to: ctx.hunterEmail,
        name: ctx.hunterName,
        listingTitle: confirmed.listing_title || 'House listing',
        amount: expected,
        receiptNumber,
        pdf,
        bookingId: confirmed.id,
      })
      receiptEmailed = true
    }
  } catch (err) {
    console.error('Failed to send payment receipt email:', err)
  }

  try {
    if (ctx.listerEmail) {
      await notifyUser(ctx.listerEmail, 'New Booking Payment Received', 'New Booking', {
        Listing: confirmed.listing_title || confirmed.listing_id,
        Amount: `KES ${Math.round(expected).toLocaleString()} (held in escrow)`,
        Hunter: `${ctx.hunterName} (${confirmed.phone || 'phone hidden'})`,
        Status: `${VIEW_WINDOW_HOURS}-hour escrow — contact the hunter to arrange the visit`,
        Receipt: receiptNumber,
        Date: new Date(now).toLocaleString(),
      })
    }
  } catch (err) {
    console.error('Failed to email lister:', err)
  }

  try {
    await notifyAdmins('Payment Confirmed — Booking Created', 'Booking Created', {
      Listing: confirmed.listing_title || confirmed.listing_id,
      Amount: `KES ${Math.round(expected).toLocaleString()}`,
      Hunter: `${ctx.hunterName} (${confirmed.phone || 'N/A'})`,
      Lister: `${ctx.listerName} (${ctx.listerEmail || 'N/A'})`,
      Receipt: receiptNumber,
      Status: `Held in ${VIEW_WINDOW_HOURS}h escrow until ${new Date(heldUntil).toLocaleString()}`,
      Source: source,
    })
  } catch (err) {
    console.error('Failed to notify admins:', err)
  }

  return { booking: confirmed, alreadyProcessed: false, receiptEmailed }
}

export type InitiateResult = {
  bookingId: string
  transactionId: string
  transactionRequestId: string | null
  customerMessage: string
  amount: number
}

/**
 * Create the booking + transaction, then send the PayWave STK push.
 * The amount always comes from the listing row, never from the client.
 */
export async function initiateHouseBookingPayment(
  admin: Admin,
  params: {
    listingId: string
    userId: string
    userName: string
    phone: string
    email: string
  }
): Promise<InitiateResult> {
  const { listingId, userId, userName, phone, email } = params

  const msisdn = normalizeMsisdn(phone)

  const { data: listing } = await admin
    .from('listings')
    .select('id, title, price, status, uploader_id, location')
    .eq('id', listingId)
    .maybeSingle()

  if (!listing) throw new PaymentError('NOT_FOUND', 'Listing not found', 404)
  if (listing.status !== 'published') throw new PaymentError('NOT_AVAILABLE', 'This house is not available for booking', 409)
  if (listing.uploader_id === userId) throw new PaymentError('OWN_LISTING', 'You cannot book your own listing', 400)

  const amount = Number(listing.price)
  if (!Number.isInteger(amount) || amount < 1) {
    throw new PaymentError('INVALID_PRICE', 'This listing has an invalid booking fee', 409)
  }

  const { data: booking, error: bookingError } = await admin
    .from('house_bookings')
    .insert({
      listing_id: listing.id,
      listing_title: listing.title,
      listing_location: listing.location || '',
      listing_price: amount,
      name: userName || email,
      phone: msisdn,
      area: listing.location || '',
      id_number: '',
      email,
      user_id: userId,
      payment_method: 'paywave',
      status: 'pending',
      release_status: 'pending',
      mpesa_message: '',
    })
    .select('*')
    .maybeSingle()

  if (bookingError || !booking) {
    throw new PaymentError('DB_ERROR', bookingError?.message || 'Could not create booking', 500)
  }

  const bookingRow = booking as HouseBookingRow

  const { data: tx, error: txError } = await admin
    .from('transactions')
    .insert({
      booking_id: null,
      user_id: userId,
      listing_id: listing.id,
      phone: msisdn,
      amount,
      mpesa_receipt: '',
      mpesa_message: 'PayWave STK push initiated',
      checkout_request_id: '',
      originator_conversation_id: '',
      merchant_request_id: '',
      status: 'pending',
      payment_method: 'paywave',
      raw_callback: { house_booking_id: bookingRow.id, listing_id: listing.id, source: 'initiate' },
    })
    .select('*')
    .maybeSingle()

  if (txError || !tx) {
    await admin.from('house_bookings').update({ status: 'cancelled' }).eq('id', bookingRow.id)
    throw new PaymentError('DB_ERROR', txError?.message || 'Could not create payment record', 500)
  }

  try {
    const stk = await initiateStkPush({
      email,
      amount,
      msisdn,
      reference: bookingRow.id,
    })

    await admin
      .from('transactions')
      .update({
        status: 'pending',
        originator_conversation_id: stk.transactionRequestID || '',
        merchant_request_id: stk.merchantRequestID || '',
        checkout_request_id: stk.checkoutRequestID || stk.transactionRequestID || '',
        raw_callback: mergeRaw(tx.raw_callback, {
          transaction_request_id: stk.transactionRequestID || null,
          merchant_request_id: stk.merchantRequestID || null,
          checkout_request_id: stk.checkoutRequestID || null,
        }),
      })
      .eq('id', tx.id)

    if (listing.uploader_id) {
      await createNotification({
        userId: listing.uploader_id,
        category: 'transaction',
        title: 'New booking payment started',
        body: `A hunter is paying KES ${amount.toLocaleString()} for "${listing.title}". We will confirm as soon as the payment lands.`,
        link: '/my-bookings?tab=payments',
        data: { house_booking_id: bookingRow.id, amount },
      }).catch(() => {})
    }

    return {
      bookingId: bookingRow.id,
      transactionId: tx.id,
      transactionRequestId: stk.transactionRequestID || null,
      customerMessage: stk.customerMessage,
      amount,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not start the M-Pesa payment'
    await admin.from('house_bookings').update({ status: 'cancelled' }).eq('id', bookingRow.id)
    await admin
      .from('transactions')
      .update({
        status: 'failed',
        result_desc: message,
        mpesa_message: `STK push failed: ${message}`,
      })
      .eq('id', tx.id)
    throw new PaymentError('STK_FAILED', message, 502)
  }
}

/**
 * The hunter pasted an M-Pesa SMS because the callback was missed.
 * This never confirms a payment by itself — admins review it.
 */
export async function submitManualPaymentReview(
  admin: Admin,
  params: { bookingId: string; userId: string; mpesaMessage: string }
): Promise<{ booking: HouseBookingRow; receipt: string; amount: number }> {
  const message = params.mpesaMessage.trim()
  if (message.length < 20) {
    throw new PaymentError('INVALID_SMS', 'Paste the full M-Pesa confirmation message', 400)
  }

  const { data: bookingData } = await admin
    .from('house_bookings')
    .select('*')
    .eq('id', params.bookingId)
    .maybeSingle()

  if (!bookingData) throw new PaymentError('NOT_FOUND', 'Booking not found', 404)
  const booking = bookingData as HouseBookingRow

  if (booking.user_id !== params.userId) {
    throw new PaymentError('FORBIDDEN', 'This booking does not belong to you', 403)
  }

  if (isConfirmed(booking)) {
    throw new PaymentError('ALREADY_CONFIRMED', 'This booking is already paid and confirmed', 409)
  }

  if (!isValidMpesaMessage(message)) {
    throw new PaymentError(
      'INVALID_SMS',
      'That does not look like an M-Pesa confirmation from AseHanta. Check the message and try again.',
      400
    )
  }

  const receipt = extractTransactionCode(message)
  if (!receipt) {
    throw new PaymentError('INVALID_SMS', 'Could not find the M-Pesa transaction code in that message', 400)
  }

  const amount = extractAmountFromMessage(message)
  if (!amount) {
    throw new PaymentError('INVALID_SMS', 'Could not find the amount in that message', 400)
  }

  const expected = Number(booking.listing_price)
  if (amount !== expected) {
    throw new PaymentError(
      'AMOUNT_MISMATCH',
      `The SMS shows KES ${amount.toLocaleString()} but this house costs exactly KES ${expected.toLocaleString()}.`,
      409,
      { received: amount, expected }
    )
  }

  const now = new Date().toISOString()
  const tx = await findTransaction(admin, booking.id)

  const { error: bookingError } = await admin
    .from('house_bookings')
    .update({ mpesa_message: message })
    .eq('id', booking.id)
  if (bookingError) throw new PaymentError('DB_ERROR', bookingError.message, 500)

  const rawCallback = mergeRaw(tx?.raw_callback, {
    house_booking_id: booking.id,
    manual_review: true,
    submitted_at: now,
    submitted_by: params.userId,
    mpesa_receipt: receipt,
    mpesa_amount: amount,
  })

  if (tx) {
    await admin
      .from('transactions')
      .update({
        status: 'verifying',
        mpesa_receipt: receipt,
        mpesa_message: message,
        raw_callback: rawCallback,
      })
      .eq('id', tx.id)
  } else {
    await admin.from('transactions').insert({
      booking_id: null,
      user_id: booking.user_id,
      listing_id: booking.listing_id,
      phone: booking.phone || '',
      amount,
      mpesa_receipt: receipt,
      mpesa_message: message,
      checkout_request_id: '',
      originator_conversation_id: '',
      merchant_request_id: '',
      status: 'verifying',
      payment_method: booking.payment_method || 'paywave',
      raw_callback: rawCallback,
    })
  }

  await Promise.allSettled([
    createNotification({
      userId: booking.user_id,
      category: 'transaction',
      title: 'Payment submitted for review',
      body: `We received your M-Pesa message (${receipt}). An admin will confirm it and open escrow shortly.`,
      link: '/my-bookings?tab=payments',
      data: { house_booking_id: booking.id },
    }),
    notifyAdmins('Manual Payment Submitted for Verification', 'Manual Payment Pending', {
      Listing: booking.listing_title || booking.listing_id,
      Amount: `KES ${amount.toLocaleString()}`,
      Phone: booking.phone || 'N/A',
      Hunter: booking.name || booking.email || 'N/A',
      Receipt: receipt,
      'M-Pesa message': message,
      'Action needed': 'Open Admin → Treasury, verify the SMS, then set escrow.',
    }),
  ])

  return { booking, receipt, amount }
}

/**
 * Admin payout to a lister. The pasted M-Pesa SMS is the source of truth:
 * the transaction code is stored and the amount must equal the lister share.
 */
export async function recordListerPayout(
  admin: Admin,
  params: { bookingId: string; mpesaMessage: string; adminId: string; percentage?: number }
): Promise<{ booking: HouseBookingRow; payoutAmount: number; receipt: string }> {
  const message = params.mpesaMessage.trim()
  if (message.length < 20) {
    throw new PaymentError('INVALID_SMS', 'Paste the full M-Pesa payout confirmation message', 400)
  }

  const { data: bookingData } = await admin
    .from('house_bookings')
    .select('*')
    .eq('id', params.bookingId)
    .maybeSingle()

  if (!bookingData) throw new PaymentError('NOT_FOUND', 'Booking not found', 404)
  const booking = bookingData as HouseBookingRow

  if (booking.release_status === 'paid') {
    throw new PaymentError('ALREADY_PAID', 'This lister has already been paid', 409)
  }
  if (booking.release_status !== 'held') {
    throw new PaymentError('NOT_HELD', 'This booking is not in escrow, so it cannot be paid out', 409)
  }

  const percentage = params.percentage ?? OWNER_SHARE
  const payoutAmount = Math.round(Number(booking.listing_price) * percentage)

  const receipt = extractTransactionCode(message)
  const amount = extractAmountFromMessage(message)

  if (!receipt) {
    throw new PaymentError('INVALID_SMS', 'Could not find the M-Pesa transaction code in that message', 400)
  }
  if (!amount) {
    throw new PaymentError('INVALID_SMS', 'Could not find the amount in that message', 400)
  }
  if (amount !== payoutAmount) {
    throw new PaymentError(
      'AMOUNT_MISMATCH',
      `The payout SMS shows KES ${amount.toLocaleString()} but the lister share is exactly KES ${payoutAmount.toLocaleString()}. Nothing was changed.`,
      409,
      { received: amount, expected: payoutAmount }
    )
  }

  const now = new Date().toISOString()

  const { data: updated, error } = await admin
    .from('house_bookings')
    .update({
      release_status: 'paid',
      paid_at: now,
      mpesa_message: message,
    })
    .eq('id', booking.id)
    .eq('release_status', 'held')
    .select('*')
    .maybeSingle()

  if (error) throw new PaymentError('DB_ERROR', error.message, 500)
  if (!updated) throw new PaymentError('CONFLICT', 'This booking changed while you were paying it. Refresh and check.', 409)

  await admin.from('transactions').insert({
    booking_id: null,
    user_id: booking.user_id,
    listing_id: booking.listing_id,
    phone: booking.phone || '',
    amount: payoutAmount,
    mpesa_receipt: receipt,
    mpesa_message: `Payout to lister: ${message}`,
    checkout_request_id: '',
    originator_conversation_id: '',
    merchant_request_id: '',
    status: 'success',
    result_code: 0,
    result_desc: 'Payout completed',
    payment_method: 'payout',
    raw_callback: {
      house_booking_id: booking.id,
      payout: true,
      payout_percentage: percentage,
      payout_amount: payoutAmount,
      mpesa_receipt: receipt,
      admin_id: params.adminId,
      recorded_at: now,
    },
  })

  const ctx = await getBookingContext(admin, booking)

  await Promise.allSettled([
    ctx.listerId
      ? createNotification({
          userId: ctx.listerId,
          category: 'transaction',
          title: `Payout sent — KES ${payoutAmount.toLocaleString()}`,
          body: `Your share for "${booking.listing_title || 'your house'}" has been paid. Receipt ${receipt}.`,
          link: '/my-bookings?tab=payments',
          data: { house_booking_id: booking.id, amount: payoutAmount },
        })
      : Promise.resolve(),
    booking.user_id
      ? createNotification({
          userId: booking.user_id,
          category: 'transaction',
          title: 'Escrow closed',
          body: `Funds for ${booking.listing_title || 'your house'} were released to the lister. Thank you for using AseHanta.`,
          link: '/my-bookings?tab=payments',
          data: { house_booking_id: booking.id },
        })
      : Promise.resolve(),
    notifyAdmins('Lister Payout Recorded', 'Payout Recorded', {
      Listing: booking.listing_title || booking.listing_id,
      'Payout amount': `KES ${payoutAmount.toLocaleString()}`,
      Receipt: receipt,
      'Admin': params.adminId,
      Date: new Date(now).toLocaleString(),
    }),
  ])

  return { booking: updated as HouseBookingRow, payoutAmount, receipt }
}

/** Fetch everything the payment page needs, with an ownership check. */
export async function getPaymentSession(
  admin: Admin,
  params: { bookingId: string; userId: string; isAdmin?: boolean }
) {
  const { data: bookingData } = await admin
    .from('house_bookings')
    .select('*')
    .eq('id', params.bookingId)
    .maybeSingle()

  if (!bookingData) throw new PaymentError('NOT_FOUND', 'Payment not found', 404)
  const booking = bookingData as HouseBookingRow

  if (!params.isAdmin && booking.user_id !== params.userId) {
    throw new PaymentError('FORBIDDEN', 'This payment does not belong to you', 403)
  }

  const tx = await findTransaction(admin, booking.id)
  const { data: listing } = await admin
    .from('listings')
    .select('id, title, location, images, phone, uploader_id')
    .eq('id', booking.listing_id)
    .maybeSingle()

  return { booking, transaction: tx, listing }
}

/**
 * Poll PayWave for the latest status and confirm exactly once when the money
 * has actually landed. Safe to call from the payment page on an interval.
 */
export async function verifyHouseBookingPayment(
  admin: Admin,
  params: { bookingId: string; userId: string; isAdmin?: boolean }
): Promise<{
  status: 'Pending' | 'Completed' | 'Failed' | 'Cancelled' | 'Unavailable'
  booking: HouseBookingRow
  transaction: TransactionRow | null
  alreadyProcessed: boolean
  amount?: number
  receipt?: string
}> {
  const session = await getPaymentSession(admin, params)
  const { booking, transaction } = session

  if (isConfirmed(booking)) {
    return {
      status: 'Completed',
      booking,
      transaction,
      alreadyProcessed: true,
      amount: Number(booking.listing_price),
      receipt: booking.mpesa_receipt || undefined,
    }
  }

  const trxId =
    transaction?.originator_conversation_id ||
    (typeof transaction?.raw_callback?.transaction_request_id === 'string'
      ? transaction.raw_callback.transaction_request_id
      : '')

  if (!trxId) {
    return { status: 'Unavailable', booking, transaction, alreadyProcessed: false }
  }

  let result
  try {
    result = await verifyTransaction(trxId)
  } catch (err) {
    console.error('PayWave status check failed:', err)
    return { status: 'Pending', booking, transaction, alreadyProcessed: false }
  }

  if (result.TransactionStatus === 'Completed') {
    const receipt = result.TransactionReceipt || ''
    if (!receipt) {
      throw new PaymentError(
        'MISSING_RECEIPT',
        'PayWave says the payment is complete but did not return a receipt number. An admin will verify it.',
        409
      )
    }

    const amount = Number.parseInt(result.TransactionAmount || '', 10)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new PaymentError(
        'MISSING_AMOUNT',
        'PayWave says the payment is complete but did not return the amount. Paste your M-Pesa SMS so an admin can verify it.',
        409
      )
    }
    const confirmed = await confirmHouseBookingPayment(admin, {
      bookingId: booking.id,
      amount,
      receiptNumber: receipt,
      transactionRequestId: trxId,
      phone: result.Msisdn || booking.phone,
      source: 'status',
      raw: { paywave_status: result },
    })

    return {
      status: 'Completed',
      booking: confirmed.booking,
      transaction,
      alreadyProcessed: confirmed.alreadyProcessed,
      amount,
      receipt,
    }
  }

  if (result.TransactionStatus === 'Failed' || result.TransactionStatus === 'Cancelled') {
    if (transaction) {
      await admin
        .from('transactions')
        .update({
          status: 'failed',
          result_code: Number(result.ResultCode) || null,
          result_desc: result.ResultDesc || result.TransactionStatus,
          mpesa_message: `PayWave: ${result.TransactionStatus} — ${result.ResultDesc || ''}`.trim(),
          raw_callback: mergeRaw(transaction.raw_callback, { paywave_status: result }),
        })
        .eq('id', transaction.id)
    }
    if (booking.status === 'pending') {
      await admin.from('house_bookings').update({ status: 'cancelled' }).eq('id', booking.id)
      booking.status = 'cancelled'
    }
  }

  return {
    status: result.TransactionStatus,
    booking,
    transaction,
    alreadyProcessed: false,
    amount: result.TransactionAmount ? Number.parseInt(result.TransactionAmount, 10) : undefined,
    receipt: result.TransactionReceipt,
  }
}

