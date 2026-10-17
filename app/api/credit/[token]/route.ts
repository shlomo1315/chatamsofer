import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { cleanHolder, validateBank, BANK_SAVE_STATUSES } from '@/lib/bookFairCredits'

// טופס פרטי חשבון ציבורי בקישור אישי מהמייל. הגישה רק עם הטוקן (48 תווי hex אקראיים),
// עם הגבלת קצב. לעולם לא מחזיר פרטי בנק, ואינו כותב אותם ללוגים.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TOKEN_RE = /^[a-f0-9]{48}$/
const NO_STORE = { 'Cache-Control': 'no-store' }

type Ctx = { params: Promise<{ token: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  const { token } = await params
  if (!rateLimit(`credit:get:${clientIp(request)}`, 30, 10 * 60_000)) return NextResponse.json({ error: 'יותר מדי בקשות, נסו שוב מאוחר יותר' }, { status: 429 })
  const db = getServiceClient()
  if (!TOKEN_RE.test(token) || !db) return NextResponse.json({ error: 'הקישור אינו תקין' }, { status: 404 })
  const { data } = await db.from('book_fair_credits')
    .select('customer_name, books, amount_agorot, status').eq('token', token).maybeSingle()
  if (!data) return NextResponse.json({ error: 'הקישור אינו תקין' }, { status: 404 })
  if (data.status !== 'details_entered' && data.status !== 'answered') {
    await db.from('book_fair_credits').update({ status: 'answered', answered_at: new Date().toISOString() })
      .eq('token', token).eq('status', 'sent')
  }
  return NextResponse.json({
    name: data.customer_name, books: data.books, amountAgorot: data.amount_agorot, done: data.status === 'details_entered',
  }, { headers: NO_STORE })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { token } = await params
  if (!rateLimit(`credit:post:${clientIp(request)}`, 10, 10 * 60_000)) return NextResponse.json({ error: 'יותר מדי ניסיונות, נסו שוב מאוחר יותר' }, { status: 429 })
  const db = getServiceClient()
  if (!TOKEN_RE.test(token) || !db) return NextResponse.json({ error: 'הקישור אינו תקין' }, { status: 404 })

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const holder = cleanHolder(body?.holder)
  const bank = String(body?.bank ?? '').replace(/\D/g, '')
  const branch = String(body?.branch ?? '').replace(/\D/g, '')
  const account = String(body?.account ?? '').replace(/\D/g, '')
  if (holder.length < 2) return NextResponse.json({ error: 'נא למלא את שם בעל החשבון' }, { status: 400 })
  const bad = validateBank({ bank, branch, account })
  if (bad) return NextResponse.json({ error: bad }, { status: 400 })

  const { data, error } = await db.from('book_fair_credits').update({
    status: 'details_entered', details_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    bank_holder: holder, bank_number: bank, bank_branch: branch, bank_account: account,
  }).eq('token', token).in('status', [...BANK_SAVE_STATUSES]).select('id')
  if (error) {
    console.error('[credit] שמירה נכשלה', error.code)
    return NextResponse.json({ error: 'השמירה נכשלה, נסו שוב' }, { status: 422 })
  }
  // ריק = כבר הוזנו פרטים, הזיכוי לא נשלח, או שהטוקן לא קיים: לא שומרים ולא דורסים.
  if (!data?.length) return NextResponse.json({ error: 'הפרטים כבר התקבלו, או שהקישור אינו תקין' }, { status: 409 })
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
