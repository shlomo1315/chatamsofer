import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { docsPendingEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { getDocTypes } from '@/lib/serverDocTypes'
import { requirePermission, forbidden } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  await ensureEmailTexts()
  // 🔴 requirePermission ולא requireStaff: ה-handler כותב את החלטת הדחייה
  // (rejected_by / rejected_at / rejection_reason) על רשומת המוטב, ו-reason
  // הוא טקסט חופשי מהקורא. עם requireStaff כל איש צוות יכול היה לקבוע סיבת
  // דחייה על כל מוטב — וסיבה זו אף מוצגת למוטב במסך הזיהוי הציבורי
  // (portal/lookup). זהה לשאר נתיבי החלטות הזכאות.
  const staff = await requirePermission('beneficiaries', 'edit')
  if (!staff) return forbidden()

  const { id, status, reason, docsNotes } = await request.json()
  if (!id || !status) return NextResponse.json({ error: 'missing fields' }, { status: 400 })

  const client = getClient()

  // תיעוד דחייה: מי דחה (staff.userId) ומתי — כדי שבממשק תוצג הסיבה + שם הדוחה + המועד.
  // נעשה בשרת (יש כאן את זהות המשתמש), ולפני יציאה מוקדמת בענף rejected.
  if (status === 'rejected') {
    await client.from('beneficiaries').update({
      rejected_by: staff.userId,
      rejected_at: new Date().toISOString(),
      ...(typeof reason === 'string' && reason.trim() ? { rejection_reason: reason.trim() } : {}),
    }).eq('id', id).then(undefined, () => {})
  } else if (status === 'approved' || status === 'docs_pending') {
    // יציאה מדחייה — מנקים את חותמות הדחייה כדי שלא יישארו מוצגים
    await client.from('beneficiaries').update({ rejected_by: null, rejected_at: null }).eq('id', id).then(undefined, () => {})
  }
  const { data: ben, error } = await client
    .from('beneficiaries')
    .select('email, full_name, family_name, id_number, phone, city, marital_status, spouse_name, children_count, required_docs, lineage_fix_required, lineage_fix_note')
    .eq('id', id)
    .maybeSingle()

  if (error || !ben) return NextResponse.json({ error: 'beneficiary not found' }, { status: 404 })
  if (!ben.email) return NextResponse.json({ ok: true, skipped: 'no email' })

  // סטטוס "צאצא" (מאושר/נדחה) הוא מידע פנימי בלבד — לא שולחים עליו מייל לצאצא.
  // הצאצא יקבל מייל רק על בקשת סיוע ספציפית (לידה/הלוואה/סיוע), ומי שנדחה — יקבל
  // הודעת דחייה רק אם ינסה להגיש בקשה. "השלמת מסמכים" כן נשלח (דורש פעולה מצידו).
  let payload
  if (status === 'approved' || status === 'rejected') {
    return NextResponse.json({ ok: true, skipped: 'eligibility status is internal — no email' })
  } else if (status === 'docs_pending') {
    // רשימת המסמכים מהצ'קליסט שהמזכירות סימנה (נשמרה ב-required_docs), עם נפילה לפי מצב משפחתי
    const types = await getDocTypes()
    const labelOf = (k: string) => types.find(t => t.value === k)?.label ?? k
    const keys = (ben.required_docs ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)
    const labels = keys.map(labelOf)
    payload = docsPendingEmail(
      [ben.family_name, ben.full_name].filter(Boolean).join(' ') || ben.full_name,
      undefined, ben.marital_status, labels, docsNotes,
      ben.lineage_fix_required ? ben.lineage_fix_note : null,
    )
  } else {
    return NextResponse.json({ ok: true, skipped: 'no template for status' })
  }

  const result = await deliverMail(ben.email, payload.subject, payload.html, undefined, mailFor('igud'))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
