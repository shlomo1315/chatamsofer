// הגבלת קצב פשוטה בזיכרון (per-instance). מספיקה לבלימת ספאם/אנומרציה על נקודות קצה ציבוריות.
// בריבוי אינסטנסים המגבלה היא פר-אינסטנס — עדיין מורידה דרסטית את קצב ההתקפה.

interface Bucket { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 50_000

function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key)
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

export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
