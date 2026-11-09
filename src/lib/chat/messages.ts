/** Client-safe constants shared by the chat UI and the server engine. */

/**
 * Opening messages are sent one per bubble, the way a real person texts on
 * WhatsApp — short lines, one thought per message, natural pauses between.
 */
export const OPENING_MESSAGES: string[] = [
  `Hi, I'm Ase 👋`,
  `I'm a virtual assistant for AseHanta 🏠`,
  `How can I be of help today?`,
  `I currently can do the following:`,
  `🏠 Find you a house\n📝 Request a house for you\n📊 Show you our stats\n📶 Help with WiFi packages\n🚚 Arrange a mover\n📄 Explain escrow & terms\n📞 Get you in touch with our team`,
  `Just ask 🙂`,
]

/** Single-string variant for any code that needs the whole intro at once. */
export const OPENING_MESSAGE = OPENING_MESSAGES.join('\n\n')

export const QUICK_START: string[] = [
  '🏠 Find me a house',
  '📊 House stats',
  '📶 WiFi packages',
  '🚚 Movers',
  '📄 Terms & escrow',
  '📞 Contact',
]
