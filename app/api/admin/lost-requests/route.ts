import { NextResponse, type NextRequest } from 'next/server'
import { requireNonMailStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { detectReqType } from '@/lib/emailRequestForms'
import { handleEmailRequest } from '@/lib/emailRequestIntake'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// בקשות שהוגשו במייל ולא נקלטו.
//
// 🔴 הסיבה שהן קיימות: handleEmailRequest נקרא רק מ-webhook של Resend.
// בקשה שהגיעה לתיבת Gmail נשמרה כמייל ומעולם לא הפכה לבקשה. תוקן
// ב-legacyMailSync — אבל רק למיילים חדשים.
//
// 🔴 GET = רשימה בלבד. POST דורש confirm:true.
//
// ⚠️ ההרצה **שולחת מייל לכל פונה** (אישור, דחייה או בקשת השלמה) — זה
// חלק מהצינור. על בקשה מלפני חודש וחצי זה מייל מפתיע. לכן ברירת המחדל
// היא dryRun, וההרצה האמיתית דורשת אישור מפורש.
// ─────────────────────────────────────────────────────────────────────────────

interface MailRow {
  id: string
  subject: string | null
  from_email: string | null
  created_at: string
}

async function lostRequests(db: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { rows } = await fetchAllRows<MailRow>((from, to) => db
    .from('inbound_emails')
    .select('id, subject, from_email, created_at')
    .ilike('subject', '%בקש%')
    .order('created_at', { ascending: false })
    .range(from, to))

  // ⚠️ ייחוד לפי ת"ז + סוג: אותה בקשה נשמרת פעמיים (legacy + resend),
  // והרצה על שתיהן הייתה יוצרת בקשה כפולה.
  const seen = new Set<string>()
  const out: { id: string; idNumber: string; type: string; from: string; at: string; subject: string }[] = []

  for (const r of rows) {
    const subject = String(r.subject ?? '')
    const idNumber = subject.match(/\d{9}/)?.[0]
    if (!idNumber) continue
    const type = detectReqType(subject)
    if (!type) continue

    const key = `${idNumber}|${type}`
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      id: r.id, idNumber, type,
      from: (r.from_email ?? '').toLowerCase(),
      at: r.created_at,
      subject,
    })
  }

  // 🔴 סינון כפילויות — מי שכבר יש לו בקשה אינו נכלל.
  //
  // ⚠️ בלי זה הכלי היה יוצר בקשה שנייה לאותה משפחה ושולח לה מייל מיותר.
  // בבדיקה בפועל: מתוך 31 מיילי לידה, 18 כבר טופלו — יותר ממחצית.
  //
  // ⚠️ נבדקות *שתי* הטבלאות: maternity_requests (בקשה שנפתחה) וגם
  // maternity_aids (בקשה שכבר התקדמה). בדיקה על אחת בלבד הייתה מחמיצה
  // את מי שהבקשה שלו כבר עברה הלאה.
  const birthIds = out.filter(o => o.type === 'birth' || o.type === 'silent_birth').map(o => o.idNumber)
  if (birthIds.length) {
    const { data: bens } = await db.from('beneficiaries')
      .select('id, id_number, spouse_id_number')
      .or(`id_number.in.(${birthIds.join(',')}),spouse_id_number.in.(${birthIds.join(',')})`)

    const benByIdNum = new Map<string, string>()
    for (const b of (bens ?? []) as { id: string; id_number: string | null; spouse_id_number: string | null }[]) {
      if (b.id_number) benByIdNum.set(b.id_number, b.id)
      if (b.spouse_id_number) benByIdNum.set(b.spouse_id_number, b.id)
    }
    const benIds = [...new Set(benByIdNum.values())]

    const handled = new Set<string>()
    if (benIds.length) {
      const [{ data: reqs }, { data: aids }] = await Promise.all([
        db.from('maternity_requests').select('beneficiary_id').in('beneficiary_id', benIds),
        db.from('maternity_aids').select('beneficiary_id').in('beneficiary_id', benIds),
      ])
      for (const r of [...(reqs ?? []), ...(aids ?? [])] as { beneficiary_id: string | null }[]) {
        if (r.beneficiary_id) handled.add(r.beneficiary_id)
      }
    }

    return out.filter(o => {
      if (o.type !== 'birth' && o.type !== 'silent_birth') return true
      const benId = benByIdNum.get(o.idNumber)
      // ⚠️ מי שאינו במאגר כלל נשאר ברשימה: הצינור עצמו ידחה אותו
      // בהודעה מנומקת, וזה מידע שהמשפחה צריכה.
      return !benId || !handled.has(benId)
    })
  }

  return out
}

export async function GET() {
  const staff = await requireNonMailStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const candidates = await lostRequests(db)

  // מסננים את מי שכבר יש לו בקשה — הצינור עצמו יזהה זאת שוב, אבל
  // הרשימה למשתמש צריכה להראות רק את מה שבאמת חסר.
  const byType: Record<string, number> = {}
  for (const c of candidates) byType[c.type] = (byType[c.type] ?? 0) + 1

  return NextResponse.json({
    total: candidates.length,
    byType,
    // ⚠️ מוצגות 50 בלבד — הרשימה נועדה לאמת, לא להחליף את הטבלה.
    sample: candidates.slice(0, 50),
  })
}

export async function POST(request: NextRequest) {
  const staff = await requireNonMailStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as {
    confirm?: boolean; ids?: string[]; limit?: number
  }
  // 🔴 שער האישור — ההרצה שולחת מיילים אמיתיים.
  if (!body.confirm) {
    return NextResponse.json({ error: 'נדרש אישור מפורש — ההרצה שולחת מייל לכל פונה' }, { status: 400 })
  }

  const all = await lostRequests(db)
  const scoped = body.ids?.length ? all.filter(c => body.ids!.includes(c.id)) : all
  // ⚠️ מגבלה מפורשת: הרצה על עשרות מיילים בבת אחת חוטפת חסימת קצב.
  const targets = scoped.slice(0, Math.max(1, Math.min(body.limit ?? 20, 50)))

  console.warn(`[lost-requests] 🔴 מריץ קליטה על ${targets.length} בקשות · ${staff.email ?? ''}`)

  let ok = 0, failed = 0
  const errors: { id: string; error: string }[] = []

  for (const t of targets) {
    try {
      const { data: mail } = await db.from('inbound_emails')
        .select('html, plain_text').eq('id', t.id).maybeSingle()
      const m = mail as { html: string | null; plain_text: string | null } | null

      await handleEmailRequest(db, {
        fromEmail: t.from,
        subject: t.subject,
        body: m?.plain_text || m?.html || '',
        attachments: [],
      })
      ok++
    } catch (e) {
      failed++
      errors.push({ id: t.id, error: e instanceof Error ? e.message : 'תקלה' })
    }
    await new Promise(r => setTimeout(r, 200))
  }

  console.log(`[lost-requests] הסתיים: ${ok} עובדו · ${failed} נכשלו`)
  return NextResponse.json({ ok: true, processed: ok, failed, errors: errors.slice(0, 10), remaining: scoped.length - targets.length })
}
