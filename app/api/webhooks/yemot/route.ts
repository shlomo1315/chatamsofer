// ─────────────────────────────────────────────────────────────────────────────
// Webhook לימות המשיח — התפריט הראשי.
//
// 🔴 שלוחה אחת שמנתבת לכל השאר. עד כה כל שירות היה שלוחה נפרדת שחייגו
// אליה ישירות, ולא הייתה נקודת כניסה אחת למתקשר.
//
// 🔴 אינו משנה דבר בשלוחות הקיימות. הניתוב נעשה ב-go_to_folder — כלומר
// ימות עצמה מעבירה את השיחה, והשלוחות ממשיכות לרוץ בדיוק כפי שרצו. מי
// שמחייג ישירות אליהן (או שיחה יוצאת ל-OTP) אינו מרגיש שינוי.
//
// ⚠️ הקוד הזה רדום עד שמגדירים את השלוחה בימות. עד אז הוא אינו מקבל
// שום בקשה ואינו יכול לשבור דבר.
//
// ⚠️ יעדי ההפניה הם *שמות שלוחות בימות* ולא נתיבי HTTP. הם מוגדרים
// במשתני סביבה כי המספור נקבע במערכת הטלפוניה ולא כאן.
//
// פרוטוקול התגובה (זהה לשאר השלוחות):
//   • הודעה:      id_list_message=<token>      (t-<טקסט TTS> או f-<קובץ>)
//   • קליטת הקשה: read=<token>=<valName>,...
//   • מעבר:       go_to_folder=<שלוחה>  ·  ניתוק: go_to_folder=hangup
//   • פקודות מופרדות ב-"&". טקסט TTS אסור שיכיל: . - " ' & |
//
// ⚠️ fail-closed על ApiToken, כמו בשאר השלוחות: אין כאן פעולה כספית, אבל
// שלוחה פתוחה היא דלת לניחוש התנהגות המערכת.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  MAIN_MENU_MSG_KEY, mergeMainMenuMessages, type MainMenuMessages,
} from '@/lib/yemotMainMenu'
import { IVR_CONFIG_KEY, normalizeIvr, type IvrConfig } from '@/lib/ivrBuilder'
import { ivrStep, nextNodeId, NODE_PARAM, DIGIT_PARAM } from '@/lib/ivrRuntime'

export const dynamic = 'force-dynamic'

/** שמות השלוחות בימות. ⚠️ נקבעים במערכת הטלפוניה — לכן משתני סביבה. */
const FOLDER_HOLIDAY = process.env.YEMOT_FOLDER_HOLIDAY || '/2'
const FOLDER_MATERNITY = process.env.YEMOT_FOLDER_MATERNITY || '/3'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b))
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

