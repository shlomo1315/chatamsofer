import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/apiAuth'
import { specById, type EmailTexts } from '@/lib/emailCatalog'
import { renderCatalogEmail } from '@/lib/emailCatalogRender'

// תצוגה מקדימה חיה: מרנדר את המייל האמיתי (אותו shell, אותו עיצוב) עם
// הטקסטים שנערכים כרגע — כולל אלה שטרם נשמרו. כך רואים בדיוק מה יישלח.

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const ctx = await requirePermission('reports', 'view')
  if (ctx instanceof NextResponse) return ctx

  let body: { id?: string; texts?: EmailTexts }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const spec = specById(String(body.id ?? ''))
  if (!spec) return NextResponse.json({ error: 'מייל לא מוכר' }, { status: 404 })

  const { subject, html } = renderCatalogEmail(spec.id, body.texts ?? {})
  return NextResponse.json({ subject, html })
}
