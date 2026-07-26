// מפעיל את הפריקה האוטומטית של כרטיסי מזון שעברו 6 שבועות, ע"י קריאה
// ל-endpoint /api/nedarim/unload-expired. מיועד לריצה כ-Railway Cron Service
// (npm run unload:trigger) מדי לילה בחצות — יציב ואינו תלוי במתזמן הפנימי
// של שירות ה-web (שמוחמץ אם השרת מאותחל סביב חצות).
// ה-endpoint אידמפוטנטי (פורק רק תיקים שעברו 6 שבועות וטרם נפרקו), ולכן
// ריצה כפולה לא מזיקה.
//
// משתני סביבה נדרשים (מוגדרים ב-Railway):
//   CRON_SECRET  — זהה לערך שבשירות ה-web (אימות ה-endpoint)
//   BACKUP_URL   — כתובת הבסיס (ברירת מחדל https://chasamsofer.co.il)

const BASE = (process.env.BACKUP_URL || 'https://chasamsofer.co.il').replace(/\/+$/, '')
const SECRET = process.env.CRON_SECRET

if (!SECRET) {
  console.error('CRON_SECRET חסר — לא ניתן להפעיל פריקה')
  process.exit(1)
}

const url = `${BASE}/api/nedarim/unload-expired`
console.log(`[unload] מפעיל פריקה: ${url}`)

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}` },
    signal: AbortSignal.timeout(290_000),
  })
  const text = await res.text()
  console.log(`[unload] HTTP ${res.status}: ${text}`)
  if (!res.ok) {
    console.error('[unload] הפריקה נכשלה')
    process.exit(1)
  }
  console.log('[unload] הושלמה בהצלחה')
} catch (e) {
  console.error('[unload] שגיאה:', e instanceof Error ? e.message : String(e))
  process.exit(1)
}
