import { NextResponse } from 'next/server'
import { requireNonMailStaff, getServiceClient } from '@/lib/apiAuth'

// ─────────────────────────────────────────────────────────────────────────────
// חתימת ההצהרה של המוטב, כתמונה.
//
// ⚠️ למה נוצר: החתימה נשמרת כ-data-URL בבסיס64 (20-80KB לחתימה) בעמודה
// beneficiaries.signature, והכרטסת הטמיעה אותה ישירות ב-<img src> — כלומר
// הבסיס64 נכנס ל-HTML של כל טעינת כרטסת, גם כשהמשתמש בטאב אחר לגמרי ולא ראה
// אותה מעולם. עכשיו הכרטסת מפנה לכתובת הזו, והדפדפן מושך את התמונה בעצמו,
// במקביל, ומטמן אותה — במקום להשמין את ה-HTML של הדף.
// ─────────────────────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // ⚠️ requireNonMailStaff ולא requireStaff — כמו בשאר מסלולי המוטבים
  // בתיקייה הזו. משתמש "מייל בלבד" מנותב בכוח למסך הדואר ואינו אמור
  // להגיע לנתוני מוטבים; דרך המסלול הזה הוא יכול היה לאסוף חתימות יד
  // סרוקות בכמות, לפי מזהי מוטב שמופיעים ברשימת ההודעות שלו.
  if (!(await requireNonMailStaff())) return new NextResponse('לא מורשה', { status: 401 })

  const { id } = await params
  const db = getServiceClient()
  if (!db) return new NextResponse('חיבור Supabase לא מוגדר', { status: 500 })

  const { data, error } = await db
    .from('beneficiaries')
    .select('signature')
    .eq('id', id)
    .maybeSingle()

  const sig = data?.signature as string | null | undefined
  if (error || !sig) return new NextResponse('לא נמצאה חתימה', { status: 404 })

  // data:image/png;base64,XXXX → בייטים גולמיים עם סוג התוכן הנכון.
  // [\s\S] במקום דגל s — היעד אינו es2018.
  //
  // 🔴 רק PNG/JPEG, ובלי הפניה (ביקורת אבטחה 05.10). החתימה מגיעה מטופס
  // רישום ציבורי שבדק רק startsWith('data:image'):
  //   · data:image/svg+xml עם <script> רץ במקור האתר כשאיש צוות פותח
  //     את הכתובת ישירות (XSS שמור).
  //   · ערך שאינו data-URL הופנה אליו — הפניה פתוחה לכל כתובת.
  // אומת: כל 2,791 החתימות במסד הן image/png — אין מה לשבור.
  const m = /^data:(image\/(?:png|jpeg));base64,([\s\S]+)$/.exec(sig)
  if (!m) return new NextResponse('פורמט חתימה לא נתמך', { status: 415 })

  const [, contentType, b64] = m
  const bytes = Buffer.from(b64, 'base64')

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.length),
      'X-Content-Type-Options': 'nosniff',
      // private — תוכן אישי; מותר במטמון הדפדפן של אותו משתמש בלבד.
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
