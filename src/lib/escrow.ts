import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
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
  const auditHash = crypto
    .createHmac('sha256', process.env.ESCROW_AUDIT_SECRET!)
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

  const expectedHash = crypto
    .createHmac('sha256', process.env.ESCROW_AUDIT_SECRET!)
    .update(JSON.stringify(escrow.audit_data))
    .digest('hex')

  if (escrow.audit_hash !== expectedHash) {
    throw new Error('Escrow audit verification failed - tampering detected')
  }

  const listerAmount = Math.round(escrow.amount * 0.5)
  const platformAmount = escrow.amount - listerAmount
  const now = new Date().toISOString()

  const { error } = await admin
    .from('escrow_holds')
    .update({
      status: 'released',
      action: params.action,
      released_at: now,
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

  await admin.from('refunds').insert({
    escrow_id: params.escrowId,
    hunter_id: escrow.hunter_id,
    amount: Math.round(escrow.amount * (isFullRefund ? 1.0 : 0.85)),
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

  return Math.round(escrow.amount * (isFullRefund ? 1.0 : 0.85))
}

export async function processAutoReleases(): Promise<number> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: expiredHolds } = await admin
    .from('escrow_holds')
    .select('id')
    .eq('status', 'held')
    .lt('held_until', cutoff)

  let processed = 0
  for (const hold of expiredHolds || []) {
    try {
      await releaseToLister({
        escrowId: hold.id,
        action: 'auto_release',
        actorId: 'system',
        reason: '24-hour window elapsed - auto-released to lister',
      })
      processed++
    } catch (err) {
      console.error(`Auto-release failed:`, err)
    }
  }

  return processed
}
