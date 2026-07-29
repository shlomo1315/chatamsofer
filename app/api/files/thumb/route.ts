import { NextResponse, type NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { getServiceClient } from '@/lib/apiAuth'
import { storagePath } from '@/lib/docUrl'
import { canAccessDoc, pathExt, IMAGE_EXT_TYPES } from '@/lib/docAccess'

export const dynamic = 'force-dynamic'
// רינדור PDF דורש Node (מודול נייטיב לקנבס) — לא edge
export const runtime = 'nodejs'

// ─────────────────────────────────────────────────────────────
// תצוגה מקדימה של מסמך *כתמונה בלבד*.
//
// נטפרי מיירט כל תגובה מסוג application/pdf ושולח אותה "לבדיקה" — גם
// כשהיא מוגשת מהדומיין שלנו — ובמקום המסמך מוצג דף החסימה של נטפרי.
// לכן הנתיב הזה לעולם אינו מחזיר PDF: עמוד ה-PDF מרונדר לתמונת PNG בשרת
// (lib/pdfRaster) והדפדפן מקבל תמונה רגילה. תמונות מוחזרות כמות שהן.
//
// פרמטרים: p=נתיב/כתובת המסמך · page=מספר עמוד (ברירת מחדל 1) ·
//          w=רוחב היעד בפיקסלים · meta=1 להחזרת {pages,kind} בלבד.
// ─────────────────────────────────────────────────────────────

// מטמון התמונות שנוצרו — נשמר בדלי עצמו תחת _thumbs/ כדי לא לרנדר מחדש
// בכל טעינת דף. הקידומת אינה כוללת מזהה מוטב, ולכן אינה נגישה דרך /api/files
// למוטב בפורטל; הגישה היחידה אליה היא דרך הנתיב הזה, לאחר אימות על נתיב המקור.
// שים לב: המפתח נגזר מנתיב האחסון. כל זרימות ההעלאה במערכת מוסיפות חותמת זמן
// לשם הקובץ, ולכן החלפת מסמך יוצרת נתיב חדש ומטמון חדש. אם בכל זאת הוחלף קובץ
// באותו נתיב — אפשר לעקוף עם פרמטר v כלשהו (למשל v=2).
const THUMB_PREFIX = '_thumbs'
const cacheKey = (path: string, page: number, width: number, v: string) =>
  `${THUMB_PREFIX}/${createHash('sha1').update(`${path}|${page}|${width}|${v}`).digest('hex')}.png`

const imageHeaders = (len: number, type: string, pages?: number) => {
  const h = new Headers()
  h.set('Content-Type', type)
  h.set('Content-Length', String(len))
  h.set('Content-Disposition', 'inline')
  // מטמון פרטי — מזרז תצוגות חוזרות בלי לחשוף בין משתמשים
  h.set('Cache-Control', 'private, max-age=3600')
  if (pages) h.set('X-Doc-Pages', String(pages))
  return h
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const path = storagePath(sp.get('p') ?? '')
  if (!path || path.includes('..')) {
    return NextResponse.json({ error: 'נתיב לא תקין' }, { status: 400 })
  }
  if (!(await canAccessDoc(request, path))) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const ext = pathExt(path)
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const width = Math.min(2000, Math.max(80, Number(sp.get('w')) || 900))
  const version = sp.get('v') ?? ''
  const metaOnly = sp.get('meta') === '1'

  // תמונה — מוחזרת כמות שהיא; אין מה לרנדר
  if (IMAGE_EXT_TYPES[ext]) {
    if (metaOnly) return NextResponse.json({ pages: 1, kind: 'image' })
    const { data: blob, error } = await admin.storage.from('documents').download(path)
    if (error || !blob) return NextResponse.json({ error: 'הקובץ לא נמצא' }, { status: 404 })
    const buf = Buffer.from(await blob.arrayBuffer())
    return new NextResponse(buf, {
      status: 200,
      headers: imageHeaders(buf.length, blob.type || IMAGE_EXT_TYPES[ext], 1),
    })
  }

  if (ext !== '.pdf') {
    return NextResponse.json({ error: 'סוג קובץ שאינו נתמך לתצוגה', kind: 'other' }, { status: 415 })
  }

  const key = cacheKey(path, page, width, version)

  // מטמון: אם התמונה כבר יוצרה — מחזירים אותה בלי לרנדר שוב
  if (!metaOnly) {
    const cached = await admin.storage.from('documents').download(key)
    if (cached.data) {
      const buf = Buffer.from(await cached.data.arrayBuffer())
      // מספר העמודים נשמר בשם קובץ נלווה כדי לא לפתוח את ה-PDF רק בשבילו
      const pagesTxt = await admin.storage.from('documents').download(`${key}.pages`)
      const pages = pagesTxt.data ? Number(await pagesTxt.data.text()) || undefined : undefined
      return new NextResponse(buf, { status: 200, headers: imageHeaders(buf.length, 'image/png', pages) })
    }
  }

  const { data: blob, error } = await admin.storage.from('documents').download(path)
  if (error || !blob) return NextResponse.json({ error: 'הקובץ לא נמצא' }, { status: 404 })
  const src = new Uint8Array(await blob.arrayBuffer())

  try {
    const { rasterizePdfPage, pdfPageCount } = await import('@/lib/pdfRaster')

    if (metaOnly) {
      return NextResponse.json({ pages: await pdfPageCount(src), kind: 'pdf' })
    }

    const { png, pages } = await rasterizePdfPage(src, page, width)

    // כתיבה למטמון — כישלון כאן אינו אמור להכשיל את התצוגה
    await Promise.all([
      admin.storage.from('documents').upload(key, png, { contentType: 'image/png', upsert: true }),
      admin.storage.from('documents').upload(`${key}.pages`, String(pages), {
        contentType: 'text/plain', upsert: true,
      }),
    ]).catch(() => {})

    return new NextResponse(Buffer.from(png), {
      status: 200,
      headers: imageHeaders(png.length, 'image/png', pages),
    })
  } catch (e) {
    // PDF פגום/מוצפן — הלקוח מציג נפילה-לאחור עם כפתור הורדה
    console.error('[files/thumb] rasterize failed', path, e)
    return NextResponse.json({ error: 'לא ניתן להפיק תצוגה מקדימה' }, { status: 422 })
  }
}
