import { NextResponse, type NextRequest } from 'next/server'
import { runAutoReply } from '@/lib/autoReply'
import { verifyCronSecret } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// הריצה האוטומטית מתבצעת ע"י המתזמן הפנימי (instrumentation.ts) בסביבת השרת המתמשכת.
// נקודת-קצה זו נשמרת להרצה ידנית ולמצב בדיקה (dry-run) ומאומתת מול CRON_SECRET.
async function run(request: NextRequest) {
  if (!verifyCronSecret(request)) return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 })
  const dry = new URL(request.url).searchParams.get('dry') === '1'
  const result = await runAutoReply({ dry })
  const status = result.ok ? 200 : result.error === 'Gmail לא מחובר' ? 503 : 500
  return NextResponse.json(result, { status })
}

export async function GET(request: NextRequest) { return run(request) }
export async function POST(request: NextRequest) { return run(request) }
