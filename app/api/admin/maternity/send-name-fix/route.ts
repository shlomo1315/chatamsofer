import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { signPublicToken } from '@/lib/publicToken'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { shell } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'

export const dynamic = 'force-dynamic'

// שליחת קישור ייחודי למייל היולדת לתיקון / השלמת שם התינוק.
// נשלח כשסומן "עדיין אין שם", או כשהוזן שם לא-תקין ורוצים שהיולדת תתקן במיידי.
// הקישור נושא טוקן HMAC חתום (kind='n', תקף 7 ימים) — היולדת מזינה שם והוא נקלט אוטומטית.
export async function POST(request: NextRequest) {
  await ensureEmailTexts()
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden()

  let body: { aidId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const { aidId } = body
  if (!aidId) return NextResponse.json({ error: 'חסר מזהה תיק' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  const { data: aid } = await admin
    .from('maternity_aids')
    .select('id, baby_name, beneficiary:beneficiaries(email, full_name, family_name, spouse_name)')
    .eq('id', aidId)
    .maybeSingle()
  if (!aid) return NextResponse.json({ error: 'התיק לא נמצא' }, { status: 404 })

  const ben = aid.beneficiary as { email?: string | null; full_name?: string | null; family_name?: string | null; spouse_name?: string | null } | null
  if (!ben?.email) return NextResponse.json({ error: 'אין כתובת מייל ליולדת' }, { status: 400 })

  const motherName = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || (ben.full_name ?? '')
  const token = signPublicToken('n', aidId)
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il'
  const link = `${base.replace(/\/$/, '')}/fix-name/${token}`

  const bodyHtml = `
    <p style="margin:0 0 14px;color:#0f172a;font-size:18px;font-weight:800;">שלום ${motherName},</p>
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">
      במערכת חסר שם תקין לתינוק שלכם. על מנת שנוכל להעביר את הבקשה שלכם לטיפול,
      עליכם להשלים את השם המדויק בלחיצה על הכפתור:
    </p>
    <div style="text-align:center;margin:0 0 18px;">
      <a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:16px;font-weight:800;text-decoration:none;border-radius:12px;padding:14px 32px;">
        הזנת שם התינוק
      </a>
    </div>
    <p style="margin:0;color:#94a3b8;font-size:12px;">הקישור אישי ותקף 7 ימים. אם לא ביקשתם — ניתן להתעלם.</p>
  `
  const html = shell({
    preheader: 'השלמת שם התינוק — היכל החתם סופר',
    accent: '#4f46e5', title: 'השלמת שם התינוק', subtitle: 'אגף עזר ליולדות · היכל החתם סופר', body: bodyHtml,
  })

  try {
    await deliverMail(ben.email, 'השלמת שם התינוק — היכל החתם סופר', html, [], mailFor('maternity'))
  } catch (e) {
    return NextResponse.json({ error: `שליחת המייל נכשלה: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }

  // שליחת קישור תיקון שם מסמנת שהתיק ממתין להשלמת/תיקון השם — כך הוא עובר בממשק
  // מ"ממתין לאישור" ל"ממתין לתיקונים", ויחזור אוטומטית כשהשם ייקלט (baby_name_pending=false).
  await admin.from('maternity_aids').update({ baby_name_pending: true, updated_at: new Date().toISOString() }).eq('id', aidId).then(undefined, () => {})

  // תיעוד בלוג
  try {
    await admin.from('activity_log').insert({
      user_id: staff.userId, action: 'maternity_name_fix_link_sent',
      entity_type: 'maternity_aid', entity_id: aidId, details: { email: ben.email },
    })
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, sentTo: ben.email })
}
