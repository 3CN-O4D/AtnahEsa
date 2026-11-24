/**
 * Regression test for the status auto-post path.
 *
 * Runs the real marketing/control/status modules against mocked Supabase and
 * Baileys sockets. It proves that `mode: 'auto'` no longer throws before the
 * draft is sent, that the Statuses approval toggle is authoritative, and that
 * freshly loaded admin numbers become status recipients.
 */

import assert from 'node:assert/strict'
import { createControl } from '../lib/control.mjs'
import { createMarketing } from '../lib/marketing.mjs'
import { createStatus } from '../lib/status.mjs'

const ADMIN_PHONE = '254726498682'

const CONTROL = {
  id: 1,
  mode: 'autonomous',
  require_approval: false,
  marketing_enabled: true,
  allowlist: [],
  blocklist: [],
  status_interval_minutes: 60,
  group_interval_minutes: 60,
  status_daily_limit: 6,
  group_daily_limit: 3,
  last_status_at: null,
  last_group_at: null,
}

const makeSettings = (requireApproval) => ({
  id: 1,
  mode: 'auto',
  interval_minutes: 60,
  daily_limit: 6,
  quiet_hours: { enabled: false, start: '22:00', end: '06:00' },
  templates: {},
  topics: [],
  random_pool: [],
  no_repeat_window: 10,
  event_hooks: {
    new_listing: false,
    released: false,
    paid: false,
    booking_confirmed: false,
  },
  require_approval: requireApproval,
  last_event_at: null,
})

function createSupabaseMock({ settings, draft }) {
  const updates = []
  const inserted = []
  const controlRow = { ...CONTROL }
  const settingsRow = { ...settings }
  let queued = { ...draft }

  function resultFor(state) {
    const { table, op, filters, payload } = state

    if (op === 'update') {
      if (!state.recorded) {
        state.recorded = true
        updates.push({ table, payload: { ...payload }, filters: { ...filters } })
      }
      if (table === 'whatsapp_marketing') {
        queued = { ...queued, ...payload }
        return { data: { ...queued }, error: null }
      }
      if (table === 'whatsapp_bot_control') {
        Object.assign(controlRow, payload)
        return { data: { ...controlRow }, error: null }
      }
      if (table === 'whatsapp_status_settings') {
        Object.assign(settingsRow, payload)
        return { data: { ...settingsRow }, error: null }
      }
      return { data: null, error: null }
    }

    if (op === 'insert') {
      inserted.push({ table, payload })
      if (table === 'whatsapp_marketing') return { data: { ...payload, id: 'generated-status' }, error: null }
      return { data: { id: `inserted-${inserted.length}` }, error: null }
    }

    if (op === 'delete') return { data: null, error: null }

    if (op === 'select') {
      if (state.count) return { data: null, count: 0, error: null }

      switch (table) {
        case 'whatsapp_bot_control':
          return { data: { ...controlRow }, error: null }
        case 'whatsapp_status_settings':
          return { data: { ...settingsRow }, error: null }
        case 'whatsapp_status_overrides':
        case 'whatsapp_sessions':
        case 'whatsapp_outbox':
          return { data: [], error: null }
        case 'listings':
          return { data: null, error: null }
        case 'whatsapp_marketing':
          return { data: [], error: null }
        default:
          return { data: [], error: null }
      }
    }

    return { data: null, error: null }
  }

  function from(table) {
    const state = {
      table,
      op: null,
      filters: {},
      payload: null,
      count: false,
      limit: null,
      recorded: false,
    }
    const chain = {}

    chain.select = (fields, options) => {
      state.op = state.op || 'select'
      state.fields = fields
      if (options?.count) state.count = true
      return chain
    }
    chain.insert = (payload) => {
      state.op = 'insert'
      state.payload = payload
      return chain
    }
    chain.update = (payload) => {
      state.op = 'update'
      state.payload = payload
      return chain
    }
    chain.delete = () => {
      state.op = 'delete'
      return chain
    }
    for (const method of ['eq', 'gte', 'lte', 'lt', 'neq', 'in', 'not']) {
      chain[method] = (key, value) => {
        state.filters[key] = value
        return chain
      }
    }
    chain.order = () => chain
    chain.limit = (value) => {
      state.limit = value
      return chain
    }
    chain.maybeSingle = () => chain
    chain.single = () => chain
    chain.then = (resolve, reject) => Promise.resolve(resultFor(state)).then(resolve, reject)

    return chain
  }

  return {
    from,
    updates,
    inserted,
    get queued() {
      return queued
    },
  }
}

async function runCase({ requireApproval, adminNumbers }) {
  const draft = {
    id: 'draft-1',
    channel: 'status',
    body: 'AseHanta test status',
    template: 'ai',
    status: 'approved',
    listing_id: null,
    image_url: null,
    target_jid: null,
    meta: { headline: 'Test house', scopes: [] },
  }

  const supabase = createSupabaseMock({ settings: makeSettings(requireApproval), draft })
  const sent = []
  const logLines = []
  const log = {
    log: (...args) => logLines.push(['log', ...args]),
    warn: (...args) => logLines.push(['warn', ...args]),
    error: (...args) => logLines.push(['error', ...args]),
    info: (...args) => logLines.push(['info', ...args]),
  }

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).includes('/api/whatsapp/marketing/generate')) {
      return new Response(JSON.stringify({ draft: { ...draft } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('', { status: 404 })
  }

  try {
    const control = createControl(supabase, { log })
    const status = createStatus(supabase, { log })
    const marketing = createMarketing({
      supabase,
      control,
      status,
      apiUrl: 'https://example.invalid',
      secret: 'test-secret',
      ownPhone: () => '254748275079',
      adminNumbers,
      sendText: async () => {},
      log,
    })

    const sock = {
      sendMessage: async (jid, content, options) => {
        sent.push({ jid, content, options })
        return { key: { id: 'status-1' } }
      },
    }

    await marketing.tick(sock)
  } finally {
    globalThis.fetch = originalFetch
  }

  return { sent, logLines, updates: supabase.updates, queued: supabase.queued }
}

const autoSend = await runCase({ requireApproval: false, adminNumbers: () => [ADMIN_PHONE] })
assert.equal(
  autoSend.sent.length,
  1,
  `auto status should send once; logs: ${JSON.stringify(autoSend.logLines)}`
)
assert.equal(autoSend.sent[0].jid, 'status@broadcast')
assert.equal(autoSend.sent[0].options.broadcast, true)
assert.ok(
  autoSend.sent[0].options.statusJidList.includes(`${ADMIN_PHONE}@s.whatsapp.net`),
  'freshly loaded admin numbers must be status recipients'
)
assert.ok(
  autoSend.updates.some((entry) => entry.table === 'whatsapp_marketing' && entry.payload.status === 'sent'),
  'queued status must be marked sent after Baileys accepts it'
)
assert.ok(
  !autoSend.logLines.some((line) => String(line.join(' ')).includes('settings is not defined')),
  'auto mode must not reference the block-scoped settings variable'
)

const approval = await runCase({ requireApproval: true, adminNumbers: () => [ADMIN_PHONE] })
assert.equal(approval.sent.length, 0, 'approval-on auto status must wait in the queue')
assert.ok(
  approval.updates.some((entry) => entry.table === 'whatsapp_marketing' && entry.payload.status === 'draft'),
  'the Statuses require-approval toggle must override the legacy control mode'
)
assert.ok(approval.queued.expires_at, 'queued status needs a 24h expiry')

console.log('STATUS_AUTOPOST_OK')
