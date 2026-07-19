import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { syncLegacyMail } from '@/lib/legacyMailSync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // משיכה ראשונה עלולה להיות ארוכה

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: Request) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = admin()

  // אפשר לסנכרן תיבה ספציפית (accountId) או את התיבה הישנה (ברירת מחדל)
  let accountId: string | null = null
  let departmentKey: string | undefined
  let full = false
  try {
    const body = await request.json()
    accountId = body?.accountId ?? null
    departmentKey = body?.department ?? undefined
    // סנכרון מלא — מתעלם מהסמן הגלובלי ומושך את כל ההיסטוריה מחדש (בטוח: כפילויות נמנעות)
    full = body?.full === true
  } catch { /* גוף ריק — סנכרון התיבה הישנה */ }

  // אם התבקשה תיבה מהטבלה — טוענים את החשבון המלא (טוקן/מחלקה/תווית/סמן פר-תיבה)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let account: any = null
  if (accountId) {
    const { data: acc } = await db
      .from('gmail_accounts')
      .select('id, refresh_token, department, label_id, last_sync_epoch')
      .eq('id', accountId)
      .maybeSingle()
    if (acc) { account = acc; departmentKey = acc.department as string }
  }

  const startedAt = new Date().toISOString()

  try {
    const result = await syncLegacyMail(db, departmentKey, { full, account: account ?? undefined })

    // רישום הריצה בלוג — כדי שיהיה דיווח מלא ומדויק
    await db.from('gmail_sync_runs').insert({
      account_id: accountId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      scanned: result.fetched,
      imported: result.imported,
      matched: result.matched,
      failed: result.failed,
      error: result.error ?? null,
    })

    if (accountId) {
      await db.from('gmail_accounts').update({
        last_sync_at: new Date().toISOString(),
        last_sync_count: result.imported,
        last_error: result.error ?? null,
      }).eq('id', accountId)
    }

    // כשל בכל המיילים = שגיאה אמיתית. לא נחביא אותה מאחורי "0 מיילים חדשים".
    if (result.failed > 0 && result.imported === 0) {
      return NextResponse.json({
        ok: false,
        ...result,
        error: `הסנכרון נכשל: ${result.failed} מיילים לא נקלטו. ${result.error ?? ''}`.trim(),
      }, { status: 500 })
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)

    await db.from('gmail_sync_runs').insert({
      account_id: accountId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      error: msg.slice(0, 500),
    })

    if (msg.includes('not connected')) {
      return NextResponse.json({ error: 'התיבה אינה מחוברת. חבר אותה תחילה.' }, { status: 400 })
    }
    console.error('[legacy-mail/sync]', msg)
    return NextResponse.json({ error: `שגיאה במשיכת המיילים: ${msg}` }, { status: 500 })
  }
}
