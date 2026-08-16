import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient, forbidden } from '@/lib/apiAuth'
import { OPEN_LOAN_STATUSES } from '@/lib/openLoanGuard'

// ─────────────────────────────────────────────────────────────────────────────
// "קפיצה לרשומה" מתיבת המייל.
//
// מזכיר שקורא "מה קורה עם ההלוואה שלי?" צריך להגיע לכרטסת של אותו אדם
// בלחיצה אחת, במקום לחפש אותו לפי שם ברשימה.
//
// ⚠️ מחזיר את *כל* הבקשות הפעילות, לא רק הלוואות: אותה שאלה יכולה להגיע
// גם על לידה. הצגת סוג אחד בלבד הייתה מחזירה "אין רשומות" למי שיש לו
// בקשה פתוחה מסוג אחר.
//
// ⚠️ אין middleware — כל מסלול מגן על עצמו.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

/** לידות פעילות: הוגשו וטרם נסגרו/בוטלו. */
const OPEN_MATERNITY = ['pending', 'approved', 'active']

export async function GET(request: NextRequest) {
  const ctx = await requireStaff()
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const email = (request.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'כתובת חסרה' }, { status: 400 })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ ilike ולא eq: כתובות נשמרות בכתיב מעורב, והשוואה רגישת-רישיות
  // החמיצה מוטבים קיימים (זו הסיבה שביצוע ה-batch בתיבה מפספס לפעמים).
  const { data: bens } = await db
    .from('beneficiaries')
    .select('id, family_name, full_name, spouse_name, id_number, eligibility_status')
    .ilike('email', email)
    .limit(5)

  if (!bens?.length) return NextResponse.json({ beneficiaries: [], loans: [], maternity: [] })

  const ids = bens.map(b => String(b.id))

  const [loansRes, matRes] = await Promise.all([
    db.from('loans')
      .select('id, beneficiary_id, amount, approved_amount, status, created_at')
      .in('beneficiary_id', ids)
      // ⚠️ כולל טיוטות שממתינות לטופס רב: השאלה "מה קורה עם ההלוואה שלי"
      // מגיעה דווקא ממי שתקוע בשלב הזה.
      .order('created_at', { ascending: false })
      .limit(20),
    db.from('maternity_aids')
      .select('id, beneficiary_id, baby_name, status, created_at')
      .in('beneficiary_id', ids)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const nameOf = (bid: string) => {
    const b = bens.find(x => String(x.id) === String(bid))
    return b ? [b.family_name, b.full_name || b.spouse_name].filter(Boolean).join(' ') : ''
  }

  const openLoans: string[] = OPEN_LOAN_STATUSES as unknown as string[]

  return NextResponse.json({
    beneficiaries: bens.map(b => ({
      id: b.id,
      name: [b.family_name, b.full_name || b.spouse_name].filter(Boolean).join(' '),
      idNumber: b.id_number,
      status: b.eligibility_status,
    })),
    loans: (loansRes.data ?? []).map(l => ({
      id: l.id,
      name: nameOf(String(l.beneficiary_id)),
      amount: l.approved_amount ?? l.amount,
      status: l.status,
      createdAt: l.created_at,
      // ⚠️ מסומן ולא מסונן: בקשה סגורה עדיין רלוונטית לשאלה עליה, אבל
      // המזכיר צריך לראות מיד מה פעיל ומה היסטוריה.
      open: openLoans.includes(String(l.status)) || l.status === 'awaiting_rabbi_form',
    })),
    maternity: (matRes.data ?? []).map(m => ({
      id: m.id,
      name: nameOf(String(m.beneficiary_id)),
      babyName: m.baby_name,
      status: m.status,
      createdAt: m.created_at,
      open: OPEN_MATERNITY.includes(String(m.status)),
    })),
  })
}
