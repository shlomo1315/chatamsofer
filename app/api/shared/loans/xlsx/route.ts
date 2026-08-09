// ייצוא רשימת ההלוואות שבפורטל לקובץ אקסל מעוצב.
//
// ⚠️ למה endpoint נפרד ולא /api/admin/xlsx: הפורטל אינו מסך ניהול. הוא נכנס
// עם סיסמת פורטל (עוגיית PORTAL_COOKIE) ולא עם חשבון צוות, ולכן גם ההרשאה
// כאן היא של הפורטל בלבד.
// ⚠️ הנתונים נשלפים מחדש בשרת ולא מתקבלים מהדפדפן: הסינון היחיד שיש במסך
// (בוצעה/ממתינה) נגזר מ-disbursed_at, והשרת יודע לחשב אותו בעצמו. כך שום
// שורה בקובץ אינה תלויה במה שהלקוח שלח.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyPortalToken, PORTAL_COOKIE } from '@/lib/loansPortalAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { buildXlsx, xlsxHeaders, todayStamp, type CellValue, type Column } from '@/lib/xlsx'

export const dynamic = 'force-dynamic'
// ⚠️ חובה — exceljs אינו רץ ב-Edge runtime.
export const runtime = 'nodejs'

type Loan = {
  approved_amount?: number | null
  amount?: number | null
  installments?: number | null
  disbursed_at?: string | null
  beneficiary?: {
    full_name?: string | null; family_name?: string | null; id_number?: string | null
    address?: string | null; city?: string | null; phone?: string | null; email?: string | null
  } | null
}

const FILTER_LABEL: Record<string, string> = {
  all: 'כל ההלוואות', pending: 'ממתינות לביצוע', done: 'בוצעו',
}

const COLUMNS: Column[] = [
  { header: 'שם משפחה' }, { header: 'שם פרטי' },
  // ⚠️ ת"ז וטלפון כטקסט. בגרסת ה-CSV נאלצו לעטוף את הטלפון ב-="05..." רק כדי
  // שאקסל לא יבלע את האפס המוביל; ב-xlsx התא פשוט מוגדר כטקסט.
  { header: 'ת.ז.', kind: 'id' }, { header: 'רחוב' }, { header: 'עיר' },
  { header: 'טלפון', kind: 'id' }, { header: 'מייל' },
  { header: 'סכום מאושר', kind: 'number' }, { header: 'מספר תשלומים', kind: 'number' },
  { header: 'סטטוס' }, { header: 'תאריך ביצוע', kind: 'date' },
]

export async function GET(req: NextRequest) {
  const token = req.cookies.get(PORTAL_COOKIE)?.value
  if (!(await verifyPortalToken(token))) {
    return NextResponse.json({ error: 'נדרשת אימות' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  // ⚠️ הערך מהכתובת נבדק מול הרשימה הסגורה, ולא נכנס לשם הקובץ כמות שהוא —
  // אחרת קלט משתמש היה זולג לכותרת Content-Disposition.
  const requested = (req.nextUrl.searchParams.get('filter') ?? 'all').toLowerCase()
  const filter = requested in FILTER_LABEL ? requested : 'all'

  // ⚠️ אותה שאילתה בדיוק כמו /api/shared/loans, כולל fetchAllRows — בלעדיו
  // הקובץ נקטע ב-1,000 שורות בשקט.
  // ⚠️ <unknown> ואז המרה: הטיפוסים שנגזרים מהסכימה מתארים embed של יחיד
  // כמערך, ולכן חתימת Loan לעולם לא תתאים להם ישירות (כך גם ב-/api/shared/loans).
  const { rows: raw } = await fetchAllRows<unknown>((from, to) => admin
    .from('loans')
    .select('amount, approved_amount, installments, disbursed_at, beneficiary:beneficiaries(full_name, family_name, id_number, city, address, phone, email)')
    .in('status', ['approved', 'active'])
    .order('created_at', { ascending: false })
    .range(from, to))
  const loans = (raw ?? []) as Loan[]

  const visible = loans.filter(l =>
    filter === 'pending' ? !l.disbursed_at : filter === 'done' ? !!l.disbursed_at : true)

  const rows: CellValue[][] = visible.map(l => {
    const b = l.beneficiary
    return [
      b?.family_name, b?.full_name, b?.id_number, b?.address, b?.city, b?.phone, b?.email,
      Number(l.approved_amount ?? l.amount) || 0,
      l.installments,
      l.disbursed_at ? 'בוצעה' : 'ממתינה לביצוע',
      l.disbursed_at ? new Date(l.disbursed_at) : null,
    ]
  })

  const buf = await buildXlsx([{ name: FILTER_LABEL[filter], columns: COLUMNS, rows }])
  return new NextResponse(new Uint8Array(buf), {
    headers: xlsxHeaders(`הלוואות-${FILTER_LABEL[filter]}-${todayStamp()}`),
  })
}
