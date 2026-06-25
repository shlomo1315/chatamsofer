// Webhook לימות המשיח — שיוך כרטיס נדרים של יולדת לתיק הלידה הפעיל שלה.
// שלוחת API (type=api): ימות פונה לכאן בכל שלב, והשרת מחזיר פקודות טקסט.
//
// פרוטוקול התגובה (לפי yemot-router2 / תיעוד ימות):
//   • הודעה:          id_list_message=<token>           (כמה מופרדים ב-".")
//     token = t-<טקסט TTS>  או  f-<שם קובץ הקלטה>
//   • קליטת הקשה:     read=<token>=<valName>,<re_enter>,<max>,<min>,<sec>,No,no,no,,<digits_allowed>,,,,
//   • מעבר/ניתוק:     go_to_folder=hangup  /  go_to_folder=/
//   • פקודות מופרדות ב-"&". טקסט TTS אסור שיכיל: . - " ' & |
//
// ההודעות ניתנות לעריכה בדף ההגדרות (טקסט או הקלטה אנושית) — נטענות מ-getMaternityMessages.
// ימות מחזירה את ערך ה-read תחת שם המשתנה (collect_card / collect_center), ומזהים את
// השלב לפי הערכים הקיימים.

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { addDays } from 'date-fns'
import { getNedarimCreds, setMagneticCard } from '@/lib/nedarim'
import { getMaternityMessages, type MaternityMsg, type MaternityMessages } from '@/lib/yemotMaternityMessages'

export const dynamic = 'force-dynamic'

// השוואת סודות בזמן קבוע (מונע timing attacks)
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

// קליינט Supabase יחיד (singleton) — נמנע מיצירה מחדש בכל בקשה (מהירות)
let _admin: SupabaseClient | null = null
function adminClient() {
  if (_admin) return _admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  _admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return _admin
}

