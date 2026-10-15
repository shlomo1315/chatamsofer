// ─────────────────────────────────────────────────────────────────────────────
// Webhook לימות המשיח: שלוחת המפיצים של הגיליונות (מערכת ומספר נפרדים).
//
// מה המתקשר שומע: lib/gilyonotDistributorPhone.ts. כאן טוענים את המפיץ לפי
// מספר הטלפון ומבצעים את הפעולה, באותם כללים כמו באתר (channel='phone').
//
// בימות: מודול api עם api_link לכתובת הזו ו-api_add_0=ApiToken=<YEMOT_GILYONOT_SECRET>.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { safeEqual } from '@/lib/svix'
import { normalizePhone } from '@/lib/kvitel'
import { isAgentAvailable } from '@/lib/gilyonotDistributors'
import { loadDistributorSettings, recordPhoneMessage, requestHilula, runDistributorAction } from '@/lib/gilyonotDistributorServer'
import { MAX_PICK, distributorPhoneTurn, failReply, type PhoneDistributor } from '@/lib/gilyonotDistributorPhone'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function yemotText(body: string) {
  return new NextResponse(body.endsWith('&') ? body : `${body}&`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

export async function GET(request: NextRequest) { return handle(request) }
export async function POST(request: NextRequest) { return handle(request) }

async function handle(request: NextRequest) {
  const params: Record<string, string> = {}
  request.nextUrl.searchParams.forEach((v, k) => { params[k] = v })
  if (request.method === 'POST') {
    try { (await request.formData()).forEach((v, k) => { params[k] = String(v) }) } catch { /* GET בלבד */ }
  }
  return handleGilyonotDistributorCall(params)
}

export async function handleGilyonotDistributorCall(params: Record<string, string>): Promise<NextResponse> {
  // נכשל-סגור: בלי סוד מוגדר, ובלי ApiToken תואם, אין גישה. הבדיקה לפני כל פעולת מסד.
  const secret = process.env.YEMOT_GILYONOT_SECRET
  if (!secret || !safeEqual(params['ApiToken'] ?? '', secret)) {
    console.warn(`[yemot-gilyonot] ${secret ? 'ApiToken שגוי' : 'YEMOT_GILYONOT_SECRET אינו מוגדר'}, דחייה`)
    return yemotText('id_list_message=t-אין הרשאה&go_to_folder=hangup')
  }
  if (params['hangup'] === 'yes') return yemotText('noop=hangup handled')

  const db = getServiceClient()
  if (!db) return yemotText('id_list_message=t-שגיאת שרת&go_to_folder=hangup')

  const phone = normalizePhone(params['ApiPhone'] ?? '')
  // מפיץ מזוהה לפי הטלפון הראשי או הנוסף. מספר חסוי לא מזוהה.
  let distributors: PhoneDistributor[] = []
  if (phone) {
    const { data } = await db.from('gilyonot_distributors').select('id, full_name, quantity, city, synagogue')
      .eq('status', 'active').or(`phone.eq.${phone},phone2.eq.${phone}`).order('created_at').limit(MAX_PICK)
    distributors = data ?? []
  }
  const settings = await loadDistributorSettings(db)
  const turn = distributorPhoneTurn(params, {
    distributors, hasPhone: !!phone, agentPhone: settings.agent_phone, agentOpen: isAgentAvailable(settings.agent_hours),
  })

  const a = turn.action
  if (!a) return yemotText(turn.reply)
  let error: string | null = null
  if (a.kind === 'quantity') {
    const res = await runDistributorAction(db, a.distributorId, a.action, { quantity: a.quantity }, 'phone')
    if (!res.ok) error = res.error
  } else if (a.kind === 'leave') {
    const res = await runDistributorAction(db, a.distributorId, 'leave', { details: 'התנתקות בקו הטלפוני' }, 'phone')
    if (!res.ok) error = res.error
  } else if (a.kind === 'recording') {
    const res = await recordPhoneMessage(db, a.distributorId, a.purpose, a.path, a.transcript)
    if (!res.ok) error = res.error
  } else if (a.kind === 'hilula') {
    const res = await requestHilula(db, { distributorId: a.distributorId, phone, guests: a.guests, channel: 'phone' })
    if (!res.ok) error = res.error
  }
  if (error) console.error('[yemot-gilyonot] action failed:', a.kind, error)
  return yemotText(error ? failReply(error) : turn.reply)
}
