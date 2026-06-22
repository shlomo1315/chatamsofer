import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

type Tone = 'pending' | 'progress' | 'approved' | 'rejected'
const LOAN: Record<string, [string, Tone]> = {
  pending: ['ממתינה לאישור', 'pending'], approved: ['אושרה', 'approved'], active: ['פעילה', 'approved'],
  completed: ['הושלמה', 'approved'], rejected: ['נדחתה', 'rejected'], defaulted: ['בפיגור', 'rejected'],
}
const MATERNITY: Record<string, [string, Tone]> = {
  pending: ['ממתינה לאישור', 'pending'], active: ['אושרה', 'approved'], completed: ['הושלמה', 'approved'], cancelled: ['בוטלה', 'rejected'],
}
const FINAID: Record<string, [string, Tone]> = {
  pending: ['ממתינה לטיפול', 'pending'], awaiting_decision: ['בבדיקת הגורם המאשר', 'progress'], approved: ['אושרה', 'approved'], rejected: ['נדחתה', 'rejected'],
}
const WIDOW: Record<string, [string, Tone]> = {
  pending: ['ממתינה לטיפול', 'pending'], in_progress: ['בטיפול', 'progress'], approved: ['אושרה', 'approved'], rejected: ['נדחתה', 'rejected'],
}
const fb = (m: Record<string, [string, Tone]>, s: string): [string, Tone] => m[s] ?? [s, 'pending']

const TONE_COLOR: Record<Tone, string> = { pending: '#b45309', progress: '#1d4ed8', approved: '#15803d', rejected: '#b91c1c' }
const TONE_BG: Record<Tone, string> = { pending: '#fffbeb', progress: '#eff6ff', approved: '#f0fdf4', rejected: '#fef2f2' }

function maskEmail(e: string): string {
  const [u, d] = e.split('@')
  if (!d) return e
  const masked = u.length <= 2 ? `${u[0]}*` : `${u[0]}${'*'.repeat(Math.max(1, u.length - 2))}${u[u.length - 1]}`
  return `${masked}@${d}`
}

// שולח למוטב (לכתובת הרשומה במערכת) מייל עם סטטוס כל בקשותיו. דורש סשן פורטל תקף.
export async function POST(request: NextRequest) {
  let body: { beneficiary_id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const beneficiaryId = body.beneficiary_id
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  // אימות סשן הפורטל — מותר רק למוטב שאותר בסשן הנוכחי
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId || sessionId !== beneficiaryId) {
    return NextResponse.json({ error: 'נדרש אימות מחדש — נא לבצע כניסה מחדש לפורטל' }, { status: 401 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: ben } = await admin.from('beneficiaries').select('full_name, family_name, email').eq('id', beneficiaryId).maybeSingle()
  if (!ben) return NextResponse.json({ error: 'מוטב לא נמצא' }, { status: 404 })
  if (!ben.email) {
    return NextResponse.json({ error: 'אין כתובת מייל מעודכנת במערכת על שמך. אנא פנה למשרד לעדכון פרטים.' }, { status: 400 })
  }

  const [loans, maternity, finaid, widow] = await Promise.all([
    admin.from('loans').select('id, status, amount, approved_amount, created_at').eq('beneficiary_id', beneficiaryId),
    admin.from('maternity_aids').select('id, status, created_at').eq('beneficiary_id', beneficiaryId),
    admin.from('financial_aid_requests').select('id, status, amount, created_at').eq('beneficiary_id', beneficiaryId),
    admin.from('widow_requests').select('id, status, amount, created_at').eq('beneficiary_id', beneficiaryId),
  ])

  type Row = { label: string; date: string; amount: number | null; statusLabel: string; tone: Tone }
  const rows: Row[] = []
  for (const l of loans.data ?? []) { const [statusLabel, tone] = fb(LOAN, l.status); rows.push({ label: 'בקשת הלוואה', date: l.created_at, amount: (l.approved_amount ?? l.amount) ?? null, statusLabel, tone }) }
  for (const m of maternity.data ?? []) { const [statusLabel, tone] = fb(MATERNITY, m.status); rows.push({ label: 'בקשת הבראה ליולדת', date: m.created_at, amount: null, statusLabel, tone }) }
  for (const f of finaid.data ?? []) { const [statusLabel, tone] = fb(FINAID, f.status); rows.push({ label: 'בקשת סיוע רפואי', date: f.created_at, amount: f.status === 'approved' ? (f.amount ?? null) : null, statusLabel, tone }) }
  for (const w of widow.data ?? []) { const [statusLabel, tone] = fb(WIDOW, w.status); rows.push({ label: 'בקשת סיוע', date: w.created_at, amount: w.amount ?? null, statusLabel, tone }) }
  rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString('he-IL') } catch { return '' } }
  const fmtAmt = (n: number | null) => (n != null ? `₪${Number(n).toLocaleString('he-IL')}` : '—')

  const rowsHtml = rows.length === 0
    ? `<tr><td colspan="4" style="padding:18px;text-align:center;color:#94a3b8;">לא נמצאו בקשות הרשומות על שמך כרגע.</td></tr>`
    : rows.map(r => `
      <tr style="border-top:1px solid #e2e8f0;">
        <td style="padding:11px 14px;font-weight:600;color:#0f172a;">${r.label}</td>
        <td style="padding:11px 14px;color:#64748b;white-space:nowrap;">${fmtDate(r.date)}</td>
        <td style="padding:11px 14px;color:#334155;white-space:nowrap;">${fmtAmt(r.amount)}</td>
        <td style="padding:11px 14px;white-space:nowrap;"><span style="display:inline-block;padding:3px 11px;border-radius:999px;font-size:12px;font-weight:700;color:${TONE_COLOR[r.tone]};background:${TONE_BG[r.tone]};">${r.statusLabel}</span></td>
      </tr>`).join('')

  const html = `
    <div style="direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.6;max-width:600px;">
      <h2 style="margin:0 0 4px;color:#0f172a;font-size:20px;">שלום ${ben.full_name ?? ''},</h2>
      <p style="margin:0 0 16px;color:#475569;">להלן סטטוס הבקשות הרשומות במערכת על שמך:</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;border-collapse:separate;overflow:hidden;">
        <thead><tr style="background:#f8fafc;color:#64748b;font-size:12px;">
          <th style="padding:11px 14px;text-align:right;font-weight:700;">בקשה</th>
          <th style="padding:11px 14px;text-align:right;font-weight:700;">תאריך</th>
          <th style="padding:11px 14px;text-align:right;font-weight:700;">סכום</th>
          <th style="padding:11px 14px;text-align:right;font-weight:700;">סטטוס</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="margin:18px 0 0;color:#94a3b8;font-size:12px;">מייל זה נשלח לבקשתך מהאזור האישי בפורטל. לשאלות ניתן להשיב להודעה זו.</p>
    </div>`

  const result = await deliverMail(ben.email, 'סטטוס הבקשות שלך — היכל החתם סופר', html, undefined, mailFor('main'))
  if (!result.ok) return NextResponse.json({ error: 'שליחת המייל נכשלה. נסה שוב מאוחר יותר.' }, { status: 500 })

  return NextResponse.json({ ok: true, email: maskEmail(ben.email) }, { headers: { 'Cache-Control': 'no-store' } })
}
