import type { SupabaseClient } from '@supabase/supabase-js'
import { getLegacyGmailClient, getBody, getGmailClient, ensureLabel } from './gmail'

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

type ItemResult = { imported: boolean; matched: boolean }

export function summarizeSync(items: ItemResult[]) {
  return {
    imported: items.filter(i => i.imported).length,
    skipped: items.filter(i => !i.imported).length,
    matched: items.filter(i => i.imported && i.matched).length,
    unmatched: items.filter(i => i.imported && !i.matched).length,
  }
}

const LAST_SYNC_KEY = 'legacy_mail_last_sync'

// משיכה אינקרמנטלית: מושך הודעות אחרי החותמת האחרונה (Gmail query after:),
// שומר ל-inbound_emails עם source='legacy', משייך beneficiary, מעדכן חותמת.
export async function syncLegacyMail(admin: SupabaseClient) {
  const gmail = await getLegacyGmailClient()

  let officeGmail: any = null, archiveLabelId: string | null = null
  try {
    officeGmail = await getGmailClient()
    archiveLabelId = await ensureLabel(officeGmail, 'ארכיון מייל קודם')
  } catch (e) { console.error('[legacy-sync] office Gmail unavailable, skipping archive copy:', e) }

  const { data: cur } = await admin.from('app_settings').select('value').eq('key', LAST_SYNC_KEY).maybeSingle()
  const lastEpoch = cur?.value ? Number(cur.value) : 0
  const q = lastEpoch ? `after:${lastEpoch}` : ''

  const results: ItemResult[] = []
  let pageToken: string | undefined
  let maxEpoch = lastEpoch

  do {
    const list = await gmail.users.messages.list({ userId: 'me', q, maxResults: 100, pageToken })
    const ids = (list.data.messages ?? []).map(m => m.id!).filter(Boolean)
    for (const id of ids) {
      try {
        const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
        const headers = full.data.payload?.headers ?? []
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

        const { data: inserted, error } = await admin.from('inbound_emails').upsert({
          gmail_message_id: gmailMessageId,
          source: 'legacy',
          from_email: fromEmail,
          from_name: fromName,
          to_email: toEmail,
          subject,
          html: getBody(full.data.payload) || null,
          plain_text: full.data.snippet ?? null,
          beneficiary_id: beneficiaryId,
          email_date: emailDate,
          received_at: emailDate ?? null,
          is_read: true,
        }, { onConflict: 'gmail_message_id', ignoreDuplicates: true }).select('id')

        if (error) {
          console.error(`[legacy-sync] upsert failed for ${gmailMessageId}:`, error.message)
          results.push({ imported: false, matched: false })
          continue
        }

        if (epochSec > maxEpoch) maxEpoch = epochSec

        const imported = (inserted?.length ?? 0) > 0
        results.push({ imported, matched: !!beneficiaryId })

        if (imported && officeGmail && archiveLabelId) {
          try {
            const rawFull = await gmail.users.messages.get({ userId: 'me', id, format: 'raw' })
            if (rawFull.data.raw) {
              await officeGmail.users.messages.insert({
                userId: 'me',
                requestBody: { raw: rawFull.data.raw, labelIds: [archiveLabelId] },
              })
            }
          } catch (e) { console.error(`[legacy-sync] Gmail insert failed for ${id}:`, e) }
        }
      } catch (err) {
        console.error(`[legacy-sync] failed message ${id}:`, err)
        results.push({ imported: false, matched: false })
        continue
      }
    }
    pageToken = list.data.nextPageToken ?? undefined
  } while (pageToken)

  if (maxEpoch > lastEpoch) {
    await admin.from('app_settings').upsert({ key: LAST_SYNC_KEY, value: String(maxEpoch + 1), updated_at: new Date().toISOString() })
  }

  return { fetched: results.length, ...summarizeSync(results) }
}
