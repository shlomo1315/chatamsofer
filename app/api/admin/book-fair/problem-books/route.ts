import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { PROBLEM_BOOKS_KEY, parseProblemBooks, setProblemBook } from '@/lib/bookFairProblemBooks'

// סימון ספר כ"בעייתי במלאי" — ראו lib/bookFairProblemBooks.
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'גוף בקשה שגוי' }, { status: 400 }) }

  const bookId = String(body.bookId ?? '')
  if (!UUID_RE.test(bookId)) return NextResponse.json({ error: 'מזהה ספר לא תקין' }, { status: 400 })
  if (typeof body.problem !== 'boolean') {
    return NextResponse.json({ error: 'ערך הסימון חייב להיות בוליאני' }, { status: 400 })
  }
  const note = body.note == null ? null : String(body.note).slice(0, 200)

  const { data: book } = await db.from('book_fair_books').select('id, title').eq('id', bookId).maybeSingle()
  if (!book) return NextResponse.json({ error: 'הספר לא נמצא' }, { status: 404 })

  // ⚠️ קריאה-שינוי-כתיבה ולא עמודה: שני סימונים באותה שנייה בדיוק עלולים
  // לדרוס זה את זה. בשימוש בפועל (אדם אחד, לחיצה ידנית) זה לא קורה, והמחיר
  // של מיגרציה ידנית שנשכחת גבוה יותר.
  const { data: row, error: readErr } = await db.from('app_settings')
    .select('value').eq('key', PROBLEM_BOOKS_KEY).maybeSingle()
  if (readErr) {
    console.error('[book-fair/problem-books] read failed:', readErr)
    return NextResponse.json({ error: 'קריאת הרשימה נכשלה' }, { status: 500 })
  }

  const next = setProblemBook(parseProblemBooks(row?.value), bookId, body.problem, note, new Date().toISOString())

  // 🔴 JSON.stringify חובה: העמודה text, ואובייקט גולמי נשמר כ-"[object Object]" בשקט.
  const { error } = await db.from('app_settings')
    .upsert({ key: PROBLEM_BOOKS_KEY, value: JSON.stringify(next) }, { onConflict: 'key' })
  if (error) {
    console.error('[book-fair/problem-books] upsert failed:', error)
    return NextResponse.json({ error: 'שמירת הסימון נכשלה' }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId,
    action: body.problem ? 'book_fair_problem_mark' : 'book_fair_problem_unmark',
    entityType: 'book_fair_book', entityId: bookId,
    details: { title: book.title, note },
  })

  return NextResponse.json({ ok: true, problems: next })
}
