import { randomInt } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { findAuthUserByEmail } from '@/lib/supabase/admin-users'
import { createNotification } from '@/lib/notifications'
import { notifyAdmins } from '@/lib/notify'
import { sendOtpEmail } from '@/lib/email'
import { findValidOtp, recordOtpFailure } from '@/lib/otp'
import { checkRateLimit } from '@/lib/rate-limit'
import { WIFI_INSTALLATION_FEE, WHATSAPP_NUMBER } from '@/lib/constants'
import {
  canonicalWhatsAppContact,
  getWhatsAppLink,
  isValidPhone,
  parseWhatsAppContact,
} from '@/lib/whatsapp'
import { extractRentRange } from './houseSearch'
import type { AdminAlert, ChatAction, ChatState } from './types'

/**
 * Schema-driven submissions for Ase.
 *
 * The old chat used hand-written step machines (name → email → phone …) which
 * got stuck when someone answered two questions at once or typed an email in a
 * sentence. Instead the AI collects details naturally and calls `submit_form`
 * with whatever it has. This module validates/coerces the values, keeps the
 * partial draft server-side, and tells the model exactly what is still missing.
 * No wizard, no loop, no hard-coded off-topic replies.
 */

export type FormId =
  | 'house_request'
  | 'wifi_booking'
  | 'mover_request'
  | 'house_booking'
  | 'complaint'

export type FieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'number'
  | 'integer'
  | 'enum'
  | 'list'
  | 'boolean'

export interface FormField {
  key: string
  label: string
  type: FieldType
  required?: boolean
  /** Natural-language hint the model can use when asking for the field. */
  description: string
  example?: string
  enumValues?: string[]
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
}

export interface FormDefinition {
  id: FormId
  title: string
  description: string
  fields: FormField[]
}

export interface FormValidation {
  ok: boolean
  data: Record<string, unknown>
  missing: string[]
  invalid: Array<{ field: string; message: string }>
}

