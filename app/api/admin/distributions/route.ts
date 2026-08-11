import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// ניהול חלוקות חגים — יצירה, עריכה, ופתיחת/סגירת הרישום.
//
// ⚠️ פתיחת רישום היא בלעדית: פתיחת חלוקה סוגרת אוטומטית כל חלוקה אחרת. הערוץ
// הטלפוני מקריא "החלוקה הפעילה", ושתי חלוקות פתוחות היו הופכות אותו לדו-משמעי
// (וגם את הצפי התקציבי לבלתי-קריא). במסד יש אינדקס ייחודי שאוכף זאת; כאן זה
// נעשה מסודר, כדי שהמנהל לא יקבל שגיאת מסד אלא התנהגות מובנת.
// ─────────────────────────────────────────────────────────────────────────────

interface Body {
  id?: string
  name?: string
  year?: string
  description?: string
  amount_per_family?: number | null
  registration_open?: boolean
  registration_opens_at?: string | null
  registration_closes_at?: string | null
  distribution_date?: string | null
  status?: string
}

/**
 * חלון הרישום שהתקבל מהטופס → ISO, או null כשנוקה.
 *
 * ⚠️ הקלט מגיע כ-datetime-local ("2026-08-14T20:00") — מחרוזת *בלי* אזור זמן,
 * שהדפדפן מתכוון בה לשעון המקומי. new Date() על מחרוזת כזו מפרש אותה נכון
 * (כמקומית), ו-toISOString ממיר ל-UTC לשמירה. בלי ההמרה הזו השעה הייתה נשמרת
 * כאילו היא UTC — כלומר זזה בשלוש שעות, וסגירה ב-20:00 הייתה קורית ב-23:00.
 */
function parseWindow(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v === null || v === undefined || v === '') return { ok: true, value: null }
  const t = new Date(String(v)).getTime()
  if (!Number.isFinite(t)) return { ok: false }
  return { ok: true, value: new Date(t).toISOString() }
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('distributions', 'add')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'שם החלוקה חובה' }, { status: 400 })

  const amount = body.amount_per_family == null ? null : Number(body.amount_per_family)
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
    return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  }

  const { data, error } = await db.from('distributions').insert({
    name,
    year: String(body.year ?? '').trim() || null,
    description: String(body.description ?? '').trim() || null,
    amount_per_family: amount,
    distribution_date: body.distribution_date || null,
    status: 'planning',
    registration_open: false,
    created_by: staff.userId,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(db, { userId: staff.userId, action: 'distribution_created', entityType: 'distribution', entityId: data.id, details: { name, amount } }).catch(() => {})
  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('distributions', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'שם החלוקה חובה' }, { status: 400 })
    updates.name = name
  }
  if (body.year !== undefined) updates.year = String(body.year).trim() || null
  if (body.description !== undefined) updates.description = String(body.description).trim() || null
  if (body.distribution_date !== undefined) updates.distribution_date = body.distribution_date || null
  if (body.status !== undefined) updates.status = body.status
  if (body.amount_per_family !== undefined) {
    const amount = body.amount_per_family == null ? null : Number(body.amount_per_family)
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
      return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
    }
    updates.amount_per_family = amount
  }

  // ── חלון הרישום המתוזמן ──────────────────────────────────────────────────
  if (body.registration_opens_at !== undefined) {
    const p = parseWindow(body.registration_opens_at)
    if (!p.ok) return NextResponse.json({ error: 'מועד פתיחה לא תקין' }, { status: 400 })
    updates.registration_opens_at = p.value
  }
  if (body.registration_closes_at !== undefined) {
    const p = parseWindow(body.registration_closes_at)
    if (!p.ok) return NextResponse.json({ error: 'מועד סגירה לא תקין' }, { status: 400 })
    updates.registration_closes_at = p.value
  }
  // ⚠️ נבדק מול הערך *המשולב* (החדש אם נשלח, אחרת הקיים במסד): שליחת מועד
  // סגירה בלבד הייתה עוקפת בדיקה שמסתכלת רק על גוף הבקשה, ויוצרת חלון הפוך
  // שמשמעותו "סגור תמיד" בלי שום חיווי למנהל.
  if (updates.registration_opens_at !== undefined || updates.registration_closes_at !== undefined) {
    const { data: cur } = await db.from('distributions')
      .select('registration_opens_at, registration_closes_at').eq('id', id).maybeSingle()
    const o = (updates.registration_opens_at !== undefined
      ? updates.registration_opens_at : cur?.registration_opens_at) as string | null
    const c = (updates.registration_closes_at !== undefined
      ? updates.registration_closes_at : cur?.registration_closes_at) as string | null
    if (o && c && new Date(c).getTime() <= new Date(o).getTime()) {
      return NextResponse.json({ error: 'מועד הסגירה חייב להיות אחרי מועד הפתיחה' }, { status: 400 })
    }
  }

  if (body.registration_open !== undefined) {
    const open = body.registration_open === true
    if (open) {
      // סוגרים כל חלוקה אחרת לפני הפתיחה — בלעדיות (ראו ההערה בראש הקובץ)
      await db.from('distributions')
        .update({ registration_open: false, registration_closed_at: new Date().toISOString() })
        .eq('registration_open', true)
        .neq('id', id)
      updates.registration_open = true
      updates.registration_opened_at = new Date().toISOString()
      updates.registration_closed_at = null
      // חלוקה שנפתחה לרישום היא חלוקה פעילה
      if (body.status === undefined) updates.status = 'active'
    } else {
      updates.registration_open = false
      updates.registration_closed_at = new Date().toISOString()
    }
  }

  const { error } = await db.from('distributions').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(db, {
    userId: staff.userId, action: 'distribution_updated',
    entityType: 'distribution', entityId: id, details: updates,
  }).catch(() => {})
  return NextResponse.json({ ok: true })
}
