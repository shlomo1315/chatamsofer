// אינטגרציה עם ElevenLabs ליצירת קול נוירוני טבעי (Text-to-Speech) בעברית.
// מודול צד-שרת בלבד. המפתח, מזהה הקול והמודל נשמרים ב-app_settings (מפתח 'elevenlabs_tts')
// עם נפילה-לאחור ל-ENV. הקול שנוצר מועלה לימות ומושמע בשיחה במקום ה-TTS הרובוטי.
// תיעוד: https://elevenlabs.io/docs/api-reference/text-to-speech
import { getServiceClient } from '@/lib/apiAuth'

const ELEVEN_API = 'https://api.elevenlabs.io/v1'
const SETTINGS_KEY = 'elevenlabs_tts'
const DEFAULT_MODEL = 'eleven_multilingual_v2' // תומך עברית, איכות גבוהה

export type ElevenConfig = { apiKey: string; voiceId: string; modelId: string }

// קריאת ההגדרות — קודם מ-app_settings, אחרת מ-ENV. apiKey עשוי להגיע מ-ENV גם אם
// הקול/מודל נשמרו ב-DB.
export async function getElevenConfig(): Promise<ElevenConfig | null> {
  let voiceId = process.env.ELEVENLABS_VOICE_ID ?? ''
  let modelId = process.env.ELEVENLABS_MODEL_ID ?? DEFAULT_MODEL
  let apiKey = process.env.ELEVENLABS_API_KEY ?? ''

  const admin = getServiceClient()
  if (admin) {
    const { data } = await admin.from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
    if (data?.value) {
      try {
        const p = JSON.parse(data.value)
        if (p?.apiKey) apiKey = String(p.apiKey)
        if (p?.voiceId) voiceId = String(p.voiceId)
        if (p?.modelId) modelId = String(p.modelId)
      } catch { /* value אינו JSON */ }
    }
  }

  if (!apiKey || !voiceId) return null
  return { apiKey, voiceId, modelId: modelId || DEFAULT_MODEL }
}

// שמירת הגדרות. apiKey ריק = שמירה על המפתח הקיים (לא דורסים בריק).
export async function saveElevenConfig(input: { apiKey?: string; voiceId?: string; modelId?: string }): Promise<boolean> {
  const admin = getServiceClient()
  if (!admin) return false

  const { data } = await admin.from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
  let current: Record<string, string> = {}
  if (data?.value) { try { current = JSON.parse(data.value) } catch { /* ignore */ } }

  const next = {
    apiKey: input.apiKey && input.apiKey.trim() ? input.apiKey.trim() : (current.apiKey ?? process.env.ELEVENLABS_API_KEY ?? ''),
    voiceId: input.voiceId !== undefined ? String(input.voiceId).trim() : (current.voiceId ?? ''),
    modelId: input.modelId !== undefined && String(input.modelId).trim() ? String(input.modelId).trim() : (current.modelId ?? DEFAULT_MODEL),
  }

  const { error } = await admin.from('app_settings').upsert(
    { key: SETTINGS_KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return !error
}

// האם מוגדר מפתח (בלי לחשוף אותו) — לתצוגת סטטוס בהגדרות
export async function getElevenStatus(): Promise<{ hasKey: boolean; voiceId: string; modelId: string }> {
  const admin = getServiceClient()
  let cfg: Record<string, string> = {}
  if (admin) {
    const { data } = await admin.from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
    if (data?.value) { try { cfg = JSON.parse(data.value) } catch { /* ignore */ } }
  }
  const hasKey = !!(cfg.apiKey || process.env.ELEVENLABS_API_KEY)
  return { hasKey, voiceId: cfg.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? '', modelId: cfg.modelId ?? DEFAULT_MODEL }
}

export type Voice = { voiceId: string; name: string; labels?: Record<string, string>; previewUrl?: string }

// שליפת רשימת הקולות הזמינים בחשבון — לבחירה בדף ההגדרות
export async function listVoices(apiKeyOverride?: string): Promise<{ ok: boolean; voices?: Voice[]; error?: string }> {
  const apiKey = (apiKeyOverride && apiKeyOverride.trim()) || (await getElevenStatusKey())
  if (!apiKey) return { ok: false, error: 'לא מוגדר מפתח ElevenLabs' }
  try {
    const res = await fetch(`${ELEVEN_API}/voices`, { headers: { 'xi-api-key': apiKey }, cache: 'no-store' })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      const hint = res.status === 401 ? ' — המפתח שגוי או חסר הרשאות (Voices / Text-to-Speech)' : ''
      return { ok: false, error: `שגיאה (${res.status}) בשליפת הקולות${hint}${detail ? `: ${detail.slice(0, 180)}` : ''}` }
    }
    const json = await res.json() as { voices?: Array<Record<string, unknown>> }
    const voices: Voice[] = (json.voices ?? []).map((v) => ({
      voiceId: String(v.voice_id ?? ''),
      name: String(v.name ?? ''),
      labels: (v.labels as Record<string, string>) ?? undefined,
      previewUrl: v.preview_url ? String(v.preview_url) : undefined,
    }))
    return { ok: true, voices }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// עזר פנימי — מחזיר את המפתח בלבד (מ-DB או ENV)
async function getElevenStatusKey(): Promise<string> {
  const admin = getServiceClient()
  if (admin) {
    const { data } = await admin.from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
    if (data?.value) { try { const p = JSON.parse(data.value); if (p?.apiKey) return String(p.apiKey) } catch { /* ignore */ } }
  }
  return process.env.ELEVENLABS_API_KEY ?? ''
}

// יצירת דיבור מטקסט. מחזיר MP3 (ArrayBuffer). ימות ממירה אותו לפורמט הניגון שלה.
// voiceId אופציונלי — לאודישן של קול שעדיין לא נשמר כברירת מחדל.
export async function generateSpeech(
  text: string,
  opts?: { voiceId?: string },
): Promise<{ ok: boolean; audio?: ArrayBuffer; error?: string }> {
  const clean = String(text ?? '').trim()
  if (!clean) return { ok: false, error: 'אין טקסט ליצירה' }

  const cfg = await getElevenConfig()
  const voiceId = (opts?.voiceId && opts.voiceId.trim()) || cfg?.voiceId
  if (!cfg || !voiceId) return { ok: false, error: 'ElevenLabs אינו מוגדר — יש להזין מפתח API ולבחור קול בהגדרות' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    const res = await fetch(`${ELEVEN_API}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': cfg.apiKey, 'Content-Type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: clean,
        model_id: cfg.modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
      }),
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { ok: false, error: `ElevenLabs החזיר שגיאה (${res.status}): ${errText.slice(0, 200)}` }
    }
    const buf = await res.arrayBuffer()
    if (!buf.byteLength) return { ok: false, error: 'ElevenLabs החזיר אודיו ריק' }
    return { ok: true, audio: buf }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}
