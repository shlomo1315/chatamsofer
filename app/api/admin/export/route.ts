// ייצוא נתוני מחלקה לקובץ אקסל אמיתי (.xlsx) — מעוצב, RTL, עם כותרת קפואה.
// שימוש: /api/admin/export?type=beneficiaries|loans|maternity|financial_aid|widows
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { buildXlsx, xlsxHeaders, todayStamp, type Column, type CellValue } from '@/lib/xlsx'
import type { SectionKey } from '@/types'

export const dynamic = 'force-dynamic'
// ⚠️ חובה. exceljs נשען על Buffer ועל zlib של Node ואינו רץ ב-Edge runtime.
export const runtime = 'nodejs'

// ⚠️ הייצוא מחזיר ת"ז, כתובות וטלפונים — הנתונים הרגישים ביותר במערכת.
// קודם הוא דרש requireStaff() בלבד, שמאשר כל תפקיד ואינו בודק מחלקה: איש
// גבייה שהרשאתו מוגבלת להלוואות יכול היה להוריד את כל המוטבים והיולדות.
// כאן ה-type נגזר להרשאת המחלקה המתאימה, ונדרשת הרשאת 'view' עליה.
const SECTION_BY_TYPE: Record<string, SectionKey> = {
  beneficiaries: 'beneficiaries',
  loans: 'loans',
  maternity: 'maternity',
  financial_aid: 'financial_aid',
  widows: 'widows',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

const STATUS_HE: Record<string, string> = {
  pending: 'ממתין', approved: 'מאושר', rejected: 'נדחה', docs_pending: 'השלמת מסמכים',
  docs_returned: 'הוחזר תיקון', review: 'בבדיקה', active: 'פעיל', cancelled: 'בוטל', loaded: 'נטען', disbursed: 'בוצע',
}
const he = (s?: string | null) => (s ? (STATUS_HE[s] ?? s) : '')
const famName = (b?: Row | null) => b ? [b.family_name, b.full_name].filter(Boolean).join(' ') : ''

// ⚠️ תאריכים עוברים כ-Date ולא כמחרוזת מפורמטת. באקסל תא-תאריך אמיתי ממוין
// כרונולוגית וניתן לסינון לפי טווח; מחרוזת "10/8/2026" ממוינת אלפביתית, כך
// ש-1/9 יופיע לפני 2/1. העיצוב לתצוגה (dd/mm/yyyy) נעשה ב-lib/xlsx.
const dt = (s?: string | null): Date | null => {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ שליפה בדפים — הייצוא נחתך ב-1,000 שורות בשקט.
//
// PostgREST מגביל כל שאילתה ל-db-max-rows (1,000), ובלי .range() התקרה חלה
// בלי שום שגיאה. כלומר קובץ הייצוא נראה תקין לחלוטין אבל הכיל רק את 1,000
// הראשונות — וזו בדיוק התקלה המסוכנת: אף אחד לא יודע שחסרים נתונים.
// כאן מושכים דף אחר דף עד שהדף האחרון קטן מגודל הדף.
// ─────────────────────────────────────────────────────────────────────────────
const PAGE = 1000
const MAX_ROWS = 50_000   // רשת ביטחון — קובץ גדול מזה אינו שמיש באקסל ממילא

// ⚠️ משוכפל מ-lib/beneficiariesList (שם זה לא מיוצא). חייב להישאר זהה,
// אחרת הקובץ שיורד לא יתאים למה שמוצג במסך — וזה בדיוק הבאג שתוקן כאן.
const BEN_PENDING_GROUP = ['pending', 'docs_pending', 'docs_returned', 'review']
const BEN_PENDING_OR = `eligibility_status.in.(${BEN_PENDING_GROUP.join(',')}),eligibility_status.is.null`
const BEN_SEARCH_COLUMNS = [
  'full_name', 'family_name', 'id_number', 'phone', 'phone2', 'email',
  'address', 'city', 'marital_status', 'spouse_name', 'spouse_id_number', 'nedarim_id',
]
// ⚠️ ניקוי פסיקים/סוגריים: ב-.or() של PostgREST הם תוחמי תחביר, ושם חיפוש
// שמכיל אותם היה שובר את השאילתה.
const benSearchOr = (term: string) => {
  const safe = term.replace(/[(),]/g, ' ')
  return BEN_SEARCH_COLUMNS.map(c => `${c}.ilike.%${safe}%`).join(',')
}

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error || !data) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') ?? ''

  // ההרשאה נבדקת מול המחלקה שממנה מייצאים — לא רק "האם אתה איש צוות".
  const section = SECTION_BY_TYPE[type]
  if (!section) return NextResponse.json({ error: 'סוג ייצוא לא מוכר' }, { status: 400 })
  const ctx = await requirePermission(section, 'view')
  if (!ctx) return forbidden()

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ columns במקום מערך כותרות שטוח: ה-kind של כל עמודה הוא מה שקובע אם
  // אקסל יראה מספר לסכימה, תאריך למיון, או טקסט שישמור אפס מוביל (ת"ז/טלפון).
  let columns: Column[] = []
  let rows: CellValue[][] = []
  let filename = 'export'

  if (type === 'beneficiaries') {
    filename = 'צאצאים'
    // ⚠️ אותם פילטרים בדיוק כמו הרשימה במסך (status/marital/q/special).
    // עד כה הייצוא התעלם מהם והוריד תמיד את כל הטבלה — מי שסינן "ממתינים"
    // וייצא, קיבל קובץ עם כולם ולא ידע. הערכים מגיעים מכתובת הדף עצמה.
    const sp = request.nextUrl.searchParams
    const status = sp.get('status') ?? 'all'
    const marital = (sp.get('marital') ?? 'all').trim()
    const q = (sp.get('q') ?? '').trim()
    const special = sp.get('special') === '1'

    const data = await fetchAll<Row>((from, to) => {
      let qy = admin.from('beneficiaries')
        .select('family_name, full_name, id_number, spouse_name, spouse_id_number, marital_status, phone, email, city, address, children_count, eligibility_status, created_at')
      qy = special ? qy.eq('is_special', true) : qy.or('is_special.is.null,is_special.eq.false')
      if (status === 'pending') qy = qy.or(BEN_PENDING_OR)
      else if (status !== 'all') qy = qy.eq('eligibility_status', status)
      if (marital && marital !== 'all') qy = qy.in('marital_status', marital.split(',').filter(Boolean))
      if (q) qy = qy.or(benSearchOr(q))
      return qy.order('family_name').range(from, to)
    })
    columns = [
      { header: 'שם משפחה' }, { header: 'שם פרטי' }, { header: 'ת.ז', kind: 'id' },
      { header: 'בן/בת זוג' }, { header: 'ת.ז בן/זוג', kind: 'id' }, { header: 'מצב משפחתי' },
      { header: 'טלפון', kind: 'id' }, { header: 'מייל' }, { header: 'עיר' }, { header: 'כתובת' },
      { header: 'מס׳ ילדים', kind: 'number' }, { header: 'סטטוס' }, { header: 'נרשם', kind: 'date' },
    ]
    rows = (data ?? []).map((b: Row) => [b.family_name, b.full_name, b.id_number, b.spouse_name, b.spouse_id_number, b.marital_status, b.phone, b.email, b.city, b.address, b.children_count, he(b.eligibility_status), dt(b.created_at)])
  } else if (type === 'loans') {
    filename = 'הלוואות'
    // ⚠️ בלי טיוטות שממתינות לטופס אישור רב — הן אינן בקשות שהוגשו,
    // וייצואן היה מציג למקבל הקובץ בקשות שלא קיימות.
    const data = await fetchAll<Row>((from, to) => admin.from('loans')
      .select('amount, approved_amount, installments, monthly_payment, purpose, status, created_at, beneficiary:beneficiaries(family_name, full_name, id_number, phone)')
      .neq('status', 'awaiting_rabbi_form')
      .order('created_at', { ascending: false }).range(from, to))
    columns = [
      { header: 'משפחה' }, { header: 'ת.ז', kind: 'id' }, { header: 'טלפון', kind: 'id' },
      { header: 'סכום מבוקש', kind: 'number' }, { header: 'סכום מאושר', kind: 'number' },
      { header: 'תשלומים', kind: 'number' }, { header: 'תשלום חודשי', kind: 'number' },
      { header: 'מטרה' }, { header: 'סטטוס' }, { header: 'תאריך', kind: 'date' },
    ]
    rows = (data ?? []).map((l: Row) => [famName(l.beneficiary), l.beneficiary?.id_number, l.beneficiary?.phone, l.amount, l.approved_amount, l.installments, l.monthly_payment, l.purpose, he(l.status), dt(l.created_at)])
  } else if (type === 'maternity') {
    filename = 'יולדות'
    const data = await fetchAll<Row>((from, to) => admin.from('maternity_aids')
      .select('birth_date, recovery_home, status, card_status, card_number, created_at, beneficiary:beneficiaries(family_name, full_name, id_number, spouse_name, phone)')
      .order('created_at', { ascending: false }).range(from, to))
    columns = [
      { header: 'משפחה' }, { header: 'ת.ז', kind: 'id' }, { header: 'שם האשה' },
      { header: 'טלפון', kind: 'id' }, { header: 'תאריך לידה', kind: 'date' }, { header: 'בית החלמה' },
      { header: 'סטטוס' }, { header: 'סטטוס כרטיס' },
      // ⚠️ מספר כרטיס נשאר טקסט: הוא מזהה, לא כמות. כמספר הוא מאבד אפסים
      // מובילים ומקבל פסיקי אלפים.
      { header: 'מספר כרטיס', kind: 'id' }, { header: 'תאריך', kind: 'date' },
    ]
    rows = (data ?? []).map((m: Row) => [famName(m.beneficiary), m.beneficiary?.id_number, m.beneficiary?.spouse_name, m.beneficiary?.phone, dt(m.birth_date), m.recovery_home, he(m.status), he(m.card_status), m.card_number, dt(m.created_at)])
  } else if (type === 'financial_aid') {
    filename = 'סיוע-רפואי'
    const data = await fetchAll<Row>((from, to) => admin.from('financial_aid_requests')
      .select('reason, amount, status, created_at, beneficiary:beneficiaries(family_name, full_name, id_number, phone)')
      .order('created_at', { ascending: false }).range(from, to))
    columns = [
      { header: 'משפחה' }, { header: 'ת.ז', kind: 'id' }, { header: 'טלפון', kind: 'id' },
      { header: 'סיבה' }, { header: 'סכום', kind: 'number' }, { header: 'סטטוס' },
      { header: 'תאריך', kind: 'date' },
    ]
    rows = (data ?? []).map((r: Row) => [famName(r.beneficiary), r.beneficiary?.id_number, r.beneficiary?.phone, r.reason, r.amount, he(r.status), dt(r.created_at)])
  } else if (type === 'widows') {
    filename = 'אלמנות-ויתומים'
    const data = await fetchAll<Row>((from, to) => admin.from('widow_requests')
      .select('request_type, description, amount, status, created_at, beneficiary:beneficiaries(family_name, full_name, id_number, phone)')
      .order('created_at', { ascending: false }).range(from, to))
    columns = [
      { header: 'משפחה' }, { header: 'ת.ז', kind: 'id' }, { header: 'טלפון', kind: 'id' },
      { header: 'סוג בקשה' }, { header: 'תיאור' }, { header: 'סכום', kind: 'number' },
      { header: 'סטטוס' }, { header: 'תאריך', kind: 'date' },
    ]
    rows = (data ?? []).map((w: Row) => [famName(w.beneficiary), w.beneficiary?.id_number, w.beneficiary?.phone, w.request_type, w.description, w.amount, he(w.status), dt(w.created_at)])
  } else {
    return NextResponse.json({ error: 'סוג ייצוא לא מוכר' }, { status: 400 })
  }

  // ⚠️ שם הלשונית הוא שם המחלקה בלבד (בלי תאריך): קו נטוי אסור בשם גיליון,
  // והתאריך שייך לשם הקובץ.
  const buf = await buildXlsx([{ name: filename, columns, rows }])
  return new NextResponse(new Uint8Array(buf), { headers: xlsxHeaders(`${filename}-${todayStamp()}`) })
}
