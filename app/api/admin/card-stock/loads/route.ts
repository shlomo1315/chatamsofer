import { NextResponse } from 'next/server'
import { requireAdmin, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { fetchByIds } from '@/lib/fetchByIds'
import { buildLoadJournal, LOADED_ACTION, FAILED_ACTION, type JournalEvent, type JournalAid } from '@/lib/cardLoadJournal'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

// GET: יומן טעינות הכרטיסים מתחילת ההיסטוריה — מ-activity_log בלבד.
// ⚠️ אין כאן שום פנייה לנדרים: היומן מציג מה שנרשם אצלנו בכל טעינה.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401, headers: NO_STORE })
  }
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: NO_STORE })

  const { rows: events, error: evErr } = await fetchAllRows<JournalEvent>((from, to) => admin
    .from('activity_log')
    .select('action, entity_id, user_id, details, created_at')
    .in('action', [LOADED_ACTION, FAILED_ACTION])
    .order('created_at', { ascending: true })
    .range(from, to))
  if (evErr) {
    console.error('[card-stock/loads] activity_log query failed:', evErr)
    return NextResponse.json({ error: 'שגיאה בטעינת היומן' }, { status: 500, headers: NO_STORE })
  }

  // ⚠️ חובה לקבל את כל התיקים: תיק שלא חזר נחשב "נמחק" ומסונן כטסט,
  // ולכן כשל בשליפה ייכשל בגלוי ולא יעלים יולדות אמיתיות מהיומן.
  const aidIds = [...new Set(events.map(e => e.entity_id).filter((x): x is string => !!x))]
  const { rows: aidRows, error: aidErr } = await fetchByIds<Record<string, unknown>>(aidIds, chunk => admin
    .from('maternity_aids')
    .select('id, card_load_status, beneficiary:beneficiaries(family_name, spouse_name, full_name)')
    .in('id', chunk))
  if (aidErr) {
    console.error('[card-stock/loads] aids query failed:', aidErr)
    return NextResponse.json({ error: 'שגיאה בטעינת היומן' }, { status: 500, headers: NO_STORE })
  }
  const aids: JournalAid[] = aidRows.map(a => {
    const raw = a.beneficiary
    const b = (Array.isArray(raw) ? raw[0] : raw) as Record<string, string | null> | null
    const name = b ? `${b.family_name ?? ''} ${b.spouse_name || b.full_name || ''}`.trim() : ''
    return { id: a.id as string, name: name || 'ללא שם', card_load_status: (a.card_load_status as string | null) ?? null }
  })

  const userIds = [...new Set(events.map(e => e.user_id).filter((x): x is string => !!x))]
  const staff = new Map<string, string>()
  if (userIds.length) {
    const { rows: profs } = await fetchByIds<{ id: string; full_name: string | null }>(userIds, chunk => admin
      .from('profiles').select('id, full_name').in('id', chunk))
    for (const p of profs) staff.set(p.id, p.full_name || 'משתמש')
  }

  return NextResponse.json(buildLoadJournal(events, aids, staff), { headers: NO_STORE })
}
