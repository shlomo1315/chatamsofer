import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from './apiAuth'
import { MAX_LINES } from './kvitel'
import { parseKvitelEmailText } from './kvitelEmail'
import { ingestKvitel } from './kvitelIngest'
import { parseNedarimKvitel, type ParsedNedarimKvitel } from './kvitelNedarim'
import { SAMPLE_FIELDS, fetchRows, getPullConfig, isFieldName, readJson, writeJson, type NedarimRow } from './gilyonotNedarimPull'

// ─────────────────────────────────────────────────────────────────────────────
// קוויטלאך — משיכת ההגשות מטופס הקוויטל בנדרים פלוס (Action=GetJson), כמו בגיליונות.
// במסך הניהול מזינים מוסד, מפתח (npk_) ומספר טופס, ובוחרים איזו עמודה (Field1..Field100)
// היא שם הפונה, הטלפון, המייל, טקסט חופשי, ולכל שורת שם: שם, שם האם, בן/בת ובקשה.
// כל רשומה עוברת את parseNedarimKvitel ונקלטת ב-ingestKvitel (ערוץ "nedarim"),
// עם sourceRef = nedarim-form:<ID>, כך שמשיכה חוזרת לא יוצרת כפילות.
// המשיכה ממשיכה מה-ID הגבוה שכבר נקלט. רצה כל שעה ב-instrumentation.ts.
//
// ⚠️ המפתח נשמר ב-app_settings ולעולם לא חוזר לדפדפן. בלי מפתח משלו, ואם המוסד
// זהה לזה של הגיליונות, משתמשים במפתח של הגיליונות.
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_KEY = 'kvitel_nedarim_config'
const STATE_KEY = 'kvitel_nedarim_state'
const PAGE_SIZE = 200
const MAX_PAGES_PER_RUN = 20
export const MAX_FORM_LINES = 10

export interface KvitelFormLine { name: string; mother: string; relation: string; request: string }

export interface KvitelNedarimConfig {
  mosadId: string
  apiKey: string
  tofesId: string
  contactField: string
  phoneField: string
  emailField: string
  textField: string
  lines: KvitelFormLine[]
}

export interface KvitelNedarimState { lastId: number; lastRunAt: string | null; lastAdded: number; totalAdded: number; lastError: string | null }

export type KvitelNedarimView = Omit<KvitelNedarimConfig, 'apiKey'> & { hasKey: boolean; sharedKey: boolean; state: KvitelNedarimState }

const EMPTY_CONFIG: KvitelNedarimConfig = { mosadId: '', apiKey: '', tofesId: '', contactField: '', phoneField: '', emailField: '', textField: '', lines: [] }
const EMPTY_STATE: KvitelNedarimState = { lastId: 0, lastRunAt: null, lastAdded: 0, totalAdded: 0, lastError: null }

// ── הגדרות ──
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** מנקה קלט מהמסך: רק שמות עמודות תקינים, ושורות שיש בהן לפחות עמודת שם. */
export function normalizeConfig(input: Partial<KvitelNedarimConfig>, prevKey = ''): KvitelNedarimConfig {
  const lines = (Array.isArray(input.lines) ? input.lines : []).slice(0, MAX_FORM_LINES)
    .map(l => ({ name: str(l?.name), mother: str(l?.mother), relation: str(l?.relation), request: str(l?.request) }))
    .filter(l => l.name)
  return {
    mosadId: str(input.mosadId), tofesId: str(input.tofesId), apiKey: str(input.apiKey) || prevKey,
    contactField: str(input.contactField), phoneField: str(input.phoneField), emailField: str(input.emailField),
    textField: str(input.textField), lines,
  }
}

export function validateKvitelConfig(c: KvitelNedarimConfig): string | null {
  if (!/^\d{7}$/.test(c.mosadId)) return 'מספר המוסד צריך להיות 7 ספרות'
  if (!/^\d{1,10}$/.test(c.tofesId)) return 'מספר הטופס צריך להיות מספר'
  if (c.apiKey && !/^npk_[A-Za-z0-9_-]{4,200}$/.test(c.apiKey)) return 'מפתח ה-API צריך להתחיל ב-npk_'
  const fields = [c.contactField, c.phoneField, c.emailField, c.textField, ...c.lines.flatMap(l => [l.name, l.mother, l.relation, l.request])]
  if (fields.some(f => f && !isFieldName(f))) return 'שם עמודה לא תקין'
  if (!c.textField && !c.lines.length) return 'צריך לבחור לפחות עמודה אחת של שמות (שורת שם או טקסט חופשי)'
  return null
}

const isMapped = (c: KvitelNedarimConfig) => !!(c.textField || c.lines.length)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?[\d\s-]{9,15}$/
const NAME_LINE_RE = /(?:^|\s)(?:בן|בת)\s+\S/

