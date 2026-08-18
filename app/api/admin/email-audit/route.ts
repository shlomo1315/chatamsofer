import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { isValidEmail } from '@/lib/emailVerification'
import { suggestDomainFix } from '@/lib/emailDomainFix'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// תמונת מצב של כתובות המייל במאגר — לפני החלטה על דיוור המוני.
//
// 🔴 למה זה נדרש: שליחה המונית לכתובות שלא אומתו היא הסיכון הגדול ביותר
// למוניטין הדומיין. שיעור bounce גבוה גורם לספקים (Gmail/Outlook) להוריד
// את הדירוג, ואז *גם* המיילים הקריטיים — קודי אימות, אישורי בקשות — מתחילים
// ליפול לספאם. זה נזק שלוקח שבועות לתקן.
//
// המסך הזה אינו שולח דבר. הוא רק אומר כמה כתובות יש ובאיזה מצב, כדי
// שההחלטה תתקבל על נתונים ולא על הערכה.
// ─────────────────────────────────────────────────────────────────────────────

interface Row {
  id: string
  email?: string | null
  email_verified_at?: string | null
  eligibility_status?: string | null
}

export async function GET() {
  const staff = await requirePermission('beneficiaries', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ fetchAllRows ולא .limit() — תקרת 1,000 הייתה חותכת את הספירה בשקט
  // ומחזירה תמונת מצב שגויה. ראו lib/fetchAllRows.
  const { rows, error } = await fetchAllRows<Row>((from, to) => db
    .from('beneficiaries')
    .select('id, email, email_verified_at, eligibility_status')
    .range(from, to))
  if (error) return NextResponse.json({ error }, { status: 500 })

  let withEmail = 0
  let verified = 0
  let unverifiedValid = 0     // תקינה במבנה אך לא אומתה — קהל היעד לדיוור
  let unverifiedFixable = 0   // שגיאת דומיין מוכרת (gnail→gmail) — לתקן לפני שליחה
  let unverifiedBroken = 0    // פגומה ואין תיקון ודאי — לא לשלוח כלל
  let noEmail = 0
  const domains = new Map<string, number>()

  for (const r of rows) {
    const email = (r.email ?? '').trim()
    if (!email) { noEmail++; continue }
    withEmail++

    if (r.email_verified_at) { verified++; continue }

    // ⚠️ הסדר חשוב: כתובת עם שגיאת דומיין מוכרת עשויה לעבור את isValidEmail
    // (gnail.com הוא דומיין תקין מבחינת מבנה), ולכן נבדקת קודם.
    if (suggestDomainFix(email)) { unverifiedFixable++; continue }
    if (!isValidEmail(email)) { unverifiedBroken++; continue }

    unverifiedValid++
    const d = email.split('@')[1]?.toLowerCase()
    if (d) domains.set(d, (domains.get(d) ?? 0) + 1)
  }

  // הדומיינים הנפוצים בקרב הלא-מאומתים — Gmail הוא הסלחני ביותר,
  // ולכן תמהיל שנשלט על ידו מסוכן פחות מתמהיל של דומיינים ארגוניים.
  const topDomains = [...domains.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([domain, count]) => ({ domain, count }))

  return NextResponse.json({
    total: rows.length,
    noEmail,
    withEmail,
    verified,
    unverifiedValid,
    unverifiedFixable,
    unverifiedBroken,
    topDomains,
    // המלצת מנות: ~200 ליום היא קצב שמאפשר לראות bounce לפני שנגרם נזק.
    suggestedBatchPerDay: 200,
    suggestedDays: Math.ceil(unverifiedValid / 200),
  })
}
