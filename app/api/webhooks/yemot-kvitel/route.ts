// ─────────────────────────────────────────────────────────────────────────────
// Webhook לימות המשיח: שלוחת הקוויטלאך (מערכת ומספר נפרדים מהיריד ומהיולדות).
//
// מה המתקשר שומע: lib/kvitelPhone.ts. כאן רק טוענים את השמות השמורים
// לפי מספר הטלפון ושומרים את הבקשה דרך ingestKvitel, כמו כל ערוץ אחר.
//
// בימות: מודול api עם api_link לכתובת הזו ו-api_add_0=ApiToken=<הסוד>.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { safeEqual } from '@/lib/svix'
import { normalizePhone, type KvitelLineInput } from '@/lib/kvitel'
import { ingestKvitel } from '@/lib/kvitelIngest'
import { aiParseKvitelEmail, parseKvitelEmailText } from '@/lib/kvitelEmail'
import { MAX_SPOKEN, kvitelPhoneTurn, recordingRef } from '@/lib/kvitelPhone'

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
  return handleKvitelCall(params)
}

async function loadSaved(db: NonNullable<ReturnType<typeof getServiceClient>>, phone: string): Promise<KvitelLineInput[]> {
  const { data: requester } = await db.from('kvitel_requesters').select('id').eq('phone', phone).maybeSingle()
  if (!requester) return []
  const { data } = await db.from('kvitel_saved_names')
    .select('name, relation, parent_name, request_type, request_note')
    .eq('requester_id', requester.id).order('last_used_at', { ascending: false }).limit(MAX_SPOKEN)
  return (data ?? []).map(r => ({
    name: r.name, relation: r.relation, parentName: r.parent_name, requestType: r.request_type, requestNote: r.request_note,
  }))
}

export async function handleKvitelCall(params: Record<string, string>): Promise<NextResponse> {
  // נכשל-סגור: בלי סוד מוגדר, ובלי ApiToken תואם, אין גישה. הבדיקה לפני כל פעולת מסד.
  const secret = process.env.YEMOT_KVITEL_SECRET
  if (!secret || !safeEqual(params['ApiToken'] ?? '', secret)) {
    console.warn(`[yemot-kvitel] ${secret ? 'ApiToken שגוי' : 'YEMOT_KVITEL_SECRET אינו מוגדר'}, דחייה`)
    return yemotText('id_list_message=t-אין הרשאה&go_to_folder=hangup')
  }
  if (params['hangup'] === 'yes') return yemotText('noop=hangup handled')

  const db = getServiceClient()
  if (!db) return yemotText('id_list_message=t-שגיאת שרת&go_to_folder=hangup')

  // מספר חסוי: אין שמות שמורים, ישר להקלטה.
  const phone = normalizePhone(params['ApiPhone'] ?? '')
  const saved = phone ? await loadSaved(db, phone) : []
  const turn = kvitelPhoneTurn(params, saved)
  const callId = params['ApiCallId'] || null

  if (turn.action?.kind === 'saved') {
    const res = await ingestKvitel(db, {
      channel: 'phone', phone, lines: saved, sourceRef: callId, note: 'אושרו בטלפון השמות השמורים',
    })
    if (!res.ok) console.error('[yemot-kvitel] ingest failed:', res.error)
  } else if (turn.action?.kind === 'recording') {
    // תמלול (אם הופעל בשלוחה) מפוענח כמו מייל. ההקלטה תמיד נכנסת ל"לבדיקה":
    // אף אחד עוד לא אישר שהתמלול נכון.
    const transcript = turn.action.transcript
    let lines: KvitelLineInput[] = []
    if (transcript) {
      const parsed = parseKvitelEmailText('', transcript)
      const ai = parsed.leftover.length || !parsed.lines.length ? await aiParseKvitelEmail('', transcript) : null
      lines = ai && ai.lines.length >= parsed.lines.length ? ai.lines : parsed.lines
    }
    const res = await ingestKvitel(db, {
      channel: 'phone', status: 'review', phone, lines,
      lineFlags: lines.map(() => 'מתמלול שיחה, יש להאזין ולאשר'),
      rawText: transcript, sourceRef: callId,
      recordingUrl: phone ? recordingRef(phone, params['ApiTime'] ?? '') : null,
      note: transcript ? 'הוקלט בטלפון ותומלל' : 'הוקלט בטלפון, בלי תמלול',
    })
    if (!res.ok) console.error('[yemot-kvitel] ingest failed:', res.error)
  }
  return yemotText(turn.reply)
}
