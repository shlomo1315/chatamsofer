// ─────────────────────────────────────────────────────────────────────────────
// בקשות דף השיתוף (/shared/distributions): כניסה בסיסמה וטעינת הנתונים.
//
// 🔴 כל בקשה מוגבלת בזמן ומחזירה תוצאה מפורשת. קודם, כשטעינת הנתונים
// הראשונה נכשלה (שגיאת שרת, ניתוק או בקשה שנתקעה בסינון), הדף נשאר על
// גלגל טעינה לנצח בלי שום הודעה, ונראה כאילו הקישור "לא מגיב".
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ לכל חלק בנפרד (ראו fetchSharedBoard). הוגדל מ-25 שניות כרשת ביטחון
// לחיבור סלולרי מסונן — הפתרון עצמו הוא החלקים הקטנים, לא ההמתנה.
export const SHARED_FETCH_TIMEOUT_MS = 40_000

export type BoardResult =
  | { kind: 'ok'; data: Record<string, unknown> }
  | { kind: 'locked' }
  | { kind: 'error'; message: string }

export type AuthResult = { ok: true } | { ok: false; message: string; blocked: boolean }

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

const MSG_TIMEOUT = 'השרת לא ענה בזמן. ייתכן שהחיבור איטי או שהסינון עיכב את הבקשה. נסה שוב.'
const MSG_NETWORK = 'אין חיבור לשרת. בדוק את החיבור לאינטרנט ונסה שוב.'
function isTimeout(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name
  return name === 'TimeoutError' || name === 'AbortError'
}

/** תחילת הגוף בשורה אחת — מוצגת על המסך כדי שנדע מיד מה חזר במקום JSON. */
function snippet(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim().slice(0, 120)
  return t || '(גוף ריק)'
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const d = await res.json()
    return d && typeof d === 'object' ? (d as Record<string, unknown>) : null
  } catch { return null }
}

/**
 * הנרשמים שהדף צריך: החלוקה של מסך הבית (החיה, ואם אין — העדכנית ביותר),
 * ובנוסף חלוקה קודמת שנבחרה לצפייה.
 * 🔴 24.11.2026: קודם נשלחו כל הנרשמים מכל החלוקות שהיו אי פעם, עם כל פרטי
 * המשפחה, בכל רענון (כל 10 שניות). דרך הסינון ההורדה לא הסתיימה בזמן, והדף
 * הציג "התקבלה תשובה לא תקינה מהשרת".
 */
export function boardRecipientDistIds(
  distsNewestFirst: { id: string }[], liveId: string | null, requested: string | null,
): string[] {
  const home = liveId ?? distsNewestFirst[0]?.id ?? null
  const ids = home ? [home] : []
  if (requested && requested !== home && distsNewestFirst.some(d => d.id === requested)) ids.push(requested)
  return ids
}

/**
 * גודל חלק בטעינת הנרשמים — דף אחד של PostgREST (db-max-rows), כלומר שאילתה
 * אחת קצרה בשרת ותשובה קטנה ברשת לכל בקשה.
 * 🔴 24.11.2026: גם אחרי הצמצום לחלוקה החיה (#787) הטעינה נכשלה בטלפון
 * ב"השרת לא ענה בזמן": כל הנרשמים עם כל פרטי המשפחה נשלחו בתשובה אחת,
 * והסינון לא העביר אותה תוך מגבלת הזמן.
 */
export const RECIPIENTS_PART_SIZE = 1000
/** גבול ביטחון מפני לולאה אינסופית (50 אלף נרשמים). */
const MAX_PARTS = 50

type PartResult =
  | { kind: 'ok'; data: Record<string, unknown>; bytes: number; ms: number }
  | { kind: 'locked' }
  | { kind: 'error'; message: string }

/**
 * בקשה + קריאת הגוף, שמסתיימות תמיד עד timeoutMs.
 * 🔴 24.11.2026: טיימר רגיל + Promise.race ולא רק AbortSignal.timeout — אם
 * הדפדפן לא מכבד את הביטול (או משהה את הטיימר שלו), הבקשה עדיין מסתיימת,
 * והדף לא נשאר על גלגל טעינה.
 */
