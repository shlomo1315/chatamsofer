import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from './sendMail'
import { mailFor, DEPARTMENTS, type DepartmentKey } from './departments'
import { shell } from './emailTemplates'

// ─────────────────────────────────────────────────────────────────────────────
// מענה אוטומטי per-mailbox — הודעה שנשלחת לכל מי שפונה לתיבה שהמענה האוטומטי
// שלה מופעל. לכל תיבה (מחלקה) מתג הפעלה + נוסח משלה, נערכים במסך ההגדרות.
//
// ⚠️ שינוי מהותי מהגרסה הקודמת:
//   • נשלח *בכל פנייה* כל עוד המענה מופעל לתיבה — גם למוטב רשום, וגם אם כבר
//     קיבל בעבר. אין יותר מגבלת "פעם אחת" ואין דילוג על מזוהים.
//   • הגדרה נפרדת לכל תיבה (map לפי DepartmentKey), לא הגדרה גלובלית אחת.
//
// ⚠️ הגנות קריטיות מפני לולאת מיילים — *נשמרות* (הן מונעות לולאה, לא כפילות):
//   1. לא עונים לכתובות של הארגון עצמו.
//   2. לא עונים לכתובות אוטומטיות (noreply, mailer-daemon...).
//   3. לא עונים למייל שכבר נושא כותרות של מענה אוטומטי.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'maintenance_reply'   // עכשיו מחזיק map: { [dept]: PerMailboxSettings }

export interface PerMailboxSettings {
  enabled: boolean
  message: string
  contactEmail?: string
}
// המפה השמורה: מפתח מחלקה → הגדרות. נשמר ב-app_settings תחת 'maintenance_reply'.
export type MaintenanceReplyMap = Partial<Record<DepartmentKey, PerMailboxSettings>>

// ברירת מחדל לכל תיבה — כבוי, נוסח ריק.
export function defaultMaintenanceMap(): MaintenanceReplyMap {
  const map: MaintenanceReplyMap = {}
  for (const d of Object.values(DEPARTMENTS)) map[d.key] = { enabled: false, message: '', contactEmail: d.email }
  return map
}

/** כתובות שלעולם לא עונים להן — מניעת לולאות. */
const NEVER_REPLY = [
  /@chasamsofer\./i, /^noreply@/i, /^no-reply@/i, /^donotreply@/i,
  /^mailer-daemon@/i, /^postmaster@/i, /^bounce/i, /^notifications?@/i,
  /^automated?@/i, /-noreply@/i,
]
function shouldSkip(email: string): boolean {
  const e = email.toLowerCase().trim()
  if (!e.includes('@')) return true
  return NEVER_REPLY.some(re => re.test(e))
}

/** האם המייל הנכנס הוא עצמו מענה אוטומטי (לפי כותרות תקניות). */
function isAutoSubmitted(headers: unknown): boolean {
  const list = Array.isArray(headers) ? headers : []
  for (const h of list) {
    const name = String((h as { name?: string })?.name ?? '').toLowerCase()
    const value = String((h as { value?: string })?.value ?? '').toLowerCase()
    if (name === 'auto-submitted' && value !== 'no') return true
    if (name === 'x-auto-response-suppress') return true
    if (name === 'precedence' && ['bulk', 'auto_reply', 'junk'].includes(value)) return true
    if (name === 'list-id' || name === 'list-unsubscribe') return true
  }
  return false
}

