import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { JSON_HEADERS, currentMatchmaker } from '@/lib/matchmaker/session'
import { MM_COOKIE, SESSION_COOKIE_OPTIONS, issueSession } from '@/lib/matchmaker/crypto'

export const dynamic = 'force-dynamic'

// פרטי השדכן והבקשות שלו. השדכן רואה סטטוס וסכום מאושר בלבד:
// אף פעם לא את תוצאת האימות הפנימית מול הצאצאים ולא תעודות זהות.
export async function GET(request: NextRequest) {
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: JSON_HEADERS })
  const m = await currentMatchmaker(request, db)
  if (!m) return NextResponse.json({ error: 'נדרשת כניסה' }, { status: 401, headers: JSON_HEADERS })

  const { data: claims } = await db.from('matchmaker_claims')
    .select('id, match_date, groom_first_name, groom_last_name, bride_first_name, bride_last_name, is_grandchild, status, amount, reject_reason, created_at')
    .eq('matchmaker_id', m.id).order('created_at', { ascending: false }).limit(200)

  const res = NextResponse.json({
    matchmaker: { first_name: m.first_name, last_name: m.last_name, email: m.email },
    claims: (claims ?? []).map(c => ({ ...c, amount: c.status === 'approved' || c.status === 'paid' ? c.amount : null })),
  }, { headers: JSON_HEADERS })
  // חוסר פעילות: כל פנייה מאריכה את הסשן ב-30 דקות
  res.cookies.set(MM_COOKIE, issueSession(m.id), SESSION_COOKIE_OPTIONS)
  return res
}
