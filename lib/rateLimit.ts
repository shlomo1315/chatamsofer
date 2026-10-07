// הגבלת קצב פשוטה בזיכרון (per-instance). מספיקה לבלימת ספאם/אנומרציה על נקודות קצה ציבוריות.
// בריבוי אינסטנסים המגבלה היא פר-אינסטנס — עדיין מורידה דרסטית את קצב ההתקפה.

interface Bucket { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 50_000
const SWEEP_INTERVAL_MS = 60_000
let lastSweep = 0

function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return
  // ⚠️ ביצועים בשעת עומס: הניקוי רץ עד כה *בכל בקשה* מרגע שהמפה התמלאה —
  // סריקה של 50,000 רשומות לכל רישום, בדיוק ברגע שבו אלפי נרשמים מגיעים
  // במקביל. מנקים לכל היותר פעם בדקה.
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key)
  }
  // כל הדליים עדיין חיים (הצפה אמיתית) — מפנים את הרבע שחלונו נסגר ראשון,
  // כדי שהזיכרון לא יגדל ללא גבול ויפיל את האינסטנס.
  if (buckets.size >= MAX_BUCKETS) {
    const byExpiry = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)
    const drop = Math.ceil(byExpiry.length / 4)
    for (let i = 0; i < drop; i++) buckets.delete(byExpiry[i][0])
  }
}

// מחזיר true אם הבקשה מותרת, false אם חרגה מהמכסה בחלון.
export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now()
  sweep(now)
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  bucket.count += 1
  return bucket.count <= maxRequests
}

// לשימוש בבדיקות בלבד — איפוס המצב בין מקרי בדיקה.
export function __resetRateLimits() {
  buckets.clear()
  lastSweep = 0
}

/**
 * ה-IP של הפונה, או null כשאין דרך לדעת אותו.
 *
 * ⚠️ למה null ולא 'unknown': כשהפרוקסי אינו מעביר כותרת IP, כל הבקשות בעולם
 * נופלות לאותו דלי בדיוק ('unknown') — ואז המשתמש ה-11 בכל המערכת נחסם בגלל
 * עשרה שקדמו לו ואינם קשורים אליו. במסלולים שבהם חסימה שגויה היא הנזק הגדול
 * (רישום), עדיף לוותר על מגבלת ה-IP מאשר לחסום את כולם יחד.
 */
/**
 * 🔴 כתובת הפונה — נלקחת מהערך ה*אחרון* ב-x-forwarded-for, לא הראשון.
 *
 * הכותרת היא רשימה שכל proxy בדרך מוסיף לה ערך בסוף. הערך הראשון הוא
 * מה ש*הלקוח* שלח — כלומר מחרוזת בשליטתו המלאה. הגרסה הקודמת לקחה אותו,
 * ולכן כל מגבלת קצב במערכת הייתה ניתנת לעקיפה מוחלטת: די היה לשלוח
 * `X-Forwarded-For: <מספר אקראי>` בכל בקשה כדי שכל בקשה תיספר כפונה חדש.
 * זה נטרל בפועל את ההגנה מפני סריקת מאגר ומפני ניחוש קודים.
 *
 * הערך האחרון נוסף ע"י ה-proxy שלנו (Railway) ואינו ניתן לזיוף מבחוץ:
 * גם אם הלקוח שולח כותרת משלו, ה-proxy מוסיף אחריה את הכתובת האמיתית.
 *
 * ⚠️ אם בעתיד תתווסף שכבת proxy נוספת (CDN), יש לספור אחורה בהתאם —
 * הערך הנכון הוא זה שנוסף ע"י ה-proxy הקרוב ביותר לאפליקציה.
 */
export function clientIpOrNull(request: Request): string | null {
  // 🔴 x-real-ip קודם (ביקורת אבטחה 07.10). מדידה חיה ב-05.10 (ראו
  // lib/payments/callbackSource): ב-Railway הערך האחרון ב-x-forwarded-for
  // הוא כתובת *תשתית* (79.127.178.82), ולא הלקוח — כך שכל הפונים דרך אותו
  // צומת נספרו כפונה אחד: תוקף אחד יכול היה לנעול את הקופה ואת כניסת
  // המוכרים לכולם. x-real-ip נקבע ע"י ה-proxy, וזיוף שלו מבחוץ נדרס.
  const realFirst = request.headers.get('x-real-ip')?.trim()
  if (realFirst) return realFirst

  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) {
    const parts = fwd.split(',').map(s => s.trim()).filter(Boolean)
    const last = parts[parts.length - 1]
    if (last) return last
  }
  // ⚠️ x-real-ip מוגדר ע"י ה-proxy ואינו רשימה, ולכן בטוח לקחתו כמות שהוא.
  const real = request.headers.get('x-real-ip')?.trim()
  return real || null
}

export function clientIp(request: Request): string {
  return clientIpOrNull(request) ?? 'unknown'
}

/**
 * כל הכתובות שבשרשרת x-forwarded-for, מהראשונה לאחרונה.
 *
 * 🔴 נועד לבדיקת *מקור מוכר* (webhook של ספק), ולא למגבלת קצב.
 *
 * ⚠️ ההבחנה קריטית: למגבלת קצב חייבים את הערך האחרון בלבד, כי כל
 * ערך אחר ניתן לזיוף ע"י הלקוח (ראו clientIpOrNull). אבל לבדיקת
 * רשימה לבנה ההיגיון הפוך — די בכך ש*אחת* מהכתובות בשרשרת היא
 * כתובת מוכרת, כי כתובת שאינה ברשימה אינה מעניקה שום גישה.
 *
 * ⚠️ זה מה שהפיל את קאלבק התשלומים: נדרים שלחו מ-18.196.146.117
 * (כתובת רשמית ומאושרת), אבל שכבת ביניים הוסיפה ערך אחריה —
 * ו-clientIpOrNull החזיר דווקא אותו. התשלום נדחה ב-403, הלקוח חויב,
 * וההזמנה נותרה "מבוטלת".
 */
export function forwardedIps(request: Request): string[] {
  const out: string[] = []
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) out.push(...fwd.split(',').map(s => s.trim()).filter(Boolean))
  const real = request.headers.get('x-real-ip')?.trim()
  if (real && !out.includes(real)) out.push(real)
  return out
}
