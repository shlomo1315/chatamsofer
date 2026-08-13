import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// אבחון שרשור בירורי הלוואות.
//
// 🔴 השאלה: "למה התשובה שלי מגיעה כמייל חדש ולא באותו שרשור."
//
// השרשור נשען על message_id של תשובת המבקש — מזהה שנלכד מכותרות המייל
// הנכנס. בלעדיו אין למה להצמיד את ההודעה, וגמייל פותח שרשור חדש.
//
// ⚠️ שלוש סיבות אפשריות, וכל אחת דורשת תיקון אחר לגמרי:
//   1. העמודות אינן קיימות במסד (המיגרציה לא רצה) — התיקון: להריץ אותה.
//   2. העמודות קיימות אך ריקות — הכותרות לא נלכדות מהמייל הנכנס.
//   3. אין בכלל תשובות נכנסות — הקליטה עצמה נכשלת.
//
// בלי להבחין ביניהן, כל ניסיון תיקון הוא ניחוש.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  if (!(await requirePermission('loans', 'view'))) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ── 1. האם עמודות השרשור קיימות ──
  // ⚠️ נבדק בשאילתה ולא בסכימה: שגיאת PostgREST על עמודה חסרה היא הראיה
  // הישירה, ואין צורך בהרשאות מיוחדות כדי לקבל אותה.
  const probe = await db.from('loan_messages').select('message_id, references_chain').limit(1)
  const columnsExist = !probe.error

  const { data: applicantMsgs } = await db
    .from('loan_messages')
    .select(columnsExist ? 'id, loan_id, direction, created_at, message_id, references_chain' : 'id, loan_id, direction, created_at')
    .eq('direction', 'applicant')
    .order('created_at', { ascending: false })
    .limit(20)

  const rows = (applicantMsgs ?? []) as unknown as Record<string, unknown>[]
  const withId = rows.filter(r => r.message_id).length

  // ── 2. שרשורים פעילים ──
  const { count: totalApplicant } = await db.from('loan_messages')
    .select('id', { count: 'exact', head: true }).eq('direction', 'applicant')
  const { count: totalStaff } = await db.from('loan_messages')
    .select('id', { count: 'exact', head: true }).eq('direction', 'staff')

  // ── 3. האבחון האחרון של קליטת תשובה ──
  const { data: dbg } = await db.from('app_settings')
    .select('value, updated_at').eq('key', 'loan_inquiry_debug').maybeSingle()

  // 🔴 ההכרעה — מה בדיוק שבור.
  let verdict: string
  let fix: string
  if (!columnsExist) {
    verdict = 'עמודות השרשור חסרות במסד'
    fix = 'יש להריץ את המיגרציה 20260715_loan_inquiry_threading.sql'
  } else if ((totalApplicant ?? 0) === 0) {
    verdict = 'לא נקלטה אף תשובה ממבקש'
    fix = 'הבעיה בקליטה, לא בשרשור — יש לבדוק את ניתוב הדואר הנכנס'
  } else if (withId === 0) {
    verdict = 'תשובות נקלטות אך בלי מזהה שרשור'
    fix = 'כותרת Message-ID אינה מגיעה מהמייל הנכנס — ראו loan_inquiry_debug למטה'
  } else if (withId < rows.length) {
    verdict = `שרשור חלקי — ${withId} מתוך ${rows.length} תשובות אחרונות עם מזהה`
    fix = 'חלק מהתשובות מגיעות בלי כותרות. השרשור יעבוד רק עליהן'
  } else {
    verdict = 'תקין — כל התשובות האחרונות נושאות מזהה שרשור'
    fix = 'אם עדיין נפתח שרשור חדש, הבעיה בצד לקוח הדואר של הנמען'
  }

  return NextResponse.json({
    verdict,
    fix,
    columnsExist,
    totals: { applicantMessages: totalApplicant ?? 0, staffMessages: totalStaff ?? 0 },
    recentApplicant: rows.map(r => ({
      loan_id: r.loan_id,
      created_at: r.created_at,
      hasMessageId: !!r.message_id,
      hasReferences: !!r.references_chain,
    })),
    lastInboundDebug: dbg?.value ? JSON.parse(String(dbg.value)) : null,
    lastInboundAt: dbg?.updated_at ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
