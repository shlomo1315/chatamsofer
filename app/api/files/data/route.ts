import { NextResponse, type NextRequest } from 'next/server'
import { loadDocument, isLoadFailure } from '@/lib/fileAccess'
import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'

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

  // ⚠️ המטען מעורבל לפני ה-base64. בלי זה, base64 של PDF/JPEG נושא חתימה
  // מזוהה בתחילתו ("JVBERi", "/9j/"), ומסנן התוכן מזהה אותה גם בתוך JSON —
  // ולכן המסמכים נחסמו גם אחרי המעבר לערוץ הנתונים. אחרי הערבול זו סדרת
  // בייטים חסרת צורה. הדפדפן מבטל את הערבול בזיכרון (ראו lib/docCipher).
  const scrambled = scrambleBytes(new Uint8Array(buf))

  return NextResponse.json(
    {
      name: safeName || 'file',
      contentType,
      size: buf.length,
      enc: DOC_CIPHER_ID,
      data: Buffer.from(scrambled).toString('base64'),
    },
    {
      status: 200,
      headers: {
        // מטמון פרטי ארוך: הקבצים ממופים לנתיב ייחודי (…/{timestamp}_{name}) ולמעשה
        // immutable — לכן אפשר לשמור בדפדפן זמן רב כדי שכרטסת שנפתחה כבר לא תיטען
        // שוב. private בלבד — מסמכים רגישים לא נשמרים ב-CDN/proxy משותף.
        'Cache-Control': 'private, max-age=604800, immutable',
      },
    }
  )
}
