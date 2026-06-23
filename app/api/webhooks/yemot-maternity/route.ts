// Webhook לימות המשיח — שיוך כרטיס נדרים של יולדת לתיק הלידה הפעיל שלה.
// ימות מצלצלת לכאן עם מספר הטלפון של המתקשרת.
// הלוגיקה:
//   1. חיפוש המשפחה לפי מספר טלפון (phone / phone2 / spouse_phone)
//      • לא נמצא → הודעה + חזרה לתפריט הראשי
//   2. בדיקה שיש לידה פעילה תוך 6 שבועות (six_weeks_end >= היום)
//      • אין → "אין כרגע לידה מעודכנת... אין זכאות לכרטיס"
//   3. בקשת מספר כרטיס הנדרים (DTMF) ושמירתו ב-maternity_aids.card_number
//   4. בחירת מוקד: הקראת רשימת המוקדים (לפי code) + קליטת הקוד
//   5. חיבור הכרטיס למשפחה בנדרים (SetClientMagneticCard) + הורדת כרטיס ממלאי המוקד
//   6. החזרת טקסט הצלחה/כישלון לפי תשובת נדרים

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

// ── תגובות ימות ─────────────────────────────────────────────────────────────
// ימות מצפה לתוכן מסוג text/plain; פקודות מופרדות ב-&.
function yemotText(commands: string[], callId?: string) {
  const body = commands.join('&') + '&'
  console.log(`[yemot-maternity] response${callId ? ` (callId=${callId})` : ''}: ${body}`)
  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

// TTS: id_list_message=t-TEXT. (הנקודה בסוף חובה)
function say(...msgs: string[]) {
  return msgs.map((m) => `id_list_message=t-${m}.`)
}

// ניתוק שיחה — ימות מזהה go_to_folder=hangup כסיום תקין.
// token בודד "hangup" *לא* עובד וגורם לימות לחזור ולקרוא ל-webhook (קריאה כפולה).
function hangup() {
  return ['go_to_folder=hangup']
}

// חזרה לתפריט הראשי (שורש מערכת ימות)
function toMainMenu() {
  return ['go_to_folder=/']
}

// read_v2: ימות אוספת DTMF ומעבירה לשלב הבא.
// פורמט: read_v2,<step>,<type>,<min_digits>,<timeout_sec>,<max_digits>
// type=1 → DTMF (tap). <step> חוזר אלינו כ-ApiEnterID, והערך ב-Digits.
function readCard(maxDigits: number = 20) {
  return [
    `id_list_message=t-אנא הקישו את מספר הכרטיס של נדרים שקיבלתם, משמאל לימין, ולסיום הקישו סולמית.`,
    `read_v2,collect_card,1,1,15,${maxDigits}`,
  ]
}

// בקשת בחירת מוקד — מקריא את רשימת המוקדים הפעילים (לפי code) ואז קולט את הקוד.
function readCenter(centers: CenterRow[]) {
  const intro = 'אנא בחרו את המוקד שבו תקבלו את הכרטיס. הקישו את קוד המוקד.'
  const items = centers.map((c) => `למוקד ${c.name} הקישו ${c.code}.`)
  const maxLen = Math.max(1, ...centers.map((c) => String(c.code).length))
  return [
    ...say(intro, ...items),
    `read_v2,collect_center,1,1,20,${maxLen}`,
  ]
}

// ── קריאת ערך DTMF מהפרמטרים ──────────────────────────────────────────────
// ימות עשויה להחזיר את הקלט ב-Digits או בשם השלב — קוראים מכל המקורות.
function digitsFor(params: Record<string, string>, step: string): string {
  return String(params['Digits'] ?? params[step] ?? '').trim()
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

// ── חיפוש משפחה + לידה פעילה (שותף לכל השלבים) ─────────────────────────────
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

  if (!family) return { notFound: true }

  // מושכים את כל רשומות הלידה של המשפחה. *לא* מסננים status ב-SQL כי
  // status=NULL היה נפסל ע"י .not(eq) — מסננים cancelled ב-JS במקום.
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
    const end = a.six_weeks_end
      ? new Date(a.six_weeks_end)
      : addDays(new Date(a.birth_date), 42)
    return end >= now
  })

  const familyName = [family.family_name, family.full_name].filter(Boolean).join(' ')

  // אבחון: מה נמצא במסד הנתונים עבור משפחה זו
  const diag = (allAids ?? []).map((a) => {
    const end = a.six_weeks_end ? new Date(a.six_weeks_end) : addDays(new Date(a.birth_date), 42)
    return `${a.birth_date}→${end.toISOString().slice(0, 10)}(${a.status ?? 'null'})`
  }).join(', ')
  console.log(`[yemot-maternity] family ${family.id} (${familyName}): ${allAids?.length ?? 0} aids [${diag}], active=${active?.id ?? 'none'}`)

  if (!active) {
    const note = (allAids?.length ?? 0) === 0
      ? 'אין רשומות לידה כלל'
      : `נמצאו ${allAids!.length} רשומות אך אף אחת לא בחלון 6 שבועות: ${diag}`
    return { noBirth: true, familyId: family.id, familyName, note }
  }

  return { family, active, familyName }
}

