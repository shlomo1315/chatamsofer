import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { logActivity } from '@/lib/activityLog'
import { scopeNotify, type NotifyCandidate } from '@/lib/pickupNotify'
import { pickupPhoneText, pickupEmailText } from '@/lib/pickupMessages'
import { placeTtsCall, yemotCallConfigured } from '@/lib/yemotCall'
import { deliverMail } from '@/lib/sendMail'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// הודעה למשפחה שהכרטיס מוכן לאיסוף — צינתוק ומייל.
//
// 🔴 אין שוברים בחלוקה הזו. ההודעה הזו היא **כל** מה שהמשפחה מקבלת,
// ולכן היא חייבת לומר גם איפה וגם למה רק שם.
//
// 🔴 אותו דפוס כמו הטעינה: GET מציג תצוגה מקדימה ואינו שולח דבר,
// POST דורש confirm:true. שליחה ל-6,000 משפחות אינה הפיכה.
//
// ⚠️ הפעולה חוזרת. pickup_notified_at הוא מה שמונע צינתוק שני לאותה
// משפחה אחרי טעינה נוספת.
// ─────────────────────────────────────────────────────────────────────────────

interface Ben { phone: string | null; phone2: string | null; email: string | null }

interface Row {
  id: string
  load_status: string | null
  center_id: string | null
  pickup_notified_at: string | null
  beneficiary: Ben | Ben[] | null
}

/** ⚠️ Supabase מחזיר join כמערך או כאובייקט. */
const firstBen = (b: Row['beneficiary']): Ben | null =>
  Array.isArray(b) ? (b[0] ?? null) : b

async function loadCandidates(
  db: NonNullable<ReturnType<typeof getServiceClient>>,
  distributionId: string,
): Promise<{ rows: NotifyCandidate[]; centerOf: Map<string, string> }> {
  // ⚠️ fetchAllRows: תקרת 1,000 השקטה הייתה חותכת את הרשימה, ומשפחות
  // היו נשארות בלי הודעה בלי שום סימן.
  const { rows } = await fetchAllRows<Row>((from, to) => db
    .from('distribution_recipients')
    .select('id, load_status, center_id, pickup_notified_at, beneficiary:beneficiaries(phone, phone2, email)')
    .eq('distribution_id', distributionId)
    .range(from, to))

  const centerOf = new Map<string, string>()

  const mapped = rows.map(r => {
    const b = firstBen(r.beneficiary)
    if (r.center_id) centerOf.set(r.id, r.center_id)
    return {
      id: r.id,
      load_status: r.load_status,
      center_id: r.center_id,
      // ⚠️ phone2 כנפילה-לאחור: חלק מהמשפחות רשמו רק מספר שני.
      phone: b?.phone ?? b?.phone2 ?? null,
      email: b?.email ?? null,
      notified_at: r.pickup_notified_at,
    }
  })

  return { rows: mapped, centerOf }
}

/** שמות המוקדים — להודעה, שנוקבת בשם. */
async function centerLabels(
  db: NonNullable<ReturnType<typeof getServiceClient>>,
): Promise<Map<string, string>> {
  const { data } = await db.from('holiday_centers').select('id, city, name')
  const out = new Map<string, string>()
  for (const c of (data ?? []) as { id: string; city: string; name: string }[]) {
    // ⚠️ עיר ששמה זהה לשם המוקד לא תוצג פעמיים.
    out.set(c.id, c.city === c.name ? c.city : `${c.city} · ${c.name}`)
  }
  return out
}

/** תצוגה מקדימה — כמה יקבלו ומי יידלג. אינה שולחת דבר. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('distributions', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { id } = await ctx.params
  const { rows } = await loadCandidates(db, id)
  const scope = scopeNotify(rows)

  return NextResponse.json({
    phone: scope.phone.length,
    email: scope.email.length,
    skipped: scope.skipped,
    // ⚠️ נאמר מראש: בלי הגדרת ימות הצינתוק לא יצא, והמנהל יחשוב
    // שההודעה נשלחה.
    callConfigured: yemotCallConfigured(),
  })
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('distributions', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { id } = await ctx.params
  const body = await request.json().catch(() => ({})) as {
    confirm?: boolean
    ids?: string[]
    /** ⚠️ ברירת המחדל: שניהם. */
    channels?: { phone?: boolean; email?: boolean }
  }

  // 🔴 שער האישור.
  if (!body.confirm) {
    return NextResponse.json({ error: 'נדרש אישור מפורש' }, { status: 400 })
  }

  const wantPhone = body.channels?.phone !== false
  const wantEmail = body.channels?.email !== false

  const onlyIds = body.ids?.length ? new Set(body.ids.map(String)) : undefined
  const { rows } = await loadCandidates(db, id)
  const scope = scopeNotify(rows, { onlyIds })
  const labels = await centerLabels(db)
  const centerById = new Map(rows.map(r => [r.id, r.center_id]))

  const label = (rid: string) => {
    const cid = centerById.get(rid)
    return cid ? (labels.get(cid) ?? null) : null
  }

  let calls = 0, mails = 0, failed = 0
  // ⚠️ מי שקיבל *לפחות* ערוץ אחד מסומן. אחרת ריצה חוזרת הייתה שולחת
  // שוב מייל למי שרק הצינתוק אליו נכשל.
  const notified = new Set<string>()

  if (wantPhone) {
    for (const t of scope.phone) {
      try {
        const r = await placeTtsCall(t.phone!, pickupPhoneText(label(t.id)))
        if (r.ok) { calls++; notified.add(t.id) } else failed++
      } catch { failed++ }
      // ⚠️ השהיה קצרה: עשרות שיחות בשנייה מול ימות מחזירות שגיאות
      // זמניות, ואז ההודעה פשוט לא יוצאת.
      await new Promise(r => setTimeout(r, 120))
    }
  }

  if (wantEmail) {
    for (const t of scope.email) {
      try {
        const text = pickupEmailText(label(t.id))
        const html = `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7">${
          text.split('\n\n').map(p => `<p>${p}</p>`).join('')}</div>`
        // ⚠️ transactional: זו הודעה תפעולית ולא דיוור. מעקב הפתיחות
        // של Resend יוצא מדומיין שנטפרי חוסמת, וכל הקהל שלנו מסונן.
        const r = await deliverMail(t.email!, 'הכרטיס שלכם מוכן לאיסוף', html, undefined, {
          transactional: true, sentBy: staff.email ?? undefined,
        })
        if (r.ok) { mails++; notified.add(t.id) } else failed++
      } catch { failed++ }
    }
  }

  // ⚠️ מסמנים רק את מי שההודעה אליו באמת יצאה: סימון גורף היה משאיר
  // משפחות בלי הודעה ובלי דרך לזהות אותן בריצה הבאה.
  if (notified.size) {
    const ids = [...notified]
    const CHUNK = 500
    for (let i = 0; i < ids.length; i += CHUNK) {
      await db.from('distribution_recipients')
        .update({ pickup_notified_at: new Date().toISOString() })
        .in('id', ids.slice(i, i + CHUNK))
    }
  }

  console.log(`[pickup-notify] חלוקה ${id}: ${calls} צינתוקים · ${mails} מיילים · ${failed} נכשלו · ${staff.email ?? ''}`)
  await logActivity(db, {
    userId: staff.userId, action: 'distribution_pickup_notify',
    entityType: 'distribution', entityId: id,
    details: { calls, mails, failed },
  }).catch(() => {})

  return NextResponse.json({ ok: true, calls, mails, failed, skipped: scope.skipped })
}
