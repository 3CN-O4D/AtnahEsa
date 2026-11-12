/**
 * Text-to-speech voice notes for urgent admin alerts.
 *
 * Edge TTS is free and needs no API key. It returns MP3; WhatsApp voice notes
 * require OGG/Opus, so ffmpeg converts on the fly (installed in the Docker
 * image). If TTS or ffmpeg is unavailable the caller falls back to the text
 * alert — a missing voice note must never block an urgent message.
 */

import { spawn } from 'node:child_process'

export const DEFAULT_TTS_VOICE = 'en-KE-AsiliaNeural'

/**
 * Admins asked for slower, clearer voice notes. 0.7 is 70% of the normal
 * speaking rate; override with `TTS_RATE` when debugging.
 */
export const DEFAULT_TTS_RATE = Number(process.env.TTS_RATE) || 0.7

let edgeModule = null

async function loadEdgeTts() {
  if (!edgeModule) edgeModule = await import('msedge-tts')
  return edgeModule
}

function mp3ToOggOpus(mp3) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-c:a',
        'libopus',
        '-b:a',
        '32k',
        '-ar',
        '48000',
        '-ac',
        '1',
        '-f',
        'ogg',
        'pipe:1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    )

    const output = []
    const errors = []

    ffmpeg.stdout.on('data', (chunk) => output.push(chunk))
    ffmpeg.stderr.on('data', (chunk) => errors.push(chunk))
    ffmpeg.on('error', (error) => reject(error))
    ffmpeg.on('close', (code) => {
      if (code === 0 && output.length) {
        resolve(Buffer.concat(output))
      } else {
        reject(
          new Error(
            `ffmpeg exited ${code}: ${Buffer.concat(errors).toString('utf8').slice(0, 200)}`
          )
        )
      }
    })

    ffmpeg.stdin.end(mp3)
  })
}

/**
 * @param {string} text
 * @param {{ voice?: string, maxChars?: number, rate?: number|string }} options
 * @returns {Promise<Buffer|null>} OGG/Opus buffer ready for `{ audio, ptt: true }`
 */
export async function toWhatsAppVoiceNote(
  text,
  { voice = DEFAULT_TTS_VOICE, maxChars = 600, rate = DEFAULT_TTS_RATE } = {}
) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)

  if (!clean) return null

  const { MsEdgeTTS, OUTPUT_FORMAT } = await loadEdgeTts()
  const tts = new MsEdgeTTS()

  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    const { audioStream } = tts.toStream(clean, { rate })

    const chunks = []
    for await (const chunk of audioStream) chunks.push(Buffer.from(chunk))

    const mp3 = Buffer.concat(chunks)
    if (!mp3.length) throw new Error('TTS returned no audio')

    return await mp3ToOggOpus(mp3)
  } finally {
    try {
      tts.close?.()
    } catch {
      /* the socket is already gone */
    }
  }
}
