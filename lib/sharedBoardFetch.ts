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
const MSG_BAD_BODY = 'התקבלה תשובה לא תקינה מהשרת. ייתכן שהסינון חסם את הבקשה. נסה שוב.'

function isTimeout(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name
  return name === 'TimeoutError' || name === 'AbortError'
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const d = await res.json()
    return d && typeof d === 'object' ? (d as Record<string, unknown>) : null
  } catch { return null }
}

export async function fetchSharedBoard(fetchFn: FetchFn = fetch, timeoutMs = SHARED_FETCH_TIMEOUT_MS): Promise<BoardResult> {
  let res: Response
  try {
    res = await fetchFn('/api/shared/distributions', { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    return { kind: 'error', message: isTimeout(e) ? MSG_TIMEOUT : MSG_NETWORK }
  }
  if (res.status === 401) return { kind: 'locked' }
  if (!res.ok) return { kind: 'error', message: `השרת החזיר שגיאה (${res.status}). נסה שוב בעוד רגע.` }
  try {
    const data = await readJson(res)
    return data ? { kind: 'ok', data } : { kind: 'error', message: MSG_BAD_BODY }
  } catch (e) {
    return { kind: 'error', message: isTimeout(e) ? MSG_TIMEOUT : MSG_BAD_BODY }
  }
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
