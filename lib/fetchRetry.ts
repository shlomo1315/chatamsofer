// fetch עם ניסיון חוזר אוטומטי לנפילות זמניות: ניתוק חיבור או שגיאת שער (502/503/504).
// שגיאות אחרות (4xx, 500) מוחזרות מיד, כי ניסיון חוזר לא יעזור להן.
export const CONNECTION_LOST_MESSAGE = 'החיבור נקטע, נסו שוב'

const TRANSIENT_STATUSES = new Set([502, 503, 504])

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  retries = 2,
  delayMs = 800,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, delayMs))
    try {
      const res = await fetchFn(input, init)
      if (TRANSIENT_STATUSES.has(res.status) && attempt < retries) continue
      return res
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}
