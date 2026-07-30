import { NextResponse, type NextRequest } from 'next/server'
import { loadDocument, isLoadFailure } from '@/lib/fileAccess'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// אותו מסמך כמו /api/files — אך כ*נתונים* ולא כקובץ.
//
// הרקע: מסנני תוכן (נטפרי) מזהים תגובה לפי סוג התוכן שלה. תגובה שמוגדרת
// application/pdf או image/* היא "קובץ" ונשלחת לתור בדיקה לפני שהמשתמש
// רואה אותה — מה שהשהה כל צפייה במסמך בכרטסת בדקות ואף שעות.
//
// כאן הבייטים נשלחים כ-base64 בתוך JSON רגיל. מבחינת הרשת זו תגובת API
// ככל תגובת API אחרת של האתר, ואין בה קובץ. הדפדפן מפענח את ה-base64
// בחזרה ל-Blob ומרכיב את הקובץ מקומית (ראו lib/docBlob.ts) — והצגה מתוך
// blob: אינה עוברת ברשת כלל.
//
// האימות זהה לחלוטין ל-/api/files — אותה פונקציה, אותן הרשאות. הנתיב הזה
// אינו חושף שום מסמך שלא היה נגיש קודם; משתנה רק אופן ההעברה.
//
// עלות: base64 מנפח את התעבורה ב-~33% והקובץ נטען כולו לזיכרון. בתקרת
// ההעלאה של המערכת (10MB) זה זניח.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const res = await loadDocument(request)
  if (isLoadFailure(res)) return NextResponse.json({ error: res.error }, { status: res.status })
  const { buf, contentType, safeName } = res

  return NextResponse.json(
    {
      name: safeName || 'file',
      contentType,
      size: buf.length,
      data: buf.toString('base64'),
    },
    {
      status: 200,
      headers: {
        // מטמון פרטי קצר — כמו במסלול הקובץ
        'Cache-Control': 'private, max-age=300',
      },
    }
  )
}
