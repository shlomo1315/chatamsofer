// ─────────────────────────────────────────────────────────────────────────────
// Webhook לימות המשיח — שלוחת הרישום לחלוקת חגים.
//
// ⚠️ שלב א' — *רישום ראשוני בלבד*. שיוך הכרטיס, הטעינה והמוקדים נעשים בשלב הבא
// ואינם בשלוחה הזו. לכן אין תפריט: המשפחה מזוהה, שומעת את שם החלוקה, ומקישה 1.
// שיחה של 15 שניות.
//
// ⚠️ למה זה הערוץ המרכזי: חלק גדול מהמשפחות אינן גולשות. רישום שדורש ממשק היה
// מדיר אותן לגמרי, ולכן הרישום הטלפוני הוא זה שקובע זכאות.
//
// ⚠️ מי יכול להירשם: רק מי שיש לו *כרטסת משלו* באיגוד הצאצאים. מי שמופיע כילד
// בכרטסת של הוריו אינו רשום באיגוד בעצמו — הזיהוי כאן הוא מול טבלת הצאצאים
// בלבד, ולכן ילד כזה לא יזוהה וישמע שעליו להירשם קודם לאיגוד.
//
// הזיהוי: לפי מספר הטלפון שממנו התקשרו (טלפון ראשי, נוסף או של האישה).
// אין הקלדת ת"ז — מי שמתקשר ממספר רשום מזוהה מיד.
//
// פרוטוקול התגובה (זהה לשלוחת היולדות):
//   • הודעה:      id_list_message=<token>      (token = t-<טקסט TTS> או f-<קובץ>)
//   • קליטת הקשה: read=<token>=<valName>,<re_enter>,<max>,<min>,<sec>,No,no,no,,<digits>,,,,
//   • ניתוק:      go_to_folder=hangup
//   • פקודות מופרדות ב-"&". טקסט TTS אסור שיכיל: . - " ' & |
//
// ⚠️ fail-closed על ApiToken: השלוחה יוצרת רישום שגורר תקציב, ולכן בקשה בלי
// אימות נדחית — כולל כשהסוד עצמו אינו מוגדר.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getServiceClient } from '@/lib/apiAuth'
import { getOpenDistribution, registerToOpenDistribution } from '@/lib/holidayDistributions'
import { getHolidayMessages, type HolidayMessages } from '@/lib/yemotHolidayMessages'

export const dynamic = 'force-dynamic'

// ⚠️ משתנה חדש לכל ניסיון: קריאה חוזרת של משתנה שכבר מלא יוצרת לולאה אינסופית
// בימות. כאן יש הקשה אחת, ולכן די בשלושה.
const CONFIRM_VARS = ['collect_confirm', 'collect_confirm2', 'collect_confirm3']

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b))
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

