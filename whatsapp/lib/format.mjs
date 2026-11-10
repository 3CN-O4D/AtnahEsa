/**
 * Turns the engine's web reply into WhatsApp messages.
 *
 * Same `---` bubble marker as the site, with the same tolerance for messy
 * model output, plus `[[button|url]]` markers converted into plain links
 * (WhatsApp auto-links URLs) and house cards turned into captions.
 */

const BUTTON_RE = /\[\[([^|\]]+)\|([^\]]+)\]\]/g
const SEPARATOR = '(?:-{3,}|\u2014{3,}|_{3,}|\\*{3,})'
const SEPARATOR_LINE_RE = new RegExp(`^[ \\t]*(?:${SEPARATOR}|(?:-[ \\t]+){2,}-|\\u2014|\\u2013)[ \\t]*$`, 'gm')
const SEPARATOR_INLINE_RE = new RegExp(`[ \\t]+${SEPARATOR}[ \\t]+`, 'g')

/** @returns {{ text: string, links: { label: string, href: string }[] }[]} */
export function splitBubbles(raw) {
  if (!raw) return []

  const normalised = String(raw)
    .replace(/\r\n?/g, '\n')
    .replace(SEPARATOR_LINE_RE, '\u0000')
    .replace(SEPARATOR_INLINE_RE, '\u0000')

  const bubbles = []

  for (const piece of normalised.split('\u0000')) {
    const links = []
    const text = piece
      .replace(BUTTON_RE, (_match, label, href) => {
        const cleanLabel = String(label).trim()
        const cleanHref = String(href).trim()
        if (cleanLabel && cleanHref) links.push({ label: cleanLabel, href: cleanHref })
        return ''
      })
      .replace(/^[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (!text) {
      if (links.length && bubbles.length) bubbles[bubbles.length - 1].links.push(...links)
      continue
    }

    bubbles.push({ text, links })
  }

  return bubbles
}

/** WhatsApp-native formatting: *bold*, _italic_, ~strike~. */
function toWhatsAppMarkdown(text) {
  return text
    .replace(/\*\*\*([^*]+)\*\*\*/g, '*$1*')
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    .replace(/`([^`]+)`/g, '$1')
}

export function renderBubble(bubble) {
  let text = bubble.text
  if (bubble.links.length) {
    text += '\n\n' + bubble.links.map((l) => `${l.label}: ${l.href}`).join('\n')
  }
  return toWhatsAppMarkdown(text).slice(0, 4000)
}

export function linksFromActions(actions) {
  if (!Array.isArray(actions)) return []
  return actions
    .filter((a) => a && a.type === 'link' && a.label && a.href)
    .map((a) => ({ label: a.label, href: a.href }))
}

export function cardsFromActions(actions) {
  if (!Array.isArray(actions)) return []
  return actions.filter((a) => a && a.type === 'card' && a.card).map((a) => a.card)
}

export function quickReplyLine(quickReplies) {
  if (!Array.isArray(quickReplies) || quickReplies.length === 0) return ''
  return `Reply: ${quickReplies.map((q) => `*${q}*`).join(' • ')}`
}

export function cardCaption(card) {
  const rent = card?.rent ? `KSh ${Number(card.rent).toLocaleString()}/mo` : null
  const location = card?.descriptive_location || card?.location || null
  const meta = [location, rent].filter(Boolean).join(' • ')
  const url = `https://www.asehanta.com/listings/${card?.id ?? ''}`
  return [`*${card?.title ?? 'House'}*`, meta, url].filter(Boolean).join('\n')
}
