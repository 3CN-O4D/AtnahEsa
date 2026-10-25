import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { sendBulkAnnouncementEmail } from '../src/lib/email'

const env = readFileSync('.env', 'utf-8').split('\n').reduce<Record<string,string>>((acc, line) => {
  const i = line.indexOf('=')
  if (i > 0) {
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim()
    if (k) acc[k] = v
  }
  return acc
}, {})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function run() {
  const emails = new Set<string>()
  
  // from auth users
  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    if (!data.users.length) break
    for (const u of data.users) {
      if (u.email && u.email_confirmed_at) emails.add(u.email.toLowerCase())
    }
    if (data.users.length < perPage) break
    page++
  }
  
  // also from profiles if they have emails
  const { data: profiles } = await supabase.from('profiles').select('email').not('email', 'is', null)
  if (profiles) {
    for (const p of profiles) {
      if (p.email) emails.add(p.email.toLowerCase())
    }
  }
  
  const list = Array.from(emails).sort()
  console.log(`Sending to ${list.length} users...`)
  
  let sent = 0, failed = 0
  for (const email of list) {
    try {
      await sendBulkAnnouncementEmail(email)
      sent++
      if (sent % 10 === 0) console.log(`Sent ${sent}/${list.length}`)
      // rate limit a bit
      await new Promise(r => setTimeout(r, 200))
    } catch (e: any) {
      failed++
      console.error(`Failed ${email}:`, e.message)
    }
  }
  console.log(`Done. Sent: ${sent}, Failed: ${failed}`)
}

run().catch(e => { console.error(e); process.exit(1) })
