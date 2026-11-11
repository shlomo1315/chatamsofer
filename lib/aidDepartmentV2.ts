// מחלקת סיוע לפי העיצוב המאושר: סיבות, מסמכים נדרשים, סטטוסים לתצוגה,
// פענוח תשובת המנהל, חישובי הכנסה לנפש וניקוי פרטי המשפחה מהטופס.

export type AidReason = 'medical' | 'widow' | 'orphans' | 'econ' | 'other'

export const REASONS: [AidReason, string, string][] = [
  ['medical', 'סיוע רפואי', 'טיפול, ניתוח, תרופות'],
  ['widow', 'אלמנה', 'סיוע לאלמנה ולמשפחה'],
  ['orphans', 'יתומים', 'משפחה שהתייתמה'],
  ['econ', 'מצוקה כלכלית', 'חובות, הכנסה שלא מספיקה'],
  ['other', 'אחר', 'נפרט בהמשך'],
]

export const REASON_LABEL: Record<string, string> = Object.fromEntries(REASONS.map(([k, l]) => [k, l]))

export const ID_CARD_DOC = 'צילום תעודת זהות עם ספח'

export const NEED: Record<AidReason, string[]> = {
  medical: [ID_CARD_DOC, 'סיכום רפואי או מכתב רופא', 'הצעת מחיר או חשבונית לטיפול', 'תלושי שכר או אישור הכנסה', 'דפי בנק של 3 חודשים'],
  widow: [ID_CARD_DOC, 'תעודת פטירה', 'אישור קצבת שארים', 'דפי בנק של 3 חודשים'],
  orphans: [ID_CARD_DOC, 'תעודת פטירה', 'אישור קצבת שארים', 'דפי בנק של 3 חודשים'],
  econ: [ID_CARD_DOC, 'תלושי שכר או אישור הכנסה', 'דפי בנק של 3 חודשים', 'מכתב רב או ממליץ (לא חובה)'],
  other: [ID_CARD_DOC, 'מסמך שמסביר את הצורך', 'דפי בנק של 3 חודשים'],
}

export const isOptionalDoc = (label: string) => label.includes('(לא חובה)')

// סטטוס לתצוגה: "אצל המנהל" מתפצל ל"חזר מהמנהל" כשהגיעה תשובה במייל.
export type DisplayStatus = 'pending' | 'inquiry' | 'manager' | 'back' | 'approved' | 'rejected'
export const ST_ORDER: DisplayStatus[] = ['pending', 'inquiry', 'manager', 'back', 'approved', 'rejected']
export const ST: Record<DisplayStatus, string> = {
  pending: 'ממתין לטיפול', inquiry: 'בבירור', manager: 'אצל המנהל',
  back: 'חזר מהמנהל', approved: 'מאושר', rejected: 'לא מאושר',
}
export const STH: Record<DisplayStatus, string> = {
  pending: 'בקשות חדשות', inquiry: 'חסר מסמך או פרט', manager: 'נשלח במייל, ממתין',
  back: 'יש תשובה, צריך לעדכן', approved: 'החודש', rejected: 'החודש',
}

export function displayStatus(r: { status: string; decision_reply?: string | null }): DisplayStatus {
  if (r.status === 'awaiting_decision') return r.decision_reply ? 'back' : 'manager'
  if (r.status === 'approved' || r.status === 'rejected' || r.status === 'inquiry') return r.status
  return 'pending'
}

// זיהוי בלבד: ההחלטה נשמרת רק כשהמזכירות לוחצת.
export function parseManagerReply(text: string | null | undefined): { decision: 'approved' | 'rejected' | null; amount: number | null } {
  const body = String(text ?? '').split(/\n\s*(?:On .+wrote:|ב-.+כתב:|-----|>)/)[0].trim()
  if (!body) return { decision: null, amount: null }
  if (/לא\s*מאושר|לא\s*לאשר|נדח|^\s*x\b/i.test(body)) return { decision: 'rejected', amount: null }
  const m = body.replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(?:\.\d+)?/)
  const amount = m ? Math.round(Number(m[0])) : null
  if (/מאושר|אושר|לאשר/.test(body)) return { decision: 'approved', amount: amount && amount > 0 ? amount : null }
  return { decision: null, amount: null }
}

export type KidStatus = 'בבית' | 'נשוי' | 'בישיבה / סמינר'
export const KID_STATUSES: KidStatus[] = ['בבית', 'נשוי', 'בישיבה / סמינר']