// מטמון הודעות בזיכרון — ההודעות כמעט ולא משתנות, אז שומרים אותן ל-60ש' כדי
// לחסוך שאילתת DB בכל שיחה (תגובה ראשונה מיידית).
let _msgCache: { at: number; data: MaternityMessages } | null = null
const MSG_TTL_MS = 60_000
async function getCachedMessages(): Promise<MaternityMessages> {
  const now = Date.now()
  if (_msgCache && now - _msgCache.at < MSG_TTL_MS) return _msgCache.data
  const data = await getMaternityMessages()
  _msgCache = { at: now, data }
  return data
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

// הודעה בודדת → token: f-<קובץ> אם יש הקלטה, אחרת t-<טקסט TTS> (עם החלפת משתנים)
function tokenOf(m: MaternityMsg | undefined, repl?: Record<string, string>): string {
  if (m?.audio) return `f-${m.audio}`
  let t = m?.text ?? ''
  if (repl) for (const [k, v] of Object.entries(repl)) t = t.replaceAll(`{${k}}`, v)
  return `t-${tts(t)}`
}

// token מטקסט חופשי (להודעות פנימיות שאינן ניתנות לעריכה)
function tText(text: string): string {
  return `t-${tts(text)}`
}

const joinTokens = (...tokens: string[]) => tokens.filter(Boolean).join('.')
const idMessage = (...tokens: string[]) => `id_list_message=${joinTokens(...tokens)}`

type ReadOpts = { reEnter?: boolean; max?: number | ''; min?: number; wait?: number; allowed?: (string | number)[] }
// פקודת read במצב tap (הקשות). סדר הפרמטרים לפי yemot-router2.
function readTap(valName: string, promptTokens: string[], opts: ReadOpts = {}): string {
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
  return `read=${joinTokens(...promptTokens)}=${ops.join(',')}`
}

const goToFolder = (target: string) => `go_to_folder=${target}`

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
function centerReadCommand(M: MaternityMessages, centers: CenterRow[]): string {
  const prompts = [
    tokenOf(M.center_intro),
    ...centers.map((c) => tokenOf(M.center_item, { name: c.name, code: String(c.code) })),
  ]
  const maxLen = Math.max(1, ...centers.map((c) => String(c.code).length))
  return readTap('collect_center', prompts, { max: maxLen, allowed: centers.map((c) => c.code) })
}

// פקודת ה-read למספר הכרטיס (msgKey = welcome / welcome_card_exists / invalid_card להקדמה)
function cardReadCommand(M: MaternityMessages, prefixKey?: keyof MaternityMessages): string {
  const prompts = [
    prefixKey ? tokenOf(M[prefixKey as string]) : '',
    tokenOf(M.ask_card),
  ].filter(Boolean)
  return readTap('collect_card', prompts, { max: 20, min: 1 })
}

// קריאת אישור: חוזרת על הספרות (ספרה-ספרה) ומבקשת 1=אישור / 2=תיקון
function confirmReadCommand(M: MaternityMessages, card: string): string {
  const spaced = card.split('').join(' ') // כדי שה-TTS יקריא ספרה-ספרה
  return readTap('collect_confirm', [tokenOf(M.confirm_card, { card: spaced })], { max: 1, min: 1, allowed: [1, 2] })
}

// ── חיפוש משפחה לפי טלפון ─────────────────────────────────────────────────────
// מהיר: מסננים ב-DB לפי 7 הספרות האחרונות (עמיד למקפים/רווחים/קידומת 972 בפורמט
// השמור), ואז מאמתים בנרמול מלא ב-JS. אם לא נמצא — fallback לסריקה מלאה כדי שלא
// נפספס פורמטים חריגים (הטלפונים נשמרים כפי שהוקלדו, בלי נרמול).
const BENEFICIARY_COLS = 'id, full_name, family_name, phone, phone2, spouse_phone, nedarim_id'
type FamilyRow = {
  id: string; full_name: string | null; family_name: string | null
  phone: string | null; phone2: string | null; spouse_phone: string | null; nedarim_id: string | null
}

async function findFamilyByPhone(
  admin: ReturnType<typeof adminClient>,
  callerPhone: string,
): Promise<{ family?: FamilyRow; error?: string }> {
  const matches = (b: FamilyRow) =>
    phoneMatches(b.phone, callerPhone) ||
    phoneMatches(b.phone2, callerPhone) ||
    phoneMatches(b.spouse_phone, callerPhone)

  // נתיב מהיר — סינון לפי 7 הספרות האחרונות (digits בלבד, בטוח ל-ilike)
  const last7 = callerPhone.replace(/\D/g, '').slice(-7)
  if (last7.length === 7) {
    const { data, error } = await admin
      .from('beneficiaries')
      .select(BENEFICIARY_COLS)
      .eq('is_active', true)
      .or(`phone.ilike.%${last7}%,phone2.ilike.%${last7}%,spouse_phone.ilike.%${last7}%`)
    if (error) return { error: error.message }
    const hit = (data ?? []).find(matches)
    if (hit) return { family: hit }
  }

  // fallback — סריקה מלאה (פורמט שמור חריג שהנתיב המהיר פספס, או מתקשר שאינו במערכת)
  const { data: all, error: allErr } = await admin
    .from('beneficiaries')
    .select(BENEFICIARY_COLS)
    .eq('is_active', true)
  if (allErr) return { error: allErr.message }
  return { family: (all ?? []).find(matches) }
}

// ── חיפוש משפחה + לידה פעילה ─────────────────────────────────────────────────
async function findActiveAid(callerPhone: string) {
  const admin = adminClient()

  const { family, error } = await findFamilyByPhone(admin, callerPhone)
  if (error) return { error }
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
  const confirmVal = String(params['collect_confirm'] ?? '').trim()

  // ── אבטחה: אם YEMOT_WEBHOOK_SECRET מוגדר — אוכפים ApiToken (constant-time). ──
  // אם אינו מוגדר — ממשיכים כדי לא לשבור את השירות, עם אזהרה חזקה (יש להגדירו בהקדם).
  const secret = process.env.YEMOT_WEBHOOK_SECRET
  if (secret) {
    if (!safeEqual(params['ApiToken'] ?? '', secret)) {
      console.warn('[yemot-maternity] ApiToken שגוי — דחייה')
      return yemotText([idMessage(tText('אין הרשאה')), goToFolder('hangup')], callId)
    }
  } else {
    console.error('[yemot-maternity] אזהרת אבטחה: YEMOT_WEBHOOK_SECRET אינו מוגדר — ה-webhook פתוח! יש להגדירו ב-Railway בהקדם.')
  }

  // לוג ללא חשיפת מספר הכרטיס המלא (4 ספרות אחרונות בלבד)
  console.log(`[yemot-maternity] phone=${apiPhone} callId=${callId} card=${cardVal ? '****' + cardVal.slice(-4) : ''} center=${centerVal}`)

  const M = await getCachedMessages()

  if (!apiPhone) {
    return yemotText([idMessage(tText('שגיאה במספר המתקשר')), goToFolder('hangup')], callId)
  }

  const callerPhone = normalizePhone(apiPhone)
  const admin = adminClient()

  // ── שלב 3: בחירת מוקד → חיבור הכרטיס בנדרים → הורדת מלאי → תוצאה ────────
  if (centerVal) {
    const centers = await activeCentersWithCode(admin)
    const center = centers.find((c) => String(c.code) === centerVal)
    if (!center) {
      return yemotText([idMessage(tokenOf(M.invalid_center)), centerReadCommand(M, centers)], callId)
    }

    const result = await findActiveAid(callerPhone)
    if ('error' in result || 'notFound' in result || 'noBirth' in result || !result.active || !result.family) {
      console.error('[yemot-maternity] re-lookup failed at center step', result)
      return yemotText([idMessage(tokenOf(M.system_error)), goToFolder('hangup')], callId)
    }
    // הגנה: לידה שאינה מאושרת לא יכולה להטעין כרטיס
    if (result.active.status !== 'active') {
      return yemotText([idMessage(tokenOf(M.pending_approval)), goToFolder('hangup')], callId)
    }
    const { active, family, familyName } = result
    const cardNumber = String(active.card_number ?? '').trim()
    const nedarimId = family.nedarim_id ? String(family.nedarim_id) : null

    if (!cardNumber) {
      return yemotText([idMessage(tokenOf(M.no_card_found)), goToFolder('hangup')], callId)
    }

    if (!nedarimId) {
      console.log(`[yemot-maternity] family ${family.id} has no nedarim_id`)
      await logActivity(admin, 'yemot_error', 'maternity_aid', active.id, {
        caller: callerPhone, callId, beneficiary_id: family.id, family_name: familyName,
        error: 'אין nedarim_id למשפחה', center: center.name, center_code: center.code,
      })
      return yemotText([idMessage(tokenOf(M.not_in_nedarim)), goToFolder('hangup')], callId)
    }

    const creds = await getNedarimCreds()
    if (!creds) {
      console.error('[yemot-maternity] nedarim not configured')
      return yemotText([idMessage(tokenOf(M.system_error)), goToFolder('hangup')], callId)
    }

    let linkOk = false
    let linkMsg = ''
    try {
      // timeout קצר — ימות מוותרת על התגובה הרבה לפני 25ש'. עדיף להחזיר "נסי שוב"
      // ברור מאשר להשאיר את המתקשר תקוע עד שימות מנתקת.
      const r = await setMagneticCard(creds, nedarimId, cardNumber, { timeoutMs: 10_000 })
      linkOk = r.ok
      linkMsg = r.message
    } catch (e) {
      linkMsg = e instanceof Error ? e.message : String(e)
    }

    if (!linkOk) {
      console.error(`[yemot-maternity] setMagneticCard failed: ${linkMsg}`)
      await logActivity(admin, 'yemot_error', 'maternity_aid', active.id, {
        caller: callerPhone, callId, beneficiary_id: family.id, family_name: familyName,
        error: linkMsg, center: center.name, center_code: center.code, card_number_last4: cardNumber.slice(-4),
      })
      return yemotText([idMessage(tokenOf(M.link_fail)), goToFolder('hangup')], callId)
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

    await logActivity(admin, 'yemot_card_registered', 'maternity_aid', active.id, {
      caller: callerPhone, callId, beneficiary_id: family.id, family_name: familyName,
      card_number_last4: cardNumber.slice(-4), nedarim_id: nedarimId,
      center: center.name, center_code: center.code, center_stock_after: newStock,
    })

    console.log(`[yemot-maternity] card linked, aid ${active.id} (${familyName}), center=${center.name}, stockAfter=${newStock}`)
    return yemotText([
      idMessage(tokenOf(M.link_success, { center: center.name })),
      goToFolder('hangup'),
    ], callId)
  }

  // ── שלב אישור: 1 = אישור הספרות → מוקד · 2 = תיקון → הקלדה מחדש ──────────
  if (confirmVal) {
    const result = await findActiveAid(callerPhone)
    if ('error' in result || 'notFound' in result || 'noBirth' in result || !result.active) {
      console.error('[yemot-maternity] re-lookup failed at confirm step', result)
      return yemotText([idMessage(tokenOf(M.system_error)), goToFolder('hangup')], callId)
    }
    if (result.active.status !== 'active') {
      return yemotText([idMessage(tokenOf(M.pending_approval)), goToFolder('hangup')], callId)
    }
    const savedCard = String(result.active.card_number ?? '').trim()

    if (confirmVal === '1') {
      // אישור — ממשיכים לבחירת מוקד
      if (!savedCard) return yemotText([cardReadCommand(M, 'welcome')], callId)
      const centers = await activeCentersWithCode(admin)
      if (!centers.length) {
        console.log('[yemot-maternity] no centers with code — finishing after card confirm')
        return yemotText([idMessage(tokenOf(M.card_saved_no_center)), goToFolder('hangup')], callId)
      }
      console.log(`[yemot-maternity] card confirmed for aid ${result.active.id}, prompting center (${centers.length})`)
      return yemotText([centerReadCommand(M, centers)], callId)
    }

    // תיקון (2): אם הוקלד מספר חדש — שומרים ומבקשים אישור עליו; אחרת מבקשים מספר מחדש.
    if (cardVal && cardVal.length >= 4 && cardVal !== savedCard) {
      await admin.from('maternity_aids').update({ card_number: cardVal }).eq('id', result.active.id)
      return yemotText([confirmReadCommand(M, cardVal)], callId)
    }
    await admin.from('maternity_aids').update({ card_number: null }).eq('id', result.active.id)
    return yemotText([readTap('collect_card', [tokenOf(M.ask_card)], { max: 20, min: 1 })], callId)
  }

  // ── שלב 2: קבלת מספר הכרטיס → חזרה על הספרות ובקשת אישור (תגובה מיידית) ──
  if (cardVal) {
    if (cardVal.length < 4) {
      return yemotText([readTap('collect_card', [tokenOf(M.invalid_card), tokenOf(M.ask_card)], { max: 20, min: 1 })], callId)
    }

    const result = await findActiveAid(callerPhone)
    if ('error' in result || 'notFound' in result || 'noBirth' in result || !result.active) {
      console.error('[yemot-maternity] re-lookup failed at card step', result)
      return yemotText([idMessage(tokenOf(M.system_error)), goToFolder('hangup')], callId)
    }

    // הגנה: לידה שאינה מאושרת לא יכולה להטעין כרטיס (גם אם הגיעה לשלב זה)
    if (result.active.status !== 'active') {
      return yemotText([idMessage(tokenOf(M.pending_approval)), goToFolder('hangup')], callId)
    }

    const { error: updateErr } = await admin
      .from('maternity_aids')
      .update({ card_number: cardVal })
      .eq('id', result.active.id)
    if (updateErr) {
      console.error('[yemot-maternity] card_number update error', updateErr.message)
      return yemotText([idMessage(tText('שגיאה בשמירת הכרטיס אנא נסי שוב מאוחר יותר')), goToFolder('hangup')], callId)
    }

    // תגובה מיידית: חזרה על הספרות + בקשת אישור (בלי חיפוש מוקדים — מהיר)
    console.log(`[yemot-maternity] card saved for aid ${result.active.id}, asking confirm`)
    return yemotText([confirmReadCommand(M, cardVal)], callId)
  }

  // ── שלב 1: זיהוי המשפחה + חיפוש לידה פעילה ──────────────────────────────
  const result = await findActiveAid(callerPhone)

  if ('error' in result) {
    console.error('[yemot-maternity] DB error', result.error)
    return yemotText([idMessage(tokenOf(M.system_error)), goToFolder('hangup')], callId)
  }

  if ('notFound' in result) {
    console.log(`[yemot-maternity] phone not found: ${callerPhone}`)
    await logActivity(admin, 'yemot_phone_not_found', 'phone', null, {
      caller: callerPhone, callId, note: 'מספר לא קיים במערכת',
    })
    return yemotText([idMessage(tokenOf(M.not_found)), goToFolder('/')], callId)
  }

  if ('noBirth' in result) {
    console.log(`[yemot-maternity] no active birth for family ${result.familyId} (${result.familyName})`)
    await logActivity(admin, 'yemot_no_active_birth', 'beneficiary', result.familyId ?? null, {
      caller: callerPhone, callId, beneficiary_id: result.familyId, family_name: result.familyName,
    })
    return yemotText([idMessage(tokenOf(M.no_birth)), goToFolder('hangup')], callId)
  }

  const { active, familyName } = result

  // לידה שאינה מאושרת (ממתינה לאישור המזכירות) — אי אפשר להטעין כרטיס
  if (active.status !== 'active') {
    console.log(`[yemot-maternity] aid ${active.id} not approved (status=${active.status ?? 'null'}) — pending message`)
    await logActivity(admin, 'yemot_pending_approval', 'maternity_aid', active.id, {
      caller: callerPhone, callId, family_name: familyName, status: active.status ?? null,
    })
    return yemotText([idMessage(tokenOf(M.pending_approval)), goToFolder('hangup')], callId)
  }

  // כרטיס כבר משויך? רק אם הוא *באמת* חובר בהצלחה בנדרים (קיים רישום yemot_card_registered),
  // ולא רק נשמר מספר בשלב הקלדה שלא הושלם. אחרת — מנקים את המספר התקוע ומאפשרים לחבר שוב.
  const existingCard = String(active.card_number ?? '').trim()
  if (existingCard) {
    const { data: linkedLog } = await admin
      .from('activity_log')
      .select('id')
      .eq('action', 'yemot_card_registered')
      .eq('entity_id', active.id)
      .limit(1)
    const trulyLinked = Array.isArray(linkedLog) && linkedLog.length > 0
    if (trulyLinked) {
      console.log(`[yemot-maternity] aid ${active.id} already has a card linked — already-linked message`)
      await logActivity(admin, 'yemot_card_already_linked', 'maternity_aid', active.id, {
        caller: callerPhone, callId, family_name: familyName, card_number_last4: existingCard.slice(-4),
      })
      return yemotText([idMessage(tokenOf(M.card_already_linked, { card: existingCard })), goToFolder('hangup')], callId)
    }
    // מספר תקוע ללא חיבור בפועל — מנקים כדי לאפשר חיבור מחדש
    console.log(`[yemot-maternity] aid ${active.id} had unconfirmed card_number — clearing to allow re-link`)
    await admin.from('maternity_aids').update({ card_number: null }).eq('id', active.id)
  }

  console.log(`[yemot-maternity] prompting card for "${familyName}", aid ${active.id}`)
  return yemotText([cardReadCommand(M, 'welcome')], callId)
}

// רישום פעולה ל-activity_log (best-effort — לא חוסם את התגובה לימות)
async function logActivity(
  admin: ReturnType<typeof adminClient>,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown>,
) {
  try {
    await admin.from('activity_log').insert({ user_id: null, action, entity_type: entityType, entity_id: entityId, details })
  } catch { /* לא חוסם */ }
}
