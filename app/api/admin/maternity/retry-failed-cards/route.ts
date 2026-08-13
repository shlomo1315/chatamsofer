import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { loadMaternityCardOnApproval } from '@/lib/maternityCards'
import { isPassportId } from '@/lib/nedarim'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'
// טעינה מול נדרים היא איטית — כמה תיקים ברצף עלולים לחרוג מברירת המחדל.
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// הרצה חוזרת לתיקים שטעינת הכרטיס בהם נכשלה.
//
// 🔴 הצורך המיידי: יולדות עם דרכון נכשלו בכל ריצה ב"מספר זהות שגוי" — נדרים
// דוחה דרכון בשדה Zeout. התיקון (מזהה ג') פותר את החדשות, אבל התיקים שכבר
// נכשלו תקועים ב-card_load_status='failed' ואינם מנסים שוב מעצמם.
//
// ⚠️ בטוח להרצה חוזרת: בכל מסלול כשל הכרטיס כבר הוחזר למלאי (delta +1),
// ו-loadMaternityCardOnApproval יוצא מוקדם עם already=true אם כבר נטען.
// כלומר הרצה כפולה אינה מנכה כרטיס פעמיים ואינה טוענת פעמיים.
//
// GET  — מי נכשל ומה הסיבה (בלי לגעת).
// POST — הרצה חוזרת. ?only=passport מריץ רק את מי שנכשל על דרכון.
// ─────────────────────────────────────────────────────────────────────────────

interface FailedAid {
  id: string
  card_load_error: string | null
  card_tlush_id?: string | null
  beneficiary_id: string | null
  beneficiary?: { full_name?: string | null; family_name?: string | null; id_number?: string | null; spouse_id_number?: string | null } | null
}

/** ⚠️ מזהה את שגיאת הדרכון לפי הנוסח שנדרים מחזיר בפועל. */
const PASSPORT_ERROR = /מספר זהות שגוי|בספרות בלבד/i

async function listFailed(db: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { data } = await db.from('maternity_aids')
    .select('id, card_load_error, card_tlush_id, beneficiary_id, beneficiary:beneficiaries(full_name, family_name, id_number, spouse_id_number)')
    .eq('card_load_status', 'failed')
    // 🔴 תיק שכבר יש לו טעינה בנדרים (card_tlush_id) אינו "נכשל" גם אם
    // הסטטוס אומר כך — הכסף כבר נטען. הרצה חוזרת עליו הייתה מנכה כרטיס
    // שני מהמלאי וטוענת 600 ₪ נוספים.
    //
    // ⚠️ הסינון כאן ולא רק בהגנה הפנימית: הראוט מנקה את card_load_status
    // לפני הניסיון, וניקוי כזה מבטל את ההגנה שנשענת עליו. השארת התיקים
    // האלה מחוץ לרשימה מלכתחילה היא ההגנה היחידה שאינה תלויה בסדר.
    .is('card_tlush_id', null)
    .order('updated_at', { ascending: false })
  return (data ?? []) as unknown as FailedAid[]
}

/** האם הכשל הזה נובע מדרכון — לפי נוסח השגיאה או לפי המזהה עצמו. */
function isPassportFailure(a: FailedAid): boolean {
  if (PASSPORT_ERROR.test(String(a.card_load_error ?? ''))) return true
  const b = a.beneficiary
  return [b?.id_number, b?.spouse_id_number].filter(Boolean)
    .some(v => isPassportId({ id_number: String(v) }))
}

export async function GET() {
  if (!(await requirePermission('maternity', 'view'))) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const failed = await listFailed(db)
  return NextResponse.json({
    total: failed.length,
    passportRelated: failed.filter(isPassportFailure).length,
    items: failed.map(a => {
      const b = a.beneficiary
      return {
        id: a.id,
        name: [b?.family_name, b?.full_name].filter(Boolean).join(' ') || '—',
        id_number: b?.id_number ?? b?.spouse_id_number ?? null,
        error: a.card_load_error,
        passportRelated: isPassportFailure(a),
      }
    }),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  // ⚠️ 'edit' ולא 'view': הפעולה מנכה כרטיסים מהמלאי וטוענת כסף בנדרים.
  if (!(await requirePermission('maternity', 'edit'))) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { only?: string; ids?: string[] }
  const onlyPassport = body.only === 'passport'

  let targets = await listFailed(db)
  if (Array.isArray(body.ids) && body.ids.length) {
    const wanted = new Set(body.ids)
    targets = targets.filter(a => wanted.has(a.id))
  } else if (onlyPassport) {
    targets = targets.filter(isPassportFailure)
  }

  if (!targets.length) {
    return NextResponse.json({ ok: true, processed: 0, succeeded: 0, failed: 0, results: [], note: 'אין תיקים מתאימים' })
  }

  const results: { id: string; name: string; ok: boolean; error?: string; already?: boolean; awaitingStock?: boolean }[] = []

  // ⚠️ טורי ולא מקבילי: כל תיק מנכה מהמלאי ופונה לנדרים. הרצה מקבילה
  // הייתה יוצרת מרוץ על אותו מלאי ומכפילה את קצב הבקשות לנדרים.
  for (const a of targets) {
    const b = a.beneficiary
    const name = [b?.family_name, b?.full_name].filter(Boolean).join(' ') || a.id
    try {
      // 🔴 הסטטוס *אינו* מנוקה לפני הניסיון.
      //
      // ⚠️ ניקוי כזה מבטל את ההגנה מפני ניכוי כפול, שנשענת בדיוק על
      // card_load_status ו-card_tlush_id. loadMaternityCardOnApproval
      // מטפלת ב-'failed' כמו בכל סטטוס שאינו 'loaded' וממשיכה הלאה —
      // ולכן אין שום צורך לנקות, ויש נזק ממשי בכך.
      const r = await loadMaternityCardOnApproval(db, a.id)
      results.push({
        id: a.id, name,
        ok: r.ok,
        error: r.error,
        already: r.already,
        awaitingStock: r.awaitingStock,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      results.push({ id: a.id, name, ok: false, error: msg })
    }
  }

  const succeeded = results.filter(r => r.ok && !r.awaitingStock).length
  const failedCount = results.filter(r => !r.ok).length

  await logActivity(db, {
    action: 'maternity_cards_retry_failed',
    entityType: 'maternity_aid',
    details: { attempted: targets.length, succeeded, failed: failedCount, onlyPassport },
  }).catch(() => {})

  console.log(`[retry-failed-cards] נוסו ${targets.length} · הצליחו ${succeeded} · נכשלו ${failedCount}`)

  return NextResponse.json({
    ok: true,
    processed: targets.length,
    succeeded,
    failed: failedCount,
    awaitingStock: results.filter(r => r.awaitingStock).length,
    results,
  })
}
