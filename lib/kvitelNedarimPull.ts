import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from './apiAuth'
import { KVITEL_REQUEST_TYPES, MAX_LINES, personKey, type KvitelLineInput, type KvitelRelation } from './kvitel'
import { ingestKvitel, reprocessKvitelRequest } from './kvitelIngest'
import { parseNedarimKvitel, rawToRecord, type ParsedNedarimKvitel } from './kvitelNedarim'
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

// פרטי הבקשה (שדה טקסט ארוך בטופס) יושבים בעמודות Field1Max..Field10Max. נדרים מחזיר רק עמודות
// שמבקשים ב-GetJsonParam, ובלעדיהן כל ההגשות נקלטו עם שמות בלבד, בלי הבקשה.
export const LONG_FIELDS = Array.from({ length: 10 }, (_, i) => `Field${i + 1}Max`)
export const KVITEL_FIELDS = [...SAMPLE_FIELDS, ...LONG_FIELDS]

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
const RELATION_RE = /^(?:בן|בת|ב"ר|זכר|נקבה)$/
// גם "משה/נחמה גיטל" ו"משה (מוישי)": בלי הקו הנטוי ההגשה כולה נספרה ריקה ודולגה
const NAME_RE = /^[\p{L}'"׳״\s.\-/()]{2,40}$/u
const REQUEST_RE = /^(?:[לש]|ל?ה)?(?:רפוא|רפו|פרנס|זיווג|זווג|שידוך|זרע|הצלח|בריאות|ישוע)|^ברכה\s+ו|^אחר$/
const requestLike = (v: string) => REQUEST_RE.test(v) || KVITEL_REQUEST_TYPES.some(t => t.label === v || t.key === v)

type Tok = { kind: 'name' | 'relation' | 'request'; v: string }

/**
 * בלי בחירת עמודות: עוברים על כל העמודות לפי הסדר, ומסווגים כל ערך לפי תוכנו:
 * מייל, טלפון, בן/בת, בקשה (תווית או מילת מפתח) ושם. הערכים הללו מצטברים לשורות:
 * שם ← (בן/בת) ← שם האם ← בקשה. אם יש עוד שם בראש (המגיש), הוא נלקח ככזה.
 * שורה מלאה ("משה בן שרה") וטקסט ארוך נכנסים לטקסט החופשי, והרשומה המלאה נשמרת ב-rawText.
 */
export function autoKvitelBody(row: NedarimRow): Record<string, string> {
  const body: Record<string, string> = { ClientName: '', Phone: '', Mail: '', Comments: '' }
  const free: string[] = []
  const toks: Tok[] = []
  const byNum = (a: string, b: string) => parseInt(a.slice(5)) - parseInt(b.slice(5))
  const keys = Object.keys(row).filter(k => /^Field\d+$/.test(k)).sort(byNum)
  for (const k of keys) {
    const v = str(row[k])
    if (!v) continue
    if (EMAIL_RE.test(v)) { if (!body.Mail) body.Mail = v }
    else if (PHONE_RE.test(v)) { if (!body.Phone) body.Phone = v }
    else if (RELATION_RE.test(v)) toks.push({ kind: 'relation', v })
    else if (requestLike(v)) toks.push({ kind: 'request', v })
    else if (NAME_LINE_RE.test(v)) free.push(v)
    else if (NAME_RE.test(v) && v.split(/\s+/).length <= 4) toks.push({ kind: 'name', v })
    // טקסט ארוך שאינו שם ("פרטי הבקשה"): הבקשה של השורה. קודם נשלח לטקסט החופשי ונבלע.
    else if (v.length > 3) toks.push({ kind: 'request', v })
  }

  // המגיש: שם נוסף לפני שורת השמות הראשונה
  const firstRel = toks.findIndex(t => t.kind === 'relation')
  const head = toks.slice(0, firstRel === -1 ? toks.length : firstRel)
  const namesBefore = head.filter(t => t.kind === 'name').length
  const afterRel = firstRel === -1 ? undefined : toks[firstRel + 1]
  const hasContact = firstRel === -1 ? namesBefore % 2 === 1 && namesBefore >= 3 : namesBefore >= 3 || (namesBefore === 2 && afterRel?.kind === 'name')
  if (hasContact) { const i = toks.findIndex(t => t.kind === 'name'); body.ClientName = toks[i].v; toks.splice(i, 1) }

  type Cur = { name?: string; mother?: string; relation?: string; request?: string }
  const lines: Cur[] = []
  let cur: Cur = {}
  const flush = () => { if (cur.name) lines.push(cur); cur = {} }
  for (const t of toks) {
    if (t.kind === 'name') {
      if (cur.request || (cur.name && cur.mother)) flush()
      if (!cur.name) cur.name = t.v; else cur.mother = t.v
    } else if (t.kind === 'relation') {
      if (cur.relation) flush()
      cur.relation = t.v
    } else {
      if (cur.request) flush()
      cur.request = t.v
    }
  }
  flush()

  // עמודות הטקסט הארוך (FieldNMax): פרטי הבקשה. בקשה לכל שורה לפי הסדר, ובקשה אחת חלה על כל השמות.
  // שורה שכבר יש לה בקשה מהעמודות הרגילות לא נדרסת. בלי שורות שם, טקסט של שמות עובר לטקסט החופשי.
  const reqs: string[] = []
  for (const k of Object.keys(row).filter(k => /^Field\d+Max$/.test(k)).sort(byNum)) {
    const v = str(row[k])
    if (!v) continue
    if (EMAIL_RE.test(v)) { if (!body.Mail) body.Mail = v }
    else if (PHONE_RE.test(v)) { if (!body.Phone) body.Phone = v }
    else if (!lines.length && NAME_LINE_RE.test(v)) free.push(v)
    else reqs.push(v)
  }
  if (reqs.length) lines.forEach((l, i) => { const r = reqs.length === 1 ? reqs[0] : reqs[i]; if (r && !l.request) l.request = r })

  lines.slice(0, MAX_LINES).forEach((l, i) => {
    const n = i + 1
    Object.assign(body, { [`name${n}`]: l.name ?? '', [`mother${n}`]: l.mother ?? '', [`relation${n}`]: l.relation ?? '', [`request${n}`]: l.request ?? '' })
  })
  body.Comments = free.join('\n')
  return body
}

/** מה שנשמר כמקור: כל העמודות של הרשומה כמו שנדרים החזירו, כדי שאפשר יהיה לראות ולעבד מחדש. */
export function rawRowText(row: NedarimRow): string {
  return Object.entries(row)
    .filter(([k, v]) => str(v) && !/token|password|secret|card|cvv/i.test(k))
    .map(([k, v]) => `${k}: ${str(v)}`).join('\n').slice(0, 6000)
}

/** CreatedDate של נדרים ("24/11/2026 20:24:19", שעון ישראל) כ-ISO. ערך לא תקין או עתידי: null. */
export function nedarimCreatedAt(v: unknown): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(str(v))
  if (!m) return null
  const local = Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] ?? 0))
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(local)).map(x => [x.type, Number(x.value)]))
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - local
  const t = local - offset
  return Number.isFinite(t) && t <= Date.now() ? new Date(t).toISOString() : null
}

