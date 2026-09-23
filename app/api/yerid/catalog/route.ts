import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { fetchPublicCatalog } from '@/lib/bookFairCatalog'

// קטלוג ציבורי לחנות.
//
// 🔴 הנתיב פתוח לכל, ולכן חושף *רק* שדות ציבוריים. כלל הפרטיות עצמו
// יושב ב-lib/bookFairCatalog, משותף עם ה-SSR של /yerid: עד היום הוא
// היה משוכפל בשני המקומות, וכלל פרטיות משוכפל סוטה עם הזמן.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const db = getServiceClient()
  if (!db) return NextResponse.json({ books: [], open: false }, { status: 200 })

  // 🔴 היריד סגור ⇒ אין קטלוג. הנתיב פתוח לכל, ובלי הבדיקה הזו כל
  // הכותרים והמחירים היו נגישים בקריאה אחת לפני הפתיחה הרשמית —
  // גם כשדף החנות מציג "ייפתח בקרוב".
  const { data: gate } = await db.from('app_settings')
    .select('value').eq('key', 'book_fair_open').maybeSingle()
  if (String((gate as { value?: string } | null)?.value ?? '') !== 'true') {
    return NextResponse.json({ books: [], open: false }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const { books, error } = await fetchPublicCatalog(db)
  if (error) {
    console.error('[fair/catalog] fetch failed:', error)
    return NextResponse.json({ error: 'טעינת הקטלוג נכשלה' }, { status: 500 })
  }

  return NextResponse.json({ books, open: true }, { headers: { 'Cache-Control': 'no-store' } })
}
