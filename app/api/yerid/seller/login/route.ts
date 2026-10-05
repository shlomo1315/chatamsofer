import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import {
  SELLER_CONFIG_KEY, SELLER_COOKIE, SELLER_TTL_MS,
  sellerPasswordMatches, makeSellerToken, signingConfigured,
} from '@/lib/bookFairSeller'

// התחברות מוכר לדוכן היריד.
//
// 🔴 מוגבל בקצב בחוזקה: סיסמה אחת משותפת היא יעד לניחוש, והאזור מאפשר
// לרשום מכירות. 10 ניסיונות ב-10 דקות מאותו מקור.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const ip = clientIp(request)
  if (!rateLimit(`fair-seller-login:${ip}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב בעוד 10 דקות.' }, { status: 429 })
  }

  // 🔴 נכשל-סגור: בלי סוד חתימה אין אסימון, ולכן אין להעמיד פנים
  // שההתחברות הצליחה.
  if (!signingConfigured()) {
    console.error('[fair/seller] אין סוד חתימה — ההתחברות נדחית')
    return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const password = String(body.password ?? '')
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'יש להזין את שמך' }, { status: 400 })
  if (!password) return NextResponse.json({ error: 'יש להזין סיסמה' }, { status: 400 })

  const { data: row } = await db.from('app_settings')
    .select('value').eq('key', SELLER_CONFIG_KEY).maybeSingle()

  let hash = ''
  try {
    const cfg = row?.value ? JSON.parse(String(row.value)) : null
    hash = String(cfg?.password_hash ?? '')
  } catch { /* ערך פגום — נתייחס כאילו אין סיסמה */ }

  // ⚠️ אין סיסמה מוגדרת ⇒ האזור סגור, ולא "פתוח לכולם".
  if (!hash) {
    return NextResponse.json(
      { error: 'אזור המוכרים אינו מוגדר. פנו למנהל המערכת.' },
      { status: 403 },
    )
  }

  if (!sellerPasswordMatches(password, hash)) {
    // ⚠️ אותה הודעה בלי לפרט מה שגוי — שם או סיסמה.
    return NextResponse.json({ error: 'הסיסמה שגויה' }, { status: 401 })
  }

  const token = makeSellerToken(name, hash)
  if (!token) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })

  const res = NextResponse.json({ ok: true, name })
  res.cookies.set(SELLER_COOKIE, token, {
    httpOnly: true,
    // ⚠️ secure בפרודקשן בלבד: ב-localhost אין https והקוקי לא היה נשמר.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SELLER_TTL_MS / 1000),
  })
  return res
}

/** התנתקות. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SELLER_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
