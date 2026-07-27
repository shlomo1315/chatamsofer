import { NextResponse, type NextRequest } from 'next/server'
import { Resend } from 'resend'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { resolveMailbox } from '@/lib/mailRouting'
import { isRequestSubject } from '@/lib/emailRequestIntake'
import { departmentByEmail } from '@/lib/departments'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// תיקון רטרואקטיבי של ניתוב מיילים ישנים.
//
// שורש הבעיה: Resend Inbound לא שלח headers ל-webhook, והנמען האמיתי
// (received_for) לא נשמר. לכן כל המיילים נותבו ל-office. את received_for אפשר
// לשחזר מ-Resend API: מושכים את רשימת המיילים הנכנסים (receiving.list),
// מצליבים לפי message_id (ששמור אצלנו), וקוראים את received_for לכל אחד.
// ואז מריצים את resolveMailbox בדיוק כמו ה-webhook.
//
// GET  = תצוגה מקדימה (לא משנה כלום).
// POST {"confirm":true} = מבצע.
// ─────────────────────────────────────────────────────────────────────────────

interface ResendItem {
  id: string
  message_id?: string
  to?: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  received_for?: any
  subject?: string
}

function toEmails(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : (v == null ? [] : [v])
  return arr
    .map((x) => String(x ?? '').toLowerCase().trim())
    .map((s) => {
      const m = s.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
      return m ? m[0] : ''
    })
    .filter(Boolean)
}

// מושך את *כל* המיילים הנכנסים מ-Resend, ובונה מפה: message_id → received_for[]
async function buildReceivedForMap(): Promise<{ map: Map<string, string[]>; fetched: number; error?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { map: new Map(), fetched: 0, error: 'חסר RESEND_API_KEY' }
  const resend = new Resend(key)
  const map = new Map<string, string[]>()
  let fetched = 0

  // Resend receiving.list מדפדף עם cursor. עד 100 לעמוד; ממשיכים עד has_more=false.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let after: string | undefined
  for (let page = 0; page < 200; page++) {  // תקרה בטוחה: 200 עמודות × 100 = 20K
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: any = { limit: 100 }
    if (after) opts.after = after
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let res: any
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res = await (resend.emails as any).receiving.list(opts)
    } catch (e) {
      return { map, fetched, error: e instanceof Error ? e.message : String(e) }
    }
    if (res?.error) return { map, fetched, error: JSON.stringify(res.error) }

    const payload = res?.data ?? res
    const items: ResendItem[] = payload?.data ?? []
    for (const it of items) {
      const mid = String(it.message_id ?? '').trim()
      if (!mid) continue
      const rf = toEmails(it.received_for ?? it.to)
      if (rf.length) map.set(mid, rf)
      fetched++
    }
    if (!payload?.has_more || !items.length) break
    // ה-cursor הוא ה-id של הפריט האחרון
    after = items[items.length - 1]?.id
    if (!after) break
  }
  return { map, fetched }
}

interface Row { id: string; to_email: string | null; subject: string | null; message_id: string | null }

// מחשב את התיבה הנכונה מ-received_for של המייל.
function correctFromReceivedFor(receivedFor: string[], r: Row): string {
  return resolveMailbox({
    direct: receivedFor,
    cc: [],
    isRequest: isRequestSubject(String(r.subject ?? '')),
    envelopeTo: r.to_email ?? '',
  })
}

async function analyze(db: ReturnType<typeof getServiceClient>) {
  const { map, fetched, error } = await buildReceivedForMap()
  if (error) throw new Error(`שליפה מ-Resend נכשלה: ${error}`)

  // כל המיילים הנכנסים שלנו (source=resend), עם message_id להצלבה
  const { data, error: dbErr } = await db!
    .from('inbound_emails')
    .select('id, to_email, subject, message_id')
    .eq('source', 'resend')
    .order('created_at', { ascending: false })
    .limit(5000)
  if (dbErr) throw new Error(dbErr.message)

  const changes: { id: string; from: string; to: string; subject: string }[] = []
  let noMatch = 0, unchanged = 0

  for (const r of (data ?? []) as Row[]) {
    const mid = String(r.message_id ?? '').trim()
    const rf = mid ? map.get(mid) : undefined
    if (!rf || !rf.length) { noMatch++; continue }  // אין received_for מ-Resend — אין ממה לתקן

    const correct = correctFromReceivedFor(rf, r)
    if (!correct || correct === r.to_email) { unchanged++; continue }
    changes.push({
      id: r.id,
      from: r.to_email ?? '(ריק)',
      to: correct,
      subject: String(r.subject ?? '(ללא נושא)').slice(0, 60),
    })
  }

  return { resendFetched: fetched, scanned: data?.length ?? 0, noMatch, unchanged, changes }
}

export async function GET() {
  const staff = await requireStaff(['admin'])
  if (!staff) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  try {
    const { resendFetched, scanned, noMatch, unchanged, changes } = await analyze(db)
    const moves: Record<string, number> = {}
    for (const c of changes) {
      const k = `${c.from} → ${c.to}`
      moves[k] = (moves[k] ?? 0) + 1
    }
    return NextResponse.json({
      mode: 'תצוגה מקדימה — לא שונה דבר',
      נמשכו_מ_Resend: resendFetched,
      נסרקו: scanned,
      ללא_התאמה: noMatch,
      ללא_שינוי: unchanged,
      ישונו: changes.length,
      פילוח: Object.fromEntries(Object.entries(moves).sort((a, b) => b[1] - a[1])),
      דוגמאות: changes.slice(0, 30),
    })
  } catch (e) {
    console.error('[rebuild-from-resend] ניתוח נכשל:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'הניתוח נכשל' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff(['admin'])
  if (!staff) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { confirm?: boolean }
  try { body = await request.json() } catch { body = {} }
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'נדרש אישור מפורש: {"confirm": true}' }, { status: 400 })
  }

  try {
    const { changes } = await analyze(db)
    let updated = 0, failed = 0
    for (const c of changes) {
      // מעדכנים גם to_email וגם department (שנגזר מהכתובת) — שניהם היו שגויים
      const dept = departmentByEmail(c.to)?.key ?? null
      const { error } = await db
        .from('inbound_emails')
        .update({ to_email: c.to, department: dept })
        .eq('id', c.id)
      if (error) { failed++; console.error('[rebuild-from-resend]', c.id, error.message) }
      else updated++
    }
    return NextResponse.json({ ok: true, תוקנו: updated, נכשלו: failed, message: `${updated} מיילים שויכו מחדש לתיבה הנכונה` })
  } catch (e) {
    console.error('[rebuild-from-resend] התיקון נכשל:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'התיקון נכשל' }, { status: 500 })
  }
}
