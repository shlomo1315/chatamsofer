import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// התראות על הערות שנכתבו בפורטל הביצוע (/shared/loans).
//
// 🔴 ההערה נכתבת אצל הגורם המבצע ("יש לו כבר הלוואה, לא שולחים שטר"), ועד
// עכשיו לא הוצגה בשום מסך ניהול — המזכירות פשוט לא ידעו עליה. כל הערה
// חדשה פותחת התראה שנשארת עד "טופל", או נדחית ל"טיפול בהמשך" עד מועד.
// ─────────────────────────────────────────────────────────────────────────────

/** כל ההתראות הפתוחות. due = הגיע מועדה (או שלא נדחתה) — היא שקופצת ומהבהבת. */
export async function GET() {
  const staff = await requirePermission('loans', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await db
    .from('loans')
    .select('id, beneficiary_id, amount, approved_amount, installments, status, portal_note, portal_note_at, portal_note_remind_at, note_sent_at, disbursed_at, beneficiary:beneficiaries(full_name, family_name, spouse_name, id_number, phone, city)')
    .eq('portal_note_alert', 'open')
    .not('portal_note', 'is', null)
    .order('portal_note_at', { ascending: false })
    .limit(200)
  if (error) {
    // ⚠️ לפני שהמיגרציה רצה — רשימה ריקה ולא שגיאה, כדי לא להפיל את הכניסה.
    console.error('[loan-portal-notes] שליפה נכשלה:', error.message)
    return NextResponse.json({ alerts: [] })
  }

  const now = Date.now()
  return NextResponse.json({
    alerts: (data ?? []).map(r => {
      // ⚠️ join של Supabase מגיע לפעמים כמערך ולפעמים כאובייקט.
      const b = (Array.isArray(r.beneficiary) ? r.beneficiary[0] : r.beneficiary) as
        { full_name?: string; family_name?: string; spouse_name?: string; id_number?: string; phone?: string; city?: string } | null
      const remind = r.portal_note_remind_at ? new Date(r.portal_note_remind_at as string).getTime() : null
      return {
        id: r.id,
        beneficiary_id: r.beneficiary_id,
        amount: Number(r.approved_amount ?? r.amount) || 0,
        installments: r.installments,
        status: r.status,
        note: r.portal_note,
        note_at: r.portal_note_at,
        remind_at: r.portal_note_remind_at,
        note_sent_at: r.note_sent_at,
        disbursed_at: r.disbursed_at,
        familyName: b ? ([b.family_name, b.full_name || b.spouse_name].filter(Boolean).join(' ') || 'ללא שם') : 'ללא שם',
        id_number: b?.id_number ?? null,
        phone: b?.phone ?? null,
        city: b?.city ?? null,
        due: remind === null || remind <= now,
      }
    }),
  })
}

/**
 * { id, action: 'handled' } — טופל, ההתראה נסגרת.
 * { id, action: 'snooze', remind_at: 'YYYY-MM-DD' } — לטיפול בהמשך: שקטה עד התאריך.
 */
export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('loans', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { id?: string; action?: string; remind_at?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const id = String(body.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })
  const now = new Date().toISOString()

  let patch: Record<string, unknown>
  if (body.action === 'handled') {
    patch = { portal_note_alert: 'handled', portal_note_remind_at: null,
      portal_note_handled_at: now, portal_note_handled_by: staff.userId }
  } else if (body.action === 'snooze') {
    // ⚠️ תאריך בלבד → 08:00 שעון ישראל באותו יום, כדי שהתזכורת תקפוץ
    // בתחילת יום העבודה ולא בחצות.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(body.remind_at ?? ''))
    if (!m) return NextResponse.json({ error: 'יש לבחור תאריך לתזכורת' }, { status: 400 })
    const at = new Date(`${m[1]}-${m[2]}-${m[3]}T08:00:00+02:00`)
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: 'תאריך לא תקין' }, { status: 400 })
    // ⚠️ תאריך שעבר היה "דוחה" את ההתראה לשום מקום — היא קופצת שוב מיד.
    const todayIl = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
    if (`${m[1]}-${m[2]}-${m[3]}` <= todayIl) {
      return NextResponse.json({ error: 'התזכורת צריכה להיות מחר או אחר כך' }, { status: 400 })
    }
    patch = { portal_note_remind_at: at.toISOString() }
  } else {
    return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
  }

  const { data, error } = await db
    .from('loans')
    .update(patch)
    .eq('id', id)
    .eq('portal_note_alert', 'open')
    .select('id, beneficiary_id, portal_note')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // ⚠️ מזכירה אחרת כבר סימנה — לא שגיאה מבחינת המשתמש, ההתראה פשוט יורדת.
  if (!data?.length) return NextResponse.json({ ok: true, already: true })

  await logActivity(db, {
    userId: staff.userId,
    action: body.action === 'handled' ? 'loan_portal_note_handled' : 'loan_portal_note_snoozed',
    entityType: 'loan', entityId: id,
    details: { note: data[0].portal_note, remind_at: patch.portal_note_remind_at ?? null },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
