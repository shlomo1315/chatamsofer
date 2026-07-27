import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// שמירת רשומת היסטוריה לבקשת תיקון/השלמת מסמכים.
//
// נקרא מ-StatusControl ברגע שהמזכירות מסמנת "השלמת מסמכים" ומבקשת תיקונים.
// כל בקשה נשמרת כרשומה נפרדת (היסטוריה מלאה), כדי שתמיד יהיה אפשר לראות
// בדיעבד מה בדיוק ביקשנו מהצאצא — כולל ההערות החופשיות שעד היום נעלמו.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const staff = await requirePermission('beneficiaries', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: {
    beneficiaryId?: string
    required_docs?: string
    docs_notes?: string
    lineage_fix_required?: boolean
    lineage_fix_note?: string
  }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { beneficiaryId, required_docs, docs_notes, lineage_fix_required, lineage_fix_note } = body
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה נרשם' }, { status: 400 })

  // אין טעם לשמור רשומה ריקה לגמרי (בלי מסמכים, בלי הערות, בלי תיקון דורות)
  const hasContent = !!(required_docs?.trim() || docs_notes?.trim() || lineage_fix_required)
  if (!hasContent) return NextResponse.json({ ok: true, skipped: true })

  // שם הצוות שביקש — לנוחות התצוגה
  let requestedByName: string | null = null
  const { data: prof } = await db.from('profiles').select('full_name, name, email').eq('id', staff.userId).maybeSingle()
  if (prof) requestedByName = (prof as { full_name?: string; name?: string; email?: string }).full_name
    ?? (prof as { name?: string }).name ?? (prof as { email?: string }).email ?? null

  const { error } = await db.from('docs_fix_requests').insert({
    beneficiary_id: String(beneficiaryId),
    required_docs: required_docs?.trim() || null,
    docs_notes: docs_notes?.trim() || null,
    lineage_fix_required: lineage_fix_required === true,
    lineage_fix_note: lineage_fix_note?.trim() || null,
    requested_by: staff.userId,
    requested_by_name: requestedByName,
  })
  if (error) return NextResponse.json({ error: 'שמירת ההיסטוריה נכשלה' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
