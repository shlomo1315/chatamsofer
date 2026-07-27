import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// עדכון בחירת ההטבות של היולדת (כרטיס מזון / בית החלמה) על ידי אדמין.
// חובה להשאיר לפחות אחת מסומנת — כמו בטופס הציבורי.
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  if (!(await requirePermission('maternity', 'edit'))) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { id?: string; wants_food_card?: boolean; wants_recovery?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { id, wants_food_card, wants_recovery } = body
  if (!id) return NextResponse.json({ error: 'חסר מזהה בקשה' }, { status: 400 })
  if (typeof wants_food_card !== 'boolean' || typeof wants_recovery !== 'boolean') {
    return NextResponse.json({ error: 'ערכי הבחירה חסרים' }, { status: 400 })
  }
  if (!wants_food_card && !wants_recovery) {
    return NextResponse.json({ error: 'יש להשאיר לפחות אחת מההטבות מסומנת' }, { status: 400 })
  }

  const { error } = await db
    .from('maternity_aids')
    .update({ wants_food_card, wants_recovery })
    .eq('id', String(id))

  if (error) return NextResponse.json({ error: 'שמירת הבחירה נכשלה' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
