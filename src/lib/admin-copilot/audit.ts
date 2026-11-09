import type { AdminContext } from './auth'

export interface AuditEntry {
  tool: string
  args: Record<string, unknown>
  status: 'ok' | 'error'
  summary?: string
  error?: string
}

/**
 * Persist a mutation (and sensitive read) to the audit trail.
 *
 * Auditing must never block or break an admin action. If the audit table has
 * not been migrated yet we still emit a structured server log so the event is
 * recoverable from Vercel logs.
 */
export async function auditAction(ctx: AdminContext, entry: AuditEntry): Promise<void> {
  const row = {
    admin_id: ctx.userId,
    actor_email: ctx.email,
    tool: entry.tool,
    args: entry.args,
    status: entry.status,
    summary: entry.summary ?? null,
    error: entry.error ?? null,
    ip: ctx.ip,
    created_at: new Date().toISOString(),
  }

  try {
    const { error } = await ctx.db.from('admin_copilot_audit').insert(row)
    if (error) throw error
  } catch (err) {
    console.error(
      '[admin-copilot][audit]',
      JSON.stringify({
        ...row,
        audit_error: err instanceof Error ? err.message : String(err),
      })
    )
  }
}
