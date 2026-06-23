// Webhook לימות המשיח — שיוך כרטיס נדרים של יולדת לתיק הלידה הפעיל שלה.
// ימות מצלצלת לכאן עם מספר הטלפון של המתקשרת.
// הלוגיקה:
//   1. חיפוש המשפחה לפי מספר טלפון (phone / phone2 / spouse_phone)
//   2. בדיקה שיש לידה פעילה תוך 6 שבועות (status=active)
//   3. בקשת מספר הכרטיס (DTMF)
//   4. שמירת המספר ב-maternity_aids.card_number ושיוך הכרטיס לארנק הנדרים (SetClientMagneticCard)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addDays } from 'date-fns'
import { linkMaternityCard } from '@/lib/maternityCards'

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

// read תקני של ימות: משמיע הנחיה ואוסף DTMF, והערך חוזר בבקשה הבאה תחת שם המשתנה.
// פורמט: read=t-<הנחיה>.=<שם משתנה>,tap,<max_digits>,<min_digits>,<sec_wait>
// הערך יחזור כפרמטר CardNumber בקריאה הבאה ל-webhook. המשתמשת מסיימת בהקשת סולמית.
function readDigits(maxDigits: number = 20) {
  const prompt = 'אנא הקישו את מספר הכרטיס שקיבלתם, ולסיום הקישו סולמית'
  return [`read=t-${prompt}.=CardNumber,tap,${maxDigits},4,7`]
}

// ── חיפוש משפחה + לידה פעילה (שותף לשני השלבים) ────────────────────────────
async function findActiveAid(callerPhone: string) {
  const admin = adminClient()

  const { data: beneficiaries, error } = await admin
    .from('beneficiaries')
    .select('id, full_name, family_name, phone, phone2, spouse_phone')
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
  // הערך שאוסף ה-read חוזר תחת CardNumber. נוכחותו מסמנת שאנו בשלב איסוף הכרטיס.
  const digits = String(params['CardNumber'] ?? '').trim()
  const step = digits ? 'collect_card' : 'start'

  console.log(`[yemot-maternity] step=${step} phone=${apiPhone} callId=${callId} digits=${digits}`)

  // אופציונלי: סוד לאימות הבקשה (הגדר YEMOT_WEBHOOK_SECRET ב-Railway)
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
      return yemotText([
        ...say(
          'שלום. מספר הטלפון שלך אינו מזוהה במערכת.',
          'לעזרה ורישום אנא פני למשרד של היכל החתם סופר.',
        ),
        ...hangup(),
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
          'שלום. לא נמצאה לידה פעילה בחשבונך.',
          'אם את בתוך שישה שבועות מהלידה ועדיין מופיעה שגיאה, אנא פני למשרד.',
        ),
        ...hangup(),
      ], callId)
    }

    const { active, familyName } = result as { active: NonNullable<typeof result['active']>; familyName: string }

    if (active.card_number) {
      console.log(`[yemot-maternity] card already set for aid ${active.id} (${familyName}), allowing update`)
      try {
        await admin.from('activity_log').insert({
          user_id: null, action: 'yemot_card_already_set', entity_type: 'maternity_aid',
          entity_id: active.id, details: { caller: callerPhone, callId, family_name: familyName },
        })
      } catch { /* לא חוסם */ }
      return yemotText([
        ...say(
          'שלום! מצאנו את תיק הלידה שלך.',
          'כרטיס נדרים כבר רשום בתיק.',
          'ניתן לעדכן את המספר.',
        ),
        ...readDigits(),
      ], callId)
    }

    console.log(`[yemot-maternity] prompting card input for family "${familyName}", aid ${active.id}`)

    return yemotText([
      ...say(
        'שלום! זוהית בהצלחה.',
        'נמצא תיק לידה פעיל בחשבונך.',
      ),
      ...readDigits(),
    ], callId)
  }

  // ── שלב 2: קבלת מספר הכרטיס ─────────────────────────────────────────────
  if (step === 'collect_card') {
    if (!digits || digits.length < 4) {
      console.log(`[yemot-maternity] invalid digits: "${digits}"`)
      return yemotText([
        ...say('מספר כרטיס לא תקין. אנא נסי שוב.'),
        ...readDigits(),
      ], callId)
    }

    // חיפוש מחדש לפי טלפון
    const result = await findActiveAid(callerPhone)

    if (result.error || result.notFound || result.noBirth || !result.active) {
      console.error('[yemot-maternity] re-lookup failed at collect_card', result)
      return yemotText([...say('שגיאת מערכת, אנא חייגי שוב'), ...hangup()], callId)
    }

    const { active, familyName: fName } = result

    // שמירת המספר ושיוך הכרטיס לארנק הנדרים של המשפחה (best-effort).
    const link = await linkMaternityCard(admin, active.id, digits)

    if (!link.ok) {
      console.error('[yemot-maternity] link error', link.error)
      try {
        await admin.from('activity_log').insert({
          user_id: null, action: 'yemot_error', entity_type: 'maternity_aid',
          entity_id: active.id, details: { caller: callerPhone, callId, error: link.error, family_name: fName },
        })
      } catch { /* לא חוסם */ }
      return yemotText([
        ...say('שגיאה בשמירת הכרטיס. אנא נסי שוב מאוחר יותר.'),
        ...hangup(),
      ], callId)
    }

    try {
      await admin.from('activity_log').insert({
        user_id: null,
        action: 'yemot_card_registered',
        entity_type: 'maternity_aid',
        entity_id: active.id,
        details: {
          card_number_last4: digits.slice(-4), caller: callerPhone, callId, family_name: fName,
          linked: link.linked, link_error: link.error ?? null, nedarim_not_configured: link.notConfigured ?? false,
        },
      })
    } catch { /* לא חוסם */ }

    console.log(`[yemot-maternity] card saved for aid ${active.id}, last4=${digits.slice(-4)}, family=${fName}, linked=${link.linked}`)

    // אם השיוך לנדרים הצליח — הכרטיס פעיל מיד; אחרת נשמר והמשרד ישלים את השיוך.
    const closing = link.linked
      ? [
          'מספר הכרטיס נשמר והכרטיס שויך בהצלחה!',
          'ניתן להשתמש בכרטיס.',
          'שיהיה בריאות ומזל טוב!',
        ]
      : [
          'מספר הכרטיס נשמר בהצלחה!',
          'שיוך הכרטיס יושלם על ידי המשרד.',
          'שיהיה בריאות ומזל טוב!',
        ]

    return yemotText([...say(...closing), ...hangup()], callId)
  }

  // שלב לא ידוע — חזרה להתחלה
  console.log(`[yemot-maternity] unknown step: "${step}"`)
  return yemotText([
    ...say('שגיאה, אנא חייגי שוב.'),
    ...hangup(),
  ], callId)
}
