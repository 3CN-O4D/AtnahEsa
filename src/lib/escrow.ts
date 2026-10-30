import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { notifyUser, notifyAdmins } from '@/lib/notify'
import crypto from 'crypto'

const ESCROW_HOURS = 24
const LISTER_SHARE = 0.5
const PLATFORM_SHARE = 0.5

export enum EscrowAction {
  AUTO_RELEASE = 'auto_release',
  HUNTER_CONFIRM = 'hunter_confirm',
  HUNTER_DISPLEASED = 'hunter_displeased',
  FAKE_NO_SHOW = 'fake_no_show',
  ADMIN_OVERRIDE = 'admin_override',
}

export enum RefundReason {
  FAKE_LISTING = 'fake_listing',
  NO_SHOW = 'no_show',
  VIEWED_CHANGED_MIND = 'viewed_changed_mind',
  ADMIN_REFUND = 'admin_refund',
}

export async function createEscrowHold(params: {
  bookingId: string
  hunterId: string
  listerId: string
  amount: number
  listingTitle: string
}) {
  const admin = createAdminClient()
  const heldUntil = new Date(Date.now() + 24 * 60 * 60 * 1000)

  const auditData = {
    bookingId: params.bookingId,
    amount: params.amount,
    hunterId: params.hunterId,
    listerId: params.listerId,
    heldUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  }
  const secret = process.env.ESCROW_AUDIT_SECRET || 'asehanta-escrow-secret-dev'
  const auditHash = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(auditData))
    .digest('hex')

  const { data, error } = await createAdminClient()
    .from('escrow_holds')
    .insert({
      booking_id: params.bookingId,
      hunter_id: params.hunterId,
      lister_id: params.listerId,
      amount: params.amount,
      status: 'held',
      held_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      audit_hash: auditHash,
      audit_data: auditData,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function releaseToLister(params: {
  escrowId: string
  action: string
  actorId: string
  reason?: string
}) {
  const admin = createAdminClient()

  const { data: escrow, error: fetchError } = await admin
    .from('escrow_holds')
    .select('*')
    .eq('id', params.escrowId)
    .single()

  if (fetchError || !escrow) throw new Error('Escrow not found')
  if (escrow.status !== 'held') throw new Error('Escrow not in held state')

  // --- H1: ENFORCE 24-HOUR VIEW WINDOW ---
  // Hunter cannot release funds before 24 hours have elapsed since hold creation
  const heldUntil = new Date(escrow.held_until).getTime()
  const now = Date.now()
  if (now < heldUntil) {
    const hoursRemaining = Math.ceil((heldUntil - now) / (1000 * 60 * 60))
    throw new Error(`Escrow not yet releasable. ${hoursRemaining} hour(s) remaining in view window.`)
  }

  const expectedHash = crypto
    .createHmac('sha256', process.env.ESCROW_AUDIT_SECRET || 'asehanta-escrow-secret-dev')
    .update(JSON.stringify(escrow.audit_data))
    .digest('hex')

  if (escrow.audit_hash && process.env.ESCROW_AUDIT_SECRET) {
    if (escrow.audit_hash !== expectedHash) {
      throw new Error('Escrow audit verification failed - tampering detected')
    }
  } else if (escrow.audit_hash !== expectedHash && escrow.audit_hash) {
    // skip in dev if no secret
  } else if (escrow.audit_hash && !expectedHash) {
    // no-op
  }

  const listerAmount = Math.round(escrow.amount * 0.5)
  const platformAmount = escrow.amount - listerAmount
  const releasedAt = new Date().toISOString()

  const { error } = await admin
    .from('escrow_holds')
    .update({
      status: 'released',
      action: params.action,
      released_at: releasedAt,
    })
    .eq('id', params.escrowId)

  if (error) throw error

  await admin.from('payouts').insert({
    escrow_id: params.escrowId,
    lister_id: escrow.lister_id,
    amount: Math.round(escrow.amount * 0.5),
    status: 'pending',
    initiated_at: now,
  })

  // Fetch emails for 3-way notification
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .in('id', [escrow.lister_id, escrow.hunter_id])
  const emailById: Record<string, { email: string; full_name: string }> = {}
  for (const p of (profiles ?? [])) {
    emailById[p.id] = { email: p.email || '', full_name: p.full_name || '' }
  }

  await Promise.all([
    createNotification({
      userId: escrow.lister_id,
      category: 'transaction',
      title: 'Funds Released',
      body: `KES ${Math.round(escrow.amount * 0.5).toLocaleString()} released to your account.`,
      link: '/my-bookings?tab=payouts',
    }),
    createNotification({
      userId: escrow.hunter_id,
      category: 'transaction',
      title: 'Booking Confirmed',
      body: `Your payment has been processed. The lister has been paid.`,
      link: '/my-bookings?tab=payments',
    }),
  ])

  // --- 3-WAY EMAIL NOTIFICATIONS ---
  const listerEmail = emailById[escrow.lister_id]?.email
  const hunterEmail = emailById[escrow.hunter_id]?.email
  const listerName = emailById[escrow.lister_id]?.full_name || 'Lister'
  const hunterName = emailById[escrow.hunter_id]?.full_name || 'Hunter'

  if (listerEmail) {
    await notifyUser(listerEmail, 'Funds Released to You', 'Payment Released', {
      Listing: escrow.listing_id || escrow.booking_id,
      Amount: `KES ${Math.round(escrow.amount * 0.5).toLocaleString()}`,
      Recipient: listerName,
      Status: 'Paid to Lister (50%)',
      Date: new Date().toLocaleString(),
    })
  }
  if (hunterEmail) {
    await notifyUser(hunterEmail, 'Booking Confirmed — Lister Paid', 'Payment Confirmed', {
      Listing: escrow.listing_id || escrow.booking_id,
      Amount: `KES ${escrow.amount.toLocaleString()}`,
      Hunter: hunterName,
      Lister: listerName,
      Status: 'Funds released to lister',
      Date: new Date().toLocaleString(),
    })
  }
  await notifyAdmins('Lister Paid — Escrow Released', 'Escrow Release', {
    Listing: escrow.listing_id || escrow.booking_id,
    Amount: `KES ${escrow.amount.toLocaleString()}`,
    ListerShare: `KES ${Math.round(escrow.amount * 0.5).toLocaleString()} (50%)`,
    PlatformShare: `KES ${Math.round(escrow.amount * 0.5).toLocaleString()} (50%)`,
    Lister: `${listerName} (${listerEmail || 'N/A'})`,
    Hunter: `${hunterName} (${hunterEmail || 'N/A'})`,
    Status: 'Released to lister',
    Date: new Date().toLocaleString(),
  })

  return { listerAmount: Math.round(escrow.amount * 0.5), platformAmount: Math.round(escrow.amount * 0.5) }
}

export async function refundHunter(params: {
  escrowId: string
  reason: string
  actorId: string
  customReason?: string
}) {
  const admin = createAdminClient()

  const { data: escrow, error: fetchError } = await admin
    .from('escrow_holds')
    .select('*')
    .eq('id', params.escrowId)
    .single()

  if (fetchError || !escrow) throw new Error('Escrow not found')
  if (escrow.status !== 'held') throw new Error('Escrow not in held state')

  const expectedHash = crypto
    .createHmac('sha256', process.env.ESCROW_AUDIT_SECRET!)
    .update(JSON.stringify(escrow.audit_data))
    .digest('hex')

  if (escrow.audit_hash !== expectedHash) {
    throw new Error('Escrow audit verification failed')
  }

  const isFullRefund = ['fake_listing', 'no_show'].includes(params.reason)
  const refundPercent = isFullRefund ? 1.0 : 0.85
  const refundAmount = Math.round(escrow.amount * (isFullRefund ? 1.0 : 0.85))
  const now = new Date().toISOString()

  const action = ['fake_listing', 'no_show'].includes(params.reason)
    ? 'fake_no_show'
    : 'hunter_displeased'

  const { error } = await admin
    .from('escrow_holds')
    .update({
      status: 'refunded',
      action: isFullRefund ? 'fake_no_show' : 'hunter_displeased',
      refunded_at: now,
      refund_reason: params.reason,
    })
    .eq('id', params.escrowId)

  if (error) throw error

  // Fetch emails for 3-way notification
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .in('id', [escrow.lister_id, escrow.hunter_id])
  const emailById: Record<string, { email: string; full_name: string }> = {}
  for (const p of (profiles ?? [])) {
    emailById[p.id] = { email: p.email || '', full_name: p.full_name || '' }
  }

  const listerEmail = emailById[escrow.lister_id]?.email
  const hunterEmail = emailById[escrow.hunter_id]?.email
  const listerName = emailById[escrow.lister_id]?.full_name || 'Lister'
  const hunterName = emailById[escrow.hunter_id]?.full_name || 'Hunter'
  const refundDisplayPercent = isFullRefund ? 100 : 85
  const refundAmt = Math.round(escrow.amount * (isFullRefund ? 1.0 : 0.85))

  await admin.from('refunds').insert({
    escrow_id: params.escrowId,
    hunter_id: escrow.hunter_id,
    amount: refundAmt,
    reason: params.reason,
    custom_reason: params.customReason,
    processed_at: new Date().toISOString(),
  })

  await createNotification({
    userId: escrow.hunter_id,
    category: 'transaction',
    title: 'Refund Processed',
    body: `Refund processed. Processed within 24 hours.`,
    link: '/my-bookings?tab=refunds',
  })

  // --- M2: NOTIFY LISTER ON REFUND ---
  await createNotification({
    userId: escrow.lister_id,
    category: 'transaction',
    title: 'Booking Refunded',
    body: `A booking for "${escrow.listing_id}" was refunded (${params.reason}). You will not receive payment for this booking.`,
    link: '/my-bookings?tab=payments',
  })

  // --- 3-WAY EMAIL NOTIFICATIONS ON REFUND ---
  if (hunterEmail) {
    await notifyUser(hunterEmail, `Refund Processed — ${refundPercent}%`, 'Refund Processed', {
      Listing: escrow.listing_id || escrow.booking_id,
      Amount: `KES ${refundAmt.toLocaleString()}`,
      Percentage: `${refundDisplayPercent}%`,
      Reason: params.customReason || params.reason,
      Hunter: hunterName,
      Status: `${refundDisplayPercent}% refund initiated`,
      Date: new Date().toLocaleString(),
    })
  }
  if (listerEmail) {
    await notifyUser(listerEmail, 'Booking Refunded — No Payment', 'Refund Notice', {
      Listing: escrow.listing_id || escrow.booking_id,
      Amount: `KES ${escrow.amount.toLocaleString()}`,
      Lister: listerName,
      Reason: params.customReason || params.reason,
      Status: 'No payment — booking refunded',
      Date: new Date().toLocaleString(),
    })
  }
  await notifyAdmins('Booking Refunded', 'Escrow Refund', {
    Listing: escrow.listing_id || escrow.booking_id,
    Amount: `KES ${escrow.amount.toLocaleString()}`,
    RefundAmount: `KES ${refundAmt.toLocaleString()}`,
    Percentage: `${refundDisplayPercent}%`,
    Reason: params.customReason || params.reason,
    Hunter: `${hunterName} (${hunterEmail || 'N/A'})`,
    Lister: `${listerName} (${listerEmail || 'N/A'})`,
    Status: 'Refunded to hunter',
    Date: new Date().toLocaleString(),
  })

  return Math.round(escrow.amount * (isFullRefund ? 1.0 : 0.85))
}

/**
 * Escrow holds are never released automatically: an admin must send the
 * M-Pesa payout and record the payout SMS first. This only reports expiry so
 * the cron can escalate it.
 */
export async function processAutoReleases(): Promise<number> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: expiredHolds } = await admin
    .from('escrow_holds')
    .select('id')
    .eq('status', 'held')
    .lt('held_until', cutoff)

  if (!expiredHolds || expiredHolds.length === 0) return 0

  await notifyAdmins(
    'Escrow Expired — Payout Required',
    `${expiredHolds.length} Escrow Hold(s) Expired`,
    {
      Count: String(expiredHolds.length),
      Message:
        'No money was moved automatically. Review each hold, send the payout by M-Pesa, then record the payout SMS in Treasury.',
      Link: 'https://www.asehanta.com/admin/treasury',
    }
  )

  return expiredHolds.length
}
