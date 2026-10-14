import type { SupabaseClient } from '@supabase/supabase-js'
import { HDate, Locale, getSedra } from '@hebcal/core'
import { cleanName } from '@/lib/kvitel'

// ─────────────────────────────────────────────────────────────────────────────
// גיליונות החתם סופר — רשימת התפוצה.
// כל הערוצים (הטופס באתר, הטופס בנדרים, הוספה ידנית וייבוא) נכנסים דרך
// subscribeGilyonot, וכך מייל אחד הוא תמיד שורה אחת. מיגרציה: 20261016_gilyonot.sql
// ─────────────────────────────────────────────────────────────────────────────

export type GilyonotSource = 'web' | 'nedarim' | 'manual' | 'import'

export const GILYONOT_SOURCES: Record<GilyonotSource, string> = {
  web: 'אתר',
  nedarim: 'נדרים פלוס',
  manual: 'ידני',
  import: 'ייבוא',
}

export const GILYONOT_FROM_NAME = 'גיליונות החתם סופר'
export const GILYONOT_FROM_EMAIL = process.env.GILYONOT_FROM_EMAIL || 'gilyonot@chasamsofer.info'

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/

/** מייל מנורמל, או null אם אינו תקין. */
export function normalizeEmail(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s || s.length > 254 || s.includes('..')) return null
  const [local] = s.split('@')
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.')) return null
  return EMAIL_RE.test(s) ? s : null
}

export function cleanSubscriberName(v: unknown): string | null {
  return cleanName(v).slice(0, 80) || null
}

// ── הכרעה: מה עושים עם הרשמה כשהמייל כבר קיים ──
// ⚠️ מי שהסיר את עצמו לא יוחזר לרשימה בייבוא או בהוספה ידנית. רק הרשמה חדשה
// שלו עצמו (אתר או נדרים) מחזירה אותו, כי זו הסכמה מחודשת.
export type SubscribeDecision = 'insert' | 'reactivate' | 'update_name' | 'exists' | 'blocked_unsubscribed'

export function decideSubscribe(
  existing: { status: 'active' | 'unsubscribed'; full_name: string | null } | null,
  input: { source: GilyonotSource; name: string | null },
): SubscribeDecision {
  if (!existing) return 'insert'
  if (existing.status === 'unsubscribed') {
    return input.source === 'web' || input.source === 'nedarim' ? 'reactivate' : 'blocked_unsubscribed'
  }
  return !existing.full_name && input.name ? 'update_name' : 'exists'
}

export type SubscribeResult =
  | { ok: true; outcome: 'added' | 'reactivated' | 'exists' | 'blocked_unsubscribed' }
  | { ok: false; error: string }

export async function subscribeGilyonot(
  db: SupabaseClient,
  input: { email: string; name: string | null; source: GilyonotSource; sourceRef?: string | null },
): Promise<SubscribeResult> {
  const now = new Date().toISOString()
  const { data: existing, error: readErr } = await db.from('gilyonot_subscribers')
    .select('id, status, full_name').eq('email', input.email).maybeSingle()
  if (readErr) { console.error('[gilyonot] read failed:', readErr.message); return { ok: false, error: 'השמירה נכשלה' } }

  const decision = decideSubscribe(existing, input)
  const consent = input.source === 'web' || input.source === 'nedarim' ? now : null

  if (decision === 'insert') {
    const { error } = await db.from('gilyonot_subscribers').insert({
      email: input.email, full_name: input.name, source: input.source,
      source_ref: input.sourceRef ?? null, consent_at: consent,
    })
    // מירוץ: שתי הרשמות באותו רגע. השנייה נתקלת באינדקס הייחודי, והכתובת כבר ברשימה.
    if (error?.code === '23505') return { ok: true, outcome: 'exists' }
    if (error) { console.error('[gilyonot] insert failed:', error.message); return { ok: false, error: 'השמירה נכשלה' } }
    return { ok: true, outcome: 'added' }
  }

  if (decision === 'reactivate' || decision === 'update_name') {
    const patch: Record<string, unknown> = { updated_at: now }
    if (input.name && (!existing!.full_name || decision === 'reactivate')) patch.full_name = input.name
    if (decision === 'reactivate') Object.assign(patch, { status: 'active', unsubscribed_at: null, consent_at: consent, source: input.source })
    const { error } = await db.from('gilyonot_subscribers').update(patch).eq('id', existing!.id)
    if (error) { console.error('[gilyonot] update failed:', error.message); return { ok: false, error: 'השמירה נכשלה' } }
    return { ok: true, outcome: decision === 'reactivate' ? 'reactivated' : 'exists' }
  }

  return { ok: true, outcome: decision }
}

// ── הטופס בנדרים פלוס ──
// השמות המדויקים של השדות בטופס "גיליונות" בנדרים לא ידועים לנו, ולכן נבדקים
// כמה שמות מקובלים (כמו בקוויטלאך, lib/kvitelNedarim.ts).
const pick = (b: Record<string, unknown>, keys: string[]): string => {
  for (const k of keys) {
    const v = b[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return ''
}

export function parseNedarimGilyon(body: Record<string, unknown>): { email: string | null; name: string | null; sourceRef: string | null } {
  const first = pick(body, ['FirstName', 'firstName'])
  const last = pick(body, ['LastName', 'lastName'])
  const full = pick(body, ['ClientName', 'FullName', 'Name', 'name', 'fullName']) || [first, last].filter(Boolean).join(' ')
  return {
    email: normalizeEmail(pick(body, ['Mail', 'Email', 'email', 'mail', 'EMail'])),
    name: cleanSubscriberName(full),
    sourceRef: pick(body, ['TransactionId', 'transaction_id', 'SubmissionId', 'submission_id', 'Id']).slice(0, 100) || null,
  }
}

// ── ייבוא רשימה: הדבקה מאקסל או מקובץ טקסט, שורה לכל נרשם ──
// בכל שורה מחפשים כתובת מייל, ומה שנשאר נחשב לשם.
export const MAX_IMPORT_ROWS = 20_000

export function parseImportText(text: string): { rows: { email: string; name: string | null }[]; invalid: number } {
  const seen = new Set<string>()
  const rows: { email: string; name: string | null }[] = []
  let invalid = 0
  for (const raw of text.split(/\r?\n/).slice(0, MAX_IMPORT_ROWS)) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/[^\s,;\t<>"']+@[^\s,;\t<>"']+/)
    const email = m ? normalizeEmail(m[0]) : null
    if (!email) { invalid++; continue }
    if (seen.has(email)) continue
    seen.add(email)
    rows.push({ email, name: cleanSubscriberName(line.replace(m![0], ' ').replace(/[,;\t"'<>]+/g, ' ')) })
  }
  return { rows, invalid }
}

// ── הפרשה של השבוע — ברירת המחדל בהעלאת גיליון ──
// השבת הקרובה (או היום, אם שבת), לפי מנהג ארץ ישראל. בשבת של חג אין פרשה.
const stripNiqqud = (s: string) => s.replace(/[֑-ׇ]/g, '')

export function currentParasha(date: Date = new Date()): string {
  const hd = new HDate(date).onOrAfter(6)
  const sedra = getSedra(hd.getFullYear(), true).lookup(hd)
  if (sedra.chag || !sedra.parsha?.length) return ''
  return `פרשת ${sedra.parsha.map(p => stripNiqqud(Locale.gettext(p, 'he'))).join('-')}`
}
