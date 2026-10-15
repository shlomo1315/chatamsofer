import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from './apiAuth'
import { nedarimFetch } from './nedarimFetch'
import { DETECT_FIELDS, detectColumns } from './gilyonotDetect'
import { normalizeEmail, cleanSubscriberName, subscribeGilyonot } from './gilyonot'

// ─────────────────────────────────────────────────────────────────────────────
// גיליונות — משיכת הנרשמים מטופס בנדרים פלוס דרך ה-API של הטפסים (Action=GetJson).
// במסך הניהול מזינים מספר מוסד, מפתח API (npk_) ומספר טופס, ובוחרים איזו עמודה
// (Field1..Field100) היא המייל, השם, ואישור קבלת המייל. כל רשומה נכנסת דרך
// subscribeGilyonot (מקור "nedarim"), והמשיכה ממשיכה מה-ID הגבוה שכבר נקלט.
// רצה כל שעה ב-instrumentation.ts, ואפשר להפעיל ידנית מהמסך.
//
// ⚠️ המפתח נשמר ב-app_settings (service-role בלבד) ולעולם לא חוזר לדפדפן.
// ⚠️ המשיכה לא מחזירה לרשימה מי שהסיר את עצמו, כי היא קוראת גם הגשות ישנות.
// ─────────────────────────────────────────────────────────────────────────────

export const NEDARIM_FORMS_URL = 'https://matara.pro/nedarimplus/Forms/Manage.aspx'
const CONFIG_KEY = 'gilyonot_nedarim_config'
const STATE_KEY = 'gilyonot_nedarim_state'
const PAGE_SIZE = 500
const MAX_PAGES_PER_RUN = 40
// כל העמודות: המייל יכול לשבת בכל Field, וזיהוי לפי 15 הראשונות פספס אותו
export const SAMPLE_FIELDS = DETECT_FIELDS

export interface NedarimPullConfig {
  mosadId: string
  apiKey: string
  tofesId: string
  emailField: string
  nameField: string
  consentField: string
}

export interface NedarimPullState {
  lastId: number
  lastRunAt: string | null
  lastAdded: number
  totalAdded: number
  lastError: string | null
}

/** מה שהמסך רואה: הכול חוץ מהמפתח עצמו. */
export type NedarimPullView = Omit<NedarimPullConfig, 'apiKey'> & { hasKey: boolean; state: NedarimPullState }

export type NedarimRow = Record<string, string>

const EMPTY_CONFIG: NedarimPullConfig = { mosadId: '', apiKey: '', tofesId: '', emailField: '', nameField: '', consentField: '' }
const EMPTY_STATE: NedarimPullState = { lastId: 0, lastRunAt: null, lastAdded: 0, totalAdded: 0, lastError: null }

// ── אימות ──
const FIELD_RE = /^Field(?:[1-9]|[1-9]\d|100|(?:[1-9]|10)Max)$/

export function isFieldName(v: unknown): v is string {
  return typeof v === 'string' && FIELD_RE.test(v)
}

export function validateConfig(c: NedarimPullConfig): string | null {
  if (!/^\d{7}$/.test(c.mosadId)) return 'מספר המוסד צריך להיות 7 ספרות'
  if (!/^\d{1,10}$/.test(c.tofesId)) return 'מספר הטופס צריך להיות מספר'
  if (c.apiKey && !/^npk_[A-Za-z0-9_-]{4,200}$/.test(c.apiKey)) return 'מפתח ה-API צריך להתחיל ב-npk_'
  for (const f of [c.emailField, c.nameField, c.consentField]) {
    if (f && !isFieldName(f)) return 'שם עמודה לא תקין'
  }
  return null
}

export const isReady = (c: NedarimPullConfig) => !!(c.mosadId && c.apiKey && c.tofesId)

// ── הקריאה לנדרים ──
/** GetJsonParam: מבקשים רק את העמודות שממופות, כל אחת בשמה. */
export function buildGetJsonParam(fields: string[]): string {
  return JSON.stringify(Object.fromEntries([...new Set(fields.filter(isFieldName))].map(f => [f, f])))
}

