import crypto from 'crypto'

export interface PendingActionPayload {
  v: 1
  adminId: string
  tool: string
  args: Record<string, unknown>
  exp: number
  nonce: string
}

function secret(): string {
  const value =
    process.env.ADMIN_COPILOT_SECRET ||
    process.env.ESCROW_AUDIT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!value) throw new Error('Admin copilot confirmation secret is not configured')
  return value
}

function sign(body: string): string {
  return crypto.createHmac('sha256', secret()).update(body).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

/** Create a short-lived, tamper-proof token for a proposed admin mutation. */
export function createConfirmationToken(
  adminId: string,
  tool: string,
  args: Record<string, unknown>,
  ttlSeconds = 600
): { token: string; expiresAt: string } {
  const exp = Date.now() + ttlSeconds * 1000
  const payload: PendingActionPayload = {
    v: 1,
    adminId,
    tool,
    args,
    exp,
    nonce: crypto.randomBytes(12).toString('base64url'),
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return {
    token: `v1.${body}.${sign(body)}`,
    expiresAt: new Date(exp).toISOString(),
  }
}

/** Verify a confirmation token and return its payload, or null. */
export function verifyConfirmationToken(token: string, adminId: string): PendingActionPayload | null {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null

  const [, body, signature] = parts
  if (!safeEqual(sign(body), signature)) return null

  let payload: PendingActionPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PendingActionPayload
  } catch {
    return null
  }

  if (payload.v !== 1 || payload.adminId !== adminId) return null
  if (!payload.exp || payload.exp < Date.now()) return null
  return payload
}
