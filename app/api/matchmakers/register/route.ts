import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { validateRegister } from '@/lib/matchmaker/validate'
import { encryptValue, hashValue } from '@/lib/matchmaker/crypto'
import { issueLoginCode } from '@/lib/matchmaker/loginCode'
import { JSON_HEADERS } from '@/lib/matchmaker/session'

export const dynamic = 'force-dynamic'

// הרשמת שדכן. המייל מאומת בקוד לפני שהחשבון נחשב פעיל.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400, headers: JSON_HEADERS }) }
  // מלכודת בוטים שקטה: שדה מוסתר שאדם אינו ממלא. מדמים הצלחה.
  if (typeof body.website === 'string' && body.website) return NextResponse.json({ ok: true }, { headers: JSON_HEADERS })

  if (!rateLimit(`mm-reg:${clientIp(request) ?? 'unknown'}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }, { status: 429, headers: { ...JSON_HEADERS, 'Retry-After': '3600' } })
  }
  const v = validateRegister(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400, headers: JSON_HEADERS })
  const f = v.value

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: JSON_HEADERS })

  const idHash = hashValue(f.id_number)
  const { data: dup } = await db.from('matchmakers').select('id').or(`id_hash.eq.${idHash},email_norm.eq.${f.email},phone_norm.eq.${f.phone}`).limit(1)
  if (dup?.length) {
    return NextResponse.json({ error: 'כבר קיים חשבון עם הפרטים האלה. היכנסו עם קוד שנשלח למייל.', exists: true }, { status: 409, headers: JSON_HEADERS })
  }

  const { data: created, error } = await db.from('matchmakers').insert({
    first_name: f.first_name, last_name: f.last_name, id_enc: encryptValue(f.id_number), id_hash: idHash,
    phone: f.phone, phone_norm: f.phone, email: f.email, email_norm: f.email,
    address: f.address, city: f.city, birth_date: f.birth_date, circle: f.circle,
    bank_name: f.bank_name, bank_branch: f.bank_branch, bank_account_enc: encryptValue(f.bank_account),
  }).select('id, first_name, email').single()
  if (error || !created) {
    // מרוץ בין שתי הרשמות זהות: אילוץ הייחודיות במסד מכריע
    const raced = error?.code === '23505'
    return NextResponse.json({ error: raced ? 'כבר קיים חשבון עם הפרטים האלה.' : 'שגיאת שרת' }, { status: raced ? 409 : 500, headers: JSON_HEADERS })
  }
  const sent = await issueLoginCode(db, created)
  if (!sent) return NextResponse.json({ error: 'ההרשמה נשמרה אך שליחת הקוד נכשלה. בקשו קוד חדש במסך הכניסה.' }, { status: 502, headers: JSON_HEADERS })
  return NextResponse.json({ ok: true, email: created.email }, { headers: JSON_HEADERS })
}
