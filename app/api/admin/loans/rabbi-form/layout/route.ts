import { NextResponse, type NextRequest } from 'next/server'
import { requireNonMailStaff, forbidden, getServiceClient } from '@/lib/apiAuth'
import { DEFAULT_LAYOUT, type FormLayout } from '@/lib/rabbiFormPdf'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// כיול מיקומי השדות בטופס אישור הרב.
//
// ⚠️ למה בכלל ניתן לעריכה: הבלאנק המעוצב עשוי להתחלף (עדכון לוגו, שינוי
// פריסה), וכל החלפה כזו מזיזה את המקום שבו השדות צריכים לשבת. בלי כיול
// מהממשק, כל שינוי עיצובי היה מחייב פריסת קוד.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'rabbi_form_layout'

export async function GET() {
  if (!(await requireNonMailStaff())) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle()
  let layout = DEFAULT_LAYOUT
  try {
    // ⚠️ מיזוג עם ברירת המחדל: פריסה שמורה מגרסה ישנה עלולה לחסר שדות
    // שנוספו מאז, והחלפה מלאה הייתה מפילה את ההפקה.
    if (data?.value) layout = { ...DEFAULT_LAYOUT, ...(JSON.parse(String(data.value)) as Partial<FormLayout>) }
  } catch { /* ערך פגום — ברירת מחדל */ }

  return NextResponse.json({ layout, isDefault: !data?.value }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const staff = await requireNonMailStaff()
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { layout?: Partial<FormLayout>; reset?: boolean }

  // איפוס — מוחק את השמור וחוזר לברירת המחדל שבקוד.
  if (body.reset) {
    await db.from('app_settings').delete().eq('key', KEY)
    return NextResponse.json({ ok: true, layout: DEFAULT_LAYOUT })
  }

  if (!body.layout || typeof body.layout !== 'object') {
    return NextResponse.json({ error: 'פריסה לא תקינה' }, { status: 400 })
  }

  // ⚠️ נשמר ממוזג ולא כפי שהתקבל: שמירה חלקית מהממשק לא אמורה למחוק
  // שדות שלא נגעו בהם.
  const merged: FormLayout = { ...DEFAULT_LAYOUT, ...body.layout }

  const { error } = await db.from('app_settings').upsert({
    key: KEY, value: JSON.stringify(merged), updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })

  if (error) {
    console.error('[rabbi-form/layout] שמירה נכשלה:', error.message)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, layout: merged })
}
