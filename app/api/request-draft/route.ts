import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { buildDraftBody, SUBJECT_PREFIX, MAILBOX_REQUEST_TYPE, type ReqType } from '@/lib/emailRequestForms'
import { loadCtx } from '@/lib/emailRequestIntake'

/**
 * סוג → תיבת האגף. נגזר מהמיפוי ההפוך שכבר קיים.
 *
 * ⚠️ נגזר ולא מוקלד מחדש: שתי רשימות היו נפרדות זו מזו, וכתובת שהשתנתה
 * במקום אחד הייתה שולחת בקשות לתיבה שאינה קולטת אותן.
 */
const MAILBOX_FOR: Partial<Record<ReqType, string>> = Object.fromEntries(
  Object.entries(MAILBOX_REQUEST_TYPE).map(([box, t]) => [t, box]),
) as Partial<Record<ReqType, string>>

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// פתיחת טיוטת בקשה ב-Gmail, עם **כל שדות הטופס**.
//
// 🔴 זה מה שהיה שבור: כפתורי ההגשה בנו גוף גנרי משלהם (שם/ת"ז/טלפון
// בלבד), בעוד הצינור מצפה לשדות המלאים של סוג הבקשה ומפרסר אותם משם.
// התוצאה — המשפחה שלחה מייל בלי הפרטים שהבקשה דורשת.
//
// ⚠️ הגוף נבנה כאן ולא בלקוח: buildDraftBody דורש ctx שנטען מהמסד
// (רשימת השדות, המסמכים והמגבלות משתנה לפי הגדרות המחלקה).
//
// ⚠️ הפניה ל-Gmail ולא mailto: — Gmail חוסם mailto מגוף הודעה והתוצאה
// דף לבן. ראו gmailComposeUrl ב-autoReplyConfig.
// ─────────────────────────────────────────────────────────────────────────────

const VALID: ReqType[] = ['birth', 'silent_birth', 'loan', 'financial_aid', 'widow']

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const type = String(sp.get('type') ?? '') as ReqType
  if (!VALID.includes(type)) {
    return NextResponse.json({ error: 'סוג בקשה לא מוכר' }, { status: 400 })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ ת"ז אינה ידועה כאן — המשפחה מקלידה אותה בשורת הנושא. מציין-מקום
  // ריק, כך שהשדות בגוף נבנים אך אין ערך מומצא.
  const ctx = await loadCtx(db, type, true)
  const body = buildDraftBody(type, '', ctx)

  const mailbox = MAILBOX_FOR[type] ?? 'igud@chasamsofer.info'
  // ⚠️ הנושא נגמר ב-"ת.ז " פתוח: הסמן ממשיך ישירות למספר ואין מה למחוק.
  // בתיבת אגף די בת"ז לבדה, אבל השארת הקידומת אינה מזיקה והיא מסייעת
  // לפונה להבין מה הוא שולח.
  const subject = `${SUBJECT_PREFIX[type]} · ת.ז `

  // 🔴 /u/0/ חובה. בלעדיו Gmail מחזיר "Bad Request · Error 400" —
  // הנתיב /mail/?view=cm אינו תקף, ורק /mail/u/0/?view=cm עובד.
  const p = new URLSearchParams({ view: 'cm', fs: '1', to: mailbox, su: subject, body })
  return NextResponse.redirect(`https://mail.google.com/mail/u/0/?${p.toString()}`)
}
