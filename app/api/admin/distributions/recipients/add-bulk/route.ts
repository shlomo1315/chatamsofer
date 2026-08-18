import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// צירוף אצווה של משפחות לחלוקת חגים — בקשה אחת לכל הקבוצה.
//
// 🔴 למה נתיב נפרד ולא לולאה על /add: הלקוח שלח בקשה לכל אדם בנפרד,
// בזה אחר זה. 50 סימונים = 50 הלוך-ושוב ברשת, כל אחד עם שלוש שאילתות
// מסד ורישום ביומן — עשרות שניות שבהן המסך תקוע בלי חיווי, ואם משהו
// נופל באמצע אין דרך לדעת מה נכנס ומה לא.
//
// כאן הכול בשאילתה אחת: אימות קבוצתי, insert יחיד, שורת יומן אחת.
//
// ⚠️ עוקף במכוון את registration_open — זו כל מטרת הצירוף הידני, בדיוק
// כמו ב-/add. לכן אותה הרשאה בדיוק ('distributions', 'edit') ותיעוד מלא.
//
// ⚠️ מוחזר פירוט (added/already/missing) ולא רק מונה: "כבר רשום" אינו
// כישלון, ואיחודם היה מסתיר מהמנהל מה בדיוק קרה.
// ─────────────────────────────────────────────────────────────────────────────

/** תקרת בטיחות — מונעת בקשה שתתקע את השרת. */
const MAX_BATCH = 500

interface Body {
  distribution_id?: string
  beneficiary_ids?: unknown
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('distributions', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const distributionId = String(body.distribution_id ?? '').trim()
  // ⚠️ ייחוד לפני הכול: אותו מזהה פעמיים ברשימה היה מתנגש באינדקס הייחודי
  // ומפיל את כל האצווה, אף שאין כאן שום שגיאה אמיתית.
  const ids = Array.isArray(body.beneficiary_ids)
    ? [...new Set(body.beneficiary_ids.map(v => String(v ?? '').trim()).filter(Boolean))]
    : []

  if (!distributionId) return NextResponse.json({ error: 'חסר מזהה החלוקה' }, { status: 400 })
  if (!ids.length) return NextResponse.json({ error: 'לא נבחרו משפחות' }, { status: 400 })
  if (ids.length > MAX_BATCH) {
    return NextResponse.json({ error: `אפשר לצרף עד ${MAX_BATCH} בכל פעם` }, { status: 400 })
  }

  // ── החלוקה קיימת? ──
  const { data: dist } = await db
    .from('distributions')
    .select('id, name, amount_per_family')
    .eq('id', distributionId)
    .maybeSingle()
  if (!dist) return NextResponse.json({ error: 'החלוקה לא נמצאה' }, { status: 404 })

  // ── מי מהם באמת קיים במאגר? ──
  // 🔴 הדרישה העסקית: רק מי שרשום במאגר מקבל חלוקה. בלי הבדיקה שגיאת
  // מפתח זר הייתה מפילה את כל האצווה בגלל מזהה אחד שאינו תקין.
  const { data: bens, error: benErr } = await db
    .from('beneficiaries')
    .select('id, phone')
    .in('id', ids)
  if (benErr) return NextResponse.json({ error: 'שליפת המשפחות נכשלה' }, { status: 500 })

  const found = new Map((bens ?? []).map(b => [String(b.id), b]))
  const missing = ids.filter(id => !found.has(id))

  // ── מי כבר רשום לחלוקה? ──
  const { data: existing } = await db
    .from('distribution_recipients')
    .select('beneficiary_id')
    .eq('distribution_id', distributionId)
    .in('beneficiary_id', [...found.keys()])

  const alreadySet = new Set((existing ?? []).map(r => String(r.beneficiary_id)))
  const toInsert = [...found.values()].filter(b => !alreadySet.has(String(b.id)))

  if (!toInsert.length) {
    return NextResponse.json({
      ok: true, added: 0, already: alreadySet.size, missing: missing.length,
    })
  }

  const now = new Date().toISOString()
  const { error } = await db.from('distribution_recipients').insert(
    toInsert.map(b => ({
      distribution_id: distributionId,
      beneficiary_id: b.id,
      amount: dist.amount_per_family ?? null,
      // ⚠️ 'admin' = הזנה ידנית ברשימת הערוצים המשותפת — כך הצירוף נספר
      // בפילוח ואפשר לדעת בדיעבד מי צורף ידנית.
      source: 'admin',
      phone: b.phone ?? null,
      registered_at: now,
      status: 'pending',
    })),
  )

  if (error) {
    // ⚠️ התנגשות באינדקס הייחודי = מישהו נרשם בערוץ אחר בין הבדיקה
    // להכנסה. לא כישלון — נספר כ"כבר רשום".
    if (String((error as { code?: string }).code) === '23505') {
      return NextResponse.json({
        ok: true, added: 0, already: alreadySet.size + toInsert.length, missing: missing.length,
      })
    }
    console.error('[distributions/add-bulk] צירוף אצווה נכשל:', error.message)
    return NextResponse.json({ error: 'הצירוף נכשל' }, { status: 500 })
  }

  // ⚠️ שורת יומן אחת לאצווה ולא אחת לכל אדם: 50 שורות זהות הופכות את
  // היומן לבלתי קריא בדיוק ביום שבו מחפשים בו את הפעולה הזו.
  await logActivity(db, {
    userId: staff.userId,
    action: 'distribution_recipients_added_bulk',
    entityType: 'distribution',
    entityId: distributionId,
    details: {
      distribution: dist.name,
      added: toInsert.length,
      already: alreadySet.size,
      missing: missing.length,
    },
  }).catch(() => {})

  return NextResponse.json({
    ok: true,
    added: toInsert.length,
    already: alreadySet.size,
    missing: missing.length,
  })
}
