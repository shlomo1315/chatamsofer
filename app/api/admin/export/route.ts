// ייצוא נתוני מחלקה לקובץ אקסל (CSV עם BOM שנפתח ישירות באקסל).
// שימוש: /api/admin/export?type=beneficiaries|loans|maternity|financial_aid|widows
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import type { SectionKey } from '@/types'

export const dynamic = 'force-dynamic'

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
const dt = (s?: string | null) => s ? new Date(s).toLocaleDateString('he-IL') : ''

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))]
  return '﻿' + lines.join('\r\n') // BOM כדי שאקסל יזהה UTF-8 (עברית)
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

  let headers: string[] = []
  let rows: (string | number | null | undefined)[][] = []
  let filename = 'export'

  if (type === 'beneficiaries') {
    filename = 'צאצאים'
    const { data } = await admin.from('beneficiaries')
      .select('family_name, full_name, id_number, spouse_name, spouse_id_number, marital_status, phone, email, city, address, children_count, eligibility_status, created_at')
      .order('family_name')
    headers = ['שם משפחה', 'שם פרטי', 'ת.ז', 'בן/בת זוג', 'ת.ז בן/זוג', 'מצב משפחתי', 'טלפון', 'מייל', 'עיר', 'כתובת', 'מס׳ ילדים', 'סטטוס', 'נרשם']
    rows = (data ?? []).map((b: Row) => [b.family_name, b.full_name, b.id_number, b.spouse_name, b.spouse_id_number, b.marital_status, b.phone, b.email, b.city, b.address, b.children_count, he(b.eligibility_status), dt(b.created_at)])
  } else if (type === 'loans') {
    filename = 'הלוואות'
    const { data } = await admin.from('loans')
      .select('amount, approved_amount, installments, monthly_payment, purpose, status, created_at, beneficiary:beneficiaries(family_name, full_name, id_number, phone)')
      .order('created_at', { ascending: false })
    headers = ['משפחה', 'ת.ז', 'טלפון', 'סכום מבוקש', 'סכום מאושר', 'תשלומים', 'תשלום חודשי', 'מטרה', 'סטטוס', 'תאריך']
    rows = (data ?? []).map((l: Row) => [famName(l.beneficiary), l.beneficiary?.id_number, l.beneficiary?.phone, l.amount, l.approved_amount, l.installments, l.monthly_payment, l.purpose, he(l.status), dt(l.created_at)])
  } else if (type === 'maternity') {
    filename = 'יולדות'
    const { data } = await admin.from('maternity_aids')
      .select('birth_date, recovery_home, status, card_status, card_number, created_at, beneficiary:beneficiaries(family_name, full_name, id_number, spouse_name, phone)')
      .order('created_at', { ascending: false })
    headers = ['משפחה', 'ת.ז', 'שם האשה', 'טלפון', 'תאריך לידה', 'בית החלמה', 'סטטוס', 'סטטוס כרטיס', 'מספר כרטיס', 'תאריך']
    rows = (data ?? []).map((m: Row) => [famName(m.beneficiary), m.beneficiary?.id_number, m.beneficiary?.spouse_name, m.beneficiary?.phone, dt(m.birth_date), m.recovery_home, he(m.status), he(m.card_status), m.card_number, dt(m.created_at)])
  } else if (type === 'financial_aid') {
    filename = 'סיוע-רפואי'
    const { data } = await admin.from('financial_aid_requests')
      .select('reason, amount, status, created_at, beneficiary:beneficiaries(family_name, full_name, id_number, phone)')
      .order('created_at', { ascending: false })
    headers = ['משפחה', 'ת.ז', 'טלפון', 'סיבה', 'סכום', 'סטטוס', 'תאריך']
    rows = (data ?? []).map((r: Row) => [famName(r.beneficiary), r.beneficiary?.id_number, r.beneficiary?.phone, r.reason, r.amount, he(r.status), dt(r.created_at)])
  } else if (type === 'widows') {
    filename = 'אלמנות-ויתומים'
    const { data } = await admin.from('widow_requests')
      .select('request_type, description, amount, status, created_at, beneficiary:beneficiaries(family_name, full_name, id_number, phone)')
      .order('created_at', { ascending: false })
    headers = ['משפחה', 'ת.ז', 'טלפון', 'סוג בקשה', 'תיאור', 'סכום', 'סטטוס', 'תאריך']
    rows = (data ?? []).map((w: Row) => [famName(w.beneficiary), w.beneficiary?.id_number, w.beneficiary?.phone, w.request_type, w.description, w.amount, he(w.status), dt(w.created_at)])
  } else {
    return NextResponse.json({ error: 'סוג ייצוא לא מוכר' }, { status: 400 })
  }

  const csv = toCsv(headers, rows)
  const today = new Date().toLocaleDateString('he-IL').replace(/\//g, '-')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${filename}-${today}.csv`)}`,
      'Cache-Control': 'no-store',
    },
  })
}
