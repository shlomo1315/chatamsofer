import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// ─────────────────────────────────────────────────────────────────────────────
// משפחות שאושרו אוטומטית מהעץ — תצוגה והחזרה.
//
// 🔴 הרקע: אישור צומת בעץ מקדם אוטומטית ל-'approved' כל משפחה שהשרשרת שלה
// מאומתת (approveVerifiedBeneficiaries). זה כולל משפחות שהיו 'pending',
// 'review', או בלי סטטוס — כלומר משפחות שאיש לא בדק אישית.
//
// ⚠️ אין דרך ודאית לדעת מי אושר כך: lineageSync אינו כותב ל-activity log,
// ואין עמודה שמסמנת "אושר אוטומטית". לכן הזיהוי כאן הוא *הצלבה*, והוא
// מוצג למשתמש כחשד ולא כעובדה — הוא זה שמכריע.
//
// GET  — מי מאושר ואין לו ראיה לאישור אנושי.
// POST — החזרת נבחרים ל'pending'.
// ─────────────────────────────────────────────────────────────────────────────

interface Ben {
  id: string
  full_name?: string | null
  family_name?: string | null
  id_number?: string | null
  city?: string | null
  email?: string | null
  eligibility_status?: string | null
  lineage_node_id?: string | null
  created_at?: string | null
  updated_at?: string | null
  docs_returned_at?: string | null
}

export async function GET(request: NextRequest) {
  if (!(await requirePermission('lineage', 'view'))) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { rows: approved } = await fetchAllRows<Ben>((from, to) => db
    .from('beneficiaries')
    .select('id, full_name, family_name, id_number, city, email, eligibility_status, lineage_node_id, created_at, updated_at, docs_returned_at')
    .eq('eligibility_status', 'approved')
    .order('updated_at', { ascending: false })
    .range(from, to))

  // ── הראיה לאישור אנושי ──
  // ⚠️ activity_log הוא המקום היחיד שבו אישור ידני מתועד. משפחה שמופיעה
  // שם אושרה בהחלטה מפורשת, וזו הראיה שמוציאה אותה מהחשד.
  const { rows: logs } = await fetchAllRows<{ entity_id: string; action: string; created_at: string }>((from, to) => db
    .from('activity_log')
    .select('entity_id, action, created_at')
    .in('action', ['beneficiary_approved', 'beneficiary_status_changed', 'eligibility_approved'])
    .range(from, to))

  const humanApproved = new Map<string, string>()
  for (const l of logs) {
    if (l.entity_id && !humanApproved.has(l.entity_id)) humanApproved.set(l.entity_id, l.created_at)
  }

  // ⚠️ שתי קבוצות נפרדות, כי הן דורשות פעולה שונה:
  //   suspect  — מאושרת בלי תיעוד אישור, ויש לה שיוך לצומת בעץ. זו בדיוק
  //              החתימה של קידום אוטומטי.
  //   noNode   — מאושרת בלי תיעוד ובלי שיוך לעץ. אלה בדרך כלל רשומות
  //              ותיקות מלפני התיעוד, ולא תוצר של הקידום — ולכן בנפרד.
  const suspect: Ben[] = []
  const noNode: Ben[] = []
  for (const b of approved) {
    if (humanApproved.has(b.id)) continue
    if (b.lineage_node_id) suspect.push(b)
    else noNode.push(b)
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase()
  const match = (b: Ben) => !q || [b.family_name, b.full_name, b.id_number, b.city]
    .filter(Boolean).join(' ').toLowerCase().includes(q)

  const shape = (b: Ben) => ({
    id: b.id,
    name: [b.family_name, b.full_name].filter(Boolean).join(' ') || b.full_name || '—',
    id_number: b.id_number ?? null,
    city: b.city ?? null,
    email: b.email ?? null,
    updated_at: b.updated_at ?? null,
    created_at: b.created_at ?? null,
    hasNode: !!b.lineage_node_id,
  })

  return NextResponse.json({
    totalApproved: approved.length,
    humanApprovedCount: approved.length - suspect.length - noNode.length,
    suspect: suspect.filter(match).map(shape),
    noNode: noNode.filter(match).map(shape),
    suspectTotal: suspect.length,
    noNodeTotal: noNode.length,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  // ⚠️ 'edit' ולא 'view': הפעולה משנה זכאות, ומשפחה שהוחזרה ל'ממתין'
  // מפסיקה לקבל סיוע עד שתאושר מחדש.
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { ids?: string[] }
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : []
  if (!ids.length) return NextResponse.json({ error: 'לא נבחרו משפחות' }, { status: 400 })

  // ⚠️ מוחזרות ל'pending' ולא ל-null: null נראה כרשומה שמעולם לא נבדקה,
  // ו'pending' אומר במפורש "ממתינה להחלטה" — וזה המצב הנכון.
  const { data, error } = await db.from('beneficiaries')
    .update({ eligibility_status: 'pending', updated_at: new Date().toISOString() })
    .in('id', ids)
    .eq('eligibility_status', 'approved')   // רק מאושרות — הגנה מפני מרוץ
    .select('id')

  if (error) {
    console.error('[auto-approved] החזרה נכשלה:', error.message)
    return NextResponse.json({ error: 'ההחזרה נכשלה' }, { status: 500 })
  }

  const reverted = (data ?? []).map(r => (r as { id: string }).id)
  await logActivity(db, {
    action: 'beneficiaries_reverted_to_pending',
    entityType: 'beneficiaries',
    details: { count: reverted.length, ids: reverted, reason: 'אושרו אוטומטית מהעץ ללא החלטה אנושית' },
  }).catch(() => {})

  console.log(`[auto-approved] הוחזרו ל'ממתין': ${reverted.length}`)
  return NextResponse.json({ ok: true, reverted: reverted.length })
}
