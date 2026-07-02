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
import { getNedarimCreds, setMagneticCard, findClientByZeout, getClientCardFull } from '@/lib/nedarim'
import { getMaternityMessages, type MaternityMsg, type MaternityMessages } from '@/lib/yemotMaternityMessages'

export const dynamic = 'force-dynamic'

// מספר הספרות הנדרש בכרטיס נדרים
const CARD_DIGITS = 16
// משתנה חדש לכל ניסיון הקלדה — מונע re-read של משתנה מלא (שגורם ללולאה אינסופית בימות)
const CARD_VARS = ['collect_card', 'collect_card2', 'collect_card3', 'collect_card4', 'collect_card5']
const CONFIRM_VARS = ['collect_confirm', 'collect_confirm2', 'collect_confirm3', 'collect_confirm4', 'collect_confirm5']

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

// דדופ שיוך כרטיס לפי מזהה שיחה — מונע ביצוע כפול כשימות שולחת את אותה בקשה שוב.
// (Railway מריץ רפליקה יחידה, לכן זיכרון-תהליך אמין כאן.)
const _linkDedup = new Map<string, { at: number; body: string }>()
const LINK_DEDUP_MS = 90_000 // חלון קצר — רק כדי לתפוס webhook כפול של אותה שיחה+כרטיס
function pruneDedup(now: number) {
  for (const [k, v] of _linkDedup) if (now - v.at > LINK_DEDUP_MS) _linkDedup.delete(k)
}
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
// בחירת המוקד עברה לטופס הלידה בפורטל (card_center_id), לכן אין יותר הקשת מוקד
// בשיחה. הכרטיס מחובר למוקד שנבחר מראש, והמלאי יורד בעת שיוך הכרטיס בטלפון.

// פקודת ה-read למספר הכרטיס (msgKey = welcome / welcome_card_exists / invalid_card להקדמה)
function cardReadCommand(M: MaternityMessages, varName = 'collect_card', prefixKey?: keyof MaternityMessages, leadToken?: string): string {
  const prompts = [
    leadToken || '',
    prefixKey ? tokenOf(M[prefixKey as string]) : '',
    tokenOf(M.ask_card),
  ].filter(Boolean)
  // min:1 — ימות מעבירה את הערך לשרת (גם אם פחות מ-16), והשרת מאמת ומשמיע את
  // הודעת card_length *שלנו* ומבקש שוב במשתנה חדש (לא לולאה). max:16 — נסגר ב-16.
  return readTap(varName, prompts, { max: CARD_DIGITS, min: 1 })
}

// קריאת אישור: חוזרת על הספרות (ספרה-ספרה) ומבקשת 1=אישור / 2=תיקון
function confirmReadCommand(M: MaternityMessages, card: string, confirmVar = 'collect_confirm'): string {
  // פסיקים בין הספרות → הקראה איטית עם הפסקות (ספרה-ספרה); פסיקים בסוף → השהיה קצרה לפני "לאישור"
  const spaced = card.split('').join(', ') + ' , ,'
  return readTap(confirmVar, [tokenOf(M.card_readback, { card: spaced })], { max: 1, min: 1, allowed: [1, 2], wait: 20 })
}