/**
 * בלי בחירת עמודות: כל עמודה שנראית כמו מייל או טלפון נלקחת ככזו,
 * וכל עמודה עם "בן" או "בת" נכנסת לטקסט החופשי. כך "משיכה עכשיו" עובדת מיד.
 */
export function autoKvitelBody(row: NedarimRow): Record<string, string> {
  const body: Record<string, string> = { ClientName: '', Phone: '', Mail: '', Comments: '' }
  const free: string[] = []
  for (const [k, raw] of Object.entries(row)) {
    if (!/^Field\d/.test(k)) continue
    const v = str(raw)
    if (!v) continue
    if (!body.Mail && EMAIL_RE.test(v)) body.Mail = v
    else if (!body.Phone && PHONE_RE.test(v)) body.Phone = v
    else if (NAME_LINE_RE.test(v)) free.push(v)
  }
  body.Comments = free.join('\n')
  return body
}

/** כל העמודות שצריך לבקש מנדרים, בלי כפילויות. */
export function configFields(c: KvitelNedarimConfig): string[] {
  if (!isMapped(c)) return [...SAMPLE_FIELDS]
  const all = [c.contactField, c.phoneField, c.emailField, c.textField, ...c.lines.flatMap(l => [l.name, l.mother, l.relation, l.request])]
  return [...new Set(all.filter(isFieldName))]
}

// ── מיפוי רשומה להגשה ──
/**
 * בונה מהרשומה גוף בשמות ש-parseNedarimKvitel מכיר, ומפענח אותו.
 * שורה שאין לה עמודת שם האם (שם מלא בשדה אחד, "משה בן שרה") עוברת לפענוח כטקסט חופשי.
 */
export function mapKvitelRow(row: NedarimRow, c: KvitelNedarimConfig): ParsedNedarimKvitel {
  if (!isMapped(c)) {
    const p = parseNedarimKvitel(autoKvitelBody(row))
    p.sourceRef = row.ID ? `nedarim-form:${row.ID}` : null
    return p
  }
  const get = (f: string) => (f ? str(row[f]) : '')
  const body: Record<string, string> = { ClientName: get(c.contactField), Phone: get(c.phoneField), Mail: get(c.emailField) }
  const free = [get(c.textField)]
  let n = 0
  for (const l of c.lines) {
    const name = get(l.name)
    if (!name) continue
    if (!l.mother) { free.push([name, get(l.request)].filter(Boolean).join(' ')); continue }
    n++
    Object.assign(body, { [`name${n}`]: name, [`mother${n}`]: get(l.mother), [`relation${n}`]: get(l.relation), [`request${n}`]: get(l.request) })
  }
  body.Comments = free.filter(Boolean).join('\n')
  const p = parseNedarimKvitel(body)
  // parseNedarimKvitel מפענח טקסט חופשי רק כשאין שורות מובנות. כאן יש גם וגם, אז מוסיפים אותו.
  if (n && p.freeText) {
    const extra = parseKvitelEmailText('', p.freeText)
    extra.lines.forEach((line, i) => {
      if (p.lines.length < MAX_LINES) { p.lines.push(line); p.flags.push(extra.flags[i]) }
    })
  }
  p.sourceRef = row.ID ? `nedarim-form:${row.ID}` : null
  return p
}

// ── קריאה ושמירה ──
async function readConfig(db: SupabaseClient): Promise<KvitelNedarimConfig> {
  const c = await readJson(db, CONFIG_KEY, EMPTY_CONFIG)
  return { ...c, lines: Array.isArray(c.lines) ? c.lines : [] }
}
export const getKvitelPullState = (db: SupabaseClient) => readJson(db, STATE_KEY, EMPTY_STATE)

/** המפתח בפועל: של הקוויטל, ואם אין — של הגיליונות כשהמוסד זהה. */
async function resolveKey(db: SupabaseClient, c: KvitelNedarimConfig): Promise<{ key: string; shared: boolean }> {
  if (c.apiKey) return { key: c.apiKey, shared: false }
  if (!c.mosadId) return { key: '', shared: false }
  const g = await getPullConfig(db)
  return g.apiKey && g.mosadId === c.mosadId ? { key: g.apiKey, shared: true } : { key: '', shared: false }
}

async function getReadyConfig(db: SupabaseClient): Promise<KvitelNedarimConfig | null> {
  const c = await readConfig(db)
  const { key } = await resolveKey(db, c)
  return c.mosadId && c.tofesId && key ? { ...c, apiKey: key } : null
}

