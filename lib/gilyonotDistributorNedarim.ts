import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from './apiAuth'
import { normalizeEmail } from './gilyonot'
import { SAMPLE_FIELDS, fetchRows, getPullConfig, isFieldName, readJson, writeJson, type NedarimRow } from './gilyonotNedarimPull'
import { cleanCity, cleanPhone, cleanQuantity, cleanText } from './gilyonotDistributors'

// ─────────────────────────────────────────────────────────────────────────────
// מערך המפיצים — הרשמה מטופס "מפיצים" בנדרים פלוס (Action=GetJson).
// מספר המוסד והמפתח משותפים למשיכת הנרשמים לגיליונות (lib/gilyonotNedarimPull.ts);
// כאן מגדירים רק את מספר הטופס ואיזו עמודה היא מה.
//
// כלל ההרשמה: מפיץ אחד פעיל לכל בית כנסת. נרשם לבית כנסת שכבר יש בו מפיץ,
// או רשומה בלי שם / טלפון / בית כנסת, לא נכנסים אוטומטית: הם נשמרים
// ב-gilyonot_distributor_applications ומוצגים במסך הניהול לבדיקה ידנית.
// רצה כל שעה ב-instrumentation.ts, ואפשר להפעיל ידנית מהמסך.
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_KEY = 'gilyonot_distributors_nedarim_config'
const STATE_KEY = 'gilyonot_distributors_nedarim_state'
const PAGE_SIZE = 500
const MAX_PAGES_PER_RUN = 20

export const DIST_FIELDS = ['nameField', 'phoneField', 'emailField', 'cityField', 'synagogueField', 'addressField', 'quantityField'] as const
export type DistField = typeof DIST_FIELDS[number]
export type DistNedarimConfig = { tofesId: string } & Record<DistField, string>

export interface DistNedarimState { lastId: number; lastRunAt: string | null; lastAdded: number; lastHeld: number; lastError: string | null }

const EMPTY_CONFIG: DistNedarimConfig = { tofesId: '', nameField: '', phoneField: '', emailField: '', cityField: '', synagogueField: '', addressField: '', quantityField: '' }
const EMPTY_STATE: DistNedarimState = { lastId: 0, lastRunAt: null, lastAdded: 0, lastHeld: 0, lastError: null }

export type ApplicationReason = 'synagogue_taken' | 'no_phone' | 'no_synagogue' | 'no_name'
export const REASON_LABELS: Record<ApplicationReason, string> = {
  synagogue_taken: 'יש כבר מפיץ בבית הכנסת',
  no_phone: 'חסר טלפון תקין',
  no_synagogue: 'חסר בית כנסת',
  no_name: 'חסר שם',
}

export function validateDistConfig(c: DistNedarimConfig): string | null {
  if (!/^\d{1,10}$/.test(c.tofesId)) return 'מספר הטופס צריך להיות מספר'
  for (const f of DIST_FIELDS) if (c[f] && !isFieldName(c[f])) return 'שם עמודה לא תקין'
  if (!c.nameField || !c.phoneField || !c.synagogueField) return 'צריך לבחור לפחות את עמודות השם, הטלפון ובית הכנסת'
  return null
}

/**
 * מפתח להשוואת בתי כנסת: עיר + שם, בלי גרשיים, פיסוק ותחיליות כמו "בית הכנסת" / "ביהכ"נ".
 * כך "בית הכנסת 'אהל משה', בני ברק" ו"אהל משה" בבני ברק נחשבים אותו מקום.
 */
