// טופס נדרים — שליפת צאצאים ישירים של צומת בסדר הדורות.
// ללא nodeId (או nodeId=root) → מחזיר את השורש (מרן החתם סופר).
// עם nodeId → ילדיו הישירים המאומתים. דור אחרון → children: [].
// מחזיר אך ורק שמות מעץ הדורות (מידע היסטורי) — לא נתוני מוטבים.
import { type NextRequest } from 'next/server'
import { jsonCors, preflight } from '@/lib/cors'
import { fetchLineageChildren } from '@/lib/lineageChildren'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return preflight(request.headers.get('origin'))
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  const nodeIdParam = request.nextUrl.searchParams.get('nodeId')?.trim()
  const parentId = nodeIdParam && nodeIdParam !== 'root' ? nodeIdParam : null

  const result = await fetchLineageChildren(parentId)
  if ('error' in result) return jsonCors({ error: result.error }, { status: 500 }, origin)
  return jsonCors(result, { headers: { 'Cache-Control': 'no-store' } }, origin)
}
