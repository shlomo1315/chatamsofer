// ─────────────────────────────────────────────────────────────────────────────
// Webhook לימות המשיח — שלוחת חלוקות החגים.
//
// ⚠️ למה זה הערוץ המרכזי: חלק גדול מהמשפחות אינן גולשות. רישום שדורש ממשק היה
// מדיר אותן לגמרי, ולכן הרישום הטלפוני הוא זה שקובע זכאות.
//
// ⚠️ שלוחה אחת בימות מנהלת את כל התפריט — אין צורך להגדיר תת-שלוחות. ההפניה
// בימות היא לשלוחת API אחת, וההסתעפות נעשית כאן לפי ההקשה:
//   1 → רישום לחלוקה הפתוחה
//   2 → שיוך הכרטיס שהמשפחה קיבלה במוקד (פתוח רק למי שנרשם *ואושר*)
// תת-שלוחות בימות היו מפצלות את אותה לוגיקה לשני מקומות שיכולים להיפרד זה מזה.
//
// הזיהוי: לפי מספר הטלפון שממנו התקשרו (טלפון ראשי, נוסף או של האישה). אין
// הקלדת ת"ז — מי שמתקשר ממספר רשום מזוהה מיד, וזה הופך את הרישום לשיחה קצרה.
//
// פרוטוקול התגובה (זהה לשלוחת היולדות):
//   • הודעה:      id_list_message=<token>      (token = t-<טקסט TTS> או f-<קובץ>)
//   • קליטת הקשה: read=<token>=<valName>,<re_enter>,<max>,<min>,<sec>,No,no,no,,<digits>,,,,
//   • ניתוק:      go_to_folder=hangup
//   • פקודות מופרדות ב-"&". טקסט TTS אסור שיכיל: . - " ' & |
//
// ⚠️ fail-closed על ApiToken: השלוחה יוצרת רישום שגורר תקציב ומשייכת כרטיס
// שנושא כסף, ולכן בקשה בלי אימות נדחית — כולל כשהסוד עצמו אינו מוגדר.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getServiceClient } from '@/lib/apiAuth'
import { getOpenDistribution, registerToOpenDistribution } from '@/lib/holidayDistributions'
import { cardEligibility, linkHolidayCard, HOLIDAY_CARD_DIGITS } from '@/lib/holidayCards'
import { getHolidayMessages, type HolidayMessages } from '@/lib/yemotHolidayMessages'

export const dynamic = 'force-dynamic'

// ⚠️ משתנה חדש לכל ניסיון הקלדה: קריאה חוזרת של משתנה שכבר מלא יוצרת לולאה
// אינסופית בימות. לכן לתיקון מספר כרטיס יש 5 משתנים ולא אחד.
const MENU_VAR = 'collect_menu'
const CARD_VARS = ['collect_card', 'collect_card2', 'collect_card3', 'collect_card4', 'collect_card5']
const CARD_OK_VARS = ['collect_cardok', 'collect_cardok2', 'collect_cardok3', 'collect_cardok4', 'collect_cardok5']

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b))
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