export interface FormSubmitResult {
  ok: boolean
  text: string
  /** Structured result for the model (missing/invalid/saved values). */
  data?: Record<string, unknown>
  adminAlert?: AdminAlert
  actions?: ChatAction[]
  /** State patch the chat engine should keep for the next turn. */
  state?: Partial<ChatState>
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const DESIGN_ALIASES: Record<string, string> = {
  bedsitter: 'bedsitter',
  'bed sitter': 'bedsitter',
  bedsit: 'bedsitter',
  single: 'bedsitter',
  'single room': 'bedsitter',
  studio: 'studio',
  '1br': '1br',
  '1 br': '1br',
  '1 bedroom': '1br',
  'one bedroom': '1br',
  'one bed': '1br',
  '1bed': '1br',
  '2br': '2br',
  '2 br': '2br',
  '2 bedroom': '2br',
  'two bedroom': '2br',
  'two bed': '2br',
  '2bed': '2br',
  '3br': '3br',
  '3 br': '3br',
  '3 bedroom': '3br',
  'three bedroom': '3br',
  'three bed': '3br',
  '3bed': '3br',
  bungalow: 'bungalow',
  maisonette: 'bungalow',
  apartment: 'apartment',
  flat: 'apartment',
  townhouse: 'townhouse',
  town: 'townhouse',
}

const WATER_ALIASES: Record<string, string> = {
  included: 'included',
  inclusive: 'included',
  'water included': 'included',
  'rent inclusive': 'included',
  'rent included': 'included',
  'own borehole': 'own_borehole',
  borehole: 'own_borehole',
  own_borehole: 'own_borehole',
  either: 'either',
  any: 'either',
  open: 'either',
}

const TOKEN_ALIASES: Record<string, string> = {
  self: 'self',
  'self contained': 'self',
  'self-contained': 'self',
  selfcontained: 'self',
  inclusive: 'inclusive',
  included: 'inclusive',
  either: 'either',
  any: 'either',
  open: 'either',
}

const COMPLAINT_CATEGORIES = ['complaint', 'bug', 'payment', 'listing', 'account', 'feature', 'other'] as const

const CATEGORY_ALIASES: Record<string, string> = {
  complaint: 'complaint',
  issue: 'complaint',
  problem: 'complaint',
  bug: 'bug',
  error: 'bug',
  payment: 'payment',
  mpesa: 'payment',
  'm-pesa': 'payment',
  refund: 'payment',
  listing: 'listing',
  house: 'listing',
  account: 'account',
  login: 'account',
  feature: 'feature',
  suggestion: 'feature',
  request: 'feature',
  other: 'other',
}

export const FORMS: Record<FormId, FormDefinition> = {
  house_request: {
    id: 'house_request',
    title: 'House request',
    description:
      'A hunter wants AseHanta to find them a house. Collect only what they want to share; email, phone and location are required.',
    fields: [
      { key: 'name', label: 'Full name', type: 'text', required: true, minLength: 2, description: 'The person’s full name', example: 'Jane Wanjiku' },
      { key: 'email', label: 'Email', type: 'email', required: true, description: 'Email address for updates', example: 'jane@example.com' },
      { key: 'phone', label: 'Phone', type: 'phone', required: true, description: 'Phone number, e.g. 0712 345 678', example: '0712345678' },
      { key: 'whatsapp', label: 'WhatsApp contact', type: 'text', required: false, description: 'WhatsApp number or @username. Defaults to the phone number.', example: 'same as phone' },
      { key: 'location', label: 'Area / town', type: 'text', required: true, minLength: 2, description: 'Where they want the house', example: 'Kipkaren, Eldoret' },
      { key: 'min_rent', label: 'Minimum rent', type: 'number', required: false, description: 'Lowest monthly rent they will consider', example: '15000' },
      { key: 'max_rent', label: 'Maximum rent', type: 'number', required: false, description: 'Highest monthly rent they will consider', example: '25000' },
      { key: 'house_designs', label: 'House type', type: 'list', required: false, description: 'One or more of bedsitter, studio, 1br, 2br, 3br, bungalow, apartment, townhouse', example: '2br, studio' },
      { key: 'water_options', label: 'Water preference', type: 'list', required: false, description: 'included, own_borehole, or either', example: 'included' },
      { key: 'token_options', label: 'Token / self-contained', type: 'list', required: false, description: 'self, inclusive, or either', example: 'self' },
      { key: 'description', label: 'Other notes', type: 'text', required: false, maxLength: 2000, description: 'Anything else: quiet area, parking, near town, etc.', example: 'Quiet area, parking, near school' },
    ],
  },
  wifi_booking: {
    id: 'wifi_booking',
    title: 'WiFi booking',
    description:
      'A customer wants home WiFi installed. Collect the package they want plus their name, phone, installation area and national ID.',
    fields: [
      { key: 'package_name', label: 'WiFi package', type: 'text', required: true, minLength: 2, description: 'Name of the package they chose', example: 'Home Lite' },
      { key: 'package_id', label: 'Package ID', type: 'text', required: false, description: 'Package id when it is known from the wifi_packages tool', example: 'uuid' },
      { key: 'package_speed', label: 'Package speed', type: 'text', required: false, description: 'Speed shown on the package', example: '10 Mbps' },
      { key: 'package_price', label: 'Monthly price', type: 'number', required: false, description: 'Monthly package price in KSh', example: '1500' },
      { key: 'name', label: 'Full name', type: 'text', required: true, minLength: 2, description: 'Customer’s full name', example: 'Jane Wanjiku' },
      { key: 'phone', label: 'Phone', type: 'phone', required: true, description: 'Phone number for the installation team', example: '0712345678' },
      { key: 'area', label: 'Installation area', type: 'text', required: true, minLength: 2, description: 'Where the WiFi will be installed', example: 'Kipkaren' },
      { key: 'id_number', label: 'National ID', type: 'integer', required: true, minLength: 5, description: 'National ID number (digits only)', example: '12345678' },
    ],
  },
  mover_request: {
    id: 'mover_request',
    title: 'Mover request',
    description: 'A customer needs help moving house.',
    fields: [
      { key: 'name', label: 'Full name', type: 'text', required: true, minLength: 2, description: 'Customer’s full name', example: 'Jane Wanjiku' },
      { key: 'phone', label: 'Phone', type: 'phone', required: true, description: 'Phone number for the mover', example: '0712345678' },
      { key: 'from_location', label: 'Moving from', type: 'text', required: true, minLength: 2, description: 'Where they are moving from', example: 'Langas' },
      { key: 'to_location', label: 'Moving to', type: 'text', required: false, description: 'Where they are moving to', example: 'Kipkaren' },
      { key: 'move_date', label: 'Move date', type: 'text', required: false, description: 'When they want to move', example: 'next Saturday' },
      { key: 'mover', label: 'Preferred mover', type: 'text', required: false, description: 'A specific mover, or any', example: 'any' },
      { key: 'notes', label: 'Notes', type: 'text', required: false, maxLength: 1000, description: 'Furniture, stairs, special items', example: 'One sofa, one bed, second floor' },
    ],
  },
  house_booking: {
    id: 'house_booking',
    title: 'House viewing request',
    description:
      'A hunter wants to view a specific listing. The team confirms the booking and sends the M-Pesa payment link. Collect the listing (id or link) and contact details.',
    fields: [
      { key: 'listing_id', label: 'Listing', type: 'text', required: true, minLength: 8, description: 'The listing id or link the customer wants to view', example: 'https://www.asehanta.com/listings/<id>' },
      { key: 'name', label: 'Full name', type: 'text', required: true, minLength: 2, description: 'Customer’s full name', example: 'Jane Wanjiku' },
      { key: 'phone', label: 'Phone', type: 'phone', required: true, description: 'Phone number for the lister to call', example: '0712345678' },
      { key: 'area', label: 'Current area', type: 'text', required: true, minLength: 2, description: 'Where the customer is coming from', example: 'Langas' },
      { key: 'id_number', label: 'National ID', type: 'integer', required: false, minLength: 5, description: 'National ID number (digits only)', example: '12345678' },
      { key: 'preferred_date', label: 'Preferred viewing date', type: 'text', required: false, description: 'When they want to view', example: 'tomorrow afternoon' },
      { key: 'notes', label: 'Notes', type: 'text', required: false, maxLength: 1000, description: 'Anything else the team should know', example: 'Call after 5pm' },
    ],
  },
  complaint: {
    id: 'complaint',
    title: 'Complaint / report',
    description:
      'A customer wants to report a problem, bug, payment issue, listing issue, account issue or feature request. Collect a clear subject, the details, and at least one contact (email or phone).',
    fields: [
      { key: 'name', label: 'Full name', type: 'text', required: true, minLength: 2, description: 'Customer’s full name', example: 'Jane Wanjiku' },
      { key: 'email', label: 'Email', type: 'email', required: false, description: 'Email address (or use phone)', example: 'jane@example.com' },
      { key: 'phone', label: 'Phone', type: 'phone', required: false, description: 'Phone number (or use email)', example: '0712345678' },
      { key: 'category', label: 'Category', type: 'enum', required: true, enumValues: [...COMPLAINT_CATEGORIES], description: 'One of complaint, bug, payment, listing, account, feature, other', example: 'payment' },
      { key: 'subject', label: 'Subject', type: 'text', required: true, minLength: 3, maxLength: 140, description: 'Short summary of the issue', example: 'Booking fee not showing' },
      { key: 'message', label: 'Details', type: 'text', required: true, minLength: 10, maxLength: 4000, description: 'What happened, with any useful references', example: 'I paid the booking fee but the booking still says pending.' },
      { key: 'related_listing_id', label: 'Related listing', type: 'text', required: false, description: 'Listing id or link if the issue is about a house', example: 'uuid' },
    ],
  },
}

export const FORM_IDS = Object.keys(FORMS) as FormId[]

/** A compact field guide for the model. It is the only "form" the AI needs. */
export function formsPrompt(): string {
  const blocks = FORM_IDS.map((id) => {
    const form = FORMS[id]
    const fields = form.fields
      .map((f) => {
        const required = f.required ? 'required' : 'optional'
        const extra = [
          f.enumValues?.length ? `one of: ${f.enumValues.join(', ')}` : '',
          f.example ? `example: ${f.example}` : '',
        ]
          .filter(Boolean)
          .join('; ')
        return `  - ${f.key} (${f.type}, ${required}): ${f.description}${extra ? ` — ${extra}` : ''}`
      })
      .join('\n')
    return `- ${id} — ${form.description}\n${fields}`
  })

  return `SUBMISSIONS — collect naturally, never as a rigid form:
You are the data collector. Ask questions in a warm, human way, accept several answers in one message, and extract every field you can. Never make the user repeat something they already told you.

Available submissions (the server validates these):
${blocks.join('\n')}

HOW TO COLLECT AND SUBMIT:
1. When the user wants one of these, start chatting naturally. Do NOT read out the field list.
2. Whenever you have new values, call submit_form with the form id and a data object. You can call it before every field is known.
3. submit_form keeps a draft on the server and returns missing and invalid fields. Ask only for those, in one short message. If a value is invalid, accept the correction and call submit_form again with the changed value. Never loop on the same question — rephrase and use the user's own wording.
4. If the user answers several things at once (for example "my email is jane@example.com, 2BR in Kipkaren under 20k"), put all of them in the same submit_form call. Do not ask for them again.
5. If the user says "same as my phone", "any", "none", "skip" or similar, use the phone you already have or leave optional fields out.
6. Only call submit_form after the user has asked to submit that kind of request. Do not turn a greeting or a browsing question into a submission.
7. When submit_form returns ok: true, tell the user it is submitted and what happens next. Do not call submit_form again for the same request.
8. If the user wants to cancel, stop collecting and clear it.

ACCOUNT SECURITY:
- Password reset CAN be done in this chat: call request_password_reset with their account email. It sends a 6-digit code by email. Then call complete_password_reset with the email, the code and their new password.
- On WhatsApp, email change, account deletion and profile-picture changes need the signed-in website at https://www.asehanta.com/profile. Do not ask for passwords or codes for those here.`
}

function clean(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).join(', ')
  if (typeof value === 'object') return ''
  return String(value).trim()
}

