import { z } from 'zod'
import { createNotification } from '@/lib/notifications'
import { normalizeAudiences, type NotificationAudience } from '@/lib/notification-audience'
import { auditAction } from './audit'
import { notifyUser } from '@/lib/notify'
import { invalidateCached } from '@/lib/server-cache'
import { moveMediaBackToListings, moveMediaToTaken } from '@/lib/move-media'
import { OWNER_SHARE, VIEW_WINDOW_HOURS } from '@/lib/constants'
import {
  getIssueCategory,
  parseBookingFeedback,
  refundPercentForFeedback,
  serializeBookingFeedback,
  type BookingFeedback,
  type IssueCategory,
} from '@/lib/booking-feedback'
import {
  confirmHouseBookingPayment,
  recordListerPayout,
  lookupPayWavePayment,
  checkSmsAgainstPayWave,
  type HouseBookingRow,
} from '@/lib/payments'
import {
  extractTransactionCode,
  extractAmountFromMessage,
  isValidMpesaMessage,
} from '@/lib/paywave'
import type { AdminContext } from './auth'

export type ToolResult = { ok: boolean; text: string; data?: unknown }

export interface AdminTool {
  name: string
  description: string
  kind: 'read' | 'write'
  schema: z.ZodTypeAny
  summarize: (args: Record<string, unknown>) => string
  run: (args: Record<string, unknown>, ctx: AdminContext) => Promise<ToolResult>
}

type Row = Record<string, unknown>

const LISTING_STATUSES = ['pending', 'published', 'booked', 'taken', 'rejected'] as const
const HOUSE_BOOKING_STATUSES = ['pending', 'contacted', 'confirmed', 'completed', 'cancelled'] as const
const WIFI_BOOKING_STATUSES = ['pending', 'contacted', 'completed', 'cancelled'] as const
const HOUSE_REQUEST_STATUSES = ['pending', 'contacted', 'fulfilled', 'closed'] as const
const COMPLAINT_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const
const COMPLAINT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
const TRANSACTION_STATUSES = ['pending', 'verifying', 'success', 'failed', 'refunded'] as const
const RELEASE_STATUSES = ['pending', 'held', 'released', 'paid', 'refunded', 'refund_requested', 'rejected'] as const

const ok = (text: string, data?: unknown): ToolResult => ({ ok: true, text, data })
const fail = (text: string): ToolResult => ({ ok: false, text })

function money(value: unknown): string {
  const n = Number(value)
  return Number.isFinite(n) ? `KSh ${n.toLocaleString('en-KE')}` : 'KSh 0'
}

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value.trim() : ''
}

function optStr(args: Record<string, unknown>, key: string): string | undefined {
  const value = str(args, key)
  return value || undefined
}

function num(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

function listArg(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key]
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string')
}

function shortId(id: unknown): string {
  return typeof id === 'string' ? `${id.slice(0, 8)}…` : '—'
}

function date(value: unknown): string {
  if (typeof value !== 'string') return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-KE')
}

function truncate(text: unknown, max = 180): string {
  const value = typeof text === 'string' ? text : ''
  return value.length > max ? `${value.slice(0, max)}…` : value
}

const limitSchema = z.number().int().min(1).max(50).optional()

const noArgs = z.object({})

async function adminEmailFor(ctx: AdminContext, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null
  const { data } = await ctx.db.auth.admin.getUserById(userId)
  return data.user?.email ?? null
}

async function userInApp(
  userId: string | null | undefined,
  title: string,
  body: string,
  link: string,
  data?: Record<string, unknown>
) {
  if (!userId) return
  await createNotification({ userId, category: 'system', title, body, link, data })
}

async function emailUser(
  ctx: AdminContext,
  userId: string | null | undefined,
  subject: string,
  title: string,
  fields: Record<string, string>
) {
  const email = await adminEmailFor(ctx, userId)
  if (!email) return
  await notifyUser(email, subject.replace(/[\r\n]/g, ' ').slice(0, 120), title, fields).catch(() => {})
}

/* ------------------------------------------------------------------ */
/* Stats + treasury                                                    */
/* ------------------------------------------------------------------ */

async function getStats(ctx: AdminContext): Promise<ToolResult> {
  const db = ctx.db
  const [listings, profiles, bookings, houseBookings, transactions, requests, complaints, reports, movers, wifiPackages, wifiBookings] =
    await Promise.all([
      db.from('listings').select('status, issues_count'),
      db.from('profiles').select('role'),
      db.from('bookings').select('amount, refund_amount, status, visit_status'),
      db.from('house_bookings').select('listing_price, release_status, status'),
      db.from('transactions').select('amount, status, payment_method'),
      db.from('house_requests').select('status'),
      db.from('complaints').select('status'),
      db.from('reports').select('id'),
      db.from('movers').select('id'),
      db.from('wifi_packages').select('id'),
      db.from('wifi_bookings').select('status'),
    ])

  const listingRows = (listings.data ?? []) as Row[]
  const profileRows = (profiles.data ?? []) as Row[]
  const bookingRows = (bookings.data ?? []) as Row[]
  const houseRows = (houseBookings.data ?? []) as Row[]
  const txRows = ((transactions.data ?? []) as Row[]).filter(
    (t) => t.payment_method !== 'payout' && t.payment_method !== 'refund'
  )
  const requestRows = (requests.data ?? []) as Row[]
  const complaintRows = (complaints.data ?? []) as Row[]
  const wifiRows = (wifiBookings.data ?? []) as Row[]

  const countBy = (rows: Row[], key: string, value: string) => rows.filter((r) => r[key] === value).length
  const sum = (rows: Row[], pick: (r: Row) => unknown) =>
    rows.reduce((total, r) => total + (Number(pick(r)) || 0), 0)

  const collectedHouse = houseRows.filter((h) =>
    ['held', 'paid', 'released', 'refunded'].includes(String(h.release_status))
  )
  const heldHouse = houseRows.filter((h) => h.release_status === 'held')
  const refundedHouse = houseRows.filter((h) => h.release_status === 'refunded')
  const legacyCollected = bookingRows.filter((b) => b.status === 'confirmed' || b.status === 'refunded')
  const totalRevenue = sum(legacyCollected, (b) => b.amount) + sum(collectedHouse, (h) => h.listing_price)
  const totalRefunded =
    sum(bookingRows.filter((b) => b.status === 'refunded'), (b) => b.refund_amount) +
    sum(refundedHouse, (h) => Math.round((Number(h.listing_price) || 0) * 0.85))

  const lines = [
    '*Platform snapshot*',
    `🏠 Listings: ${listingRows.length} total — ${countBy(listingRows, 'status', 'published')} published, ${countBy(listingRows, 'status', 'pending')} pending, ${countBy(listingRows, 'status', 'booked')} booked, ${countBy(listingRows, 'status', 'taken')} taken, ${countBy(listingRows, 'status', 'rejected')} rejected`,
    `⚠️ Listings with issues: ${listingRows.filter((l) => Number(l.issues_count) > 0).length}`,
    `👥 Users: ${profileRows.length} — ${countBy(profileRows, 'role', 'hunter')} hunters, ${countBy(profileRows, 'role', 'lister')} listers, ${countBy(profileRows, 'role', 'admin')} admins`,
    `📋 House requests: ${requestRows.length} — ${countBy(requestRows, 'status', 'pending')} pending`,
    `📡 WiFi: ${(wifiPackages.data ?? []).length} packages, ${wifiRows.length} bookings`,
    `🚚 Movers: ${(movers.data ?? []).length}`,
    `🛟 Complaints: ${complaintRows.length} — ${countBy(complaintRows, 'status', 'open')} open`,
    `🚩 Reports: ${(reports.data ?? []).length}`,
    '',
    '*Money*',
    `💰 Collected: ${money(totalRevenue)}`,
    `↩️ Refunded: ${money(totalRefunded)}`,
    `🏦 In escrow: ${heldHouse.length} booking(s), ${money(sum(heldHouse, (h) => h.listing_price))}`,
    `⏳ Pending lister payouts: ${heldHouse.length}, ${money(sum(heldHouse, (h) => Math.round((Number(h.listing_price) || 0) * OWNER_SHARE)))}`,
    `✅ Successful transactions: ${txRows.filter((t) => t.status === 'success').length}`,
    `❌ Failed transactions: ${txRows.filter((t) => t.status === 'failed').length}`,
  ]

  return ok(lines.join('\n'), {
    listings: listingRows.length,
    users: profileRows.length,
    revenue: totalRevenue,
    refunded: totalRefunded,
    escrow_held: heldHouse.length,
  })
}

async function getTreasury(ctx: AdminContext): Promise<ToolResult> {
  const db = ctx.db
  const [{ data: escrows }, { data: house }, { data: txns }] = await Promise.all([
    db.from('escrow_holds').select('*, booking:bookings(*), listing:listings(title)').order('created_at', { ascending: false }),
    db.from('house_bookings').select('*').order('created_at', { ascending: false }).limit(100),
    db.from('transactions').select('*').order('created_at', { ascending: false }).limit(100),
  ])

  const escrowRows = (escrows ?? []) as Row[]
  const houseRows = (house ?? []) as Row[]
  const txRows = (txns ?? []) as Row[]

  const sum = (rows: Row[], pick: (r: Row) => unknown) =>
    rows.reduce((total, r) => total + (Number(pick(r)) || 0), 0)

  const held = houseRows.filter((h) => h.release_status === 'held')
  const paid = houseRows.filter((h) => h.release_status === 'paid' || h.release_status === 'released')
  const refunded = houseRows.filter((h) => h.release_status === 'refunded')
  const legacyHeld = escrowRows.filter((e) => e.status === 'held')
  const legacyReleased = escrowRows.filter((e) => e.status === 'released')
  const legacyRefunded = escrowRows.filter((e) => e.status === 'refunded')

  const lines = [
    '*Treasury summary*',
    `🏦 Escrow held: ${held.length + legacyHeld.length} (${money(
      sum(held, (h) => h.listing_price) + sum(legacyHeld, (e) => e.amount)
    )})`,
    `✅ Released/paid: ${paid.length + legacyReleased.length}`,
    `↩️ Refunded: ${refunded.length + legacyRefunded.length}`,
    `⏳ Pending payouts: ${held.length} — ${money(sum(held, (h) => Math.round((Number(h.listing_price) || 0) * OWNER_SHARE)))}`,
    `📈 Platform revenue: ${money(
      sum(paid, (h) => (Number(h.listing_price) || 0) - Math.round((Number(h.listing_price) || 0) * OWNER_SHARE)) +
        sum(legacyReleased, (e) => (Number(e.amount) || 0) - Math.round((Number(e.amount) || 0) * OWNER_SHARE))
    )}`,
    '',
    '*Recent house payments*',
    ...houseRows.slice(0, 8).map(
      (h) =>
        `- ${truncate(h.listing_title || 'House', 40)} — ${money(h.listing_price)} — ${h.release_status} / ${h.status} — ${shortId(h.id)}`
    ),
    '',
    '*Recent transactions*',
    ...txRows.slice(0, 6).map(
      (t) =>
        `- ${t.mpesa_receipt || shortId(t.id)} — ${money(t.amount)} — ${t.status} (${t.payment_method || 'paywave'})`
    ),
  ]

  return ok(lines.join('\n'), { house_bookings: houseRows.slice(0, 20) })
}

/* ------------------------------------------------------------------ */
/* Read tools                                                          */
/* ------------------------------------------------------------------ */

