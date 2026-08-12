import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { checkInvite, INVITE_MESSAGE, type InviteRow } from '@/lib/distributionInvites'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// מימוש הזמנה חד-פעמית לרישום לחלוקת חגים.
//
// 🔴 הנתיב הזה עוקף במכוון את getOpenDistribution — הוא *נועד* לעבוד כשהרישום
// סגור. לכן כל ההגנה נשענת על הטוקן, ועליו בלבד:
//   · הטוקן נעול לחלוקה אחת ולמשפחה אחת (עמודות בטבלה, לא פרמטרים בבקשה)
//   · הוא חד-פעמי
//   · יש לו תפוגה
//
// ⚠️ אין כאן קריאת פרמטרים על *מי* להירשם. המשפחה נגזרת מהטוקן. אילו היה
// אפשר להעביר beneficiaryId בבקשה, כל מי שהחזיק טוקן אחד היה יכול לרשום כל
// משפחה במאגר.
//
// GET  — בדיקת תוקף להצגת הדף, בלי לנצל.
// POST — הרישום עצמו, שמנצל את הטוקן.
// ─────────────────────────────────────────────────────────────────────────────

const SELECT = 'token, distribution_id, beneficiary_id, expires_at, used_at, revoked_at'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  if (!token) return NextResponse.json({ ok: false, message: INVITE_MESSAGE['not-found'] }, { status: 400 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ ok: false, message: 'שגיאת שרת' }, { status: 500 })

  const { data } = await db.from('distribution_invites').select(SELECT).eq('token', token).maybeSingle()
  const verdict = checkInvite(data as InviteRow | null, new Date())
  if (!verdict.ok) {
    return NextResponse.json({ ok: false, reason: verdict.reason, message: INVITE_MESSAGE[verdict.reason] })
  }

  // פרטי תצוגה בלבד — שם המשפחה והחלוקה, כדי שהפותח יראה שהגיע למקום הנכון.
  const inv = data as InviteRow
  const [{ data: dist }, { data: ben }] = await Promise.all([
    db.from('distributions').select('id, name, year, amount_per_family').eq('id', inv.distribution_id).maybeSingle(),
    db.from('beneficiaries').select('id, full_name, family_name, spouse_name').eq('id', inv.beneficiary_id).maybeSingle(),
  ])
  const b = ben as { full_name?: string; family_name?: string; spouse_name?: string } | null
  return NextResponse.json({
    ok: true,
    distribution: dist,
    familyName: [b?.family_name, b?.full_name || b?.spouse_name].filter(Boolean).join(' ') || 'המשפחה',
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const token = String(body?.token ?? '')
  if (!token) return NextResponse.json({ ok: false, message: INVITE_MESSAGE['not-found'] }, { status: 400 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ ok: false, message: 'שגיאת שרת' }, { status: 500 })

  const { data: found } = await db.from('distribution_invites').select(SELECT).eq('token', token).maybeSingle()
  const verdict = checkInvite(found as InviteRow | null, new Date())
  if (!verdict.ok) {
    return NextResponse.json({ ok: false, reason: verdict.reason, message: INVITE_MESSAGE[verdict.reason] }, { status: 409 })
  }
  const inv = found as InviteRow

  // 🔴 הנעילה. עדכון מותנה על used_at is null, ורק מי שהשורה חזרה אליו זכה.
  //
  // ⚠️ זו הנקודה שבה "חד-פעמי" נשבר או מחזיק. בדיקה ואז כתיבה הייתה מאפשרת
  // לשתי לחיצות מקבילות — לחיצה כפולה, או קישור שנפתח בשני מכשירים — לעבור
  // שתיהן, וכל בדיקת התוקף שמעל הייתה חסרת ערך.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const { data: claimed } = await db.from('distribution_invites')
    .update({ used_at: new Date().toISOString(), used_ip: ip })
    .eq('token', token)
    .is('used_at', null)
    .select('token')
    .maybeSingle()
  if (!claimed) {
    return NextResponse.json({ ok: false, reason: 'used', message: INVITE_MESSAGE.used }, { status: 409 })
  }

  // מכאן הטוקן שלנו בלעדית. הרישום עצמו נעשה ישירות ולא דרך
  // registerToOpenDistribution — היא נגזרת מ-getOpenDistribution, ובדיוק
  // הבדיקה הזו היא מה שההזמנה נועדה לעקוף.
  try {
    const { data: existing } = await db.from('distribution_recipients')
      .select('id')
      .eq('distribution_id', inv.distribution_id)
      .eq('beneficiary_id', inv.beneficiary_id)
      .maybeSingle()

    let recipientId = (existing as { id?: string } | null)?.id ?? null
    let created = false

    if (!recipientId) {
      const { data: dist } = await db.from('distributions')
        .select('amount_per_family').eq('id', inv.distribution_id).maybeSingle()
      const { data: row, error } = await db.from('distribution_recipients').insert({
        distribution_id: inv.distribution_id,
        beneficiary_id: inv.beneficiary_id,
        source: 'admin',
        registered_at: new Date().toISOString(),
        amount: (dist as { amount_per_family?: number } | null)?.amount_per_family ?? null,
      }).select('id').single()
      if (error) throw new Error(error.message)
      recipientId = (row as { id: string }).id
      created = true
    }

    await db.from('distribution_invites')
      .update({ recipient_id: recipientId }).eq('token', token)

    await logActivity(db, {
      action: 'distribution_invite_redeemed',
      entityType: 'distribution_recipients',
      entityId: recipientId ?? undefined,
      details: { token, distributionId: inv.distribution_id, beneficiaryId: inv.beneficiary_id, created },
    }).catch(() => {})

    console.log(`[invite] מומש · dist=${inv.distribution_id} ben=${inv.beneficiary_id} created=${created}`)
    return NextResponse.json({ ok: true, created })
  } catch (e) {
    // ⚠️ הטוקן משוחרר בחזרה כשהרישום עצמו נכשל. בלי זה משפחה נשארת עם קישור
    // מנוצל ובלי רישום — המצב היחיד כאן שאין ממנו דרך חזרה בלי המשרד.
    await db.from('distribution_invites')
      .update({ used_at: null, used_ip: null }).eq('token', token).then(undefined, () => {})
    console.error('[invite] הרישום נכשל, הטוקן שוחרר:', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, message: 'הרישום נכשל. אנא נסו שוב או פנו למשרד.' }, { status: 500 })
  }
}