function normalisePhone(value: unknown): string | null {
  const raw = clean(value)
  if (!raw) return null
  const stripped = raw.replace(/\s+/g, ' ').trim()
  return isValidPhone(stripped) ? stripped : null
}

function parseAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  const text = clean(value).toLowerCase().replace(/,/g, '')
  if (!text) return null
  const kMatch = text.match(/(\d+(?:\.\d+)?)\s*k\b/)
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000)
  const digits = text.replace(/[^\d.]/g, '')
  if (!digits) return null
  const parsed = Number(digits)
  return Number.isFinite(parsed) ? Math.round(parsed) : null
}

function splitList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(clean).filter(Boolean)
  }
  return clean(value)
    .split(/[,;\/]|\band\b|\bor\b|\+|\n/gi)
    .map((part) => part.trim())
    .filter(Boolean)
}

function normaliseEnum(value: unknown, aliases: Record<string, string>): string | null {
  const key = clean(value).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!key) return null
  return aliases[key] ?? null
}

function validateField(field: FormField, value: unknown): { value: unknown; error?: string } {
  const text = clean(value)

  if (field.type === 'email') {
    if (!text) return { value: '' }
    const email = text.toLowerCase()
    if (!EMAIL_RE.test(email)) return { value: '', error: 'Use a valid email like you@example.com.' }
    return { value: email }
  }

  if (field.type === 'phone') {
    if (!text) return { value: '' }
    const phone = normalisePhone(text)
    if (!phone) return { value: '', error: 'Use a phone number like 0712 345 678.' }
    return { value: phone }
  }

  if (field.type === 'number' || field.type === 'integer') {
    if (!text && typeof value !== 'number') return { value: null }
    const number = parseAmount(value)
    if (number === null) return { value: null, error: 'Use a number, e.g. 15000.' }
    if (field.min !== undefined && number < field.min) return { value: null, error: `Must be at least ${field.min}.` }
    if (field.max !== undefined && number > field.max) return { value: null, error: `Must be at most ${field.max}.` }
    return { value: number }
  }

  if (field.type === 'list') {
    const rawList = splitList(value)
    if (rawList.length === 0) return { value: [] }
    const mapped: string[] = []
    for (const item of rawList) {
      const key = item.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
      if (field.key === 'house_designs') {
        const design = DESIGN_ALIASES[key] ?? DESIGN_ALIASES[key.replace(/\s+/g, '')]
        if (design) mapped.push(design)
      } else if (field.key === 'water_options') {
        const water = WATER_ALIASES[key]
        if (water) mapped.push(water)
      } else if (field.key === 'token_options') {
        const token = TOKEN_ALIASES[key]
        if (token) mapped.push(token)
      } else if (field.enumValues?.includes(item)) {
        mapped.push(item)
      }
    }
    if (mapped.length === 0) return { value: [] }
    return { value: [...new Set(mapped)] }
  }

  if (field.type === 'boolean') {
    const key = text.toLowerCase()
    if (!key) return { value: null }
    if (['yes', 'true', '1', 'y', 'ndio'].includes(key)) return { value: true }
    if (['no', 'false', '0', 'n', 'hapana'].includes(key)) return { value: false }
    return { value: null, error: 'Answer yes or no.' }
  }

  if (field.type === 'enum') {
    if (!text) return { value: '' }
    let normalised: string | null = null
    if (field.key === 'category') normalised = normaliseEnum(text, CATEGORY_ALIASES)
    if (!normalised && field.enumValues) {
      const key = text.toLowerCase()
      normalised = field.enumValues.find((item) => item.toLowerCase() === key) ?? null
    }
    if (!normalised) return { value: '', error: `Use one of: ${field.enumValues?.join(', ') ?? 'the allowed values'}.` }
    return { value: normalised }
  }

  // text
  if (!text) return { value: '' }
  if (field.minLength && text.length < field.minLength) {
    return { value: '', error: `Please give a little more detail (at least ${field.minLength} characters).` }
  }
  if (field.maxLength && text.length > field.maxLength) {
    return { value: text.slice(0, field.maxLength) }
  }
  return { value: text }
}

