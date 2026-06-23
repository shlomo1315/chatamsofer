// Webhook לימות המשיח — שיוך כרטיס נדרים של יולדת לתיק הלידה הפעיל שלה.
// שלוחת API (type=api): ימות פונה לכאן בכל שלב, והשרת מחזיר פקודות טקסט.
//
// פרוטוקול התגובה (לפי yemot-router2 / תיעוד ימות):
//   • הודעת TTS:      id_list_message=t-<טקסט>           (כמה הודעות מופרדות ב-".")
//   • קליטת הקשה:     read=t-<הודעה>=<valName>,<re_enter>,<max>,<min>,<sec>,No,no,no,,<digits_allowed>,,,,
//   • מעבר/ניתוק:     go_to_folder=hangup  /  go_to_folder=/
//   • פקודות מופרדות ב-"&". טקסט TTS אסור שיכיל: . - " ' & |
//
// ימות מחזירה את ערך ה-read תחת שם המשתנה (collect_card / collect_center),
// ושולחת את כל הערכים שנאספו בכל קריאה. לכן מזהים את השלב לפי הערכים הקיימים.
//
// הזרימה:
//   1. אין ערכים  → זיהוי משפחה + לידה פעילה → בקשת מספר כרטיס
//      • טלפון לא מזוהה → הודעה + חזרה לתפריט הראשי
//      • אין לידה פעילה → "אין כרגע לידה מעודכנת... אין זכאות"
//   2. collect_card → שמירת המספר + הקראת רשימת מוקדים + בקשת קוד מוקד
//   3. collect_center → חיבור הכרטיס בנדרים (SetClientMagneticCard) +
//      הורדת כרטיס ממלאי המוקד + הודעת הצלחה/כישלון

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addDays } from 'date-fns'
import { getNedarimCreds, setMagneticCard } from '@/lib/nedarim'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// נרמול מספר טלפון ישראלי לפורמט אחיד (10 ספרות: 05XXXXXXXX)
function normalizePhone(raw: string): string {
  let p = String(raw ?? '').replace(/\D/g, '')
  if (p.startsWith('972')) p = '0' + p.slice(3)
  if (p.startsWith('00972')) p = '0' + p.slice(5)
  return p
}

function phoneMatches(stored: string | null | undefined, caller: string): boolean {
  if (!stored) return false
  return normalizePhone(stored) === caller
}

