import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { EMAIL_CATALOG, EMAIL_TEXTS_KEY, type EmailTexts } from '@/lib/emailCatalog'
import { setEmailTexts } from '@/lib/emailTextsStore'
import { buildGilyonotReply, GILYONOT_REPLY_IDS } from '@/lib/gilyonotInbound'

// ─────────────────────────────────────────────────────────────────────────────
// עריכת המענה האוטומטי של הרשמה לגיליונות (d@) — תיבת "דיוור".
// הטקסטים נשמרים ב-email_texts (אותו מנגנון של שאר המיילים), ורק עבור gilyonot_reply_*.
// התצוגה המקדימה נבנית מאותה פונקציה ששולחת בפועל, ולכן נאמנה למייל האמיתי.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

const IDS = new Set<string>(GILYONOT_REPLY_IDS)

async function loadAll(db: NonNullable<ReturnType<typeof getServiceClient>>): Promise<EmailTexts> {
  const { data } = await db.from('app_settings').select('value').eq('key', EMAIL_TEXTS_KEY).maybeSingle()
  try { return data?.value ? JSON.parse(String(data.value)) : {} } catch { return {} }
}

/** רק רשומות הגיליונות, רק שדות מוכרים, בלי תגי HTML; contacts חייב להיות JSON תקין. */
function sanitize(input: unknown): EmailTexts | null {
  const out: EmailTexts = {}
  if (!input || typeof input !== 'object') return out
  for (const [id, fields] of Object.entries(input as Record<string, unknown>)) {
    const spec = EMAIL_CATALOG.find(e => e.id === id)
    if (!IDS.has(id) || !spec || !fields || typeof fields !== 'object') continue
    const clean: Record<string, string> = {}
    for (const [key, val] of Object.entries(fields as Record<string, unknown>)) {
      if (!spec.fields.some(f => f.key === key) || typeof val !== 'string') continue
      const text = val.replace(/<[^>]*>/g, '').slice(0, 4000).trim()
      if (!text) continue
      if (key === 'contacts') {
        try {
          const arr = JSON.parse(text)
          if (!Array.isArray(arr) || arr.length > 10) return null
        } catch { return null }
      }
      clean[key] = text
    }
    if (Object.keys(clean).length) out[id] = clean
  }
  return out
}

function previews(texts: EmailTexts) {
  const kinds = { added: 'added', exists: 'exists', blocked: 'blocked_unsubscribed' } as const
  const out: Record<string, { subject: string; html: string }> = {}
  for (const [k, kind] of Object.entries(kinds)) {
    out[k] = buildGilyonotReply(kind, { name: 'ישראל ישראלי', unsubscribeUrl: 'https://example.com/unsubscribe', texts })
  }
  return out
}

export async function GET() {
  const ctx = await requirePermission('reports', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const all = await loadAll(db)
  const texts: EmailTexts = {}
  for (const id of IDS) if (all[id]) texts[id] = all[id]
  const specs = EMAIL_CATALOG.filter(e => IDS.has(e.id)).map(e => ({ id: e.id, title: e.title, fields: e.fields }))
  return NextResponse.json({ specs, texts, previews: previews(texts) })
}

/** תצוגה מקדימה של טיוטה, בלי לשמור. */
export async function PUT(request: NextRequest) {
  const ctx = await requirePermission('reports', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()
  let body: { texts?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const texts = sanitize(body.texts)
  if (!texts) return NextResponse.json({ error: 'רשימת הכתובות אינה תקינה' }, { status: 400 })
  return NextResponse.json({ previews: previews(texts) })
}

export async function POST(request: NextRequest) {
  const ctx = await requirePermission('reports', 'edit')
  if (!ctx || ctx instanceof NextResponse) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { texts?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const mine = sanitize(body.texts)
  if (!mine) return NextResponse.json({ error: 'רשימת הכתובות אינה תקינה' }, { status: 400 })

  // ⚠️ POST של email_texts מחליף את כל האובייקט, ולכן ממזגים: שאר המיילים נשארים כמות שהם.
  const merged: EmailTexts = {}
  for (const [id, f] of Object.entries(await loadAll(db))) if (!IDS.has(id)) merged[id] = f
  Object.assign(merged, mine)

  const { error } = await db.from('app_settings').upsert(
    { key: EMAIL_TEXTS_KEY, value: JSON.stringify(merged), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) {
    console.error('[gilyonot-reply] שמירה נכשלה:', error.message)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }
  setEmailTexts(merged)
  return NextResponse.json({ ok: true, texts: mine })
}
