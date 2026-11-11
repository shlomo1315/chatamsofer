// מייל סיכום למנהל בסוף ריצת הטעינה החודשית למוקדים.
import type { LoadResult } from '@/lib/centerMonthlyLoad'

export type CenterLoadRow = { center: string; result: LoadResult; error?: string; amount?: number; expiresAt?: string }

const LABEL: Record<LoadResult, string> = {
  loaded: 'נטען', already: 'כבר נטען החודש', busy: 'טעינה תקועה (בטיפול)', no_stock: 'ממתין: אין מלאי כרטיסים', error: 'נכשל',
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fmtDate = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '—')

export function buildCenterLoadSummary(rows: CenterLoadRow[], stockLeft: number | null, month: string): { subject: string; html: string } {
  const loaded = rows.filter((r) => r.result === 'loaded').length
  const failed = rows.filter((r) => r.result === 'error' || r.result === 'no_stock' || r.result === 'busy').length
  const subject = failed
    ? `⚠️ טעינה חודשית למוקדים ${month}: ${loaded} נטענו, ${failed} לא נטענו`
    : `✅ טעינה חודשית למוקדים ${month}: ${loaded} מוקדים נטענו`
  const tr = rows.map((r) => `<tr><td>${esc(r.center)}</td><td>${r.amount != null ? `${r.amount} ₪` : '—'}</td><td>${fmtDate(r.expiresAt)}</td><td>${LABEL[r.result]}${r.error ? ` (${esc(r.error)})` : ''}</td></tr>`).join('')
  const html = `<div dir="rtl" style="font-family:Heebo,Arial,sans-serif"><h3>${subject}</h3>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse"><tr><th>מוקד</th><th>סכום</th><th>תוקף</th><th>מצב</th></tr>${tr}</table>
<p>מלאי כרטיסים שנשאר: <b>${stockLeft ?? 'לא ידוע'}</b></p>${failed ? '<p>מוקד שלא נטען ממתין. טעינה חוזרת באותו חודש בטוחה, ואפשר להטעין ידנית אחרי תיקון או הוספת מלאי.</p>' : ''}</div>`
  return { subject, html }
}
