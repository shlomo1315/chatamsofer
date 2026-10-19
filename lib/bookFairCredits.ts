import { normalizeHeader } from '@/lib/bookFairImport'
import { shekelsToAgorot } from '@/lib/bookFairPricing'
import { normalizePhone } from '@/lib/kvitel'
import { ttsClean } from '@/lib/bookFairYemotIvr'

// ─────────────────────────────────────────────────────────────────────────────
// יריד ספרים — זיכויים ללקוחות שלא קיבלו ספרים.
// הקובץ טהור: ייבוא אקסל, אימות פרטי בנק, תור השיחה ותוכן המייל. בלי מסד ובלי רשת.
// ─────────────────────────────────────────────────────────────────────────────

export type CreditChannel = 'phone' | 'email'
export interface ParsedCredit {
  customer_name: string | null
  phone: string | null
  email: string | null
  channel: CreditChannel
  books: string
  amount_agorot: number
}
export interface CreditRowError { line: number; message: string }

const HEADER_ALIASES = {
  name:    ['שם', 'שם לקוח', 'שם הלקוח', 'שם מלא', 'name'],
  phone:   ['טלפון', 'נייד', 'פלאפון', 'מספר טלפון', 'phone'],
  email:   ['מייל', 'אימייל', 'דואל', 'דוא ל', 'כתובת מייל', 'email'],
  books:   ['ספרים', 'ספר', 'ספרים חסרים', 'ספר חסר', 'שם הספר', 'שמות הספרים', 'books'],
  amount:  ['סכום', 'סכום זיכוי', 'סכום הזיכוי', 'זיכוי', 'סכום לזיכוי', 'amount'],
  channel: ['ערוץ', 'סוג הזמנה', 'channel'],
}
type Field = keyof typeof HEADER_ALIASES

const MAX_BOOKS_LEN = 300
const MAX_AMOUNT_AGOROT = 500_000 // 5,000 ש"ח לזיכוי בודד; מעל זה כנראה טעות בקובץ

const cell = (v: unknown) => String(v ?? '').replace(/[‏‪-‮⁦-⁩]/g, '').trim()

function fieldOf(header: string): Field | null {
  const h = normalizeHeader(header)
  if (!h) return null
  for (const f of Object.keys(HEADER_ALIASES) as Field[]) {
    if (HEADER_ALIASES[f].some(a => normalizeHeader(a) === h)) return f
  }
  return null
}

/** טלפון מאקסל: מחזיר 0 מוביל שנבלע (מספר או טקסט), ומקבל מקף, רווח, 972 ו-".0" של תא מספרי. */
export function normalizeCreditPhone(v: unknown): string | null {
  let d = cell(v).replace(/\.0+$/, '').replace(/\D/g, '')
  if (d.startsWith('00972')) d = d.slice(5)
  else if (d.startsWith('972')) d = d.slice(3)
  if (d && !d.startsWith('0') && (d.length === 8 || d.length === 9)) d = '0' + d
  return normalizePhone(d)
}

export function normalizeEmail(v: unknown): string | null {
  const e = cell(v).toLowerCase()
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e) && e.length <= 200 ? e : null
}

