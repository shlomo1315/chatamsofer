// מפעיל את הגיבוי היומי ע"י קריאה ל-endpoint /api/cron/backup.
// מיועד לריצה כ-Railway Cron Service (npm run backup:trigger).
// ה-endpoint אידמפוטנטי (גיבוי אחד ליום), ולכן ריצה כפולה לא מזיקה.
//
// משתני סביבה נדרשים (מוגדרים ב-Railway):
//   CRON_SECRET  — זהה לערך שבשירות ה-web (אימות ה-endpoint)
//   BACKUP_URL   — כתובת הבסיס (ברירת מחדל https://chasamsofer.co.il)

const BASE = (process.env.BACKUP_URL || 'https://chasamsofer.co.il').replace(/\/+$/, '')
const SECRET = process.env.CRON_SECRET

if (!SECRET) {
  console.error('CRON_SECRET חסר — לא ניתן להפעיל גיבוי')
  process.exit(1)
}

const url = `${BASE}/api/cron/backup`
console.log(`[backup] מפעיל גיבוי: ${url}`)

try {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${SECRET}` },
    // גיבוי מלא עשוי לקחת זמן — timeout נדיב
    signal: AbortSignal.timeout(290_000),
  })
  const text = await res.text()
  console.log(`[backup] HTTP ${res.status}: ${text}`)
  if (!res.ok) {
    console.error('[backup] הגיבוי נכשל')
    process.exit(1)
  }
  console.log('[backup] הושלם בהצלחה')
} catch (e) {
  console.error('[backup] שגיאה:', e instanceof Error ? e.message : String(e))
  process.exit(1)
}