// TTS של ימות אינו סובל את התווים האלה — כולל גרש וגרשיים עבריים.
const tts = (t: string) => String(t ?? '').replace(/[.\-"'&|׳״]/g, ' ').replace(/\s+/g, ' ').trim()
const tToken = (t: string) => `t-${tts(t)}`
const joinTokens = (...tokens: string[]) => tokens.filter(Boolean).join('.')
const idMessage = (...tokens: string[]) => `id_list_message=${joinTokens(...tokens)}`
const goToFolder = (target: string) => `go_to_folder=${target}`

const msgToken = (msgs: MainMenuMessages, key: string): string => {
  const m = msgs[key]
  if (m?.audio) return `f-${m.audio}`
  return m?.text ? tToken(m.text) : ''
}

function yemotText(commands: string[], callId?: string) {
  const body = commands.join('&') + '&'
  console.log(`[yemot-menu] response${callId ? ` (callId=${callId})` : ''}: ${body}`)
  return new NextResponse(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

let _admin: SupabaseClient | null = null
function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!_admin) _admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return _admin
}

async function loadMessages(): Promise<MainMenuMessages> {
  const db = admin()
  if (!db) return mergeMainMenuMessages(null)
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', MAIN_MENU_MSG_KEY).maybeSingle()
    // ⚠️ app_settings היא עמודת text — הערך נשמר כמחרוזת JSON ומפוענח כאן.
    return mergeMainMenuMessages(data?.value ? JSON.parse(String(data.value)) : null)
  } catch {
    // ⚠️ נופלים לברירות המחדל ולא מנתקים: תפריט שלא נפתח משתק את כל
    // המערכת הטלפונית, גם כשהשלוחות עצמן תקינות.
    return mergeMainMenuMessages(null)
  }
}

/**
 * מבנה השלוחות שהמנהל בנה.
 *
 * ⚠️ מוחזר null כשאין מבנה שמור, ואז רצה המסלול הקבוע שלמטה. כך
 * המערכת ממשיכה לעבוד בדיוק כשהייתה עד שמישהו נכנס לבנות בפועל.
 */
async function loadIvrConfig(): Promise<IvrConfig | null> {
  const db = admin()
  if (!db) return null
  try {
    const { data } = await db.from('app_settings')
      .select('value').eq('key', IVR_CONFIG_KEY).maybeSingle()
    if (!data?.value) return null
    return normalizeIvr(JSON.parse(String(data.value)))
  } catch {
    // ⚠️ נפילה למסלול הקבוע ולא ניתוק: תקלת קריאה חייבת להשאיר מערכת
    // טלפונית עובדת.
    return null
  }
}

/** התפריט עצמו — הקשה אחת, רק הספרות שיש להן יעד. */
function askMenu(msgs: MainMenuMessages, withWelcome: boolean, invalid = false): string {
  const prompt = joinTokens(
    invalid ? msgToken(msgs, 'invalid') : '',
    withWelcome && !invalid ? msgToken(msgs, 'welcome') : '',
    msgToken(msgs, 'menu'),
  )
  const ops = ['choice', 'yes', '1', '1', '10', 'No', 'no', 'no', '', '1.2.9', '', '', '', '']
  return `read=${prompt}=${ops.join(',')}`
}

async function handle(params: Record<string, string>): Promise<NextResponse> {
  const callId = String(params['ApiCallId'] ?? '').trim()

  const secret = process.env.YEMOT_WEBHOOK_SECRET
  if (!secret) {
    console.error('[yemot-menu] YEMOT_WEBHOOK_SECRET אינו מוגדר — דחיית כל הבקשות (fail-closed)')
    return yemotText([idMessage(tToken('אין הרשאה')), goToFolder('hangup')], callId)
  }
  if (!safeEqual(params['ApiToken'] ?? '', secret)) {
    console.warn('[yemot-menu] ApiToken שגוי — דחייה')
    return yemotText([idMessage(tToken('אין הרשאה')), goToFolder('hangup')], callId)
  }

  // 🔴 מבנה דינמי קודם: אם המנהל בנה שלוחות במסך ההגדרות, הן מנצחות.
  //
  // ⚠️ בלי מבנה שמור ממשיכים במסלול הקבוע שלמטה — כך המעבר לניהול
  // דינמי אינו משנה דבר עבור המתקשר עד שמישהו באמת בונה.
  const ivr = await loadIvrConfig()
  if (ivr) {
    const nodeId = String(params[NODE_PARAM] ?? '').trim()
    const digit = String(params[DIGIT_PARAM] ?? '').trim()
    const step = ivrStep(ivr, nodeId, digit)
    const next = nextNodeId(ivr, nodeId, digit)
    // ⚠️ המיקום מוחזר לימות כמשתנה: היא אינה שומרת מצב בין קריאות,
    // ובלעדיו כל הקשה הייתה מתחילה מהתפריט הראשי.
    return yemotText([...step.commands, `${NODE_PARAM}=${next}`], callId)
  }

  const msgs = await loadMessages()
  const choice = String(params['choice'] ?? '').trim()

  // אין הקשה עדיין — ברכה ותפריט.
  if (!choice) return yemotText([askMenu(msgs, true)], callId)

  switch (choice) {
    case '1':
      return yemotText([goToFolder(FOLDER_HOLIDAY)], callId)
    case '2':
      return yemotText([goToFolder(FOLDER_MATERNITY)], callId)
    case '9':
      // ⚠️ ההודעה ואז חזרה לתפריט ולא ניתוק: מי שבירר הודעה עדיין רוצה
      // להירשם, וניתוק היה מאלץ אותו לחייג שוב.
      return yemotText([idMessage(msgToken(msgs, 'notice')), askMenu(msgs, false)], callId)
    default:
      // ⚠️ re_enter='yes' ב-read הוא מה שמונע לולאה: ימות מבקשת הקשה
      // חדשה במקום לשלוח שוב את הערך הקודם.
      return yemotText([askMenu(msgs, false, true)], callId)
  }
}

async function entry(req: NextRequest): Promise<NextResponse> {
  const params: Record<string, string> =
    req.method === 'GET'
      ? Object.fromEntries(req.nextUrl.searchParams.entries())
      : await req.formData()
          .then(f => Object.fromEntries(f.entries()) as Record<string, string>)
          .catch(() => ({} as Record<string, string>))
  return handle(params)
}

export async function POST(req: NextRequest) { return entry(req) }
export async function GET(req: NextRequest) { return entry(req) }
