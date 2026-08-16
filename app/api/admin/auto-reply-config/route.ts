import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { getAutoReplyConfig, saveAutoReplyConfig, normalizeConfig, type AutoReplyMap } from '@/lib/autoReplyConfig'
import { renderAutoReply } from '@/lib/autoReplySender'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'

// ─────────────────────────────────────────────────────────────────────────────
// הגדרות המענה האוטומטי — נוסח, כפתורים, סעיפים ומכסה לכל תיבה.
// נשמר ב-app_settings, כלומר במסד לצמיתות: שורד דפלוי וריסטארט.
//
// ⚠️ אין middleware בפרויקט — כל ראוט מגן על עצמו. requirePermission חובה.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requirePermission('reports', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const config = await getAutoReplyConfig(db)
  return NextResponse.json({
    config,
    departments: Object.values(DEPARTMENTS).map(d => ({ key: d.key, label: d.label, email: d.email, color: d.color })),
  })
}

export async function POST(request: NextRequest) {
  const ctx = await requirePermission('reports', 'edit')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { config?: unknown; preview?: unknown }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  // ── תצוגה מקדימה — מרנדר בלי לשמור ──
  if (body.preview) {
    const dept = String((body.preview as { department?: string }).department ?? 'main') as DepartmentKey
    if (!DEPARTMENTS[dept]) return NextResponse.json({ error: 'תיבה לא מוכרת' }, { status: 400 })
    const normalized = normalizeConfig((body.config ?? {}) as Record<string, unknown>)
    const settings = normalized[dept]
    if (!settings) return NextResponse.json({ error: 'תיבה לא מוכרת' }, { status: 400 })
    const mail = renderAutoReply(dept, settings)
    return NextResponse.json({ subject: mail.subject, html: mail.html })
  }

  // ⚠️ הניקוי כולו ב-normalizeConfig (בתוך saveAutoReplyConfig): כתובות
  // הכפתורים מוגבלות ל-https/mailto, והטקסטים מנוטרלים בזמן הרינדור.
  const ok = await saveAutoReplyConfig(db, (body.config ?? {}) as AutoReplyMap)
  if (!ok) {
    console.error('[auto-reply-config] שמירה נכשלה')
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, config: await getAutoReplyConfig(db) })
}