/** Coerce and validate a partial submission. */
export function validateForm(formId: string, raw: Record<string, unknown>): FormValidation {
  const form = FORMS[formId as FormId]
  if (!form) {
    return {
      ok: false,
      data: {},
      missing: [],
      invalid: [{ field: 'form', message: `Unknown form. Use one of: ${FORM_IDS.join(', ')}.` }],
    }
  }

  const data: Record<string, unknown> = {}
  const missing: string[] = []
  const invalid: Array<{ field: string; message: string }> = []

  // Free-text budget convenience: let the model send "budget" or "rent".
  if (formId === 'house_request') {
    const budget = raw.budget ?? raw.rent
    if (budget !== undefined && raw.min_rent === undefined && raw.max_rent === undefined) {
      const { min, max } = extractRentRange(clean(budget))
      if (min !== null) raw = { ...raw, min_rent: min }
      if (max !== null) raw = { ...raw, max_rent: max }
    }
    if (
      typeof raw.whatsapp === 'string' &&
      /^(same|same as phone|use phone|use my phone|phone|default)$/i.test(raw.whatsapp.trim())
    ) {
      raw = { ...raw, whatsapp: raw.phone }
    }
  }

  for (const field of form.fields) {
    const incoming = raw[field.key]
    const hasValue =
      incoming !== undefined &&
      incoming !== null &&
      !(typeof incoming === 'string' && incoming.trim() === '') &&
      !(Array.isArray(incoming) && incoming.length === 0)

    if (!hasValue) {
      if (field.required) missing.push(field.key)
      continue
    }

    const result = validateField(field, incoming)
    if (result.error) {
      invalid.push({ field: field.key, message: result.error })
      continue
    }
    const value = result.value
    const emptyValue =
      value === '' ||
      value === null ||
      (Array.isArray(value) && value.length === 0)
    if (emptyValue) {
      if (field.required) missing.push(field.key)
      continue
    }
    data[field.key] = value
  }

  // Complaint needs a way to reach the customer.
  if (formId === 'complaint' && !data.email && !data.phone) {
    missing.push('email or phone')
  }

  if (formId === 'house_request' && data.min_rent && data.max_rent && Number(data.min_rent) > Number(data.max_rent)) {
    invalid.push({ field: 'min_rent', message: 'Minimum rent cannot be higher than the maximum rent.' })
  }

  return { ok: missing.length === 0 && invalid.length === 0, data, missing, invalid }
}

