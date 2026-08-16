import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { getServiceClient } from '@/lib/apiAuth'
import { getOpenDistribution, registerToOpenDistribution } from '@/lib/holidayDistributions'
import { holidayRegisteredEmail, holidayAlreadyRegisteredEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { checkInvite, INVITE_MESSAGE, type InviteRow } from '@/lib/distributionInvites'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// רישום לחלוקת חגים מהממשק הדיגיטלי.
//
// ⚠️ הזיהוי הוא של הפורטל עצמו (ת"ז + קוד חד-פעמי): הרישום מקשר משפחה *קיימת*
// במאגר הצאצאים לחלוקה, ולא יוצר משפחה חדשה. לכן אין כאן קליטת פרטים כלל.
//
// GET — האם יש חלוקה פתוחה, והאם המשפחה הזו כבר רשומה (לתצוגת הכפתור).
// POST — רישום. רישום כפול מוחזר כהצלחה עם already=true, כדי שהמשתמש יקבל
// "אתם כבר רשומים" ולא הודעת שגיאה.
//
// ── קישור רישום עם תוקף (token) ───────────────────────────────────────────
// 🔴 קישור תקף פותח את הרישום *גם כשהוא סגור* — לחלוקה אחת, בערוץ הפורטל
// בלבד, ובתוך חלון הזמן שהוגדר לו.
//
// ⚠️ הקישור אינו חד-פעמי ואינו נעול למשפחה: קישור אחד נשלח לקבוצת משפחות,
// וכל אחת נרשמת דרכו. **הזמן הוא ההגבלה היחידה.**
//
// ⚠️ הוא אינו מחליף אימות. הזהות תמיד באה מעוגיית הפורטל (ת"ז + קוד חד-פעמי),
// וכל משפחה נרשמת כעצמה בלבד. הקישור מסיר את חסימת הסגירה, לא את הזיהוי —
// אחרת כל מי שהקישור הועבר אליו היה רושם משפחות שאינן שלו.
// ─────────────────────────────────────────────────────────────────────────────

const INVITE_COLS = 'token, distribution_id, expires_at, starts_at, revoked_at'

/**
 * החלוקה שהקישור פותח — או סיבת הדחייה.
 *
 * ⚠️ עוקף במכוון את getOpenDistribution: היא בודקת גם את מתג המחלקה וגם את
 * registration_open, ובדיוק את שתיהן הקישור נועד לעקוף. לכן כל ההגנה כאן
 * נשענת על התוקף של הקישור.
 */
async function resolveInvite(
  db: NonNullable<ReturnType<typeof getServiceClient>>,
  token: string,
): Promise<
  | { ok: true; invite: InviteRow; distribution: { id: string; name: string; year: string | null; amount_per_family: number | null } }
  | { ok: false; reason: string; message: string }
> {
  const { data } = await db.from('distribution_invites').select(INVITE_COLS).eq('token', token).maybeSingle()
  const verdict = checkInvite(data as InviteRow | null, new Date())
  if (!verdict.ok) return { ok: false, reason: verdict.reason, message: INVITE_MESSAGE[verdict.reason] }

  const invite = data as InviteRow
  const { data: dist } = await db.from('distributions')
    .select('id, name, year, amount_per_family').eq('id', invite.distribution_id).maybeSingle()
  // ⚠️ חלוקה שנמחקה מתחת לקישור — נאמר "אינו תקין" ולא ניפול על שגיאת שרת.
  if (!dist) return { ok: false, reason: 'not-found', message: INVITE_MESSAGE['not-found'] }

  return { ok: true, invite, distribution: dist as { id: string; name: string; year: string | null; amount_per_family: number | null } }
}

export async function GET(request: NextRequest) {
  await ensureEmailTexts()
  const params = new URL(request.url).searchParams
  const beneficiaryId = params.get('beneficiary_id')
  const token = params.get('token') ?? ''
  const sessionId = getPortalBeneficiaryId(request)
  const db = getServiceClient()

  // ── מסלול הקישור: נבדק לפני הסגירה, כי כל תכליתו לעקוף אותה ──
  // ⚠️ תקף גם למי שטרם התחבר: המסך צריך להציג את שם החלוקה ולבקש התחברות.
  // הזהות תידרש ב-POST, שם היא נאכפת.
  if (token && db) {
    const resolved = await resolveInvite(db, token)
    if (!resolved.ok) {
      return NextResponse.json(
        { open: false, invite: { ok: false, reason: resolved.reason, message: resolved.message } },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
    const { distribution } = resolved

    // האם המשפחה *המחוברת* כבר רשומה — רק אם יש מי שמחובר.
    let registered = false
    let registeredAt: string | null = null
    if (sessionId) {
      const { data } = await db.from('distribution_recipients')
        .select('id, registered_at').eq('distribution_id', distribution.id).eq('beneficiary_id', sessionId).maybeSingle()
      registered = !!data
      registeredAt = (data as { registered_at?: string | null } | null)?.registered_at ?? null
    }
    return NextResponse.json(
      {
        open: true,
        viaInvite: true,
        needsLogin: !sessionId,
        distribution: { id: distribution.id, name: distribution.name, year: distribution.year },
        registered,
        registeredAt,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const dist = await getOpenDistribution()
  if (!dist) return NextResponse.json({ open: false }, { headers: { 'Cache-Control': 'no-store' } })

  let registered = false
  let registeredAt: string | null = null
  if (beneficiaryId && sessionId === beneficiaryId) {
    if (db) {
      const { data } = await db.from('distribution_recipients')
        .select('id, registered_at').eq('distribution_id', dist.id).eq('beneficiary_id', beneficiaryId).maybeSingle()
      registered = !!data
      registeredAt = (data as { registered_at?: string | null } | null)?.registered_at ?? null
    }
  }
  return NextResponse.json(
    { open: true, distribution: { id: dist.id, name: dist.name, year: dist.year }, registered, registeredAt },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  await ensureEmailTexts()
  let body: { beneficiary_id?: string; token?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const beneficiaryId = String(body.beneficiary_id ?? '')
  if (!beneficiaryId) return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })

  // 🔴 האימות נדרש בשני המסלולים, גם עם טוקן. הטוקן מסיר את חסימת הסגירה —
  // הוא לעולם אינו מחליף את הזיהוי.
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId || sessionId !== beneficiaryId) {
    return NextResponse.json({ error: 'נדרש אימות מחדש' }, { status: 401 })
  }

  const db = getServiceClient()
  const token = String(body.token ?? '')

  // ── מסלול ההזמנה ──────────────────────────────────────────────────────────
  if (token) {
    if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    const result = await registerViaInvite(db, token, sessionId)
    return NextResponse.json(result.body, { status: result.status })
  }

  const result = await registerToOpenDistribution(beneficiaryId, 'portal')
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'הרישום נכשל' }, { status: 400 })

  // פרטי המשפחה — לשם ולמייל
  let name = ''
  let email: string | null = null
  if (db) {
    const { data: ben } = await db.from('beneficiaries')
      .select('email, full_name, family_name, spouse_name').eq('id', beneficiaryId).maybeSingle()
    const b = ben as { email?: string | null; full_name?: string | null; family_name?: string | null; spouse_name?: string | null } | null
    email = b?.email ?? null
    name = [b?.family_name, b?.full_name || b?.spouse_name].filter(Boolean).join(' ') || String(b?.full_name ?? '')
  }

  // ── כבר רשום: מייל "כבר נקלט" עם תאריך הרישום המקורי, בלי ליצור שורה נוספת ──
  if (!result.created) {
    if (email) {
      const payload = holidayAlreadyRegisteredEmail(name, { distribution: result.distribution?.name, registeredAt: result.registeredAt })
      try { await deliverMail(email, payload.subject, payload.html, undefined, mailFor('igud')) } catch { /* best-effort */ }
    }
    return NextResponse.json({
      ok: true, already: true,
      distribution: result.distribution?.name ?? null,
      registeredAt: result.registeredAt ?? null,
    })
  }

  // ── רישום חדש: אישור במייל ──
  // best-effort: הרישום כבר נשמר, וכשל בשליחה לא יבטל אותו. מתועד על השורה
  // (notified_at / notify_error) כדי שבמסך הניהול יהיה אפשר לראות למי לא יצא.
  let mailed = false
  let mailError: string | null = null
  if (db) {
    if (email) {
      const payload = holidayRegisteredEmail(name, { distribution: result.distribution?.name })
      try {
        const res = await deliverMail(email, payload.subject, payload.html, undefined, mailFor('igud'))
        mailed = res.ok
        if (!res.ok) mailError = res.error ?? 'שליחת המייל נכשלה'
      } catch (e) { mailError = e instanceof Error ? e.message : String(e) }
    } else {
      mailError = 'למשפחה אין כתובת מייל במערכת'
    }
    await db.from('distribution_recipients')
      .update({ notified_at: mailed ? new Date().toISOString() : null, notify_error: mailError })
      .eq('distribution_id', result.distribution!.id)
      .eq('beneficiary_id', beneficiaryId)
  }

  return NextResponse.json({
    ok: true, already: false, mailed,
    distribution: result.distribution?.name ?? null,
    registeredAt: result.registeredAt ?? null,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// רישום דרך קישור בעל תוקף.
//
// 🔴 המשפחה נלקחת מ-sessionId — מהעוגייה החתומה, אחרי ת"ז + קוד חד-פעמי —
// ולעולם לא מהקישור ולא מגוף הבקשה. הקישור משותף לכל מי שקיבל אותו, ולכן
// אילו הוא היה קובע את זהות הנרשם, כל מי שקיבל אותו בהעברה היה רושם משפחה
// שאינה שלו.
//
// ⚠️ אין כאן נעילה חד-פעמית, במכוון: הקישור נועד לשמש משפחות רבות. מה שמגן
// עליו הוא חלון הזמן שנבדק ב-resolveInvite, ותו לא.
// ─────────────────────────────────────────────────────────────────────────────
async function registerViaInvite(
  db: NonNullable<ReturnType<typeof getServiceClient>>,
  token: string,
  sessionId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const resolved = await resolveInvite(db, token)
  if (!resolved.ok) {
    return { status: 409, body: { error: resolved.message, reason: resolved.reason } }
  }
  const { distribution } = resolved

  // ⚠️ כבר רשומה — הצלחה עם already=true, בדיוק כמו במסלול הרגיל. משפחה
  // שלוחצת פעמיים צריכה לשמוע "אתם כבר רשומים" ולא הודעת שגיאה.
  const { data: existing } = await db.from('distribution_recipients')
    .select('id, registered_at').eq('distribution_id', distribution.id).eq('beneficiary_id', sessionId).maybeSingle()
  if (existing) {
    const reg = existing as { registered_at?: string | null }
    return {
      status: 200,
      body: { ok: true, already: true, viaInvite: true, distribution: distribution.name, registeredAt: reg.registered_at ?? null },
    }
  }

  // הרישום נעשה ישירות ולא דרך registerToOpenDistribution — היא נגזרת
  // מ-getOpenDistribution, ובדיוק הבדיקה הזו היא מה שהקישור נועד לעקוף.
  const now = new Date().toISOString()
  const { error } = await db.from('distribution_recipients').insert({
    distribution_id: distribution.id,
    beneficiary_id: sessionId,
    amount: distribution.amount_per_family ?? null,
    source: 'portal',
    registered_at: now,
    status: 'pending',
    // ⚠️ מתועד על השורה: בלי זה אי אפשר לדעת בדיעבד אילו רישומים נכנסו בזמן
    // שהרישום היה סגור — וזו בדיוק השאלה שתישאל.
    invite_token: token,
  })

  if (error) {
    // התנגשות באינדקס הייחודי = נרשמה במקביל בערוץ אחר. זו הצלחה, לא כשל.
    if (String((error as { code?: string }).code) === '23505') {
      const { data: race } = await db.from('distribution_recipients')
        .select('registered_at').eq('distribution_id', distribution.id).eq('beneficiary_id', sessionId).maybeSingle()
      return {
        status: 200,
        body: {
          ok: true, already: true, viaInvite: true, distribution: distribution.name,
          registeredAt: (race as { registered_at?: string | null } | null)?.registered_at ?? null,
        },
      }
    }
    console.error('[invite] הרישום נכשל:', error.message)
    return { status: 500, body: { error: 'הרישום נכשל. אנא נסו שוב או פנו למשרד.' } }
  }

  // מונה השימושים — למעקב בלבד, ולכן best-effort ואינו מעכב את התשובה.
  await db.rpc('increment_invite_use', { p_token: token }).then(undefined, () => {})

  console.log(`[invite] רישום · dist=${distribution.id} ben=${sessionId}`)

  // אישור במייל — best-effort, בדיוק כמו במסלול הרגיל.
  const mail = await sendRegistrationMail(db, sessionId, distribution.id, distribution.name)
  return {
    status: 200,
    body: { ok: true, already: false, viaInvite: true, mailed: mail.mailed, distribution: distribution.name, registeredAt: now },
  }
}

/** אישור הרישום במייל. best-effort — הרישום כבר נשמר וכשל בשליחה לא יבטל אותו. */
async function sendRegistrationMail(
  db: NonNullable<ReturnType<typeof getServiceClient>>,
  beneficiaryId: string,
  distributionId: string,
  distributionName: string | null,
): Promise<{ mailed: boolean }> {
  const { data: ben } = await db.from('beneficiaries')
    .select('email, full_name, family_name, spouse_name').eq('id', beneficiaryId).maybeSingle()
  const b = ben as { email?: string | null; full_name?: string | null; family_name?: string | null; spouse_name?: string | null } | null
  const email = b?.email ?? null
  const name = [b?.family_name, b?.full_name || b?.spouse_name].filter(Boolean).join(' ') || String(b?.full_name ?? '')

  let mailed = false
  let mailError: string | null = null
  if (email) {
    const payload = holidayRegisteredEmail(name, { distribution: distributionName ?? undefined })
    try {
      const res = await deliverMail(email, payload.subject, payload.html, undefined, mailFor('igud'))
      mailed = res.ok
      if (!res.ok) mailError = res.error ?? 'שליחת המייל נכשלה'
    } catch (e) { mailError = e instanceof Error ? e.message : String(e) }
  } else {
    mailError = 'למשפחה אין כתובת מייל במערכת'
  }
  await db.from('distribution_recipients')
    .update({ notified_at: mailed ? new Date().toISOString() : null, notify_error: mailError })
    .eq('distribution_id', distributionId)
    .eq('beneficiary_id', beneficiaryId)
  return { mailed }
}
