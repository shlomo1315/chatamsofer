import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { listActiveSessions, revokeSession, revokeAllSessions } from '@/lib/portalSessions'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET — מי מחובר עכשיו לדף השיתוף (סשנים שלא נותקו ולא פגו)
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'נדרשות הרשאות מנהל' }, { status: 403 })
  return NextResponse.json({ sessions: await listActiveSessions('distributions') })
}

// DELETE — { id } מנתק מחובר אחד; בלי id מנתק את כולם
export async function DELETE(req: NextRequest) {
  const staff = await requireAdmin()
  if (!staff) return NextResponse.json({ error: 'נדרשות הרשאות מנהל' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { id?: unknown }
  const by = staff.email ?? staff.userId

  if (body.id !== undefined) {
    if (typeof body.id !== 'string' || !UUID_RE.test(body.id)) {
      return NextResponse.json({ error: 'מזהה חיבור לא תקין' }, { status: 400 })
    }
    const ok = await revokeSession('distributions', body.id, by)
    if (!ok) return NextResponse.json({ error: 'החיבור לא נמצא' }, { status: 404 })
    return NextResponse.json({ ok: true, revoked: 1 })
  }

  return NextResponse.json({ ok: true, revoked: await revokeAllSessions('distributions', by) })
}
