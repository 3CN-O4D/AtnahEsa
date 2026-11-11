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

  /*
   * Heal credentials written by older builds that dropped required fields.
   * A missing `pairingEphemeralKeyPair` makes requestPairingCode throw
   * "Cannot read properties of undefined (reading 'public')".
   */
  const defaults = initAuthCreds()
  for (const field of [
    'noiseKey',
    'pairingEphemeralKeyPair',
    'signedIdentityKey',
    'signedPreKey',
    'registrationId',
    'advSecretKey',
  ]) {
    if (creds[field] === undefined) creds[field] = defaults[field]
  }

  /*
   * requestPairingCode() writes a placeholder `me` (name "~") plus the pairing
   * code into creds before the phone has actually approved the link. Baileys
   * chooses between "register a new companion" and "log in" based on
   * `creds.me`, so a restart after an abandoned pairing attempt tries to log in
   * as a device that doesn't exist yet — WhatsApp answers `<failure reason="401">`
   * forever.
   *
   * Only drop that *unconfirmed placeholder*. A successful QR pairing leaves
   * `registered === false` but writes a real `me`, `account` and
   * `signalIdentities`; deleting those made every successful scan throw away
   * its credentials and show a fresh QR.
   */
  const unconfirmedPairing =
    !!creds.me && creds.me.name === '~' && !creds.account && !creds.signalIdentities?.length

  if (!creds.registered && unconfirmedPairing) {
    delete creds.me
    delete creds.pairingCode
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {}
          await Promise.all(
            ids.map(async (id) => {
              /*
               * Baileys 7's PN → LID bulk migration copies every PN device
               * session onto the matching LID address and deletes the PN copy.
               * Two problems make that unsafe here:
               *
               *   1. WhatsApp lists a "hosted" device (99) for some users.
               *      Migration tries to copy it to a plain @lid address, which
               *      throws "Unexpected non-hosted device JID with device 99"
               *      *before* decryption, so the whole inbound DM is dropped.
               *   2. It overwrites LID sessions that a recent outbound reply
               *      just established, so the message encrypted with that
               *      session can no longer be decrypted.
               *
               * LID sessions are created by normal sends and pre-key messages,
               * so hide the device list and skip that bulk migration.
               */
              if (type === 'device-list') {
                data[id] = undefined
                return
              }

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