async function fetchText(fetchFn: FetchFn, url: string, timeoutMs: number): Promise<{ res: Response; text: string | null }> {
  const ctrl = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, rej) => {
    timer = setTimeout(() => {
      const err = new DOMException('timeout', 'TimeoutError')
      ctrl.abort(err)
      rej(err)
    }, timeoutMs)
  })
  try {
    const res = await Promise.race([fetchFn(url, { cache: 'no-store', signal: ctrl.signal }), deadline])
    if (res.status === 401) return { res, text: null }
    return { res, text: await Promise.race([res.text(), deadline]) }
  } finally {
    clearTimeout(timer)
    deadline.catch(() => {})
  }
}

async function fetchPart(fetchFn: FetchFn, url: string, timeoutMs: number): Promise<PartResult> {
  const started = Date.now()
  // ⚠️ הגוף נקרא כטקסט ורק אז מפוענח: מגבלת הזמן חלה גם על ההורדה, וקטיעה
  // באמצע היא "לא ענה בזמן" — לא "תשובה לא תקינה" (כך הוצג קודם בטעות).
  let res: Response, text: string | null
  try {
    ({ res, text } = await fetchText(fetchFn, url, timeoutMs))
  } catch (e) {
    return { kind: 'error', message: isTimeout(e) ? MSG_TIMEOUT : MSG_NETWORK }
  }
  if (res.status === 401 || text === null) return { kind: 'locked' }
  if (!res.ok) return { kind: 'error', message: `השרת החזיר שגיאה (${res.status}). נסה שוב בעוד רגע. [${snippet(text)}]` }
  let data: unknown = null
  try { data = JSON.parse(text) } catch { /* מטופל למטה */ }
  if (data && typeof data === 'object') return { kind: 'ok', data: data as Record<string, unknown>, bytes: text.length, ms: Date.now() - started }
  return { kind: 'error', message: `התקבלה תשובה לא תקינה מהשרת (קוד ${res.status}). ייתכן שהסינון חסם את הבקשה. נסה שוב. [${snippet(text)}]` }
}

/** מדידה של החלקים שכבר נטענו — מוצגת בהודעת השגיאה, כדי שנדע מה איטי בפועל. */
function partsLog(parts: { bytes: number; ms: number; serverMs: unknown }[]): string {
  return parts.map((p, i) => {
    const server = typeof p.serverMs === 'number' ? `, שרת ${(p.serverMs / 1000).toFixed(1)} ש'` : ''
    return `חלק ${i + 1}: ${Math.round(p.bytes / 1024)}KB ב-${(p.ms / 1000).toFixed(1)} ש'${server}`
  }).join('; ')
}

/**
 * טעינת הדף: החלק הראשון מביא את החלוקות, ההגדרות ו-1,000 הנרשמים הראשונים,
 * וכל עוד השרת מסמן hasMore נטענים החלקים הבאים (?part=N), אחד-אחד.
 * לכל חלק מגבלת זמן משלו, ובנוסף מגבלה כוללת לכל הטעינה (totalMs).
 * 🔴 24.11.2026: בלי המגבלה הכוללת הדף יכל להישאר על גלגל טעינה עד 50 חלקים
 * × 40 שניות (יותר מחצי שעה), בלי שום התקדמות או הודעה — כך נראה בטלפון.
 * onProgress מדווח לפני כל חלק כמה נרשמים כבר נטענו, כדי שהמסך יראה תזוזה.
 */
export type BoardProgress = { part: number; loaded: number }
export const SHARED_TOTAL_TIMEOUT_MS = 90_000

/** הטקסט מתחת לגלגל הטעינה. */
export function sharedLoadingText(p: BoardProgress): string {
  if (p.part <= 1) return 'טוען חלוקות ונרשמים…'
  return `נטענו ${p.loaded.toLocaleString('he-IL')} נרשמים · טוען חלק ${p.part}…`
}

/**
 * 🔴 24.11.2026: onPartial מקבל את הנתונים אחרי כל חלק שאחריו יש עוד, כדי
 * שהדף יוצג מיד אחרי החלק הראשון ולא יחכה לכל הנרשמים (שלמה חיכה על גלגל).
 */