// ── Handler ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  return handle(req)
}
export async function GET(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  const params: Record<string, string> =
    req.method === 'GET'
      ? Object.fromEntries(req.nextUrl.searchParams.entries())
      : await req.formData().then((f) => Object.fromEntries(f.entries()) as Record<string, string>).catch(() => ({} as Record<string, string>))

  const apiPhone = String(params['ApiPhone'] ?? '').trim()
  const callId = String(params['ApiCallId'] ?? '').trim()
  const step = String(params['ApiEnterID'] ?? '').trim() || 'start'

  console.log(`[yemot-maternity] step=${step} phone=${apiPhone} callId=${callId} digits=${params['Digits'] ?? ''}`)

  // אבטחה: ימות שולחת ApiToken=<סוד> (מוגדר בשלוחה כ-api_add_0). דוחים בלי הסוד.
  const secret = process.env.YEMOT_WEBHOOK_SECRET
  if (secret && params['ApiToken'] !== secret) {
    return yemotText([...say('אין הרשאה'), ...hangup()], callId)
  }

  if (!apiPhone) {
    return yemotText([...say('שגיאה במספר המתקשר'), ...hangup()], callId)
  }

  const callerPhone = normalizePhone(apiPhone)
  const admin = adminClient()

  // ── שלב 1: זיהוי המשפחה + חיפוש לידה פעילה ──────────────────────────────
  if (step === 'start') {
    const result = await findActiveAid(callerPhone)

    if (result.error) {
      console.error('[yemot-maternity] DB error', result.error)
      return yemotText([...say('שגיאת מערכת, אנא נסי שוב מאוחר יותר'), ...hangup()], callId)
    }

    if (result.notFound) {
      console.log(`[yemot-maternity] phone not found: ${callerPhone}`)
      try {
        await admin.from('activity_log').insert({
          user_id: null, action: 'yemot_phone_not_found', entity_type: 'phone',
          entity_id: null, details: { caller: callerPhone, callId, note: 'מספר לא קיים במערכת' },
        })
      } catch { /* לא חוסם */ }
      // מספר לא מזוהה → הודעה וחזרה לתפריט הראשי
      return yemotText([
        ...say('מספר הטלפון שלכם לא קיים במערכת. מעבירים אתכם בחזרה לתפריט הראשי.'),
        ...toMainMenu(),
      ], callId)
    }

    if (result.noBirth) {
      console.log(`[yemot-maternity] no active birth for family ${result.familyId} (${result.familyName})`)
      try {
        await admin.from('activity_log').insert({
          user_id: null, action: 'yemot_no_active_birth', entity_type: 'beneficiary',
          entity_id: result.familyId, details: { caller: callerPhone, callId, family_name: result.familyName, note: result.note },
        })
      } catch { /* לא חוסם */ }
      return yemotText([
        ...say(
          'אין כרגע לידה מעודכנת במערכת.',
          'אין כעת זכאות לקבלת כרטיס נדרים, מאחר שלא נמצאה לידה בשישה השבועות האחרונים.',
          'אם את בתוך שישה שבועות מהלידה ועדיין מופיעה שגיאה, אנא פני למשרד.',
        ),
        ...hangup(),
      ], callId)
    }

    const { active, familyName } = result as { family: NonNullable<typeof result['family']>; active: NonNullable<typeof result['active']>; familyName: string }

    if (active.card_number) {
      console.log(`[yemot-maternity] card already set for aid ${active.id} (${familyName}), allowing update`)
      return yemotText([
        ...say(
          'שלום! מצאנו את תיק הלידה שלך.',
          'כרטיס נדרים כבר רשום בתיק, וניתן לעדכן את המספר.',
        ),
        ...readCard(),
      ], callId)
    }

    console.log(`[yemot-maternity] prompting card input for family "${familyName}", aid ${active.id}`)
    return yemotText([
      ...say('שלום! זוהית בהצלחה. נמצא תיק לידה פעיל בחשבונך.'),
      ...readCard(),
    ], callId)
  }

  // ── שלב 2: קבלת מספר הכרטיס → שמירה → מעבר לבחירת מוקד ──────────────────
  if (step === 'collect_card') {
    const digits = digitsFor(params, 'collect_card')
    if (!digits || digits.length < 4) {
      console.log(`[yemot-maternity] invalid card digits: "${digits}"`)
      return yemotText([
        ...say('מספר כרטיס לא תקין. אנא נסי שוב.'),
        ...readCard(),
      ], callId)
    }

    const result = await findActiveAid(callerPhone)
    if (result.error || result.notFound || result.noBirth || !result.active) {
      console.error('[yemot-maternity] re-lookup failed at collect_card', result)
      return yemotText([...say('שגיאת מערכת, אנא חייגי שוב'), ...hangup()], callId)
    }

    // שמירת מספר הכרטיס על התיק (כדי שיישמר גם אם תנותק לפני בחירת מוקד)
    const { error: updateErr } = await admin
      .from('maternity_aids')
      .update({ card_number: digits })
      .eq('id', result.active.id)
    if (updateErr) {
      console.error('[yemot-maternity] card_number update error', updateErr.message)
      return yemotText([...say('שגיאה בשמירת הכרטיס. אנא נסי שוב מאוחר יותר.'), ...hangup()], callId)
    }

    // מעבר לבחירת מוקד — אם אין מוקדים מוגדרים, מסיימים בהצלחה (רק נשמר הכרטיס)
    const centers = await activeCentersWithCode(admin)
    if (!centers.length) {
      console.log('[yemot-maternity] no centers with code — skipping center step')
      return yemotText([
        ...say('מספר הכרטיס נשמר בהצלחה! שיהיה בריאות ומזל טוב.'),
        ...hangup(),
      ], callId)
    }

    console.log(`[yemot-maternity] card saved for aid ${result.active.id}, prompting center (${centers.length} centers)`)
    return yemotText(readCenter(centers), callId)
  }

  // ── שלב 3: בחירת מוקד → חיבור הכרטיס בנדרים → הורדת מלאי → תוצאה ────────
  if (step === 'collect_center') {
    const digits = digitsFor(params, 'collect_center')
    const centers = await activeCentersWithCode(admin)
    const center = centers.find((c) => String(c.code) === digits)

    if (!center) {
      console.log(`[yemot-maternity] invalid center code: "${digits}"`)
      return yemotText([
        ...say('קוד מוקד שגוי. אנא נסי שוב.'),
        ...readCenter(centers),
      ], callId)
    }

    // איתור התיק + מספר הכרטיס שנשמר + מזהה המשפחה בנדרים
    const result = await findActiveAid(callerPhone)
    if (result.error || result.notFound || result.noBirth || !result.active || !result.family) {
      console.error('[yemot-maternity] re-lookup failed at collect_center', result)
      return yemotText([...say('שגיאת מערכת, אנא חייגי שוב'), ...hangup()], callId)
    }
    const { active, family, familyName } = result
    const cardNumber = String(active.card_number ?? '').trim()
    const nedarimId = family.nedarim_id ? String(family.nedarim_id) : null

    if (!cardNumber) {
      return yemotText([...say('לא נמצא מספר כרטיס. אנא חייגי שוב.'), ...hangup()], callId)
    }

    // המשפחה חייבת להיות רשומה בנדרים כדי לחבר אליה כרטיס
    if (!nedarimId) {
      console.log(`[yemot-maternity] family ${family.id} has no nedarim_id — cannot link card`)
      try {
        await admin.from('activity_log').insert({
          user_id: null, action: 'yemot_error', entity_type: 'maternity_aid', entity_id: active.id,
          details: { caller: callerPhone, callId, family_name: familyName, error: 'אין nedarim_id למשפחה', center: center.name },
        })
      } catch { /* לא חוסם */ }
      return yemotText([
        ...say('לא ניתן לחבר את הכרטיס מאחר שהמשפחה אינה רשומה במערכת נדרים. אנא פני למשרד.'),
        ...hangup(),
      ], callId)
    }

    // חיבור הכרטיס למשפחה בנדרים
    const creds = await getNedarimCreds()
    if (!creds) {
      console.error('[yemot-maternity] nedarim not configured')
      return yemotText([...say('המערכת אינה זמינה כעת. אנא נסי שוב מאוחר יותר.'), ...hangup()], callId)
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
        ...say('לא הצלחנו לחבר את הכרטיס. הפעולה לא בוצעה. אנא נסי שוב מאוחר יותר או פני למשרד.'),
        ...hangup(),
      ], callId)
    }

    // הצלחה — הורדת כרטיס ממלאי המוקד (best-effort, אטומי דרך RPC)
    let newStock: number | null = null
    try {
      const { data: stockData } = await admin.rpc('decrement_card_center_stock', { p_center_id: center.id })
      newStock = typeof stockData === 'number' ? stockData : null
      if (newStock === null) console.warn(`[yemot-maternity] center "${center.name}" out of stock — not decremented`)
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

    console.log(`[yemot-maternity] card linked for aid ${active.id} (${familyName}), center=${center.name}, stockAfter=${newStock}`)
    return yemotText([
      ...say(
        'הכרטיס חובר בהצלחה!',
        `המוקד שנבחר: ${center.name}.`,
        'שיהיה בריאות ומזל טוב!',
      ),
      ...hangup(),
    ], callId)
  }

  // שלב לא ידוע — חזרה להתחלה
  console.log(`[yemot-maternity] unknown step: "${step}"`)
  return yemotText([...say('שגיאה, אנא חייגי שוב.'), ...hangup()], callId)
}
