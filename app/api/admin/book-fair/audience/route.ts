import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { cleanEmail } from '@/lib/emailAddress'

// רשימת התפוצה של היריד — נרשמי תזכורת ורוכשים.
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * מחיקת כתובת מרשימת התפוצה.
 *
 * ⚠️ הכתובת נמחקת מטבלת התזכורות בלבד. אי אפשר "למחוק" רוכש: הכתובת
 * שלו היא חלק מההזמנה, והסרתה הייתה משבשת את הקשר עם הלקוח. לכן
 * כתובת של רוכש מסומנת כמוסרת ואינה נמחקת.
 */
export async function DELETE(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: { email?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const email = cleanEmail(body.email)
  if (!email) return NextResponse.json({ error: 'חסרה כתובת' }, { status: 400 })

  // ⚠️ הרוכשים מזוהים דרך ההזמנות, ואין להם שורה בטבלת התזכורות.
  // כדי שהסרה תחזיק גם עבורם, נשמרת שורה מסומנת כמוסרת — כך היא
  // נשארת מחוץ לרשימת התפוצה גם בלי לגעת בהזמנה.
  const { data: existing } = await db.from('book_fair_reminders')
    .select('id').eq('email', email).maybeSingle()

  if (existing) {
    const { error } = await db.from('book_fair_reminders').delete().eq('email', email)
    if (error) {
      console.error('[fair/audience] delete failed:', error)
      return NextResponse.json({ error: 'המחיקה נכשלה' }, { status: 500 })
    }
  }

  // ⚠️ הרוכש מסומן ולא נמחק: שורה חדשה עם unsubscribed_at מוציאה אותו
  // מהרשימה לתמיד, גם אם יזמין שוב.
  const { data: isCustomer } = await db.from('book_fair_orders')
    .select('id').eq('customer_email', email).limit(1).maybeSingle()

  if (isCustomer) {
    await db.from('book_fair_reminders')
      .insert({ email, unsubscribed_at: new Date().toISOString() })
  }

  await logActivity(db, {
    userId: staff.userId,
    action: 'book_fair_audience_remove',
    entityType: 'book_fair_reminder',
    details: { email },
  })

  return NextResponse.json({ ok: true })
}
