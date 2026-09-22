import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'

// קטלוג ציבורי לחנות.
//
// 🔴 הנתיב פתוח לכל, ולכן חושף *רק* שדות ציבוריים. stock_phone,
// phone_code ו-sort_order הם מידע תפעולי שאין סיבה לפרסם, ו-stock_web
// אינו מוחזר כמספר אלא כדגל זמינות בלבד — כמות מדויקת מאפשרת מיפוי
// של המלאי ושל קצב המכירות.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Row = {
  id: string; sku: string; title: string; author: string | null
  publisher: string | null; volumes: number; price_agorot: number
  image_path: string | null; description: string | null; stock_web: number
}

export async function GET() {
  const db = getServiceClient()
  if (!db) return NextResponse.json({ books: [], open: false }, { status: 200 })

  // ⚠️ fetchAllRows: PostgREST קוטע ב-1,000 שורות בשקט, וקטלוג חתוך
  // נראה בדיוק כמו קטלוג מלא.
  const { rows, error } = await fetchAllRows<Row>((from, to) =>
    db.from('book_fair_books')
      .select('id, sku, title, author, publisher, volumes, price_agorot, image_path, description, stock_web')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true })
      .range(from, to)
  )

  if (error) {
    console.error('[fair/catalog] fetch failed:', error)
    return NextResponse.json({ error: 'טעינת הקטלוג נכשלה' }, { status: 500 })
  }

  return NextResponse.json({
    books: rows.map(b => ({
      id: b.id, sku: b.sku, title: b.title,
      author: b.author, publisher: b.publisher,
      volumes: b.volumes, price_agorot: b.price_agorot,
      image_path: b.image_path, description: b.description,
      // 🔴 דגל ולא מספר: הכמות המדויקת היא מידע תפעולי.
      in_stock: b.stock_web > 0,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
