import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { resolveAuthorName } from '@/lib/beneficiaryNotes'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// "צ'אט" תיעוד המשפחה — הערות פנימיות של הצוות, כרונולוגית, עם שם הכותב.
//   GET  ?beneficiaryId=…  → כל ההערות (הישנה ראשונה)
//   POST { beneficiaryId, body } → הוספת הערה חדשה (חתומה בשם הכותב)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const staff = await requirePermission('beneficiaries', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const beneficiaryId = request.nextUrl.searchParams.get('beneficiaryId')
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה משפחה' }, { status: 400 })

  const { data, error } = await db
    .from('beneficiary_notes')
    .select('id, body, author_id, author_name, created_at')
    .eq('beneficiary_id', beneficiaryId)
    .order('created_at', { ascending: true })
  // הטבלה נוצרת במיגרציה ידנית — עד שהיא רצה, מחזירים רשימה ריקה במקום שגיאה.
  if (error) return NextResponse.json({ notes: [] })

  return NextResponse.json({ notes: data ?? [], currentUserId: staff.userId })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('beneficiaries', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { beneficiaryId?: string; body?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const beneficiaryId = body.beneficiaryId
  const text = (body.body ?? '').trim()
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה משפחה' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'ההערה ריקה' }, { status: 400 })

  // שם הכותב — לנוחות תצוגה בלי join
  const authorName = await resolveAuthorName(db, staff.userId)

  const { data, error } = await db.from('beneficiary_notes').insert({
    beneficiary_id: String(beneficiaryId),
    body: text,
    author_id: staff.userId,
    author_name: authorName,
  }).select('id, body, author_id, author_name, created_at').single()
  if (error) return NextResponse.json({ error: 'שמירת ההערה נכשלה' }, { status: 500 })

  return NextResponse.json({ note: data })
}