/** פרסור טבלת האקסל. הערוץ: טלפון בלבד → שיחה, מייל בלבד → מייל, שניהם → לפי עמודת "ערוץ" ובברירת מחדל מייל. */
export function parseCreditsTable(rows: unknown[][]): {
  credits: ParsedCredit[]; errors: CreditRowError[]; missingColumns: string[]
} {
  const credits: ParsedCredit[] = []
  const errors: CreditRowError[] = []
  const headerIdx = rows.findIndex(r => r.some(c => fieldOf(cell(c))))
  if (headerIdx < 0) return { credits, errors, missingColumns: ['ספרים', 'סכום', 'טלפון או מייל'] }

  const col: Partial<Record<Field, number>> = {}
  rows[headerIdx].forEach((c, i) => {
    const f = fieldOf(cell(c))
    if (f && col[f] === undefined) col[f] = i
  })
  const missing: string[] = []
  if (col.books === undefined) missing.push('ספרים')
  if (col.amount === undefined) missing.push('סכום')
  if (col.phone === undefined && col.email === undefined) missing.push('טלפון או מייל')
  if (missing.length) return { credits, errors, missingColumns: missing }

  const seen = new Set<string>()
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    const get = (f: Field) => (col[f] === undefined ? '' : cell(r[col[f]!]))
    if (!r.some(c => cell(c))) continue
    const line = i + 1

    const rawPhone = get('phone'), rawEmail = get('email')
    const phone = rawPhone ? normalizeCreditPhone(rawPhone) : null
    const email = rawEmail ? normalizeEmail(rawEmail) : null
    if (rawPhone && !phone) { errors.push({ line, message: `טלפון לא תקין: ${rawPhone}` }); continue }
    if (rawEmail && !email) { errors.push({ line, message: `מייל לא תקין: ${rawEmail}` }); continue }
    if (!phone && !email) { errors.push({ line, message: 'חסר טלפון או מייל' }); continue }

    const books = get('books').replace(/\s+/g, ' ')
    if (!books) { errors.push({ line, message: 'חסר שם ספר' }); continue }
    if (books.length > MAX_BOOKS_LEN) { errors.push({ line, message: 'רשימת הספרים ארוכה מדי' }); continue }

    const rawAmount = r[col.amount!]
    const amount = shekelsToAgorot(typeof rawAmount === 'number' ? rawAmount : cell(rawAmount))
    if (amount === null || amount <= 0) { errors.push({ line, message: `סכום זיכוי לא תקין: ${cell(rawAmount) || 'ריק'}` }); continue }
    if (amount > MAX_AMOUNT_AGOROT) { errors.push({ line, message: `סכום חריג (${amount / 100} ש"ח), בדקו שהוא נכון` }); continue }

    let channel: CreditChannel
    if (phone && email) {
      const c = normalizeHeader(get('channel'))
      channel = ['טלפון', 'טלפוני', 'phone'].includes(c) ? 'phone' : 'email'
    } else channel = phone ? 'phone' : 'email'

    const key = creditKey({ channel, phone, email })
    if (seen.has(key)) { errors.push({ line, message: 'לקוח כפול בקובץ. איחדו לשורה אחת עם סכום מצטבר' }); continue }
    seen.add(key)

    credits.push({
      customer_name: get('name').slice(0, 100) || null,
      phone, email, channel, books, amount_agorot: amount,
    })
  }
  return { credits, errors, missingColumns: [] }
}

export function creditKey(c: { channel: CreditChannel; phone: string | null; email: string | null }): string {
  return c.channel === 'phone' ? `p:${c.phone}` : `e:${c.email}`
}

export function formatShekels(agorot: number): string {
  const v = agorot / 100
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

// ─── פרטי בנק ────────────────────────────────────────────────────────────────

export interface BankInput { bank: string; branch: string; account: string }

/** מספר בנק 1–2 ספרות, סניף 3–4 ספרות, חשבון 4–9 ספרות. מחזיר הודעת שגיאה או null. */
export function validateBank(b: BankInput): string | null {
  if (!/^\d{1,2}$/.test(b.bank)) return 'מספר הבנק צריך להיות עד שתי ספרות'
  if (!/^\d{3,4}$/.test(b.branch)) return 'מספר הסניף צריך להיות שלוש ספרות'
  if (!/^\d{4,9}$/.test(b.account)) return 'מספר החשבון צריך להיות בין ארבע לתשע ספרות'
  return null
}

/** מספר זהות: 5–9 ספרות עם ספרת ביקורת תקינה. מחזיר 9 ספרות (עם אפסים מובילים) או null. */
export function validateIsraeliId(v: unknown): string | null {
  const d = String(v ?? '').replace(/[\s-]/g, '')
  if (!/^\d{5,9}$/.test(d)) return null
  const id = d.padStart(9, '0')
  if (/^0+$/.test(id)) return null
  let sum = 0
  for (let i = 0; i < 9; i++) {
    const n = Number(id[i]) * (i % 2 ? 2 : 1)
    sum += n > 9 ? n - 9 : n
  }
  return sum % 10 === 0 ? id : null
}

export const CREDIT_STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין לשליחה', sent: 'נשלח', send_failed: 'השליחה נכשלה', answered: 'ענה', details_entered: 'הזין פרטים',
}
export const TRANSFERRED_LABEL = 'הועבר בבנק'