// קריאת מפת ההגדרות. תומך לאחור בפורמט הישן (object יחיד עם enabled/message)
// שממופה לתיבת 'main'.
export async function getMaintenanceMap(db: SupabaseClient): Promise<MaintenanceReplyMap> {
  const map = defaultMaintenanceMap()
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle()
    if (!data?.value) return map
    const parsed = JSON.parse(String(data.value)) as Record<string, unknown>
    // פורמט ישן: { enabled, message, contactEmail } → תיבת main
    if ('enabled' in parsed && typeof parsed.enabled === 'boolean') {
      map.main = {
        enabled: parsed.enabled as boolean,
        message: String(parsed.message ?? ''),
        contactEmail: String(parsed.contactEmail ?? map.main?.contactEmail ?? ''),
      }
      return map
    }
    // פורמט חדש: map לפי מחלקה
    for (const d of Object.values(DEPARTMENTS)) {
      const v = parsed[d.key] as PerMailboxSettings | undefined
      if (v && typeof v === 'object') {
        map[d.key] = {
          enabled: v.enabled === true,
          message: String(v.message ?? ''),
          contactEmail: String(v.contactEmail ?? d.email),
        }
      }
    }
  } catch { /* ברירת מחדל */ }
  return map
}

export async function saveMaintenanceMap(db: SupabaseClient, map: MaintenanceReplyMap): Promise<boolean> {
  const { error } = await db.from('app_settings').upsert({
    key: KEY, value: JSON.stringify(map), updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  return !error
}

function buildEmail(dept: DepartmentKey, settings: PerMailboxSettings) {
  const label = Object.values(DEPARTMENTS).find(d => d.key === dept)?.label ?? ''
  const contact = settings.contactEmail || ''
  const body = `
    <p style="margin:0 0 18px;color:#0f172a;font-size:16px;font-weight:700;">שלום וברכה,</p>
    <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.9;">${settings.message}</p>
    ${contact ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="background:#f8fafc;border-right:4px solid #6366f1;border-radius:8px;padding:16px 20px;">
        <p style="margin:0 0 6px;color:#334155;font-size:14px;font-weight:700;">בינתיים — לפניות דחופות</p>
        <p style="margin:0;color:#475569;font-size:14px;line-height:1.8;">
          נא לשלוח מייל לכתובת:<br/>
          <a href="mailto:${contact}" style="color:#4f46e5;font-weight:700;text-decoration:none;font-size:15px;">${contact}</a>
        </p>
      </td></tr>
    </table>` : ''}
    <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.7;">נשוב אליכם בהקדם. תודה על הסבלנות.</p>`
  return {
    subject: 'קיבלנו את פנייתכם · היכל החתם סופר',
    html: shell({
      preheader: settings.message.slice(0, 90),
      accent: '#6366f1',
      title: 'תודה על פנייתכם',
      subtitle: label || 'היכל החתם סופר',
      body,
    }),
  }
}

/**
 * שולח מענה אוטומטי per-mailbox אם מופעל לתיבה שאליה הגיע המייל.
 * ⚠️ נשלח *תמיד* כשמופעל — גם למוטב רשום וגם אם כבר קיבל. מחזיר true אם נשלח.
 */
export async function maybeSendMaintenanceReply(
  db: SupabaseClient,
  opts: {
    fromEmail: string
    department?: DepartmentKey | null   // התיבה שאליה הגיע המייל
    headers?: unknown
  },
): Promise<boolean> {
  try {
    const dept = (opts.department ?? 'main') as DepartmentKey
    const map = await getMaintenanceMap(db)
    const settings = map[dept]
    if (!settings?.enabled || !settings.message.trim()) return false

    const email = (opts.fromEmail ?? '').toLowerCase().trim()
    // ⚠️ ההגנות מפני לולאה נשארות — הן קריטיות, לא קשורות ל"פעם אחת".
    if (shouldSkip(email)) return false
    if (isAutoSubmitted(opts.headers)) return false

    const mail = buildEmail(dept, settings)
    const res = await deliverMail(email, mail.subject, mail.html, undefined, {
      ...mailFor(dept),
      tracking: false,
    })
    if (!res.ok) {
      console.error('[maintenance-reply] שליחה נכשלה:', res.error)
      return false
    }
    console.log(`[maintenance-reply] נשלח מענה (${dept}) אל ${email}`)
    return true
  } catch (e) {
    console.error('[maintenance-reply] threw:', e)
    return false
  }
}
