import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin, forbidden } from '@/lib/apiAuth'
import { getGmailClientForToken } from '@/lib/gmail'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'
import {
  isWorkspaceConfigured, getWorkspaceGmailClient, ensureArchiveLabel, importRawMessage,
} from '@/lib/googleWorkspace'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const BATCH = 50  // כמה מיילים לייבא בכל קריאה (מגבלת זמן + quota)

// מחלץ את סיבת השגיאה האמיתית של Google (נבלעת בתוך אובייקט מקונן), כדי שתגיע ל-UI.
// שגיאות אופייניות: unauthorized_client (delegation/scopes) · invalid_grant (כתובת יעד לא קיימת).
function describeWorkspaceError(e: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const err = e as any
  const parts = [
    err?.response?.data?.error_description,   // JWT/OAuth: "unauthorized_client", "invalid_grant"...
    err?.response?.data?.error,
    err?.errors?.[0]?.message,                // Gmail API errors
    err?.message,
  ].filter((s) => typeof s === 'string' && s.trim())
  // הסרת כפילויות, ואיחוד לשורה אחת קריאה
  return [...new Set(parts)].join(' · ') || 'שגיאה לא ידועה'
}

// ייבוא בדיעבד: מזריק מיילים ישנים שכבר נמשכו למערכת לתוך תיבת ה-Gmail של המחלקה.
// למיילים הישנים אין raw שמור ב-DB, ולכן מושכים אותו מחדש מתיבת המקור (הטוקן של
// ה-account). מסמנים imported_to_gmail_at כדי שהרצה חוזרת לא תכפיל.
export async function POST(request: NextRequest) {
  const staff = await requireAdmin()
  if (!staff) return forbidden()

  if (!isWorkspaceConfigured()) {
    return NextResponse.json({ error: 'ייבוא ל-Gmail אינו מוגדר (חסר Service Account).' }, { status: 400 })
  }

  let accountId: string | null = null
  try { accountId = (await request.json())?.accountId ?? null } catch { /* גוף ריק */ }
  if (!accountId) return NextResponse.json({ error: 'חסר מזהה תיבה' }, { status: 400 })

  const db = admin()
  const { data: acc } = await db
    .from('gmail_accounts')
    .select('id, refresh_token, department, import_target_email')
    .eq('id', accountId)
    .maybeSingle()
  if (!acc) return NextResponse.json({ error: 'התיבה לא נמצאה' }, { status: 404 })

  // כתובת היעד: מה שהוגדר ידנית לתיבה, ובנפילה — כתובת המחלקה.
  const targetEmail = (acc.import_target_email as string | null)?.trim() || DEPARTMENTS[acc.department as DepartmentKey]?.email
  if (!targetEmail) return NextResponse.json({ error: 'לא הוגדרה כתובת יעד ל-Gmail' }, { status: 400 })

  // מיילים של המחלקה שטרם יובאו ל-Gmail
  const { data: rows } = await db
    .from('inbound_emails')
    .select('id, gmail_message_id')
    .eq('source', 'legacy')
    .eq('department', acc.department)
    .is('imported_to_gmail_at', null)
    .limit(BATCH)
  const pending = rows ?? []
  if (!pending.length) return NextResponse.json({ ok: true, imported: 0, remaining: 0, done: true })

  let deptGmail, labelId: string
  try {
    deptGmail = getWorkspaceGmailClient(targetEmail)
    labelId = await ensureArchiveLabel(deptGmail)
  } catch (e) {
    console.error('[import-to-gmail] workspace client failed:', e)
    return NextResponse.json({
      error: `שגיאה בחיבור לתיבת היעד (${targetEmail}) — בדוק את הגדרת ה-Service Account.`,
      detail: describeWorkspaceError(e),
    }, { status: 500 })
  }

  const sourceGmail = getGmailClientForToken(acc.refresh_token)
  let imported = 0, failed = 0

  for (const row of pending) {
    try {
      // מושכים raw מתיבת המקור לפי gmail_message_id (מזהה ה-RFC822 המקורי).
      const search = await sourceGmail.users.messages.list({ userId: 'me', q: `rfc822msgid:${row.gmail_message_id}`, maxResults: 1 })
      const msgId = search.data.messages?.[0]?.id
      if (!msgId) { failed++; continue }
      const full = await sourceGmail.users.messages.get({ userId: 'me', id: msgId, format: 'raw' })
      if (!full.data.raw) { failed++; continue }
      await importRawMessage(deptGmail, full.data.raw, labelId)
      await db.from('inbound_emails').update({ imported_to_gmail_at: new Date().toISOString() }).eq('id', row.id)
      imported++
    } catch (e) {
      console.error(`[import-to-gmail] failed for ${row.gmail_message_id}:`, e)
      failed++
    }
  }

  // כמה נותרו אחרי הבאץ' הזה (כדי שה-UI ידע אם להריץ שוב)
  const { count } = await db
    .from('inbound_emails')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'legacy')
    .eq('department', acc.department)
    .is('imported_to_gmail_at', null)

  return NextResponse.json({ ok: true, imported, failed, remaining: count ?? 0, done: (count ?? 0) === 0 })
}
