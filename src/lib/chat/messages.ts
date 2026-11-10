/** Client-safe constants shared by the chat UI and the server engine. */

/** Get a time-appropriate greeting in English. */
export function timeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning 🌅'
  if (hour < 17) return 'Good afternoon ☀️'
  if (hour < 21) return 'Good evening 🌇'
  return 'Good evening 🌙'
}

/** Opening messages are sent one per bubble, the way a real person texts on WhatsApp.
 * The first bubble is a time-based greeting so it feels personal.
 */
export const OPENING_MESSAGES: string[] = [
  '{GREETING}',
  `I'm Ase, your AseHanta assistant 👋`,
  `How can I help you today?`,
  `Ask me about houses, WiFi, movers, escrow — or anything else.`,
]

/** Build the opening array with the time greeting filled in. */
export function buildOpeningMessages(): string[] {
  return OPENING_MESSAGES.map((m) => (m === '{GREETING}' ? timeGreeting() : m))
}

export const QUICK_START: string[] = [
  '🏠 Find me a house',
  '📊 House stats',
  '📶 WiFi packages',
  '🚚 Movers',
  '📄 Terms & escrow',
  '📞 Contact',
]