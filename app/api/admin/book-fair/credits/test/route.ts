import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { buildCreditEmailHtml, parseTestSend, testSubject, TEST_CALL_ACTION, TEST_CREDIT } from '@/lib/bookFairCredits'
import { creditCallConfigured, placeCreditCall } from '@/lib/yemotCreditCall'
import { deliverMail } from '@/lib/sendMail'
import { logActivity } from '@/lib/activityLog'

// שליחת בדיקה של הזיכויים: מייל ושיחה עם נתוני דוגמה לכתובת ולטלפון שהמנהל מזין.
// לא קוראים ולא כותבים ל-book_fair_credits. שיחת הבדיקה נרשמת ב-activity_log,
// כדי שהשלוחה תזהה אותה ותריץ את השיחה המלאה בלי לשמור פרטי בנק.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
const TEST_NOTE = '<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:12px 24px;background:#fef3c7;color:#78350f;font-size:14px;">זהו מייל בדיקה עם נתוני דוגמה. הקישור בו אינו פעיל.</div>'

type Result = { ok: boolean; error?: string }

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const input = parseTestSend(await request.json().catch(() => null))
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })

  let email: Result | undefined, phone: Result | undefined
  if (input.email) {
    const html = TEST_NOTE + buildCreditEmailHtml({
      name: TEST_CREDIT.name, books: TEST_CREDIT.books, amountAgorot: TEST_CREDIT.amountAgorot, url: `${SITE}/credit/test`,
    })
    const res = await deliverMail(input.email, testSubject, html, undefined, { transactional: true, department: 'book_fair' })
    email = { ok: res.ok, error: res.ok ? undefined : (res.error ?? 'שליחת המייל נכשלה') }
  }
  if (input.phone) {
    if (!creditCallConfigured()) {
      phone = { ok: false, error: 'שיחות ימות לא מוגדרות (חסר YEMOT_TOKEN או YEMOT_CREDIT_TEMPLATE_ID)' }
    } else {
      // נרשם לפני החיוג, כדי שהשלוחה תזהה את הבדיקה כבר כשהשיחה נענית
      await logActivity(db, { userId: staff.userId, action: TEST_CALL_ACTION, entityType: 'book_fair_credits', details: { phone: input.phone } })
      const res = await placeCreditCall(input.phone)
      phone = { ok: res.ok, error: res.ok ? undefined : (res.error ?? 'השיחה נכשלה') }
    }
  }
  if (input.email) {
    await logActivity(db, { userId: staff.userId, action: 'book_fair_credits_test_email', entityType: 'book_fair_credits', details: { ok: email!.ok } })
  }
  return NextResponse.json({ email, phone })
}
