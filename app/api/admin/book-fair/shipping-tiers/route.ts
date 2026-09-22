import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { validateTiers, type TierInput } from '@/lib/bookFairShipping'
import { shekelsToAgorot } from '@/lib/bookFairPricing'
import { logActivity } from '@/lib/activityLog'

// מדרגות המשלוח — תעריף לפי כמות ספרים.
//
// 🔴 PUT מחליף את כל הטבלה בבת אחת, ולא מעדכן שורה-שורה. הסיבה:
// הולידציה בודקת את הטבלה כמכלול (פערים, חפיפות, מדרגה עליונה פתוחה),
// ועריכת שורה בודדת יכולה לשבור את השלמות בלי שהשורה עצמה פגומה.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { data, error } = await db.from('book_fair_shipping_tiers')
    .select('id, min_books, max_books, price_agorot')
    .order('min_books', { ascending: true })

  if (error) {
    console.error('[book-fair/tiers] fetch failed:', error)
    return NextResponse.json({ error: 'טעינת המדרגות נכשלה' }, { status: 500 })
  }
  return NextResponse.json({ tiers: data ?? [] })
}

export async function PUT(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: { tiers?: { min_books: unknown; max_books: unknown; price: unknown }[] }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const raw = Array.isArray(body.tiers) ? body.tiers : []
  if (raw.length > 20) {
    return NextResponse.json({ error: 'יותר מדי מדרגות' }, { status: 400 })
  }

  // ── המרה ──
  const tiers: TierInput[] = []
  for (const [i, t] of raw.entries()) {
    const min = Number(t.min_books)
    const max = t.max_books === null || t.max_books === '' || t.max_books === undefined
      ? null : Number(t.max_books)
    // ⚠️ המחיר מוזן בשקלים ונשמר באגורות — ההמרה בנקודה אחת.
    const price = shekelsToAgorot(t.price as string | number)

    if (!Number.isInteger(min)) {
      return NextResponse.json({ error: `מדרגה ${i + 1}: "מ-" חייב להיות מספר שלם` }, { status: 400 })
    }
    if (max !== null && !Number.isInteger(max)) {
      return NextResponse.json({ error: `מדרגה ${i + 1}: "עד" חייב להיות מספר שלם או ריק` }, { status: 400 })
    }
    if (price === null) {
      return NextResponse.json({ error: `מדרגה ${i + 1}: מחיר לא תקין` }, { status: 400 })
    }
    tiers.push({ min_books: min, max_books: max, price_agorot: price })
  }

  // 🔴 ולידציה *גם בשרת* ולא רק בלקוח: הלקוח יכול לעקוף, וטבלה עם פער
  // אינה מייצרת שגיאה — היא פשוט מונעת מהלקוח להשלים הזמנה, בלי הסבר.
  const check = validateTiers(tiers)
  if (!check.ok) {
    return NextResponse.json({ error: check.errors[0], errors: check.errors }, { status: 400 })
  }

  // ── החלפה ──
  // ⚠️ מחיקה ואז הוספה, בלי טרנזקציה: PostgREST אינו חושף טרנזקציות.
  // החלון שבו הטבלה ריקה הוא מילישניות, והנזק בו מוגבל — לקוח שיגיע
  // בדיוק אז יראה "לא הוגדר תעריף משלוח" ויוכל לנסות שוב מיד.
  const { error: delErr } = await db.from('book_fair_shipping_tiers')
    .delete().gte('min_books', 0)
  if (delErr) {
    console.error('[book-fair/tiers] delete failed:', delErr)
    return NextResponse.json({ error: 'עדכון המדרגות נכשל' }, { status: 500 })
  }

  if (tiers.length) {
    const { error: insErr } = await db.from('book_fair_shipping_tiers').insert(tiers)
    if (insErr) {
      console.error('[book-fair/tiers] insert failed:', insErr)
      return NextResponse.json({ error: 'שמירת המדרגות נכשלה' }, { status: 500 })
    }
  }

  await logActivity(db, {
    userId: staff.userId, action: 'update', entityType: 'book_fair_shipping_tiers',
    details: { count: tiers.length },
  })

  return NextResponse.json({ ok: true, count: tiers.length })
}
