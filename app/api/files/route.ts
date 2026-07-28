import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { storagePath } from '@/lib/docUrl'

export const dynamic = 'force-dynamic'

// פרוקסי גישה מאומת למסמכים בדלי 'documents'.
// צוות מאומת רואה כל מסמך; מוטב בפורטל רואה רק מסמכים שנתיב האחסון שלהם כולל
// את מזהה המוטב שבסשן שלו. הגישה בפועל נעשית דרך signed URL קצר-מועד (5 דק').
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('p') ?? ''
  const path = storagePath(raw)
  if (!path || path.includes('..')) {
    return NextResponse.json({ error: 'נתיב לא תקין' }, { status: 400 })
  }

  // הרשאה
  let allowed = false
  if (await requireStaff()) {
    allowed = true
  } else {
    const benId = getPortalBeneficiaryId(request)
    if (benId && path.split('/').includes(benId)) allowed = true
  }
  if (!allowed) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // הורדה ישירה למחשב — dl=1 מוסיף Content-Disposition: attachment דרך אפשרות ה-download
  // של Supabase. name (לא חובה) קובע את שם הקובץ שיישמר.
  const wantsDownload = request.nextUrl.searchParams.get('dl') === '1'
  const rawName = request.nextUrl.searchParams.get('name') ?? ''
  let safeName = rawName.replace(/[\r\n"]/g, '').trim()
  // הבטחת סיומת: אם השם שהתבקש חסר סיומת (או שאין שם כלל), גוזרים את הסיומת
  // מתוך נתיב האחסון — כדי שהקובץ תמיד יירד עם הפורמט המקורי שלו וניתן יהיה לפתוח אותו.
  const pathExt = (path.split('/').pop() ?? '').match(/\.[^.\s]+$/)?.[0] ?? ''
  if (pathExt) {
    if (!safeName) {
      // אין שם מבוקש — נשתמש בשם הקובץ מהנתיב (כבר כולל סיומת)
      safeName = path.split('/').pop() ?? ''
    } else if (!/\.[^.\s]+$/.test(safeName)) {
      // יש שם מבוקש אך בלי סיומת — מוסיפים את הסיומת מהנתיב
      safeName = safeName + pathExt
    }
  }
  // ⚠️ במקום redirect ל-signed URL של Supabase (דומיין חיצוני שנטפרי מיירט
  // ומעכב), מורידים את הקובץ *בשרת* ומחזירים את הבייטים דרך הדומיין של האתר.
  // כך התמונה מגיעה מ-chasamsofer.co.il — נטפרי רואה אותה כחלק מהאתר המאושר,
  // בלי שליחה לבדיקה, והתצוגה מיידית.
  const { data: blob, error } = await admin.storage.from('documents').download(path)
  if (error || !blob) return NextResponse.json({ error: 'הקובץ לא נמצא' }, { status: 404 })

  const buf = Buffer.from(await blob.arrayBuffer())
  // סוג התוכן — מ-Supabase (blob.type) ובנפילה לפי הסיומת
  const extType: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
    '.gif': 'image/gif', '.heic': 'image/heic', '.pdf': 'application/pdf',
  }
  const contentType = blob.type || extType[pathExt.toLowerCase()] || 'application/octet-stream'

  const headers = new Headers()
  headers.set('Content-Type', contentType)
  headers.set('Content-Length', String(buf.length))
  // מטמון פרטי קצר — מזרז תצוגות חוזרות בלי לחשוף בין משתמשים
  headers.set('Cache-Control', 'private, max-age=300')
  // ⚠️ נטפרי מכשיל טעינת PDF בתוך <iframe> כשהתגובה אינה מסומנת במפורש
  // כתוכן inline: ה-PDF viewer של הדפדפן ("מוצג בתוך האתר") נחסם ומוצג דף
  // NETFREE. הוספת Content-Disposition: inline + Accept-Ranges מסמנת את
  // התגובה כמסמך תצוגה תקין, וה-PDF נטען דרך הדומיין של האתר ללא חסימה.
  if (wantsDownload) {
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName || 'file')}"`)
  } else {
    // תצוגה (iframe/תמונה) — inline. הסימון המפורש הזה הוא שמונע את חסימת
    // הנטפרי: בלעדיו טעינת PDF ב-iframe מזוהה כניווט לתוכן חיצוני ומוצג דף
    // NETFREE. שם הקובץ נשמר לנוחות שמירה ידנית מה-viewer.
    headers.set('Content-Disposition', `inline${safeName ? `; filename="${encodeURIComponent(safeName)}"` : ''}`)
  }
  return new NextResponse(buf, { status: 200, headers })
}
