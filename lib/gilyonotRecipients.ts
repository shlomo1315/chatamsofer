// חיפוש נמען בגיליון: פענוח הפרמטרים של /recipients ושורת מצב לכל נמען
// ("נשלח ב-X, לא נפתח", "חזר", "סימן כספאם"), כדי שבמסך יראו מה קרה לכל מייל ומתי.

export const RECIPIENT_FILTERS = ['opened', 'unopened', 'clicked', 'downloaded', 'bounced', 'unsubscribed', 'failed'] as const
export type RecipientFilter = typeof RECIPIENT_FILTERS[number]

export const RECIPIENT_COLUMNS = 'email, status, sent_at, delivered_at, opened_at, open_count, clicked_at, click_count, downloaded_at, download_count, bounced_at, bounce_type, complained_at, unsubscribed_at, error'

export interface RecipientRow {
  email: string
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null; delivered_at: string | null
  opened_at: string | null; open_count: number
  clicked_at: string | null; click_count: number
  downloaded_at: string | null; download_count: number
  bounced_at: string | null; bounce_type: string | null; complained_at: string | null
  unsubscribed_at: string | null; error: string | null
}

/** מפענח ?q= ו-?f=. החיפוש מנוקה מתווים ששוברים את מסנן ה-PostgREST ומוגבל ל-100 תווים. */
export function parseRecipientQuery(sp: URLSearchParams): { q: string; f: RecipientFilter | ''; error?: string } {
  const q = (sp.get('q') ?? '').trim().toLowerCase().replace(/[%,()*\\]/g, '').slice(0, 100)
  const raw = sp.get('f') ?? ''
  if (raw && !(RECIPIENT_FILTERS as readonly string[]).includes(raw)) return { q, f: '', error: 'סינון לא מוכר' }
  return { q, f: raw as RecipientFilter | '' }
}

export type SummaryTone = 'bad' | 'warn' | 'muted' | 'good'

/** משפט אחד שמתאר מה קרה לנמען. fmt מעצב תאריך (בצד הלקוח: יום, חודש ושעה). */
export function recipientSummary(r: RecipientRow, fmt: (iso: string) => string): { tone: SummaryTone; text: string } {
  if (r.status === 'failed') return { tone: 'bad', text: `השליחה נכשלה${r.error ? `: ${r.error}` : ''}` }
  if (r.status === 'pending' || !r.sent_at) return { tone: 'muted', text: 'ממתין לשליחה' }
  if (r.complained_at) return { tone: 'bad', text: `סימן את המייל כספאם ב-${fmt(r.complained_at)}` }
  if (r.bounced_at) return { tone: 'bad', text: `חזר ב-${fmt(r.bounced_at)}${/^(hard|permanent)$/i.test(r.bounce_type ?? '') ? ' (כתובת לא קיימת)' : ''}` }
  const unsub = r.unsubscribed_at ? ` · הסיר את עצמו ב-${fmt(r.unsubscribed_at)}` : ''
  if (!r.opened_at) return { tone: 'warn', text: `נשלח ב-${fmt(r.sent_at)}, לא נפתח${unsub}` }
  const did = [r.download_count > 0 || r.downloaded_at ? 'הוריד' : '', r.click_count > 0 || r.clicked_at ? 'הקליק' : ''].filter(Boolean)
  const times = r.open_count > 1 ? ` (${r.open_count} פעמים)` : ''
  return { tone: 'good', text: `נפתח ב-${fmt(r.opened_at)}${times}${did.length ? `, ${did.join(' ו')}` : ''}${unsub}` }
}
