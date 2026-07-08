// Webhook לימות המשיח — שלוחת ה-OTP של הפורטל הציבורי.
// שלוחת API (type=api) ייעודית: השיחה היוצאת מנותבת לכאן, והשרת מקריא *אך ורק*
// את הקוד החד-פעמי הממתין למספר המתקשר — בלי שום הודעה כללית/תבנית קמפיין.
//
// זרימה:
//   1. ה-API send-phone-code מייצר קוד, שומר hash (לאימות) + plain (להקראה),
//      ומפעיל שיחה יוצאת שמנותבת לשלוחה הזו.
//   2. ימות פונה לכאן עם ApiPhone = מספר המתקשר. אנו שולפים את הקוד הגלוי
//      (portal_phone_code_plain) של המוטב עם אותו מספר, מקריאים אותו ספרה-ספרה,
//      ומנקים את הטקסט הגלוי (חד-פעמי). ה-hash נשאר לאימות מה שיוקלד בפורטל.
//
// פרוטוקול התגובה כמו ב-yemot-maternity: id_list_message=t-<טקסט>&go_to_folder=hangup&

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'
import { spokenCode } from '@/lib/yemotCall'

export const dynamic = 'force-dynamic'

// השוואת סודות בזמן קבוע (מונע timing attacks)
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

let _admin: SupabaseClient | null = null
function adminClient(): SupabaseClient | null {
  if (_admin) return _admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  _admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return _admin
}

// טקסט TTS — הסרת תווים שאסורים בימות. ⚠️ פסיק ',' ונקודה '.' חותכים/מפצלים את
// ההודעה ב-id_list_message (גורמים לניתוק או השהיה) — שניהם מוסרים תמיד. ההפרדה
// בהקראה נעשית ברווחים בלבד, וכל ספרה כמילה עברית מלאה.
const TTS_INVALID = /[.,\-"'&|=]/g
function tts(text: string): string {
  return String(text ?? '').replace(TTS_INVALID, ' ').replace(/\s+/g, ' ').trim()
}

function yemotText(commands: string[], callId?: string) {
  const body = commands.join('&') + '&'
  // לא מתעדים את גוף התשובה — הוא עלול להכיל את קוד ה-OTP המוקרא (מידע רגיש).
  console.log(`[yemot-otp] response${callId ? ` (callId=${callId})` : ''} (${commands.length} commands)`)
  return new NextResponse(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

const hangupMsg = (text: string, callId?: string) =>
  yemotText([`id_list_message=t-${tts(text)}`, 'go_to_folder=hangup'], callId)

export async function POST(req: NextRequest) { return handle(req) }
export async function GET(req: NextRequest) { return handle(req) }

async function handle(req: NextRequest) {
  const params: Record<string, string> =
    req.method === 'GET'
      ? Object.fromEntries(req.nextUrl.searchParams.entries())
      : await req.formData().then((f) => Object.fromEntries(f.entries()) as Record<string, string>).catch(() => ({} as Record<string, string>))

  const apiPhone = String(params['ApiPhone'] ?? '').trim()
  const callId = String(params['ApiCallId'] ?? '').trim()

  // ── אבטחה: אכיפת ApiToken (constant-time). נכשל-סגור: אם YEMOT_WEBHOOK_SECRET
  // אינו מוגדר — דוחים כל בקשה (מונע קצירת קוד OTP ע"י תוקף לא-מאומת). ──
  const secret = process.env.YEMOT_WEBHOOK_SECRET
  if (!secret) {
    console.error('[yemot-otp] YEMOT_WEBHOOK_SECRET אינו מוגדר — דחיית כל הבקשות (fail-closed)')
    return hangupMsg('אין הרשאה', callId)
  }
  if (!safeEqual(params['ApiToken'] ?? '', secret)) {
    console.warn('[yemot-otp] ApiToken שגוי — דחייה')
    return hangupMsg('אין הרשאה', callId)
  }

  if (!apiPhone) return hangupMsg('שגיאה במספר המתקשר', callId)

  const admin = adminClient()
  if (!admin) {
    console.error('[yemot-otp] Supabase לא מוגדר')
    return hangupMsg('שגיאת מערכת אנא נסו שוב מאוחר יותר', callId)
  }

  const caller = normalizePhone(apiPhone)
  const last7 = caller.replace(/\D/g, '').slice(-7)
  console.log(`[yemot-otp] phone=${apiPhone} callId=${callId}`)

  // איתור המוטב עם קוד גלוי ממתין, לפי 7 הספרות האחרונות באחד משדות הטלפון.
  // (אותה גישת חיפוש כמו ב-yemot-maternity — עמידה למקפים/קידומות.)
  if (last7.length !== 7) return hangupMsg('שגיאה במספר המתקשר', callId)

  const { data, error } = await admin
    .from('beneficiaries')
    .select('id, phone, phone2, spouse_phone, portal_phone_code_plain, portal_phone_code_expires')
    .or(`phone.ilike.%${last7}%,phone2.ilike.%${last7}%,spouse_phone.ilike.%${last7}%`)
    .not('portal_phone_code_plain', 'is', null)

  if (error) {
    console.error('[yemot-otp] DB error', error.message)
    return hangupMsg('שגיאת מערכת אנא נסו שוב מאוחר יותר', callId)
  }

  // התאמה מדויקת בנרמול מלא (לא רק 7 ספרות), כדי לא להקריא קוד למספר דומה
  const row = (data ?? []).find((b) => {
    const m = (v: string | null) => !!v && normalizePhone(v) === caller
    return m(b.phone) || m(b.phone2) || m(b.spouse_phone)
  })

  if (!row || !row.portal_phone_code_plain) {
    console.log('[yemot-otp] no pending code for caller')
    return hangupMsg('לא נמצא קוד פעיל אנא בקשו קוד חדש מהאתר', callId)
  }

  // תוקף — אם פג, מנקים ולא מקריאים
  const expired = row.portal_phone_code_expires
    ? new Date(row.portal_phone_code_expires).getTime() < Date.now()
    : true
  if (expired) {
    await admin.from('beneficiaries').update({ portal_phone_code_plain: null }).eq('id', row.id)
    console.log('[yemot-otp] code expired for caller')
    return hangupMsg('הקוד פג תוקף אנא בקשו קוד חדש מהאתר', callId)
  }

  const code = String(row.portal_phone_code_plain).replace(/\D/g, '')
  // ניקוי הטקסט הגלוי מיד אחרי שליפתו — הקראה חד-פעמית (ה-hash נשאר לאימות)
  await admin.from('beneficiaries').update({ portal_phone_code_plain: null }).eq('id', row.id)

  // כל ספרה כמילה עברית מלאה (אפס, אחת, שתיים…) עם פסיק בודד בין המילים —
  // הפסקה קצרה בימות שהופכת את ההקראה לאיטית וברורה, בהודעה אחת רציפה (בלי
  // נקודות שמפרידות הודעות וגורמות להשהיה ארוכה לפני/בין ההקראות).
  const message = spokenCode(code)
  console.log(`[yemot-otp] reading code to caller (****${code.slice(-2)}) callId=${callId}`)
  return hangupMsg(message, callId)
}
