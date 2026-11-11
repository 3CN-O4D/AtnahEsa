/**
 * Turns the engine's web reply into WhatsApp messages.
 *
 * Same `---` bubble marker as the site, with the same tolerance for messy
 * model output, plus `[[button|url]]` markers converted into plain links
 * (WhatsApp auto-links URLs) and house cards turned into captions.
 *
 * WhatsApp is a chat, not a letter. A single long paragraph reads like a bot,
 * so replies are broken into short, human-sized bubbles: blank lines first,
 * then sentence boundaries, and only then a hard word-wrap. The worker sends
 * at most ten, each with a typing pause.
 */

const BUTTON_RE = /\[\[([^|\]]+)\|([^\]]+)\]\]/g
const SEPARATOR = '(?:-{3,}|\u2014{3,}|_{3,}|\\*{3,})'
const SEPARATOR_LINE_RE = new RegExp(`^[ \\t]*(?:${SEPARATOR}|(?:-[ \\t]+){2,}-|\\u2014|\\u2013)[ \\t]*$`, 'gm')
const SEPARATOR_INLINE_RE = new RegExp(`[ \\t]+${SEPARATOR}[ \\t]+`, 'g')
const LIST_LINE_RE = /^\s*(?:[-*•]|\d+[.)])\s+/
/** Sentence boundary: punctuation followed by space + a capital/quote/number. */
const SENTENCE_RE = /(?<=[.!?…])\s+(?=[A-Z0-9"'“”‘’([])/

/** Split a single over-long block into word-boundary chunks. */
function hardSplit(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const chunks = []
  let current = ''

  for (const word of words) {
    if (current && (current + ' ' + word).length > maxChars) {
      chunks.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }
  if (current) chunks.push(current)

  return chunks.flatMap((chunk) =>
    chunk.length <= maxChars
      ? [chunk]
      : chunk.match(new RegExp(`.{1,${Math.max(20, maxChars)}}`, 'gs')) || [chunk]
  )
}

/**
 * Split a paragraph into bubbles of roughly `maxChars`.
 *
 * Lists stay on their own lines so a bullet never loses its marker. A short
 * paragraph is left alone: only text that would fill more than a phone screen
 * gets broken up.
 */
function splitBlock(block, maxChars) {
  if (block.length <= maxChars) return [block]

  const lines = block.split('\n')
  const isList = lines.length > 1 && lines.some((line) => LIST_LINE_RE.test(line))

  if (isList) {
    const chunks = []
    let current = ''
    for (const line of lines) {
      if (current && (current + '\n' + line).length > maxChars) {
        chunks.push(current)
        current = line
      } else {
        current = current ? `${current}\n${line}` : line
      }
    }
    if (current) chunks.push(current)
    return chunks.flatMap((chunk) => (chunk.length <= maxChars * 1.15 ? [chunk] : hardSplit(chunk, maxChars)))
  }

  const sentences = block.split(SENTENCE_RE)
  const chunks = []
  let current = ''

  for (const sentence of sentences) {
    if (current && (current + ' ' + sentence).length > maxChars) {
      chunks.push(current)
      current = sentence
    } else {
      current = current ? `${current} ${sentence}` : sentence
    }
  }
  if (current) chunks.push(current)

  return chunks.flatMap((chunk) => (chunk.length <= maxChars * 1.2 ? [chunk] : hardSplit(chunk, maxChars)))
}

/** @returns {{ text: string, links: { label: string, href: string }[] }[]} */
export function splitBubbles(raw, { maxBubbles = 10, maxChars = 360 } = {}) {
  if (!raw) return []

  const normalised = String(raw)
    .replace(/\r\n?/g, '\n')
    .replace(SEPARATOR_LINE_RE, '\u0000')
    .replace(SEPARATOR_INLINE_RE, '\u0000')

  const bubbles = []

  for (const piece of normalised.split('\u0000')) {
    const links = []
    const clean = piece
      .replace(BUTTON_RE, (_match, label, href) => {
        const cleanLabel = String(label).trim()
        const cleanHref = String(href).trim()
        if (cleanLabel && cleanHref) links.push({ label: cleanLabel, href: cleanHref })
        return ''
      })
      .replace(/^[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (!clean) {
      if (links.length && bubbles.length) bubbles[bubbles.length - 1].links.push(...links)
      continue
    }

    const paragraphs = clean
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)

    const pieceBubbles = paragraphs.flatMap((paragraph) =>
      splitBlock(paragraph, maxChars).map((text) => ({ text, links: [] }))
    )

    if (links.length && pieceBubbles.length) {
      pieceBubbles[pieceBubbles.length - 1].links.push(...links)
    }

    bubbles.push(...pieceBubbles)
  }

  if (bubbles.length <= maxBubbles) return bubbles

  /*
   * A model can ramble past ten bubbles. Keep the first nine distinct and fold
   * the remainder into the tenth so a send never turns into a wall of twenty
   * notifications.
   */
  const head = bubbles.slice(0, maxBubbles - 1)
  const tail = bubbles.slice(maxBubbles - 1)
  head.push({
    text: tail.map((bubble) => bubble.text).join('\n\n').slice(0, 4000),
    links: tail.flatMap((bubble) => bubble.links),
  })
  return head
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
