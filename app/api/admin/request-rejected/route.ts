import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, requirePermission, forbidden } from '@/lib/apiAuth'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { birthRejectedEmail, loanRejectedEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// נקרא כאשר המזכיר דוחה בקשת לידה (סטטוס 'cancelled') עם סיבה:
// שולח ליולדת מייל מעוצב "בקשת הלידה נדחתה" עם הסיבה שהוזנה.
// (הפנייה היא ליולדת — האשה — לפי מוסכמת המיילים של עזר יולדות.)
export async function POST(request: NextRequest) {
  await ensureEmailTexts()
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  let body: { id?: string; reason?: string; type?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  const id = String(body.id ?? '')
  const reason = String(body.reason ?? '').trim()
  // ⚠️ ברירת המחדל היא 'birth' — הנתיב שירת לידות בלבד, ולקוח ישן
  // שאינו שולח type חייב להמשיך לעבוד בדיוק כמו קודם.
  const type = body.type === 'loan' ? 'loan' : 'birth'
  if (!id) return NextResponse.json({ error: 'פרמטרים חסרים' }, { status: 400 })

  // ⚠️ ההרשאה נבדקת מול המחלקה שממנה נשלחת הדחייה, לא באופן גורף.
  if (!(await requirePermission(type === 'loan' ? 'loans' : 'maternity', 'edit'))) return forbidden()

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 דחיית הלוואה — עד כה לא נשלח דבר.
  //
  // סיבת הדחייה נשמרה במערכת בלבד, והמבקש לא ידע שבקשתו נדחתה וגם לא מדוע.
  // אישור הלוואה כן שלח מייל, ולכן מי שנדחה פשוט לא שמע יותר — והמשרד קיבל
  // פניות חוזרות "מה קרה עם הבקשה שלי".
  // ─────────────────────────────────────────────────────────────────────────
  if (type === 'loan') {
    const { data: loan, error: loanErr } = await admin
      .from('loans')
      .select('id, beneficiary:beneficiaries(email, family_name, full_name, marital_status)')
      .eq('id', id)
      .maybeSingle()
    if (loanErr || !loan) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })

    // ⚠️ PostgREST מחזיר לעתים אובייקט ולעתים מערך בן-איבר — ראו
    // supabase-join-array-or-object.
    const raw = (loan as unknown as Record<string, unknown>).beneficiary
    const b = (Array.isArray(raw) ? raw[0] : raw) as {
      email?: string | null; family_name?: string | null
      full_name?: string | null; marital_status?: string | null
    } | null

    const to = b?.email?.trim()
    // אין כתובת — הדחייה כבר נשמרה, פשוט אין למי לשלוח.
    if (!to) return NextResponse.json({ ok: true, sent: false, reason: 'no-email' })

    const mail = loanRejectedEmail({
      family_name: b?.family_name, full_name: b?.full_name,
      marital_status: b?.marital_status, reason,
    })
    try {
      // ⚠️ מחלקת הגמ"ח ולא המשרד הראשי — התשובות צריכות להגיע לתיבה שמטפלת
      // בהלוואות. ראו mail-department-fallback-bug.
      const sent = await deliverMail(to, mail.subject, mail.html, undefined, mailFor('gemach'))
      if (!sent.ok) {
        console.error('[request-rejected] loan mail failed:', sent.error)
        return NextResponse.json({ ok: true, sent: false })
      }
    } catch (e) {
      console.error('[request-rejected] loan mail threw:', e)
      return NextResponse.json({ ok: true, sent: false })
    }
    return NextResponse.json({ ok: true, sent: true })
  }

  const { data: aid, error } = await admin
    .from('maternity_aids')
    .select('id, beneficiary:beneficiaries(email, family_name, full_name, spouse_name)')
    .eq('id', id)
    .maybeSingle()

  if (error || !aid) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })

  const benRaw = (aid as unknown as Record<string, unknown>).beneficiary
  const ben = (Array.isArray(benRaw) ? benRaw[0] : benRaw) as {
    email?: string | null; family_name?: string | null; full_name?: string | null; spouse_name?: string | null
  } | null

  const email = ben?.email?.trim()
  if (!email) {
    // אין כתובת מייל ליולדת — הדחייה עצמה כבר נשמרה, רק אין למי לשלוח.
    return NextResponse.json({ ok: true, sent: false, reason: 'no-email' })
  }

  const mail = birthRejectedEmail({
    family_name: ben?.family_name,
    mother_name: ben?.spouse_name || ben?.full_name,
    reason,
  })

  try {
    const sent = await deliverMail(email, mail.subject, mail.html, undefined, mailFor('maternity'))
    if (!sent.ok) {
      console.error('[request-rejected] mail failed:', sent.error)
      return NextResponse.json({ ok: true, sent: false })
    }
  } catch (e) {
    console.error('[request-rejected] mail threw:', e)
    return NextResponse.json({ ok: true, sent: false })
  }

  return NextResponse.json({ ok: true, sent: true })
}
