import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { rateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// בדיקה מוקדמת (בזמן אמת) האם כבר קיימת בקשת לידה *בתהליך* על תעודת זהות/דרכון
// של תינוק. נקרא מהטופס הציבורי בזמן שהמשתמש מקליד את ת"ז הנולד, כדי להתריע
// מיד — לפני מילוי כל הטופס והגשה — ולמנוע בקשה כפולה על אותו ילד.
// ה-endpoint לקריאה בלבד; אכיפת המניעה האמיתית נעשית ב-birth-request עצמו.
// ─────────────────────────────────────────────────────────────────────────────
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  // רק בעל סשן פורטל תקף — כדי לא לחשוף מידע על ת"ז כלשהי לכל אחד
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId) return NextResponse.json({ error: 'נדרש אימות' }, { status: 401 })
  if (!rateLimit(`birth-dup:${sessionId}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  let body: { id_number?: string; id_type?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const raw = String(body.id_number ?? '').trim()
  if (!raw) return NextResponse.json({ duplicate: false })

  const isPass = body.id_type === 'passport'
  const idNorm = isPass ? raw : raw.replace(/\D/g, '').padStart(9, '0')
  // אותן וריאציות כמו בבדיקת ה-birth-request — כדי לתפוס רשומות בלי padding
  const idVariants = Array.from(new Set([idNorm, idNorm.replace(/^0+/, ''), raw].filter(Boolean)))

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ duplicate: false })

  const { data } = await admin
    .from('maternity_aids')
    .select('id, status, baby_name')
    .in('baby_id_number', idVariants)
    .in('status', ['pending', 'active'])
    .limit(1)

  if (data?.length) {
    const st = data[0].status === 'active' ? 'אושרה' : 'ממתינה לאישור'
    return NextResponse.json({
      duplicate: true,
      status: data[0].status,
      message: `שימו לב: כבר הוגשה בקשת לידה על ילד/ה זה — הבקשה ${st} ובתהליך. לא ניתן להגיש בקשה נוספת על אותו תינוק.`,
    })
  }
  return NextResponse.json({ duplicate: false })
}