export async function getKvitelPullView(db: SupabaseClient): Promise<KvitelNedarimView> {
  const [c, state] = await Promise.all([readConfig(db), getKvitelPullState(db)])
  const { key, shared } = await resolveKey(db, c)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { apiKey: _apiKey, ...rest } = c
  return { ...rest, hasKey: !!key, sharedKey: shared, state }
}

/** שמירה. מפתח ריק = משאירים את הקיים. החלפת מוסד או טופס מתחילה את המשיכה מההתחלה. */
export async function saveKvitelPullConfig(db: SupabaseClient, input: Partial<KvitelNedarimConfig>): Promise<{ ok: true } | { ok: false; error: string }> {
  const prev = await readConfig(db)
  const next = normalizeConfig(input, prev.apiKey)
  // מיפוי עוד לא נבחר בשלב הראשון: מותר לשמור רק חיבור, כדי לטעון דוגמה
  const err = validateKvitelConfig(isMapped(next) ? next : { ...next, textField: 'Field1' })
  if (err) return { ok: false, error: err }
  if (!(await writeJson(db, CONFIG_KEY, next))) return { ok: false, error: 'השמירה נכשלה' }
  if (prev.mosadId !== next.mosadId || prev.tofesId !== next.tofesId) {
    await writeJson(db, STATE_KEY, { ...(await getKvitelPullState(db)), lastId: 0, lastError: null })
  }
  return { ok: true }
}

/** חמש ההגשות האחרונות עם כל העמודות, כדי לבחור במסך איזו עמודה היא מה. */
export async function loadKvitelSample(db: SupabaseClient) {
  const c = await getReadyConfig(db)
  if (!c) return { ok: false as const, error: 'צריך קודם לשמור מספר מוסד, מפתח ומספר טופס' }
  let res = await fetchRows(c, SAMPLE_FIELDS, { lastId: 0, max: 5, desc: true })
  // נדרים לא תמיד מכבד סדר יורד: אם חזר ריק, מנסים גם בסדר רגיל
  if (res.ok && !res.rows.length) res = await fetchRows(c, SAMPLE_FIELDS, { lastId: 0, max: 5 })
  return res.ok ? { ok: true as const, rows: res.rows } : res
}

// ── המשיכה עצמה ──
export interface KvitelPullResult { ok: boolean; skipped?: 'not_configured' | 'running'; added: number; review: number; exists: number; empty: number; lastId: number; error?: string }

let running: Promise<KvitelPullResult> | null = null

export function pullKvitelFromNedarim(dbArg?: SupabaseClient): Promise<KvitelPullResult> {
  if (running) return Promise.resolve({ ok: false, skipped: 'running', added: 0, review: 0, exists: 0, empty: 0, lastId: 0 })
  running = doPull(dbArg).finally(() => { running = null })
  return running
}

async function doPull(dbArg?: SupabaseClient): Promise<KvitelPullResult> {
  const out: KvitelPullResult = { ok: true, added: 0, review: 0, exists: 0, empty: 0, lastId: 0 }
  const db = dbArg ?? getServiceClient()
  if (!db) return { ...out, ok: false, error: 'השרת אינו מוגדר' }
  const c = await getReadyConfig(db)
  if (!c) return { ...out, ok: false, skipped: 'not_configured' }
  const state = await getKvitelPullState(db)
  out.lastId = state.lastId
  const fields = configFields(c)

  pages: for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    const res = await fetchRows(c, fields, { lastId: out.lastId, max: PAGE_SIZE })
    if (!res.ok) { out.ok = false; out.error = res.error; break }
    const rows = res.rows.map(r => ({ r, id: Number(r.ID) })).filter(x => x.id > out.lastId).sort((a, b) => a.id - b.id)
    if (!rows.length) break
    for (const { r, id } of rows) {
      const p = mapKvitelRow(r, c)
      if (!p.lines.length && !p.freeText) out.empty++
      else {
        const s = await ingestKvitel(db, {
          channel: 'nedarim', phone: p.phone, email: p.email, contactName: p.contactName,
          lines: p.lines, lineFlags: p.flags, rawText: p.rawText, sourceRef: p.sourceRef,
        })
        // שמירה נכשלה: עוצרים לפני הרשומה הזו, והריצה הבאה תנסה אותה שוב
        if (!s.ok) { out.ok = false; out.error = s.error; break pages }
        if (s.duplicate) out.exists++
        else { out.added++; if (s.status === 'review') out.review++ }
      }
      out.lastId = id
    }
    if (res.rows.length < PAGE_SIZE) break
  }

  await writeJson(db, STATE_KEY, {
    lastId: out.lastId, lastRunAt: new Date().toISOString(), lastAdded: out.added,
    totalAdded: state.totalAdded + out.added, lastError: out.error ?? null,
  } satisfies KvitelNedarimState)
  return out
}
