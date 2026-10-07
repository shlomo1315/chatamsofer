import type { NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { storagePath } from '@/lib/docUrl'

// ─────────────────────────────────────────────────────────────────────────────
// טעינת מסמך מדלי 'documents' — אימות + הורדה, במקום אחד.
//
// שני נתיבי ה-API שמגישים מסמכים (/api/files ו-/api/files/data) משתמשים
// בפונקציה הזו. בכוונה: בדיקת ההרשאה חייבת להיות זהה בשניהם, וכפילות שלה
// היא בדיוק סוג הבאג שגורם לדלף — נתיב אחד מתוקן והשני נשכח.
// ─────────────────────────────────────────────────────────────────────────────

export interface LoadedDoc {
  // Buffer<ArrayBuffer> ולא Buffer סתם — כדי שיתקבל ישירות כגוף התגובה
  // (BodyInit אינו מקבל Buffer<ArrayBufferLike>).
  buf: Buffer<ArrayBuffer>
  contentType: string
  /** שם הקובץ להצגה/שמירה, כולל סיומת */
  safeName: string
  path: string
}

export interface LoadFailure {
  status: number
  error: string
}

export const isLoadFailure = (r: LoadedDoc | LoadFailure): r is LoadFailure =>
  (r as LoadFailure).error !== undefined

const EXT_CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.heic': 'image/heic', '.pdf': 'application/pdf',
}

/** סוגים שבטוח להציג בדפדפן. ⚠️ בלי svg ובלי html — שניהם מריצים סקריפט. */
const SAFE_INLINE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
  'application/pdf', 'text/plain',
])

// שם הקובץ הסופי: השם המבוקש אם ניתן, אחרת שם הקובץ מנתיב האחסון.
// בכל מקרה מובטחת סיומת — כדי שהקובץ ייפתח בתוכנה הנכונה אחרי שמירה.
function resolveSafeName(path: string, rawName: string): string {
  let safeName = rawName.replace(/[\r\n"]/g, '').trim()
  const pathExt = (path.split('/').pop() ?? '').match(/\.[^.\s]+$/)?.[0] ?? ''
  if (pathExt) {
    if (!safeName) safeName = path.split('/').pop() ?? ''
    else if (!/\.[^.\s]+$/.test(safeName)) safeName = safeName + pathExt
  }
  return safeName
}

/**
 * מאמת את הקורא ומוריד את המסמך מהאחסון.
 * צוות מאומת — כל מסמך. מוטב בפורטל — רק מסמכים שנתיב האחסון שלהם כולל את
 * מזהה המוטב שבסשן שלו.
 */
export async function loadDocument(request: NextRequest): Promise<LoadedDoc | LoadFailure> {
  const raw = request.nextUrl.searchParams.get('p') ?? ''
  const path = storagePath(raw)
  // 🔴 ביקורת אבטחה 07.10: `<ownId>/%2e%2e/<otherId>/file` (קידוד כפול) עבר
  // את בדיקת '..', כי הוא מפוענח פעם נוספת רק בתוך ספריית האחסון — וכך
  // מוטב יכול היה להוריד מסמך של משפחה אחרת. אחרי הפענוח לא אמור להישאר
  // שום '%', לוכסן הפוך או מקטע '.' / '..'.
  if (!path || path.includes('..') || path.includes('%') || path.includes('\\') ||
      path.split('/').some(seg => seg === '.' || seg === '..' || seg === '')) {
    return { status: 400, error: 'נתיב לא תקין' }
  }

  let allowed = false
  if (await requireStaff()) {
    allowed = true
  } else {
    const benId = getPortalBeneficiaryId(request)
    if (benId && path.split('/').includes(benId)) allowed = true
  }
  if (!allowed) return { status: 401, error: 'לא מורשה' }

  const admin = getServiceClient()
  if (!admin) return { status: 500, error: 'שגיאת שרת' }

  const { data: blob, error } = await admin.storage.from('documents').download(path)
  if (error || !blob) return { status: 404, error: 'הקובץ לא נמצא' }

  const safeName = resolveSafeName(path, request.nextUrl.searchParams.get('name') ?? '')
  const pathExt = (path.split('/').pop() ?? '').match(/\.[^.\s]+$/)?.[0] ?? ''
  // 🔴 מפת הסיומות גוברת על blob.type — ולא להפך.
  //
  // ⚠️ blob.type מגיע ממטא-דאטה של האחסון, ובהעלאות ממסכי הניהול הוא נקבע
  // בדפדפן של המעלה. קובץ שהועלה כ-text/html היה מוגש עם Content-Type
  // כזה ו-Content-Disposition: inline — כלומר מורץ במקור (origin) של
  // האתר, עם גישה לעוגיות הסשן. הסיומת נגזרת מהנתיב בשרת ולכן אמינה.
  //
  // 🔴 וגם blob.type עצמו רק מרשימה לבנה (ביקורת אבטחה 05.10): צירוף
  // למייל נכנס נשמר עם סוג ה-MIME שהשולח הצהיר. evil.html / evil.svg
  // (סיומת שאינה במפה) הוגש כ-text/html והריץ סקריפט על חשבון איש הצוות
  // שלחץ "צפייה". סוג שאינו ברשימה ⇒ octet-stream (הורדה, לא הצגה).
  const declared = (blob.type || '').toLowerCase().split(';')[0].trim()
  const contentType = EXT_CONTENT_TYPES[pathExt.toLowerCase()]
    || (SAFE_INLINE_TYPES.has(declared) ? declared : 'application/octet-stream')

  return { buf: Buffer.from(await blob.arrayBuffer()), contentType, safeName, path }
}