/** מפענח גוף שנבנה מהרשומה (שורות מובנות וגם טקסט חופשי, כמו בקליטה הישירה). */
function parseBody(body: Record<string, string>, row: NedarimRow): ParsedNedarimKvitel {
  const p = parseNedarimKvitel(body)
  p.sourceRef = row.ID ? `nedarim-form:${row.ID}` : null
  p.rawText = rawRowText(row)
  return p
}

/** כל העמודות שצריך לבקש מנדרים, בלי כפילויות. */
export function configFields(c: KvitelNedarimConfig): string[] {
  if (!isMapped(c)) return [...KVITEL_FIELDS]
  const all = [c.contactField, c.phoneField, c.emailField, c.textField, ...c.lines.flatMap(l => [l.name, l.mother, l.relation, l.request])]
  return [...new Set(all.filter(isFieldName))]
}

// ── מיפוי רשומה להגשה ──
/**
 * בונה מהרשומה גוף בשמות ש-parseNedarimKvitel מכיר, ומפענח אותו.
 * שורה שאין לה עמודת שם האם (שם מלא בשדה אחד, "משה בן שרה") עוברת לפענוח כטקסט חופשי.
 */
export function mapKvitelRow(row: NedarimRow, c: KvitelNedarimConfig): ParsedNedarimKvitel {
  return parseBody(kvitelRowBody(row, c), row)
}

