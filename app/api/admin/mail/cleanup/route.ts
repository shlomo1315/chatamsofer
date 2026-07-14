import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'

// ─────────────────────────────────────────────────────────────────────────────
// ניקוי תיבת המייל: מיילים שנשמרו בתיבה הלא נכונה, ותשובות בירור שנקלטו
// בטעות לדואר הנכנס במקום לצ'אט של ההלוואה.
//
// GET  = תצוגה מקדימה. לא משנה דבר.
// POST = מבצע.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** תשובות לבירור הלוואה — מזוהות לפי הנושא של המייל שאנחנו שלחנו. */
const INQUIRY_SUBJECTS = [
  'הודעה מגמ״ח היכל החתם סופר',
  'הודעה מגמ"ח היכל החתם סופר',
  'בנוגע לבקשת ההלוואה',       // הנושא הישן, לפני השינוי
]

function isInquiryReply(subject: string): boolean {
  const s = String(subject ?? '')
  return INQUIRY_SUBJECTS.some(t => s.includes(t))
}

async function analyze(db: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { data, error } = await db
    .from('inbound_emails')
    .select('id, to_email, subject, from_email, created_at')
    .eq('source', 'resend')
    .order('created_at', { ascending: false })
    .limit(2000)

  if (error) throw new Error(error.message)

  // תשובות בירור שנכנסו לדואר — הן שייכות לצ'אט, לא לתיבה
  const inquiryReplies = (data ?? []).filter(m => isInquiryReply(String(m.subject ?? '')))

  // פילוח לפי תיבה — כדי לראות מה יושב איפה
  const byBox: Record<string, number> = {}
  for (const m of data ?? []) {
    const b = String(m.to_email ?? '(ריק)')
    byBox[b] = (byBox[b] ?? 0) + 1
  }

  return { total: data?.length ?? 0, byBox, inquiryReplies }
}

export async function GET() {
  const staff = await requireStaff(['admin'])
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  try {
    const { total, byBox, inquiryReplies } = await analyze(db)

    return NextResponse.json({
      mode: 'תצוגה מקדימה — לא שונה דבר',
      סהכ_מיילים: total,
      פילוח_לפי_תיבה: byBox,
      תשובות_בירור_שיוסרו: inquiryReplies.length,
      דוגמאות: inquiryReplies.slice(0, 20).map(m => ({
        נושא: m.subject,
        מאת: m.from_email,
        בתיבה: m.to_email,
        מתי: m.created_at,
      })),
    })
  } catch (e) {
    console.error('[mail/cleanup] ניתוח נכשל:', e)
    return NextResponse.json({ error: 'הניתוח נכשל' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff(['admin'])
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { confirm?: boolean }
  try { body = await request.json() } catch { body = {} }
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'נדרש אישור מפורש: {"confirm": true}' }, { status: 400 })
  }

  try {
    const { inquiryReplies } = await analyze(db)

    let removed = 0
    for (const m of inquiryReplies) {
      const { error } = await db.from('inbound_emails').delete().eq('id', m.id)
      if (!error) removed++
    }

    return NextResponse.json({
      ok: true,
      הוסרו: removed,
      message: `${removed} תשובות בירור הוסרו מהדואר הנכנס (הן מוצגות בצ'אט של ההלוואה)`,
    })
  } catch (e) {
    console.error('[mail/cleanup] ניקוי נכשל:', e)
    return NextResponse.json({ error: 'הניקוי נכשל' }, { status: 500 })
  }
}
