import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { SELLER_COOKIE, sellerFromRequest } from '@/lib/bookFairSeller'

// הקטלוג לדוכן — כולל מלאי הדוכן, שאינו נחשף בחנות הציבורית.
//
// ⚠️ שונה מהקטלוג הציבורי בשני דברים: הוא כולל את מספר מלאי הדוכן
// (stock_fair) ואת רף ההתראה, והוא אינו מסתיר ספרים שאזלו — המוכר
// צריך לראות גם אותם, כי הספר עשוי להיות בארגז.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Row = {
  id: string; sku: string; title: string
  author: string | null; publisher: string | null; description: string | null
  volumes: number; price_agorot: number
  stock_fair: number; fair_low_threshold: number | null
}

export async function GET(request: NextRequest) {
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })

  // 🔴 מול הסיסמה *הנוכחית* — החלפתה מנתקת מיד (lib/bookFairSeller).
  const seller = await sellerFromRequest(request.cookies.get(SELLER_COOKIE)?.value, db)
  if (!seller) return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 })

  // ⚠️ fetchAllRows: PostgREST קוטע ב-1,000 שורות בשקט.
  const { rows, error } = await fetchAllRows<Row>((from, to) =>
    db.from('book_fair_books')
      .select('id, sku, title, author, publisher, description, volumes, price_agorot, stock_fair, fair_low_threshold')
      .eq('is_active', true)
      .eq('is_hidden', false)
      .order('sku', { ascending: true })
      .range(from, to)
  )

  if (error) return NextResponse.json({ error: 'טעינת הקטלוג נכשלה' }, { status: 500 })

  return NextResponse.json(
    { books: rows, seller: seller.name },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
