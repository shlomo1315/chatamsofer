// תמלול הקלטה קצרה בעברית דרך ElevenLabs (Speech-to-Text, מודל scribe).
// מודול צד-שרת בלבד. המפתח משותף עם ה-TTS (app_settings 'elevenlabs_tts' / ENV).
// תיעוד: https://elevenlabs.io/docs/api-reference/speech-to-text
//
// 🔴 רץ בתוך שיחת טלפון חיה — ולכן תקרת זמן קשיחה וכישלון שקט:
// null פירושו "אין תמלול", והשיחה ממשיכה כמו לפני שהתמלול נוסף.
// אסור שתקלה אצל ElevenLabs תנתק מתקשר באמצע הזמנה.
//
// ⚠️ נבדק 05.10: scribe_v1 + language_code=heb החזיר במדויק
// "שלמה כהן, רחוב חזון איש שלושים ושתיים, דירה ארבע" תוך ~1.2 שניות.
import { getElevenConfig } from './elevenTts'

const STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text'
const STT_MODEL = 'scribe_v1'

export async function transcribeHebrew(
  audio: ArrayBuffer,
  opts: { timeoutMs?: number; filename?: string } = {},
): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? 6000
  try {
    const cfg = await getElevenConfig()
    if (!cfg?.apiKey) return null

    const fd = new FormData()
    fd.append('model_id', STT_MODEL)
    fd.append('language_code', 'heb')
    fd.append('tag_audio_events', 'false')
    fd.append('file', new Blob([audio], { type: 'audio/wav' }), opts.filename ?? 'recording.wav')

    const res = await fetch(STT_URL, {
      method: 'POST',
      headers: { 'xi-api-key': cfg.apiKey },
      body: fd,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      console.warn(`[elevenStt] ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
      return null
    }
    const j = await res.json().catch(() => null) as { text?: string } | null
    const text = String(j?.text ?? '').replace(/\s+/g, ' ').trim()
    return text || null
  } catch (e) {
    console.warn('[elevenStt] נכשל:', e instanceof Error ? e.message : e)
    return null
  }
}
