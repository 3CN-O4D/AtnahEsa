import { createClient } from '@supabase/supabase-js'
import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys'

/**
 * Baileys auth state persisted in Supabase.
 *
 * Baileys normally writes a folder of JSON files; serverless hosts have no
 * durable disk, so every credential and Signal key is stored in the
 * `whatsapp_auth` table instead. The number only has to be paired once.
 */
export function createSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'asehanta-whatsapp' } },
  })
}

export async function useSupabaseAuthState(supabase, prefix = 'asehanta') {
  const table = supabase.from('whatsapp_auth')
  const fullKey = (id) => `${prefix}:${id}`

  const readData = async (id) => {
    const { data, error } = await table.select('value').eq('key', fullKey(id)).maybeSingle()
    if (error) throw error
    if (!data) return null
    return JSON.parse(JSON.stringify(data.value), BufferJSON.reviver)
  }

  const writeData = async (data, id) => {
    const value = JSON.parse(JSON.stringify(data, BufferJSON.replacer))
    const { error } = await supabase
      .from('whatsapp_auth')
      .upsert({ key: fullKey(id), value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) throw error
  }

  const removeData = async (id) => {
    const { error } = await supabase.from('whatsapp_auth').delete().eq('key', fullKey(id))
    if (error) throw error
  }

  const creds = (await readData('creds')) || initAuthCreds()

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {}
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`)
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value)
              }
              data[id] = value
            })
          )
          return data
        },
        set: async (data) => {
          const tasks = []
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id]
              tasks.push(value ? writeData(value, `${category}-${id}`) : removeData(`${category}-${id}`))
            }
          }
          await Promise.all(tasks)
        },
      },
    },
    saveCreds: () => writeData(creds, 'creds'),
  }
}

/** Remove every stored pairing key — use after "log out from all devices". */
export async function clearAuthState(supabase, prefix = 'asehanta') {
  const { error } = await supabase.from('whatsapp_auth').delete().like('key', `${prefix}:%`)
  if (error) throw error
}