// ── בניית תגובת ימות ─────────────────────────────────────────────────────────
// טקסט TTS — הסרת תווים שאסורים בימות (. - " ' & |) כדי לא לשבור את הפורמט.
const TTS_INVALID = /[.\-"'&|]/g
function tts(text: string): string {
  return String(text ?? '').replace(TTS_INVALID, ' ').replace(/\s+/g, ' ').trim()
}

// כמה הודעות → "t-הודעה1.t-הודעה2" (הנקודה היא מפריד ההודעות בימות)
function messages(...texts: string[]): string {
  return texts.filter(Boolean).map((t) => `t-${tts(t)}`).join('.')
}

function idMessage(...texts: string[]): string {
  return `id_list_message=${messages(...texts)}`
}

type ReadOpts = { reEnter?: boolean; max?: number | ''; min?: number; wait?: number; allowed?: (string | number)[] }
// פקודת read במצב tap (הקשות). סדר הפרמטרים לפי yemot-router2.
function readTap(valName: string, prompts: string[], opts: ReadOpts = {}): string {
  const { reEnter = true, max = '', min = 1, wait = 15, allowed } = opts
  const ops = [
    valName,
    reEnter ? 'yes' : 'no',
    max === '' ? '' : String(max),
    String(min),
    String(wait),
    'No', 'no', 'no', '',
    allowed && allowed.length ? allowed.join('.') : '',
    '', '', '', '',
  ]
  return `read=${messages(...prompts)}=${ops.join(',')}`
}

function goToFolder(target: string): string {
  return `go_to_folder=${target}`
}

// שליחת תגובת ימות (text/plain, פקודות מופרדות ב-& עם & בסוף)
function yemotText(commands: string[], callId?: string) {
  const body = commands.join('&') + '&'
  console.log(`[yemot-maternity] response${callId ? ` (callId=${callId})` : ''}: ${body}`)
  return new NextResponse(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

// ── מוקדים ──────────────────────────────────────────────────────────────────
type CenterRow = { id: string; name: string; code: number; stock: number }

async function activeCentersWithCode(admin: ReturnType<typeof adminClient>): Promise<CenterRow[]> {
  const { data } = await admin
    .from('card_centers')
    .select('id, name, code, stock')
    .eq('is_active', true)
    .not('code', 'is', null)
    .order('code', { ascending: true })
  return (data ?? []) as CenterRow[]
}

// פקודת ה-read לבחירת מוקד: הקראת רשימת המוקדים + הגבלת ההקשות לקודים הקיימים
function centerReadCommand(centers: CenterRow[]): string {
  const prompts = [
    'אנא בחרו את המוקד שבו תקבלו את הכרטיס הקישו את קוד המוקד',
    ...centers.map((c) => `למוקד ${c.name} הקישו ${c.code}`),
  ]
  const maxLen = Math.max(1, ...centers.map((c) => String(c.code).length))
  return readTap('collect_center', prompts, { max: maxLen, allowed: centers.map((c) => c.code) })
}

// פקודת ה-read למספר הכרטיס
function cardReadCommand(prefix?: string): string {
  const prompts = [
    prefix || '',
    'אנא הקישו את מספר הכרטיס של נדרים שקיבלתם משמאל לימין ולסיום הקישו סולמית',
  ].filter(Boolean)
  return readTap('collect_card', prompts, { max: 20, min: 1 })
}

// ── חיפוש משפחה + לידה פעילה ─────────────────────────────────────────────────
async function findActiveAid(callerPhone: string) {
  const admin = adminClient()

  const { data: beneficiaries, error } = await admin
    .from('beneficiaries')
    .select('id, full_name, family_name, phone, phone2, spouse_phone, nedarim_id')
    .eq('is_active', true)

  if (error) return { error: error.message }

  const family = (beneficiaries ?? []).find(
    (b) =>
      phoneMatches(b.phone, callerPhone) ||
      phoneMatches(b.phone2, callerPhone) ||
      phoneMatches(b.spouse_phone, callerPhone),
  )

  if (!family) return { notFound: true as const }

  const { data: allAids, error: aidErr } = await admin
    .from('maternity_aids')
    .select('id, birth_date, six_weeks_end, card_number, status')
    .eq('beneficiary_id', family.id)
    .order('birth_date', { ascending: false })
    .limit(20)

  if (aidErr) return { error: aidErr.message }

  const aids = (allAids ?? []).filter((a) => a.status !== 'cancelled')

  const now = new Date()
  const active = aids.find((a) => {
    const end = a.six_weeks_end ? new Date(a.six_weeks_end) : addDays(new Date(a.birth_date), 42)
    return end >= now
  })

  const familyName = [family.family_name, family.full_name].filter(Boolean).join(' ')

  console.log(`[yemot-maternity] family ${family.id} (${familyName}): ${allAids?.length ?? 0} aids, active=${active?.id ?? 'none'}`)

  if (!active) {
    return { noBirth: true as const, familyId: family.id, familyName }
  }

  return { family, active, familyName }
}

// ── Handler ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) { return handle(req) }
export async function GET(req: NextRequest) { return handle(req) }

async function handle(req: NextRequest) {
  const params: Record<string, string> =
    req.method === 'GET'
      ? Object.fromEntries(req.nextUrl.searchParams.entries())
      : await req.formData().then((f) => Object.fromEntries(f.entries()) as Record<string, string>).catch(() => ({} as Record<string, string>))

  const apiPhone = String(params['ApiPhone'] ?? '').trim()
  const callId = String(params['ApiCallId'] ?? '').trim()
  // ערכי ה-read חוזרים תחת שמות המשתנים שהגדרנו
  const cardVal = String(params['collect_card'] ?? '').trim()
  const centerVal = String(params['collect_center'] ?? '').trim()

  console.log(`[yemot-maternity] phone=${apiPhone} callId=${callId} card=${cardVal} center=${centerVal}`)

  // אבטחה: ימות שולחת ApiToken=<סוד> (api_add_0 בשלוחה). דוחים בלי הסוד.
  const secret = process.env.YEMOT_WEBHOOK_SECRET
  if (secret && params['ApiToken'] !== secret) {
    return yemotText([idMessage('אין הרשאה'), goToFolder('hangup')], callId)
  }

  if (!apiPhone) {
    return yemotText([idMessage('שגיאה במספר המתקשר'), goToFolder('hangup')], callId)
  }

  const callerPhone = normalizePhone(apiPhone)
  const admin = adminClient()

  // ── שלב 3: בחירת מוקד → חיבור הכרטיס בנדרים → הורדת מלאי → תוצאה ────────
  if (centerVal) {
    const centers = await activeCentersWithCode(admin)
    const center = centers.find((c) => String(c.code) === centerVal)
    if (!center) {
      return yemotText([idMessage('קוד מוקד שגוי אנא נסו שוב'), centerReadCommand(centers)], callId)
    }

    const result = await findActiveAid(callerPhone)
    if ('error' in result || 'notFound' in result || 'noBirth' in result || !result.active || !result.family) {
      console.error('[yemot-maternity] re-lookup failed at center step', result)
      return yemotText([idMessage('שגיאת מערכת אנא חייגי שוב'), goToFolder('hangup')], callId)
    }
    const { active, family, familyName } = result
    const cardNumber = String(active.card_number ?? '').trim()
    const nedarimId = family.nedarim_id ? String(family.nedarim_id) : null

    if (!cardNumber) {
      return yemotText([idMessage('לא נמצא מספר כרטיס אנא חייגי שוב'), goToFolder('hangup')], callId)
    }

    if (!nedarimId) {
      console.log(`[yemot-maternity] family ${family.id} has no nedarim_id`)
      try {
        await admin.from('activity_log').insert({
          user_id: null, action: 'yemot_error', entity_type: 'maternity_aid', entity_id: active.id,
          details: { caller: callerPhone, callId, family_name: familyName, error: 'אין nedarim_id למשפחה', center: center.name },
        })
      } catch { /* לא חוסם */ }
      return yemotText([
        idMessage('לא ניתן לחבר את הכרטיס מאחר שהמשפחה אינה רשומה במערכת נדרים אנא פני למשרד'),
        goToFolder('hangup'),
      ], callId)
    }

    const creds = await getNedarimCreds()
    if (!creds) {
      console.error('[yemot-maternity] nedarim not configured')
      return yemotText([idMessage('המערכת אינה זמינה כעת אנא נסי שוב מאוחר יותר'), goToFolder('hangup')], callId)
    }

    let linkOk = false
    let linkMsg = ''
    try {
      const r = await setMagneticCard(creds, nedarimId, cardNumber)
      linkOk = r.ok
      linkMsg = r.message
    } catch (e) {
      linkMsg = e instanceof Error ? e.message : String(e)
    }

    if (!linkOk) {
      console.error(`[yemot-maternity] setMagneticCard failed: ${linkMsg}`)
      try {
        await admin.from('activity_log').insert({
          user_id: null, action: 'yemot_error', entity_type: 'maternity_aid', entity_id: active.id,
          details: { caller: callerPhone, callId, family_name: familyName, error: linkMsg, center: center.name, card_last4: cardNumber.slice(-4) },
        })
      } catch { /* לא חוסם */ }
      return yemotText([
        idMessage('לא הצלחנו לחבר את הכרטיס הפעולה לא בוצעה אנא נסי שוב מאוחר יותר או פני למשרד'),
        goToFolder('hangup'),
      ], callId)
    }

    // הצלחה — הורדת כרטיס ממלאי המוקד (אטומי דרך RPC)
    let newStock: number | null = null
    try {
      const { data: stockData } = await admin.rpc('decrement_card_center_stock', { p_center_id: center.id })
      newStock = typeof stockData === 'number' ? stockData : null
      if (newStock === null) console.warn(`[yemot-maternity] center "${center.name}" out of stock`)
    } catch (e) {
      console.error('[yemot-maternity] stock decrement failed', e)
    }

    try {
      await admin.from('activity_log').insert({
        user_id: null, action: 'yemot_card_registered', entity_type: 'maternity_aid', entity_id: active.id,
        details: {
          caller: callerPhone, callId, family_name: familyName,
          card_number_last4: cardNumber.slice(-4), nedarim_id: nedarimId,
          center: center.name, center_code: center.code, center_stock_after: newStock,
        },
      })
    } catch { /* לא חוסם */ }

    console.log(`[yemot-maternity] card linked, aid ${active.id} (${familyName}), center=${center.name}, stockAfter=${newStock}`)
    return yemotText([
      idMessage('הכרטיס חובר בהצלחה', `המוקד שנבחר ${center.name}`, 'שיהיה בריאות ומזל טוב'),
      goToFolder('hangup'),
    ], callId)
  }

  // ── שלב 2: קבלת מספר הכרטיס → שמירה → מעבר לבחירת מוקד ──────────────────
  if (cardVal) {
    if (cardVal.length < 4) {
      return yemotText([cardReadCommand('מספר כרטיס לא תקין')], callId)
    }

    const result = await findActiveAid(callerPhone)
    if ('error' in result || 'notFound' in result || 'noBirth' in result || !result.active) {
      console.error('[yemot-maternity] re-lookup failed at card step', result)
      return yemotText([idMessage('שגיאת מערכת אנא חייגי שוב'), goToFolder('hangup')], callId)
    }

    const { error: updateErr } = await admin
      .from('maternity_aids')
      .update({ card_number: cardVal })
      .eq('id', result.active.id)
    if (updateErr) {
      console.error('[yemot-maternity] card_number update error', updateErr.message)
      return yemotText([idMessage('שגיאה בשמירת הכרטיס אנא נסי שוב מאוחר יותר'), goToFolder('hangup')], callId)
    }

    const centers = await activeCentersWithCode(admin)
    if (!centers.length) {
      console.log('[yemot-maternity] no centers with code — finishing after card save')
      return yemotText([
        idMessage('מספר הכרטיס נשמר בהצלחה שיהיה בריאות ומזל טוב'),
        goToFolder('hangup'),
      ], callId)
    }

    console.log(`[yemot-maternity] card saved for aid ${result.active.id}, prompting center (${centers.length})`)
    return yemotText([centerReadCommand(centers)], callId)
  }

  // ── שלב 1: זיהוי המשפחה + חיפוש לידה פעילה ──────────────────────────────
  const result = await findActiveAid(callerPhone)

  if ('error' in result) {
    console.error('[yemot-maternity] DB error', result.error)
    return yemotText([idMessage('שגיאת מערכת אנא נסי שוב מאוחר יותר'), goToFolder('hangup')], callId)
  }

  if ('notFound' in result) {
    console.log(`[yemot-maternity] phone not found: ${callerPhone}`)
    try {
      await admin.from('activity_log').insert({
        user_id: null, action: 'yemot_phone_not_found', entity_type: 'phone',
        entity_id: null, details: { caller: callerPhone, callId, note: 'מספר לא קיים במערכת' },
      })
    } catch { /* לא חוסם */ }
    return yemotText([
      idMessage('מספר הטלפון שלכם לא קיים במערכת מעבירים אתכם בחזרה לתפריט הראשי'),
      goToFolder('/'),
    ], callId)
  }

  if ('noBirth' in result) {
    console.log(`[yemot-maternity] no active birth for family ${result.familyId} (${result.familyName})`)
    try {
      await admin.from('activity_log').insert({
        user_id: null, action: 'yemot_no_active_birth', entity_type: 'beneficiary',
        entity_id: result.familyId, details: { caller: callerPhone, callId, family_name: result.familyName },
      })
    } catch { /* לא חוסם */ }
    return yemotText([
      idMessage(
        'אין כרגע לידה מעודכנת במערכת',
        'אין כעת זכאות לקבלת כרטיס נדרים מאחר שלא נמצאה לידה בשישה השבועות האחרונים',
        'אם את בתוך שישה שבועות מהלידה ועדיין מופיעה שגיאה אנא פני למשרד',
      ),
      goToFolder('hangup'),
    ], callId)
  }

  const { active, familyName } = result
  const prefix = active.card_number
    ? 'שלום מצאנו את תיק הלידה שלך כרטיס נדרים כבר רשום וניתן לעדכן את המספר'
    : 'שלום זוהית בהצלחה נמצא תיק לידה פעיל בחשבונך'
  console.log(`[yemot-maternity] prompting card for "${familyName}", aid ${active.id}`)
  return yemotText([cardReadCommand(prefix)], callId)
}
