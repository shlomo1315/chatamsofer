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

  // ⚠️ השלמת שם הכותב לרשומות שנשמרו בלי שם. הן נוצרו כשהשליפה מ-profiles
  // הייתה שבורה (עמודה לא קיימת ב-select), ולכן author_name נשמר ריק והתיעוד
  // הוצג כ"משתמש". ההשלמה כאן מתקנת גם את מה שכבר נכתב, בלי מיגרציית נתונים.
  const notes = (data ?? []) as { author_id: string | null; author_name: string | null }[]
  const missing = [...new Set(notes.filter(n => !n.author_name && n.author_id).map(n => n.author_id as string))]
  if (missing.length) {
    const { data: profs } = await db.from('profiles').select('id, full_name, email').in('id', missing)
    const byId = new Map(
      (profs ?? []).map(p => {
        const r = p as { id: string; full_name?: string | null; email?: string | null }
        return [r.id, (r.full_name?.trim() || r.email?.trim()) ?? null]
      }),
    )
    for (const n of notes) {
      if (!n.author_name && n.author_id) n.author_name = byId.get(n.author_id) ?? null
    }
  }

  return NextResponse.json({ notes, currentUserId: staff.userId })
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