export interface FamilyKid { name: string; id: string; birth: string; status: KidStatus }
export interface Family { wife?: { name: string; id: string; birth: string; phone: string } | null; kids: FamilyKid[] }
export interface Income { husbandJob: string; husband: number; wifeJob: string; wife: number; benefits: number; other: number; rent: number; debts: number }

const str = (v: unknown, max = 80) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)
const date = (v: unknown) => { const s = str(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '' }
const money = (v: unknown) => { const n = Math.round(Number(String(v ?? '').replace(/[^\d.-]/g, ''))); return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000_000) : 0 }

export function sanitizeFamily(raw: unknown): Family {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const w = (o.wife && typeof o.wife === 'object' ? o.wife : null) as Record<string, unknown> | null
  const wife = w && str(w.name) ? { name: str(w.name), id: str(w.id, 9).replace(/\D/g, ''), birth: date(w.birth), phone: str(w.phone, 15) } : null
  const kids = (Array.isArray(o.kids) ? o.kids : []).slice(0, 30)
    .map(k => (k && typeof k === 'object' ? k : {}) as Record<string, unknown>)
    .filter(k => str(k.name))
    .map(k => ({ name: str(k.name), id: str(k.id, 9).replace(/\D/g, ''), birth: date(k.birth), status: (KID_STATUSES.includes(k.status as KidStatus) ? k.status : 'בבית') as KidStatus }))
  return { wife, kids }
}

export function sanitizeIncome(raw: unknown): Income {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    husbandJob: str(o.husbandJob), husband: money(o.husband), wifeJob: str(o.wifeJob), wife: money(o.wife),
    benefits: money(o.benefits), other: money(o.other), rent: money(o.rent), debts: money(o.debts),
  }
}

export const asFamily = (v: unknown): Family | null => (v && typeof v === 'object' ? sanitizeFamily(v) : null)
export const asIncome = (v: unknown): Income | null => (v && typeof v === 'object' ? sanitizeIncome(v) : null)

export const totalIncome = (i: Income) => i.husband + i.wife + i.benefits + i.other
// נפשות: המבקש, האישה, והילדים שלא נשואים
export const souls = (f: Family | null) => 1 + (f?.wife ? 1 : 0) + (f?.kids ?? []).filter(k => k.status !== 'נשוי').length
export const perCapita = (i: Income, f: Family | null) => Math.round(totalIncome(i) / souls(f))

export function ageFrom(birth: string | null | undefined, now = new Date()): number | null {
  if (!birth || !/^\d{4}-\d{2}-\d{2}/.test(birth)) return null
  const [y, m, d] = birth.slice(0, 10).split('-').map(Number)
  let a = now.getFullYear() - y
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--
  return a >= 0 && a < 130 ? a : null
}

export const fmtMoney = (n: number | null | undefined) => `${Math.round(Number(n ?? 0)).toLocaleString('en-US')} ₪`

const TZ = 'Asia/Jerusalem'
const parts = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso)).map(x => [x.type, x.value]))
  for (const k of ["day", "month"]) p[k] = String(Number(p[k]))
  return p as Record<string, string>
}
export const fmtDate = (iso?: string | null) => { if (!iso) return ''; const p = parts(iso); return `${p.day}.${p.month}.${p.year}` }
export const fmtShort = (iso?: string | null) => { if (!iso) return ''; const p = parts(iso); return `${p.day}.${p.month}` }
export const fmtDateTime = (iso?: string | null) => { if (!iso) return ''; const p = parts(iso); return `${p.day}.${p.month} · ${p.hour === '24' ? '00' : p.hour}:${p.minute}` }

export const sourceLabel = (r: { source?: string | null; beneficiary_id?: string | null }) =>
  r.source === 'admin' ? 'הוזנה במשרד' : r.beneficiary_id ? 'צאצא רשום' : 'מהקישור'

export interface PrevLike { id: string; request_no?: number | null; created_at: string; status: string; amount?: number | null; aid_type?: string | null; beneficiary_id?: string | null; applicant_id_number?: string | null; beneficiary?: { id_number?: string | null } | null }

const idOf = (r: PrevLike) => String(r.applicant_id_number || r.beneficiary?.id_number || '').replace(/\D/g, '').replace(/^0+/, '')

