import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { PUBLIC_TEXTS_KEY, PUBLIC_TEXT_ENTRIES, type PublicTexts } from '@/lib/publicTexts'
import { setPublicTexts } from '@/lib/publicTextsStore'

// ─────────────────────────────────────────────────────────────────────────────
// עריכת הטקסטים של הממשק הציבורי.
// נשמר ב-app_settings — כלומר במסד, לצמיתות: שורד דפלוי, ריסטארט והכל.
//
// ⚠️ הרשאה: 'reports' — אותה הרשאה שבה נשמרים טקסטי המיילים, כדי ששתי
// מערכות הנוסחים יתנהגו זהה. הטקסטים כאן מוצגים לכל מבקר באתר.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

const KNOWN_KEYS = new Set(PUBLIC_TEXT_ENTRIES.map(e => e.key))

/** מסנן: רק מפתחות שקיימים בקטלוג, ורק מחרוזות. */
function sanitize(input: unknown): PublicTexts {
  const out: PublicTexts = {}
  if (!input || typeof input !== 'object') return out

  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (!KNOWN_KEYS.has(key)) continue          // מפתח לא מוכר
    if (typeof val !== 'string') continue
    // הטקסט נכנס ל-DOM של האתר הציבורי. תגי HTML מוסרים כדי שעריכה לא
    // תוכל לשבור מבנה או להזריק תוכן — העיצוב נשאר בקוד.
    const text = val.replace(/<[^>]*>/g, '').slice(0, 2000).trim()
    if (text) out[key] = text
  }
  return out
}

export async function GET() {
  const ctx = await requirePermission('reports', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data } = await db
    .from('app_settings').select('value').eq('key', PUBLIC_TEXTS_KEY).maybeSingle()

  let texts: PublicTexts = {}
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
    { key: PUBLIC_TEXTS_KEY, value: JSON.stringify(texts), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )

  if (error) {
    console.error('[public-texts] שמירה נכשלה:', error.message)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }

  // רענון מיידי של המטמון — כדי שהעמוד הציבורי הבא שייטען כבר יציג את
  // הנוסח החדש, בלי להמתין לריסטארט. זה מה שהופך את העדכון ל"חי".
  setPublicTexts(texts)

  return NextResponse.json({ ok: true, texts })
}
