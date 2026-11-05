// הודעות קבועות של המרכזיה הראשית בקול המשובט של שלמה (ElevenLabs).
//
// כל קטע טקסט קבוע נוצר פעם אחת, נשמר ב-Storage ומושמע כקישור. בשיחה עצמה רק מחפשים
// באינדקס (בלי ElevenLabs): אין קובץ או שהחיפוש נכשל → נשארים עם הטקסט, כדי שתמיד
// יוחזר JSON תקין. החלקים המשתנים (ספרות, מספר) נשארים {digits}/{text} של טכנוליין.
import { createHash } from 'node:crypto'
import { getServiceClient } from '@/lib/apiAuth'
import { generateSpeech, getElevenConfig, listVoices, saveElevenConfig } from '@/lib/elevenTts'
import { getMainMenuMessages } from '@/lib/mainMenuPhone'
import { getHolidayMessages } from '@/lib/holidayPhoneMessages'
import { getMaternityMessages } from '@/lib/maternityPhoneMessages'
import { fill } from './modules'
import type { TlFile, TlResult } from './types'

const INDEX_KEY = 'phone_voice_index'
const BUCKET = 'documents'
const DIR = 'phone-voice'
const VOICE_NAME = /my\s*voice/i
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
const FORMAT = 'pcm_8000'

type Index = { voiceId: string; hashes: Record<string, string> }

export const voiceHash = (voiceId: string, text: string) =>
  createHash('sha1').update(`${voiceId}|${text}`).digest('hex').slice(0, 16)

export const voicePath = (hash: string) => `${DIR}/${hash}.wav`

/** קטעי הטקסט הקבועים של תבנית — בלי המשתנים (הם נשארים {digits}/{text}). */
export function constantSegments(template: string): string[] {
  const vars: Record<string, TlFile> = {}
  for (const m of String(template ?? '').matchAll(/\{(\w+)\}/g)) vars[m[1]] = { digits: '0' }
  return fill(template, vars).flatMap((f) => ('text' in f ? [f.text] : []))
}

async function readIndex(): Promise<Index | null> {
  const db = getServiceClient()
  if (!db) return null
  const { data } = await db.from('app_settings').select('value').eq('key', INDEX_KEY).maybeSingle()
  if (!data?.value) return null
  try { return JSON.parse(data.value) as Index } catch { return null }
}

async function writeIndex(idx: Index) {
  const db = getServiceClient()
  if (!db) return
  await db.from('app_settings').upsert(
    { key: INDEX_KEY, value: JSON.stringify(idx), updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

let cache: { at: number; idx: Index | null } | null = null
const TTL = 60_000

async function cachedIndex(): Promise<Index | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.idx
  const idx = await readIndex()
  cache = { at: Date.now(), idx }
  return idx
}

/** מחליף {text} קבוע בקישור לקובץ הקול, כשקיים. כל כשל → הקלט המקורי. */
export async function applyVoice(result: TlResult): Promise<TlResult> {
  try {
    const idx = await cachedIndex()
    if (!idx?.voiceId || !Object.keys(idx.hashes).length) return result
    const swap = (files?: TlFile[]) => files?.map((f): TlFile => {
      if (!('text' in f) || f.voice) return f
      const h = voiceHash(idx.voiceId, f.text)
      return idx.hashes[h] === undefined ? f : { fileLink: `${SITE}/api/telephony/voice/${h}.wav`, fileName: `${h}.wav` }
    })
    const one = (r: TlResponse): TlResponse => ('files' in r && r.files ? { ...r, files: swap(r.files) } as TlResponse : r)
    return Array.isArray(result) ? result.map(one) : one(result)
  } catch (e) {
    console.warn('[telephony:voice] נפילה לטקסט:', e instanceof Error ? e.message : e)
    return result
  }
}
type TlResponse = Exclude<TlResult, unknown[]>

/** הקול "my voice": השמור בהגדרות, ואם אין — לפי שם מתוך החשבון (ונשמר). */
export async function resolveVoiceId(): Promise<string | null> {
  const cfg = await getElevenConfig()
  if (cfg?.voiceId) return cfg.voiceId
  const res = await listVoices()
  const v = res.voices?.find((x) => VOICE_NAME.test(x.name))
  if (!v) return null
  await saveElevenConfig({ voiceId: v.voiceId })
  return v.voiceId
}

/** כל הטקסטים הקבועים של MAIN (תפריט, חגים, יולדות), בלי כפילויות. */
export async function collectMainSegments(): Promise<string[]> {
  const [m, h, y] = await Promise.all([getMainMenuMessages(), getHolidayMessages(), getMaternityMessages()])
  const set = new Set<string>()
  for (const group of [m, h, y]) {
    for (const v of Object.values(group)) for (const s of constantSegments(v?.text ?? '')) set.add(s)
  }
  return [...set]
}

export type SyncResult = { ok: boolean; total: number; created: number; failed: number; error?: string }

/** יוצר קבצים לקטעים שחסרים. נעצר בכשל ראשון (מכסה/מפתח), והקיימים ממשיכים להתנגן. */
export async function syncMainVoice(): Promise<SyncResult> {
  const db = getServiceClient()
  if (!db) return { ok: false, total: 0, created: 0, failed: 0, error: 'אין חיבור למסד' }
  const voiceId = await resolveVoiceId()
  if (!voiceId) return { ok: false, total: 0, created: 0, failed: 0, error: 'לא נמצא קול בשם my voice' }
  const segments = await collectMainSegments()
  const prev = await readIndex()
  const hashes: Record<string, string> = prev?.voiceId === voiceId ? { ...prev.hashes } : {}
  const wanted: Record<string, string> = {}
  let created = 0, failed = 0, error: string | undefined
  for (const text of segments) {
    const h = voiceHash(voiceId, text)
    wanted[h] = text
    if (hashes[h] !== undefined) continue
    if (error) { failed++; continue }
    const gen = await generateSpeech(text, { voiceId, outputFormat: FORMAT })
    if (!gen.ok || !gen.audio) { error = gen.error ?? 'יצירה נכשלה'; failed++; continue }
    const up = await db.storage.from(BUCKET).upload(voicePath(h), Buffer.from(gen.audio), { contentType: 'audio/wav', upsert: true })
    if (up.error) { error = up.error.message; failed++; continue }
    hashes[h] = text
    created++
  }
  // נוסחים שהוחלפו נשארים באחסון אך יוצאים מהאינדקס, כך שלא יושמעו.
  const kept: Record<string, string> = {}
  for (const h of Object.keys(wanted)) if (hashes[h] !== undefined) kept[h] = wanted[h]
  await writeIndex({ voiceId, hashes: kept })
  cache = null
  return { ok: !error, total: segments.length, created, failed, error }
}

export async function loadVoiceFile(hash: string): Promise<ArrayBuffer | null> {
  const db = getServiceClient()
  if (!db) return null
  const { data } = await db.storage.from(BUCKET).download(voicePath(hash))
  return data ? await data.arrayBuffer() : null
}
