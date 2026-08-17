import { NextResponse, type NextRequest } from 'next/server'
import { requireMailAccess, getServiceClient, forbidden } from '@/lib/apiAuth'
import { roleAllows } from '@/lib/permissions'
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
//
// 🔴 המסלול הזה יושב תחת /mail אבל מחזיר נתוני *הלוואות ולידות* — סכומים,
// סטטוסים, ת"ז. requireStaff() ריק פירושו כל עובד פעיל, כולל mail_only
// וכולל מזכיר שסומן לו במפורש "בלי הלוואות". כלומר עמדת המייל הייתה דלת
// צדדית אל בדיוק המידע שההרשאות נועדו לסגור.
//
// לכן שתי שכבות: גישת דואר כדי לקרוא בכלל, ואז סינון לפי ההרשאה לכל סוג
// בנפרד. מי שאין לו 'loans' מקבל loans: [] — לא 403, כי הפאנל עצמו לגיטימי
// והוא כן אמור לראות את הלידות. ⚠️ mail_only עובר את requireMailAccess
// כחריג מכוון, ולכן הוא *חייב* להיבדק כאן שוב ולא לרשת את הפטור.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

/** לידות פעילות: הוגשו וטרם נסגרו/בוטלו. */
const OPEN_MATERNITY = ['pending', 'approved', 'active']

export async function GET(request: NextRequest) {
  const ctx = await requireMailAccess()
  if (!ctx) return forbidden()

  // ⚠️ admin עוקף; mail_only אינו עוקף — הוא נכנס לכאן דרך חריג בגישת הדואר,
  // ואם נשאיר אותו בלי בדיקה נקבל בדיוק את הדליפה שסגרנו.
  const isAdmin = ctx.role === 'admin'
  const canSee = (section: 'loans' | 'maternity' | 'beneficiaries') =>
    isAdmin || (!ctx.mailOnly && roleAllows(ctx.role, ctx.permissions, section, 'view'))

  // מי שאינו רשאי לראות אף אחד משלושת הסוגים לא מגיע למסד כלל — הפאנל
  // ריק ממילא, ואין סיבה לשלוף PII כדי להשליך אותו מיד אחר כך.
  if (!canSee('beneficiaries') && !canSee('loans') && !canSee('maternity')) {
    return NextResponse.json({ beneficiaries: [], loans: [], maternity: [] })
  }

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

  // ⚠️ לא שולפים כלל את מה שאסור להציג. סינון בפלט בלבד היה משאיר את
  // הנתונים בזיכרון התהליך ובלוגים, ומזמין דליפה בשינוי הבא.
  const [loansRes, matRes] = await Promise.all([
    canSee('loans')
      ? db.from('loans')
          .select('id, beneficiary_id, amount, approved_amount, status, created_at')
          .in('beneficiary_id', ids)
          // ⚠️ כולל טיוטות שממתינות לטופס רב: השאלה "מה קורה עם ההלוואה שלי"
          // מגיעה דווקא ממי שתקוע בשלב הזה.
          .order('created_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: null }),
    canSee('maternity')
      ? db.from('maternity_aids')
          .select('id, beneficiary_id, baby_name, status, created_at')
          .in('beneficiary_id', ids)
          .order('created_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: null }),
  ])

  const nameOf = (bid: string) => {
    const b = bens.find(x => String(x.id) === String(bid))
    return b ? [b.family_name, b.full_name || b.spouse_name].filter(Boolean).join(' ') : ''
  }

  const openLoans: string[] = OPEN_LOAN_STATUSES as unknown as string[]

  return NextResponse.json({
    // ⚠️ השם נחוץ כדי לתייג את הבקשות למטה ("ההלוואה של מי"), ולכן הוא
    // מוצג למי שרשאי לראות אחד מהסוגים. ת"ז — לא: היא אינה נדרשת לזיהוי
    // בהקשר הזה, ומי שאין לו 'beneficiaries' לא אמור לקבל אותה מהדלת הזו.
    beneficiaries: bens.map(b => ({
      id: b.id,
      name: [b.family_name, b.full_name || b.spouse_name].filter(Boolean).join(' '),
      idNumber: canSee('beneficiaries') ? b.id_number : null,
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
