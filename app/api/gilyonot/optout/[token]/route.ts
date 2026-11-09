import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import {
  isRecipientToken, confirmPage, stayPage, removedPage, backPage, invalidPage, errorPage,
  removeEverywhere, restoreEverywhere, isRemoved,
} from '@/lib/gilyonotUnsubscribe'

// הסרה מכל המערכת לנמען שקיבל את הגיליון מרשימה חיצונית (צאצאים, תורמים וכו'), לפי טוקן המשלוח.
// GET  — מסך אזהרה עם "אישור הסרה" ו"ביטול". לא מסיר מיד (סורקי אבטחה לוחצים על קישורים).
// POST — One-Click של Gmail (בלי confirm) או אישור מהמסך (?confirm=1). ?resubscribe=1 — הסרתי בטעות.
// ⚠️ ציבורי בכוונה: האימות הוא טוקן המשלוח האקראי (uuid). ההסרה נרשמת בטבלה unsubscribes,
// שמסוננת בגיליונות, בניוזלטר ובדיוור היריד.
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ token: string }> }

async function findDelivery(token: string) {
  if (!isRecipientToken(token)) return null
  const db = getServiceClient()
  if (!db) return null
  const { data } = await db.from('gilyonot_deliveries').select('id, email').eq('token', token).maybeSingle()
  return data ? { db, delivery: data as { id: string; email: string } } : null
}

export async function GET(request: NextRequest, { params }: Ctx) {
  const { token } = await params
  const found = await findDelivery(token)
  if (!found) return invalidPage()
  const base = `/api/gilyonot/optout/${token}`
  if (new URL(request.url).searchParams.has('stay')) return stayPage()
  if (await isRemoved(found.db, found.delivery.email)) return removedPage(base)
  return confirmPage(base, found.delivery.email)
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { token } = await params
  const q = new URL(request.url).searchParams
  const fromPage = q.has('confirm') || q.has('resubscribe')
  const found = await findDelivery(token)
  if (!found) return fromPage ? invalidPage() : NextResponse.json({ ok: false }, { status: 400 })
  const { db, delivery } = found

  if (q.get('resubscribe') === '1') {
    return (await restoreEverywhere(db, delivery.email)) ? backPage() : errorPage('לא הצלחנו להחזיר אתכם. נסו שוב.')
  }
  if (!(await removeEverywhere(db, delivery.email))) {
    return fromPage ? errorPage('ההסרה נכשלה. נסו שוב.') : NextResponse.json({ ok: false }, { status: 500 })
  }
  await db.from('gilyonot_deliveries').update({ unsubscribed_at: new Date().toISOString() }).eq('id', delivery.id).is('unsubscribed_at', null)
  return fromPage ? removedPage(`/api/gilyonot/optout/${token}`) : NextResponse.json({ ok: true })
}
