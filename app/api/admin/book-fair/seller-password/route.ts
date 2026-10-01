import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { SELLER_CONFIG_KEY, hashSellerPassword } from '@/lib/bookFairSeller'
import { logActivity } from '@/lib/activityLog'

// הגדרת סיסמת הדוכן ביריד.
//
// 🔴 נשמרת כ-HMAC ולא בטקסט גלוי, ולכן אי אפשר להציג אותה שוב —
// רק להחליף. מי שקורא את app_settings (גיבוי, תמיכה) אינו לומד אותה.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET — האם סיסמה מוגדרת. ⚠️ לעולם לא הסיסמה עצמה. */
export async function GET() {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { data } = await db.from('app_settings')
    .select('value, updated_at').eq('key', SELLER_CONFIG_KEY).maybeSingle()

  let configured = false
  try {
    const cfg = data?.value ? JSON.parse(String(data.value)) : null
    configured = !!cfg?.password_hash
  } catch { /* ערך פגום = לא מוגדר */ }

  return NextResponse.json(
    { configured, updatedAt: data?.updated_at ?? null },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: { password?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const password = String(body.password ?? '').trim()
  // ⚠️ 6 תווים לפחות: סיסמה משותפת שמוקלדת בדוכן אינה אמורה להיות
  // ארוכה, אבל 4 ספרות הן ניחוש של דקה.
  if (password.length < 6) {
    return NextResponse.json({ error: 'הסיסמה חייבת להיות באורך 6 תווים לפחות' }, { status: 400 })
  }

  const hash = hashSellerPassword(password)
  if (!hash) {
    console.error('[fair/seller-password] אין סוד חתימה — השמירה נדחית')
    return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })
  }

  const { error } = await db.from('app_settings').upsert(
    // ⚠️ JSON.stringify — app_settings היא עמודת text, ואובייקט גולמי
    // נשמר כ-"[object Object]" בשקט.
    { key: SELLER_CONFIG_KEY, value: JSON.stringify({ password_hash: hash }), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) return NextResponse.json({ error: 'שמירת הסיסמה נכשלה' }, { status: 500 })

  // ⚠️ נרשם ביומן הפעילות — בלי הסיסמה עצמה.
  await logActivity(db, {
    userId: staff.userId, action: 'fair_seller_password_set',
    entityType: 'app_settings', entityId: SELLER_CONFIG_KEY,
  })

  return NextResponse.json({ ok: true })
}
