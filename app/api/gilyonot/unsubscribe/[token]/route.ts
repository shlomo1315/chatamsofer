import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import {
  isRecipientToken, confirmPage, stayPage, removedPage, backPage, invalidPage, errorPage,
  removeEverywhere, restoreEverywhere, isRemoved,
} from '@/lib/gilyonotUnsubscribe'

// הסרה מקישור בתחתית הגיליון, למנוי רשום (טוקן המנוי).
// GET  — מסך אזהרה עם "אישור הסרה" ו"ביטול". לא מסיר מיד (סורקי אבטחה לוחצים על קישורים).
// POST ?confirm=1 — אישור מהמסך: הסרה מכל המערכת (unsubscribes + המנוי).
// POST ?resubscribe=1 — הסרתי בטעות.
// POST בלי פרמטר — One-Click של Gmail: מסיר רק מהגיליון, כי הנמען לא ראה את האזהרה.
// ⚠️ ציבורי בכוונה: האימות הוא הטוקן האקראי (uuid) של הנמען, בטבלה שרק service_role ניגש אליה.
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ token: string }> }

async function findSubscriber(token: string) {
  if (!isRecipientToken(token)) return null
  const db = getServiceClient()
  if (!db) return null
  const { data } = await db.from('gilyonot_subscribers').select('id, email, status').eq('token', token).maybeSingle()
  return data ? { db, sub: data as { id: string; email: string; status: string } } : null
}

export async function GET(request: NextRequest, { params }: Ctx) {
  const { token } = await params
  const found = await findSubscriber(token)
  if (!found) return invalidPage()
  const base = `/api/gilyonot/unsubscribe/${token}`
  if (new URL(request.url).searchParams.has('stay')) return stayPage()
  if (await isRemoved(found.db, found.sub.email)) return removedPage(base)
  return confirmPage(base, found.sub.email)
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { token } = await params
  const q = new URL(request.url).searchParams
  const found = await findSubscriber(token)
  const fromPage = q.has('confirm') || q.has('resubscribe')
  if (!found) return fromPage ? invalidPage() : NextResponse.json({ ok: false }, { status: 400 })
  const { db, sub } = found
  const base = `/api/gilyonot/unsubscribe/${token}`
  const now = new Date().toISOString()

  if (q.get('resubscribe') === '1') {
    return (await restoreEverywhere(db, sub.email)) ? backPage() : errorPage('לא הצלחנו להחזיר אתכם. נסו שוב.')
  }

  const wasActive = sub.status !== 'unsubscribed'
  if (fromPage) {
    if (!(await removeEverywhere(db, sub.email))) return errorPage('ההסרה נכשלה. נסו שוב.')
  } else if (wasActive) {
    const { error } = await db.from('gilyonot_subscribers')
      .update({ status: 'unsubscribed', unsubscribed_at: now, updated_at: now }).eq('id', sub.id)
    if (error) { console.error('[gilyonot] הסרה נכשלה:', error.message); return NextResponse.json({ ok: false }, { status: 500 }) }
  }
  if (wasActive) {
    // שיוך ההסרה לגיליון האחרון שנשלח לנמען, לסטטיסטיקה
    const { data: last } = await db.from('gilyonot_deliveries').select('id').eq('subscriber_id', sub.id)
      .eq('status', 'sent').order('sent_at', { ascending: false }).limit(1).maybeSingle()
    if (last) await db.from('gilyonot_deliveries').update({ unsubscribed_at: now }).eq('id', last.id).is('unsubscribed_at', null)
  }
  return fromPage ? removedPage(base) : NextResponse.json({ ok: true })
}