// TTS של ימות אינו סובל את התווים האלה — מסירים אותם ולא נותנים להם לשבור שיחה.
// ⚠️ פסיק נשאר בכוונה: הוא ההפסקה הקצרה שמאפשרת הקראת ספרות אחת-אחת.
const tts = (t: string) => String(t ?? '').replace(/[.\-"'&|]/g, ' ').replace(/ +/g, ' ').trim()
const tToken = (t: string) => `t-${tts(t)}`
const joinTokens = (...tokens: string[]) => tokens.filter(Boolean).join('.')
const idMessage = (...tokens: string[]) => `id_list_message=${joinTokens(...tokens)}`
const goToFolder = (target: string) => `go_to_folder=${target}`

type ReadOpts = { max?: number | ''; min?: number; wait?: number; allowed?: (string | number)[] }
function readTap(valName: string, promptTokens: string[], opts: ReadOpts = {}): string {
  const { max = '', min = 1, wait = 15, allowed } = opts
  const ops = [
    valName, 'yes',
    max === '' ? '' : String(max), String(min), String(wait),
    'No', 'no', 'no', '',
    allowed && allowed.length ? allowed.join('.') : '',
    '', '', '', '',
  ]
  return `read=${joinTokens(...promptTokens)}=${ops.join(',')}`
}

function yemotText(commands: string[], callId?: string) {
  const body = commands.join('&') + '&'
  console.log(`[yemot-holiday] response${callId ? ` (callId=${callId})` : ''}: ${body}`)
  return new NextResponse(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

const msgToken = (msgs: HolidayMessages, key: string, repl?: Record<string, string>) => {
  const m = msgs[key]
  if (m?.audio) return `f-${m.audio}`
  let t = m?.text ?? ''
  if (repl) for (const [k, v] of Object.entries(repl)) t = t.replaceAll(`{${k}}`, v)
  return tToken(t)
}

// ⚠️ דדופ שיוך: ימות שולחת לעיתים את אותה בקשה פעמיים, ושיוך כפול היה מייצר
// קריאה שנייה לנדרים על אותו כרטיס. המפתח הוא שיחה + כרטיס, כך ששיחה חדשה
// (למשל אחרי תקלה) תמיד מעובדת מחדש.
const _linkDedup = new Map<string, { at: number; body: string }>()
const LINK_DEDUP_MS = 90_000
function pruneDedup(now: number) {
  for (const [k, v] of _linkDedup) if (now - v.at > LINK_DEDUP_MS) _linkDedup.delete(k)
}

/** נרמול טלפון ישראלי להשוואה — ספרות בלבד, בלי קידומת בינלאומית ובלי אפס מוביל. */
function phoneKey(v: unknown): string {
  let d = String(v ?? '').replace(/\D/g, '')
  if (d.startsWith('972')) d = d.slice(3)
  return d.replace(/^0+/, '')
}

/** איתור המשפחה לפי מספר הטלפון שממנו התקשרו (ראשי / נוסף / של האישה). */
async function findByPhone(phone: string) {
  const db = getServiceClient()
  if (!db) return null
  const key = phoneKey(phone)
  if (!key) return null
  const { data } = await db
    .from('beneficiaries')
    .select('id, full_name, family_name, spouse_name, phone, phone2, spouse_phone, eligibility_status')
    .or(`phone.ilike.%${key}%,phone2.ilike.%${key}%,spouse_phone.ilike.%${key}%`)
    .limit(5)
  const rows = (data ?? []) as { id: string; family_name?: string | null; full_name?: string | null; spouse_name?: string | null; phone?: string | null; phone2?: string | null; spouse_phone?: string | null; eligibility_status?: string | null }[]
  // ⚠️ ilike הוא התאמה גסה — מאמתים התאמה מדויקת אחרי הנרמול, אחרת מספר
  // שמכיל את המספר כתת-מחרוזת היה יכול לרשום משפחה אחרת.
  return rows.find(r => [r.phone, r.phone2, r.spouse_phone].some(p => phoneKey(p) === key)) ?? null
}

/** הקראת מספר הכרטיס ספרה-ספרה: פסיק בין ספרות = הפסקה קצרה בימות. */
const spacedDigits = (card: string) => card.split('').join(', ') + ' , ,'

async function handle(params: Record<string, string>): Promise<NextResponse> {
  const apiPhone = String(params['ApiPhone'] ?? '').trim()
  const callId = String(params['ApiCallId'] ?? '').trim()

  const secret = process.env.YEMOT_WEBHOOK_SECRET
  if (!secret) {
    console.error('[yemot-holiday] YEMOT_WEBHOOK_SECRET אינו מוגדר — דחיית כל הבקשות (fail-closed)')
    return yemotText([idMessage(tToken('אין הרשאה')), goToFolder('hangup')], callId)
  }
  if (!safeEqual(params['ApiToken'] ?? '', secret)) {
    console.warn('[yemot-holiday] ApiToken שגוי — דחייה')
    return yemotText([idMessage(tToken('אין הרשאה')), goToFolder('hangup')], callId)
  }

  const msgs = await getHolidayMessages()
  // ⚠️ getOpenDistribution בודק גם את מתג-האב של המחלקה (הגדרות → שערי מחלקות),
  // ולכן סגירה שם מכבה את השלוחה כולה — גם את שיוך הכרטיס.
  const dist = await getOpenDistribution()
  if (!dist) {
    return yemotText([idMessage(msgToken(msgs, 'closed')), goToFolder('hangup')], callId)
  }

  const ben = await findByPhone(apiPhone)
  if (!ben) {
    console.log(`[yemot-holiday] phone=${apiPhone} לא זוהה`)
    return yemotText([idMessage(msgToken(msgs, 'not_found')), goToFolder('hangup')], callId)
  }
  const name = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || String(ben.full_name ?? '')
  const distName = `${dist.name}${dist.year ? ` ${dist.year}` : ''}`

  // ── ענף 2: שיוך כרטיס — נבדק ראשון, כי נוכחות משתנה כרטיס מסמנת שאנחנו
  // באמצע התהליך (ימות שולחת בכל בקשה גם את ההקשות הקודמות, כולל התפריט).
  let attempt = -1
  for (let i = CARD_VARS.length - 1; i >= 0; i--) {
    if (String(params[CARD_VARS[i]] ?? '').trim()) { attempt = i; break }
  }
  if (attempt >= 0) {
    return cardStep(params, { attempt, msgs, benId: ben.id, name, callId, phone: apiPhone })
  }

  // ── התפריט ────────────────────────────────────────────────────────────────
  const choice = String(params[MENU_VAR] ?? '').trim()
  if (!choice) {
    return yemotText([
      readTap(MENU_VAR, [
        msgToken(msgs, 'identify', { name }),
        msgToken(msgs, 'menu', { distribution: distName }),
      ], { max: 1, min: 1, allowed: [1, 2] }),
    ], callId)
  }

  // ── ענף 1: רישום לחלוקה הפתוחה ────────────────────────────────────────────
  if (choice === '1') {
    const db = getServiceClient()
    if (db) {
      const { data: already } = await db.from('distribution_recipients')
        .select('id').eq('distribution_id', dist.id).eq('beneficiary_id', ben.id).maybeSingle()
      if (already) {
        return yemotText([idMessage(msgToken(msgs, 'already', { name, distribution: distName })), goToFolder('hangup')], callId)
      }
    }
    const result = await registerToOpenDistribution(ben.id, 'phone', { phone: apiPhone })
    if (!result.ok) {
      console.error('[yemot-holiday] register failed:', result.error)
      return yemotText([idMessage(msgToken(msgs, 'failed')), goToFolder('hangup')], callId)
    }
    console.log(`[yemot-holiday] נרשם: ${ben.id} (${name}) לחלוקה ${dist.id} · created=${result.created}`)
    return yemotText([
      idMessage(msgToken(msgs, result.created ? 'success' : 'already', { name, distribution: distName })),
      goToFolder('hangup'),
    ], callId)
  }

  // ── ענף 2: פתיחת שלב הכרטיס ───────────────────────────────────────────────
  if (choice === '2') {
    const elig = await cardEligibility(ben.id)
    if (!elig.allowed) {
      console.log(`[yemot-holiday] card denied for ${ben.id}: ${elig.reason}`)
      return yemotText([idMessage(msgToken(msgs, DENY_MSG[elig.reason])), goToFolder('hangup')], callId)
    }
    return yemotText([
      readTap(CARD_VARS[0], [msgToken(msgs, 'card_ask')], { max: HOLIDAY_CARD_DIGITS, min: 1 }),
    ], callId)
  }

  return yemotText([idMessage(msgToken(msgs, 'cancelled')), goToFolder('hangup')], callId)
}

// כל סירוב וההודעה שלו — כדי שהמתקשר ידע אם עליו להירשם, להמתין, או שאין מה לעשות
const DENY_MSG: Record<string, string> = {
  closed: 'closed',
  not_registered: 'card_not_registered',
  not_approved: 'card_not_approved',
  rejected: 'card_rejected',
  already_linked: 'card_already',
}

/** שלב הקלדת הכרטיס: אימות 16 ספרות → חזרה על הספרות → שיוך בנדרים. */
async function cardStep(
  params: Record<string, string>,
  ctx: { attempt: number; msgs: HolidayMessages; benId: string; name: string; callId: string; phone: string },
): Promise<NextResponse> {
  const { attempt, msgs, benId, callId, phone } = ctx
  const card = String(params[CARD_VARS[attempt]] ?? '').trim().replace(/\D/g, '')
  const ok = String(params[CARD_OK_VARS[attempt]] ?? '').trim()

  // ⚠️ הזכאות נבדקת שוב בכל שלב ולא רק בפתיחת הענף: אישור יכול להתבטל באמצע
  // השיחה, וכרטיס שמשויך אחרי ביטול היה נושא כסף שלא אושר.
  const elig = await cardEligibility(benId)
  if (!elig.allowed) {
    console.log(`[yemot-holiday] card step denied for ${benId}: ${elig.reason}`)
    return yemotText([idMessage(msgToken(msgs, DENY_MSG[elig.reason])), goToFolder('hangup')], callId)
  }

  // טרם אישר את הספרות → חזרה עליהן ובקשת 1=אישור / 2=תיקון
  if (!ok) {
    if (card.length !== HOLIDAY_CARD_DIGITS) {
      // הגנה (ימות אמורה לאכוף 16) — מבקשים מספר חדש במשתנה הבא, לא לולאה
      if (attempt + 1 < CARD_VARS.length) {
        return yemotText([
          readTap(CARD_VARS[attempt + 1], [msgToken(msgs, 'card_length'), msgToken(msgs, 'card_ask')], { max: HOLIDAY_CARD_DIGITS, min: 1 }),
        ], callId)
      }
      return yemotText([idMessage(msgToken(msgs, 'card_length')), goToFolder('hangup')], callId)
    }
    return yemotText([
      readTap(CARD_OK_VARS[attempt], [msgToken(msgs, 'card_readback', { card: spacedDigits(card) })], { max: 1, min: 1, allowed: [1, 2], wait: 20 }),
    ], callId)
  }

  // תיקון → מספר חדש במשתנה הבא
  if (ok === '2') {
    if (attempt + 1 < CARD_VARS.length) {
      return yemotText([
        readTap(CARD_VARS[attempt + 1], [msgToken(msgs, 'card_ask')], { max: HOLIDAY_CARD_DIGITS, min: 1 }),
      ], callId)
    }
    return yemotText([idMessage(tToken('יותר מדי ניסיונות אנא נסו שוב מאוחר יותר או פנו למשרד')), goToFolder('hangup')], callId)
  }

  if (ok !== '1') {
    return yemotText([idMessage(msgToken(msgs, 'cancelled')), goToFolder('hangup')], callId)
  }

  // ── אישר → שיוך בנדרים ────────────────────────────────────────────────────
  const dedupKey = callId ? `link:${callId}:${card}` : ''
  if (dedupKey) {
    const cached = _linkDedup.get(dedupKey)
    if (cached && Date.now() - cached.at < LINK_DEDUP_MS) {
      console.log(`[yemot-holiday] dedup hit ${dedupKey}`)
      return new NextResponse(cached.body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }
  }
  const respond = (commands: string[]) => {
    const body = commands.join('&') + '&'
    if (dedupKey) { pruneDedup(Date.now()); _linkDedup.set(dedupKey, { at: Date.now(), body }) }
    console.log(`[yemot-holiday] link response (callId=${callId}): ${body}`)
    return new NextResponse(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  const res = await linkHolidayCard(benId, card, { phone })
  if (!res.ok) {
    // ⚠️ מקריאים את הסיבה המדויקת מנדרים ולא "אירעה תקלה": ברוב המקרים היא
    // ניתנת לפתרון מיד (כרטיס שגוי, כרטיס משויך למשפחה אחרת), והמתקשר צריך לדעת.
    console.error(`[yemot-holiday] card link failed for ${benId}: ${res.error}`)
    return respond([
      idMessage(res.error ? tToken(`שיוך הכרטיס לא הושלם הסיבה ${res.error}`) : msgToken(msgs, 'card_failed')),
      goToFolder('hangup'),
    ])
  }
  console.log(`[yemot-holiday] כרטיס שויך: ben=${benId} · last4=${card.slice(-4)} · linked=${res.linked}`)
  return respond([
    idMessage(msgToken(msgs, res.linked ? 'card_success' : 'card_already')),
    goToFolder('hangup'),
  ])
}

function paramsFromSearch(url: URL): Record<string, string> {
  const out: Record<string, string> = {}
  url.searchParams.forEach((v, k) => { out[k] = v })
  return out
}

export async function GET(request: NextRequest) {
  return handle(paramsFromSearch(new URL(request.url)))
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const params = paramsFromSearch(url)
  try {
    const ct = request.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      Object.assign(params, await request.json())
    } else {
      const form = await request.formData()
      form.forEach((v, k) => { params[k] = String(v) })
    }
  } catch { /* ימות שולחת לעיתים ב-query בלבד */ }
  return handle(params)
}
