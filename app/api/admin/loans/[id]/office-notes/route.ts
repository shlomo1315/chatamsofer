import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'

// ─────────────────────────────────────────────────────────────────────────────
// הערות המשרד על בקשת הלוואה — שדה פנימי לצוות, נערך בכרטסת לפני ההכרעה.
//
// ⚠️ אינו נחשף למבקש ואינו נשלח באף מייל. נפרד מ-loans.notes שהוא הערות
// *המבקש* מטופס ההגשה — ראו ההערה במיגרציה 20260816_loan_office_notes.
//
// ⚠️ אין middleware בפרויקט — כל מסלול מגן על עצמו.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

const MAX_LEN = 5000

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('loans', 'edit')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { notes?: unknown }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  // ⚠️ טקסט חופשי נשמר כפי שהוא ומוצג כטקסט (whitespace-pre-wrap), לא
  // כ-HTML — ולכן אין צורך בניטרול כאן. ריק נשמר כ-null ולא כמחרוזת ריקה,
  // כדי ש"אין הערות" יהיה מצב אחד ולא שניים.
  const raw = typeof body.notes === 'string' ? body.notes.slice(0, MAX_LEN).trim() : ''
  const value = raw || null

  const { error } = await db
    .from('loans')
    .update({ office_notes: value, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('[loan-office-notes] שמירה נכשלה:', error.message)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, notes: value })
}
