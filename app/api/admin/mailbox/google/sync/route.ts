import { NextResponse, type NextRequest } from 'next/server'
import { getAuthedAdmin } from '@/lib/admin-auth'
import { syncInbox } from '@/lib/google'

export const dynamic = 'force-dynamic'

// מורשה אם זו קריאת Cron (CRON_SECRET) או מנהל מחובר
function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if (request.headers.get('authorization') === `Bearer ${secret}`) return true
  return new URL(request.url).searchParams.get('secret') === secret
}

async function run(request: NextRequest) {
  if (!cronAuthorized(request)) {
    const auth = await getAuthedAdmin()
    if (!auth.ok) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }
  try {
    const { imported } = await syncInbox()
    return NextResponse.json({ ok: true, imported })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'סנכרון נכשל'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(request: NextRequest) { return run(request) }
export async function POST(request: NextRequest) { return run(request) }
