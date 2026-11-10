import { emptyState } from './chat-state.mjs'

/**
 * One row per WhatsApp chat: the engine's flow state plus a short rolling
 * history, so a restart (or a deploy of the brain) never loses context.
 */
export async function loadSession(supabase, jid) {
  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .select('state, history, last_message_id, profile_name, phone')
    .eq('wa_jid', jid)
    .maybeSingle()

  if (error) {
    console.error('[whatsapp] loadSession failed:', error.message)
    return { state: emptyState(), history: [], lastMessageId: null, profileName: null, phone: null }
  }

  return {
    state: data?.state && Object.keys(data.state).length ? data.state : emptyState(),
    history: Array.isArray(data?.history) ? data.history : [],
    lastMessageId: data?.last_message_id ?? null,
    profileName: data?.profile_name ?? null,
    phone: data?.phone ?? null,
  }
}

export async function saveSession(supabase, jid, session) {
  const { error } = await supabase.from('whatsapp_sessions').upsert(
    {
      wa_jid: jid,
      phone: session.phone ?? null,
      profile_name: session.profileName ?? null,
      state: session.state ?? emptyState(),
      history: (session.history ?? []).slice(-12),
      last_message_id: session.lastMessageId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wa_jid' }
  )

  if (error) console.error('[whatsapp] saveSession failed:', error.message)
}

export async function resetSession(supabase, jid) {
  await saveSession(supabase, jid, {
    state: emptyState(),
    history: [],
    lastMessageId: null,
  })
}