// TTS של ימות אינו סובל את התווים האלה — מסירים אותם ולא נותנים להם לשבור שיחה
const tts = (t: string) => String(t ?? '').replace(/[.\-"'&|]/g, ' ').replace(/\s+/g, ' ').trim()
const tToken = (t: string) => `t-${tts(t)}`
const joinTokens = (...tokens: string[]) => tokens.filter(Boolean).join('.')
const idMessage = (...tokens: string[]) => `id_list_message=${joinTokens(...tokens)}`
const goToFolder = (target: string) => `go_to_folder=${target}`

function readTap(valName: string, promptTokens: string[], allowed: (string | number)[]): string {
  const ops = [valName, 'yes', '1', '1', '10', 'No', 'no', 'no', '', allowed.join('.'), '', '', '', '']
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

/** נרמול טלפון ישראלי להשוואה — ספרות בלבד, בלי קידומת בינלאומית ובלי אפס מוביל. */
function phoneKey(v: unknown): string {
  let d = String(v ?? '').replace(/\D/g, '')
  if (d.startsWith('972')) d = d.slice(3)
  return d.replace(/^0+/, '')
}

type Member = {
  id: string
  family_name?: string | null
  full_name?: string | null
  spouse_name?: string | null
  phone?: string | null
  phone2?: string | null
  spouse_phone?: string | null
  is_active?: boolean | null
  eligibility_status?: string | null
}

// ⚠️ כרטסת שאינה פתוחה לרישום: לא-פעילה, או שנדחתה. רישום של משפחה שנדחתה
// יוצר התחייבות תקציבית למי שהארגון החליט לא לאשר — ולכן נחסם ומוסבר בשיחה.
// כרטסת שממתינה לאישור *כן* נרשמת: היא רשומה באיגוד, והאישור לחלוקה נפרד.
function memberCanRegister(m: Member): boolean {
  if (m.is_active === false) return false
  return m.eligibility_status !== 'rejected'
}

/**
 * איתור המשפחה לפי מספר הטלפון שממנו התקשרו (ראשי / נוסף / של האישה).
 *
 * ⚠️ החיפוש הוא בטבלת הצאצאים בלבד ולא בילדים שרשומים בתוך כרטסת של הורה:
 * הרישום לחלוקה פתוח רק למי שיש לו כרטסת משלו באיגוד.
 */
async function findMemberByPhone(phone: string): Promise<Member | null> {
  const db = getServiceClient()
  if (!db) return null
  const key = phoneKey(phone)
  if (!key) return null
  const { data } = await db
    .from('beneficiaries')
    .select('id, full_name, family_name, spouse_name, phone, phone2, spouse_phone, is_active, eligibility_status')
    .or(`phone.ilike.%${key}%,phone2.ilike.%${key}%,spouse_phone.ilike.%${key}%`)
    .limit(5)
  const rows = (data ?? []) as Member[]
  // ⚠️ ilike הוא התאמה גסה — מאמתים התאמה מדויקת אחרי הנרמול, אחרת מספר
  // שמכיל את המספר כתת-מחרוזת היה יכול לרשום משפחה אחרת.
  const exact = rows.filter(r => [r.phone, r.phone2, r.spouse_phone].some(p => phoneKey(p) === key))
  // מעדיפים כרטסת שיכולה להירשם — כדי ששתי כרטסות היסטוריות (אחת לא פעילה)
  // לא יחסמו משפחה שדווקא כן רשומה כראוי.
  return exact.find(memberCanRegister) ?? exact[0] ?? null
}

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
  // ולכן סגירה שם מכבה את השלוחה כולה.
  const dist = await getOpenDistribution()
  if (!dist) {
    return yemotText([idMessage(msgToken(msgs, 'closed')), goToFolder('hangup')], callId)
  }

  const ben = await findMemberByPhone(apiPhone)
  if (!ben) {
    console.log(`[yemot-holiday] phone=${apiPhone} אינו רשום באיגוד`)
    return yemotText([idMessage(msgToken(msgs, 'not_found')), goToFolder('hangup')], callId)
  }
  if (!memberCanRegister(ben)) {
    console.log(`[yemot-holiday] ben=${ben.id} כרטסת אינה פתוחה לרישום (active=${ben.is_active}, status=${ben.eligibility_status})`)
    return yemotText([idMessage(msgToken(msgs, 'not_eligible')), goToFolder('hangup')], callId)
  }

  const name = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || String(ben.full_name ?? '')
  const distName = `${dist.name}${dist.year ? ` ${dist.year}` : ''}`

  // ⚠️ כבר רשום — בכל ערוץ (אתר, מייל, נדרים או שיחה קודמת). נאמר לו זאת *לפני*
  // שמציעים לו להקיש 1, כדי שלא יאשר רישום שכבר קיים ויחשוב שהיה כפול.
  const db = getServiceClient()
  if (db) {
    const { data: already } = await db.from('distribution_recipients')
      .select('id').eq('distribution_id', dist.id).eq('beneficiary_id', ben.id).maybeSingle()
    if (already) {
      return yemotText([idMessage(msgToken(msgs, 'already', { name, distribution: distName })), goToFolder('hangup')], callId)
    }
  }

  // שלב האישור — 1 לרישום. המשתנה נקרא רק אחרי שהוקש (ימות מחזירה אותו בפרמטרים).
  const confirmed = CONFIRM_VARS.map(v => String(params[v] ?? '').trim()).filter(Boolean).pop() ?? ''
  if (!confirmed) {
    return yemotText([
      readTap(CONFIRM_VARS[0], [
        msgToken(msgs, 'identify', { name }),
        msgToken(msgs, 'ask_confirm', { distribution: distName }),
      ], [1]),
    ], callId)
  }
  if (confirmed !== '1') {
    return yemotText([idMessage(msgToken(msgs, 'cancelled')), goToFolder('hangup')], callId)
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
