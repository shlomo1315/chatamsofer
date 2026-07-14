import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'

// ניהול הלמידה של העוזר: מה נשאל, מה נכשל, ומה הידע שנוסף לו.
export const dynamic = 'force-dynamic'

export async function GET() {
  const staff = await requireStaff(['admin'])
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const since = new Date(Date.now() - 30 * 86400000).toISOString()

  const [failed, all, knowledge] = await Promise.all([
    // שאלות שהעוזר לא הצליח לענות עליהן — מכאן לומדים מה חסר לו
    db.from('assistant_log')
      .select('id, question, answer, outcome, user_name, created_at')
      .in('outcome', ['no_data', 'error'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),

    db.from('assistant_log')
      .select('question, outcome')
      .gte('created_at', since)
      .limit(500),

    db.from('assistant_knowledge')
      .select('id, content, source, is_active, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const rows = all.data ?? []
  const total = rows.length
  const ok = rows.filter(r => r.outcome === 'ok').length

  // השאלות הנפוצות — מהן העוזר לומד את המונחים של הצוות
  const counts = new Map<string, number>()
  for (const r of rows) {
    const q = String(r.question ?? '').trim().toLowerCase()
    if (q.length >= 5) counts.set(q, (counts.get(q) ?? 0) + 1)
  }
  const common = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([question, times]) => ({ question, times }))

  return NextResponse.json({
    stats: {
      total,
      answered: ok,
      failed: total - ok,
      successRate: total ? Math.round((ok / total) * 100) : 0,
    },
    failed: failed.data ?? [],
    common,
    knowledge: knowledge.data ?? [],
  })
}

/** הוספת ידע — נכנס להנחיה של העוזר בשיחה הבאה. */
export async function POST(request: NextRequest) {
  const staff = await requireStaff(['admin'])
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { content?: string; source?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const content = String(body.content ?? '').trim()
  if (!content) return NextResponse.json({ error: 'הידע ריק' }, { status: 400 })
  if (content.length > 500) {
    return NextResponse.json({ error: 'הידע ארוך מדי (עד 500 תווים)' }, { status: 400 })
  }

  const { error } = await db.from('assistant_knowledge').insert({
    content,
    source: body.source ? String(body.source).slice(0, 300) : null,
    created_by: staff.userId,
  })

  if (error) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** מחיקת ידע. */
export async function DELETE(request: NextRequest) {
  const staff = await requireStaff(['admin'])
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  await db.from('assistant_knowledge').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
