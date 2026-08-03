import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { getNedarimCreds } from '@/lib/nedarim'
import { unloadAidCard, type UnloadableAid } from '@/lib/unloadExpired'
import { birthApprovalRetractedEmail } from '@/lib/emailTemplates'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'

export const dynamic = 'force-dynamic'

function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ─────────────────────────────────────────────────────────────────────────────
// ביטול טעינה של תיק יולדת.
//
// ⚠️ הפער שזה סוגר: טעינה שבוצעה נשארה בתוקף לנצח. ברגע ששינו את סטטוס הלידה
// ל"לא מאושר" (או חזרה ל"ממתין"), הכסף נשאר בכרטיס — כלומר בקשה שנדחתה
// המשיכה להיות ממומנת, ואיש לא ידע. עכשיו שינוי הסטטוס פורק את הטעינה בנדרים,
// מאפס את היתרה, מנתק את הכרטיס המגנטי מהמשפחה והכל מתועד ביומן הפעילות.
//
// ההרשאה זהה לזו של הטעינה עצמה (maternity/edit) — מי שיכול לאשר לידה יכול
// לבטל את הטעינה שנגררה ממנה.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden()

  let body: { aidId?: string; reason?: string; rejected?: boolean; notify?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const aidId = String(body.aidId ?? '')
  if (!aidId) return NextResponse.json({ error: 'חסר מזהה תיק' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  const { data: aid } = await admin
    .from('maternity_aids')
    .select('id, card_load_status, card_tlush_id, card_number, card_load_amount, card_loaded_at, beneficiary:beneficiaries(nedarim_id, email, full_name, family_name, spouse_name)')
    .eq('id', aidId)
    .maybeSingle()
  if (!aid) return NextResponse.json({ error: 'התיק לא נמצא' }, { status: 404 })

  // אין טעינה חיה — אין מה לבטל. לא שגיאה: המסך קורא לכאן בכל שינוי סטטוס.
  if (aid.card_load_status !== 'loaded' || !aid.card_tlush_id) {
    return NextResponse.json({ ok: true, unloaded: false, reason: 'no_active_load' })
  }

  const creds = await getNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'חיבור נדרים פלוס לא מוגדר' }, { status: 500 })

  try {
    // ⚠️ returnToStock: true — הניכוי מהמלאי נעשה ברגע הטעינה, וביטול הטעינה
    // משחרר את הכרטיס. עד כה הוא נבלע והמלאי הראה פחות ממה שהיה בפועל. להבדיל
    // מהפריקה בתום שישה שבועות, שם הכרטיס נוצל וירד מהמלאי בצדק.
    const r = await unloadAidCard(admin, creds, aid as unknown as UnloadableAid,
      body.reason?.trim() || 'ביטול טעינה בעקבות שינוי סטטוס הלידה', { returnToStock: true })
    if (!r.ok) return NextResponse.json({ ok: false, error: r.message || 'פריקת הטעינה נכשלה' }, { status: 502 })
    const stockReturned = true

    // ── מייל תיקון ליולדת ──
    // ⚠️ המשפחה קיבלה מייל אישור וציפתה לכרטיס טעון. בלי הודעת תיקון מפורשת
    // הפער מתגלה רק בקופה בחנות. נשלח כברירת מחדל; notify:false מדלג.
    let mailed = false
    let mailError: string | null = null
    const ben = aid.beneficiary as { email?: string | null; full_name?: string | null; family_name?: string | null; spouse_name?: string | null } | null
    if (body.notify !== false) {
      if (ben?.email) {
        const motherName = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || String(ben.full_name ?? '')
        const payload = birthApprovalRetractedEmail(motherName, { rejected: body.rejected === true })
        try {
          const res = await deliverMail(ben.email, payload.subject, payload.html, undefined, mailFor('maternity'))
          mailed = res.ok
          if (!res.ok) mailError = res.error ?? 'שליחת המייל נכשלה'
        } catch (e) { mailError = e instanceof Error ? e.message : String(e) }
      } else {
        mailError = 'למשפחה אין כתובת מייל במערכת'
      }
    }

    return NextResponse.json({ ok: true, unloaded: true, amount: aid.card_load_amount ?? null, mailed, mailError, stockReturned })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
