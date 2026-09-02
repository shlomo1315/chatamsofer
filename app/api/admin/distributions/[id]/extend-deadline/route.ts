import { NextResponse, type NextRequest } from 'next/server'
import { requireNonMailStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// סימון משפחות לקבלת המועד המוארך לבחירת מוקד.
//
// 🔴 מי שנוסף ידנית (source='admin') מקבל את ההארכה ממילא ואינו דורש סימון —
// ראו isExtendedRecipient ב-lib/centerDeadline. הנתיב הזה נועד למקרה השני:
// משפחה שנרשמה בערוץ רגיל, פספסה את המועד, והתקשרה למשרד.
//
// ⚠️ השעה עצמה נקבעת ברמת החלוקה (centers_deadline_extended) ולא כאן. כך
// שינוי שעה חל על כל הקבוצה בבת אחת, ואין עשרות תאריכים לתחזק.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // ⚠️ requireNonMailStaff: הפעולה משנה מי רשאי לבחור מוקד — פעולת חלוקה,
  // לא פעולת דואר.
  const staff = await requireNonMailStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { id } = await ctx.params
  const body = await request.json().catch(() => ({})) as {
    recipientIds?: string[]
    extended?: boolean
  }

  const ids = Array.isArray(body.recipientIds)
    ? body.recipientIds.map(String).filter(Boolean)
    : []
  if (!ids.length) return NextResponse.json({ error: 'לא נבחרו שורות' }, { status: 400 })

  const extended = body.extended !== false

  // ⚠️ מסונן לחלוקה הנוכחית: מזהה משורה של חלוקה אחרת לא ישנה דבר,
  // במקום לעדכן בשקט רשומה שאינה על המסך.
  const { data, error } = await db.from('distribution_recipients')
    .update({ deadline_extended: extended })
    .eq('distribution_id', id)
    .in('id', ids)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const changed = (data ?? []).length
  console.log(
    `[extend-deadline] חלוקה ${id}: ${changed} שורות → ${extended ? 'הוארך' : 'בוטל'} · ${staff.email ?? ''}`,
  )

  return NextResponse.json({ ok: true, changed })
}