// ── חיפוש משפחה לפי טלפון ─────────────────────────────────────────────────────
// מהיר: מסננים ב-DB לפי 7 הספרות האחרונות (עמיד למקפים/רווחים/קידומת 972 בפורמט
// השמור), ואז מאמתים בנרמול מלא ב-JS. אם לא נמצא — fallback לסריקה מלאה כדי שלא
// נפספס פורמטים חריגים (הטלפונים נשמרים כפי שהוקלדו, בלי נרמול).
const BENEFICIARY_COLS = 'id, full_name, family_name, spouse_name, id_number, phone, phone2, spouse_phone, nedarim_id'
type FamilyRow = {
  id: string; full_name: string | null; family_name: string | null; spouse_name: string | null; id_number: string | null
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
    .select('id, birth_date, six_weeks_end, card_number, status, card_center_id')
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

  // שם לזיהוי בשיחה — שם המשפחה + שם היולדת (בת הזוג), עם נפילה-לאחור לשם הרשום
  const familyName = [family.family_name, family.spouse_name || family.full_name].filter(Boolean).join(' ')

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
  // הכרטיס שהוקלד באחרון מבין משתני הניסיון (לתצוגה בלוג בלבד)
  const enteredCard = CARD_VARS.map((v) => String(params[v] ?? '').trim()).filter(Boolean).pop() ?? ''

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
  console.log(`[yemot-maternity] phone=${apiPhone} callId=${callId} card=${enteredCard ? '****' + enteredCard.slice(-4) : ''}`)

  const M = await getCachedMessages()

  if (!apiPhone) {
    return yemotText([idMessage(tText('שגיאה במספר המתקשר')), goToFolder('hangup')], callId)
  }

  const callerPhone = normalizePhone(apiPhone)
  const admin = adminClient()

  // ── שלב הכרטיס + אישור (משתנה חדש לכל ניסיון — מונע לולאת re-read) ────────
  // מאתרים את ניסיון ההקלדה האחרון (המשתנה האחרון מבין CARD_VARS שיש בו ערך).
  let attempt = -1
  for (let i = CARD_VARS.length - 1; i >= 0; i--) {
    if (String(params[CARD_VARS[i]] ?? '').trim()) { attempt = i; break }
  }
  if (attempt >= 0) {
    const aCard = String(params[CARD_VARS[attempt]] ?? '').trim()
    const aConfirm = String(params[CONFIRM_VARS[attempt]] ?? '').trim()

    const result = await findActiveAid(callerPhone)
    if ('error' in result || 'notFound' in result || 'noBirth' in result || !result.active) {
      console.error('[yemot-maternity] re-lookup failed at card/confirm step', result)
      return yemotText([idMessage(tokenOf(M.system_error)), goToFolder('hangup')], callId)
    }
    if (result.active.status !== 'active') {
      return yemotText([idMessage(tokenOf(M.pending_approval)), goToFolder('hangup')], callId)
    }
    const aidId = result.active.id

    // עדיין לא אישרה את הספרות → חזרה על הספרות + בקשת אישור (תגובה מיידית)
    if (!aConfirm) {
      if (aCard.length !== CARD_DIGITS) {
        // הגנה (ימות אמורה לאכוף 16) — מבקשים מספר חדש במשתנה הבא
        if (attempt + 1 < CARD_VARS.length) {
          return yemotText([cardReadCommand(M, CARD_VARS[attempt + 1], 'card_length')], callId)
        }
        return yemotText([idMessage(tokenOf(M.card_length)), goToFolder('hangup')], callId)
      }
      await admin.from('maternity_aids').update({ card_number: aCard }).eq('id', aidId)
      console.log(`[yemot-maternity] card entered for aid ${aidId}, asking confirm (attempt ${attempt})`)
      return yemotText([confirmReadCommand(M, aCard, CONFIRM_VARS[attempt])], callId)
    }

    // אישרה (1) → חיבור הכרטיס בנדרים + הורדת מלאי מהמוקד שנבחר בטופס הלידה
    if (aConfirm === '1') {
      const family = result.family
      const familyName = result.familyName ?? ''
      const cardNumber = aCard
      // דדופ: ימות עלולה לשלוח את אותה בקשה פעמיים — מבצעים את השיוך פעם אחת בלבד.
      // מפתח לפי מזהה-שיחה + מספר הכרטיס בלבד (ורק אם יש מזהה-שיחה), כדי שלא נתפוס
      // שיחות נפרדות. כך אחרי ניתוק כרטיס — שיחה חדשה תמיד תעבד מחדש ותאפשר חיבור.
      const dedupKey = callId ? `link:${callId}:${cardNumber.replace(/\D/g, '')}` : ''
      if (dedupKey) {
        const cachedResp = _linkDedup.get(dedupKey)
        if (cachedResp && Date.now() - cachedResp.at < LINK_DEDUP_MS) {
          console.log(`[yemot-maternity] dedup hit ${dedupKey}`)
          return new NextResponse(cachedResp.body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
        }
      }
      const respond = (commands: string[]) => {
        const body = commands.join('&') + '&'
        if (dedupKey) { pruneDedup(Date.now()); _linkDedup.set(dedupKey, { at: Date.now(), body }) }
        console.log(`[yemot-maternity] link response (callId=${callId}): ${body}`)
        return new NextResponse(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }
      const creds = await getNedarimCreds()
      if (!creds) {
        console.error('[yemot-maternity] nedarim not configured')
        return respond([idMessage(tokenOf(M.system_error)), goToFolder('hangup')])
      }
      // מזהה נדרים: מהרשומה; ואם חסר — חיפוש בנדרים לפי ת"ז ושמירה חזרה (כדי שמספר תקין
      // תמיד ישויך, גם אם nedarim_id לא נשמר בעבר).
      let nedarimId = family?.nedarim_id ? String(family.nedarim_id) : null
      if (!nedarimId && family?.id_number) {
        try {
          nedarimId = await findClientByZeout(creds, String(family.id_number))
          if (nedarimId && family?.id) {
            await admin.from('beneficiaries').update({ nedarim_id: nedarimId }).eq('id', family.id).then(undefined, () => {})
          }
        } catch (e) { console.error('[yemot-maternity] findClientByZeout failed', e) }
      }
      if (!nedarimId) {
        await logActivity(admin, 'yemot_error', 'maternity_aid', aidId, {
          caller: callerPhone, callId, family_name: familyName, error: 'אין nedarim_id למשפחה (גם לא נמצא לפי ת"ז)',
        })
        return respond([idMessage(tokenOf(M.not_in_nedarim)), goToFolder('hangup')])
      }
      // ניסיון שיוך — עד 2 ניסיונות בתוך אותה בקשה, כדי שהמתקשר יקבל תשובה נכונה בשיחה אחת.
      // הצלחה = חיבור תקין, או "כבר מוגדר", או אימות ישיר מול נדרים שהכרטיס אכן משויך
      // (נדרים לעיתים מקשר את הכרטיס אך מחזיר שגיאה/פסק-זמן).
      // הכרטיס כבר משויך למשפחה זו = המטרה הושגה → הצלחה. נדרים מנסח זאת בכמה דרכים
      // ("כרטיס נדרים משויך למשפחה זו" / "כבר מוגדר" וכו') — לכן זיהוי רחב.
      const isAlreadyMsg = (m: string) => /משפחה\s*זו|כבר\s*(מוגדר|מוגד|משוי|משויך)|(מוגדר|משויך|משוי)\S*\s*למשפחה/.test(m)
      const cardLinkedInNedarim = async (): Promise<boolean> => {
        try {
          const full = await getClientCardFull(creds, nedarimId!)
          const cards = Array.isArray((full as { Cards?: unknown } | null)?.Cards) ? ((full as { Cards: Record<string, unknown>[] }).Cards) : []
          const want = cardNumber.replace(/\D/g, '')
          return cards.some(c => !c.RemovedDate && [c.MagneticCard, c.CardNumber].some(v => String(v ?? '').replace(/\D/g, '') === want))
        } catch { return false }
      }
      // ניסיון שיוך יחיד (מהיר) — ואם נכשל, אימות אם הכרטיס בכל זאת משויך (הצלחה).
      let linkOk = false, linkMsg = '', already = false
      try {
        const r = await setMagneticCard(creds, nedarimId, cardNumber, { timeoutMs: 12_000 })
        linkOk = r.ok; linkMsg = r.message
      } catch (e) { linkMsg = e instanceof Error ? e.message : String(e) }
      if (!linkOk) {
        already = isAlreadyMsg(linkMsg) || (await cardLinkedInNedarim())
      }
      const success = linkOk || already
      if (!success) {
        console.error(`[yemot-maternity] setMagneticCard failed: ${linkMsg}`)
        await logActivity(admin, 'yemot_error', 'maternity_aid', aidId, {
          caller: callerPhone, callId, family_name: familyName, error: linkMsg, card_number_last4: cardNumber.slice(-4), nedarim_id: nedarimId,
        })
        // שמירת סיבת הכישלון המדויקת מנדרים על התיק — כדי שתהיה גלויה במסך הכרטיס
        await admin.from('maternity_aids').update({ card_load_error: `שיוך כרטיס בטלפון נכשל — תגובת נדרים: ${linkMsg}` }).eq('id', aidId).then(undefined, () => {})
        // הקראת הסיבה המדויקת מנדרים למתקשר
        return respond([idMessage(tText(`הפעולה נכשלה הסיבה ${linkMsg || 'שגיאה טכנית'}`)), goToFolder('hangup')])
      }
      // הצלחה (חיבור חדש או כרטיס שכבר משויך למשפחה) — רישום איסוף + מונה ממתינים -1.
      // אידמפוטנטי: אם כבר נרשם איסוף (שיחה/ניסיון כפול) — לא סופרים ולא מעדכנים שוב.
      const { data: curAid } = await admin.from('maternity_aids').select('card_picked_up_at').eq('id', aidId).maybeSingle()
      const firstTime = !curAid?.card_picked_up_at
      const centerId = (result.active as { card_center_id?: string | null }).card_center_id ?? null
      let centerName = ''
      if (centerId) {
        const { data: ctr } = await admin.from('card_centers').select('name').eq('id', centerId).maybeSingle()
        centerName = ctr?.name ?? ''
        if (firstTime) { try { await admin.rpc('bump_center_pending_pickups', { p_center_id: centerId, p_delta: -1 }) } catch { /* לא חוסם */ } }
      }
      if (firstTime) {
        await admin.from('maternity_aids').update({ card_picked_up_at: new Date().toISOString(), card_number: cardNumber, card_load_error: null }).eq('id', aidId)
        await logActivity(admin, 'yemot_card_registered', 'maternity_aid', aidId, {
          caller: callerPhone, callId, family_name: familyName, card_number_last4: cardNumber.slice(-4),
          nedarim_id: nedarimId, center: centerName,
        })
      }
      console.log(`[yemot-maternity] card linked, aid ${aidId} (${familyName}), center=${centerName}, firstTime=${firstTime}, already=${already}`)
      return respond([idMessage(tokenOf(M.link_success, { center: centerName })), goToFolder('hangup')])
    }

    // תיקון (2) → מבקשים מספר חדש במשתנה הבא (כדי לא לקרוא מחדש משתנה מלא = לולאה)
    if (attempt + 1 < CARD_VARS.length) {
      await admin.from('maternity_aids').update({ card_number: null }).eq('id', aidId)
      console.log(`[yemot-maternity] correction requested for aid ${aidId}, re-asking on ${CARD_VARS[attempt + 1]}`)
      return yemotText([cardReadCommand(M, CARD_VARS[attempt + 1])], callId)
    }
    return yemotText([idMessage(tText('יותר מדי ניסיונות אנא נסי שוב מאוחר יותר או פני למשרד')), goToFolder('hangup')], callId)
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
  // לפני בקשת מספר הכרטיס — ברכת זיהוי אישית עם השם, ואז הודעת ה"welcome" (נולד לכם בשש שבועות)
  return yemotText([cardReadCommand(M, CARD_VARS[0], 'welcome', tokenOf(M.identify, { name: familyName }))], callId)
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
