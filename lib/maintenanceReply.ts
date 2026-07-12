import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from './sendMail'
import { mailFor } from './departments'
import { shell } from './emailTemplates'

// ─────────────────────────────────────────────────────────────────────────────
// מענה אוטומטי זמני — "המערכת בפיתוח".
//
// נשלח למי ששולח מייל לתיבת המשרד ואינו מזוהה כמוטב במערכת, כדי שלא יישאר
// בלי מענה בתקופת ההרצה. מופעל/מכובה ממסך ההגדרות.
//
// ⚠️ הגנות קריטיות מפני לולאת מיילים:
//   1. לא עונים לכתובות של הארגון עצמו (אחרת נענה לעצמנו עד אינסוף)
//   2. לא עונים לכתובות אוטומטיות (noreply, mailer-daemon, postmaster...)
//   3. לא עונים למייל שכבר נושא כותרות של מענה אוטומטי
//   4. פעם אחת בלבד לכל כתובת (נרשם ב-app_settings)
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'maintenance_reply'
const SENT_KEY = 'maintenance_reply_sent'
const MAX_TRACKED = 5000

export interface MaintenanceReplySettings {
  enabled: boolean
  contactEmail: string
  message: string
  sentCount?: number
}

/** כתובות שלעולם לא עונים להן — מניעת לולאות. */
const NEVER_REPLY = [
  /@chasamsofer\./i,          // הארגון עצמו
  /^noreply@/i,
  /^no-reply@/i,
  /^donotreply@/i,
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^bounce/i,
  /^notifications?@/i,
  /^automated?@/i,
  /-noreply@/i,
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
    if (name === 'list-id' || name === 'list-unsubscribe') return true  // ניוזלטרים
  }
  return false
}

export async function getSettings(db: SupabaseClient): Promise<MaintenanceReplySettings | null> {
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle()
    if (!data?.value) return null
    const s = JSON.parse(String(data.value)) as MaintenanceReplySettings
    return s.enabled ? s : null
  } catch {
    return null
  }
}

/** כתובות שכבר קיבלו מענה — כדי לא להציף אותן. */
async function alreadyReplied(db: SupabaseClient, email: string): Promise<boolean> {
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', SENT_KEY).maybeSingle()
    const list: string[] = data?.value ? JSON.parse(String(data.value)) : []
    return list.includes(email.toLowerCase().trim())
  } catch {
    return false
  }
}

async function markReplied(db: SupabaseClient, email: string): Promise<void> {
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', SENT_KEY).maybeSingle()
    let list: string[] = data?.value ? JSON.parse(String(data.value)) : []

    list.push(email.toLowerCase().trim())
    if (list.length > MAX_TRACKED) list = list.slice(-MAX_TRACKED)

    await db.from('app_settings').upsert({
      key: SENT_KEY,
      value: JSON.stringify(list),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })

    // מונה לתצוגה בהגדרות
    const { data: cfg } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle()
    if (cfg?.value) {
      const s = JSON.parse(String(cfg.value)) as MaintenanceReplySettings
      s.sentCount = (s.sentCount ?? 0) + 1
      await db.from('app_settings').upsert({
        key: KEY,
        value: JSON.stringify(s),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
    }
  } catch (e) {
    console.error('[maintenance-reply] markReplied נכשל:', e)
  }
}

function buildEmail(settings: MaintenanceReplySettings) {
  const contact = settings.contactEmail
  const body = `
    <p style="margin:0 0 18px;color:#0f172a;font-size:16px;font-weight:700;">שלום וברכה,</p>

    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.9;">
      תודה על פנייתכם.
    </p>

    <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.9;">
      ${settings.message}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="background:#f8fafc;border-right:4px solid #6366f1;border-radius:8px;padding:16px 20px;">
        <p style="margin:0 0 6px;color:#334155;font-size:14px;font-weight:700;">
          בינתיים — לפניות דחופות
        </p>
        <p style="margin:0;color:#475569;font-size:14px;line-height:1.8;">
          נא לשלוח מייל לכתובת:<br/>
          <a href="mailto:${contact}" style="color:#4f46e5;font-weight:700;text-decoration:none;font-size:15px;">
            ${contact}
          </a>
        </p>
      </td></tr>
    </table>

    <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.7;">
      נשוב אליכם בהקדם. תודה על הסבלנות.
    </p>`

  return {
    subject: 'קיבלנו את פנייתכם · היכל החתם סופר',
    html: shell({
      preheader: settings.message.slice(0, 90),
      accent: '#6366f1',
      title: 'תודה על פנייתכם',
      subtitle: 'המערכת בהרצה',
      body,
    }),
  }
}

/**
 * שולח מענה אוטומטי אם צריך.
 * מחזיר true אם נשלח.
 */
export async function maybeSendMaintenanceReply(
  db: SupabaseClient,
  opts: {
    fromEmail: string
    beneficiaryId: string | null   // מזוהה במערכת? אז לא עונים
    headers?: unknown
  },
): Promise<boolean> {
  try {
    const settings = await getSettings(db)
    if (!settings) return false

    // מזוהה במערכת — מקבל מענה אנושי, לא אוטומטי
    if (opts.beneficiaryId) return false

    const email = (opts.fromEmail ?? '').toLowerCase().trim()
    if (shouldSkip(email)) return false
    if (isAutoSubmitted(opts.headers)) return false
    if (await alreadyReplied(db, email)) return false

    const mail = buildEmail(settings)
    const res = await deliverMail(email, mail.subject, mail.html, undefined, {
      ...mailFor('main'),
      // כותרת תקנית — מונעת מהצד השני לענות אוטומטית בחזרה (לולאה)
      tracking: false,
    })

    if (!res.ok) {
      console.error('[maintenance-reply] שליחה נכשלה:', res.error)
      return false
    }

    await markReplied(db, email)
    console.log(`[maintenance-reply] נשלח מענה אוטומטי אל ${email}`)
    return true
  } catch (e) {
    console.error('[maintenance-reply] threw:', e)
    return false
  }
}