function describeValidation(formId: FormId, validation: FormValidation): string {
  const form = FORMS[formId]
  const label = (key: string) => form.fields.find((f) => f.key === key)?.label ?? key
  const parts: string[] = []

  if (validation.missing.length) {
    parts.push(`Still needed: ${validation.missing.map((key) => (key === 'email or phone' ? key : label(key))).join(', ')}.`)
  }
  if (validation.invalid.length) {
    parts.push(
      `Needs fixing: ${validation.invalid
        .map((item) => `${label(item.field)} — ${item.message}`)
        .join('; ')}.`
    )
  }
  if (parts.length === 0) parts.push('Everything needed is present.')
  return `Draft saved for ${form.title}. ${parts.join(' ')} Ask only for the missing or invalid details, then call submit_form again.`
}

function designLabels(list: unknown): string {
  const labels: Record<string, string> = {
    bedsitter: 'Bedsitter',
    studio: 'Studio',
    '1br': '1 Bedroom',
    '2br': '2 Bedroom',
    '3br': '3 Bedroom',
    bungalow: 'Bungalow',
    apartment: 'Apartment',
    townhouse: 'Townhouse',
  }
  return (Array.isArray(list) ? list : []).map((item) => labels[String(item)] ?? String(item)).join(', ')
}

function money(value: unknown): string {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? `KSh ${n.toLocaleString('en-KE')}` : ''
}

function success(
  text: string,
  extra: Partial<FormSubmitResult> = {}
): FormSubmitResult {
  return {
    ok: true,
    text,
    state: { mode: 'chat', step: null, form: null, draft: {} },
    ...extra,
  }
}

/* ------------------------------------------------------------ submissions */

async function submitHouseRequest(data: Record<string, unknown>): Promise<FormSubmitResult> {
  const supabase = createAdminClient()
  const whatsappRaw = clean(data.whatsapp) || clean(data.phone)
  const whatsapp = parseWhatsAppContact(whatsappRaw)
  if (!whatsapp) {
    return {
      ok: false,
      text: 'That WhatsApp contact does not look right. Ask for a phone number like 0712 345 678, or use the phone number they already gave.',
      data: { invalid: [{ field: 'whatsapp', message: 'Use a phone number or @username.' }] },
    }
  }

  const insert = {
    name: data.name,
    email: data.email,
    phone: data.phone,
    location: data.location,
    min_rent: data.min_rent ?? null,
    max_rent: data.max_rent ?? null,
    token_options: data.token_options ?? [],
    water_options: data.water_options ?? [],
    house_designs: data.house_designs ?? [],
    description: data.description ?? '',
    whatsapp: canonicalWhatsAppContact(whatsappRaw) || data.phone,
  }

  let { error } = await supabase.from('house_requests').insert(insert)
  if (error && /whatsapp/i.test(`${error.code || ''} ${error.message || ''}`)) {
    const { whatsapp: _w, ...rest } = insert
    ;({ error } = await supabase.from('house_requests').insert(rest))
  }
  if (error) return { ok: false, text: `Could not save the house request: ${error.message}`, data: { retry: true } }

  const budget =
    insert.min_rent || insert.max_rent
      ? `${insert.min_rent ? money(insert.min_rent) : 'any'} — ${insert.max_rent ? money(insert.max_rent) : 'any'}`
      : 'Not specified'

  await notifyAdmins('New House Request', '🏠 New House Request (via Ase chat)', {
    Name: String(insert.name),
    Email: String(insert.email),
    Phone: String(insert.phone),
    WhatsApp: String(insert.whatsapp),
    Location: String(insert.location),
    'Rent Range': budget,
    'House Design': designLabels(insert.house_designs) || 'Not specified',
    Water: (insert.water_options as string[]).join(', ') || 'Not specified',
    Token: (insert.token_options as string[]).join(', ') || 'Not specified',
    Description: String(insert.description || 'None'),
    Source: 'Ase chat (AI-collected)',
  })

  return success(
    `✅ House request submitted for ${insert.location}. The team will reach them on WhatsApp${insert.whatsapp ? ` (${insert.whatsapp})` : ''} within 24 hours.`,
    {
      adminAlert: {
        topic: 'house request',
        subject: `New house request — ${String(insert.location)}`,
        priority: 'normal',
        message: [
          `Name: ${insert.name}`,
          `Phone: ${insert.phone}`,
          `WhatsApp: ${insert.whatsapp}`,
          `Email: ${insert.email}`,
          `Location: ${insert.location}`,
          `Budget: ${budget}`,
          `Type: ${designLabels(insert.house_designs) || 'any'}`,
          `Water: ${(insert.water_options as string[]).join(', ') || 'any'}`,
          `Token: ${(insert.token_options as string[]).join(', ') || 'any'}`,
          `Notes: ${insert.description || 'none'}`,
          'Source: Ase chat (AI-collected)',
        ].join('\n'),
        name: String(insert.name),
        phone: String(insert.whatsapp || insert.phone),
        email: String(insert.email),
      },
      actions: [{ type: 'link', label: 'Browse houses', href: 'https://www.asehanta.com/' }],
    }
  )
}

