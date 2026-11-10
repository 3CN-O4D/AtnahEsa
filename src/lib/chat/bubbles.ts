import type { ChatAction } from './types'

/**
 * Bubble parsing for Ase's replies.
 *
 * The model separates chat bubbles with a marker line (`---` on its own line).
 * Real model output is messy, so this tolerates:
 *  - separators padded with spaces or indented
 *  - 3+ dashes / em dashes / underscores / asterisks
 *  - separators at the start or end of the reply
 *  - several separators in a row (no empty bubbles)
 *  - separators written inline with spaces around them
 *  - `[[button text|url]]` markers split onto their own bubble
 *
 * It never returns an empty bubble: a segment with only buttons is folded
 * into the previous bubble so the UI can't render a blank message.
 */

const SEPARATOR = '(?:-{3,}|\\u2014{3,}|_{3,}|\\*{3,})'
const SEPARATOR_LINE = `(?:${SEPARATOR}|(?:-[ \\t]+){2,}-|\\u2014|\\u2013)`
const SEPARATOR_LINE_RE = new RegExp(`^[ \\t]*${SEPARATOR_LINE}[ \\t]*$`, 'gm')
const SEPARATOR_INLINE_RE = new RegExp(`[ \\t]+${SEPARATOR}[ \\t]+`, 'g')
const BUTTON_RE = /\[\[([^|\]]+)\|([^\]]+)\]\]/g

export interface ParsedBubble {
  text: string
  buttons: ChatAction[]
}

function extractButtons(segment: string): ParsedBubble {
  const buttons: ChatAction[] = []
  const text = segment
    .replace(BUTTON_RE, (_match, label: string, href: string) => {
      const cleanLabel = label.trim()
      const cleanHref = href.trim()
      if (cleanLabel && cleanHref) {
        buttons.push({ type: 'link', label: cleanLabel, href: cleanHref })
      }
      return ''
    })
    // Drop lines that became empty after removing markers.
    .replace(/^[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { text, buttons }
}

export function splitBubbles(raw: string): ParsedBubble[] {
  if (!raw) return []

  const normalised = raw
    .replace(/\r\n?/g, '\n')
    .replace(SEPARATOR_LINE_RE, '\u0000')
    .replace(SEPARATOR_INLINE_RE, '\u0000')

  const bubbles: ParsedBubble[] = []

  for (const segment of normalised.split('\u0000')) {
    const bubble = extractButtons(segment)

    if (!bubble.text) {
      // Nothing to say — fold any buttons into the previous bubble instead of
      // showing a blank bubble, or drop the segment entirely.
      if (bubble.buttons.length > 0 && bubbles.length > 0) {
        bubbles[bubbles.length - 1].buttons.push(...bubble.buttons)
      }
      continue
    }

    bubbles.push(bubble)
  }

  if (bubbles.length === 0) {
    const fallback = extractButtons(raw)
    if (fallback.text || fallback.buttons.length > 0) bubbles.push(fallback)
  }

  return bubbles
}
