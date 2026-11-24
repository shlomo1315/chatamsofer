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

async function fetchPart(fetchFn: FetchFn, url: string, timeoutMs: number): Promise<PartResult> {
  const started = Date.now()
  let res: Response
  try {
    res = await fetchFn(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    return { kind: 'error', message: isTimeout(e) ? MSG_TIMEOUT : MSG_NETWORK }
  }
  if (res.status === 401) return { kind: 'locked' }
  // ⚠️ הגוף נקרא כטקסט ורק אז מפוענח: מגבלת הזמן חלה גם על ההורדה, וקטיעה
  // באמצע היא "לא ענה בזמן" — לא "תשובה לא תקינה" (כך הוצג קודם בטעות).
  let text: string
  try {
    text = await res.text()
  } catch (e) {
    return { kind: 'error', message: isTimeout(e) ? MSG_TIMEOUT : MSG_NETWORK }
  }
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
 * לכל חלק מגבלת זמן משלו, כך שהטעינה כולה לא נחתכת בגלל הכמות.
 */
export async function fetchSharedBoard(fetchFn: FetchFn = fetch, timeoutMs = SHARED_FETCH_TIMEOUT_MS, distId: string | null = null): Promise<BoardResult> {
  const dist = distId ? `dist=${encodeURIComponent(distId)}` : ''
  let data: Record<string, unknown> | null = null
  const recipients: unknown[] = []
  const seen = new Set<unknown>()
  const parts: { bytes: number; ms: number; serverMs: unknown }[] = []

  for (let part = 0; part < MAX_PARTS; part++) {
    const qs = [part > 0 ? `part=${part}` : '', dist].filter(Boolean).join('&')
    const r = await fetchPart(fetchFn, qs ? `/api/shared/distributions?${qs}` : '/api/shared/distributions', timeoutMs)
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
  }
  return { kind: 'ok', data: { ...data, recipients } }
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
