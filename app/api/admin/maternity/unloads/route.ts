import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// פילוח הפריקות — מתי, למי, ומה עלה בגורל הכסף.
//
// 🔴 מקור האמת הוא maternity_aids ולא יומן הפעילות: היומן נרשם
// best-effort ויש בו פערים (15 רשומות מול 13 תיקים עם תאריך פריקה),
// בעוד card_unloaded_at נכתב באותה עסקה של הפריקה עצמה.
//
// ⚠️ אין middleware — הנתיב מגן על עצמו.
// ─────────────────────────────────────────────────────────────────────────────

type Row = {
  id: string
  birth_date: string | null
  birth_type: string | null
  status: string | null
  card_number: string | null
  card_tlush_id: string | null
  card_balance: number | null
  card_loaded_at: string | null
  card_unloaded_at: string | null
  card_load_error: string | null
  six_weeks_end: string | null
  beneficiary?: {
    id: string; family_name: string | null; full_name: string | null
    spouse_name: string | null; nedarim_id: string | null
  } | { id: string; family_name: string | null; full_name: string | null
        spouse_name: string | null; nedarim_id: string | null }[] | null
}

export async function GET() {
  if (!(await requirePermission('maternity', 'view'))) {
    return forbidden('אין הרשאה לצפות בפריקות')
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ fetchAllRows — מספר התיקים גדל בהתמדה, ותקרת 1,000 השקטה הייתה
  // חותכת את הפילוח בלי שום סימן.
  const { rows, error } = await fetchAllRows<Row>((from, to) => db
    .from('maternity_aids')
    .select('id, birth_date, birth_type, status, card_number, card_tlush_id, card_balance, card_loaded_at, card_unloaded_at, card_load_error, six_weeks_end, beneficiary:beneficiaries(id, family_name, full_name, spouse_name, nedarim_id)')
    .not('card_unloaded_at', 'is', null)
    .order('card_unloaded_at', { ascending: false })
    .range(from, to))

  if (error) return NextResponse.json({ error }, { status: 500 })

  // ⚠️ Supabase מחזיר יחסי join לעתים כמערך ולעתים כאובייקט.
  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

  const unloads = rows.map(r => {
    const b = one(r.beneficiary)
    return {
      aidId: r.id,
      beneficiaryId: b?.id ?? null,
      motherName: [b?.family_name, b?.spouse_name || b?.full_name].filter(Boolean).join(' ') || '—',
      nedarimId: b?.nedarim_id ?? null,
      birthDate: r.birth_date,
      // ⚠️ מוצג במפורש: לידה שקטה מתנהלת אחרת, וערבוב הסוגים בפילוח
      // מסתיר את ההבחנה.
      silent: (r.birth_type ?? 'live') === 'silent',
      status: r.status,
      cardLast4: (r.card_number ?? '').slice(-4) || null,
      tlushId: r.card_tlush_id,
      loadedAt: r.card_loaded_at,
      unloadedAt: r.card_unloaded_at,
      dueDate: r.six_weeks_end,
      // 🔴 "נוצל במלואו" אינו כשל: נדרים החזירה "אין יתרה לפריקה",
      // כלומר המשפחה השתמשה בכסף. ההבחנה קריטית לסטטיסטיקה.
      alreadySpent: /נוצל במלואו/.test(r.card_load_error ?? ''),
      error: r.card_load_error,
    }
  })

  // ── סיכום ──
  const AMOUNT = 600   // סכום הטעינה הסטנדרטי
  const spent = unloads.filter(u => u.alreadySpent).length
  const released = unloads.length - spent

  return NextResponse.json({
    unloads,
    summary: {
      total: unloads.length,
      // כסף שחזר לקופה — פריקות שבהן באמת נותרה יתרה
      moneyReleased: released * AMOUNT,
      // כסף שנוצל בפועל על ידי המשפחות
      spentCount: spent,
      moneySpent: spent * AMOUNT,
      // ⚠️ עדיין טעונים — מה שממתין לפריקה עתידית
      lastUnload: unloads[0]?.unloadedAt ?? null,
      silentCount: unloads.filter(u => u.silent).length,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
