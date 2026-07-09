// טופס נדרים — מחזיר את הדור הראשון (מרן החתם סופר) בפורמט children.
// כך נדרים מקבלים את ה-nodeId של השורש דינמית, ללא הטמעת מזהה קשיח.
// זהה ל-lineage-children ללא nodeId (שם נפרד לבהירות).
import { type NextRequest } from 'next/server'
import { jsonCors, preflight } from '@/lib/cors'
import { fetchLineageChildren } from '@/lib/lineageChildren'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return preflight(request.headers.get('origin'))
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  const result = await fetchLineageChildren(null)
  if ('error' in result) return jsonCors({ error: result.error }, { status: 500 }, origin)
  return jsonCors(result, { headers: { 'Cache-Control': 'no-store' } }, origin)
}