/** תשובת GetJson: מערך רשומות (כל הערכים מחרוזות), או { Status: 'Error', Message }. */
export function parseGetJson(text: string): { ok: true; rows: NedarimRow[] } | { ok: false; error: string } {
  let data: unknown
  try { data = JSON.parse(text.replace(/^﻿/, '')) } catch {
    return { ok: false, error: `תשובה לא צפויה מנדרים: ${text.trim().slice(0, 120) || 'ריקה'}` }
  }
  if (Array.isArray(data)) {
    const rows = data
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? '' : String(v)])))
      .filter(r => /^\d+$/.test(r.ID ?? ''))
    return { ok: true, rows }
  }
  if (data && typeof data === 'object' && (data as Record<string, unknown>).Status === 'Error') {
    return { ok: false, error: String((data as Record<string, unknown>).Message ?? 'שגיאה מנדרים').slice(0, 300) }
  }
  return { ok: false, error: 'תשובה לא צפויה מנדרים' }
}

export async function fetchRows(c: NedarimPullConfig, fields: string[], opts: { lastId: number; max: number; desc?: boolean }) {
  const body = new URLSearchParams({
    Action: 'GetJson', MosadId: c.mosadId, ApiPassword: c.apiKey, TofesId: c.tofesId,
    MaxId: String(opts.max), LastId: String(opts.lastId), GetJsonParam: buildGetJsonParam(fields),
  })
  if (opts.desc) body.set('Order', 'Desc')
  let res: Response
  try {
    res = await nedarimFetch(NEDARIM_FORMS_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return { ok: false as const, error: 'אין חיבור לנדרים פלוס' }
  }
  if (!res.ok) return { ok: false as const, error: `נדרים פלוס החזירו שגיאה ${res.status}` }
  return parseGetJson(await res.text())
}

// ── מיפוי רשומה לנרשם ──
const NO_CONSENT = /^(?:|0|false|no|n|off|לא)$/i

export type MappedRow =
  | { ok: true; email: string; name: string | null; sourceRef: string }
  | { ok: false; reason: 'invalid_email' | 'no_consent' }

export function mapRow(row: NedarimRow, c: Pick<NedarimPullConfig, 'emailField' | 'nameField' | 'consentField'>): MappedRow {
  if (c.consentField && NO_CONSENT.test((row[c.consentField] ?? '').trim())) return { ok: false, reason: 'no_consent' }
  const email = normalizeEmail(row[c.emailField])
  if (!email) return { ok: false, reason: 'invalid_email' }
  return { ok: true, email, name: c.nameField ? cleanSubscriberName(row[c.nameField]) : null, sourceRef: `nedarim-form:${row.ID}` }
}

// ── שמירה ב-app_settings ──
export async function readJson<T>(db: SupabaseClient, key: string, fallback: T): Promise<T> {
  const { data } = await db.from('app_settings').select('value').eq('key', key).maybeSingle()
  if (!data?.value) return { ...fallback }
  try { return { ...fallback, ...JSON.parse(data.value) } } catch { return { ...fallback } }
}

export async function writeJson(db: SupabaseClient, key: string, value: unknown): Promise<boolean> {
  const { error } = await db.from('app_settings').upsert(
    { key, value: JSON.stringify(value), updated_at: new Date().toISOString() }, { onConflict: 'key' },
  )
  return !error
}

export const getPullConfig = (db: SupabaseClient) => readJson(db, CONFIG_KEY, EMPTY_CONFIG)
export const getPullState = (db: SupabaseClient) => readJson(db, STATE_KEY, EMPTY_STATE)

export async function getPullView(db: SupabaseClient): Promise<NedarimPullView> {
  const [c, state] = await Promise.all([getPullConfig(db), getPullState(db)])
  const { apiKey, ...rest } = c
  return { ...rest, hasKey: !!apiKey, state }
}

/** שמירת ההגדרות. מפתח ריק = משאירים את הקיים. החלפת מוסד או טופס מתחילה את המשיכה מההתחלה. */
export async function savePullConfig(db: SupabaseClient, input: Partial<NedarimPullConfig>): Promise<{ ok: true } | { ok: false; error: string }> {
  const prev = await getPullConfig(db)
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const next: NedarimPullConfig = {
    mosadId: str(input.mosadId), tofesId: str(input.tofesId),
    apiKey: str(input.apiKey) || prev.apiKey,
    emailField: str(input.emailField), nameField: str(input.nameField), consentField: str(input.consentField),
  }
  const err = validateConfig(next)
  if (err) return { ok: false, error: err }
  if (!(await writeJson(db, CONFIG_KEY, next))) return { ok: false, error: 'השמירה נכשלה' }
  if (prev.mosadId !== next.mosadId || prev.tofesId !== next.tofesId) {
    await writeJson(db, STATE_KEY, { ...(await getPullState(db)), lastId: 0, lastError: null })
  }
  return { ok: true }
}

/** כמה רשומות אחרונות עם Field1..Field100, כדי לבחור במסך איזו עמודה היא מה. */
export async function loadSample(db: SupabaseClient) {
  const c = await getPullConfig(db)
  if (!c.mosadId || !c.apiKey || !c.tofesId) return { ok: false as const, error: 'צריך קודם לשמור מספר מוסד, מפתח ומספר טופס' }
  const res = await fetchRows(c, SAMPLE_FIELDS, { lastId: 0, max: 5, desc: true })
  return res.ok ? { ok: true as const, rows: res.rows } : res
}

// ── המשיכה עצמה ──
export interface PullResult { ok: boolean; skipped?: 'not_configured' | 'running'; added: number; exists: number; blocked: number; invalid: number; noConsent: number; lastId: number; error?: string; needEmailField?: boolean }

export const NO_EMAIL_COLUMN_ERROR = 'לא הצלחנו לזהות לבד איזו עמודה בטופס היא המייל. בשלב 2 למטה לחצו "טעינת דוגמה מהטופס", בחרו את עמודת המייל ושמרו.'

let running: Promise<PullResult> | null = null

export function pullNedarimSubscribers(dbArg?: SupabaseClient): Promise<PullResult> {
  if (running) return Promise.resolve({ ok: false, skipped: 'running', added: 0, exists: 0, blocked: 0, invalid: 0, noConsent: 0, lastId: 0 })
  running = doPull(dbArg).finally(() => { running = null })
  return running
}

async function doPull(dbArg?: SupabaseClient): Promise<PullResult> {
  const out: PullResult = { ok: true, added: 0, exists: 0, blocked: 0, invalid: 0, noConsent: 0, lastId: 0 }
  const db = dbArg ?? getServiceClient()
  if (!db) return { ...out, ok: false, error: 'השרת אינו מוגדר' }
  const c = await getPullConfig(db)
  if (!isReady(c)) return { ...out, ok: false, skipped: 'not_configured' }
  const state = await getPullState(db)
  out.lastId = state.lastId
  // מסיימים לפני המשיכה: שומרים את התוצאה, כדי שתוצג במסך גם אחרי הריצה האוטומטית
  const finish = async (error: string | null, extra?: Partial<PullResult>): Promise<PullResult> => {
    await writeJson(db, STATE_KEY, { ...state, lastRunAt: new Date().toISOString(), lastAdded: 0, lastError: error } satisfies NedarimPullState)
    return error ? { ...out, ...extra, ok: false, error } : out
  }
  if (!c.emailField) {
    // זיהוי לפי התוכן של כל העמודות ב-30 הרשומות האחרונות
    const sample = await fetchRows(c, SAMPLE_FIELDS, { lastId: 0, max: 30, desc: true })
    if (!sample.ok) return finish(sample.error)
    if (!sample.rows.length) return finish(null)
    const d = detectColumns(sample.rows)
    if (!d.emailField) return finish(NO_EMAIL_COLUMN_ERROR, { needEmailField: true })
    c.emailField = d.emailField
    if (!c.nameField) c.nameField = d.nameField
    await writeJson(db, CONFIG_KEY, c)
  }
  const fields = [c.emailField, c.nameField, c.consentField].filter(Boolean)

  pages: for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    const res = await fetchRows(c, fields, { lastId: out.lastId, max: PAGE_SIZE })
    if (!res.ok) { out.ok = false; out.error = res.error; break }
    const rows = res.rows.map(r => ({ r, id: Number(r.ID) })).filter(x => x.id > out.lastId).sort((a, b) => a.id - b.id)
    if (!rows.length) break
    for (const { r, id } of rows) {
      const m = mapRow(r, c)
      if (!m.ok) { if (m.reason === 'no_consent') out.noConsent++; else out.invalid++ }
      else {
        const s = await subscribeGilyonot(db, { email: m.email, name: m.name, source: 'nedarim', sourceRef: m.sourceRef, noReactivate: true })
        // שמירה נכשלה: עוצרים לפני הרשומה הזו, והריצה הבאה תנסה אותה שוב
        if (!s.ok) { out.ok = false; out.error = s.error; break pages }
        if (s.outcome === 'added') out.added++
        else if (s.outcome === 'blocked_unsubscribed') out.blocked++
        else out.exists++
      }
      out.lastId = id
    }
    if (res.rows.length < PAGE_SIZE) break
  }

  await writeJson(db, STATE_KEY, {
    lastId: out.lastId, lastRunAt: new Date().toISOString(), lastAdded: out.added,
    totalAdded: state.totalAdded + out.added, lastError: out.error ?? null,
  } satisfies NedarimPullState)
  return out
}
