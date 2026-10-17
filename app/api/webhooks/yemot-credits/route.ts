// ─────────────────────────────────────────────────────────────────────────────
// Webhook לימות המשיח: שלוחת זיכויי היריד.
// ההקראה ואיסוף הפרטים: lib/bookFairCredits.ts (creditPhoneTurn). כאן מזהים את הלקוח
// לפי הטלפון ושומרים. פרטי הבנק לעולם לא נכתבים ללוגים.
//
// בימות: מודול api עם api_link לכתובת הזו ו-api_add_0=ApiToken=<YEMOT_CREDITS_SECRET>.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { safeEqual } from '@/lib/svix'
import { normalizePhone } from '@/lib/kvitel'
import {
  creditPhoneTurn, pickPhoneCredit, PHONE_OPEN_STATUSES, TEST_CALL_ACTION, TEST_CALL_WINDOW_MS, TEST_CREDIT,
} from '@/lib/bookFairCredits'

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

  // נכשל-סגור: בלי סוד מוגדר ובלי ApiToken תואם אין גישה, לפני כל פעולת מסד.
  const secret = process.env.YEMOT_CREDITS_SECRET
  if (!secret || !safeEqual(params['ApiToken'] ?? '', secret)) {
    console.warn(`[yemot-credits] ${secret ? 'ApiToken שגוי' : 'YEMOT_CREDITS_SECRET אינו מוגדר'}, דחייה`)
    return yemotText('id_list_message=t-אין הרשאה&go_to_folder=hangup')
  }
  if (params['hangup'] === 'yes') return yemotText('noop=hangup handled')

  const db = getServiceClient()
  if (!db) return yemotText('id_list_message=t-שגיאת שרת&go_to_folder=hangup')

  const phone = normalizePhone(params['ApiPhone'] ?? '')
  if (!phone) return yemotText('id_list_message=t-לא זוהה מספר הטלפון. נחזור אליכם בהמשך&go_to_folder=hangup')

  const { data: rows } = await db.from('book_fair_credits')
    .select('id, customer_name, books, amount_agorot, status')
    .eq('channel', 'phone').eq('phone', phone).order('created_at', { ascending: false }).limit(5)
  const picked = pickPhoneCredit(rows ?? [])
  if (!picked) {
    // שיחת בדיקה של מנהל (נרשמה ב-activity_log בחצי השעה האחרונה): כל השיחה עם נתוני דוגמה, בלי שמירה
    const { data: test } = await db.from('activity_log').select('id')
      .eq('action', TEST_CALL_ACTION).contains('details', { phone })
      .gte('created_at', new Date(Date.now() - TEST_CALL_WINDOW_MS).toISOString()).limit(1)
    if (test?.length) return yemotText(creditPhoneTurn(params, TEST_CREDIT).reply)
    return yemotText('id_list_message=t-לא נמצא זיכוי למספר הזה&go_to_folder=hangup')
  }

  const { credit } = picked
  const turn = creditPhoneTurn(params, {
    name: credit.customer_name, books: credit.books, amountAgorot: credit.amount_agorot, alreadyDone: !picked.open,
  })

  const a = turn.action
  if (a?.kind === 'answered') {
    await db.from('book_fair_credits')
      .update({ status: 'answered', answered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', credit.id).eq('status', 'sent')
  } else if (a?.kind === 'save') {
    const { data: saved, error } = await db.from('book_fair_credits').update({
      status: 'details_entered', details_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      bank_holder_recording: a.holderRecording.slice(0, 300),
      bank_number: a.bank, bank_branch: a.branch, bank_account: a.account,
    }).eq('id', credit.id).in('status', [...PHONE_OPEN_STATUSES]).select('id')
    if (error || !saved?.length) {
      console.error('[yemot-credits] שמירה נכשלה', credit.id, error?.code ?? 'status')
      return yemotText('id_list_message=t-אירעה תקלה בשמירה. נחזור אליכם בשיחה נוספת&go_to_folder=hangup')
    }
  }
  return yemotText(turn.reply)
}
