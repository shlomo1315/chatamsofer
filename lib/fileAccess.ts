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
  if (!path || path.includes('..')) return { status: 400, error: 'נתיב לא תקין' }

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
  const contentType = blob.type || EXT_CONTENT_TYPES[pathExt.toLowerCase()] || 'application/octet-stream'

  return { buf: Buffer.from(await blob.arrayBuffer()), contentType, safeName, path }
}
