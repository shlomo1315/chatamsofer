import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { aidIdFromSignedToken } from '@/lib/publicToken'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { buildNameFixMail } from '@/lib/nameFixMail'
import { babiesOf, type AidNameFields } from '@/lib/babyNames'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 A7.3: חידוש קישור השלמת שם התינוק שפג — מתוך דף "הקישור אינו תקין".
//
// ⚠️ אבטחה, באותו דפוס של /api/public/lineage-review/renew:
//   • הקישור החדש נשלח *רק* למייל הרשום בתיק. הקורא אינו מזין כתובת.
//   • נדרש טוקן שחתימתו אמיתית (רק התוקף יכול להיות פג).
//   • תשובה זהה (ok) גם כשאין מה לשלוח, כדי לא להסגיר פרטי תיק.
//   • תיק שכבר אינו ממתין לשם לא מקבל קישור — אין מה להשלים.
//   • rate-limit לפי IP.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!rateLimit(`fix-name-renew:${clientIp(request)}`, 3, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב מאוחר יותר.' }, { status: 429 })
  }

  let body: { token?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const aidId = aidIdFromSignedToken(body.token, 'n')
  if (!aidId) return NextResponse.json({ error: 'הקישור אינו תקין' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: aid } = await admin
    .from('maternity_aids')
    .select('id, baby_name, baby_name_pending, babies, beneficiary:beneficiaries(email, full_name, family_name, spouse_name)')
    .eq('id', aidId)
    .maybeSingle()

  const ben = (aid?.beneficiary ?? null) as { email?: string | null; full_name?: string | null; family_name?: string | null; spouse_name?: string | null } | null
  if (!aid || !aid.baby_name_pending || !ben?.email) return NextResponse.json({ ok: true })

  await ensureEmailTexts()
  const motherName = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || (ben.full_name ?? '')
  const { subject, html } = buildNameFixMail({
    aidId,
    motherName,
    babyCount: babiesOf(aid as AidNameFields).length,
  })

  try {
    await deliverMail(ben.email, subject, html, [], mailFor('maternity'))
  } catch (e) {
    console.error('[fix-name/renew] שליחה נכשלה:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'שליחת המייל נכשלה' }, { status: 500 })
  }

  await logActivity(admin, {
    userId: null,
    action: 'maternity_name_fix_link_renewed',
    entityType: 'maternity_aid', entityId: aidId,
    details: { by: 'public_renew' },
  })

  return NextResponse.json({ ok: true })
}