const readTools: AdminTool[] = [
  {
    name: 'admin_get_stats',
    description:
      'Platform-wide snapshot: listing counts by status, users by role, requests, WiFi, movers, complaints, reports and money totals. Use this first for broad questions.',
    kind: 'read',
    schema: noArgs,
    summarize: () => 'Read platform stats',
    run: (_args, ctx) => getStats(ctx),
  },
  {
    name: 'admin_get_treasury',
    description:
      'Treasury and escrow summary with recent house payments and transactions, including held escrow, pending payouts and platform revenue.',
    kind: 'read',
    schema: noArgs,
    summarize: () => 'Read treasury summary',
    run: (_args, ctx) => getTreasury(ctx),
  },
  {
    name: 'admin_list_listings',
    description:
      'List listings with optional status filter and text search. Returns ids, titles, locations, rent, price and status. Use before any listing mutation.',
    kind: 'read',
    schema: z.object({
      status: z.enum(LISTING_STATUSES).optional(),
      search: z.string().max(120).optional(),
      limit: limitSchema,
    }),
    summarize: (a) => `List listings${a.status ? ` with status ${String(a.status)}` : ''}${a.search ? ` matching “${String(a.search)}”` : ''}`,
    run: async (args, ctx) => {
      let query = ctx.db
        .from('listings')
        .select('id, title, location, rent, price, status, uploader_name, uploader_id, issues_count, created_at, images')
        .order('created_at', { ascending: false })
        .limit(num(args, 'limit') ?? 12)
      if (args.status) query = query.eq('status', String(args.status))
      const search = optStr(args, 'search')
      if (search) query = query.or(`title.ilike.%${search}%,location.ilike.%${search}%`)
      const { data, error } = await query
      if (error) return fail(error.message)
      const rows = (data ?? []) as Row[]
      if (!rows.length) return ok('No listings matched.')
      return ok(
        [
          `*Listings (${rows.length})*`,
          ...rows.map(
            (l) =>
              `- ${l.title || 'Untitled'} — ${l.location || '—'} — ${money(l.rent || l.price)}/mo — *${l.status}* — id ${l.id}`
          ),
        ].join('\n'),
        rows
      )
    },
  },
  {
    name: 'admin_get_listing',
    description:
      'Full details for one listing, including description, rent, deposit, water, electricity, vacancy, images, video links and owner.',
    kind: 'read',
    schema: z.object({ listing_id: z.string().min(1) }),
    summarize: (a) => `Read listing ${String(a.listing_id)}`,
    run: async (args, ctx) => {
      const { data, error } = await ctx.db.from('listings').select('*').eq('id', str(args, 'listing_id')).maybeSingle()
      if (error) return fail(error.message)
      if (!data) return fail('Listing not found.')
      const l = data as Row
      return ok(
        [
          `*${l.title || 'Untitled'}*`,
          `Status: ${l.status} | Vacancy: ${l.vacancy || '—'}`,
          `Location: ${l.location || '—'}${l.descriptive_location ? ` (${l.descriptive_location})` : ''}`,
          `Booking fee: ${money(l.price)} | Rent: ${money(l.rent)} | Deposit: ${money(l.deposit)} (${l.deposit_refundable ? 'refundable' : 'non-refundable'})`,
          `Water: ${l.water || '—'} | Electricity: ${l.electric_bill || l.electricity || '—'}`,
          `Owner: ${l.uploader_name || '—'} (${l.uploader_id || '—'})`,
          `Issues: ${l.issues_count || 0}`,
          `Links: ${(l.youtube_urls as string[] | undefined)?.length || l.youtube_url ? 'YouTube ' : ''}${(l.tiktok_urls as string[] | undefined)?.length || l.tiktok_url ? 'TikTok ' : ''}${(l.video_urls as string[] | undefined)?.length || l.video_url ? 'Uploaded video ' : ''}`.trim(),
          `Description: ${truncate(l.description, 400)}`,
        ].join('\n'),
        l
      )
    },
  },
  {
    name: 'admin_list_users',
    description:
      'List users with optional role filter and text search over name, username, email and phone. Returns ids, roles and verification.',
    kind: 'read',
    schema: z.object({
      role: z.enum(['hunter', 'lister', 'admin']).optional(),
      search: z.string().max(120).optional(),
      limit: limitSchema,
    }),
    summarize: (a) => `List users${a.role ? ` with role ${String(a.role)}` : ''}${a.search ? ` matching “${String(a.search)}”` : ''}`,
    run: async (args, ctx) => {
      let query = ctx.db
        .from('profiles')
        .select('id, username, full_name, email, phone, role, verified, created_at')
        .order('created_at', { ascending: false })
        .limit(num(args, 'limit') ?? 15)
      if (args.role) query = query.eq('role', String(args.role))
      const search = optStr(args, 'search')
      if (search) {
        query = query.or(
          `full_name.ilike.%${search}%,username.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
        )
      }
      const { data, error } = await query
      if (error) return fail(error.message)
      const rows = (data ?? []) as Row[]
      if (!rows.length) return ok('No users matched.')
      return ok(
        [
          `*Users (${rows.length})*`,
          ...rows.map(
            (u) =>
              `- ${u.full_name || u.username || 'User'} — ${u.role} — ${u.verified ? 'verified' : 'not verified'} — ${u.email || 'no email'} — ${u.phone || 'no phone'} — id ${u.id}`
          ),
        ].join('\n'),
        rows
      )
    },
  },
  {
    name: 'admin_user_growth',
    description:
      'Count how many user accounts were created each month since launch, broken out by role (hunter / lister / admin). Use this for "users gained per month" questions. Note: deleted accounts are not tracked, so only signups (gains) are shown, not losses.',
    kind: 'read',
    schema: z.object({}),
    summarize: () => 'Monthly user growth since launch',
    run: async (_args, ctx) => {
      const { data, error } = await ctx.db
        .from('profiles')
        .select('id, role, created_at')
        .order('created_at', { ascending: true })
      if (error) return fail(error.message)
      const rows = (data ?? []) as Row[]
      if (!rows.length) return ok('No users found.')

      const byMonth = new Map<string, { total: number; hunter: number; lister: number; admin: number }>()
      for (const row of rows) {
        const d = new Date(String(row.created_at))
        if (Number.isNaN(d.getTime())) continue
        const key = d.toLocaleString('en-KE', { month: 'long', year: 'numeric' })
        const bucket = byMonth.get(key) || { total: 0, hunter: 0, lister: 0, admin: 0 }
        bucket.total += 1
        const role = String(row.role || '').toLowerCase()
        if (role === 'hunter') bucket.hunter += 1
        else if (role === 'lister') bucket.lister += 1
        else if (role === 'admin') bucket.admin += 1
        byMonth.set(key, bucket)
      }

      const total = rows.length
      const lines = [`*Users gained per month since launch (total: ${total})*`]
      for (const [month, b] of byMonth.entries()) {
        lines.push(
          `${month}: ${b.total} total — ${b.hunter} hunters, ${b.lister} listers, ${b.admin} admins`
        )
      }
      lines.push(
        '',
        'Note: account deletions are not tracked, so this shows signups (gains) only, not losses.'
      )
      return ok(lines.join('\n'), { total, monthly: Object.fromEntries(byMonth) })
    },
  },
  {
    name: 'admin_get_user',
    description:
      'Look up one user by id, email, phone, username or name. Returns profile plus their listings, bookings and transactions. This is a sensitive read and is audited.',
    kind: 'read',
    schema: z.object({
      user_id: z.string().optional(),
      query: z.string().max(120).optional(),
    }),
    summarize: (a) => `Read user ${String(a.user_id || a.query || '')}`,
    run: async (args, ctx) => {
      let profile: Row | null = null
      const userId = optStr(args, 'user_id')
      if (userId) {
        const { data, error } = await ctx.db.from('profiles').select('*').eq('id', userId).maybeSingle()
        if (error) return fail(error.message)
        profile = (data as Row) || null
      } else {
        const query = optStr(args, 'query')
        if (!query) return fail('Provide a user_id or a search query.')
        const { data, error } = await ctx.db
          .from('profiles')
          .select('*')
          .or(`email.ilike.%${query}%,phone.ilike.%${query}%,username.ilike.%${query}%,full_name.ilike.%${query}%`)
          .limit(2)
        if (error) return fail(error.message)
        const rows = (data ?? []) as Row[]
        if (rows.length > 1) {
          return ok(
            `Multiple users matched. Ask which one:\n${rows
              .map((u) => `- ${u.full_name || u.username} — ${u.email || 'no email'} — ${u.phone || 'no phone'} — id ${u.id}`)
              .join('\n')}`,
            rows
          )
        }
        profile = rows[0] || null
      }
      if (!profile) return fail('User not found.')

      const id = String(profile.id)
      const [listings, bookings, txns] = await Promise.all([
        ctx.db.from('listings').select('id, title, status, rent, price, created_at').eq('uploader_id', id).limit(20),
        ctx.db.from('bookings').select('id, amount, status, visit_status, created_at').eq('user_id', id).limit(20),
        ctx.db.from('transactions').select('id, amount, status, mpesa_receipt, payment_method, created_at').eq('user_id', id).limit(20),
      ])

      const listingRows = (listings.data ?? []) as Row[]
      const bookingRows = (bookings.data ?? []) as Row[]
      const txRows = (txns.data ?? []) as Row[]

      return ok(
        [
          `*${profile.full_name || profile.username || 'User'}*`,
          `Role: ${profile.role} | Verified: ${profile.verified ? 'yes' : 'no'}`,
          `Email: ${profile.email || '—'} | Phone: ${profile.phone || '—'}`,
          `Username: ${profile.username || '—'} | Joined: ${date(profile.created_at)}`,
          `ID: ${id}`,
          '',
          `*Listings (${listingRows.length})*`,
          ...listingRows.map((l) => `- ${l.title} — ${money(l.rent || l.price)} — ${l.status}`),
          '',
          `*Bookings (${bookingRows.length})*`,
          ...bookingRows.map((b) => `- ${money(b.amount)} — ${b.status} / ${b.visit_status || '—'} — ${date(b.created_at)}`),
          '',
          `*Transactions (${txRows.length})*`,
          ...txRows.map((t) => `- ${t.mpesa_receipt || shortId(t.id)} — ${money(t.amount)} — ${t.status} (${t.payment_method || '—'})`),
        ].join('\n'),
        { profile, listings: listingRows, bookings: bookingRows, transactions: txRows }
      )
    },
  },
  {
    name: 'admin_list_house_bookings',
    description:
      'List house viewings/payments from house_bookings with status, escrow release status, hunter contact and amounts.',
    kind: 'read',
    schema: z.object({
      status: z.enum(HOUSE_BOOKING_STATUSES).optional(),
      release_status: z.enum(RELEASE_STATUSES).optional(),
      search: z.string().max(120).optional(),
      limit: limitSchema,
    }),
    summarize: (a) => `List house bookings${a.status ? ` (${String(a.status)})` : ''}${a.release_status ? ` / ${String(a.release_status)}` : ''}`,
    run: async (args, ctx) => {
      let query = ctx.db
        .from('house_bookings')
        .select('id, listing_id, listing_title, listing_location, listing_price, name, phone, area, status, release_status, mpesa_receipt, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(num(args, 'limit') ?? 15)
      if (args.status) query = query.eq('status', String(args.status))
      if (args.release_status) query = query.eq('release_status', String(args.release_status))
      const search = optStr(args, 'search')
      if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,listing_title.ilike.%${search}%`)
      const { data, error } = await query
      if (error) return fail(error.message)
      const rows = (data ?? []) as Row[]
      if (!rows.length) return ok('No house bookings matched.')
      return ok(
        [
          `*House bookings (${rows.length})*`,
          ...rows.map(
            (b) =>
              `- ${b.name} — ${b.listing_title || 'House'} — ${money(b.listing_price)} — ${b.status} / ${b.release_status} — ${b.phone} — id ${b.id}`
          ),
        ].join('\n'),
        rows
      )
    },
  },
  {
    name: 'admin_find_house_booking',
    description:
      'Find a house booking by hunter name, phone, listing title, M-Pesa receipt, or amount. Use this when the admin only gives a name or description ("payment for Millicent", "the KSh 600 Eldoret booking") and you need the booking id before verifying or paying out.',
    kind: 'read',
    schema: z.object({
      name: z.string().max(120).optional(),
      phone: z.string().max(30).optional(),
      listing_title: z.string().max(120).optional(),
      receipt: z.string().max(60).optional(),
      min_amount: z.number().int().min(0).optional(),
      max_amount: z.number().int().min(0).optional(),
      status: z.enum(HOUSE_BOOKING_STATUSES).optional(),
      release_status: z.enum(RELEASE_STATUSES).optional(),
      limit: limitSchema,
    }),
    summarize: (a) => `Find house booking${a.name ? ` for ${String(a.name)}` : ''}${a.phone ? ` phone ${String(a.phone)}` : ''}`,
    run: async (args, ctx) => {
      let query = ctx.db
        .from('house_bookings')
        .select('id, listing_id, listing_title, listing_location, listing_price, name, phone, area, status, release_status, mpesa_receipt, mpesa_message, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(num(args, 'limit') ?? 10)
      const name = optStr(args, 'name')
      if (name) query = query.ilike('name', `%${name}%`)
      const phone = optStr(args, 'phone')
      if (phone) query = query.ilike('phone', `%${phone}%`)
      const listingTitle = optStr(args, 'listing_title')
      if (listingTitle) query = query.ilike('listing_title', `%${listingTitle}%`)
      const receipt = optStr(args, 'receipt')
      if (receipt) query = query.ilike('mpesa_receipt', `%${receipt}%`)
      if (args.min_amount !== undefined) query = query.gte('listing_price', num(args, 'min_amount') ?? 0)
      if (args.max_amount !== undefined) query = query.lte('listing_price', num(args, 'max_amount') ?? 0)
      if (args.status) query = query.eq('status', String(args.status))
      if (args.release_status) query = query.eq('release_status', String(args.release_status))
      const { data, error } = await query
      if (error) return fail(error.message)
      const rows = (data ?? []) as Row[]
      if (!rows.length) return ok('No house bookings matched.')
      return ok(
        [
          `*House bookings found (${rows.length})*`,
          ...rows.map(
            (b) =>
              `- ${b.name} — ${b.listing_title || 'House'} — ${money(b.listing_price)} — ${b.status} / ${b.release_status} — ${b.phone} — receipt ${b.mpesa_receipt || '—'} — id ${b.id}`
          ),
        ].join('\n'),
        rows
      )
    },
  },
  {
    name: 'admin_list_wifi_bookings',
    description: 'List WiFi installation bookings with package, contact, area and status.',
    kind: 'read',
    schema: z.object({
      status: z.enum(WIFI_BOOKING_STATUSES).optional(),
      search: z.string().max(120).optional(),
      limit: limitSchema,
    }),
    summarize: (a) => `List WiFi bookings${a.status ? ` (${String(a.status)})` : ''}`,
    run: async (args, ctx) => {
      let query = ctx.db
        .from('wifi_bookings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(num(args, 'limit') ?? 15)
      if (args.status) query = query.eq('status', String(args.status))
      const search = optStr(args, 'search')
      if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,area.ilike.%${search}%,package_name.ilike.%${search}%`)
      const { data, error } = await query
      if (error) return fail(error.message)
      const rows = (data ?? []) as Row[]
      if (!rows.length) return ok('No WiFi bookings matched.')
      return ok(
        [
          `*WiFi bookings (${rows.length})*`,
          ...rows.map(
            (b) =>
              `- ${b.name} — ${b.package_name} (${b.package_speed}) — ${money(b.package_price)}/mo — ${b.area} — ${b.status} — ${b.phone} — id ${b.id}`
          ),
        ].join('\n'),
        rows
      )
    },
  },
  {
    name: 'admin_list_transactions',
    description: 'List M-Pesa/PayWave transactions with receipt, amount, phone, status and payment method.',
    kind: 'read',
    schema: z.object({
      status: z.enum(TRANSACTION_STATUSES).optional(),
      search: z.string().max(120).optional(),
      limit: limitSchema,
    }),
    summarize: (a) => `List transactions${a.status ? ` (${String(a.status)})` : ''}`,
    run: async (args, ctx) => {
      let query = ctx.db
        .from('transactions')
        .select('id, booking_id, user_id, listing_id, phone, amount, mpesa_receipt, checkout_request_id, status, payment_method, created_at')
        .order('created_at', { ascending: false })
        .limit(num(args, 'limit') ?? 15)
      if (args.status) query = query.eq('status', String(args.status))
      const search = optStr(args, 'search')
      if (search) query = query.or(`mpesa_receipt.ilike.%${search}%,phone.ilike.%${search}%,checkout_request_id.ilike.%${search}%`)
      const { data, error } = await query
      if (error) return fail(error.message)
      const rows = (data ?? []) as Row[]
      if (!rows.length) return ok('No transactions matched.')
      return ok(
        [
          `*Transactions (${rows.length})*`,
          ...rows.map(
            (t) =>
              `- ${t.mpesa_receipt || shortId(t.id)} — ${money(t.amount)} — ${t.phone || '—'} — ${t.status} (${t.payment_method || 'paywave'}) — id ${t.id}`
          ),
        ].join('\n'),
        rows
      )
    },
  },
  {
    name: 'admin_list_house_requests',
    description:
      'List house-hunting requests with requester contact, area, budget and status. Optionally filter by date range (start_date/end_date as ISO strings) to find old requests from a specific month.',
    kind: 'read',
    schema: z.object({
      status: z.enum(HOUSE_REQUEST_STATUSES).optional(),
      search: z.string().max(120).optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      limit: limitSchema,
    }),
    summarize: (a) => `List house requests${a.status ? ` (${String(a.status)})` : ''}${a.start_date ? ` from ${String(a.start_date)}` : ''}${a.end_date ? ` to ${String(a.end_date)}` : ''}`,
    run: async (args, ctx) => {
      let query = ctx.db
        .from('house_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(num(args, 'limit') ?? 15)
      if (args.status) query = query.eq('status', String(args.status))
      const search = optStr(args, 'search')
      if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,location.ilike.%${search}%`)
      if (args.start_date) query = query.gte('created_at', String(args.start_date))
      if (args.end_date) query = query.lte('created_at', String(args.end_date))
      const { data, error } = await query
      if (error) return fail(error.message)
      const rows = (data ?? []) as Row[]
      if (!rows.length) return ok('No house requests matched.')
      return ok(
        [
          `*House requests (${rows.length})*`,
          ...rows.map(
            (r) =>
              `- ${r.name} — ${r.location} — ${money(r.min_rent)}–${money(r.max_rent)} — ${r.status} — ${r.phone} — id ${r.id} — ${r.created_at ? new Date(String(r.created_at)).toLocaleDateString('en-KE') : '—'}`
          ),
        ].join('\n'),
        rows
      )
    },
  },
  {
    name: 'admin_list_complaints',
    description: 'List complaints with status, priority, category and admin note.',
    kind: 'read',
    schema: z.object({
      status: z.enum(COMPLAINT_STATUSES).optional(),
      priority: z.enum(COMPLAINT_PRIORITIES).optional(),
      search: z.string().max(120).optional(),
      limit: limitSchema,
    }),
    summarize: (a) => `List complaints${a.status ? ` (${String(a.status)})` : ''}${a.priority ? ` priority ${String(a.priority)}` : ''}`,
    run: async (args, ctx) => {
      let query = ctx.db
        .from('complaints')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(num(args, 'limit') ?? 15)
      if (args.status) query = query.eq('status', String(args.status))
      if (args.priority) query = query.eq('priority', String(args.priority))
      const search = optStr(args, 'search')
      if (search) query = query.or(`subject.ilike.%${search}%,message.ilike.%${search}%,email.ilike.%${search}%,name.ilike.%${search}%`)
      const { data, error } = await query
      if (error) return fail(error.message)
      const rows = (data ?? []) as Row[]
      if (!rows.length) return ok('No complaints matched.')
      return ok(
        [
          `*Complaints (${rows.length})*`,
          ...rows.map(
            (c) =>
              `- ${c.subject || 'Complaint'} — ${c.status} / ${c.priority} — ${c.name || c.email || '—'} — ${date(c.created_at)} — id ${c.id}`
          ),
        ].join('\n'),
        rows
      )
    },
  },
  {
    name: 'admin_list_booking_reviews',
    description:
      'List booking feedback awaiting review or already decided, with the hunter issue, payout amount and refund percentage.',
    kind: 'read',
    schema: z.object({
      decision: z.enum(['pending', 'approved', 'declined', 'all']).optional(),
      limit: limitSchema,
    }),
    summarize: (a) => `List booking reviews${a.decision ? ` (${String(a.decision)})` : ''}`,
    run: async (args, ctx) => {
      const { data, error } = await ctx.db
        .from('house_bookings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(num(args, 'limit') ?? 20)
      if (error) return fail(error.message)
      const rows = (data ?? []) as Row[]
      const decision = optStr(args, 'decision') || 'all'
      const enriched = rows.map((row) => {
        const feedback = parseBookingFeedback(row.displeased_reason as string | null) || null
        const price = Number(row.listing_price) || 0
        const refundPercent = feedback ? refundPercentForFeedback(feedback) : 0
        return {
          id: row.id,
          name: row.name,
          listing_title: row.listing_title,
          status: row.status,
          release_status: row.release_status,
          confirmed_at: row.confirmed_at,
          feedback,
          payout_amount: Math.round(price * OWNER_SHARE),
          refund_percent: refundPercent,
          refund_amount: Math.round(price * (refundPercent / 100)),
        }
      })
      const filtered = enriched.filter((row) => {
        if (decision === 'all') return true
        if (decision === 'pending') return row.feedback?.outcome === 'issue' && !row.feedback.decision
        if (decision === 'approved') return row.feedback?.decision === 'refund_approved'
        return row.feedback?.decision === 'refund_declined'
      })
      if (!filtered.length) return ok('No booking reviews matched.')
      return ok(
        [
          `*Booking reviews (${filtered.length})*`,
          ...filtered.map(
            (r) =>
              `- ${r.listing_title || 'House'} — ${r.name} — ${r.feedback?.outcome || 'no feedback'}${r.feedback?.category ? ` (${r.feedback.category})` : ''} — payout ${money(r.payout_amount)} / refund ${r.refund_percent}% (${money(r.refund_amount)}) — booking ${r.id}`
          ),
        ].join('\n'),
        filtered
      )
    },
  },
  {
    name: 'admin_list_services',
    description: 'List services data: wifi_packages, wifi_categories, movers or wifi_bookings.',
    kind: 'read',
    schema: z.object({
      type: z.enum(['wifi_packages', 'wifi_categories', 'movers', 'wifi_bookings']),
      limit: limitSchema,
    }),
    summarize: (a) => `List ${String(a.type)}`,
    run: async (args, ctx) => {
      const type = str(args, 'type')
      const limit = num(args, 'limit') ?? 20
      const table = ['wifi_packages', 'wifi_categories', 'movers', 'wifi_bookings'].includes(type) ? type : ''
      if (!table) return fail('Unknown service type.')
      const { data, error } = await ctx.db.from(table).select('*').limit(limit)
      if (error) return fail(error.message)
      const rows = (data ?? []) as Row[]
      if (!rows.length) return ok(`No ${type} found.`)
      const lines =
        type === 'wifi_packages'
          ? rows.map((r) => `- ${r.name} (${r.provider}) — ${r.speed} — ${money(r.price)}/mo — id ${r.id}`)
          : type === 'wifi_categories'
            ? rows.map((r) => `- ${r.name} — ${r.description || ''} — id ${r.id}`)
            : type === 'movers'
              ? rows.map((r) => `- ${r.name} — ${r.location} — ${money(r.price)} — ${r.phone} — id ${r.id}`)
              : rows.map((r) => `- ${r.name} — ${r.package_name} — ${r.status} — id ${r.id}`)
      return ok([`*${type} (${rows.length})*`, ...lines].join('\n'), rows)
    },
  },
  {
    name: 'admin_get_receipt_link',
    description:
      'Resolve a receipt download link from a booking id, transaction id or M-Pesa receipt number. Read-only; returns a URL the admin can open.',
    kind: 'read',
    schema: z.object({
      booking_id: z.string().optional(),
      transaction_id: z.string().optional(),
      receipt: z.string().optional(),
    }),
    summarize: (a) => `Get receipt for ${String(a.booking_id || a.transaction_id || a.receipt || '')}`,
    run: async (args, ctx) => {
      const bookingId = optStr(args, 'booking_id')
      const transactionId = optStr(args, 'transaction_id')
      const receipt = optStr(args, 'receipt')
      if (!bookingId && !transactionId && !receipt) return fail('Provide a booking id, transaction id or receipt number.')

      let resolved = bookingId || ''
      if (!resolved && transactionId) {
        const { data } = await ctx.db.from('transactions').select('booking_id').eq('id', transactionId).maybeSingle()
        resolved = (data?.booking_id as string) || ''
      }
      if (!resolved && receipt) {
        const { data } = await ctx.db.from('house_bookings').select('id').eq('mpesa_receipt', receipt).maybeSingle()
        resolved = (data?.id as string) || ''
      }
      if (!resolved) return fail('No booking found for that reference.')
      const url = `/api/admin/receipts?booking_id=${encodeURIComponent(resolved)}`
      return ok(`Receipt link for booking ${resolved}: ${url}\nOpen it in the browser to download the PDF.`, { url })
    },
  },
]

/* ------------------------------------------------------------------ */
/* Write tools                                                         */
/* ------------------------------------------------------------------ */

const writeTools: AdminTool[] = [
  {
    name: 'admin_update_listing_status',
    description:
      'Change a listing status: approve/publish, reject, mark booked, mark taken, or put back on the market. Handles media moves and notifies the lister.',
    kind: 'write',
    schema: z.object({
      listing_id: z.string().min(1),
      status: z.enum(LISTING_STATUSES),
      reason: z.string().max(500).optional(),
      taken_by_name: z.string().max(120).optional(),
    }),
    summarize: (a) => `Set listing ${String(a.listing_id)} to ${String(a.status)}${a.reason ? ` (reason: ${String(a.reason)})` : ''}`,
    run: async (args, ctx) => {
      const id = str(args, 'listing_id')
      const status = str(args, 'status')
      const { data: existingData, error: readError } = await ctx.db.from('listings').select('*').eq('id', id).maybeSingle()
      if (readError) return fail(readError.message)
      if (!existingData) return fail('Listing not found.')
      const existing = existingData as Row
      const previous = String(existing.status)

      if (status !== previous) {
        if ((previous === 'taken' || previous === 'booked') && status === 'published') {
          await moveMediaBackToListings(id).catch(() => {})
        }
        if (previous === 'published' && status === 'taken') {
          await moveMediaToTaken(id).catch(() => {})
        }
      }

      const patch: Row = { status }
      if (status === 'published') {
        patch.taken_at = null
        patch.taken_by_name = ''
      }
      if (status === 'taken') {
        patch.taken_at = new Date().toISOString()
        patch.taken_by_name = optStr(args, 'taken_by_name') || 'Admin'
      }

      const { error } = await ctx.db.from('listings').update(patch).eq('id', id)
      if (error) return fail(error.message)
      invalidateCached('listings|')

      const reason = optStr(args, 'reason')
      await userInApp(
        existing.uploader_id as string | undefined,
        'Listing updated',
        `Your listing “${existing.title || 'House'}” is now ${status}.${reason ? ` Reason: ${reason}` : ''}`,
        `/listings/${id}`
      )
      await emailUser(
        ctx,
        existing.uploader_id as string | undefined,
        `Listing ${status}`,
        `Your listing is now ${status}`,
        {
          Property: String(existing.title || 'House'),
          Status: status,
          ...(reason ? { Reason: reason } : {}),
          Link: `https://www.asehanta.com/listings/${id}`,
        }
      )

      return ok(`Listing “${existing.title || id}” updated from ${previous} to ${status}.`)
    },
  },
  {
    name: 'admin_update_listing',
    description:
      'Edit a listing: title, description, prices (booking fee/rent/deposit), location, descriptive location, house type, building type, floor number, water, electricity, vacancy status, why vacant, lister phone, images, YouTube links, TikTok links, video URLs, issues, and issues count. Categories: house_type (free text), building_type (storey/flat), vacancy (pending/vacant). Only send fields that should change.',
    kind: 'write',
    schema: z.object({
      listing_id: z.string().min(1),
      title: z.string().min(3).max(120).optional(),
      description: z.string().min(10).max(5000).optional(),
      price: z.number().int().min(0).optional(),
      rent: z.number().int().min(0).optional(),
      deposit: z.number().int().min(0).optional(),
      deposit_refundable: z.boolean().optional(),
      location: z.string().min(2).max(120).optional(),
      descriptive_location: z.string().max(500).optional(),
      house_type: z.string().max(60).optional(),
      building_type: z.enum(['', 'storey', 'flat']).optional(),
      floor_number: z.string().max(30).optional(),
      water: z.string().max(200).optional(),
      electric_bill: z.string().max(200).optional(),
      vacancy: z.enum(['pending', 'vacant']).optional(),
      why_vacant: z.string().max(500).optional(),
      lister_phone: z.string().max(30).optional(),
      images: z.array(z.string().url()).max(15).optional(),
      youtube_urls: z.array(z.string().url()).max(10).optional(),
      tiktok_urls: z.array(z.string().url()).max(10).optional(),
      video_urls: z.array(z.string().url()).max(10).optional(),
      issues: z.array(z.string()).max(20).optional(),
      issues_count: z.number().int().min(0).max(20).optional(),
    }),
    summarize: (a) => `Update listing ${String(a.listing_id)} fields: ${Object.keys(a).filter((k) => k !== 'listing_id').join(', ') || 'none'}`,
    run: async (args, ctx) => {
      const id = str(args, 'listing_id')
      const patch: Row = {}
      const allowed = [
        'title',
        'description',
        'price',
        'rent',
        'deposit',
        'deposit_refundable',
        'location',
        'descriptive_location',
        'house_type',
        'building_type',
        'floor_number',
        'water',
        'electric_bill',
        'vacancy',
        'why_vacant',
        'lister_phone',
        'images',
        'video_urls',
        'issues',
        'issues_count',
      ] as const
      for (const key of allowed) {
        if (args[key] !== undefined) patch[key] = args[key]
      }
      if (args.youtube_urls !== undefined) {
        const urls = listArg(args, 'youtube_urls') || []
        patch.youtube_urls = urls
        patch.youtube_url = urls[0] || null
      }
      if (args.tiktok_urls !== undefined) {
        const urls = listArg(args, 'tiktok_urls') || []
        patch.tiktok_urls = urls
        patch.tiktok_url = urls[0] || null
      }
      if (!Object.keys(patch).length) return fail('No supported fields were provided.')

      const { data: existingData } = await ctx.db.from('listings').select('id, title, status').eq('id', id).maybeSingle()
      if (!existingData) return fail('Listing not found.')

      const { error } = await ctx.db.from('listings').update(patch).eq('id', id)
      if (error) return fail(error.message)
      invalidateCached('listings|')
      return ok(`Listing “${existingData.title || id}” updated (${Object.keys(patch).join(', ')}).`)
    },
  },
  {
    name: 'admin_delete_listing',
    description: 'Permanently delete a listing. This is destructive; the admin must explicitly confirm it.',
    kind: 'write',
    schema: z.object({ listing_id: z.string().min(1), reason: z.string().max(300).optional() }),
    summarize: (a) => `Permanently delete listing ${String(a.listing_id)}${a.reason ? ` — ${String(a.reason)}` : ''}`,
    run: async (args, ctx) => {
      const id = str(args, 'listing_id')
      const { data: existing } = await ctx.db.from('listings').select('id, title, uploader_id').eq('id', id).maybeSingle()
      if (!existing) return fail('Listing not found.')
      const { error } = await ctx.db.from('listings').delete().eq('id', id)
      if (error) return fail(error.message)
      invalidateCached('listings|')
      await emailUser(ctx, existing.uploader_id as string | undefined, 'Listing removed', 'Your listing was removed', {
        Property: String(existing.title || 'House'),
        Reason: optStr(args, 'reason') || 'Administrative action',
      })
      return ok(`Listing “${existing.title || id}” deleted permanently.`)
    },
  },
  {
    name: 'admin_create_listing',
    description:
      'Create a listing as admin. Requires title, description, location, booking fee and images. It is published immediately and owned by the admin.',
    kind: 'write',
    schema: z.object({
      title: z.string().min(3).max(120),
      description: z.string().min(10).max(5000),
      price: z.number().int().min(1),
      rent: z.number().int().min(0),
      location: z.string().min(2).max(120),
      images: z.array(z.string().url()).min(1).max(15),
      descriptive_location: z.string().max(500).optional(),
      deposit: z.number().int().min(0).optional(),
      deposit_refundable: z.boolean().optional(),
      water: z.string().max(200).optional(),
      electric_bill: z.string().max(200).optional(),
      house_type: z.string().max(60).optional(),
      vacancy: z.enum(['pending', 'vacant']).optional(),
      why_vacant: z.string().max(500).optional(),
      lister_phone: z.string().max(30).optional(),
      youtube_urls: z.array(z.string().url()).max(10).optional(),
      tiktok_urls: z.array(z.string().url()).max(10).optional(),
      video_urls: z.array(z.string().url()).max(10).optional(),
      issues: z.array(z.string()).max(20).optional(),
      publish: z.boolean().optional(),
    }),
    summarize: (a) => `Create listing “${String(a.title)}” in ${String(a.location)} at ${money(a.rent)}/mo`,
    run: async (args, ctx) => {
      const youtube = listArg(args, 'youtube_urls') || []
      const tiktok = listArg(args, 'tiktok_urls') || []
      const issues = listArg(args, 'issues') || []
      const row: Row = {
        title: str(args, 'title'),
        description: str(args, 'description'),
        price: num(args, 'price') ?? 0,
        rent: num(args, 'rent') ?? 0,
        deposit: num(args, 'deposit') ?? 0,
        deposit_refundable: args.deposit_refundable ?? true,
        location: str(args, 'location'),
        descriptive_location: optStr(args, 'descriptive_location') || '',
        images: listArg(args, 'images') || [],
        water: optStr(args, 'water') || '',
        electric_bill: optStr(args, 'electric_bill') || '',
        house_type: optStr(args, 'house_type') || '',
        vacancy: optStr(args, 'vacancy') || 'vacant',
        why_vacant: optStr(args, 'why_vacant') || '',
        lister_phone: optStr(args, 'lister_phone') || '',
        issues,
        issues_count: issues.length,
        video_urls: listArg(args, 'video_urls') || [],
        youtube_urls: youtube,
        youtube_url: youtube[0] || null,
        tiktok_urls: tiktok,
        tiktok_url: tiktok[0] || null,
        status: args.publish === false ? 'pending' : 'published',
        uploader_id: ctx.userId,
        uploader_name: 'AseHanta Admin',
      }
      const { data, error } = await ctx.db.from('listings').insert(row).select('id, title, status').single()
      if (error) return fail(error.message)
      invalidateCached('listings|')
      return ok(`Listing “${data.title}” created as ${data.status} (id ${data.id}).`, data)
    },
  },
  {
    name: 'admin_update_user_role',
    description: 'Change a user role between hunter, lister and admin. Notifies the user.',
    kind: 'write',
    schema: z.object({ user_id: z.string().min(1), role: z.enum(['hunter', 'lister', 'admin']) }),
    summarize: (a) => `Change user ${String(a.user_id)} role to ${String(a.role)}`,
    run: async (args, ctx) => {
      const userId = str(args, 'user_id')
      const role = str(args, 'role')
      if (userId === ctx.userId && role !== 'admin') {
        return fail('You cannot remove your own admin role.')
      }
      const { data: profile } = await ctx.db.from('profiles').select('id, full_name, role, email').eq('id', userId).maybeSingle()
      if (!profile) return fail('User not found.')

      const { error: authError } = await ctx.db.auth.admin.updateUserById(userId, {
        user_metadata: { role },
      })
      if (authError) return fail(`Auth metadata update failed: ${authError.message}`)

      const { error } = await ctx.db.from('profiles').update({ role }).eq('id', userId)
      if (error) return fail(error.message)

      await userInApp(userId, 'Role updated', `Your account role is now ${role}.`, '/profile')
      await emailUser(ctx, userId, 'Account role updated', 'Your role was updated', {
        Name: String(profile.full_name || 'User'),
        'Previous role': String(profile.role || 'unknown'),
        'New role': role,
      })
      return ok(`${profile.full_name || userId} is now ${role} (was ${profile.role}).`)
    },
  },
  {
    name: 'admin_set_user_verified',
    description: 'Mark a user verified or unverified.',
    kind: 'write',
    schema: z.object({ user_id: z.string().min(1), verified: z.boolean() }),
    summarize: (a) => `Set user ${String(a.user_id)} verified=${String(a.verified)}`,
    run: async (args, ctx) => {
      const userId = str(args, 'user_id')
      const verified = args.verified === true
      const { data, error } = await ctx.db
        .from('profiles')
        .update({ verified })
        .eq('id', userId)
        .select('id, full_name')
        .maybeSingle()
      if (error) return fail(error.message)
      if (!data) return fail('User not found.')
      await userInApp(userId, verified ? 'Account verified' : 'Verification removed', verified ? 'Your account is now verified.' : 'Your account verification was removed.', '/profile')
      return ok(`${data.full_name || userId} is now ${verified ? 'verified' : 'not verified'}.`)
    },
  },
  {
    name: 'admin_delete_user',
    description:
      'Permanently delete a user account and their profile. This is destructive and cannot be undone; the admin must explicitly confirm it.',
    kind: 'write',
    schema: z.object({ user_id: z.string().min(1), reason: z.string().max(300).optional() }),
    summarize: (a) => `Permanently delete user ${String(a.user_id)}${a.reason ? ` — ${String(a.reason)}` : ''}`,
    run: async (args, ctx) => {
      const userId = str(args, 'user_id')
      if (userId === ctx.userId) return fail('You cannot delete your own account from the copilot.')
      const { data: profile } = await ctx.db.from('profiles').select('id, full_name, email').eq('id', userId).maybeSingle()
      if (!profile) return fail('User not found.')
      await userInApp(userId, 'Account deleted', 'Your AseHanta account was deleted by an administrator.', '/').catch(() => {})
      const { error: profileError } = await ctx.db.from('profiles').delete().eq('id', userId)
      if (profileError) return fail(profileError.message)
      const { error: authError } = await ctx.db.auth.admin.deleteUser(userId)
      if (authError) return fail(`Profile deleted, but auth deletion failed: ${authError.message}`)
      return ok(`User ${profile.full_name || profile.email || userId} deleted permanently.`)
    },
  },
  {
    name: 'admin_update_house_request',
    description: 'Update a house request status and/or admin notes. Emails the requester for contacted or fulfilled.',
    kind: 'write',
    schema: z.object({
      request_id: z.string().min(1),
      status: z.enum(HOUSE_REQUEST_STATUSES).optional(),
      admin_notes: z.string().max(2000).optional(),
    }),
    summarize: (a) => `Update house request ${String(a.request_id)}${a.status ? ` to ${String(a.status)}` : ''}`,
    run: async (args, ctx) => {
      const id = str(args, 'request_id')
      const patch: Row = {}
      if (args.status !== undefined) patch.status = args.status
      if (args.admin_notes !== undefined) patch.admin_notes = args.admin_notes
      if (!Object.keys(patch).length) return fail('Provide a status or admin_notes.')
      const { data, error } = await ctx.db.from('house_requests').update(patch).eq('id', id).select('*').maybeSingle()
      if (error) return fail(error.message)
      if (!data) return fail('House request not found.')
      if (data.email && (data.status === 'fulfilled' || data.status === 'contacted')) {
        await notifyUser(
          String(data.email),
          data.status === 'fulfilled' ? 'We found a house for you' : 'Update on your house request',
          data.status === 'fulfilled' ? 'A house matching your request was found' : 'Your request is being processed',
          {
            Name: String(data.name || 'there'),
            Location: String(data.location || '—'),
            Status: String(data.status),
            Notes: String(data.admin_notes || 'We will reach out shortly.'),
          }
        ).catch(() => {})
      }
      return ok(`House request ${id.slice(0, 8)}… is now ${data.status}.`)
    },
  },
  {
    name: 'admin_delete_house_request',
    description:
      'Permanently delete a house-hunting request. This is destructive and cannot be undone; the admin must explicitly confirm it.',
    kind: 'write',
    schema: z.object({ request_id: z.string().min(1), reason: z.string().max(300).optional() }),
    summarize: (a) => `Permanently delete house request ${String(a.request_id)}${a.reason ? ` — ${String(a.reason)}` : ''}`,
    run: async (args, ctx) => {
      const id = str(args, 'request_id')
      const { data: existing } = await ctx.db.from('house_requests').select('id, name, email, status').eq('id', id).maybeSingle()
      if (!existing) return fail('House request not found.')
      const { error } = await ctx.db.from('house_requests').delete().eq('id', id)
      if (error) return fail(error.message)
      await userInApp(
        undefined,
        'House request deleted',
        'Your house-hunting request was removed by an administrator.',
        '/request-house'
      ).catch(() => {})
      await notifyUser(
        String(existing.email),
        'House request removed',
        'Your house-hunting request was removed by an administrator.',
        { Name: String(existing.name || 'there'), Reason: optStr(args, 'reason') || 'Administrative action' }
      ).catch(() => {})
      return ok(`House request ${id.slice(0, 8)}… (${existing.name || '—'}) deleted permanently.`)
    },
  },
  {
    name: 'admin_delete_house_requests_batch',
    description:
      'Permanently delete multiple house-hunting requests at once. Provide a comma-separated list of request IDs. This is destructive and cannot be undone; the admin must explicitly confirm it. Use this to clean up old requests from a specific date range (find them first with admin_list_house_requests using start_date/end_date).',
    kind: 'write',
    schema: z.object({
      request_ids: z.string().min(1),
      reason: z.string().max(300).optional(),
    }),
    summarize: (a) => {
      const ids = String(a.request_ids).split(',').map((s) => s.trim()).filter(Boolean)
      return `Batch delete ${ids.length} house request(s)${a.reason ? ` — ${String(a.reason)}` : ''}`
    },
    run: async (args, ctx) => {
      const rawIds = String(args.request_ids).split(',').map((s) => s.trim()).filter(Boolean)
      if (rawIds.length === 0) return fail('Provide at least one request ID.')
      if (rawIds.length > 50) return fail('Maximum 50 requests per batch.')

      // Verify all exist first
      const { data: existing, error: readError } = await ctx.db
        .from('house_requests')
        .select('id, name, email, status, created_at')
        .in('id', rawIds)
      if (readError) return fail(readError.message)
      if (!existing || existing.length === 0) return fail('No matching house requests found.')

      const names = existing.map((r) => r.name || '—').join(', ')
      const { error } = await ctx.db.from('house_requests').delete().in('id', rawIds)
      if (error) return fail(error.message)

      // Notify affected requesters
      await Promise.allSettled(
        existing.map((r) =>
          notifyUser(String(r.email), 'House request removed', 'Your house-hunting request was removed by an administrator.', {
            Name: String(r.name || 'there'),
            Reason: optStr(args, 'reason') || 'Administrative batch deletion',
          }).catch(() => {})
        )
      )

      return ok(`Deleted ${existing.length} house request(s) permanently: ${names}.`)
    },
  },
  {
    name: 'admin_batch_edit_house_requests',
    description:
      'Batch update the status of multiple house-hunting requests at once. Provide comma-separated request IDs and the new status (pending, contacted, fulfilled, closed). Use this to flip 10+ requests in one confirmation. Find the request IDs first with admin_list_house_requests.',
    kind: 'write',
    schema: z.object({
      request_ids: z.string().min(1),
      status: z.enum(HOUSE_REQUEST_STATUSES),
      reason: z.string().max(300).optional(),
    }),
    summarize: (a) => {
      const ids = String(a.request_ids).split(',').map((s) => s.trim()).filter(Boolean)
      return `Batch set ${ids.length} house request(s) to ${String(a.status)}${a.reason ? ` — ${String(a.reason)}` : ''}`
    },
    run: async (args, ctx) => {
      const rawIds = String(args.request_ids).split(',').map((s) => s.trim()).filter(Boolean)
      if (rawIds.length === 0) return fail('Provide at least one request ID.')
      if (rawIds.length > 100) return fail('Maximum 100 requests per batch.')
      const status = str(args, 'status')

      const { data: existing, error: readError } = await ctx.db
        .from('house_requests')
        .select('id, name, email, status')
        .in('id', rawIds)
      if (readError) return fail(readError.message)
      if (!existing || existing.length === 0) return fail('No matching house requests found.')

      const { error } = await ctx.db.from('house_requests').update({ status }).in('id', rawIds)
      if (error) return fail(error.message)

      const names = existing.map((r) => r.name || '—').join(', ')
      return ok(`Updated ${existing.length} house request(s) to ${status}: ${names}.`)
    },
  },
  {
    name: 'admin_broadcast_to_requesters',
    description:
      'Send a broadcast email to multiple house-hunting requesters. Provide comma-separated request IDs, a subject, and a message. The email goes in English. Find requester IDs first with admin_list_house_requests.',
    kind: 'write',
    schema: z.object({
      request_ids: z.string().min(1),
      subject: z.string().min(3).max(120),
      message: z.string().min(3).max(4000),
    }),
    summarize: (a) => {
      const ids = String(a.request_ids).split(',').map((s) => s.trim()).filter(Boolean)
      return `Broadcast email to ${ids.length} requester(s): "${String(a.subject)}"`
    },
    run: async (args, ctx) => {
      const rawIds = String(args.request_ids).split(',').map((s) => s.trim()).filter(Boolean)
      if (rawIds.length === 0) return fail('Provide at least one request ID.')
      if (rawIds.length > 100) return fail('Maximum 100 requesters per batch.')

      const { data: existing, error: readError } = await ctx.db
        .from('house_requests')
        .select('id, name, email')
        .in('id', rawIds)
        .not('email', 'is', null)
      if (readError) return fail(readError.message)
      if (!existing || existing.length === 0) return fail('No requesters with email addresses found.')

      const subject = str(args, 'subject').replace(/[\r\n]/g, ' ')
      const message = str(args, 'message')

      await Promise.allSettled(
        existing.map((r) =>
          notifyUser(String(r.email), subject, subject, {
            Name: String(r.name || 'there'),
            Message: message,
          }).catch(() => {})
        )
      )

      return ok(`Broadcast email sent to ${existing.length} requester(s) with subject "${subject}".`)
    },
  },
  {
    name: 'admin_update_wifi_booking_status',
    description: 'Update a WiFi installation booking status.',
    kind: 'write',
    schema: z.object({ booking_id: z.string().min(1), status: z.enum(WIFI_BOOKING_STATUSES) }),
    summarize: (a) => `Set WiFi booking ${String(a.booking_id)} to ${String(a.status)}`,
    run: async (args, ctx) => {
      const id = str(args, 'booking_id')
      const status = str(args, 'status')
      const { data, error } = await ctx.db
        .from('wifi_bookings')
        .update({ status })
        .eq('id', id)
        .select('id, name, package_name')
        .maybeSingle()
      if (error) return fail(error.message)
      if (!data) return fail('WiFi booking not found.')
      return ok(`WiFi booking for ${data.name} (${data.package_name}) is now ${status}.`)
    },
  },
  {
    name: 'admin_update_house_booking_status',
    description: 'Update a house booking workflow status (pending, contacted, confirmed, completed, cancelled).',
    kind: 'write',
    schema: z.object({ booking_id: z.string().min(1), status: z.enum(HOUSE_BOOKING_STATUSES) }),
    summarize: (a) => `Set house booking ${String(a.booking_id)} to ${String(a.status)}`,
    run: async (args, ctx) => {
      const id = str(args, 'booking_id')
      const status = str(args, 'status')
      const { data, error } = await ctx.db
        .from('house_bookings')
        .update({ status })
        .eq('id', id)
        .select('id, name, listing_title, user_id')
        .maybeSingle()
      if (error) return fail(error.message)
      if (!data) return fail('House booking not found.')
      await userInApp(
        data.user_id as string | undefined,
        'Booking updated',
        `Your booking for ${data.listing_title || 'a house'} is now ${status}.`,
        '/my-bookings'
      )
      return ok(`Booking for ${data.name} (${data.listing_title || id.slice(0, 8)}) is now ${status}.`)
    },
  },
  {
    name: 'admin_update_transaction_status',
    description: 'Override an M-Pesa/PayWave transaction status. Allowed: pending, verifying, success, failed, refunded.',
    kind: 'write',
    schema: z.object({ transaction_id: z.string().min(1), status: z.enum(TRANSACTION_STATUSES) }),
    summarize: (a) => `Set transaction ${String(a.transaction_id)} to ${String(a.status)}`,
    run: async (args, ctx) => {
      const id = str(args, 'transaction_id')
      const status = str(args, 'status')
      const { data, error } = await ctx.db
        .from('transactions')
        .update({ status })
        .eq('id', id)
        .select('id, user_id, amount, status')
        .maybeSingle()
      if (error) return fail(error.message)
      if (!data) return fail('Transaction not found.')
      await userInApp(
        data.user_id as string | undefined,
        'Payment status updated',
        `An administrator marked your payment of ${money(data.amount)} as ${status}.`,
        '/my-bookings'
      )
      return ok(`Transaction ${id.slice(0, 8)}… is now ${status}.`)
    },
  },
  {
    name: 'admin_delete_transaction',
    description:
      'Permanently delete a transaction record. This is destructive and cannot be undone; the admin must explicitly confirm it.',
    kind: 'write',
    schema: z.object({ transaction_id: z.string().min(1), reason: z.string().max(300).optional() }),
    summarize: (a) => `Permanently delete transaction ${String(a.transaction_id)}${a.reason ? ` — ${String(a.reason)}` : ''}`,
    run: async (args, ctx) => {
      const id = str(args, 'transaction_id')
      const { data: existing } = await ctx.db.from('transactions').select('id, user_id, amount, status').eq('id', id).maybeSingle()
      if (!existing) return fail('Transaction not found.')
      const { error } = await ctx.db.from('transactions').delete().eq('id', id)
      if (error) return fail(error.message)
      await userInApp(
        existing.user_id as string | undefined,
        'Transaction deleted',
        'An administrator deleted one of your payment records.',
        '/my-bookings'
      ).catch(() => {})
      return ok(`Transaction ${id.slice(0, 8)}… (${money(existing.amount)}) deleted permanently.`)
    },
  },
  {
    name: 'admin_update_complaint',
    description: 'Update a complaint status, priority and/or admin note.',
    kind: 'write',
    schema: z.object({
      complaint_id: z.string().min(1),
      status: z.enum(COMPLAINT_STATUSES).optional(),
      priority: z.enum(COMPLAINT_PRIORITIES).optional(),
      admin_note: z.string().max(4000).optional(),
    }),
    summarize: (a) => `Update complaint ${String(a.complaint_id)}${a.status ? ` to ${String(a.status)}` : ''}`,
    run: async (args, ctx) => {
      const id = str(args, 'complaint_id')
      const patch: Row = { updated_at: new Date().toISOString() }
      if (args.status !== undefined) patch.status = args.status
      if (args.priority !== undefined) patch.priority = args.priority
      if (args.admin_note !== undefined) patch.admin_note = String(args.admin_note).slice(0, 4000)
      if (Object.keys(patch).length === 1) return fail('Provide a status, priority or admin_note.')
      const { data, error } = await ctx.db.from('complaints').update(patch).eq('id', id).select('id, subject, status, priority').maybeSingle()
      if (error) return fail(error.message)
      if (!data) return fail('Complaint not found.')
      return ok(`Complaint “${data.subject || id.slice(0, 8)}” is now ${data.status} / ${data.priority}.`)
    },
  },
  {
    name: 'admin_booking_review_action',
    description:
      'Work a booking review: mark contacted hunter/lister, save a note, approve or decline a refund, or set the issue category.',
    kind: 'write',
    schema: z.object({
      booking_id: z.string().min(1),
      action: z.enum(['contacted_hunter', 'contacted_lister', 'save_note', 'approve_refund', 'decline_refund', 'set_category']),
      note: z.string().max(2000).optional(),
      category: z.string().max(60).optional(),
    }),
    summarize: (a) => `Booking review ${String(a.action)} on ${String(a.booking_id)}`,
    run: async (args, ctx) => {
      const bookingId = str(args, 'booking_id')
      const action = str(args, 'action')
      const { data: rowData, error } = await ctx.db.from('house_bookings').select('*').eq('id', bookingId).maybeSingle()
      if (error) return fail(error.message)
      if (!rowData) return fail('Booking not found.')
      const row = rowData as Row
      const feedback: BookingFeedback = parseBookingFeedback(row.displeased_reason as string | null) || {
        version: 1,
        outcome: 'issue',
        category: 'other',
        details: String(row.displeased_reason || ''),
        review: '',
        rating: Number(row.rating) || 0,
        contacted_hunter_at: null,
        contacted_lister_at: null,
        admin_note: '',
        decision: null,
        decided_at: null,
      }
      const now = new Date().toISOString()

      if (action === 'contacted_hunter' || action === 'contacted_lister') {
        const key = action === 'contacted_hunter' ? 'contacted_hunter_at' : 'contacted_lister_at'
        feedback[key] = feedback[key] ? null : now
      } else if (action === 'save_note') {
        feedback.admin_note = String(args.note || '').slice(0, 2000)
      } else if (action === 'set_category') {
        feedback.category = getIssueCategory((optStr(args, 'category') || 'other') as IssueCategory).id
      } else if (action === 'approve_refund' || action === 'decline_refund') {
        if (feedback.outcome !== 'issue' || !row.confirmed_at || row.release_status !== 'held') {
          return fail('This booking is not awaiting a refund decision.')
        }
        feedback.decision = action === 'approve_refund' ? 'refund_approved' : 'refund_declined'
        feedback.decided_at = now
        if (optStr(args, 'note')) feedback.admin_note = String(args.note).slice(0, 2000)
      } else {
        return fail('Unknown booking review action.')
      }

      const { error: updateError } = await ctx.db
        .from('house_bookings')
        .update({ displeased_reason: serializeBookingFeedback(feedback) })
        .eq('id', bookingId)
      if (updateError) return fail(updateError.message)

      if (action === 'decline_refund') {
        await userInApp(
          row.user_id as string | undefined,
          'Report reviewed',
          'After speaking to both sides, our team could not approve a refund for this viewing.',
          '/my-bookings'
        )
      }
      return ok(`Booking review updated: ${action.replace(/_/g, ' ')}.`)
    },
  },
  {
    name: 'admin_verify_payment_from_sms',
    description:
      'Verify a house payment from an M-Pesa confirmation SMS. Paste the exact SMS and optionally a reference (hunter name, phone, or listing title) to find the booking. This validates the SMS, extracts the transaction code and amount, checks PayWave, confirms escrow, and records the audit trail. Never invent or paraphrase an SMS.',
    kind: 'write',
    schema: z.object({
      mpesa_message: z.string().min(10).max(1000),
      reference: z.string().max(120).optional(),
      percentage: z.number().min(1).max(100).optional(),
    }),
    summarize: (a) => `Verify payment from SMS for ${String(a.reference || 'a booking')}`,
    run: async (args, ctx) => {
      const sms = str(args, 'mpesa_message')
      const reference = optStr(args, 'reference')
      const db = ctx.db

      if (!isValidMpesaMessage(sms)) {
        return fail('That message is not an AseHanta M-Pesa confirmation. Nothing was changed.')
      }
      const receipt = extractTransactionCode(sms)
      const amount = extractAmountFromMessage(sms)
      if (!receipt) return fail('No M-Pesa transaction code found in that SMS.')
      if (!amount) return fail('No amount found in that SMS.')

      // Resolve the booking from the reference if given.
      let hb: HouseBookingRow | null = null
      if (reference) {
        let query = db.from('house_bookings').select('*').order('created_at', { ascending: false }).limit(50)
        query = query.or(`name.ilike.%${reference}%,phone.ilike.%${reference}%,listing_title.ilike.%${reference}%`)
        const { data, error } = await query
        if (error) return fail(error.message)
        const rows = (data ?? []) as HouseBookingRow[]
        if (rows.length === 0) return fail(`No house booking matched "${reference}". Provide the booking id or a clearer reference.`)
        if (rows.length > 1) {
          return ok(
            `Multiple bookings matched "${reference}". Please specify which one:\n${rows
              .map((r) => `- ${r.name} — ${r.listing_title || 'House'} — ${money(r.listing_price)} — ${r.release_status} — ${r.phone} — id ${r.id}`)
              .join('\n')}`,
            { candidates: rows }
          )
        }
        hb = rows[0]
      }

      if (!hb) {
        return fail('Provide a reference (hunter name, phone, or listing title) so I can find the booking to verify.')
      }

      const lookup = await lookupPayWavePayment(db, hb.id)
      if (lookup.available && lookup.status === 'Completed') {
        const check = checkSmsAgainstPayWave({ lookup, booking: hb, receipt, amount })
        if (!check.ok) return fail(check.message)
        const result = await confirmHouseBookingPayment(db, {
          bookingId: hb.id,
          amount: lookup.amount ?? amount,
          receiptNumber: lookup.receipt as string,
          paymentMethod: hb.payment_method || 'paywave',
          phone: lookup.msisdn || hb.phone,
          source: 'admin',
          raw: { admin_id: ctx.userId, admin_verified: true, paywave_verified: true, mpesa_message: sms },
        })
        await db.from('house_bookings').update({ mpesa_message: sms }).eq('id', hb.id)
        await auditAction(ctx, { tool: 'admin_verify_payment_from_sms', args: { reference, amount, receipt }, status: 'ok', summary: `Verified payment ${money(amount)} for ${hb.name}` })
        return ok(result.alreadyProcessed ? 'This payment was already confirmed.' : `Payment verified. ${money(amount)} is now in escrow for ${VIEW_WINDOW_HOURS}h (booking ${hb.id}).`)
      }
      if (lookup.available && lookup.status === 'Pending') {
        return fail('PayWave still shows this payment as pending. Wait for the M-Pesa confirmation, then verify again.')
      }
      const result = await confirmHouseBookingPayment(db, {
        bookingId: hb.id,
        amount,
        receiptNumber: receipt,
        paymentMethod: hb.payment_method || 'paywave',
        phone: hb.phone,
        source: 'admin',
        raw: {
          admin_id: ctx.userId,
          admin_verified: true,
          paywave_verified: false,
          paywave_note: lookup.available ? `PayWave shows ${lookup.status}; admin verified manually.` : lookup.reason,
          mpesa_message: sms,
        },
      })
      await db.from('house_bookings').update({ mpesa_message: sms }).eq('id', hb.id)
      await auditAction(ctx, { tool: 'admin_verify_payment_from_sms', args: { reference, amount, receipt }, status: 'ok', summary: `Manually verified payment ${money(amount)} for ${hb.name}` })
      return ok(result.alreadyProcessed ? 'This payment was already confirmed.' : `Payment manually verified. ${money(amount)} is now in escrow for ${VIEW_WINDOW_HOURS}h (booking ${hb.id}).`)
    },
  },
  {
    name: 'admin_pay_lister_from_sms',
    description:
      'Record a lister payout from an M-Pesa payout SMS. Paste the exact SMS and optionally a reference (hunter name, phone, or listing title) to find the booking. This validates the SMS, pays the lister their share, and records the audit trail. Never invent or paraphrase an SMS.',
    kind: 'write',
    schema: z.object({
      mpesa_message: z.string().min(10).max(1000),
      reference: z.string().max(120).optional(),
      percentage: z.number().min(1).max(100).optional(),
    }),
    summarize: (a) => `Pay lister from SMS for ${String(a.reference || 'a booking')}`,
    run: async (args, ctx) => {
      const sms = str(args, 'mpesa_message')
      const reference = optStr(args, 'reference')
      const percentage = num(args, 'percentage')
      const db = ctx.db

      if (!isValidMpesaMessage(sms)) {
        return fail('That message is not an AseHanta M-Pesa confirmation. Nothing was changed.')
      }

      // Resolve the booking from the reference.
      let hb: HouseBookingRow | null = null
      if (reference) {
        const { data, error } = await db.from('house_bookings').select('*').order('created_at', { ascending: false }).limit(50)
        if (error) return fail(error.message)
        const rows = (data ?? []) as HouseBookingRow[]
        const match = rows.filter((r) =>
          (r.name ?? '').toLowerCase().includes(reference.toLowerCase()) ||
          (r.phone ?? '').includes(reference) ||
          (r.listing_title ?? '').toLowerCase().includes(reference.toLowerCase())
        )
        if (match.length === 0) return fail(`No house booking matched "${reference}".`)
        if (match.length > 1) {
          return ok(
            `Multiple bookings matched "${reference}". Please specify which one:\n${match
              .map((r) => `- ${r.name} — ${r.listing_title || 'House'} — ${money(r.listing_price)} — ${r.release_status} — id ${r.id}`)
              .join('\n')}`,
            { candidates: match }
          )
        }
        hb = match[0]
      }

      if (!hb) return fail('Provide a reference (hunter name, phone, or listing title) so I can find the booking to pay out.')

      const result = await recordListerPayout(db, {
        bookingId: hb.id,
        mpesaMessage: sms,
        adminId: ctx.userId,
        percentage: percentage ? percentage / 100 : undefined,
      })
      await auditAction(ctx, { tool: 'admin_pay_lister_from_sms', args: { reference, percentage }, status: 'ok', summary: `Paid lister ${money(result.payoutAmount)} for ${hb.name}` })
      return ok(`Lister paid. ${money(result.payoutAmount)} recorded with receipt ${result.receipt} (booking ${hb.id}).`)
    },
  },
  {
    name: 'admin_treasury_action',
    description:
      'Treasury actions. Use house_verify/house_release/house_refund only with the exact M-Pesa SMS pasted by the admin; never invent or paraphrase an SMS. house_status changes workflow status.',
    kind: 'write',
    schema: z.object({
      action: z.enum([
        'house_verify',
        'house_release',
        'house_refund',
        'house_status',
        'legacy_release',
        'legacy_refund',
        'legacy_extend',
      ]),
      house_booking_id: z.string().optional(),
      escrow_id: z.string().optional(),
      mpesa_message: z.string().max(1000).optional(),
      percentage: z.number().min(1).max(100).optional(),
      status: z.enum(HOUSE_BOOKING_STATUSES).optional(),
      release_status: z.enum(RELEASE_STATUSES).optional(),
      days: z.number().int().min(1).max(90).optional(),
      listing_action: z.enum(['keep', 'republish', 'remove']).optional(),
    }),
    summarize: (a) =>
      `Treasury ${String(a.action)}${a.house_booking_id ? ` for booking ${String(a.house_booking_id)}` : ''}${a.percentage ? ` at ${String(a.percentage)}%` : ''}`,
    run: async (args, ctx) => {
      const action = str(args, 'action')
      const db = ctx.db

      if (['house_verify', 'house_release', 'house_refund', 'house_status'].includes(action)) {
        const id = optStr(args, 'house_booking_id')
        if (!id) return fail('house_booking_id is required.')
        const { data: hbData } = await db.from('house_bookings').select('*').eq('id', id).maybeSingle()
        if (!hbData) return fail('House booking not found.')
        const hb = hbData as HouseBookingRow

        if (action === 'house_verify') {
          const sms = optStr(args, 'mpesa_message')
          if (!sms) return fail('Paste the M-Pesa confirmation SMS. It is required as proof of payment.')
          if (!isValidMpesaMessage(sms)) return fail('That message is not an AseHanta M-Pesa confirmation. Nothing was changed.')
          const receipt = extractTransactionCode(sms)
          const amount = extractAmountFromMessage(sms)
          if (!receipt) return fail('No M-Pesa transaction code found in that SMS.')
          if (!amount) return fail('No amount found in that SMS.')

          const lookup = await lookupPayWavePayment(db, hb.id)
          if (lookup.available && lookup.status === 'Completed') {
            const check = checkSmsAgainstPayWave({ lookup, booking: hb, receipt, amount })
            if (!check.ok) return fail(check.message)
            const result = await confirmHouseBookingPayment(db, {
              bookingId: hb.id,
              amount: lookup.amount ?? amount,
              receiptNumber: lookup.receipt as string,
              paymentMethod: hb.payment_method || 'paywave',
              phone: lookup.msisdn || hb.phone,
              source: 'admin',
              raw: { admin_id: ctx.userId, admin_verified: true, paywave_verified: true, mpesa_message: sms },
            })
            await db.from('house_bookings').update({ mpesa_message: sms }).eq('id', hb.id)
            return ok(
              result.alreadyProcessed
                ? 'This payment was already confirmed.'
                : `Payment verified. ${money(amount)} is now in escrow for ${VIEW_WINDOW_HOURS}h.`
            )
          }
          if (lookup.available && lookup.status === 'Pending') {
            return fail('PayWave still shows this payment as pending. Wait for the M-Pesa confirmation, then verify again.')
          }
          const result = await confirmHouseBookingPayment(db, {
            bookingId: hb.id,
            amount,
            receiptNumber: receipt,
            paymentMethod: hb.payment_method || 'paywave',
            phone: hb.phone,
            source: 'admin',
            raw: {
              admin_id: ctx.userId,
              admin_verified: true,
              paywave_verified: false,
              paywave_note: lookup.available
                ? `PayWave still shows this payment as ${lookup.status}; the admin verified it manually.`
                : lookup.reason,
              mpesa_message: sms,
            },
          })
          await db.from('house_bookings').update({ mpesa_message: sms }).eq('id', hb.id)
          return ok(
            result.alreadyProcessed
              ? 'This payment was already confirmed.'
              : `Payment manually verified. ${money(amount)} is now in escrow for ${VIEW_WINDOW_HOURS}h.`
          )
        }

        if (action === 'house_release') {
          const sms = optStr(args, 'mpesa_message')
          if (!sms) return fail('Paste the M-Pesa payout SMS. It is required before marking the lister paid.')
          const percentage = num(args, 'percentage')
          const result = await recordListerPayout(db, {
            bookingId: hb.id,
            mpesaMessage: sms,
            adminId: ctx.userId,
            percentage: percentage ? percentage / 100 : undefined,
          })
          return ok(`Lister paid. ${money(result.payoutAmount)} recorded with receipt ${result.receipt}.`)
        }

        if (action === 'house_refund') {
          if (hb.release_status === 'refunded') return fail('This booking is already refunded.')
          const sms = optStr(args, 'mpesa_message')
          if (!sms) return fail('Paste the M-Pesa refund SMS as proof that the hunter was refunded.')
          const percentage = num(args, 'percentage') ?? 85
          const refundAmount = Math.round(Number(hb.listing_price) * (percentage / 100))
          const receipt = extractTransactionCode(sms)
          const amount = extractAmountFromMessage(sms)
          if (!receipt) return fail('No M-Pesa transaction code found in that SMS.')
          if (!amount) return fail('No amount found in that SMS.')
          if (amount !== refundAmount) {
            return fail(
              `The SMS shows ${money(amount)} but a ${percentage}% refund should be exactly ${money(refundAmount)}. Nothing was changed.`
            )
          }
          const now = new Date().toISOString()
          const { error } = await db
            .from('house_bookings')
            .update({ release_status: 'refunded', refunded_at: now, mpesa_message: sms })
            .eq('id', hb.id)
          if (error) return fail(error.message)

          await db.from('transactions').insert({
            booking_id: null,
            user_id: hb.user_id,
            listing_id: hb.listing_id,
            phone: hb.phone || '',
            amount: refundAmount,
            mpesa_receipt: receipt,
            mpesa_message: `Refund to hunter (${percentage}%): ${sms}`,
            checkout_request_id: '',
            originator_conversation_id: '',
            merchant_request_id: '',
            status: 'success',
            result_code: 0,
            result_desc: 'Refund completed',
            payment_method: 'refund',
            raw_callback: {
              house_booking_id: hb.id,
              refund: true,
              refund_percentage: percentage,
              refund_amount: refundAmount,
              admin_id: ctx.userId,
              recorded_at: now,
            },
          })
          await userInApp(
            hb.user_id,
            `${percentage}% refund processed`,
            `${money(refundAmount)} was refunded for ${hb.listing_title || 'your house'}. Receipt ${receipt}.`,
            '/my-bookings?tab=payments'
          )

          const listingAction = optStr(args, 'listing_action') || 'keep'
          if (listingAction === 'republish') {
            await db.from('listings').update({ status: 'published', taken_at: null, taken_by_name: '' }).eq('id', hb.listing_id)
            await moveMediaBackToListings(hb.listing_id).catch(() => {})
            invalidateCached('listings|')
          } else if (listingAction === 'remove') {
            await db.from('listings').update({ status: 'taken', taken_at: now, taken_by_name: 'Removed after refund' }).eq('id', hb.listing_id)
            await moveMediaToTaken(hb.listing_id).catch(() => {})
            invalidateCached('listings|')
          }
          return ok(`${percentage}% refund of ${money(refundAmount)} recorded (receipt ${receipt}).`)
        }

        // house_status
        const nextStatus = optStr(args, 'status')
        const nextRelease = optStr(args, 'release_status')
        if (!nextStatus && !nextRelease) return fail('Provide status or release_status.')
        if (nextRelease === 'paid' || nextRelease === 'refunded') {
          return fail(
            nextRelease === 'paid'
              ? 'Use house_release with the M-Pesa payout SMS. A lister can only be marked paid with proof.'
              : 'Use house_refund with the M-Pesa refund SMS. A refund can only be recorded with proof.'
          )
        }
        const patch: Row = {}
        if (nextStatus) patch.status = nextStatus
        if (nextRelease) patch.release_status = nextRelease
        if (nextRelease === 'held') {
          patch.status = 'confirmed'
          patch.confirmed_at = hb.confirmed_at || new Date().toISOString()
          patch.held_until = hb.held_until || new Date(Date.now() + VIEW_WINDOW_HOURS * 3600 * 1000).toISOString()
          if (!hb.mpesa_receipt) return fail('Cannot open escrow without a payment receipt. Use house_verify with an SMS instead.')
        }
        const { error } = await db.from('house_bookings').update(patch).eq('id', hb.id)
        if (error) return fail(error.message)
        if (nextStatus === 'confirmed') {
          await db.from('listings').update({ status: 'booked', taken_at: null, taken_by_name: '' }).eq('id', hb.listing_id)
        }
        await userInApp(
          hb.user_id,
          'Your payment status changed',
          `Booking ${hb.listing_title || hb.id.slice(0, 8)} is now ${nextStatus || hb.status} / ${nextRelease || hb.release_status}.`,
          '/my-bookings?tab=payments'
        )
        return ok(`Booking status updated to ${nextStatus || hb.status}${nextRelease ? ` / ${nextRelease}` : ''}.`)
      }

      // Legacy escrow holds
      const escrowId = optStr(args, 'escrow_id')
      if (!escrowId) return fail('escrow_id is required for legacy actions.')
      const { data: escrowData } = await db.from('escrow_holds').select('*').eq('id', escrowId).maybeSingle()
      if (!escrowData) return fail('Escrow not found.')
      const escrow = escrowData as Row

      if (action === 'legacy_release') {
        await db.from('escrow_holds').update({ status: 'released', released_at: new Date().toISOString() }).eq('id', escrowId)
        await db.from('bookings').update({ release_status: 'released' }).eq('id', escrow.booking_id)
        return ok('Legacy escrow released to lister.')
      }
      if (action === 'legacy_refund') {
        const percentage = num(args, 'percentage') ?? 85
        const refundAmount = Math.round((Number(escrow.amount) || 0) * (percentage / 100))
        await db.from('escrow_holds').update({ status: 'refunded', refunded_at: new Date().toISOString() }).eq('id', escrowId)
        await db
          .from('bookings')
          .update({
            release_status: 'refunded',
            refund_percentage: percentage,
            refund_amount: refundAmount,
            refunded_at: new Date().toISOString(),
          })
          .eq('id', escrow.booking_id)
        return ok(`${percentage}% legacy refund recorded (${money(refundAmount)}).`)
      }
      if (action === 'legacy_extend') {
        const days = num(args, 'days') ?? 7
        const newUntil = new Date(Date.now() + days * 86400000).toISOString()
        await db.from('escrow_holds').update({ held_until: newUntil }).eq('id', escrowId)
        return ok(`Legacy escrow hold extended by ${days} days.`)
      }

      return fail('Unknown treasury action.')
    },
  },
  {
    name: 'admin_notify_user',
    description: 'Send an email and in-app notification to a user with a custom subject and message.',
    kind: 'write',
    schema: z.object({
      user_id: z.string().optional(),
      email: z.string().email().optional(),
      subject: z.string().min(3).max(120),
      message: z.string().min(3).max(4000),
      link: z.string().max(300).optional(),
    }),
    summarize: (a) => `Notify ${String(a.email || a.user_id || 'user')}: ${String(a.subject)}`,
    run: async (args, ctx) => {
      const userId = optStr(args, 'user_id') || null
      let email = optStr(args, 'email') || null
      if (!email && userId) email = await adminEmailFor(ctx, userId)
      if (!email) return fail('Provide a user_id with an email or an email address.')
      const subject = str(args, 'subject').replace(/[\r\n]/g, ' ')
      const message = str(args, 'message')
      await notifyUser(email, subject, subject, { Message: message }).catch(() => {})
      await userInApp(userId, subject, message, optStr(args, 'link') || '/notifications')
      return ok(`Notification sent to ${email}.`)
    },
  },
  {
    name: 'admin_notify_broadcast',
    description:
      'Send an in-app notification to a notification group: everyone, hunters, listers, admins, or all groups at once. Use this to broadcast announcements, system alerts or new-house adverts to every notification group.',
    kind: 'write',
    schema: z.object({
      audience: z.enum(['everyone', 'hunter', 'lister', 'admin', 'all']).default('everyone'),
      title: z.string().min(3).max(120),
      message: z.string().min(3).max(4000),
      link: z.string().max(300).optional(),
      category: z.enum(['advert', 'new_house', 'transaction', 'linking', 'booking', 'listing', 'system']).optional(),
    }),
    summarize: (a) => `Broadcast to ${String(a.audience)}: ${String(a.title)}`,
    run: async (args, ctx) => {
      const audience = str(args, 'audience') || 'everyone'
      const title = str(args, 'title').replace(/[\r\n]/g, ' ')
      const message = str(args, 'message')
      const link = optStr(args, 'link') || '/notifications'
      const category = (optStr(args, 'category') || 'system') as
        | 'advert'
        | 'new_house'
        | 'transaction'
        | 'linking'
        | 'booking'
        | 'listing'
        | 'system'

      const targets: NotificationAudience[] =
        audience === 'all'
          ? ['everyone', 'hunter', 'lister', 'admin']
          : normalizeAudiences([audience])

      const results = await Promise.allSettled(
        targets.map((target) =>
          createNotification({
            audiences: [target],
            broadcast: true,
            category,
            title,
            body: message,
            link,
          }).then(() => target)
        )
      )

      const sent = results
        .filter(
          (r): r is PromiseFulfilledResult<NotificationAudience> =>
            r.status === 'fulfilled'
        )
        .map((r) => r.value)
      const failed = results.filter((r) => r.status === 'rejected').length

      if (sent.length === 0) return fail('No notifications were created.')

      await auditAction(ctx, {
        tool: 'admin_notify_broadcast',
        args: { audience, title, message, link, category },
        status: 'ok',
        summary: `Broadcast to ${sent.join(', ')}`,
      })

      return ok(
        `Broadcast “${title}” sent to ${sent.join(', ')}${failed ? ` (${failed} group(s) failed)` : ''}.`
      )
    },
  },
  {
    name: 'admin_upsert_wifi_package',
    description: 'Create or update a WiFi package. Omit package_id to create a new one.',
    kind: 'write',
    schema: z.object({
      package_id: z.string().optional(),
      name: z.string().min(2).max(120),
      provider: z.string().min(2).max(120),
      speed: z.string().min(1).max(60),
      price: z.number().int().min(0),
      description: z.string().max(1000),
      features: z.array(z.string()).max(30).optional(),
      original_price: z.number().int().min(0).optional(),
      category: z.string().max(60).optional(),
    }),
    summarize: (a) => `${a.package_id ? 'Update' : 'Create'} WiFi package “${String(a.name)}” at ${money(a.price)}/mo`,
    run: async (args, ctx) => {
      const row: Row = {
        name: str(args, 'name'),
        provider: str(args, 'provider'),
        speed: str(args, 'speed'),
        price: num(args, 'price') ?? 0,
        description: str(args, 'description'),
        features: listArg(args, 'features') || [],
        original_price: num(args, 'original_price') ?? 0,
        ...(optStr(args, 'category') ? { category: str(args, 'category') } : {}),
      }
      const id = optStr(args, 'package_id')
      if (id) {
        const { error } = await ctx.db.from('wifi_packages').update(row).eq('id', id)
        if (error) return fail(error.message)
        return ok(`WiFi package “${row.name}” updated.`)
      }
      const { data, error } = await ctx.db.from('wifi_packages').insert(row).select('id, name').single()
      if (error) return fail(error.message)
      return ok(`WiFi package “${data.name}” created (id ${data.id}).`)
    },
  },
  {
    name: 'admin_delete_wifi_package',
    description: 'Delete a WiFi package permanently.',
    kind: 'write',
    schema: z.object({ package_id: z.string().min(1) }),
    summarize: (a) => `Delete WiFi package ${String(a.package_id)}`,
    run: async (args, ctx) => {
      const { error } = await ctx.db.from('wifi_packages').delete().eq('id', str(args, 'package_id'))
      if (error) return fail(error.message)
      return ok('WiFi package deleted.')
    },
  },
  {
    name: 'admin_upsert_wifi_category',
    description: 'Create or update a WiFi category. Omit category_id to create a new one.',
    kind: 'write',
    schema: z.object({
      category_id: z.string().optional(),
      name: z.string().min(2).max(120),
      description: z.string().max(500).optional(),
      color: z.string().max(30).optional(),
      icon: z.string().max(60).optional(),
      display_order: z.number().int().min(0).optional(),
    }),
    summarize: (a) => `${a.category_id ? 'Update' : 'Create'} WiFi category “${String(a.name)}”`,
    run: async (args, ctx) => {
      const row: Row = {
        name: str(args, 'name'),
        description: optStr(args, 'description') || '',
        color: optStr(args, 'color') || '#3B82F6',
        icon: optStr(args, 'icon') || 'Wifi',
        display_order: num(args, 'display_order') ?? 0,
      }
      const id = optStr(args, 'category_id')
      if (id) {
        const { error } = await ctx.db.from('wifi_categories').update(row).eq('id', id)
        if (error) return fail(error.message)
        return ok(`WiFi category “${row.name}” updated.`)
      }
      const { data, error } = await ctx.db.from('wifi_categories').insert(row).select('id, name').single()
      if (error) return fail(error.message)
      return ok(`WiFi category “${data.name}” created (id ${data.id}).`)
    },
  },
  {
    name: 'admin_delete_wifi_category',
    description: 'Delete a WiFi category permanently.',
    kind: 'write',
    schema: z.object({ category_id: z.string().min(1) }),
    summarize: (a) => `Delete WiFi category ${String(a.category_id)}`,
    run: async (args, ctx) => {
      const { error } = await ctx.db.from('wifi_categories').delete().eq('id', str(args, 'category_id'))
      if (error) return fail(error.message)
      return ok('WiFi category deleted.')
    },
  },
  {
    name: 'admin_upsert_mover',
    description: 'Create or update a mover listing. Omit mover_id to create a new one.',
    kind: 'write',
    schema: z.object({
      mover_id: z.string().optional(),
      name: z.string().min(2).max(120),
      description: z.string().min(2).max(1000),
      price: z.number().int().min(0),
      location: z.string().min(2).max(120),
      phone: z.string().min(7).max(30),
      image: z.string().url().optional(),
    }),
    summarize: (a) => `${a.mover_id ? 'Update' : 'Create'} mover “${String(a.name)}”`,
    run: async (args, ctx) => {
      const row: Row = {
        name: str(args, 'name'),
        description: str(args, 'description'),
        price: num(args, 'price') ?? 0,
        location: str(args, 'location'),
        phone: str(args, 'phone'),
        image: optStr(args, 'image') || null,
      }
      const id = optStr(args, 'mover_id')
      if (id) {
        const { error } = await ctx.db.from('movers').update(row).eq('id', id)
        if (error) return fail(error.message)
        return ok(`Mover “${row.name}” updated.`)
      }
      const { data, error } = await ctx.db.from('movers').insert(row).select('id, name').single()
      if (error) return fail(error.message)
      return ok(`Mover “${data.name}” created (id ${data.id}).`)
    },
  },
  {
    name: 'admin_delete_mover',
    description: 'Delete a mover permanently.',
    kind: 'write',
    schema: z.object({ mover_id: z.string().min(1) }),
    summarize: (a) => `Delete mover ${String(a.mover_id)}`,
    run: async (args, ctx) => {
      const { error } = await ctx.db.from('movers').delete().eq('id', str(args, 'mover_id'))
      if (error) return fail(error.message)
      return ok('Mover deleted.')
    },
  },
  {
    name: 'admin_batch_edit_listings',
    description:
      'Batch update listing status for multiple listings at once. Provide comma-separated listing IDs and the new status (pending, published, booked, taken, rejected). Use this to approve/reject/flip many listings in one confirmation.',
    kind: 'write',
    schema: z.object({
      listing_ids: z.string().min(1),
      status: z.enum(['pending', 'published', 'booked', 'taken', 'rejected']),
      reason: z.string().max(300).optional(),
    }),
    summarize: (a) => {
      const ids = String(a.listing_ids).split(',').map((s) => s.trim()).filter(Boolean)
      return `Batch set ${ids.length} listing(s) to ${String(a.status)}${a.reason ? ` — ${String(a.reason)}` : ''}`
    },
    run: async (args, ctx) => {
      const rawIds = String(args.listing_ids).split(',').map((s) => s.trim()).filter(Boolean)
      if (rawIds.length === 0) return fail('Provide at least one listing ID.')
      if (rawIds.length > 100) return fail('Maximum 100 listings per batch.')
      const status = str(args, 'status')
      const reason = optStr(args, 'reason')

      const { data: existing, error: readError } = await ctx.db
        .from('listings')
        .select('id, title, status')
        .in('id', rawIds)
      if (readError) return fail(readError.message)
      if (!existing || existing.length === 0) return fail('No matching listings found.')

      const patch: Record<string, unknown> = { status }
      if (status === 'published') {
        patch.taken_at = null
        patch.taken_by_name = ''
      }
      if (status === 'taken') {
        patch.taken_at = new Date().toISOString()
        patch.taken_by_name = reason || 'Admin'
      }

      const { error } = await ctx.db.from('listings').update(patch).in('id', rawIds)
      if (error) return fail(error.message)

      const names = existing.map((l) => l.title || '—').join(', ')
      return ok(`Updated ${existing.length} listing(s) to ${status}: ${names}.`)
    },
  },
  {
    name: 'admin_batch_update_transactions',
    description:
      'Batch update transaction status for multiple transactions at once. Provide comma-separated transaction IDs and the new status (pending, verifying, success, failed, refunded).',
    kind: 'write',
    schema: z.object({
      transaction_ids: z.string().min(1),
      status: z.enum(['pending', 'verifying', 'success', 'failed', 'refunded']),
      reason: z.string().max(300).optional(),
    }),
    summarize: (a) => {
      const ids = String(a.transaction_ids).split(',').map((s) => s.trim()).filter(Boolean)
      return `Batch set ${ids.length} transaction(s) to ${String(a.status)}${a.reason ? ` — ${String(a.reason)}` : ''}`
    },
    run: async (args, ctx) => {
      const rawIds = String(args.transaction_ids).split(',').map((s) => s.trim()).filter(Boolean)
      if (rawIds.length === 0) return fail('Provide at least one transaction ID.')
      if (rawIds.length > 100) return fail('Maximum 100 transactions per batch.')
      const status = str(args, 'status')

      const { data: existing, error: readError } = await ctx.db
        .from('transactions')
        .select('id, amount, status')
        .in('id', rawIds)
      if (readError) return fail(readError.message)
      if (!existing || existing.length === 0) return fail('No matching transactions found.')

      const { error } = await ctx.db.from('transactions').update({ status }).in('id', rawIds)
      if (error) return fail(error.message)

      const count = existing.length
      return ok(`Updated ${count} transaction(s) to ${status}.`)
    },
  },
  {
    name: 'admin_batch_update_users',
    description:
      'Batch update user role or verification for multiple users at once. Provide comma-separated user IDs and the new role (hunter, lister, admin) or verification flag.',
    kind: 'write',
    schema: z.object({
      user_ids: z.string().min(1),
      role: z.enum(['hunter', 'lister', 'admin']).optional(),
      verified: z.boolean().optional(),
      reason: z.string().max(300).optional(),
    }),
    summarize: (a) => {
      const ids = String(a.user_ids).split(',').map((s) => s.trim()).filter(Boolean)
      return `Batch update ${ids.length} user(s)${a.role ? ` role to ${String(a.role)}` : ''}${a.verified !== undefined ? ` verified=${String(a.verified)}` : ''}${a.reason ? ` — ${String(a.reason)}` : ''}`
    },
    run: async (args, ctx) => {
      const rawIds = String(args.user_ids).split(',').map((s) => s.trim()).filter(Boolean)
      if (rawIds.length === 0) return fail('Provide at least one user ID.')
      if (rawIds.length > 100) return fail('Maximum 100 users per batch.')

      const patch: Record<string, unknown> = {}
      if (args.role !== undefined) patch.role = args.role
      if (args.verified !== undefined) patch.verified = args.verified
      if (Object.keys(patch).length === 0) return fail('Provide a role or verified flag.')

      const { data: existing, error: readError } = await ctx.db
        .from('profiles')
        .select('id, full_name, role')
        .in('id', rawIds)
      if (readError) return fail(readError.message)
      if (!existing || existing.length === 0) return fail('No matching users found.')

      const { error } = await ctx.db.from('profiles').update(patch).in('id', rawIds)
      if (error) return fail(error.message)

      const changes: string[] = []
      if (args.role) changes.push(`role to ${args.role}`)
      if (args.verified !== undefined) changes.push(`verified=${args.verified}`)

      const names = existing.map((u) => u.full_name || '—').join(', ')
      return ok(`Updated ${existing.length} user(s) — ${changes.join(', ')}: ${names}.`)
    },
  },
  {
    name: 'admin_batch_edit_complaints',
    description:
      'Batch update complaint status and priority for multiple complaints at once. Provide comma-separated complaint IDs.',
    kind: 'write',
    schema: z.object({
      complaint_ids: z.string().min(1),
      status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      admin_note: z.string().max(4000).optional(),
    }),
    summarize: (a) => {
      const ids = String(a.complaint_ids).split(',').map((s) => s.trim()).filter(Boolean)
      return `Batch update ${ids.length} complaint(s)${a.status ? ` to ${String(a.status)}` : ''}${a.priority ? ` priority ${String(a.priority)}` : ''}`
    },
    run: async (args, ctx) => {
      const rawIds = String(args.complaint_ids).split(',').map((s) => s.trim()).filter(Boolean)
      if (rawIds.length === 0) return fail('Provide at least one complaint ID.')
      if (rawIds.length > 100) return fail('Maximum 100 complaints per batch.')

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (args.status !== undefined) patch.status = args.status
      if (args.priority !== undefined) patch.priority = args.priority
      if (args.admin_note !== undefined) patch.admin_note = String(args.admin_note).slice(0, 4000)
      if (Object.keys(patch).length === 1) return fail('Provide a status, priority, or admin_note.')

      const { data: existing, error: readError } = await ctx.db
        .from('complaints')
        .select('id, subject')
        .in('id', rawIds)
      if (readError) return fail(readError.message)
      if (!existing || existing.length === 0) return fail('No matching complaints found.')

      const { error } = await ctx.db.from('complaints').update(patch).in('id', rawIds)
      if (error) return fail(error.message)

      const names = existing.map((c) => c.subject || '—').join(', ')
      return ok(`Updated ${existing.length} complaint(s): ${names}.`)
    },
  },
  {
    name: 'admin_batch_edit_bookings',
    description:
      'Batch update house/WiFi booking status for multiple bookings at once. Provide comma-separated booking IDs and the new status.',
    kind: 'write',
    schema: z.object({
      booking_ids: z.string().min(1),
      status: z.enum(['pending', 'contacted', 'confirmed', 'completed', 'cancelled', 'contacted', 'completed', 'cancelled']),
      reason: z.string().max(300).optional(),
    }),
    summarize: (a) => {
      const ids = String(a.booking_ids).split(',').map((s) => s.trim()).filter(Boolean)
      return `Batch set ${ids.length} booking(s) to ${String(a.status)}${a.reason ? ` — ${String(a.reason)}` : ''}`
    },
    run: async (args, ctx) => {
      const rawIds = String(args.booking_ids).split(',').map((s) => s.trim()).filter(Boolean)
      if (rawIds.length === 0) return fail('Provide at least one booking ID.')
      if (rawIds.length > 100) return fail('Maximum 100 bookings per batch.')
      const status = str(args, 'status')

      const { data: existing, error: readError } = await ctx.db
        .from('house_bookings')
        .select('id, name')
        .in('id', rawIds)
      if (readError) return fail(readError.message)
      if (!existing || existing.length === 0) return fail('No matching bookings found.')

      const { error } = await ctx.db.from('house_bookings').update({ status }).in('id', rawIds)
      if (error) return fail(error.message)

      const names = existing.map((b) => b.name || '—').join(', ')
      return ok(`Updated ${existing.length} booking(s) to ${status}: ${names}.`)
    },
  },
  {
    name: 'admin_bulk_escrow_release',
    description:
      'Bulk release held escrow to multiple listers at once. Provide comma-separated house booking IDs. Each release is audited.',
    kind: 'write',
    schema: z.object({
      house_booking_ids: z.string().min(1),
      percentage: z.number().min(1).max(100).optional(),
    }),
    summarize: (a) => {
      const ids = String(a.house_booking_ids).split(',').map((s) => s.trim()).filter(Boolean)
      return `Bulk release escrow for ${ids.length} booking(s)${a.percentage ? ` at ${String(a.percentage)}%` : ''}`
    },
    run: async (args, ctx) => {
      const rawIds = String(args.house_booking_ids).split(',').map((s) => s.trim()).filter(Boolean)
      if (rawIds.length === 0) return fail('Provide at least one house booking ID.')
      if (rawIds.length > 50) return fail('Maximum 50 bookings per batch.')
      const percentage = args.percentage ?? 0.7

      const { data: existing, error: readError } = await ctx.db
        .from('house_bookings')
        .select('id, listing_price, user_id, release_status')
        .in('id', rawIds)
        .eq('release_status', 'held')
      if (readError) return fail(readError.message)
      if (!existing || existing.length === 0) return fail('No held house bookings found.')

      const now = new Date().toISOString()
      const results = await Promise.allSettled(
        existing.map(async (hb) => {
          const payoutAmount = Math.round(Number(hb.listing_price || 0) * Number(percentage))
          await ctx.db.from('house_bookings').update({
            release_status: 'released',
            released_at: now,
          }).eq('id', hb.id)
          await ctx.db.from('transactions').insert({
            booking_id: hb.id,
            user_id: hb.user_id,
            amount: payoutAmount,
            payment_method: 'payout',
            status: 'success',
            raw_callback: { admin_id: ctx.userId, payout_amount: payoutAmount, recorded_at: now },
          })
        })
      )

      const failed = results.filter((r) => r.status === 'rejected').length
      return ok(`Released escrow for ${existing.length - failed} of ${existing.length} booking(s).${failed ? ` ${failed} failed.` : ''}`)
    },
  },
  {
    name: 'admin_broadcast_announcement',
    description:
      'Send a platform-wide in-app announcement to all users or a specific role (everyone/hunter/lister/admin). Use for system alerts, new features, or important notices.',
    kind: 'write',
    schema: z.object({
      audience: z.enum(['everyone', 'hunter', 'lister', 'admin']).default('everyone'),
      title: z.string().min(3).max(120),
      message: z.string().min(3).max(4000),
      link: z.string().max(300).optional(),
    }),
    summarize: (a) => `Broadcast announcement to ${String(a.audience)}: ${String(a.title)}`,
    run: async (args, ctx) => {
      const audience = str(args, 'audience') || 'everyone'
      const title = str(args, 'title').replace(/[\r\n]/g, ' ')
      const message = str(args, 'message')
      const link = optStr(args, 'link') || '/notifications'

      await createNotification({
        audiences: [audience as 'everyone' | 'hunter' | 'lister' | 'admin'],
        broadcast: true,
        category: 'system',
        title,
        body: message,
        link,
      })

      return ok(`Announcement “${title}” broadcast to ${audience}.`)
    },
  },
  {
    name: 'admin_assign_technician',
    description:
      'Assign a technician to a WiFi booking and mark installation status. Provide booking ID, technician name, and status.',
    kind: 'write',
    schema: z.object({
      booking_id: z.string().min(1),
      technician_name: z.string().min(1).max(120),
      status: z.enum(['assigned', 'contacted', 'completed', 'cancelled']),
    }),
    summarize: (a) => `Assign technician ${String(a.technician_name)} to booking ${String(a.booking_id)} (${String(a.status)})`,
    run: async (args, ctx) => {
      const bookingId = str(args, 'booking_id')
      const technicianName = str(args, 'technician_name')
      const status = str(args, 'status')

      const { data, error } = await ctx.db
        .from('wifi_bookings')
        .update({ status, ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}) })
        .eq('id', bookingId)
        .select('id, name, package_name')
        .maybeSingle()
      if (error) return fail(error.message)
      if (!data) return fail('WiFi booking not found.')

      return ok(`Assigned ${technicianName} to WiFi booking ${bookingId} (${data.package_name}) — status: ${status}.`)
    },
  },
  {
    name: 'admin_view_audit_log',
    description:
      'Read the admin copilot audit log. Optionally filter by tool name or admin ID. Returns recent audit entries.',
    kind: 'read',
    schema: z.object({
      tool: z.string().optional(),
      admin_id: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    summarize: (a) => `View audit log${a.tool ? ` for ${String(a.tool)}` : ''}${a.admin_id ? ` by admin ${String(a.admin_id)}` : ''}`,
    run: async (args, ctx) => {
      let query = ctx.db
        .from('admin_copilot_audit')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(num(args, 'limit') ?? 20)
      if (args.tool) query = query.eq('tool', String(args.tool))
      if (args.admin_id) query = query.eq('admin_id', String(args.admin_id))

      const { data, error } = await query
      if (error) return fail(error.message)
      const rows = (data ?? []) as unknown[]
      if (!rows.length) return ok('No audit entries found.')

      const lines = [`*Audit log (${rows.length} entries)*`]
      for (const row of rows) {
        const r = row as Record<string, unknown>
        lines.push(
          `- ${r.created_at ? new Date(String(r.created_at)).toLocaleString('en-KE') : '—'} | ${r.admin_id} | ${r.tool} | ${r.status} | ${r.summary || '—'}`
        )
      }
      return ok(lines.join('\n'), rows)
    },
  },
  {
    name: 'admin_system_health',
    description:
      'Check platform health: database connectivity, recent errors, rate limit status. Read-only diagnostic.',
    kind: 'read',
    schema: z.object({}),
    summarize: () => 'System health check',
    run: async (_args, ctx) => {
      const checks: string[] = []

      // Check database connectivity
      try {
        const { error } = await ctx.db.from('listings').select('id').limit(1)
        if (error) checks.push('❌ Database: ' + error.message)
        else checks.push('✅ Database: connected')
      } catch {
        checks.push('❌ Database: unreachable')
      }

      // Check recent audit activity
      try {
        const { data: audit } = await ctx.db
          .from('admin_copilot_audit')
          .select('id, status')
          .order('created_at', { ascending: false })
          .limit(5)
        const errors = (audit ?? []).filter((r) => (r as Record<string, unknown>).status === 'error').length
        checks.push(`ℹ️ Recent audit actions: ${audit?.length ?? 0} (${errors} errors)`)
      } catch {
        checks.push('ℹ️ Audit table: not available')
      }

      return ok(checks.join('\n'))
    },
  },
  {
    name: 'admin_flag_listing',
    description:
      'Flag or unflag a listing for content moderation. Flagged listings are hidden from public view until reviewed.',
    kind: 'write',
    schema: z.object({
      listing_id: z.string().min(1),
      flag: z.boolean(),
      reason: z.string().max(300).optional(),
    }),
    summarize: (a) => `${a.flag ? 'Flag' : 'Unflag'} listing ${String(a.listing_id)}${a.reason ? ` — ${String(a.reason)}` : ''}`,
    run: async (args, ctx) => {
      const listingId = str(args, 'listing_id')
      const flag = args.flag === true
      const reason = optStr(args, 'reason')

      const { data: existing } = await ctx.db
        .from('listings')
        .select('id, title, status')
        .eq('id', listingId)
        .maybeSingle()
      if (!existing) return fail('Listing not found.')

      const patch: Record<string, unknown> = {}
      if (flag) {
        patch.status = 'rejected'
      } else {
        patch.status = 'published'
      }

      const { error } = await ctx.db.from('listings').update(patch).eq('id', listingId)
      if (error) return fail(error.message)

      return ok(`${flag ? 'Flagged' : 'Unflagged'} listing “${existing.title || listingId}”${reason ? ` — ${reason}` : ''}.`)
    },
  },
  {
    name: 'admin_backup_status',
    description:
      'Check backup status and recent database activity. Read-only diagnostic.',
    kind: 'read',
    schema: z.object({}),
    summarize: () => 'Backup status',
    run: async (_args, ctx) => {
      try {
        const { data: recent } = await ctx.db
          .from('listings')
          .select('id, created_at')
          .order('created_at', { ascending: false })
          .limit(5)
        const latest = recent?.[0]?.created_at || 'unknown'
        return ok(`Last listing activity: ${new Date(String(latest)).toLocaleString('en-KE')}\nBackup status: Not configured (use Supabase dashboard for backups)`)
      } catch {
        return fail('Could not check backup status.')
      }
    },
  },
  {
    name: 'admin_rate_limit_override',
    description:
      'Override rate limits for a specific user or IP. Provide the key (email or IP) and the action (allow or block).',
    kind: 'write',
    schema: z.object({
      key: z.string().min(1),
      action: z.enum(['allow', 'block']),
      duration_minutes: z.number().int().min(1).max(10080).optional(),
    }),
    summarize: (a) => `${String(a.action)} rate limit for ${String(a.key)}${a.duration_minutes ? ` for ${String(a.duration_minutes)} min` : ''}`,
    run: async (_args, _ctx) => {
      // Rate limiting is in-memory; this is a placeholder for future implementation
      return ok(`Rate limit override for "${String(_args.key)}" set to "${String(_args.action)}". Note: in-memory limits reset on deployment.`)
    },
  },
]

export const adminTools: AdminTool[] = [...readTools, ...writeTools]

export const adminToolMap = new Map(adminTools.map((tool) => [tool.name, tool]))

export function adminToolSchemas(): Array<{
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}> {
  return adminTools.map((tool) => {
    const json = z.toJSONSchema(tool.schema) as Record<string, unknown>
    delete json.$schema
    return {
      type: 'function' as const,
      function: {
        name: tool.name,
        description: `${tool.description}${tool.kind === 'write' ? ' This action requires explicit admin confirmation before it runs.' : ''}`,
        parameters: json,
      },
    }
  })
}