export function synagogueKey(city: string | null | undefined, synagogue: string | null | undefined): string | null {
  const norm = (s: string) => s.replace(/["'`׳״\-–.,()]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  let syn = norm(String(synagogue ?? ''))
  syn = syn.replace(/^(?:בית ה?כנסת|בית מדרש|ביהכנ|ביהכ נ|בהכנ|בהכ נ|ביכנ|בי כ נ|ביהמד|בית המדרש)\s+/, '').trim()
  if (!syn) return null
  return `${norm(String(city ?? ''))}|${syn}`
}

export interface MappedDistributor {
  full_name: string | null; phone: string | null; email: string | null; city: string | null
  synagogue: string | null; address: string | null; quantity: number | null; sourceRef: string
}

export function mapDistributorRow(row: NedarimRow, c: DistNedarimConfig): { value: MappedDistributor; reason: ApplicationReason | null } {
  const get = (f: DistField) => (c[f] ? row[c[f]] ?? '' : '')
  const value: MappedDistributor = {
    full_name: cleanText(get('nameField'), 80),
    phone: cleanPhone(get('phoneField')),
    email: normalizeEmail(get('emailField')),
    city: cleanCity(get('cityField')),
    synagogue: cleanText(get('synagogueField'), 120),
    address: cleanText(get('addressField'), 160),
    quantity: c.quantityField ? cleanQuantity(get('quantityField')) : 0,
    sourceRef: `nedarim-dist:${c.tofesId}:${row.ID}`,
  }
  const reason: ApplicationReason | null = !value.full_name ? 'no_name' : !value.phone ? 'no_phone' : !synagogueKey(value.city, value.synagogue) ? 'no_synagogue' : null
  return { value, reason }
}

// ── הגדרות ומצב ──
export const getDistNedarimConfig = (db: SupabaseClient) => readJson(db, CONFIG_KEY, EMPTY_CONFIG)
export const getDistNedarimState = (db: SupabaseClient) => readJson(db, STATE_KEY, EMPTY_STATE)

export async function getDistNedarimView(db: SupabaseClient) {
  const [config, state, base] = await Promise.all([getDistNedarimConfig(db), getDistNedarimState(db), getPullConfig(db)])
  return { config, state, connected: !!(base.mosadId && base.apiKey) }
}

export async function saveDistNedarimConfig(db: SupabaseClient, input: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const next = { tofesId: str(input.tofesId) } as DistNedarimConfig
  for (const f of DIST_FIELDS) next[f] = str(input[f])
  const err = validateDistConfig(next)
  if (err) return { ok: false, error: err }
  const prev = await getDistNedarimConfig(db)
  if (!(await writeJson(db, CONFIG_KEY, next))) return { ok: false, error: 'השמירה נכשלה' }
  if (prev.tofesId !== next.tofesId) await writeJson(db, STATE_KEY, { ...(await getDistNedarimState(db)), lastId: 0, lastError: null })
  return { ok: true }
}

async function connection(db: SupabaseClient, tofesId: string) {
  const base = await getPullConfig(db)
  if (!base.mosadId || !base.apiKey || !tofesId) return null
  return { ...base, tofesId }
}

export async function loadDistSample(db: SupabaseClient) {
  const c = await getDistNedarimConfig(db)
  const conn = await connection(db, c.tofesId)
  if (!conn) return { ok: false as const, error: 'צריך מספר מוסד ומפתח (בהגדרות המשיכה של הנרשמים) ומספר טופס שמור' }
  const res = await fetchRows(conn, SAMPLE_FIELDS, { lastId: 0, max: 5, desc: true })
  return res.ok ? { ok: true as const, rows: res.rows } : res
}

/** מפיץ חדש מנדרים, עם אירוע הצטרפות. */
export async function createDistributorFrom(db: SupabaseClient, v: Omit<MappedDistributor, 'sourceRef'>, note: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await db.from('gilyonot_distributors').insert({
    full_name: v.full_name, phone: v.phone, email: v.email, city: v.city, synagogue: v.synagogue,
    address: v.address, quantity: v.quantity ?? 0, source: 'nedarim',
  }).select('id').single()
  if (error || !data) return { ok: false, error: 'יצירת המפיץ נכשלה' }
  await db.from('gilyonot_distributor_events').insert({
    distributor_id: data.id, channel: 'nedarim', kind: 'join', status: 'done', handled_at: new Date().toISOString(), details: note,
  })
  return { ok: true, id: data.id }
}

/** בתי הכנסת שכבר יש בהם מפיץ פעיל: מפתח → מזהה המפיץ. */
export async function activeSynagogues(db: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('gilyonot_distributors').select('id, city, synagogue').eq('status', 'active').not('synagogue', 'is', null).order('created_at').range(from, from + 999)
    for (const r of data ?? []) { const k = synagogueKey(r.city, r.synagogue); if (k && !map.has(k)) map.set(k, r.id) }
    if (!data || data.length < 1000) break
  }
  return map
}

// ── המשיכה ──
export interface DistPullResult { ok: boolean; skipped?: 'not_configured' | 'running'; added: number; held: number; exists: number; lastId: number; error?: string }

let running: Promise<DistPullResult> | null = null

export function pullNedarimDistributors(dbArg?: SupabaseClient): Promise<DistPullResult> {
  if (running) return Promise.resolve({ ok: false, skipped: 'running', added: 0, held: 0, exists: 0, lastId: 0 })
  running = doPull(dbArg).finally(() => { running = null })
  return running
}

async function doPull(dbArg?: SupabaseClient): Promise<DistPullResult> {
  const out: DistPullResult = { ok: true, added: 0, held: 0, exists: 0, lastId: 0 }
  const db = dbArg ?? getServiceClient()
  if (!db) return { ...out, ok: false, error: 'השרת אינו מוגדר' }
  const c = await getDistNedarimConfig(db)
  const conn = await connection(db, c.tofesId)
  if (!conn || validateDistConfig(c)) return { ...out, ok: false, skipped: 'not_configured' }
  const state = await getDistNedarimState(db)
  out.lastId = state.lastId
  const fields = DIST_FIELDS.map(f => c[f]).filter(Boolean)
  const taken = await activeSynagogues(db)

  pages: for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    const res = await fetchRows(conn, fields, { lastId: out.lastId, max: PAGE_SIZE })
    if (!res.ok) { out.ok = false; out.error = res.error; break }
    const rows = res.rows.map(r => ({ r, id: Number(r.ID) })).filter(x => x.id > out.lastId).sort((a, b) => a.id - b.id)
    if (!rows.length) break
    for (const { r, id } of rows) {
      const { value: v, reason: missing } = mapDistributorRow(r, c)
      const key = synagogueKey(v.city, v.synagogue)
      const conflict = key ? taken.get(key) ?? null : null
      // אותו אדם שכבר רשום כמפיץ באותו בית כנסת (נרשם שוב בטופס): אין מה לעשות
      if (conflict && v.phone) {
        const { data: same } = await db.from('gilyonot_distributors').select('id').eq('id', conflict).or(`phone.eq.${v.phone},phone2.eq.${v.phone}`).maybeSingle()
        if (same) { out.exists++; out.lastId = id; continue }
      }
      const reason: ApplicationReason | null = missing ?? (conflict ? 'synagogue_taken' : null)
      if (reason) {
        const { error } = await db.from('gilyonot_distributor_applications').insert({
          full_name: v.full_name, phone: v.phone, email: v.email, city: v.city, synagogue: v.synagogue,
          address: v.address, quantity: v.quantity, reason, conflict_id: conflict, source_ref: v.sourceRef,
        })
        // 23505 = הרשומה כבר נקלטה בריצה קודמת
        if (error && error.code !== '23505') { out.ok = false; out.error = 'שמירת הבקשה נכשלה'; break pages }
        if (!error) out.held++
      } else {
        const created = await createDistributorFrom(db, v, `נרשם בטופס בנדרים פלוס (רשומה ${r.ID})`)
        // שמירה נכשלה: עוצרים לפני הרשומה הזו, והריצה הבאה תנסה אותה שוב
        if (!created.ok) { out.ok = false; out.error = created.error; break pages }
        taken.set(key!, created.id)
        out.added++
      }
      out.lastId = id
    }
    if (res.rows.length < PAGE_SIZE) break
  }

  await writeJson(db, STATE_KEY, {
    lastId: out.lastId, lastRunAt: new Date().toISOString(), lastAdded: out.added, lastHeld: out.held, lastError: out.error ?? null,
  } satisfies DistNedarimState)
  return out
}