/** סטטוס לתצוגה ולאקסל: "הועבר בבנק" גובר על סטטוס השליחה. */
export function creditStatusLabel(status: string, transferredAt: string | null): string {
  return transferredAt ? TRANSFERRED_LABEL : CREDIT_STATUS_LABELS[status] ?? status
}

/** תא אקסל בטוח: טקסט שמתחיל בתו של נוסחה מקבל ' לפניו, כדי שאקסל לא יריץ אותו. */
export function safeCell(v: unknown): string {
  const s = String(v ?? '')
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

export function cleanHolder(v: unknown): string {
  return String(v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

// ─── שיחת ימות ───────────────────────────────────────────────────────────────

export const CR_OK = 'cr_ok'
export const CR_HOLDER = 'cr_holder'
export const CR_BANK = 'cr_bank'
export const CR_BRANCH = 'cr_branch'
export const CR_ACCT = 'cr_acct'
export const CR_CONFIRM = 'cr_confirm'

export interface CreditCallContext { name: string | null; books: string; amountAgorot: number; alreadyDone: boolean }
export type CreditPhoneAction =
  | { kind: 'answered' }
  | { kind: 'save'; holderRecording: string; bank: string; branch: string; account: string }
  | null
export interface CreditPhoneTurn { reply: string; action: CreditPhoneAction }

const joinTokens = (...tokens: string[]) => tokens.filter(Boolean).join('.')
const t = (text: string) => `t-${ttsClean(text)}`
const hangup = 'go_to_folder=hangup'
const say = (...texts: string[]) => `id_list_message=${joinTokens(...texts.map(t))}&${hangup}`
const MAX_RECORD_SECONDS = 15

function readKeys(varName: string, tokens: string[], keys: string[]): string {
  const ops = [varName, 'no', '1', '1', '10', 'No', 'no', 'no', '', keys.join('.'), '', '', '', '']
  return `read=${joinTokens(...tokens)}=${ops.join(',')}`
}
function readNumber(varName: string, tokens: string[], maxDigits: number): string {
  const ops = [varName, 'no', String(maxDigits), '1', '15', 'No', 'no', 'no', '', '', '', '', '', '']
  return `read=${joinTokens(...tokens)}=${ops.join(',')}`
}
function readRecord(varName: string, tokens: string[]): string {
  return `read=${joinTokens(...tokens)}=${[varName, '', 'record', String(MAX_RECORD_SECONDS), '9'].join(',')}`
}
const digits = (v: string | undefined) => (v ?? '').replace(/\D/g, '')

// השלוחה מזהה לקוח לפי מספר המתקשר, ולכן פרטי בנק נקלטים רק לזיכוי שכבר יצאה אליו שיחה.
// זיכוי שעוד לא נשלח (או שהשליחה נכשלה) לא נפתח, כדי שמי שמתחזה למספר לא יקדים את הלקוח.
export const PHONE_OPEN_STATUSES = ['sent', 'answered'] as const

// פרטי בנק נשמרים רק בזיכוי שנשלח ללקוח (שיחה או מייל), בכל נתיבי הכתיבה. גם טריגר במסד אוכף זאת.
export const BANK_SAVE_STATUSES = PHONE_OPEN_STATUSES
export const canSaveBank = (status: string) => (BANK_SAVE_STATUSES as readonly string[]).includes(status)

export function pickPhoneCredit<T extends { status: string }>(rows: T[]): { credit: T; open: boolean } | null {
  const open = rows.find(r => (PHONE_OPEN_STATUSES as readonly string[]).includes(r.status))
  if (open) return { credit: open, open: true }
  const done = rows.find(r => r.status === 'details_entered')
  return done ? { credit: done, open: false } : null
}

/** מאחד את כל הזיכויים הפתוחים של אותו טלפון לשיחה אחת: כל הספרים, סכום כולל, ושמירה לכולם. */
export function mergePhoneCredits<T extends { customer_name: string | null; books: string; amount_agorot: number; status: string }>(
  rows: T[],
): { rows: T[]; ctx: Omit<CreditCallContext, 'alreadyDone'> } | null {
  const picked = pickPhoneCredit(rows)
  if (!picked) return null
  const group = picked.open
    ? rows.filter(r => (PHONE_OPEN_STATUSES as readonly string[]).includes(r.status))
    : rows.filter(r => r.status === 'details_entered')
  return {
    rows: group,
    ctx: {
      name: group.find(r => r.customer_name)?.customer_name ?? null,
      books: group.map(r => r.books).filter(Boolean).join('. '),
      amountAgorot: group.reduce((n, r) => n + r.amount_agorot, 0),
    },
  }
}

export function amountSpoken(agorot: number): string {
  const s = Math.floor(agorot / 100), a = agorot % 100
  const shekels = s === 1 ? 'שקל אחד' : `${s} שקלים`
  if (!s) return `${a} אגורות`
  return a ? `${shekels} ו-${a} אגורות` : shekels
}

/** ימות שולחת בכל פנייה את המשתנים שנאספו, ולכן המצב נגזר מהם (כמו בשלוחת המפיצים). */
export function creditPhoneTurn(params: Record<string, string>, ctx: CreditCallContext): CreditPhoneTurn {
  const done = (reply: string, action: CreditPhoneAction = null) => ({ reply, action })
  if (ctx.alreadyDone) {
    return done(say(
      `שלום${ctx.name ? ` ${ctx.name}` : ''}, כאן היכל החתם סופר. בגין הספרים שלא סופקו: ${ctx.books}, אנו מזכים אתכם בסכום של ${amountSpoken(ctx.amountAgorot)}.`,
      'פרטי החשבון שלכם כבר התקבלו, והזיכוי יועבר אליו. תודה ושלום',
    ))
  }

  const ok = params[CR_OK] ?? ''
  if (!ok) {
    const hello = ctx.name ? `שלום ${ctx.name}` : 'שלום'
    return done(readKeys(CR_OK, [
      t(`${hello}, כאן היכל החתם סופר. לא סיפקנו לכם את הספרים הבאים: ${ctx.books}.`),
      t(`אנחנו מזכים אתכם בסכום של ${amountSpoken(ctx.amountAgorot)}, והזיכוי יועבר לחשבון הבנק שלכם.`),
      t('כדי להעביר את הזיכוי נצטרך את פרטי החשבון. להמשך הקישו 1. לסיום הקישו 2'),
    ], ['1', '2']), { kind: 'answered' })
  }
  if (ok !== '1') return done(say('תודה ושלום'))

  const holder = params[CR_HOLDER] ?? ''
  if (!holder) return done(readRecord(CR_HOLDER, [t('אחרי הצליל אמרו את שם בעל החשבון, ובסיום הקישו סולמית')]))

  const bank = digits(params[CR_BANK])
  if (!bank) return done(readNumber(CR_BANK, [t('הקישו את מספר הבנק, ובסיום סולמית')], 2))
  const branch = digits(params[CR_BRANCH])
  if (!branch) return done(readNumber(CR_BRANCH, [t('הקישו את מספר הסניף, ובסיום סולמית')], 4))
  const account = digits(params[CR_ACCT])
  if (!account) return done(readNumber(CR_ACCT, [t('הקישו את מספר החשבון, ובסיום סולמית')], 9))

  const bad = validateBank({ bank, branch, account })
  if (bad) return done(say(`${bad}. הפרטים לא נשמרו. נחזור אליכם בשיחה נוספת`))

  const confirm = params[CR_CONFIRM] ?? ''
  if (!confirm) {
    return done(readKeys(CR_CONFIRM, [
      t('הקשתם: מספר בנק'), `d-${bank}`, t('מספר סניף'), `d-${branch}`, t('מספר חשבון'), `d-${account}`,
      t('לאישור הפרטים הקישו 1. לביטול הקישו 2'),
    ], ['1', '2']))
  }
  if (confirm !== '1') return done(say('הפרטים לא נשמרו. נחזור אליכם בשיחה נוספת. שלום'))
  return done(
    say('הפרטים התקבלו. הזיכוי יועבר לחשבון שמסרתם. תודה רבה ושלום'),
    { kind: 'save', holderRecording: holder, bank, branch, account },
  )
}

// ─── מייל ────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const creditSubject = 'זיכוי כספי על ספרים שלא סופקו'

export function buildCreditEmailHtml(opts: { name: string | null; books: string; amountAgorot: number; url: string }): string {
  const p = 'margin:0 0 14px;color:#334155;font-size:16px;line-height:1.8;'
  return `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
<p style="${p}">שלום${opts.name ? ` ${esc(opts.name)}` : ''},</p>
<p style="${p}">לא הצלחנו לספק לכם את הספרים הבאים מההזמנה שלכם ביריד הספרים של היכל החתם סופר:</p>
<p style="${p}font-weight:bold;">${esc(opts.books)}</p>
<p style="${p}">אנו מזכים אתכם בסכום של <b>${formatShekels(opts.amountAgorot)} ש"ח</b>. הזיכוי יועבר לחשבון הבנק שלכם.</p>
<p style="${p}">כדי שנוכל להעביר את הכסף, נא למלא את פרטי החשבון ואת מספר הזהות של בעל החשבון בטופס המאובטח:</p>
<p style="margin:0 0 20px;"><a href="${esc(opts.url)}" style="background:#1B3256;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:16px;display:inline-block;">מילוי פרטי החשבון</a></p>
<p style="${p}font-size:14px;color:#64748b;">אנו מתנצלים על אי הנוחות.</p>
</div>`
}

// ─── שליחת בדיקה ─────────────────────────────────────────────────────────────
// המנהל שולח לעצמו מייל ושיחה עם נתוני דוגמה. לא נוגעים ב-book_fair_credits:
// שיחת בדיקה נרשמת ב-activity_log, והשלוחה מריצה בה את כל השיחה בלי לשמור פרטים.

export const TEST_CALL_ACTION = 'book_fair_credits_test_call'
export const TEST_CALL_WINDOW_MS = 30 * 60 * 1000
export const TEST_CREDIT: CreditCallContext = { name: 'לקוח לדוגמה', books: 'ספר לדוגמה', amountAgorot: 4550, alreadyDone: false }
export const testSubject = `[בדיקה] ${creditSubject}`

export function parseTestSend(body: unknown): { email: string | null; phone: string | null } | { error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as { email?: unknown; phone?: unknown }
  const rawEmail = typeof b.email === 'string' ? b.email.trim() : ''
  const rawPhone = typeof b.phone === 'string' ? b.phone.trim() : ''
  if (!rawEmail && !rawPhone) return { error: 'נא להזין מייל או טלפון לבדיקה' }
  const email = rawEmail ? normalizeEmail(rawEmail) : null
  if (rawEmail && !email) return { error: 'כתובת המייל לא תקינה' }
  const phone = rawPhone ? normalizeCreditPhone(rawPhone) : null
  if (rawPhone && !phone) return { error: 'מספר הטלפון לא תקין' }
  return { email, phone }
}

// הגבלת קצב לשליחת בדיקה: עד 5 שליחות לכל משתמש בכל 10 דקות (נספרות מ-activity_log)
export const TEST_SEND_ACTION = 'book_fair_credits_test_send'
export const TEST_SEND_LIMIT = 5
export const TEST_SEND_WINDOW_MS = 10 * 60 * 1000
export const TEST_RATE_LIMIT_MESSAGE = 'שלחת יותר מדי בדיקות, נסה שוב בעוד כמה דקות'

export function isTestSendLimited(recentCount: number): boolean {
  return recentCount >= TEST_SEND_LIMIT
}
