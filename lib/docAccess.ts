import type { NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { getPortalBeneficiaryId } from '@/lib/portalSession'

// הרשאת גישה למסמך בדלי 'documents' — מקור אמת אחד ל-/api/files ול-/api/files/thumb.
// צוות מאומת רואה כל מסמך; מוטב בפורטל רואה רק מסמכים שנתיב האחסון שלהם כולל
// את מזהה המוטב שבסשן שלו.
export async function canAccessDoc(request: NextRequest, path: string): Promise<boolean> {
  if (await requireStaff()) return true
  const benId = getPortalBeneficiaryId(request)
  return !!benId && path.split('/').includes(benId)
}

// סיומת הקובץ מתוך נתיב האחסון (כולל הנקודה, באותיות קטנות). '' אם אין.
export function pathExt(path: string): string {
  return ((path.split('/').pop() ?? '').match(/\.[^.\s]+$/)?.[0] ?? '').toLowerCase()
}

export const IMAGE_EXT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
  '.heic': 'image/heic', '.heif': 'image/heif',
}

export const EXT_TYPES: Record<string, string> = {
  ...IMAGE_EXT_TYPES,
  '.pdf': 'application/pdf',
}
