// Webhook לימות המשיח — טעינה חודשית למוקדי חלוקת הכרטיסים.
// המוקד מתקשר מהמספר המורשה: בפעם הראשונה מקיש כרטיס (נשמר פעם אחת), ובכל חודש
// מקיש 1 לטעינה. פרוטוקול התגובה זהה ל-yemot-maternity (id_list_message / read / go_to_folder).
// טקסט TTS אסור שיכיל: . - " ' & |

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  findCenterByPhone, isLoadedThisMonth, israelMonth, linkCenterCard, normalizeCallerPhone, runMonthlyLoad,
  type CenterAccount,
} from '@/lib/centerMonthlyLoad'

export const dynamic = 'force-dynamic'

const CARD_DIGITS = 16
const CARD_VARS = ['center_card', 'center_card2', 'center_card3', 'center_card4', 'center_card5']
const CONFIRM_VARS = ['center_confirm', 'center_confirm2', 'center_confirm3', 'center_confirm4', 'center_confirm5']
const GO_VAR = 'center_go'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b))
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

let _admin: SupabaseClient | null = null
function adminClient() {
  if (_admin) return _admin
  _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  return _admin
}

const TTS_INVALID = /[.\-"'&|׳״]/g
const tts = (t: string) => String(t ?? '').replace(TTS_INVALID, ' ').replace(/\s+/g, ' ').trim()
const tText = (t: string) => `t-${tts(t)}`
const spaced = (digits: string) => digits.split('').join(', ')
const idMessage = (...tokens: string[]) => `id_list_message=${tokens.filter(Boolean).join('.')}`
const hangup = 'go_to_folder=hangup'

function readTap(valName: string, prompt: string[], opts: { max?: number | ''; allowed?: number[]; wait?: number } = {}): string {
  const { max = '', allowed, wait = 15 } = opts
  const ops = [valName, 'yes', max === '' ? '' : String(max), '1', String(wait), 'No', 'no', 'no', '', allowed?.join('.') ?? '', '', '', '', '']
  return `read=${prompt.join('.')}=${ops.join(',')}`
}

function yemotText(commands: string[]) {
  return new NextResponse(commands.join('&') + '&', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
const say = (text: string) => yemotText([idMessage(tText(text)), hangup])

// הצעת הטעינה: מקריאה את מספר הכרטיס ומבקשת להקיש 1
const offerCommand = (card: string, lead = '') =>
  readTap(GO_VAR, [lead && tText(lead), tText(`מספר הכרטיס שלך הוא ${spaced(card)}. לביצוע טעינה של החודש הנוכחי הקישו 1`)].filter(Boolean), { max: 1, allowed: [1], wait: 20 })

const askCardCommand = (idx: number, lead = '') =>
  readTap(CARD_VARS[idx], [lead && tText(lead), tText('שלום. הטלפון שלך מזוהה. הקש את מספר הכרטיס בן 16 ספרות')].filter(Boolean), { max: CARD_DIGITS })

// דדופ — ימות שולחת לעיתים אותה בקשה פעמיים; שומרים את התגובה כדי שלחיצה כפולה תקבל אותה תשובה
const _dedup = new Map<string, { at: number; body: string }>()
const DEDUP_MS = 60_000

async function handle(params: Record<string, string>): Promise<NextResponse> {
  const secret = process.env.YEMOT_WEBHOOK_SECRET
  if (!secret || !safeEqual(params['ApiToken'] ?? '', secret)) return say('אין הרשאה')

  const phone = normalizeCallerPhone(params['ApiPhone'] ?? '')
  if (!phone) return say('שגיאה במספר המתקשר')

  const admin = adminClient()
  let acc: CenterAccount | null
  try { acc = await findCenterByPhone(admin, phone) } catch { return say('שגיאה במערכת. נסו שוב מאוחר יותר') }
  if (!acc) return say('המספר שממנו התקשרת אינו מורשה לטעינה')

  const month = israelMonth()

  // ── שיוך כרטיס (פעם אחת) ──
  if (!acc.card_number) {
    let attempt = -1
    for (let i = CARD_VARS.length - 1; i >= 0; i--) if ((params[CARD_VARS[i]] ?? '').trim()) { attempt = i; break }
    if (attempt < 0) return yemotText([askCardCommand(0)])
    const card = (params[CARD_VARS[attempt]] ?? '').replace(/\D/g, '')
    const confirm = (params[CONFIRM_VARS[attempt]] ?? '').trim()
    const next = Math.min(attempt + 1, CARD_VARS.length - 1)
    if (card.length !== CARD_DIGITS) return yemotText([askCardCommand(next, 'מספר הכרטיס חייב להכיל 16 ספרות')])
    if (!confirm) return yemotText([readTap(CONFIRM_VARS[attempt], [tText(`הכרטיס שהקשת הוא ${spaced(card)}, ל, ל, לאישור הקישו 1, לתיקון הקישו 2`)], { max: 1, allowed: [1, 2], wait: 20 })])
    if (confirm !== '1') return yemotText([askCardCommand(next)])
    const linked = await linkCenterCard(admin, acc, card)
    if (!linked.ok) {
      console.error('[yemot-center-load] שיוך כרטיס נכשל:', linked.error)
      return say('לא הצלחנו לשייך את הכרטיס. פנו למזכירות')
    }
    acc = { ...acc, card_number: card }
  }

  // ── מצב החודש ──
  if (await isLoadedThisMonth(admin, acc.center_id, month)) return say('שים לב, החודש הזה כבר הועברה לך הטעינה')

  if ((params[GO_VAR] ?? '').trim() !== '1') {
    return yemotText([offerCommand(acc.card_number!, (params[CARD_VARS[0]] ?? '').trim() ? 'הכרטיס נשמר' : '')])
  }

  // ── טעינה ──
  const { result, error } = await runMonthlyLoad(admin, acc)
  if (result === 'loaded') return say('הטעינה בוצעה בהצלחה. תודה')
  if (result === 'already') return say('שים לב, החודש הזה כבר הועברה לך הטעינה')
  if (result === 'no_stock') return say('אין כרגע מלאי במערכת, אין אפשרות להטעין את הכרטיס')
  if (result === 'busy') return say('הטעינה שלך כבר בטיפול. נסו שוב בעוד כמה דקות')
  console.error('[yemot-center-load] טעינה נכשלה:', error)
  return say('אירעה שגיאה בטעינה. נסו שוב מאוחר יותר')
}

async function entry(req: NextRequest): Promise<NextResponse> {
  const params: Record<string, string> =
    req.method === 'GET'
      ? Object.fromEntries(req.nextUrl.searchParams.entries())
      : await req.formData().then((f) => Object.fromEntries(f.entries()) as Record<string, string>).catch(() => ({} as Record<string, string>))
  const callId = String(params['ApiCallId'] ?? '').trim()
  const sig = callId ? `${callId}|${[...CARD_VARS, ...CONFIRM_VARS, GO_VAR].map((v) => params[v] ?? '').join(',')}` : ''
  const now = Date.now()
  for (const [k, v] of _dedup) if (now - v.at > DEDUP_MS) _dedup.delete(k)
  const hit = sig ? _dedup.get(sig) : undefined
  if (hit) return new NextResponse(hit.body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  const res = await handle(params)
  if (sig) { try { _dedup.set(sig, { at: now, body: await res.clone().text() }) } catch { /* ignore */ } }
  return res
}

export async function POST(req: NextRequest) { return entry(req) }
export async function GET(req: NextRequest) { return entry(req) }
