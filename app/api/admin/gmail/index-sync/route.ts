import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, requireNonMailStaff, unauthorized, forbidden, getServiceClient } from '@/lib/apiAuth'
import { syncAccount, type SyncResult } from '@/lib/gmailIndexSync'

export const dynamic = 'force-dynamic'
// ⚠️ סנכרון ראשון מושך מאות הודעות. ברירת המחדל של הפלטפורמה קוצרת מדי
// והריצה הייתה נקטעת באמצע — עם סמן שלא התקדם, כלומר בלי נזק אבל בלי התקדמות.
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// סנכרון אינדקס Gmail — הפעלה ידנית מהניהול.
//
// 🔴 המעבר ל-Gmail כמקור אמת יחיד. הראוט הזה בונה ומעדכן את *האינדקס* בלבד:
// מצביע להודעה + מטא-דאטה. גוף ההודעה לעולם אינו נשמר — הוא נקרא מ-Gmail
// לפי דרישה, ולכן אין עותק שני שיכול לסתור את המקור.
//
// ⚠️ הריצה בטוחה לחלוטין מבחינת דואר: היא *קוראת* מ-Gmail בלבד. היא אינה
// שולחת, אינה מוחקת, ואינה נוגעת בכלל הניתוב ב-Workspace.
//
// POST — סנכרון (חשבון אחד או כולם).
// GET  — מצב הסנכרון של כל חשבון, לתצוגת המסך.
// ─────────────────────────────────────────────────────────────────────────────

interface AccountRow {
  id: string
  email: string
  refresh_token: string
  last_history_id: string | null
  department: string | null
  last_sync_at: string | null
  last_full_sync_at: string | null
  last_error: string | null
}

export async function GET() {
  // תואם לשאר נתיבי הדואר: איש צוות מזוהה. המסך הזה מציג מצב סנכרון בלבד.
  const staff = await requireStaff()
  if (!staff) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: accounts } = await db.from('gmail_accounts')
    .select('id, email, department, last_sync_at, last_full_sync_at, last_history_id, last_error')
    .eq('is_active', true)
    .order('email')

  // ספירת האינדקס לכל חשבון — כדי שיהיה ברור מה כבר נקלט.
  const { count } = await db.from('gmail_messages')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)

  return NextResponse.json({
    accounts: (accounts ?? []).map(a => {
      const r = a as Partial<AccountRow>
      return {
        ...r,
        // ⚠️ הטוקן לא יוצא מהשרת לעולם — הוא מזהה גישה מלאה לתיבה.
        refresh_token: undefined,
        neverSynced: !r.last_history_id,
      }
    }),
    indexedTotal: count ?? 0,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  // ⚠️ מחמיר מה-GET: הסנכרון כותב לאינדקס ומושך מאות בקשות מ-Gmail, ולכן
  // חשבון "מייל בלבד" אינו מפעיל אותו — הוא צורך דואר, לא מנהל תשתית.
  const staff = await requireNonMailStaff()
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const accountId = String((body as { account_id?: string })?.account_id ?? '')

  let q = db.from('gmail_accounts')
    .select('id, email, refresh_token, last_history_id')
    .eq('is_active', true)
  if (accountId) q = q.eq('id', accountId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'שליפת החשבונות נכשלה' }, { status: 500 })

  const accounts = (data ?? []) as AccountRow[]
  if (!accounts.length) {
    return NextResponse.json({ error: 'לא נמצא חשבון Gmail פעיל לסנכרון' }, { status: 404 })
  }

  // ⚠️ טורי ולא מקבילי, בכוונה: כל חשבון מושך מאות בקשות מ-Gmail, ושתי
  // תיבות במקביל מכפילות את קצב הבקשות ומזמינות 429 — שיפיל את שתיהן.
  const results: (SyncResult & { email: string })[] = []
  for (const acc of accounts) {
    try {
      const r = await syncAccount(db, acc)
      results.push({ ...r, email: acc.email })
      console.log(`[index-sync] ${acc.email}: ${r.mode} · נוספו/עודכנו ${r.upserted} · הוסרו ${r.removed} · תוויות ${r.touched}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[index-sync] ${acc.email} נכשל:`, msg)
      results.push({ email: acc.email, mode: 'full', upserted: 0, removed: 0, touched: 0, historyId: null, error: msg })
    }
  }

  const totals = results.reduce((a, r) => ({
    upserted: a.upserted + r.upserted,
    removed: a.removed + r.removed,
    touched: a.touched + r.touched,
  }), { upserted: 0, removed: 0, touched: 0 })

  return NextResponse.json({ ok: true, results, totals })
}
