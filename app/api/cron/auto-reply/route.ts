import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClient, sendGmailMessage, ensureLabel } from '@/lib/gmail'
import { existingContactEmail, registrationInviteEmail } from '@/lib/emailTemplates'

export const dynamic = 'force-dynamic'

const AUTO_LABEL = 'Auto-Replied'
const MAX_PER_RUN = 25

// אימות מול CRON_SECRET — דרך Authorization: Bearer <secret> או ?secret=<secret>
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if (request.headers.get('authorization') === `Bearer ${secret}`) return true
  return new URL(request.url).searchParams.get('secret') === secret
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

async function run(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 })

  const db = getAdminDb()
  if (!db) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  const portalBase = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chasamsofer.co.il').replace(/\/$/, '')
  const officeEmail = (process.env.GMAIL_EMAIL ?? 'office@chasamsofer.info').toLowerCase()

  let gmail
  try {
    gmail = await getGmailClient()
  } catch {
    return NextResponse.json({ error: 'Gmail לא מחובר' }, { status: 503 })
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
        // מסמנים כמטופל כדי לא לבדוק שוב בכל הרצה
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

  return NextResponse.json({ ok: true, scanned: ids.length, replied, skipped })
}

export async function GET(request: NextRequest) { return run(request) }
export async function POST(request: NextRequest) { return run(request) }
