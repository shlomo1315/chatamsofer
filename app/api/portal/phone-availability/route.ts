import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { normalizePhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// בדיקה בזמן אמת (מטופס הרישום הציבורי): האם מספר הטלפון כבר בשימוש אצל צאצא
// אחר במאגר. נקרא בזמן שהנרשם החדש מקליד — כדי להתריע מיד ולא רק בהגשה.
//
// ⚠️ אין סשן פורטל: הנרשם עדיין לא קיים במערכת. לכן ההגנה היא rate-limit לפי IP,
// והתשובה חושפת רק כן/לא (taken) — בלי שום פרט על הצאצא שמחזיק את המספר.
// ─────────────────────────────────────────────────────────────────────────────
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  if (!rateLimit(`phone-avail:${clientIp(request)}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  let body: { phone?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const raw = String(body.phone ?? '').trim()
  if (!raw) return NextResponse.json({ taken: false })

  const norm = normalizePhone(raw)
  const digits = raw.replace(/\D/g, '')
  // וריאציות — כדי לתפוס מספרים ששמורים בפורמטים שונים (עם/בלי מקף, 0 מוביל)
  const variants = Array.from(new Set([norm, digits, raw].filter(Boolean)))

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ taken: false })

  // בודקים את שלושת שדות הטלפון: הבעל, האישה, וטלפון נוסף
  const orFilter = variants.flatMap(v => [`phone.eq.${v}`, `spouse_phone.eq.${v}`, `phone2.eq.${v}`]).join(',')
  const { data } = await admin
    .from('beneficiaries')
    .select('id')
    .or(orFilter)
    .limit(1)

  return NextResponse.json({ taken: !!data?.length }, { headers: { 'Cache-Control': 'no-store' } })
}
