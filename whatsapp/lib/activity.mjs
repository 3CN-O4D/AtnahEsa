/**
 * The bot's own activity diary.
 *
 * Every meaningful thing Ase does outbound is recorded in `whatsapp_activity`
 * so it can answer "what have I already done today?" and so admins can see it
 * in the panel. Marketing checks this table (plus `whatsapp_marketing`) before
 * posting the same house again.
 */

const MAX_SUBJECT = 200

export async function recordActivity(supabase, { kind, subject = null, detail = {}, actor = 'ase' }, log = console) {
  if (!kind) return null

  try {
    const { data, error } = await supabase
      .from('whatsapp_activity')
      .insert({
        kind: String(kind).slice(0, 80),
        subject: subject == null ? null : String(subject).slice(0, MAX_SUBJECT),
        detail: detail && typeof detail === 'object' ? detail : {},
        actor: String(actor || 'ase').slice(0, 80),
      })
      .select('id')
      .maybeSingle()

    if (error) {
      log.error?.('[activity] write failed:', error.message)
      return null
    }
    return data?.id ?? null
  } catch (error) {
    log.error?.('[activity] write threw:', error?.message ?? error)
    return null
  }
}

/** Recent activity for the admin panel. */
export async function listActivity(supabase, { limit = 100, kind = null } = {}) {
  let query = supabase
    .from('whatsapp_activity')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 300))

  if (kind) query = query.eq('kind', kind)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}
