// ─────────────────────────────────────────────────────────────────────────────
// טעינה חודשית אוטומטית למוקדים: רץ ב-1 לכל חודש (EventBridge, aws/cron-schedules.yml).
// לכל מוקד פעיל (גם בלי כרטיס משויך: הלקוח מוקם בנדרים אוטומטית) מריץ runMonthlyLoad (שריון חודש + ניכוי מלאי → נדרים).
// ריצה חוזרת באותו חודש בטוחה: 'already'. מלאי אזל → 'no_stock' (ממתין). בסוף כל ריצה נשלח מייל סיכום לכתובות התראות המלאי.
// כשל במוקד אחד לא עוצר את האחרים. מוגן ב-CRON_SECRET.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse, type NextRequest } from 'next/server'
import { verifyCronSecret, getServiceClient } from '@/lib/apiAuth'
import { runMonthlyLoad, israelMonth, type CenterAccount } from '@/lib/centerMonthlyLoad'
import { buildCenterLoadSummary, type CenterLoadRow } from '@/lib/centerMonthlyLoadMail'
import { getAlertSettings, getStockBalance } from '@/lib/cardStock'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
const SPACING_MS = 300

type CenterRow = { id: string; name: string }
type CardRow = Omit<CenterAccount, 'center_name'>

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || !verifyCronSecret(request)) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const { data: centers, error } = await db.from('card_centers').select('id, name').eq('is_active', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: cards, error: cErr } = await db.from('center_monthly_cards').select('center_id, phone, card_number, nedarim_client_id, id_number')
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  const byCenter = new Map((cards ?? []).map((c) => [(c as CardRow).center_id, c as CardRow]))

  // מוקד בלי שורת חשבון: יוצרים אותה (הלקוח בנדרים יוקם בטעינה הראשונה)
  const missing = ((centers ?? []) as CenterRow[]).filter((c) => !byCenter.has(c.id))
  if (missing.length) {
    await db.from('center_monthly_cards').upsert(missing.map((c) => ({ center_id: c.id })), { onConflict: 'center_id', ignoreDuplicates: true })
  }

  const results: CenterLoadRow[] = []
  for (const c of (centers ?? []) as CenterRow[]) {
    const acc: CenterAccount = { center_id: c.id, phone: null, card_number: null, nedarim_client_id: null, id_number: null, ...byCenter.get(c.id), center_name: c.name }
    try {
      const r = await runMonthlyLoad(db, acc)
      results.push({ center: c.name, ...r })
    } catch (e) {
      results.push({ center: c.name, result: 'error', error: e instanceof Error ? e.message : 'שגיאה' })
    }
    await new Promise(r => setTimeout(r, SPACING_MS))
  }

  const summary = results.reduce<Record<string, number>>((m, r) => ({ ...m, [r.result]: (m[r.result] ?? 0) + 1 }), {})
  console.log('[center-monthly-load]', JSON.stringify(summary))

  // מייל סיכום תמיד (גם כשהכול כבר נטען: אז אין מה לשלוח, כדי לא לשלוח כפול בריצה חוזרת)
  if (results.some(r => r.result !== 'already')) {
    try {
      const { emails } = await getAlertSettings(db)
      const stockLeft = await getStockBalance(db).catch(() => null)
      const { subject, html } = buildCenterLoadSummary(results, stockLeft, israelMonth())
      for (const to of emails) await deliverMail(to, subject, html, undefined, mailFor('main'))
    } catch (e) { console.error('[center-monthly-load] mail failed:', e) }
  }
  return NextResponse.json({ total: results.length, summary, results })
}
