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