export async function fetchSharedBoard(
  fetchFn: FetchFn = fetch, timeoutMs = SHARED_FETCH_TIMEOUT_MS, distId: string | null = null,
  onProgress?: (p: BoardProgress) => void, totalMs = SHARED_TOTAL_TIMEOUT_MS,
  onPartial?: (data: Record<string, unknown>) => void,
): Promise<BoardResult> {
  const dist = distId ? `dist=${encodeURIComponent(distId)}` : ''
  let data: Record<string, unknown> | null = null
  const recipients: unknown[] = []
  const seen = new Set<unknown>()
  const parts: { bytes: number; ms: number; serverMs: unknown }[] = []
  const endAt = Date.now() + totalMs

  for (let part = 0; part < MAX_PARTS; part++) {
    const left = endAt - Date.now()
    if (left <= 0) {
      return { kind: 'error', message: `הטעינה לא הסתיימה תוך ${Math.round(totalMs / 1000)} שניות (נטענו ${recipients.length} נרשמים ב-${part} חלקים. ${partsLog(parts)}). נסה שוב.` }
    }
    onProgress?.({ part: part + 1, loaded: recipients.length })
    const qs = [part > 0 ? `part=${part}` : '', dist].filter(Boolean).join('&')
    const r = await fetchPart(fetchFn, qs ? `/api/shared/distributions?${qs}` : '/api/shared/distributions', Math.min(timeoutMs, left))
    if (r.kind === 'locked') return r
    if (r.kind === 'error') {
      if (part === 0) return r
      return { kind: 'error', message: `${r.message} (נכשל חלק ${part + 1}, אחרי ${recipients.length} נרשמים. ${partsLog(parts)})` }
    }
    parts.push({ bytes: r.bytes, ms: r.ms, serverMs: r.data.serverMs })
    if (part === 0) data = r.data
    // ⚠️ סינון כפילויות: נרשם חדש שנכנס בין חלק לחלק לא יופיע פעמיים.
    for (const row of Array.isArray(r.data.recipients) ? r.data.recipients : []) {
      const id = (row as { id?: unknown } | null)?.id
      if (id != null) { if (seen.has(id)) continue; seen.add(id) }
      recipients.push(row)
    }
    if (r.data.hasMore !== true) break
    onPartial?.({ ...data, recipients: [...recipients] })
  }
  return { kind: 'ok', data: { ...data, recipients } }
}

// ── עדכון חי ─────────────────────────────────────────────────────────────────
// 🔴 24.11.2026: הרענון האוטומטי טען מחדש את כל הנרשמים בכל סבב, חלק אחרי חלק.
// עכשיו כל סבב מבקש רק נרשמים מהזמן האחרון ואילך (?after=), וטעינה מלאה
// (שמשלימה גם שינויי סטטוס בנרשמים ישנים) רצה ברקע רק פעם ב-SHARED_FULL_REFRESH_MS.
export const SHARED_LIVE_TICK_MS = 10_000
export const SHARED_FULL_REFRESH_MS = 120_000

/** הנרשמים מהזמן `after` ואילך (כולל), עם החלוקות והגדרות הדף. */
export async function fetchBoardUpdates(
  after: string, distId: string | null = null, fetchFn: FetchFn = fetch, timeoutMs = SHARED_FETCH_TIMEOUT_MS,
): Promise<BoardResult> {
  const qs = [`after=${encodeURIComponent(after)}`, distId ? `dist=${encodeURIComponent(distId)}` : ''].filter(Boolean).join('&')
  const r = await fetchPart(fetchFn, `/api/shared/distributions?${qs}`, timeoutMs)
  if (r.kind !== 'ok') return r
  return { kind: 'ok', data: r.data }
}

/** זמן הרישום המאוחר ביותר — נקודת ההמשך לעדכון החי. */
export function latestRegisteredAt(rows: { registered_at?: string | null }[]): string | null {
  let max: string | null = null
  let maxMs = -Infinity
  for (const r of rows) {
    const ms = r.registered_at ? Date.parse(r.registered_at) : NaN
    if (ms > maxMs) { maxMs = ms; max = r.registered_at! }
  }
  return max
}

