import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { previewReset, runReset, type ResetTarget } from '@/lib/holidayCardReset'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// איפוס כרטיסי החגים.
//
// 🔴 פעולה בלתי הפיכה. GET = תצוגה מקדימה בלבד ומחזיר **כמה כסף עדיין
// טעון** — ההתרעה שהמשתמש ביקש. POST דורש confirm:true.
//
// 🔴 הלקוח אינו נמחק מנדרים — רק הכרטיס מנותק, כך שההיסטוריה נשמרת
// ובחג הבא מחברים כרטיס חדש בלי להקליד הכול מחדש.
// ─────────────────────────────────────────────────────────────────────────────

interface BenRel { id_number: string | null; family_name: string | null; full_name: string | null }
const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

async function targetsFor(
  db: NonNullable<ReturnType<typeof getServiceClient>>,
  distributionId: string,
): Promise<ResetTarget[]> {
  // ⚠️ רק כרטיסים שנטענו — לשאר אין מה לפרוק.
  const { rows } = await fetchAllRows<{ id: string; beneficiary: BenRel | BenRel[] | null }>(
    (from, to) => db.from('distribution_recipients')
      .select('id, beneficiary:beneficiaries(id_number, family_name, full_name)')
      .eq('distribution_id', distributionId).eq('load_status', 'loaded').range(from, to))

  return rows.map(r => {
    const b = one(r.beneficiary)
    return {
      recipientId: r.id,
      idNumber: b?.id_number ?? null,
      name: [b?.family_name, b?.full_name].filter(Boolean).join(' ') || 'ללא שם',
    }
  })
}

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const distributionId = request.nextUrl.searchParams.get('distribution_id') ?? ''
  if (!distributionId) return NextResponse.json({ error: 'חסר מזהה חלוקה' }, { status: 400 })

  const targets = await targetsFor(db, distributionId)
  if (!targets.length) return NextResponse.json({ cards: 0, remaining: 0, noClient: 0, loaded: 0 })

  try {
    const preview = await previewReset(targets)
    return NextResponse.json({ ...preview, loaded: targets.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'תקלה' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { distribution_id?: string; confirm?: boolean }
  // 🔴 שער האישור — פעולה בלתי הפיכה.
  if (!body.confirm) return NextResponse.json({ error: 'נדרש אישור מפורש לאיפוס' }, { status: 400 })

  const distributionId = String(body.distribution_id ?? '')
  if (!distributionId) return NextResponse.json({ error: 'חסר מזהה חלוקה' }, { status: 400 })

  const targets = await targetsFor(db, distributionId)
  if (!targets.length) return NextResponse.json({ ok: true, attempted: 0, note: 'אין כרטיסים לאיפוס' })

  console.warn(`[holiday-reset] 🔴 מתחיל איפוס ${targets.length} כרטיסים · ${staff.email ?? ''}`)

  try {
    const summary = await runReset(db, targets, { delayMs: 100 })
    return NextResponse.json({ ok: true, ...summary, errors: summary.errors.slice(0, 20) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'תקלה'
    console.error('[holiday-reset] נכשל:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
