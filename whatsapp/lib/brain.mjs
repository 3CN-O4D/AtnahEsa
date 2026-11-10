/**
 * Calls the AseHanta brain on Vercel. Keeping the AI, tools and flows in the
 * Next.js app means WhatsApp and the website share one source of truth — a
 * deploy updates both channels at once.
 */
export function createBrain({ url, secret }) {
  const endpoint = `${url.replace(/\/$/, '')}/api/whatsapp/chat`

  return async function ask({ message, state, history, phone, name }) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bridge-secret': secret,
      },
      body: JSON.stringify({ message, state, history, phone, name }),
      signal: AbortSignal.timeout(28_000),
    })

    const data = await res.json().catch(() => null)
    if (!data || typeof data.reply !== 'string') {
      throw new Error(`brain returned ${res.status}`)
    }
    return data
  }
}
