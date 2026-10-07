// ─────────────────────────────────────────────────────────────────────────────
// העברת רשימת הזמנות בין מסכים — לניווט "הבאה/הקודמת" ולהדפסה מרוכזת.
//
// ⚠️ האחסון בדפדפן ולא ב-URL: "הדפסת כל התעודות" נוגעת במאות הזמנות,
// ו-URL של מאות UUID חוצה את מגבלת אורך הכותרת של השרת.
//
// ⚠️ כל גישה עטופה ב-try: במצב פרטי או כשהאחסון חסום, הניסיון זורק.
// המסך חייב להמשיך לעבוד — בלי ניווט מהרשימה, לא בלי מסך.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * סדר ההזמנות כפי שהוצג בטבלה (אחרי כרטיס, חיפוש, סינון ומיון).
 *
 * ⚠️ sessionStorage: לכל לשונית רשימה משלה, כך שסינון בלשונית אחת אינו
 * משנה את "הבאה" בלשונית אחרת.
 */
export const NAV_KEY = 'bf-orders-nav'

export function saveNavList(ids: string[]): void {
  try { sessionStorage.setItem(NAV_KEY, JSON.stringify(ids)) } catch { /* אחסון חסום */ }
}

export function parseNavList(raw: string | null): string[] | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) : null
  } catch { return null }
}

const PRINT_PREFIX = 'bfprint:'
const PRINT_TTL_MS = 24 * 60 * 60 * 1000

/**
 * שמירת רשימה להדפסה ומפתח לפתיחה בלשונית חדשה.
 *
 * ⚠️ localStorage ולא sessionStorage: לשונית חדשה אינה רואה את
 * ה-sessionStorage של הלשונית שפתחה אותה.
 *
 * @returns המפתח, או null כשהאחסון חסום
 */
export function stashPrintIds(ids: string[]): string | null {
  try {
    // ניקוי רשימות ישנות — אחרת כל הדפסה משאירה עוד רשומה לתמיד.
    const now = Date.now()
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (!k?.startsWith(PRINT_PREFIX)) continue
      // 'bfprint:<זמן>:<אקראי>' — הזמן הוא החלק השני
      const at = Number(k.split(':')[1] ?? 0)
      if (!at || now - at > PRINT_TTL_MS) localStorage.removeItem(k)
    }
    const key = `${now}:${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem(PRINT_PREFIX + key, JSON.stringify(ids))
    return key
  } catch {
    return null
  }
}

export function readPrintIds(key: string): string[] {
  try {
    return parseNavList(localStorage.getItem(PRINT_PREFIX + key)) ?? []
  } catch {
    return []
  }
}
