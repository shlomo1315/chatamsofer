import { NextResponse, type NextRequest } from 'next/server'
import { runAutoReply } from '@/lib/autoReply'

export const dynamic = 'force-dynamic'

// אימות הקריאה הידנית/חיצונית. הריצה האוטומטית מתבצעת ע"י המתזמן הפנימי (instrumentation.ts),
// אך נשאיר נקודת-קצה זו להרצה ידנית ולמצב בדיקה (dry-run) עם CRON_SECRET.
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (secret) {
    if (request.headers.get('authorization') === `Bearer ${secret}`) return true
    if (new URL(request.url).searchParams.get('secret') === secret) return true
  }
  // תאימות לקריאות מתוזמנות של פלטפורמות שמוסיפות כותרת זו
  if (request.headers.get('x-vercel-cron')) return true
  return false
}

async function run(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 })
  const dry = new URL(request.url).searchParams.get('dry') === '1'
  const result = await runAutoReply({ dry })
  const status = result.ok ? 200 : result.error === 'Gmail לא מחובר' ? 503 : 500
  return NextResponse.json(result, { status })
}

export async function GET(request: NextRequest) { return run(request) }
export async function POST(request: NextRequest) { return run(request) }
