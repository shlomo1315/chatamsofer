import { NextResponse, type NextRequest } from 'next/server'
import { loadDocument, isLoadFailure } from '@/lib/fileAccess'

export const dynamic = 'force-dynamic'

// פרוקסי גישה מאומת למסמכים בדלי 'documents' — מחזיר את הקובץ עצמו.
//
// ℹ️ הנתיב הזה מחזיר תגובה מסוג *קובץ* (application/pdf וכו'), ולכן מסנני
// תוכן כמו נטפרי מזהים אותו ככזה ועשויים לשלוח אותו לבדיקה לפני שהוא מוצג.
// למסלול שאינו חוצה את הרשת כקובץ — ראו /api/files/data.
//
// האימות עצמו נמצא ב-lib/fileAccess (משותף לשני הנתיבים).
export async function GET(request: NextRequest) {
  const res = await loadDocument(request)
  if (isLoadFailure(res)) return NextResponse.json({ error: res.error }, { status: res.status })
  const { buf, contentType, safeName } = res

  const wantsDownload = request.nextUrl.searchParams.get('dl') === '1'

  const headers = new Headers()
  headers.set('Content-Type', contentType)
  // ⚠️ מונע מהדפדפן לנחש סוג לפי התוכן ולהריץ קובץ שהוגש כסוג אחר.
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Content-Length', String(buf.length))
  // מטמון פרטי קצר — מזרז תצוגות חוזרות בלי לחשוף בין משתמשים
  headers.set('Cache-Control', 'private, max-age=300')

  // שם הקובץ בכותרת — לפי RFC 5987 (filename* ), לא percent-encoding בתוך
  // filename="...". דפדפנים אינם מפענחים אחוזים בתוך filename הרגיל, ולכן
  // שם עברי ירד כ-"%D7%AA%D7%A2..." במקום "תעודת זהות משה כהן.pdf".
  // filename="..." נשאר כגיבוי ASCII לדפדפנים ישנים.
  const asciiName = (safeName || 'file').replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '') || 'file'
  const utf8Name = encodeURIComponent(safeName || 'file')
  // ⚠️ תצוגת PDF נעשית בניווט מלא בלבד ולא ב-<iframe>: נטפרי חוסם את ה-PDF
  // viewer בתוך iframe ומציג דף NETFREE (ראו components/ui/PdfPreviewBox).
  const disposition = wantsDownload ? 'attachment' : 'inline'
  headers.set('Content-Disposition', `${disposition}; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`)
  return new NextResponse(buf, { status: 200, headers })
}