async function submitWifiBooking(data: Record<string, unknown>): Promise<FormSubmitResult> {
  const supabase = createAdminClient()
  const packagePrice = Number(data.package_price) || 0
  const installation = WIFI_INSTALLATION_FEE
  const total = installation + packagePrice

  const insert = {
    package_id: data.package_id || null,
    package_name: data.package_name,
    package_speed: data.package_speed || '',
    package_price: packagePrice,
    installation_fee: installation,
    total_price: total,
    name: data.name,
    phone: data.phone,
    area: data.area,
    id_number: String(data.id_number ?? ''),
  }

  let { error } = await supabase.from('wifi_bookings').insert(insert)
  if (error && /installation_fee|total_price|package_price|package_speed|package_id/i.test(`${error.code || ''} ${error.message || ''}`)) {
    const { installation_fee: _fee, total_price: _total, package_price: _price, package_speed: _speed, package_id: _id, ...base } = insert
    ;({ error } = await supabase.from('wifi_bookings').insert(base))
  }
  if (error) return { ok: false, text: `Could not save the WiFi booking: ${error.message}`, data: { retry: true } }

  await notifyAdmins('WIFI NEEDED', 'WiFi Booking (via Ase chat)', {
    Name: String(insert.name),
    Phone: String(insert.phone),
    Area: String(insert.area),
    'ID Number': String(insert.id_number),
    Package: String(insert.package_name),
    'Installation Fee': `KSh ${installation.toLocaleString('en-KE')}`,
    'Monthly Price': packagePrice ? `KSh ${packagePrice.toLocaleString('en-KE')}` : 'Not specified',
    Source: 'Ase chat (AI-collected)',
  })

  return success(
    `✅ WiFi booking sent. The team will call ${insert.phone} to arrange installation in ${insert.area}. Installation is ${money(installation)}${packagePrice ? ` plus ${money(packagePrice)}/month` : ''}.`,
    {
      actions: [{ type: 'link', label: 'Browse WiFi packages', href: 'https://www.asehanta.com/wifi' }],
      adminAlert: {
        topic: 'WiFi booking',
        subject: `New WiFi booking — ${String(insert.area)}`,
        priority: 'normal',
        message: [
          `Name: ${insert.name}`,
          `Phone: ${insert.phone}`,
          `Area: ${insert.area}`,
          `ID: ${insert.id_number}`,
          `Package: ${insert.package_name}`,
          `Installation: ${money(installation)}`,
          `Monthly: ${packagePrice ? money(packagePrice) : 'not specified'}`,
          'Source: Ase chat (AI-collected)',
        ].join('\n'),
        name: String(insert.name),
        phone: String(insert.phone),
      },
    }
  )
}

async function submitMoverRequest(data: Record<string, unknown>): Promise<FormSubmitResult> {
  const from = clean(data.from_location)
  const to = clean(data.to_location)
  const summary = [
    `Name: ${data.name}`,
    `Phone: ${data.phone}`,
    `Move: ${from}${to ? ` to ${to}` : ''}`,
    `Mover: ${data.mover || 'any'}`,
    `When: ${data.move_date || 'anytime'}`,
    `Notes: ${data.notes || 'none'}`,
    'Source: Ase chat (AI-collected)',
  ].join('\n')

  await notifyAdmins('MOVER REQUEST', 'Mover Request (via Ase chat)', {
    Name: String(data.name),
    Phone: String(data.phone),
    'Move Details': `${from}${to ? ` to ${to}` : ''}`,
    Mover: String(data.mover || 'any'),
    When: String(data.move_date || 'anytime'),
    Notes: String(data.notes || 'none'),
    Source: 'Ase chat (AI-collected)',
  })

  const wa = getWhatsAppLink(WHATSAPP_NUMBER, `Hi AseHanta, I'd like a mover.\n${summary}`)
  return success(
    `✅ Mover request sent. The team will arrange it and contact ${data.phone}.`,
    {
      actions: wa ? [{ type: 'link', label: 'Continue on WhatsApp', href: wa }] : undefined,
      adminAlert: {
        topic: 'mover request',
        subject: `New mover request — ${String(data.mover || 'any mover')}`,
        priority: 'normal',
        message: summary,
        name: String(data.name),
        phone: String(data.phone),
      },
    }
  )
}

