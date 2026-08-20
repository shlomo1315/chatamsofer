import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { SUBJECT_PREFIX, MAILBOX_REQUEST_TYPE, IGUD_MAILBOX, buildDraftBodyCompact, type ReqType } from '@/lib/emailRequestForms'
import { loadCtx } from '@/lib/emailRequestIntake'
import { gmailComposeLink, GMAIL_URL_SAFE_LIMIT } from "@/lib/draftLink"

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
// פתיחת טיוטת בקשה ב-Gmail, עם כל שדות הטופס.
//
// 🔴 הגוף נבנה כאן ולא בלקוח: רשימת השדות, המסמכים והמגבלות נטענת מהמסד
// ומשתנה לפי הגדרות המחלקה. גוף שנבנה בלקוח היה גנרי (שם/ת"ז/טלפון),
// והבקשות נקלטו ריקות.
//
// ⚠️ הגוף קומפקטי בכוונה — ראו draftLink.ts. עברית תופחת פי ~5.5 בקידוד,
// והטופס המלא לא נכנס ל-URL של Gmail.
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

  // ⚠️ ת"ז אינה ידועה כאן — המשפחה מקלידה אותה בשורת הנושא.
  const ctx = await loadCtx(db, type, true)
  const body = buildDraftBodyCompact(type, ctx)

  const mailbox = MAILBOX_FOR[type] ?? IGUD_MAILBOX

  // 🔴 שורת הנושא: סוג הבקשה + מספר לדוגמה + הוראת מחיקה בסוגריים.
  //
  // ⚠️ סוג הבקשה נשאר בנושא ואינו נמחק: באיגוד (igud@) הוא הדבר היחיד
  // שקובע את הסוג (detectReqType), ובלעדיו הבקשה אינה נקלטת כלל.
  //
  // ⚠️ מספר לדוגמה ולא שדה ריק: "ת.ז " פתוח נראה כמו טקסט שנגמר, ומי
  // שלא הבין הוסיף את המספר אחרי ההוראה או לא הקליד כלל. מספר גלוי
  // מראה בדיוק מה יש להחליף.
  //
  // ⚠️ ההוראה בסוגריים נמחקת יחד עם המספר — היא מופיעה *אחריו*, כך
  // שהסימון של שניהם הוא פעולה אחת.
  const subject = `${SUBJECT_PREFIX[type]} 123456789 (מחקו את המספרים וכתבו ת"ז שלכם כולל ספרת ביקורת)`

  // 🔴 mailto: — פותח טיוטה בתוכנת המייל של המשתמש עצמו.
  //
  // ⚠️ זו הכרעה מפורשת של המנהל, אחרי שקישור Gmail (mail.google.com)
  // נוסה ונדחה: הוא מוציא את הפונה לדפדפן ולחשבון אחר, במקום לפתוח
  // טיוטה במקום שבו הוא כבר נמצא.
  //
  // ⚠️ הגוף נשאר הקומפקטי (buildDraftBodyCompact) גם כאן — מגבלת אורך
  // ה-URL היא של הדפדפן ולא של Gmail, והיא חלה על mailto: בדיוק כמו על
  // https. הגוף המלא (~8,400 תווים מקודדים) נחתך באמצע אצל חלק
  // מהלקוחות, והבקשה נשלחת חסרה בלי שהפונה מבחין.
  const url = `mailto:${mailbox}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  // ⚠️ התראה ולא חסימה: הטסטים נועלים את האורך לכל חמשת הסוגים, אבל
  // רשימת בתי ההחלמה נטענת מהמסד ויכולה לגדול. אם מישהו יוסיף עשרה
  // בתים — עדיף שזה יופיע בלוג ולא שהקישור יישבר בשקט אצל הפונה.
  if (url.length > GMAIL_URL_SAFE_LIMIT) {
    console.warn(`[request-draft] ${type}: הקישור חורג — ${url.length} תווים (מגבלה ${GMAIL_URL_SAFE_LIMIT})`)
  }

  return NextResponse.redirect(url)
}
