import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import {
  DASH_CONFIG_KEY, DASH_LAST_LOGIN_KEY, DASH_COOKIE, DASH_TTL_MS, parseDashConfig, dashPasswordMatches,
  makeDashToken, signingConfigured,
} from '@/lib/bookFairDashboard'

// כניסה ללוח המנהל של היריד.
//
// 🔴 מגבלת קצב חזקה: סיסמה אחת משותפת מול האינטרנט כולו. 8 ניסיונות
// ב-15 דקות מאותו מקור.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!rateLimit(`fair-dash-login:${clientIp(request)}`, 8, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב בעוד רבע שעה.' }, { status: 429 })
  }
  if (!signingConfigured()) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })

  let body: { password?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const { data } = await db.from('app_settings').select('value').eq('key', DASH_CONFIG_KEY).maybeSingle()
  const cfg = parseDashConfig(data?.value ?? null)

  // ⚠️ "כבוי" ו"סיסמה שגויה" — הודעות שונות בכוונה: המנהל צריך לדעת
  // שהבעיה בהגדרה ולא בהקלדה. זה לא מסגיר דבר שאינו ידוע ממילא.
  if (!cfg.enabled || !cfg.password_hash) {
    return NextResponse.json({ error: 'הלוח אינו פעיל כרגע. פנו למנהל המערכת.' }, { status: 403 })
  }
  if (!dashPasswordMatches(String(body.password ?? ''), cfg.password_hash)) {
    return NextResponse.json({ error: 'הסיסמה שגויה' }, { status: 401 })
  }

  const token = makeDashToken(cfg.version)
  if (!token) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })

  // תיעוד כניסה אחרונה — מוצג בהגדרות. ⚠️ לא חוסם את הכניסה אם נכשל.
  // 🔴 מפתח נפרד ולא בתוך ההגדרות: כתיבה של ההגדרות כאן הייתה עלולה
  // לדרוס החלפת סיסמה שקרתה באותו רגע ולהחזיר את הגרסה הישנה — כלומר
  // לבטל בשקט את "ניתוק כל המחוברים".
  void db.from('app_settings').upsert(
    { key: DASH_LAST_LOGIN_KEY, value: new Date().toISOString() },
    { onConflict: 'key' },
  ).then(({ error }) => { if (error) console.error('[fair/dash] last_login save failed:', error.message) })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(DASH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    // ⚠️ path '/' כי הדף (/yerid/dashboard) וה-API (/api/yerid/dashboard)
    // אינם חולקים תחילית. httpOnly — סקריפט בדף אינו יכול לקרוא אותו.
    path: '/',
    maxAge: Math.floor(DASH_TTL_MS / 1000),
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(DASH_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