async function submitHouseBooking(data: Record<string, unknown>): Promise<FormSubmitResult> {
  const supabase = createAdminClient()
  const rawListing = clean(data.listing_id)
  const match = rawListing.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  const listingId = match ? match[0] : rawListing
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(listingId)) {
    return {
      ok: false,
      text: 'I need the exact listing the customer wants to view. Send the listing link or id, or search for the house first.',
      data: { invalid: [{ field: 'listing_id', message: 'Use the listing id or link.' }] },
    }
  }

  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('id, title, location, descriptive_location, price, rent, status')
    .eq('id', listingId)
    .maybeSingle()

  if (listingError) return { ok: false, text: `Could not load that listing: ${listingError.message}`, data: { retry: true } }
  if (!listing) return { ok: false, text: 'That listing no longer exists. Search for another house or send a different link.' }
  if (listing.status === 'taken') {
    return { ok: false, text: 'That house is already taken, so it cannot be viewed. Offer to search for a similar available house.' }
  }
  if (listing.status === 'booked') {
    return { ok: false, text: 'That house is already being viewed by someone else. Offer to search for a similar available house.' }
  }

  const bookingFee = Number(listing.price) || Number(listing.rent) || 0
  const { error } = await supabase.from('house_bookings').insert({
    listing_id: listing.id,
    listing_title: listing.title || 'House',
    listing_location: listing.descriptive_location || listing.location || '',
    listing_price: bookingFee,
    name: data.name,
    phone: data.phone,
    area: data.area,
    id_number: String(data.id_number ?? ''),
    status: 'pending',
  })
  if (error) return { ok: false, text: `Could not save the viewing request: ${error.message}`, data: { retry: true } }

  const notes = [data.preferred_date ? `Preferred: ${data.preferred_date}` : '', data.notes ? `Notes: ${data.notes}` : '']
    .filter(Boolean)
    .join(' | ')

  await notifyAdmins('New House Booking', '🏠 Viewing Request (via Ase chat)', {
    Name: String(data.name),
    Phone: String(data.phone),
    Area: String(data.area),
    House: String(listing.title || 'House'),
    Location: String(listing.descriptive_location || listing.location || ''),
    'Booking Fee': money(bookingFee),
    Notes: notes || 'None',
    Source: 'Ase chat (AI-collected)',
  })

  return success(
    `✅ Viewing request sent for ${listing.title || 'the house'}. The team will confirm the payment link on WhatsApp, then the lister’s contact is unlocked for the 24-hour viewing window.`,
    {
      adminAlert: {
        topic: 'house booking',
        subject: `Viewing request — ${String(listing.title || 'House')}`,
        priority: 'high',
        message: [
          `Name: ${data.name}`,
          `Phone: ${data.phone}`,
          `Area: ${data.area}`,
          `House: ${listing.title || 'House'}`,
          `Listing: ${listing.id}`,
          `Booking fee: ${money(bookingFee)}`,
          notes,
          'Source: Ase chat (AI-collected)',
        ]
          .filter(Boolean)
          .join('\n'),
        name: String(data.name),
        phone: String(data.phone),
        listingId: listing.id,
      },
      actions: [{ type: 'link', label: 'Open listing', href: `https://www.asehanta.com/listings/${listing.id}` }],
    }
  )
}

async function submitComplaint(data: Record<string, unknown>): Promise<FormSubmitResult> {
  const supabase = createAdminClient()
  const { data: row, error } = await supabase
    .from('complaints')
    .insert({
      user_id: null,
      name: data.name,
      email: data.email || '',
      phone: data.phone || '',
      category: data.category || 'other',
      priority: 'normal',
      subject: data.subject,
      message: data.message,
      related_listing_id: data.related_listing_id || null,
    })
    .select('id, subject, category, priority')
    .single()

  if (error) return { ok: false, text: `Could not file the report: ${error.message}`, data: { retry: true } }

  await createNotification({
    role: 'admin',
    category: 'system',
    title: `New ${row.category === 'bug' ? 'bug report' : 'complaint'}: ${row.subject}`,
    body: `${data.name} · ${data.email || data.phone || 'no contact'} · priority: ${row.priority}`,
    link: '/admin/complaints',
    data: { complaint_id: row.id, category: row.category, priority: row.priority },
  })

  await notifyAdmins(`New complaint via Ase chat`, String(row.subject), {
    Category: String(row.category),
    Name: String(data.name),
    Email: String(data.email || 'Not provided'),
    Phone: String(data.phone || 'Not provided'),
    Message: String(data.message),
    'Related Listing': String(data.related_listing_id || 'None'),
    Source: 'Ase chat (AI-collected)',
  })

  return success(
    `✅ Report filed — reference ${String(row.id).slice(0, 8)}. The team will review it and reply within 24 hours.`,
    {
      adminAlert: {
        topic: 'complaint',
        subject: String(row.subject),
        priority: 'normal',
        message: String(data.message),
        name: String(data.name),
        phone: clean(data.phone) || undefined,
        email: clean(data.email) || undefined,
        listingId: clean(data.related_listing_id) || undefined,
      },
      actions: [{ type: 'link', label: 'Contact support', href: 'https://www.asehanta.com/contact' }],
    }
  )
}

