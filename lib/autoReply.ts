import { createClient } from '@supabase/supabase-js'
import { getGmailClient, sendGmailMessage, ensureLabel } from '@/lib/gmail'
import { existingContactEmail, registrationInviteEmail } from '@/lib/emailTemplates'

const AUTO_LABEL = 'Auto-Replied'
const MAX_PER_RUN = 25

export interface AutoReplyResult {
  ok: boolean
  dry: boolean
  scanned: number
  replied: number
  skipped: number
  plan?: { from: string; action: string }[]
  error?: string
}

function getAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getHeader(headers: any[], name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function extractEmail(from: string): string {
  const m = from.match(/<(.+?)>/)
  return (m ? m[1] : from).trim().toLowerCase()
}

// פונה אוטומטי / רשימת תפוצה — לא נשלח אליו מענה אוטומטי (מניעת לולאות)
function isAutomatedSender(fromEmail: string): boolean {
  return /(^|[._-])(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce|bounces|notifications?|newsletter|mailer|auto)/i.test(fromEmail)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAutomatedHeaders(headers: any[]): boolean {
  if (getHeader(headers, 'list-id')) return true
  const prec = getHeader(headers, 'precedence').toLowerCase()
  if (['bulk', 'list', 'junk'].includes(prec)) return true
  const autoSub = getHeader(headers, 'auto-submitted').toLowerCase()
  if (autoSub && autoSub !== 'no') return true
  return false
}

// מונע הרצות חופפות (חשוב למתזמן הפנימי)
let running = false

// סורק את תיבת המשרד ומשיב אוטומטית לפונים — נתמך קיים מקבל מייל עם פרטיו וכפתורים,
// פונה שאינו רשום מקבל הזמנה להרשמה. dry=true מדמה בלבד ללא שליחה/סימון.
export async function runAutoReply(opts: { dry?: boolean } = {}): Promise<AutoReplyResult> {
  const dry = !!opts.dry
  if (running) return { ok: false, dry, scanned: 0, replied: 0, skipped: 0, error: 'כבר רץ' }
  running = true
  try {
    const db = getAdminDb()
    if (!db) return { ok: false, dry, scanned: 0, replied: 0, skipped: 0, error: 'Supabase לא מוגדר' }

    const portalBase = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chasamsofer.co.il').replace(/\/$/, '')
    const officeEmail = (process.env.GMAIL_EMAIL ?? 'office@chasamsofer.info').toLowerCase()

    let gmail
    try {
      gmail = await getGmailClient()
    } catch {
      return { ok: false, dry, scanned: 0, replied: 0, skipped: 0, error: 'Gmail לא מחובר' }
    }

    const labelId = await ensureLabel(gmail, AUTO_LABEL)

    // הודעות נכנסות חדשות שטרם נענו אוטומטית
    const list = await gmail.users.messages.list({
      userId: 'me',
      maxResults: MAX_PER_RUN,
      q: `in:inbox newer_than:2d -label:"${AUTO_LABEL}"`,
    })
    const ids = list.data.messages ?? []

    let replied = 0, skipped = 0
    const seenSenders = new Set<string>()
    const plan: { from: string; action: string }[] = []

    for (const ref of ids) {
      try {
        const msg = await gmail.users.messages.get({ userId: 'me', id: ref.id!, format: 'metadata',
          metadataHeaders: ['From', 'List-Id', 'Precedence', 'Auto-Submitted'] })
        const headers = msg.data.payload?.headers ?? []
        const fromEmail = extractEmail(getHeader(headers, 'from'))
        const threadId = msg.data.threadId ?? undefined

        // סינונים — מניעת לולאות ומענה לאוטומציות
        const skip =
          !fromEmail ||
          fromEmail === officeEmail ||
          isAutomatedSender(fromEmail) ||
          isAutomatedHeaders(headers) ||
          seenSenders.has(fromEmail)

        if (skip) {
          if (dry) { plan.push({ from: fromEmail || '(ריק)', action: 'דילוג' }); skipped++; continue }
          await gmail.users.messages.modify({ userId: 'me', id: ref.id!, requestBody: { addLabelIds: [labelId] } })
          skipped++
          continue
        }
        seenSenders.add(fromEmail)

        // חיפוש הפונה בכרטסת הנתמכים לפי כתובת מייל מדויקת
        const { data: rows } = await db
          .from('beneficiaries')
          .select('full_name, family_name, eligibility_status, id_number, phone, city, marital_status, children_count')
          .eq('email', fromEmail)
          .limit(1)
        const ben = rows?.[0]

        if (dry) {
          plan.push({ from: fromEmail, action: ben ? 'מענה לנתמך קיים' : 'הזמנה להרשמה' })
          replied++
          continue
        }

        const email = ben
          ? existingContactEmail({
              name: [ben.family_name, ben.full_name].filter(Boolean).join(' ') || fromEmail,
              eligibility_status: ben.eligibility_status,
              id_number: ben.id_number,
              phone: ben.phone,
              city: ben.city,
              marital_status: ben.marital_status,
              children_count: ben.children_count,
            }, portalBase)
          : registrationInviteEmail(portalBase)

        // מסמנים תחילה כמטופל (מניעת כפילויות), ואז שולחים. אם השליחה נכשלה — מסירים את התווית כדי לנסות שוב.
        await gmail.users.messages.modify({ userId: 'me', id: ref.id!, requestBody: { addLabelIds: [labelId] } })
        try {
          await sendGmailMessage(gmail, { to: fromEmail, subject: email.subject, html: email.html, threadId })
          replied++
        } catch (sendErr) {
          await gmail.users.messages.modify({ userId: 'me', id: ref.id!, requestBody: { removeLabelIds: [labelId] } }).catch(() => {})
          console.error('[auto-reply] send failed for', fromEmail, sendErr)
          skipped++
        }
      } catch (err) {
        console.error('[auto-reply] error processing message', ref.id, err)
        skipped++
      }
    }

    return { ok: true, dry, scanned: ids.length, replied, skipped, ...(dry ? { plan } : {}) }
  } finally {
    running = false
  }
}
