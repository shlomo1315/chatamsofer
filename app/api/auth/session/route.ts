import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionStatus } from '@/lib/apiAuth'
import { IDLE_MS, PROMPT_MS, SEEN_COOKIE, SEEN_COOKIE_OPTIONS, makeSeenCookie } from '@/lib/sessionPolicy'

export const dynamic = 'force-dynamic'

// מצב הסשן של מסכי הניהול (ראו lib/sessionPolicy.ts ו-components/layout/SessionGuard.tsx).
// GET    — מצב בלבד: מתי הסשן פג, וזמני חוסר הפעילות.
// POST   — "אני כאן": רישום פעילות בשרת. נקרא רק על פעילות אמיתית של עכבר/מקלדת
//          או על לחיצה על "המשך" בחלון. סשן שכבר פג לא מתחדש כאן.
// DELETE — ניקוי עוגיית הפעילות ועוגיות הפורטל לפני יציאה.

async function status(touch: boolean) {
  const { user, verdict } = await getSessionStatus()
  if (!user || !verdict?.ok) {
    return NextResponse.json({ ok: false, reason: verdict && !verdict.ok ? verdict.reason : 'signed_out' }, { status: 401 })
  }
  const res = NextResponse.json({
    ok: true,
    expiresAt: verdict.expiresAt,
    idleMs: IDLE_MS,
    promptMs: PROMPT_MS,
  })
  if (touch || verdict.refreshSeen) {
    res.cookies.set(SEEN_COOKIE, makeSeenCookie(user.id, Date.now()), SEEN_COOKIE_OPTIONS)
  }
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function GET() {
  return status(false)
}

export async function POST() {
  return status(true)
}

export async function DELETE() {
  const cookieStore = await cookies()
  const res = NextResponse.json({ ok: true })
  for (const c of cookieStore.getAll()) {
    if (c.name === SEEN_COOKIE || c.name.startsWith('ph_')) {
      res.cookies.set(c.name, '', { httpOnly: true, sameSite: 'lax', maxAge: 0, path: '/' })
    }
  }
  return res
}