/** Main entry used by the `submit_form` tool. */
export async function submitForm(formId: string, raw: Record<string, unknown> = {}): Promise<FormSubmitResult> {
  const form = FORMS[formId as FormId]
  if (!form) {
    return {
      ok: false,
      text: `Unknown form "${formId}". Use one of: ${FORM_IDS.join(', ')}.`,
    }
  }

  const validation = validateForm(formId, raw)
  if (!validation.ok) {
    return {
      ok: false,
      text: describeValidation(form.id, validation),
      data: {
        status: 'incomplete',
        form: form.id,
        saved: validation.data,
        missing: validation.missing,
        invalid: validation.invalid,
      },
      state: { mode: 'chat', step: null, form: form.id, draft: validation.data },
    }
  }

  switch (form.id) {
    case 'house_request':
      return submitHouseRequest(validation.data)
    case 'wifi_booking':
      return submitWifiBooking(validation.data)
    case 'mover_request':
      return submitMoverRequest(validation.data)
    case 'house_booking':
      return submitHouseBooking(validation.data)
    case 'complaint':
      return submitComplaint(validation.data)
  }
}

/* --------------------------------------------------------- password reset */

export async function requestPasswordReset(emailInput: unknown): Promise<FormSubmitResult> {
  const email = clean(emailInput).toLowerCase()
  if (!EMAIL_RE.test(email)) {
    return {
      ok: false,
      text: 'That email does not look valid. Ask for the email on their AseHanta account, e.g. you@example.com. Do not ask again in a loop — accept a corrected address.',
      state: { mode: 'chat', step: null, form: 'password_reset', draft: { email: clean(emailInput) } },
    }
  }

  const { allowed, retryAfter } = await checkRateLimit(`password-reset-send:${email}`, 3, 600)
  if (!allowed) {
    return { ok: false, text: `Too many reset code requests for that email. Ask them to try again in ${retryAfter} seconds.` }
  }

  const user = await findAuthUserByEmail(email)
  if (!user) {
    return {
      ok: false,
      text: 'No account was found with that email. Ask them to double-check the address or use a different email.',
      state: { mode: 'chat', step: null, form: 'password_reset', draft: { email } },
    }
  }

  const supabase = createAdminClient()
  const otp = String(randomInt(100000, 999999))
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  await supabase.from('otps').update({ used: true }).eq('email', email).eq('type', 'password_reset').eq('used', false)
  const { error: dbError } = await supabase.from('otps').insert({ email, otp, type: 'password_reset', expires_at: expiresAt })
  if (dbError) return { ok: false, text: 'Could not generate a reset code right now. Ask them to try again in a moment.' }

  try {
    await sendOtpEmail(email, otp, 'password_reset')
  } catch (err) {
    console.error('[chat] password reset email failed:', err)
    return { ok: false, text: 'The reset code could not be emailed. Ask them to try again in a moment.' }
  }

  return {
    ok: true,
    text: `A 6-digit reset code was emailed to ${email}. It expires in 10 minutes. Ask them for the code next; do not ask for their password by email.`,
    state: { mode: 'chat', step: null, form: 'password_reset', draft: { email, stage: 'otp' } },
  }
}

export async function completePasswordReset(
  emailInput: unknown,
  codeInput: unknown,
  passwordInput: unknown
): Promise<FormSubmitResult> {
  const email = clean(emailInput).toLowerCase()
  const code = clean(codeInput).replace(/\s+/g, '')
  const password = clean(passwordInput)

  if (!EMAIL_RE.test(email)) {
    return {
      ok: false,
      text: 'The account email is missing or invalid. Ask for the email again, then call request_password_reset. Do not loop on the same message.',
      state: { mode: 'chat', step: null, form: 'password_reset', draft: { email: clean(emailInput) } },
    }
  }
  if (!/^\d{6}$/.test(code)) {
    return {
      ok: false,
      text: 'The code must be the 6 digits from the email. Ask them to check the email and send the 6-digit code.',
      state: { mode: 'chat', step: null, form: 'password_reset', draft: { email, stage: 'otp' } },
    }
  }
  if (password.length < 8) {
    return {
      ok: false,
      text: 'The new password must be at least 8 characters. Ask for a longer password.',
      state: { mode: 'chat', step: null, form: 'password_reset', draft: { email, stage: 'password' } },
    }
  }

  const { allowed, retryAfter } = await checkRateLimit(`password-reset-verify:${email}`, 3, 600)
  if (!allowed) {
    return { ok: false, text: `Too many attempts. Ask them to try again in ${retryAfter} seconds.` }
  }

  const supabase = createAdminClient()
  const otpRow = await findValidOtp(supabase, email, code, ['password_reset'])
  if (!otpRow) {
    await recordOtpFailure(supabase, email, ['password_reset'])
    return {
      ok: false,
      text: 'That code is invalid or expired. Ask them to check the email and send the 6-digit code again, or call request_password_reset for a fresh code. Never repeat the same failure message word for word.',
      state: { mode: 'chat', step: null, form: 'password_reset', draft: { email, stage: 'otp' } },
    }
  }

  await supabase.from('otps').update({ used: true }).eq('id', otpRow.id)

  const user = await findAuthUserByEmail(email)
  if (!user) {
    return { ok: false, text: 'The account could not be found. Ask them to start again with the correct email.' }
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, { password })
  if (updateError) {
    return { ok: false, text: `Could not update the password: ${updateError.message}. Ask them to try again in a moment.` }
  }

  return success('✅ Password updated. They can now sign in with the new password.', {
    actions: [{ type: 'link', label: 'Sign in', href: 'https://www.asehanta.com/auth/signin' }],
  })
}
