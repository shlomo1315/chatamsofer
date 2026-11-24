/**
 * קריאה לשרת שמחזירה JSON בבטחה.
 * כשבדרך עומד רכיב שמחזיר דף HTML (חסימת WAF, 502 מה-ALB, ניתוק רשת), res.json()
 * זורק "Unexpected token '<'" שלא אומר כלום למשתמש. כאן הוא מקבל הודעה ברורה,
 * ואפשר לבקש ניסיון חוזר אוטומטי.
 */
export const SERVER_UNAVAILABLE = 'השרת לא זמין כרגע, נסה שוב'

export async function readJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text()
  try { return JSON.parse(text) as T } catch { throw new Error(SERVER_UNAVAILABLE) }
}

export async function fetchJson<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
  { retries = 0, retryDelayMs = 1500 }: { retries?: number; retryDelayMs?: number } = {},
): Promise<{ ok: boolean; status: number; data: T }> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, init)
      return { ok: res.ok, status: res.status, data: await readJson<T>(res) }
    } catch {
      if (attempt >= retries) throw new Error(SERVER_UNAVAILABLE)
      await new Promise(r => setTimeout(r, retryDelayMs))
    }
  }
}
