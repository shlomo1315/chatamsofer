import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { weeklyLoansReportEmail } from './emailTemplates'
import { deliverMail } from './sendMail'

const REPORT_EMAIL_KEY = 'loans_report_email'

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

export async function getReportEmail(): Promise<string> {
  const admin = adminClient()
  if (!admin) return ''
  const { data } = await admin.from('app_settings').select('value').eq('key', REPORT_EMAIL_KEY).single()
  return data?.value || ''
}

export async function setReportEmail(email: string): Promise<void> {
  const admin = adminClient()
  if (!admin) throw new Error('Supabase not configured')
  await admin.from('app_settings').upsert(
    { key: REPORT_EMAIL_KEY, value: email, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
}

// איסוף נתוני הדוח: ממתינות לאישור, מאושרות לביצוע, בוצעו בשבוע האחרון
async function collectStats(admin: SupabaseClient) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [pending, awaiting, disbursed] = await Promise.all([
    admin.from('loans').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('loans').select('id', { count: 'exact', head: true }).eq('status', 'approved').is('disbursed_at', null),
    admin.from('loans').select('id', { count: 'exact', head: true }).gte('disbursed_at', weekAgo),
  ])

  return {
    pending: pending.count ?? 0,
    awaitingDisbursement: awaiting.count ?? 0,
    disbursedThisWeek: disbursed.count ?? 0,
  }
}

// שליחת הדוח השבועי לכתובת שמוגדרת בהגדרות. נקרא מהמתזמן (instrumentation) ומ-API ידני.
export async function runWeeklyLoansReport(): Promise<{ sent: boolean; to?: string; error?: string }> {
  const admin = adminClient()
  if (!admin) return { sent: false, error: 'no admin client' }

  const to = await getReportEmail()
  if (!to) return { sent: false, error: 'no report email configured' }

  try {
    const stats = await collectStats(admin)
    const { subject, html } = weeklyLoansReportEmail(stats, portalUrl())
    const res = await deliverMail(to, subject, html, undefined, { department: 'main' })
    if (!res.ok) return { sent: false, to, error: res.error }
    return { sent: true, to }
  } catch (e) {
    return { sent: false, to, error: e instanceof Error ? e.message : String(e) }
  }
}
