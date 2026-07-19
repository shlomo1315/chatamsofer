import type { SupabaseClient } from '@supabase/supabase-js'
import { getLegacyGmailClient, getGmailClientForToken, getBody, getGmailClient, ensureLabel } from './gmail'
import { departmentByEmail, DEPARTMENTS, type DepartmentKey } from './departments'
import { isWorkspaceConfigured, getWorkspaceGmailClient, ensureArchiveLabel, importRawMessage } from './googleWorkspace'

// חשבון Gmail מטבלת gmail_accounts — טוקן, מחלקה, תווית וסמן סנכרון פר-תיבה.
export interface GmailAccount {
  id: string
  refresh_token: string
  department: string
  label_id?: string | null
  last_sync_epoch?: number | null
  // כתובת יעד לייבוא ל-Gmail — ריק = כתובת המחלקה
  import_target_email?: string | null
}

// הוספת התווית של התיבה לכל המיילים שנקלטו — ב-mail_label_assignments (app_settings),
// אותו מנגנון של שיוך ידני. הוספה בלי כפילות.
async function applyLabelToMessages(admin: SupabaseClient, labelId: string, gmailMessageIds: string[]) {
  if (!labelId || !gmailMessageIds.length) return
  // ממפים gmail_message_id → id של השורה ב-inbound_emails (המפתח ב-assignments)
  const { data: rows } = await admin
    .from('inbound_emails')
    .select('id, gmail_message_id')
    .in('gmail_message_id', gmailMessageIds)
  const ids = (rows ?? []).map(r => String(r.id))
  if (!ids.length) return

  const { data: cur } = await admin.from('app_settings').select('value').eq('key', 'mail_label_assignments').maybeSingle()
  let assignments: Record<string, string[]> = {}
  try { assignments = cur?.value ? JSON.parse(cur.value as string) : {} } catch { assignments = {} }
  for (const id of ids) {
    const existing = assignments[id] ?? []
    if (!existing.includes(labelId)) assignments[id] = [...existing, labelId]
  }
  await admin.from('app_settings').upsert({
    key: 'mail_label_assignments',
    value: JSON.stringify(assignments),
    updated_at: new Date().toISOString(),
  })
}

// זיהוי לקוח למייל היסטורי — אותו דפוס כמו resend-inbound (maybeAutoReplyIgud):
// ת"ז 9 ספרות בנושא (רשום או בן/בת זוג) → נפילה לכתובת השולח.
export async function resolveBeneficiaryId(
  admin: SupabaseClient,
  opts: { subject: string; fromEmail: string },
): Promise<string | null> {
  const idMatch = String(opts.subject ?? '').match(/\d{9}/)
  if (idMatch) {
    const id = idMatch[0]
    const { data } = await admin
      .from('beneficiaries')
      .select('id')
      .or(`id_number.eq.${id},spouse_id_number.eq.${id}`)
      .maybeSingle()
    if (data?.id) return data.id
  }
  const from = (opts.fromEmail || '').toLowerCase().trim()
  if (from && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
    const { data } = await admin.from('beneficiaries').select('id').ilike('email', from).maybeSingle()
    if (data?.id) return data.id
  }
  return null
}

type ItemResult = { imported: boolean; matched: boolean; failed?: boolean }

export function summarizeSync(items: ItemResult[]) {
  return {
    imported: items.filter(i => i.imported).length,
    // דילוג = כבר קיים במערכת (לא שגיאה)
    skipped: items.filter(i => !i.imported && !i.failed).length,
    // כשל = השורה לא נכנסה בגלל שגיאה. חייב להיות גלוי!
    failed: items.filter(i => i.failed).length,
    matched: items.filter(i => i.imported && i.matched).length,
    unmatched: items.filter(i => i.imported && !i.matched).length,
  }
}

const LAST_SYNC_KEY = 'legacy_mail_last_sync'

export interface SyncResult {
  fetched: number
  imported: number
  skipped: number
  failed: number
  matched: number
  unmatched: number
  /** הודעת השגיאה הראשונה, אם היו כשלים — כדי שלא ייבלעו בשקט */
  error?: string
}

/**
 * סנכרון אינקרמנטלי של תיבת המייל הישנה.
 *
 * @param departmentKey מפתח המחלקה שאליה משויכים המיילים מהתיבה הזו
 *                      (ברירת מחדל: נגזר מכתובת ה-To, ובנפילה — 'main')
 */