/** הגוף שנבנה מהרשומה (לפי המיפוי, או זיהוי אוטומטי), לפני הפענוח. משמש גם את דוח הבדיקה. */
export function kvitelRowBody(row: NedarimRow, c: KvitelNedarimConfig): Record<string, string> {
  if (!isMapped(c)) return autoKvitelBody(row)
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
  return body
}

// ── קריאה ושמירה ──
async function readConfig(db: SupabaseClient): Promise<KvitelNedarimConfig> {
  const c = await readJson(db, CONFIG_KEY, EMPTY_CONFIG)
  return { ...c, lines: Array.isArray(c.lines) ? c.lines : [] }
}
/** המיפוי בלבד, בלי המפתח: לדוח הבדיקה, שמפענח מחדש את המקור השמור ולא פונה לנדרים. */
export async function getKvitelMapping(db: SupabaseClient): Promise<KvitelNedarimConfig> {
  return { ...(await readConfig(db)), apiKey: '' }
}
export const getKvitelPullState =(db: SupabaseClient) => readJson(db, STATE_KEY, EMPTY_STATE)

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
  let res = await fetchRows(c, KVITEL_FIELDS, { lastId: 0, max: 5, desc: true })
  // נדרים לא תמיד מכבד סדר יורד: אם חזר ריק, מנסים גם בסדר רגיל
  if (res.ok && !res.rows.length) res = await fetchRows(c, KVITEL_FIELDS, { lastId: 0, max: 5 })
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
          submittedAt: nedarimCreatedAt(r.CreatedDate),
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

// ── עיבוד מחדש ──
const MAX_REPROCESS = 100
// השלמת פרטי הבקשה זולה (עדכון שדה), ולכן כל הבקשות הפתוחות בהרצה אחת
const MAX_FILL = 1000

export interface KvitelReprocessResult { ok: boolean; checked: number; fixed: number; notes: number; noRequest: number; completed: number; stillEmpty: number; missing: number; error?: string }

type ReLine = { id: string; position?: number | null; name: string; relation: KvitelRelation; parent_name: string | null; request_type?: string | null; request_note: string | null }
const hasRequest = (l: ReLine) => !!(l.request_note || l.request_type)
type ReRow = { id: string; source_ref: string | null; status: string; raw_text: string | null; kvitel_request_lines: ReLine[] }

const FORM_REF = 'nedarim-form:'
const isOpen = (status: string) => status === 'pending' || status === 'review'

/** פענוח מחדש מהמקור ששמור בבקשה (raw_text), בלי לפנות לנדרים. */
function reparseStored(r: ReRow, c: KvitelNedarimConfig): ParsedNedarimKvitel | null {
  if (!r.raw_text?.trim()) return null
  const record = rawToRecord(r.raw_text)
  return r.source_ref?.startsWith(FORM_REF) ? mapKvitelRow(record, c) : parseNedarimKvitel(record)
}

/** שורות מהפענוח שאין להן שורה שמורה (לפי שם + בן/בת + שם האם), עד המקסימום לבקשה. */
function missingLines(p: ParsedNedarimKvitel, stored: ReLine[]): { lines: KvitelLineInput[]; flags: (string | null)[] } {
  const have = new Set(stored.map(l => personKey({ name: l.name, relation: l.relation, parentName: l.parent_name ?? '' })))
  const room = Math.max(0, MAX_LINES - stored.length)
  const idx = p.lines.map((l, i) => (have.has(personKey(l)) ? -1 : i)).filter(i => i >= 0).slice(0, room)
  return { lines: idx.map(i => p.lines[i]), flags: idx.map(i => p.flags[i] ?? null) }
}

