import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// הוספה ידנית של משפחה לחלוקת חגים.
//
// המקרה: משפחה שלא נרשמה בזמן — לא התקשרה, לא נכנסה לממשק — והמשרד רוצה
// לצרף אותה. עד כה הדרך היחידה הייתה לפתוח מחדש את הרישום לכולם.
//
// 🔴 המסלול הזה **עוקף במכוון** את getOpenDistribution: הוא לא בודק
// registration_open ולא את שער המחלקה. זו כל מטרתו — הוספה אחרי הסגירה.
// לכן הוא דורש הרשאת עריכה מפורשת ומתועד ב-activity log, בשונה ממסלולי
// הרישום העצמי.
//
// ⚠️ ההוספה מוגבלת למי שרשום כצאצא: beneficiary_id הוא מפתח זר, אבל
// אנחנו מאמתים קיום *לפני* ההוספה כדי להחזיר שגיאה מובנת במקום כשל
// מסד גולמי. זו גם הדרישה העסקית — רק צאצא רשום מקבל חלוקה.
//
// ⚠️ הכפילות נאכפת באינדקס הייחודי (distribution_id, beneficiary_id) בדיוק
// כמו בכל ערוצי הרישום. משפחה שכבר רשומה מחזירה already=true ולא שגיאה —
// המזכיר שלחץ פעמיים צריך לראות "כבר רשום", לא כשל.
// ─────────────────────────────────────────────────────────────────────────────

interface Body {
  distribution_id?: string
  beneficiary_id?: string
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('distributions', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const distributionId = String(body.distribution_id ?? '').trim()
  const beneficiaryId = String(body.beneficiary_id ?? '').trim()
  if (!distributionId || !beneficiaryId) {
    return NextResponse.json({ error: 'חסרים פרטי החלוקה או המשפחה' }, { status: 400 })
  }

  // ── החלוקה קיימת? ──
  // ⚠️ registration_open *לא* נבדק כאן במכוון — ראה הערת הפתיחה.
  const { data: dist } = await db
    .from('distributions')
    .select('id, name, amount_per_family')
    .eq('id', distributionId)
    .maybeSingle()
  if (!dist) return NextResponse.json({ error: 'החלוקה לא נמצאה' }, { status: 404 })

  // ── המשפחה רשומה כצאצא? ──
  // 🔴 הדרישה העסקית: רק מי שרשום במאגר הצאצאים מקבל חלוקה. בלי הבדיקה
  // הזו שגיאת מפתח זר הייתה מגיעה למסך כטקסט מסד לא קריא.
  const { data: ben } = await db
    .from('beneficiaries')
    .select('id, full_name, family_name, phone, eligibility_status')
    .eq('id', beneficiaryId)
    .maybeSingle()
  if (!ben) return NextResponse.json({ error: 'המשפחה אינה רשומה במאגר הצאצאים' }, { status: 404 })

  const benName = [ben.family_name, ben.full_name].filter(Boolean).join(' ') || 'המשפחה'

  // ── כבר רשומה? ──
  const { data: existing } = await db
    .from('distribution_recipients')
    .select('id, registered_at')
    .eq('distribution_id', distributionId)
    .eq('beneficiary_id', beneficiaryId)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({
      ok: true, already: true, name: benName,
      registeredAt: (existing as { registered_at?: string | null }).registered_at ?? null,
    })
  }

  const now = new Date().toISOString()
  const { error } = await db.from('distribution_recipients').insert({
    distribution_id: distributionId,
    beneficiary_id: beneficiaryId,
    amount: dist.amount_per_family ?? null,
    // ⚠️ 'admin' = "הזנה ידנית" ברשימת הערוצים המשותפת. כך ההוספה נספרת
    // בפילוח הערוצים ואפשר לדעת בדיעבד מי צורף ידנית ומי נרשם בעצמו.
    source: 'admin',
    phone: ben.phone ?? null,
    registered_at: now,
    status: 'pending',
  })

  if (error) {
    // התנגשות באינדקס הייחודי = נרשמה במקביל בערוץ אחר. הצלחה, לא כשל.
    if (String((error as { code?: string }).code) === '23505') {
      return NextResponse.json({ ok: true, already: true, name: benName })
    }
    console.error('[distributions/add] הוספה ידנית נכשלה:', error.message)
    return NextResponse.json({ error: 'ההוספה נכשלה' }, { status: 500 })
  }

  // ⚠️ מתועד: הוספה ידנית אחרי סגירת הרישום היא בדיוק הפעולה שתישאל
  // עליה בדיעבד — מי צירף, את מי, ומתי.
  await logActivity(db, {
    userId: staff.userId,
    action: 'distribution_recipient_added_manually',
    entityType: 'distribution_recipient',
    entityId: beneficiaryId,
    details: { distribution_id: distributionId, distribution: dist.name, beneficiary: benName },
  }).catch(() => {})

  return NextResponse.json({ ok: true, already: false, name: benName })
}
