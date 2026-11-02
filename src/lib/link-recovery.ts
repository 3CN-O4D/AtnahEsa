/**
 * Recover edited, shortened or legacy listing links.
 *
 * Canonical listing URLs are `/listings/<uuid>`. In practice people share
 * links that have been through a chat app, a URL shortener, an old version of
 * the site, or the lister's clipboard, which produces shapes like:
 *
 *   /listing/3f0c…            (old singular route)
 *   /houses/3f0c…             (old plural route)
 *   /listings/3f0c…-karen     (title appended by a share sheet)
 *   /listings/karen-3f0c…     (slug prepended by a CMS)
 *   /listings/3f0c…?utm=…     (tracking params, handled by the caller)
 *   /Listings/3F0C…           (someone capitalised it)
 *
 * The helpers below are pure and dependency-free so they can run inside
 * middleware (edge runtime) and in the browser.
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const COMPACT_UUID_RE = /(?:^|[^0-9a-f])([0-9a-f]{32})(?=[^0-9a-f]|$)/i

/** Route prefixes that historically pointed at a single listing. */
const LEGACY_PREFIXES = new Set([
  'listing',
  'listings',
  'house',
  'houses',
  'home',
  'homes',
  'property',
  'properties',
  'rental',
  'rentals',
  'view',
  'details',
  'listing-details',
  'l',
  'p',
])

/** Words that carry no search value when we turn a broken path into a query. */
const NOISE_WORDS = new Set([
  ...LEGACY_PREFIXES,
  'index',
  'page',
  'html',
  'htm',
  'php',
  'www',
  'en',
  'sw',
])

function decode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function segments(pathname: string): string[] {
  const clean = (pathname || '').split('?')[0].split('#')[0]
  return clean.split('/').map(decode).filter(Boolean)
}

/** Turn a dashed or compact UUID (in any casing) into its canonical form. */
export function normalizeUuid(value: string): string | null {
  if (!value) return null
  const dashed = value.match(UUID_RE)?.[0]
  if (dashed) return dashed.toLowerCase()

  const compact = value.match(COMPACT_UUID_RE)?.[1]
  if (!compact) return null
  const hex = compact.toLowerCase()
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** True when the path begins with one of the known single-listing prefixes. */
export function isListingLikePath(pathname: string): boolean {
  const [first] = segments(pathname)
  if (!first) return false
  return LEGACY_PREFIXES.has(first.toLowerCase())
}

/**
 * Return the canonical `/listings/<uuid>` path when a link can be repaired.
 * Returns `null` when the link is already canonical or cannot be recovered
 * without a database lookup.
 */
export function canonicalListingPath(pathname: string): string | null {
  const parts = segments(pathname)
  if (parts.length === 0) return null

  const first = parts[0].toLowerCase()
  if (!LEGACY_PREFIXES.has(first)) return null

  // A UUID can live in any segment (some share sheets insert a date or
  // category before the id). Prefer the first one found.
  let uuid: string | null = null
  for (const part of parts.slice(1)) {
    uuid = normalizeUuid(part)
    if (uuid) break
  }
  if (!uuid) return null

  const canonical = `/listings/${uuid}`
  const current = `/${parts.join('/')}`
  return current === canonical ? null : canonical
}

/**
 * Build a short, human search phrase from a broken path so the 404 page can
 * pre-fill its search box. Examples:
 *
 *   /houses/karen-3-bedroom-3f0c…  ->  "karen 3 bedroom"
 *   /listings/3f0c…                ->  ""
 */
export function pathSearchHint(pathname: string): string {
  const words = segments(pathname)
    .flatMap((part) =>
      part
        // Remove UUIDs before splitting so their hex groups do not become
        // bogus search words (e.g. "1a2b 4c3d").
        .replace(UUID_RE, ' ')
        .replace(/[0-9a-f]{32}/gi, ' ')
        .split(/[-_+.\s]+/)
    )
    .map((word) => word.trim().toLowerCase())
    .filter((word) => {
      if (!word) return false
      if (NOISE_WORDS.has(word)) return false
      // Drop UUID fragments and long hex identifiers.
      if (/^[0-9a-f]{8,}$/i.test(word) && /[0-9]/.test(word)) return false
      return true
    })

  return Array.from(new Set(words)).join(' ').slice(0, 60)
}
