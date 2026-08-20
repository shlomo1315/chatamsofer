import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { buildHolidayVoucher, HOLIDAY_VOUCHER_DEFAULTS } from '@/lib/holidayVoucher'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// שליחת שוברי החגים במייל.
//
// 🔴 נשלח **רק** למי שבחר מוקד: השובר כולו בנוי סביב המוקד, ובלעדיו הוא
// דף ריק שמבלבל יותר משהוא עוזר.
//
// 🔴 GET = תצוגה מקדימה בלבד. POST דורש confirm:true — קריאה מקרית לא
// תשלח אלפי מיילים.
//
// ⚠️ סדרתי עם השהיה: שליחה מקבילה של אלפי מיילים חוטפת חסימת קצב, ואז
// חלק נשלחים וחלק לא בלי שאיש יידע מי.
// ─────────────────────────────────────────────────────────────────────────────

interface CenterRel { city: string; name: string; address: string | null; hours: string | null; phone: string | null }
interface BenRel { family_name: string | null; full_name: string | null; email: string | null }

/** ⚠️ Supabase מטפס יחסי join כמערך גם כשהם יחידים — ראו holiday-load. */
interface Row {
  id: string
  email_sent_at: string | null
  center: CenterRel | CenterRel[] | null
  beneficiary: BenRel | BenRel[] | null
}

/** Supabase מחזיר יחסי join כמערך גם כשהם יחידים. */
const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

async function loadRows(
  db: NonNullable<ReturnType<typeof getServiceClient>>,
  distributionId: string,
) {
  // ⚠️ fetchAllRows — תקרת 1,000 השקטה הייתה חותכת את הרשימה.
  const { rows } = await fetchAllRows<Row>((from, to) => db
    .from('distribution_recipients')
    .select('id, email_sent_at, center:holiday_centers(city, name, address, hours, phone), beneficiary:beneficiaries(family_name, full_name, email)')
    .eq('distribution_id', distributionId)
    .not('center_id', 'is', null)
    .range(from, to))

  return rows.map(r => {
    const c = one(r.center)
    const b = one(r.beneficiary)
    return {
      id: r.id,
      alreadySent: !!r.email_sent_at,
      email: (b?.email ?? '').trim(),
      familyName: [b?.family_name, b?.full_name].filter(Boolean).join(' ') || 'משפחה',
      center: c,
    }
  })
}

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const distributionId = request.nextUrl.searchParams.get('distribution_id') ?? ''
  if (!distributionId) return NextResponse.json({ error: 'חסר מזהה חלוקה' }, { status: 400 })

  const rows = await loadRows(db, distributionId)
  const sendable = rows.filter(r => r.email && r.center && !r.alreadySent)

  return NextResponse.json({
    withCenter: rows.length,
    sendable: sendable.length,
    alreadySent: rows.filter(r => r.alreadySent).length,
    // ⚠️ מדווח מי לא יקבל ולמה — אחרת ההפרש נראה כתקלה.
    noEmail: rows.filter(r => !r.email).length,
  })
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as {
    distribution_id?: string; confirm?: boolean; ids?: string[]; resend?: boolean
  }
  // 🔴 שער האישור.
  if (!body.confirm) return NextResponse.json({ error: 'נדרש אישור מפורש לשליחה' }, { status: 400 })

  const distributionId = String(body.distribution_id ?? '')
  if (!distributionId) return NextResponse.json({ error: 'חסר מזהה חלוקה' }, { status: 400 })

  const all = await loadRows(db, distributionId)
  const scoped = body.ids?.length ? all.filter(r => body.ids!.includes(r.id)) : all
  // ⚠️ resend מפורש בלבד: בלעדיו מי שכבר קיבל אינו מקבל שוב, כדי שלחיצה
  // שנייה על הכפתור לא תציף את כולם בשובר כפול.
  const targets = scoped.filter(r => r.email && r.center && (body.resend || !r.alreadySent))

  if (!targets.length) return NextResponse.json({ ok: true, sent: 0, failed: 0, note: 'אין למי לשלוח' })

  console.log(`[holiday-voucher] שולח ${targets.length} שוברים · ${staff.email ?? ''}`)

  let sent = 0, failed = 0
  const failures: { id: string; email: string; error: string }[] = []

  for (const t of targets) {
    try {
      const c = t.center!
      const pdf = await buildHolidayVoucher({
        familyName: t.familyName,
        centerLabel: c.city === c.name ? c.city : `${c.city} · ${c.name}`,
        centerAddress: c.address,
        centerHours: c.hours,
        centerPhone: c.phone,
        texts: HOLIDAY_VOUCHER_DEFAULTS,
      })

      const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"/></head>
<body style="direction:rtl;text-align:right;font-family:'Heebo',Arial,sans-serif;font-size:14px;line-height:1.7;color:#1e293b;">
<p>שלום וברכה,</p>
<p>מצורף שובר חלוקת החגים שלכם.</p>
<p><strong>מוקד החלוקה:</strong> ${c.city === c.name ? c.city : `${c.city} · ${c.name}`}
${c.hours ? `<br/><strong>ימים ושעות:</strong> ${c.hours}` : ''}
${c.address ? `<br/><strong>כתובת:</strong> ${c.address}` : ''}</p>
<p>יש להדפיס את השובר המצורף ולהביאו למוקד. לא ניתן לקבל את הכרטיס במוקד אחר.</p>
<p>בברכת חג כשר ושמח,<br/>איגוד הצאצאים · היכל החתם סופר</p>
</body></html>`

      const res = await deliverMail(
        t.email, 'שובר חלוקת חגים — היכל החתם סופר', html,
        [{ filename: 'שובר-חלוקת-חגים.pdf', mimeType: 'application/pdf', contentB64: Buffer.from(pdf).toString('base64') }],
        mailFor('holidays'),
      )

      if (res.ok) {
        sent++
        await db.from('distribution_recipients')
          .update({ email_sent_at: new Date().toISOString(), email_error: null }).eq('id', t.id)
      } else {
        failed++
        failures.push({ id: t.id, email: t.email, error: res.error ?? 'שליחה נכשלה' })
        await db.from('distribution_recipients')
          .update({ email_error: res.error ?? 'שליחה נכשלה' }).eq('id', t.id)
      }
    } catch (e) {
      failed++
      const msg = e instanceof Error ? e.message : 'תקלה'
      failures.push({ id: t.id, email: t.email, error: msg })
      // ⚠️ כשל באחד אינו מפיל את המנה — ממשיכים לשאר.
      await db.from('distribution_recipients').update({ email_error: msg }).eq('id', t.id)
    }

    await new Promise(r => setTimeout(r, 80))
  }

  console.log(`[holiday-voucher] הסתיים: ${sent} נשלחו · ${failed} נכשלו`)
  return NextResponse.json({ ok: true, sent, failed, failures: failures.slice(0, 20) })
}
