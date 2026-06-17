import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { weeklyLoansReportEmail, type ReportLoanRow } from './emailTemplates'
import { deliverMail } from './sendMail'
import { LOAN_STATUS_LABELS } from '@/types'

const REPORT_EMAIL_KEY = 'loans_report_email'
const LAST_SENT_KEY = 'loans_report_last_sent'

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function portalUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
  return `${base}/shared/loans`
}

async function getSetting(admin: SupabaseClient, key: string): Promise<string> {
  const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle()
  return data?.value || ''
}

// כתיבה מפורשת שמחזירה שגיאה (כדי שה-UI יוכל להציג "טבלת app_settings חסרה" וכו')
async function setSetting(admin: SupabaseClient, key: string, value: string): Promise<void> {
  const { error } = await admin.from('app_settings').upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) throw new Error(error.message)
}

export async function getReportEmail(): Promise<string> {
  const admin = adminClient()
  if (!admin) return ''
  return getSetting(admin, REPORT_EMAIL_KEY)
}

export async function setReportEmail(email: string): Promise<void> {
  const admin = adminClient()
  if (!admin) throw new Error('Supabase not configured')
  await setSetting(admin, REPORT_EMAIL_KEY, email)
}

// איסוף נתוני הדוח: סטטיסטיקה כללית + רשימת ההלוואות החדשות מאז העדכון הקודם
async function collectReport(admin: SupabaseClient, sinceISO: string) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [pending, awaiting, disbursed, fresh] = await Promise.all([
    admin.from('loans').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('loans').select('id', { count: 'exact', head: true }).eq('status', 'approved').is('disbursed_at', null),
    admin.from('loans').select('id', { count: 'exact', head: true }).gte('disbursed_at', weekAgo),
    // ההלוואות שאושרו מאז השליחה הקודמת — אך ורק בסטטוס "מאושר"
    admin
      .from('loans')
      .select('id, amount, approved_amount, status, created_at, beneficiary:beneficiaries(full_name, family_name)')
      .eq('status', 'approved')
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false }),
  ])

  const newLoans: ReportLoanRow[] = (fresh.data ?? []).map((l) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = Array.isArray(l.beneficiary) ? l.beneficiary[0] : l.beneficiary
    const name = b ? ([b.family_name, b.full_name].filter(Boolean).join(' ') || b.full_name || '—') : '—'
    return {
      name,
      amount: Number(l.approved_amount ?? l.amount) || 0,
      statusLabel: LOAN_STATUS_LABELS[l.status as keyof typeof LOAN_STATUS_LABELS] ?? l.status,
      createdAt: l.created_at,
    }
  })

  return {
    pending: pending.count ?? 0,
    awaitingDisbursement: awaiting.count ?? 0,
    disbursedThisWeek: disbursed.count ?? 0,
    newLoans,
  }
}

interface RunOptions {
  // כתובת לעקיפה (לשליחת בדיקה לכתובת שהוקלדה לפני שמירה)
  to?: string
  // האם לקדם את חותמת "נשלח לאחרונה". בדיקה = false, שליחה אמיתית = true
  markSent?: boolean
}

// שליחת דוח ההלוואות. נקרא מהמתזמן (שבועי), מכפתור "שלח עכשיו" ומ"שלח בדיקה".
export async function runWeeklyLoansReport(opts: RunOptions = {}): Promise<{ sent: boolean; to?: string; count?: number; error?: string }> {
  const admin = adminClient()
  if (!admin) return { sent: false, error: 'Supabase לא מוגדר' }

  const to = (opts.to || '').trim() || await getReportEmail()
  if (!to) return { sent: false, error: 'לא הוגדרה כתובת מייל לדוח' }

  // "מאז העדכון הקודם" — או 7 ימים אחורה אם מעולם לא נשלח
  let since = ''
  try { since = await getSetting(admin, LAST_SENT_KEY) } catch { /* טבלה חסרה — נמשיך עם ברירת מחדל */ }
  const sinceISO = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  try {
    const report = await collectReport(admin, sinceISO)
    const { subject, html } = weeklyLoansReportEmail(report, portalUrl(), sinceISO)
    const res = await deliverMail(to, subject, html, undefined, { department: 'main' })
    if (!res.ok) return { sent: false, to, error: res.error }

    // קידום החותמת רק בשליחה אמיתית (ברירת מחדל) — לא בבדיקה
    if (opts.markSent !== false) {
      try { await setSetting(admin, LAST_SENT_KEY, new Date().toISOString()) } catch { /* לא חוסם */ }
    }
    return { sent: true, to, count: report.newLoans.length }
  } catch (e) {
    return { sent: false, to, error: e instanceof Error ? e.message : String(e) }
  }
}
