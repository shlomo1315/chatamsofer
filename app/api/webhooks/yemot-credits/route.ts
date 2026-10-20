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
import { archiveInquiryRecording } from '@/lib/bookFairInquiryAudio'
import { announcementToken } from '@/lib/creditsAnnouncement'
import { withFallbackFolder } from '@/lib/yemotFallback'
import {
  type CreditCallContext, mainMenuTurn, mergePhoneCredits, PHONE_OPEN_STATUSES, TEST_CALL_ACTION, TEST_CALL_WINDOW_MS, TEST_CREDIT,
} from '@/lib/bookFairCredits'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function yemotText(body: string) {
  body = withFallbackFolder(body, process.env.YEMOT_CREDITS_FALLBACK_FOLDER)
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

  // זיכוי המתקשר (אם יש): קובע אם התפריט כולל את אפשרות 2
  let rows: Awaited<ReturnType<typeof loadRows>> = []
  if (phone) rows = await loadRows(db, phone)
  const picked = mergePhoneCredits(rows)
  let ctx: CreditCallContext | null = null
  if (picked) {
    const open = picked.rows.some(r => (PHONE_OPEN_STATUSES as readonly string[]).includes(r.status))
    ctx = { ...picked.ctx, alreadyDone: !open }
  } else if (phone) {
    // שיחת בדיקה של מנהל (נרשמה ב-activity_log בחצי השעה האחרונה): נתוני דוגמה, בלי שמירה
    const { data: test } = await db.from('activity_log').select('id')
      .eq('action', TEST_CALL_ACTION).contains('details', { phone })
      .gte('created_at', new Date(Date.now() - TEST_CALL_WINDOW_MS).toISOString()).limit(1)
    if (test?.length) ctx = TEST_CREDIT
  }

  const turn = mainMenuTurn(params, ctx, params['cm_menu'] ? null : await announcementToken())
  const a = turn.action
  const ids = picked?.rows.map(r => r.id) ?? []

  if (a?.kind === 'inquiry') {
    // אותה טבלה ואותו מסך כמו פניות היריד (book_fair_inquiries)
    const cleanPhone = (params['ApiPhone'] ?? '').replace(/\D/g, '') || 'לא ידוע'
    const callId = params['ApiCallId'] ?? ''
    const { data: row, error } = await db.from('book_fair_inquiries').insert({
      phone: cleanPhone, recording: a.recording, transcript: null, call_id: callId || null,
    }).select('id').single()
    if (error) {
      console.error('[yemot-credits] שמירת הפנייה נכשלה:', error.message)
      return yemotText('id_list_message=t-לא הצלחנו לשמור את הפנייה. נסו שוב או פנו למשרד&go_to_folder=hangup')
    }
    // עותק של ההקלטה לפני שימות דורסת אותה; ברקע, בלי להמתין
    void archiveInquiryRecording(db, callId || String(row?.id ?? ''), cleanPhone, new Date())
  } else if (a?.kind === 'answered' && ids.length) {
    await db.from('book_fair_credits')
      .update({ status: 'answered', answered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('id', ids).eq('status', 'sent')
  } else if (a?.kind === 'save' && ids.length) {
    const { data: saved, error } = await db.from('book_fair_credits').update({
      status: 'details_entered', details_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      bank_holder_recording: a.holderRecording.slice(0, 300),
      bank_number: a.bank, bank_branch: a.branch, bank_account: a.account,
    }).in('id', ids).in('status', [...PHONE_OPEN_STATUSES]).select('id')
    if (error || !saved?.length) {
      console.error('[yemot-credits] שמירה נכשלה', ids, error?.code ?? 'status')
      return yemotText('id_list_message=t-אירעה תקלה בשמירה. נחזור אליכם בשיחה נוספת&go_to_folder=hangup')
    }
  }
  return yemotText(turn.reply)
}

async function loadRows(db: NonNullable<ReturnType<typeof getServiceClient>>, phone: string) {
  const { data } = await db.from('book_fair_credits')
    .select('id, customer_name, books, amount_agorot, status')
    .eq('phone', phone).order('created_at', { ascending: false }).limit(20)
  return data ?? []
}
