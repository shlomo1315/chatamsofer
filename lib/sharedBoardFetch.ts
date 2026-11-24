// ─────────────────────────────────────────────────────────────────────────────
// בקשות דף השיתוף (/shared/distributions): כניסה בסיסמה וטעינת הנתונים.
//
// 🔴 כל בקשה מוגבלת בזמן ומחזירה תוצאה מפורשת. קודם, כשטעינת הנתונים
// הראשונה נכשלה (שגיאת שרת, ניתוק או בקשה שנתקעה בסינון), הדף נשאר על
// גלגל טעינה לנצח בלי שום הודעה, ונראה כאילו הקישור "לא מגיב".
// ─────────────────────────────────────────────────────────────────────────────

export const SHARED_FETCH_TIMEOUT_MS = 25_000

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

export async function fetchSharedBoard(fetchFn: FetchFn = fetch, timeoutMs = SHARED_FETCH_TIMEOUT_MS, distId: string | null = null): Promise<BoardResult> {
  const url = distId ? `/api/shared/distributions?dist=${encodeURIComponent(distId)}` : '/api/shared/distributions'
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
  if (data && typeof data === 'object') return { kind: 'ok', data: data as Record<string, unknown> }
  return { kind: 'error', message: `התקבלה תשובה לא תקינה מהשרת (קוד ${res.status}). ייתכן שהסינון חסם את הבקשה. נסה שוב. [${snippet(text)}]` }
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