/**
 * בקשות מנדרים שנקלטו חלקית: מפענח שוב במנגנון העדכני ומשלים את הבקשה הקיימת, בלי קליטה כפולה.
 *  - בקשה פתוחה עם שמות (טופס או קליטה ישירה): שמות שבמקור השמור ולא נקלטו (למשל טקסט חופשי
 *    שנזרק כשהיו גם שמות בשדות) מתווספים אחרי הקיימים. השורות הקיימות ותיקונים ידניים בהן לא נדרסים.
 *  - קליטה ישירה בלי שמות: נקלטים מהמקור השמור.
 *  - טופס בלי שמות: מושך שוב את הרשומה מנדרים לפי ה-ID שלה.
 *  - טופס עם שמות בלי פרטי הבקשה (נמחקו בפענוח הישן), בבקשה פתוחה: השורות מוחלפות,
 *    ורק אם בפענוח החדש יש פרטי בקשה. בקשה שכבר נכתבו בה פרטים (גם ידנית) לא נדרסת.
 * עד 100 בקשות בהרצה.
 */
export async function reprocessKvitelFromNedarim(dbArg?: SupabaseClient): Promise<KvitelReprocessResult> {
  const out: KvitelReprocessResult = { ok: true, checked: 0, fixed: 0, notes: 0, noRequest: 0, completed: 0, stillEmpty: 0, missing: 0 }
  const db = dbArg ?? getServiceClient()
  if (!db) return { ...out, ok: false, error: 'השרת אינו מוגדר' }
  const c = await getReadyConfig(db)
  if (!c) return { ...out, ok: false, error: 'צריך קודם להגדיר מוסד, מפתח וטופס' }
  const { data, error } = await db.from('kvitel_requests')
    .select('id, source_ref, status, raw_text, kvitel_request_lines(id, position, name, relation, parent_name, request_type, request_note)').eq('channel', 'nedarim')
    .order('submitted_at', { ascending: false }).limit(1000)
  if (error) return { ...out, ok: false, error: 'קריאת הבקשות נכשלה' }
  const rows = (data ?? []) as unknown as ReRow[]

  // 1. השלמה מהמקור השמור: שמות שחסרים בבקשה פתוחה, וקליטה ישירה בלי שמות
  let budget = MAX_REPROCESS
  const done = new Set<string>()
  for (const r of rows) {
    if (budget <= 0) break
    const stored = r.kvitel_request_lines ?? []
    const isForm = !!r.source_ref?.startsWith(FORM_REF)
    if (stored.length ? !isOpen(r.status) : isForm) continue
    const p = reparseStored(r, c)
    if (!p) continue
    const add = stored.length ? missingLines(p, stored) : { lines: p.lines, flags: p.flags }
    if (!add.lines.length) continue
    budget--; out.checked++; done.add(r.id)
    const s = await reprocessKvitelRequest(db, r.id, {
      channel: 'nedarim', phone: p.phone, email: p.email, contactName: p.contactName,
      lines: add.lines, lineFlags: add.flags, rawText: r.raw_text, sourceRef: r.source_ref,
    }, { appendAfter: stored.length })
    if (!s.ok) { out.ok = false; out.error = s.error; return out }
    if (stored.length) { if (s.lines) out.completed++ }
    else if (s.lines) out.fixed++; else out.stillEmpty++
  }

  // 2. טופס: משיכה חוזרת מנדרים. בקשה בלי שמות נקלטת מחדש (עד התקציב). בקשה פתוחה עם שמות בלי בקשה:
  //    רק שדה הבקשה מתמלא בשורות הקיימות. בלי מחיקת שורות, בלי שינוי סטטוס, ותיקונים ידניים בשמות נשמרים.
  const formId = (r: ReRow) => Number(r.source_ref!.slice(FORM_REF.length))
  const refetch = (r: ReRow) => !done.has(r.id) && !!r.source_ref?.startsWith(FORM_REF) && Number.isFinite(formId(r)) && formId(r) > 0
  const empty = rows.filter(r => refetch(r) && !(r.kvitel_request_lines ?? []).length).slice(0, budget)
  const partial = rows.filter(r => {
    const lines = r.kvitel_request_lines ?? []
    return refetch(r) && lines.length > 0 && isOpen(r.status) && !lines.some(hasRequest)
  }).slice(0, MAX_FILL)
  const todo = [...empty, ...partial]
  if (!todo.length) return out
  const got = await fetchByIds(c, configFields(c), todo.map(formId))
  if (!got.ok) return { ...out, ok: false, error: got.error }

  for (const r of todo) {
    out.checked++
    const row = got.rows.get(formId(r))
    if (!row) { out.missing++; continue }
    const p = mapKvitelRow(row, c)
    const stored = r.kvitel_request_lines ?? []
    if (stored.length) {
      const fill = requestFill(p, stored)
      if (!fill.length) { out.noRequest++; continue }
      for (const f of fill) {
        const { error: e } = await db.from('kvitel_request_lines')
          .update({ request_type: f.requestType, request_note: f.requestNote }).eq('id', f.id).is('request_note', null)
        if (e) return { ...out, ok: false, error: 'שמירת פרטי הבקשה נכשלה' }
      }
      out.notes++
      continue
    }
    const s = await reprocessKvitelRequest(db, r.id, {
      channel: 'nedarim', phone: p.phone, email: p.email, contactName: p.contactName,
      lines: p.lines, lineFlags: p.flags, rawText: p.rawText, sourceRef: p.sourceRef,
    })
    if (!s.ok) { out.ok = false; out.error = s.error; break }
    if (s.lines) out.fixed++; else out.stillEmpty++
  }
  return out
}

