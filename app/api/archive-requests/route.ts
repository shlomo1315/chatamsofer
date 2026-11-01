import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIpOrNull } from '@/lib/rateLimit'
import { parseRequest, summarize } from '@/lib/archiveRequests'

export const dynamic = 'force-dynamic'

// שליחת בקשת תיקון מהארכיון הציבורי. ציבורי, ולכן: הגבלת קצב, ניקוי קלט, ושגיאות כלליות בלבד.
export async function POST(request: Request) {
  const ip = clientIpOrNull(request)
  if (!rateLimit('archive-req:all', 200, 3_600_000) || (ip && !rateLimit(`archive-req:${ip}`, 5, 3_600_000))) {
    return NextResponse.json({ error: 'יותר מדי בקשות, נסו שוב מאוחר יותר' }, { status: 429 })
  }
  const text = await request.text()
  if (text.length > 10_000) return NextResponse.json({ error: 'הבקשה ארוכה מדי' }, { status: 413 })
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  // שדה מלכודת לבוטים: אדם לא ממלא אותו. מחזירים הצלחה בלי לשמור.
  if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).website) return NextResponse.json({ ok: true })
  const p = parseRequest(raw)
  if (!p) return NextResponse.json({ error: 'נא לכתוב מה לתקן' }, { status: 400 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'השירות אינו זמין כרגע' }, { status: 503 })
  const summary = await summarize(p.body, p.area)
  const { error } = await db.from('archive_requests').insert({
    body: p.body, area: p.area, sender_name: p.name, sender_contact: p.contact, summary,
  })
  if (error) {
    console.error('[archive-requests] שמירה נכשלה:', error.message)
    return NextResponse.json({ error: 'השמירה נכשלה, נסו שוב' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
