// ─────────────────────────────────────────────────────────────────────────────
// טעינה חודשית אוטומטית למוקדים: רץ ב-1 לכל חודש (EventBridge, aws/cron-schedules.yml).
// לכל מוקד פעיל עם כרטיס משויך מריץ runMonthlyLoad (שריון חודש + ניכוי מלאי → נדרים).
// ריצה חוזרת באותו חודש בטוחה: 'already'. מלאי אזל → 'no_stock' + מייל לכתובות התראות המלאי.
// כשל במוקד אחד לא עוצר את האחרים. מוגן ב-CRON_SECRET.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse, type NextRequest } from 'next/server'
import { verifyCronSecret, getServiceClient } from '@/lib/apiAuth'
import { runMonthlyLoad, type CenterAccount, type LoadResult } from '@/lib/centerMonthlyLoad'
import { getAlertSettings } from '@/lib/cardStock'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
const SPACING_MS = 300

type Row = Omit<CenterAccount, 'center_name'> & { card_centers: { name: string; is_active: boolean } | { name: string; is_active: boolean }[] }

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || !verifyCronSecret(request)) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const { data, error } = await db.from('center_monthly_cards')
    .select('center_id, phone, card_number, nedarim_client_id, id_number, card_centers!inner(name, is_active)')
    .not('card_number', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: { center: string; result: LoadResult; error?: string }[] = []
  for (const row of (data ?? []) as unknown as Row[]) {
    const c = Array.isArray(row.card_centers) ? row.card_centers[0] : row.card_centers
    if (!c?.is_active) continue
    const { card_centers: _drop, ...rest } = row
    void _drop
    const acc: CenterAccount = { ...rest, center_name: c.name }
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

  const problems = results.filter(r => r.result === 'no_stock' || r.result === 'error' || r.result === 'busy')
  if (problems.length) {
    try {
      const { emails } = await getAlertSettings(db)
      const label: Record<string, string> = { no_stock: 'אין מלאי כרטיסים', error: 'שגיאה', busy: 'טעינה תקועה (בטיפול)' }
      const html = `<div dir="rtl" style="font-family:Heebo,Arial,sans-serif"><h3>⚠️ טעינה חודשית למוקדים: ${problems.length} מוקדים לא נטענו</h3><ul>${problems.map(p => `<li>${p.center}: ${label[p.result]}${p.error ? ` (${p.error})` : ''}</li>`).join('')}</ul><p>אפשר להטעין ידנית אחרי תיקון (טעינה חוזרת באותו חודש בטוחה).</p></div>`
      for (const to of emails) await deliverMail(to, '⚠️ טעינה חודשית למוקדים: מוקדים לא נטענו', html, undefined, mailFor('main'))
    } catch (e) { console.error('[center-monthly-load] mail failed:', e) }
  }
  return NextResponse.json({ total: results.length, summary, results })
}
