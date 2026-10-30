/**
 * Helpers for the "return to where you were" auth flow.
 *
 * A `callbackUrl` is always treated as untrusted input: it may come from a
 * query string, localStorage or an OAuth `next` parameter. Only same-site
 * relative paths are ever accepted so this can never become an open redirect.
 */

const MAX_CALLBACK_LENGTH = 2048
const FALLBACK_PATH = '/'
const BLOCKED_PREFIXES = ['/auth', '/api', '/_next']

/** Return a safe, relative callback path or `null` when the value is unusable. */
export function sanitizeCallbackUrl(value: string | null | undefined): string | null {
  if (!value) return null

  const candidate = value.trim()
  if (!candidate || candidate.length > MAX_CALLBACK_LENGTH) return null

  // Absolute URLs (`https://…`), protocol-relative URLs (`//evil.com`) and
  // backslash tricks are all rejected.
  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) return null
  if (candidate.startsWith('//') || candidate.startsWith('/\\') || candidate.startsWith('\\')) return null
  if (!candidate.startsWith('/')) return null

  // Never bounce back into auth pages (redirect loops) or internal endpoints.
  if (BLOCKED_PREFIXES.some((prefix) => candidate === prefix || candidate.startsWith(`${prefix}/`) || candidate.startsWith(`${prefix}?`))) {
    return null
  }

  return candidate
}

/** Safe callback or the home page. */
export function callbackDestination(value: string | null | undefined): string {
  return sanitizeCallbackUrl(value) ?? FALLBACK_PATH
}

/** Append a sanitized callback to an internal path, keeping any existing query string. */
export function withCallbackUrl(path: string, callbackUrl: string | null | undefined): string {
  const safe = sanitizeCallbackUrl(callbackUrl)
  if (!safe || safe === FALLBACK_PATH) return path

  const [base, existingQuery = ''] = path.split('?')
  const params = new URLSearchParams(existingQuery)
  params.set('callbackUrl', safe)
  return `${base}?${params.toString()}`
}

/** Build the sign-in URL for the current page. */
export function signInUrl(callbackUrl: string | null | undefined): string {
  return withCallbackUrl('/auth/signin', callbackUrl)
}

/** Current path + query string, for use from client-side guards. */
export function currentPathWithSearch(): string {
  if (typeof window === 'undefined') return FALLBACK_PATH
  const { pathname, search } = window.location
  return `${pathname}${search}`
}