/** רשומות טופס לפי ID, במנות של 200 מה-ID הנמוך ועד הגבוה (ולא קריאה לכל בקשה). */
async function fetchByIds(c: KvitelNedarimConfig, fields: string[], ids: number[]): Promise<{ ok: true; rows: Map<number, NedarimRow> } | { ok: false; error: string }> {
  const want = new Set(ids)
  const rows = new Map<number, NedarimRow>()
  const top = Math.max(...ids)
  let last = Math.min(...ids) - 1
  for (let page = 0; page < MAX_PAGES_PER_RUN * 2 && rows.size < want.size; page++) {
    const res = await fetchRows(c, fields, { lastId: last, max: PAGE_SIZE })
    if (!res.ok) return res
    let high = last
    for (const r of res.rows) {
      const id = Number(r.ID)
      if (want.has(id)) rows.set(id, r)
      if (id > high) high = id
    }
    if (res.rows.length < PAGE_SIZE || high <= last || high >= top) break
    last = high
  }
  return { ok: true, rows }
}

/**
 * פרטי הבקשה מהפענוח החדש לשורות השמורות שאין בהן בקשה: לפי שם + בן/בת + שם האם,
 * ואם השם תוקן ידנית אבל מספר השורות זהה, לפי המיקום.
 */
export function requestFill(p: ParsedNedarimKvitel, stored: ReLine[]): { id: string; requestType: string | null; requestNote: string | null }[] {
  const sorted = [...stored].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const keyOf = new Map(p.lines.map(l => [personKey(l), l]))
  const out: { id: string; requestType: string | null; requestNote: string | null }[] = []
  sorted.forEach((s, i) => {
    if (hasRequest(s)) return
    const l = keyOf.get(personKey({ name: s.name, relation: s.relation, parentName: s.parent_name ?? '' }))
      ?? (p.lines.length === sorted.length ? p.lines[i] : undefined)
    if (l && (l.requestType || l.requestNote)) out.push({ id: s.id, requestType: l.requestType ?? null, requestNote: l.requestNote ?? null })
  })
  return out
}
