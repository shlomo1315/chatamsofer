import { NextResponse, type NextRequest } from 'next/server'
import { verifyCronSecret } from '@/lib/apiAuth'
import { runUnloadExpired } from '@/lib/unloadExpired'

export const dynamic = 'force-dynamic'

// הריצה האוטומטית מתבצעת ע"י המתזמן הפנימי (instrumentation.ts) מדי יום בחצות (שעון ישראל).
// נקודת-קצה זו נשמרת להרצה ידנית ומאומתת מול CRON_SECRET.
async function run(request: NextRequest) {
  if (!verifyCronSecret(request)) return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 })
  const result = await runUnloadExpired()
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}

export async function GET(request: NextRequest) { return run(request) }
export async function POST(request: NextRequest) { return run(request) }
