import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/apiAuth'
import { SUBJECT_PREFIX, MAILBOX_REQUEST_TYPE, IGUD_MAILBOX, buildDraftBodyCompact, type ReqType } from '@/lib/emailRequestForms'
import { loadCtx, REQ_TO_DEPT } from '@/lib/emailRequestIntake'
import { isDepartmentOpen, closedMessageFor, DEPARTMENT_LABELS } from '@/lib/departmentGates'

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
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

  if (sp.get('raw') !== '1') {
    const closed = await closedPage(type, db)
    if (closed) return closed
  }

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

  // 🔴 ?raw=1 — מחזיר את ה-mailto: עצמו במקום להפנות אליו.
  //
  // ⚠️ נדרש למסך ההגדרות: הכפתור שנשמר חייב לשאת את ה-mailto: המלא.
  // קישור https בגוף מייל נעטף על ידי Gmail ב-google.com/url?q=..., והעטיפה
  // שוברת את ההפניה — הפונה נוחת על דף במקום על טיוטה.
  if (sp.get('raw') === '1') {
    return NextResponse.json({ url })
  }

  return NextResponse.redirect(url)
}

// ⚠️ מחלקה סגורה: מי שלחץ על הכפתור במייל מקבל דף עם הודעת הסגירה במקום
// טיוטה. raw=1 (מסך העריכה באדמין) לא נחסם — הכפתור נשמר ויעבוד כשהמחלקה
// תיפתח, וגם טיוטה שתישלח בכל זאת נחסמת בקליטת המייל (emailRequestIntake).
async function closedPage(type: ReqType, db: SupabaseClient): Promise<NextResponse | null> {
  const dept = REQ_TO_DEPT[type]
  if (dept && !(await isDepartmentOpen(dept, db))) {
    const msg = escapeHtml(await closedMessageFor(dept, db))
    return new NextResponse(
      `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(DEPARTMENT_LABELS[dept])}</title></head>`
      + `<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;font-family:Heebo,Arial,sans-serif">`
      + `<div style="max-width:420px;margin:16px;padding:28px;background:#fff;border-radius:24px;box-shadow:0 10px 30px rgba(15,23,42,.12);text-align:center">`
      + `<h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">${escapeHtml(DEPARTMENT_LABELS[dept])}</h1>`
      + `<p style="margin:0;font-size:16px;line-height:1.7;color:#334155">${msg}</p></div></body></html>`,
      { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
    )
  }
  return null
}
