import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { loadStatsData } from '@/lib/bookFairStatsData'

// לשונית "דוכן היריד": כל המכירות בדוכן, לחישוב בצד הלקוח (lib/bookFairStats).
//
// ⚠️ מחזיר שורות גולמיות ולא מספרים מחושבים: הסינון (היום/אתמול, מזומן/
// אשראי, מוכר) נעשה בדפדפן בלי סבב רשת לכל לחיצה, ובאותה פונקציה בדיוק
// שמחשבת את לוח המנהל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const staff = await requirePermission('book_fair', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { orders, items, categoryOf, error } = await loadStatsData(db, { channel: 'fair' })
  if (error) {
    console.error('[book-fair/stand] load failed:', error)
    return NextResponse.json({ error: 'טעינת נתוני הדוכן נכשלה' }, { status: 500 })
  }

  return NextResponse.json(
    { orders, items, categories: Object.fromEntries(categoryOf), at: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
