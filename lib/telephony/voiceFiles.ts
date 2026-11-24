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

const link = (h: string): TlFile => ({ fileLink: `${SITE}/api/telephony/voice/${h}.wav`, fileName: `${h}.wav` })

// ── שם המתקשר ──
// השם משתנה בכל שיחה, ולכן לא נוצר מראש. בפעם הראשונה שנשמע שם מסוים הוא מוקרא
// בקול של המרכזיה, ובמקביל (ברקע, בלי לעכב את השיחה) נוצרת הקלטה של השם בלבד
// ונשמרת לפי hash של הקול והשם. מהשיחה הבאה מושמעת ההקלטה, בלי יצירה נוספת.
// ⚠️ האחסון עצמו הוא האינדקס של השמות: syncMainVoice לא נוגע בו, ולכן "צור הקלטות
// בקולי" לא מוחק שמות.
const NAME_MARK = 'caller-name'
const NAME_RETRY_MS = 30 * 60_000
const VOICE_TTL = 10 * 60_000

/** השם בתוך הודעה (fill): קטע נפרד, כדי שהפתיח הקבוע יושמע מההקלטה והשם יוקלט לבד. */
export const nameFile = (name: string): TlFile => ({ text: name, voice: NAME_MARK })
const isName = (f: TlFile): f is { text: string; voice: string } => 'text' in f && f.voice === NAME_MARK

const knownNames = new Set<string>()
const pendingNames = new Set<string>()
let namesBlockedUntil = 0
let voiceCache: { at: number; id: string | null } | null = null

async function nameVoiceId(): Promise<string | null> {
  if (voiceCache && Date.now() - voiceCache.at < VOICE_TTL) return voiceCache.id
  const id = await resolveVoiceId().catch(() => null)
  voiceCache = { at: Date.now(), id }
  return id
}

/** יוצר הקלטה לשם אחד ושומר. פעם אחת לכל שם; כשל (מכסה/מפתח) עוצר יצירה לחצי שעה. */
async function createNameVoice(h: string, name: string, voiceId: string) {
  try {
    const db = getServiceClient()
    if (!db) return
    const gen = await generateSpeech(name, { voiceId, outputFormat: FORMAT })
    if (!gen.ok || !gen.audio) throw new Error(gen.error ?? 'יצירה נכשלה')
    const up = await db.storage.from(BUCKET).upload(voicePath(h), Buffer.from(gen.audio), { contentType: 'audio/wav', upsert: true })
    if (up.error) throw new Error(up.error.message)
    knownNames.add(h)
  } catch (e) {
    namesBlockedUntil = Date.now() + NAME_RETRY_MS
    console.warn('[telephony:voice] הקלטת שם נכשלה:', e instanceof Error ? e.message : e)
  } finally {
    pendingNames.delete(h)
  }
}

/** קישור להקלטת השם אם קיימת; אחרת הטקסט עצמו, ויצירה ברקע לפעם הבאה. */
async function nameVoice(name: string, idx: Index | null): Promise<TlFile> {
  const plain: TlFile = { text: name }
  try {
    const voiceId = await nameVoiceId()
    if (!voiceId) return plain
    const h = voiceHash(voiceId, name)
    if (knownNames.has(h) || (idx?.voiceId === voiceId && idx.hashes[h] !== undefined)) return link(h)
    // תפוס לפני הבדיקה באחסון: שיחות מקבילות לאותו שם לא יוצרות פעמיים.
    if (pendingNames.has(h)) return plain
    pendingNames.add(h)
    let creating = false
    try {
      const db = getServiceClient()
      if (!db) return plain
      const { data: exists } = await db.storage.from(BUCKET).exists(voicePath(h))
      if (exists) { knownNames.add(h); return link(h) }
      if (Date.now() >= namesBlockedUntil) { creating = true; void createNameVoice(h, name, voiceId) }
      return plain
    } finally {
      if (!creating) pendingNames.delete(h)
    }
  } catch {
    return plain
  }
}

const mapFiles = (result: TlResult, fn: (f: TlFile) => TlFile): TlResult => {
  const one = (r: TlResponse): TlResponse => ('files' in r && r.files ? { ...r, files: r.files.map(fn) } as TlResponse : r)
  return Array.isArray(result) ? result.map(one) : one(result)
}
const plainNames = (result: TlResult) => mapFiles(result, (f) => (isName(f) ? { text: f.text } : f))

/**
 * 🔴 24.11 11:50: מרגע שנכתב האינדקס (121 קבצים) המתקשרים לא שמעו כלום. הפניות לשלוחת
 * החגים צנחו בשני שלישים, ו-key=ERROR חזר כל 6 שניות (זמן ההמתנה עובר בשקט). לכן הקישורים
 * כבויים כברירת מחדל, ונדלקים רק עם PHONE_VOICE_FILES=1 אחרי אימות בשיחה אמיתית.
 */
export const voiceFilesEnabled = () => process.env.PHONE_VOICE_FILES === '1'

/** מחליף {text} קבוע ושם מתקשר בקישור לקובץ הקול, כשקיים. כל כשל → טקסט. */
export async function applyVoice(result: TlResult): Promise<TlResult> {
  if (!voiceFilesEnabled()) return plainNames(result)
  try {
    const idx = await cachedIndex()
    const names = new Map<string, TlFile>()
    mapFiles(result, (f) => { if (isName(f)) names.set(f.text, { text: f.text }); return f })
    await Promise.all([...names.keys()].map(async (n) => names.set(n, await nameVoice(n, idx))))
    return mapFiles(result, (f): TlFile => {
      if (isName(f)) return names.get(f.text) ?? { text: f.text }
      if (!('text' in f) || f.voice || !idx?.voiceId) return f
      const h = voiceHash(idx.voiceId, f.text)
      return idx.hashes[h] === undefined ? f : link(h)
    })
  } catch (e) {
    console.warn('[telephony:voice] נפילה לטקסט:', e instanceof Error ? e.message : e)
    return plainNames(result)
  }
}

/** לבדיקות בלבד. */
export function resetNameVoiceState() {
  knownNames.clear(); pendingNames.clear(); namesBlockedUntil = 0; voiceCache = null; cache = null
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
