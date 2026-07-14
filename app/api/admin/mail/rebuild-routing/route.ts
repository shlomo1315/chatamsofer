import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { resolveMailbox } from '@/lib/mailRouting'
import { isRequestSubject } from '@/lib/emailRequestIntake'

// ─────────────────────────────────────────────────────────────────────────────
// תיקון חד-פעמי של שיוך המיילים לתיבות.
//
// מיילים שנקלטו לפני תיקון הניתוב נשמרו עם to_email שגוי — למשל מייל שנשלח
// לתיבה 10 עם office ב-Cc נשמר תחת office. הכותרות המקוריות נשמרו, ולכן אפשר
// לחשב מחדש את התיבה הנכונה בדיוק כפי שה-webhook עושה היום.
//
// GET  = תצוגה מקדימה בלבד. לא משנה כלום.
// POST = מבצע את התיקון.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** מחלץ כתובות מייל משדה כותרת. */
function extractEmails(raw: string): string[] {
  const out: string[] = []
  const re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(String(raw ?? '')))) out.push(m[0].toLowerCase())
  return out
}

/** קורא כותרת מהמבנה שנשמר (מערך או אובייקט). */
function getHeader(headers: unknown, name: string): string {
  if (!headers) return ''
  const want = name.toLowerCase()

  if (Array.isArray(headers)) {
    for (const h of headers as { name?: string; value?: string }[]) {
      if (String(h?.name ?? '').toLowerCase() === want) return String(h?.value ?? '')
    }
    return ''
  }
  if (typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (k.toLowerCase() === want) return String(v ?? '')
    }
  }
  return ''
}

interface Row {
  id: string
  to_email: string | null
  subject: string | null
  from_email: string | null
  headers: unknown
  created_at: string
}

/** מחשב את התיבה הנכונה מהכותרות המקוריות. */
function correctMailbox(r: Row): string {
  const direct = [
    ...extractEmails(getHeader(r.headers, 'delivered-to')),
    ...extractEmails(getHeader(r.headers, 'x-original-to')),
    ...extractEmails(getHeader(r.headers, 'x-gm-original-to')),
    ...extractEmails(getHeader(r.headers, 'x-forwarded-to')),
    ...extractEmails(getHeader(r.headers, 'to')),
  ]
  const cc = extractEmails(getHeader(r.headers, 'cc'))

  return resolveMailbox({
    direct,
    cc,
    isRequest: isRequestSubject(String(r.subject ?? '')),
    envelopeTo: r.to_email ?? '',
  })
}

async function analyze(db: ReturnType<typeof getServiceClient>) {
  const { data, error } = await db!
    .from('inbound_emails')
    .select('id, to_email, subject, from_email, headers, created_at')
    .eq('source', 'resend')
    .order('created_at', { ascending: false })
    .limit(3000)

  if (error) throw new Error(error.message)

  const changes: { id: string; from: string; to: string; subject: string; at: string }[] = []
  let noHeaders = 0

  for (const r of (data ?? []) as unknown as Row[]) {
    // בלי כותרות אין ממה לחשב — משאירים כמו שהוא
    if (!r.headers) { noHeaders++; continue }

    const correct = correctMailbox(r)
    if (!correct || correct === r.to_email) continue

    changes.push({
      id: r.id,
      from: r.to_email ?? '(ריק)',
      to: correct,
      subject: String(r.subject ?? '(ללא נושא)').slice(0, 60),
      at: r.created_at,
    })
  }

  return { scanned: data?.length ?? 0, noHeaders, changes }
}

/** GET — תצוגה מקדימה. לא משנה דבר. */
export async function GET() {
  const staff = await requireStaff(['admin'])
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  try {
    const { scanned, noHeaders, changes } = await analyze(db)

    // סיכום: כמה עוברים מכל תיבה לכל תיבה
    const moves: Record<string, number> = {}
    for (const c of changes) {
      const k = `${c.from} → ${c.to}`
      moves[k] = (moves[k] ?? 0) + 1
    }

    return NextResponse.json({
      mode: 'תצוגה מקדימה — לא שונה דבר',
      נסרקו: scanned,
      ללא_כותרות: noHeaders,
      ישונו: changes.length,
      פילוח: Object.fromEntries(Object.entries(moves).sort((a, b) => b[1] - a[1])),
      דוגמאות: changes.slice(0, 25),
    })
  } catch (e) {
    console.error('[rebuild-routing] ניתוח נכשל:', e)
    return NextResponse.json({ error: 'הניתוח נכשל' }, { status: 500 })
  }
}

/** POST — מבצע את התיקון בפועל. */
export async function POST(request: NextRequest) {
  const staff = await requireStaff(['admin'])
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // אישור מפורש — מונע הרצה בטעות
  let body: { confirm?: boolean }
  try { body = await request.json() } catch { body = {} }
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'נדרש אישור מפורש: {"confirm": true}' }, { status: 400 })
  }

  try {
    const { changes } = await analyze(db)

    let updated = 0
    let failed = 0

    for (const c of changes) {
      const { error } = await db
        .from('inbound_emails')
        .update({ to_email: c.to })
        .eq('id', c.id)

      if (error) { failed++; console.error('[rebuild-routing]', c.id, error.message) }
      else updated++
    }

    return NextResponse.json({
      ok: true,
      תוקנו: updated,
      נכשלו: failed,
      message: `${updated} מיילים שויכו מחדש לתיבה הנכונה`,
    })
  } catch (e) {
    console.error('[rebuild-routing] התיקון נכשל:', e)
    return NextResponse.json({ error: 'התיקון נכשל' }, { status: 500 })
  }
}