export async function syncLegacyMail(
  admin: SupabaseClient,
  departmentKey?: string,
  opts?: { full?: boolean; account?: GmailAccount },
): Promise<SyncResult> {
  const account = opts?.account
  // מקור ה-Gmail: תיבה ספציפית (טוקן פר-תיבה) או התיבה הישנה הגלובלית (תאימות לאחור).
  const gmail = account ? getGmailClientForToken(account.refresh_token) : await getLegacyGmailClient()
  // המחלקה: של התיבה כשקיימת; אחרת ה-departmentKey שהתקבל, ואם אין — לפי ה-To.
  const forcedDept = account?.department ?? departmentKey

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let officeGmail: any = null
  let archiveLabelId: string | null = null
  try {
    officeGmail = await getGmailClient()
    archiveLabelId = await ensureLabel(officeGmail, 'ארכיון מייל קודם')
  } catch (e) {
    console.error('[legacy-sync] office Gmail unavailable, skipping archive copy:', e)
  }

  // ── ייבוא ל-Google Workspace: תיבת ה-Gmail של המחלקה ──
  // אם ה-Service Account מוגדר ולמחלקת התיבה יש כתובת — מכינים לקוח מתחזה
  // ותווית "ארכיון מייל ישן" פעם אחת, ומזריקים לתיבה בתוך הלולאה. מושבת בשקט
  // אם ה-SA לא מוגדר או ההכנה נכשלת — לא חוסם את הסנכרון.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let deptGmail: any = null
  let deptArchiveLabelId: string | null = null
  // כתובת היעד: מה שהוגדר ידנית לתיבה, ובנפילה — כתובת המחלקה.
  const deptEmail = account?.import_target_email?.trim()
    || (forcedDept ? DEPARTMENTS[forcedDept as DepartmentKey]?.email : null)
  if (isWorkspaceConfigured() && deptEmail) {
    try {
      deptGmail = getWorkspaceGmailClient(deptEmail)
      deptArchiveLabelId = await ensureArchiveLabel(deptGmail)
    } catch (e) {
      console.error(`[legacy-sync] Workspace import unavailable for ${deptEmail}:`, e)
      deptGmail = null
    }
  }

  // הסמן פר-תיבה: לתיבה ספציפית — last_sync_epoch שלה; אחרת הסמן הגלובלי הישן.
  // סנכרון מלא (full) מתעלם מהסמן ומושך את כל ההיסטוריה. upsert עם
  // ignoreDuplicates מונע כפילויות, כך שמשיכה חוזרת בטוחה.
  let globalCursorRaw: string | null = null
  if (!account) {
    const { data: cur } = await admin.from('app_settings').select('value').eq('key', LAST_SYNC_KEY).maybeSingle()
    globalCursorRaw = (cur?.value as string) ?? null
  }
  const storedEpoch = account ? Number(account.last_sync_epoch ?? 0) : (globalCursorRaw ? Number(globalCursorRaw) : 0)
  const lastEpoch = opts?.full ? 0 : storedEpoch
  const q = lastEpoch ? `after:${lastEpoch}` : ''

  const results: ItemResult[] = []
  const importedGmailIds: string[] = []  // לצורך החלת תווית התיבה בסוף
  let pageToken: string | undefined
  let maxEpoch = lastEpoch
  let firstError: string | undefined

  do {
    const list = await gmail.users.messages.list({ userId: 'me', q, maxResults: 100, pageToken })
    const ids = (list.data.messages ?? []).map(m => m.id!).filter(Boolean)

    for (const id of ids) {
      try {
        const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
        const headers = full.data.payload?.headers ?? []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const h = (n: string) => headers.find((x: any) => x.name?.toLowerCase() === n.toLowerCase())?.value ?? ''

        const gmailMessageId = h('message-id') || id
        const subject = h('subject')
        const fromRaw = h('from')
        const fromEmail = (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw).toLowerCase().trim()
        const fromName = fromRaw.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || null
        const toEmail = (h('to').match(/<([^>]+)>/)?.[1] ?? h('to')).toLowerCase().trim()
        const dateMs = Number(full.data.internalDate ?? 0)
        const emailDate = dateMs ? new Date(dateMs).toISOString() : null
        const epochSec = dateMs ? Math.floor(dateMs / 1000) : 0

        const beneficiaryId = await resolveBeneficiaryId(admin, { subject, fromEmail })

        // שיוך מחלקה: המחלקה של התיבה (forcedDept), ובנפילה — לפי כתובת ה-To.
        const department = forcedDept ?? departmentByEmail(toEmail)?.key ?? 'main'

        const row = {
          gmail_message_id: gmailMessageId,
          source: 'legacy',
          department,
          from_email: fromEmail,
          from_name: fromName,
          to_email: toEmail,
          subject,
          html: getBody(full.data.payload) || null,
          plain_text: full.data.snippet ?? null,
          beneficiary_id: beneficiaryId,
          email_date: emailDate,
          // ברירת המחדל של העמודה היא now(); רק אם יש תאריך אמיתי דורסים אותה.
          ...(emailDate ? { received_at: emailDate } : {}),
          is_read: true,
        }

        const { data: inserted, error } = await admin
          .from('inbound_emails')
          .upsert(row, { onConflict: 'gmail_message_id', ignoreDuplicates: true })
          .select('id')

        if (error) {
          // 23505 = כפילות → זה דילוג לגיטימי, לא כשל.
          const isDuplicate = error.code === '23505'
          if (!isDuplicate) {
            console.error(`[legacy-sync] upsert failed for ${gmailMessageId}: [${error.code}] ${error.message}`)
            firstError ??= `[${error.code}] ${error.message}`
            results.push({ imported: false, matched: false, failed: true })
            continue
          }
          results.push({ imported: false, matched: false })
          if (epochSec > maxEpoch) maxEpoch = epochSec
          continue
        }

        if (epochSec > maxEpoch) maxEpoch = epochSec

        const imported = (inserted?.length ?? 0) > 0
        results.push({ imported, matched: !!beneficiaryId })
        if (imported) importedGmailIds.push(gmailMessageId)

        // עותק ארכיון בתיבת office + הזרקה לתיבת ה-Gmail של המחלקה — לא חוסם.
        // מושכים raw פעם אחת ומשתמשים בו לשני היעדים.
        if (imported && ((officeGmail && archiveLabelId) || (deptGmail && deptArchiveLabelId))) {
          try {
            const rawFull = await gmail.users.messages.get({ userId: 'me', id, format: 'raw' })
            const raw = rawFull.data.raw
            if (raw) {
              if (officeGmail && archiveLabelId) {
                try {
                  await officeGmail.users.messages.insert({
                    userId: 'me', requestBody: { raw, labelIds: [archiveLabelId] },
                  })
                } catch (e) { console.error(`[legacy-sync] office archive insert failed for ${id}:`, e) }
              }
              // הזרקה לתיבת ה-Gmail של המחלקה + סימון imported_to_gmail_at למניעת כפילות
              if (deptGmail && deptArchiveLabelId) {
                try {
                  await importRawMessage(deptGmail, raw, deptArchiveLabelId)
                  await admin.from('inbound_emails')
                    .update({ imported_to_gmail_at: new Date().toISOString() })
                    .eq('gmail_message_id', gmailMessageId)
                } catch (e) { console.error(`[legacy-sync] dept Gmail import failed for ${id}:`, e) }
              }
            }
          } catch (e) {
            console.error(`[legacy-sync] raw fetch failed for ${id}:`, e)
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[legacy-sync] failed message ${id}:`, msg)
        firstError ??= msg
        results.push({ imported: false, matched: false, failed: true })
        continue
      }
    }
    pageToken = list.data.nextPageToken ?? undefined
  } while (pageToken)

  // עדכון הסמן: פר-תיבה על gmail_accounts, אחרת הסמן הגלובלי הישן.
  if (maxEpoch > lastEpoch) {
    if (account) {
      await admin.from('gmail_accounts')
        .update({ last_sync_epoch: maxEpoch + 1 })
        .eq('id', account.id)
    } else {
      await admin.from('app_settings').upsert({
        key: LAST_SYNC_KEY,
        value: String(maxEpoch + 1),
        updated_at: new Date().toISOString(),
      })
    }
  }

  // החלת תווית התיבה על כל המיילים שנקלטו — כל מייל מהתיבה מקבל את תוויתה.
  if (account?.label_id && importedGmailIds.length) {
    try { await applyLabelToMessages(admin, account.label_id, importedGmailIds) }
    catch (e) { console.error('[legacy-sync] apply label failed:', e) }
  }

  const summary = summarizeSync(results)
  return {
    fetched: results.length,
    ...summary,
    ...(firstError ? { error: firstError } : {}),
  }
}

// שיוך בדיעבד: מחיל את תווית התיבה על מיילים ישנים שכבר נקלטו (source='legacy',
// מחלקה תואמת). מחזיר כמה סומנו.
export async function applyLabelToExistingMail(
  admin: SupabaseClient,
  account: GmailAccount,
): Promise<number> {
  if (!account.label_id) return 0
  const { data: rows } = await admin
    .from('inbound_emails')
    .select('id')
    .eq('source', 'legacy')
    .eq('department', account.department)
  const ids = (rows ?? []).map(r => String(r.id))
  if (!ids.length) return 0

  const { data: cur } = await admin.from('app_settings').select('value').eq('key', 'mail_label_assignments').maybeSingle()
  let assignments: Record<string, string[]> = {}
  try { assignments = cur?.value ? JSON.parse(cur.value as string) : {} } catch { assignments = {} }
  let added = 0
  for (const id of ids) {
    const existing = assignments[id] ?? []
    if (!existing.includes(account.label_id)) { assignments[id] = [...existing, account.label_id]; added++ }
  }
  if (added) {
    await admin.from('app_settings').upsert({
      key: 'mail_label_assignments',
      value: JSON.stringify(assignments),
      updated_at: new Date().toISOString(),
    })
  }
  return added
}
