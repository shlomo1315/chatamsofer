// Webhook לימות המשיח — שיוך כרטיס נדרים של יולדת לתיק הלידה הפעיל שלה.
// ימות מצלצלת לכאן עם מספר הטלפון של המתקשרת.
// הלוגיקה:
//   1. חיפוש המשפחה לפי מספר טלפון (phone / phone2 / spouse_phone)
//   2. בדיקה שיש לידה פעילה תוך 6 שבועות (status=active)
//   3. בקשת מספר הכרטיס (DTMF)
//   4. שמירת מספר הכרטיס ב-maternity_aids.card_number

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addDays } from 'date-fns'

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
// ימות מצפה לתוכן מסוג text/plain; שורות מופרדות בנקודה-פסיק.
function yemotText(lines: string[], callId?: string) {
  const body = lines.join(';') + ';'
  console.log(`[yemot-maternity] response${callId ? ` (callId=${callId})` : ''}: ${body}`)
  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

function say(...msgs: string[]) {
  // id_list_message,2 = Hebrew TTS (type 2). system_message expects a pre-recorded file ID, not text.
  return msgs.map((m) => `id_list_message,2,${m}`)
}

function hangup() {
  return ['hangup']
}

// read: שמור קלט DTMF ועבור לתיקייה
// read_v2,<id>,<type=1>,<timeout_sec>,<max_digits>,<folder>
function readDigits(folder: string, maxDigits: number = 20) {
  return [`read_v2,1,1,15,${maxDigits},${folder}`]
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
  const digits = String(params['Digits'] ?? '').trim()

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
    // חיפוש בטלפונות של הנרשם ובן/בת הזוג
    const { data: beneficiaries, error } = await admin
      .from('beneficiaries')
      .select('id, full_name, family_name, phone, phone2, spouse_phone')
      .eq('is_active', true)

    if (error) {
      console.error('[yemot-maternity] DB error', error.message)
      return yemotText([...say('שגיאת מערכת, אנא נסי שוב מאוחר יותר'), ...hangup()], callId)
    }

    const family = (beneficiaries ?? []).find(
      (b) =>
        phoneMatches(b.phone, callerPhone) ||
        phoneMatches(b.phone2, callerPhone) ||
        phoneMatches(b.spouse_phone, callerPhone),
    )

    if (!family) {
      console.log(`[yemot-maternity] phone not found: ${callerPhone} (callId=${callId})`)
      try {
        await admin.from('activity_log').insert({
          user_id: null, action: 'yemot_phone_not_found', entity_type: 'phone',
          entity_id: null, details: { caller: callerPhone, callId },
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

    // חיפוש לידה פעילה בתוך 6 שבועות
    const { data: aids, error: aidErr } = await admin
      .from('maternity_aids')
      .select('id, birth_date, six_weeks_end, card_number, status')
      .eq('beneficiary_id', family.id)
      .eq('status', 'active')
      .order('birth_date', { ascending: false })
      .limit(5)

    if (aidErr) {
      console.error('[yemot-maternity] aids error', aidErr.message)
      return yemotText([...say('שגיאת מערכת, אנא נסי שוב מאוחר יותר'), ...hangup()], callId)
    }

    const now = new Date()
    const active = (aids ?? []).find((a) => {
      const end = a.six_weeks_end
        ? new Date(a.six_weeks_end)
        : addDays(new Date(a.birth_date), 42)
      return end >= now
    })

    if (!active) {
      console.log(`[yemot-maternity] no active birth for family ${family.id} (${callerPhone})`)
      try {
        await admin.from('activity_log').insert({
          user_id: null, action: 'yemot_no_active_birth', entity_type: 'beneficiary',
          entity_id: family.id, details: { caller: callerPhone, callId },
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

    if (active.card_number) {
      // כרטיס כבר רשום — אפשרות לעדכן
      console.log(`[yemot-maternity] card already set for aid ${active.id}, allowing update`)
      try {
        await admin.from('activity_log').insert({
          user_id: null, action: 'yemot_card_already_set', entity_type: 'maternity_aid',
          entity_id: active.id, details: { caller: callerPhone, callId },
        })
      } catch { /* לא חוסם */ }
      return yemotText([
        ...say(
          `שלום! מצאנו את תיק הלידה שלך.`,
          `כרטיס נדרים כבר רשום בתיק. כדי לעדכן מספר חדש, הזיני את המספר ולחצי על כוכבית.`,
        ),
        ...readDigits(`got_card_${active.id}`),
      ], callId)
    }

    const familyName = [family.family_name, family.full_name].filter(Boolean).join(' ')
    console.log(`[yemot-maternity] prompting card input for family "${familyName}", aid ${active.id} (${callerPhone})`)

    return yemotText([
      ...say(
        `שלום! זוהית בהצלחה.`,
        `נמצא תיק לידה פעיל בחשבונך.`,
        `אנא הזיני את מספר כרטיס נדרים שלך ולחצי על כוכבית.`,
      ),
      ...readDigits(`got_card_${active.id}`),
    ], callId)
  }

  // ── שלב 2: קבלת מספר הכרטיס ─────────────────────────────────────────────
  if (step.startsWith('got_card_')) {
    const aidId = step.replace('got_card_', '')

    if (!digits || digits.length < 4) {
      return yemotText([
        ...say('מספר כרטיס לא תקין. אנא נסי שוב.'),
        ...readDigits(`got_card_${aidId}`),
      ], callId)
    }

    const { error: updateErr } = await admin
      .from('maternity_aids')
      .update({ card_number: digits })
      .eq('id', aidId)

    if (updateErr) {
      console.error('[yemot-maternity] update error', updateErr.message)
      try {
        await admin.from('activity_log').insert({
          user_id: null, action: 'yemot_error', entity_type: 'maternity_aid',
          entity_id: aidId, details: { caller: callerPhone, callId, error: updateErr.message },
        })
      } catch { /* לא חוסם */ }
      return yemotText([
        ...say('שגיאה בשמירת הכרטיס. אנא נסי שוב מאוחר יותר.'),
        ...hangup(),
      ], callId)
    }

    // רישום לוג
    try {
      await admin.from('activity_log').insert({
        user_id: null,
        action: 'yemot_card_registered',
        entity_type: 'maternity_aid',
        entity_id: aidId,
        details: { card_number_last4: digits.slice(-4), caller: callerPhone, callId },
      })
    } catch { /* לא חוסם */ }

    console.log(`[yemot-maternity] card saved for aid ${aidId}, last4=${digits.slice(-4)}`)

    return yemotText([
      ...say(
        'מספר הכרטיס נשמר בהצלחה!',
        'תיק הלידה שלך עודכן.',
        'שיהיה בריאות ומזל טוב!',
      ),
      ...hangup(),
    ], callId)
  }

  // שלב לא ידוע — חזרה להתחלה
  return yemotText([
    ...say('שגיאה, אנא חייגי שוב.'),
    ...hangup(),
  ], callId)
}
