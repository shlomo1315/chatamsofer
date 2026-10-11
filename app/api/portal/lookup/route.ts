import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient as getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')?.replace(/\D/g, '')
  if (!id || id.length < 5) {
    return NextResponse.json({ error: 'מספר תעודת זהות לא תקין' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ת"ז ישראלית היא 9 ספרות עם אפסים מובילים, אך לעיתים נשמרת במסד בלי האפס
  // המוביל (יבוא מאקסל שהמיר ל"מספר", או הקלדה ידנית). כדי שהזיהוי יעבוד בשני
  // הכיוונים אנחנו מחפשים כמה וריאנטים: הקלט כפי שהוא, מרופד ל-9 ספרות, וללא
  // אפסים מובילים. id_number הוא unique, כך שלכל היותר וריאנט אחד יתאים.
  const variants = Array.from(new Set([id, id.padStart(9, '0'), id.replace(/^0+/, '') || id]))

  const { data, error } = await admin
    .from('beneficiaries')
    .select('id, full_name, family_name, eligibility_status, is_active, phone, city, marital_status, created_at')
    .in('id_number', variants)
    .limit(1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ found: false })

  return NextResponse.json({ found: true, beneficiary: data[0] })
}