// הבקשה הקודמת האחרונה של אותו אדם (לפי ת"ז או צאצא). פנימי בלבד.
export function findPrevious<T extends PrevLike>(r: T, all: T[]): T | null {
  const id = idOf(r)
  const prev = all
    .filter(x => x.id !== r.id && x.created_at < r.created_at && ((r.beneficiary_id && x.beneficiary_id === r.beneficiary_id) || (id && idOf(x) === id)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  return prev[0] ?? null
}

export function prevText(p: PrevLike): string {
  const no = p.request_no ? String(p.request_no) : '—'
  const res = p.status === 'approved' ? `אושר ${fmtMoney(p.amount)}` : p.status === 'rejected' ? 'לא אושר' : ST[displayStatus(p)]
  return `${no} · ${fmtDate(p.created_at)} · ${res}`
}

// מיסוך לתצוגה במייל: ספרה ראשונה ושלוש אחרונות.
export const maskId = (id: string | null | undefined) => {
  const d = String(id ?? '').replace(/\D/g, '')
  return d.length < 5 ? d : `${d[0]}${'•'.repeat(d.length - 4)}${d.slice(-3)}`
}

// נתוני המייל למנהל מתוך שורת הבקשה (ופרטי הצאצא אם רשום).
export interface AidRowForMail extends PrevLike {
  reason?: string | null; referrer?: string | null; notes?: string | null; requested_amount?: number | null
  family?: unknown; income?: unknown; source?: string | null
  applicant_name?: string | null; applicant_address?: string | null; applicant_city?: string | null; applicant_birth_date?: string | null
  applicant_details?: Record<string, unknown> | null
  beneficiary?: { full_name?: string | null; family_name?: string | null; id_number?: string | null; birth_date?: string | null; address?: string | null; city?: string | null } | null
}

export function aidPersonName(r: AidRowForMail) {
  const b = r.beneficiary
  return (b ? [b.full_name, b.family_name].filter(Boolean).join(' ') : '') || r.applicant_name || ''
}

export function managerMailData(r: AidRowForMail, prev: PrevLike | null, docNames: string[]) {
  const b = r.beneficiary
  const fam = asFamily(r.family)
  const inc = asIncome(r.income)
  const birth = b?.birth_date || r.applicant_birth_date || String(r.applicant_details?.birth_date ?? '')
  const kids = fam?.kids ?? []
  const under18 = kids.filter(k => { const a = ageFrom(k.birth); return a != null && a < 18 }).length
  const wifeAge = fam?.wife ? ageFrom(fam.wife.birth) : null
  const addr = [b?.address ?? r.applicant_address, b?.city ?? r.applicant_city].filter(Boolean).join(', ')
  const income: { label: string; value: string }[] = []
  if (inc) {
    if (inc.husband || inc.husbandJob) income.push({ label: 'הבעל', value: [inc.husbandJob, inc.husband ? fmtMoney(inc.husband) : ''].filter(Boolean).join(' · ') })
    if (inc.wife || inc.wifeJob) income.push({ label: 'האישה', value: [inc.wifeJob, inc.wife ? fmtMoney(inc.wife) : ''].filter(Boolean).join(' · ') })
    if (inc.benefits) income.push({ label: 'קצבאות', value: fmtMoney(inc.benefits) })
    if (inc.other) income.push({ label: 'הכנסה אחרת', value: fmtMoney(inc.other) })
    if (inc.rent) income.push({ label: 'שכר דירה', value: fmtMoney(inc.rent) })
    if (inc.debts) income.push({ label: 'חובות פתוחים', value: fmtMoney(inc.debts) })
  }
  return {
    requestNo: r.request_no ?? null,
    name: aidPersonName(r),
    sourceLabel: sourceLabel(r),
    idMasked: maskId(b?.id_number || r.applicant_id_number),
    age: ageFrom(birth),
    requested: r.requested_amount ?? null,
    reasonLabel: REASON_LABEL[r.aid_type ?? ''] ?? 'סיוע',
    story: String(r.reason ?? '').trim(),
    referrer: r.referrer || null,
    previous: prev ? `בקשה ${prev.request_no ?? '—'} מ-${fmtDate(prev.created_at)}${prev.aid_type ? ` (${REASON_LABEL[prev.aid_type] ?? ''})` : ''} · ${prev.status === 'approved' ? `אושרה ${fmtMoney(prev.amount)}` : prev.status === 'rejected' ? 'לא אושרה' : ST[displayStatus(prev)]}` : null,
    wife: fam?.wife ? `${fam.wife.name}${wifeAge != null ? ` · בת ${wifeAge}` : ''}` : null,
    kidsLine: kids.length ? `${kids.length} ילדים${under18 ? `, ${under18} מהם מתחת לגיל 18` : ''}` : null,
    address: addr || null,
    income,
    perCapitaLine: inc && totalIncome(inc) ? `${fmtMoney(perCapita(inc, fam))} (${souls(fam)} נפשות)` : null,
    docNames,
    secretaryNote: r.notes || null,
  }
}