/** משלב נרשמים שהגיעו בעדכון: שורה קיימת מתעדכנת במקומה, חדשה נכנסת בסוף. */
export function mergeRecipients<T extends { id: string }>(rows: T[], incoming: T[]): T[] {
  if (!incoming.length) return rows
  const byId = new Map(incoming.map(r => [r.id, r]))
  const merged = rows.map(r => {
    const n = byId.get(r.id)
    if (!n) return r
    byId.delete(r.id)
    return { ...r, ...n }
  })
  return [...merged, ...byId.values()]
}

export async function postSharedPassword(password: string, fetchFn: FetchFn = fetch, timeoutMs = SHARED_FETCH_TIMEOUT_MS): Promise<AuthResult> {
  let res: Response
  try {
    res = await fetchFn('/api/shared/distributions/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    return { ok: false, blocked: false, message: isTimeout(e) ? MSG_TIMEOUT : MSG_NETWORK }
  }
  if (res.ok) return { ok: true }
  const d = await readJson(res)
  const serverMsg = typeof d?.error === 'string' ? d.error : null
  // 429 = נעילת IP אחרי ניסיונות שגויים (lib/portalLoginLock)
  if (res.status === 429) return { ok: false, blocked: true, message: serverMsg ?? 'יותר מדי ניסיונות שגויים. הכניסה חסומה זמנית.' }
  if (res.status === 401 || res.status === 400) return { ok: false, blocked: false, message: serverMsg ?? 'סיסמה שגויה' }
  return { ok: false, blocked: false, message: serverMsg ?? `השרת החזיר שגיאה (${res.status}). נסה שוב בעוד רגע.` }
}

// ── טבלת הנרשמים בעמודים ──────────────────────────────────────────────────────
// 🔴 24.11.2026: פרטי המשפחה (טלפונים, כתובת, בן/בת זוג) לא נשלחים יותר עם כל
// הנרשמים. הטבלה מציגה עמוד של REG_PAGE_SIZE ומבקשת רק את הפרטים שלו.

export const REG_PAGE_SIZE = 50
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** מזהים מ-?ids= — רק UUID תקינים, בלי כפילויות, עד גודל עמוד. */
export function parseRegIds(raw: string | null | undefined): string[] {
  return [...new Set((raw ?? '').split(',').map(s => s.trim()).filter(s => UUID_RE.test(s)))].slice(0, REG_PAGE_SIZE)
}

/** מספר העמודים (לפחות 1) ועמוד שנשאר בטווח אחרי שהסינון הקטין את הרשימה. */
export function regPages(total: number, size = REG_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}
export function clampPage(page: number, total: number, size = REG_PAGE_SIZE): number {
  return Math.min(Math.max(0, page), regPages(total, size) - 1)
}

export type RegDetails = {
  id: string
  phone?: string | null
  beneficiary?: { full_name?: string | null; family_name?: string | null; spouse_name?: string | null; phone?: string | null; phone2?: string | null; address?: string | null } | null
}
export type RegDetailsResult =
  | { kind: 'ok'; details: RegDetails[] }
  | { kind: 'locked' }
  | { kind: 'error'; message: string }

/** פרטי המשפחה לעמוד אחד בטבלה — בקשה קטנה אחת עם מגבלת זמן. */
export async function fetchRegDetails(ids: string[], fetchFn: FetchFn = fetch, timeoutMs = 20_000): Promise<RegDetailsResult> {
  if (!ids.length) return { kind: 'ok', details: [] }
  const r = await fetchPart(fetchFn, `/api/shared/distributions/registrants?ids=${ids.map(encodeURIComponent).join(',')}`, timeoutMs)
  if (r.kind !== 'ok') return r
  const details = Array.isArray(r.data.details) ? (r.data.details as RegDetails[]) : []
  return { kind: 'ok', details }
}

/** משלב את פרטי המשפחה שנטענו בשורות הקלות (שורה בלי פרטים נשארת כמו שהיא). */
export function withDetails<T extends { id: string; phone?: string | null; beneficiary?: object | null }>(rows: T[], details: Map<string, RegDetails>): T[] {
  return rows.map(r => {
    const d = details.get(r.id)
    if (!d) return r
    return { ...r, phone: d.phone ?? r.phone ?? null, beneficiary: { ...(r.beneficiary ?? {}), ...(d.beneficiary ?? {}) } }
  })
}
