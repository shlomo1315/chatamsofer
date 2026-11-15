import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit } from '@/lib/rateLimit'
import { validateClaim } from '@/lib/matchmaker/validate'
import { encryptValue, hashValue } from '@/lib/matchmaker/crypto'
import { verifyGrandchild } from '@/lib/matchmaker/grandchildCheck'
import { loadSettings, suggestedAmount } from '@/lib/matchmaker/settings'
import { sendClaimReceived } from '@/lib/matchmaker/mail'
import { JSON_HEADERS, currentMatchmaker } from '@/lib/matchmaker/session'

export const dynamic = 'force-dynamic'

// הגשת בקשת מלגה על שידוך. אימות "נכד החתם סופר" נשמר עם הבקשה ונראה למנהל בלבד.
export async function POST(request: NextRequest) {
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: JSON_HEADERS })
  const m = await currentMatchmaker(request, db)
  if (!m) return NextResponse.json({ error: 'נדרשת כניסה' }, { status: 401, headers: JSON_HEADERS })
  if (!rateLimit(`mm-claim:${m.id}`, 10, 60 * 60_000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות בשעה האחרונה.' }, { status: 429, headers: JSON_HEADERS })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400, headers: JSON_HEADERS }) }
  const v = validateClaim(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400, headers: JSON_HEADERS })
  const c = v.value

  const settings = await loadSettings(db)
  if (settings.max_claims_per_matchmaker != null) {
    const { count } = await db.from('matchmaker_claims').select('id', { count: 'exact', head: true }).eq('matchmaker_id', m.id)
    if ((count ?? 0) >= settings.max_claims_per_matchmaker) {
      return NextResponse.json({ error: 'הגעתם למספר הבקשות המרבי. פנו למשרד.' }, { status: 403, headers: JSON_HEADERS })
    }
  }

  const verification = c.is_grandchild && c.grandchild_side
    ? await verifyGrandchild(db, c.grandchild_side, { groom: c.groom_id, bride: c.bride_id })
    : null

  const { error } = await db.from('matchmaker_claims').insert({
    matchmaker_id: m.id, match_date: c.match_date,
    groom_first_name: c.groom_first_name, groom_last_name: c.groom_last_name,
    groom_id_enc: encryptValue(c.groom_id), groom_id_hash: hashValue(c.groom_id),
    groom_father_name: c.groom_father_name || null, groom_phone: c.groom_phone || null,
    bride_first_name: c.bride_first_name, bride_last_name: c.bride_last_name,
    bride_id_enc: encryptValue(c.bride_id), bride_id_hash: hashValue(c.bride_id),
    bride_father_name: c.bride_father_name || null, bride_phone: c.bride_phone || null,
    is_grandchild: c.is_grandchild, grandchild_side: c.grandchild_side, verification,
    amount: suggestedAmount(settings, c.is_grandchild),
  })
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'בקשה על השידוך הזה כבר הוגשה.' }, { status: 409, headers: JSON_HEADERS })
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: JSON_HEADERS })
  }
  void sendClaimReceived(m.email, m.first_name, `${c.groom_first_name} ${c.groom_last_name}`, `${c.bride_first_name} ${c.bride_last_name}`).catch(() => {})
  return NextResponse.json({ ok: true }, { status: 201, headers: JSON_HEADERS })
}
