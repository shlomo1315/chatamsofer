import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { EMAIL_CATALOG, EMAIL_TEXTS_KEY, type EmailTexts } from '@/lib/emailCatalog'
import { setEmailTexts, loadEmailTexts } from '@/lib/emailTextsStore'

// ─────────────────────────────────────────────────────────────────────────────
// עריכת הטקסטים של המיילים היוצאים.
// נשמר ב-app_settings — כלומר במסד, לצמיתות: שורד דפלוי, ריסטארט והכל.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

/** מסנן: רק מיילים ושדות שקיימים בקטלוג, ורק מחרוזות. */
function sanitize(input: unknown): EmailTexts {
  const out: EmailTexts = {}
  if (!input || typeof input !== 'object') return out

  for (const [emailId, fields] of Object.entries(input as Record<string, unknown>)) {
    const spec = EMAIL_CATALOG.find(e => e.id === emailId)
    if (!spec || !fields || typeof fields !== 'object') continue

    const clean: Record<string, string> = {}
    for (const [key, val] of Object.entries(fields as Record<string, unknown>)) {
      if (!spec.fields.some(f => f.key === key)) continue        // שדה לא מוכר
      if (typeof val !== 'string') continue
      // הטקסט נכנס ל-HTML של המייל. תגי HTML מוסרים כדי שעריכה לא תוכל
      // לשבור את המבנה או להזריק תוכן — העיצוב נשאר בקוד.
      const text = val.replace(/<[^>]*>/g, '').slice(0, 4000).trim()
      if (text) clean[key] = text
    }
    if (Object.keys(clean).length) out[emailId] = clean
  }
  return out
}

export async function GET() {
  const ctx = await requirePermission('reports', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data } = await db
    .from('app_settings').select('value').eq('key', EMAIL_TEXTS_KEY).maybeSingle()

  let texts: EmailTexts = {}
  if (data?.value) {
    try { texts = JSON.parse(String(data.value)) } catch { /* ערך פגום — ברירות מחדל */ }
  }
  return NextResponse.json({ texts })
}

export async function POST(request: NextRequest) {
  const ctx = await requirePermission('reports', 'edit')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { texts?: unknown }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const texts = sanitize(body.texts)

  const { error } = await db.from('app_settings').upsert(
    { key: EMAIL_TEXTS_KEY, value: JSON.stringify(texts), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )

  if (error) {
    console.error('[email-texts] שמירה נכשלה:', error.message)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }

  // רענון מיידי של המטמון — כדי שהמייל הבא שיישלח כבר ישתמש בטקסט החדש,
  // בלי להמתין לריסטארט.
  setEmailTexts(texts)

  return NextResponse.json({ ok: true, texts })
}
