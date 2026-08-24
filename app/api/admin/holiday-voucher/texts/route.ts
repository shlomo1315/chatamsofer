import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { HOLIDAY_VOUCHER_DEFAULTS } from '@/lib/holidayVoucher'
import { HOLIDAY_TEXTS_KEY, loadHolidayVoucherTexts } from '@/lib/holidayVoucherTexts'

export const dynamic = 'force-dynamic'

// ⚠️ המפתח מיובא ולא משוכפל — עותק מקומי שנשאר מאחור בשינוי שם היה
// מנתק את השמירה מהטעינה בשקט.
const KEY = HOLIDAY_TEXTS_KEY

// מלל שובר החלוקה — כללי לכל סוגי החלוקות.
//
// ⚠️ app_settings.value היא עמודת text: חובה JSON.stringify. שמירת
// אובייקט גולמי נכשלת **בשקט** ומאחסנת "[object Object]".

export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ אותה פונקציה שהתצוגה והשליחה משתמשות בה — כדי שהמסך בהגדרות
  // יציג בדיוק את מה שייצא בשובר.
  return NextResponse.json({ texts: await loadHolidayVoucherTexts(db) })
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { texts?: Record<string, unknown> }
  const t = body.texts
  if (!t || typeof t !== 'object') return NextResponse.json({ error: 'נוסח לא תקין' }, { status: 400 })

  const clean = {
    title: String(t.title ?? '').trim() || HOLIDAY_VOUCHER_DEFAULTS.title,
    intro: String(t.intro ?? '').trim(),
    // ⚠️ שורות ריקות מסוננות: הן היו מייצרות מספור עם פריט ריק בשובר.
    instructions: Array.isArray(t.instructions)
      ? t.instructions.map(s => String(s ?? '').trim()).filter(Boolean)
      : HOLIDAY_VOUCHER_DEFAULTS.instructions,
    footer: String(t.footer ?? '').trim(),
  }

  const { error } = await db.from('app_settings').upsert({
    key: KEY,
    value: JSON.stringify(clean),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, texts: clean })
}
