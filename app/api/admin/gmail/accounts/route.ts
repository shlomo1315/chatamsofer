import { NextResponse, type NextRequest } from 'next/server'
import { requireNonMailStaff, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { getGmailClientForToken } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// ניהול תיבות Gmail — שינוי מחלקה, השבתה, ומחיקה.
//
// ⚠️ ההוספה אינה כאן: היא מחייבת מסלול OAuth מול גוגל (הסכמה בדפדפן), ולכן
// נשארת ב-/api/auth/gmail-legacy. הראוט הזה מטפל במה שקורה *אחרי* החיבור.
//
// 🔴 ההבחנה שקובעת הכל: **השבתה אינה מחיקה.**
//   השבתה — התיבה מפסיקה להסתנכרן, ההודעות שנקלטו ממנה נשארות.
//   מחיקה  — התיבה יורדת, ואיתה (ב-cascade) כל שורות האינדקס שלה.
//
// ⚠️ ולכן ברירת המחדל היא השבתה: תיבה שהוסרה בטעות אפשר להחזיר בלחיצה,
// אבל אלפי שורות אינדקס שנמחקו — רק בסנכרון מלא מחדש, ורק אם ההודעות
// עדיין קיימות בגמייל.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const staff = await requireNonMailStaff()
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data } = await db.from('gmail_accounts')
    .select('id, email, label, department, is_active, last_sync_at, last_error, watch_expires_at, created_at')
    .order('created_at', { ascending: false })

  // כמה הודעות באינדקס לכל תיבה — כדי שיהיה ברור מה יימחק.
  const accounts = await Promise.all((data ?? []).map(async (a) => {
    const row = a as { id: string }
    const { count } = await db.from('gmail_messages')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', row.id).is('deleted_at', null)
    return { ...row, indexedCount: count ?? 0 }
  }))

  return NextResponse.json({ accounts }, { headers: { 'Cache-Control': 'no-store' } })
}

interface PatchBody {
  id?: string
  department?: string
  label?: string
  is_active?: boolean
}

export async function PATCH(request: NextRequest) {
  const staff = await requireNonMailStaff()
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: PatchBody
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'חסר מזהה תיבה' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (body.department !== undefined) patch.department = String(body.department).trim() || null
  if (body.label !== undefined) patch.label = String(body.label).trim() || null
  if (body.is_active !== undefined) patch.is_active = !!body.is_active

  if (!Object.keys(patch).length) return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })

  // ⚠️ בהשבתה עוצרים גם את מנוי ההתראות. בלי זה גוגל ממשיך לדחוף התראות
  // לתיבה מושבתת — הן נדחות, אבל הן מייצרות עומס ורעש בלוגים.
  if (body.is_active === false) {
    const { data: acc } = await db.from('gmail_accounts')
      .select('refresh_token, email').eq('id', id).maybeSingle()
    const a = acc as { refresh_token?: string; email?: string } | null
    if (a?.refresh_token) {
      try { await getGmailClientForToken(a.refresh_token).users.stop({ userId: 'me' }) }
      catch (e) { console.warn('[accounts] עצירת watch נכשלה:', e instanceof Error ? e.message : e) }
    }
    patch.watch_expires_at = null
    patch.watch_started_at = null
  }

  const { error } = await db.from('gmail_accounts').update(patch).eq('id', id)
  if (error) {
    console.error('[accounts] עדכון נכשל:', error.message)
    return NextResponse.json({ error: 'העדכון נכשל' }, { status: 500 })
  }

  await logActivity(db, {
    action: body.is_active === false ? 'gmail_account_disabled' : 'gmail_account_updated',
    entityType: 'gmail_accounts',
    entityId: id,
    details: patch,
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const staff = await requireNonMailStaff()
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: 'חסר מזהה תיבה' }, { status: 400 })

  const { data: acc } = await db.from('gmail_accounts')
    .select('email, refresh_token').eq('id', id).maybeSingle()
  const a = acc as { email?: string; refresh_token?: string } | null
  if (!a) return NextResponse.json({ error: 'התיבה לא נמצאה' }, { status: 404 })

  // ⚠️ עוצרים את המנוי לפני המחיקה. אחרי שהשורה תרד לא יהיה refresh_token
  // ואי אפשר יהיה לעצור אותו — גוגל ימשיך לדחוף התראות על תיבה שאיננה.
  if (a.refresh_token) {
    try { await getGmailClientForToken(a.refresh_token).users.stop({ userId: 'me' }) }
    catch (e) { console.warn('[accounts] עצירת watch נכשלה:', e instanceof Error ? e.message : e) }
  }

  // 🔴 המחיקה גוררת ב-cascade את כל שורות האינדקס של התיבה
  // (gmail_messages.account_id → on delete cascade).
  const { error } = await db.from('gmail_accounts').delete().eq('id', id)
  if (error) {
    console.error('[accounts] מחיקה נכשלה:', error.message)
    return NextResponse.json({ error: 'המחיקה נכשלה' }, { status: 500 })
  }

  await logActivity(db, {
    action: 'gmail_account_deleted',
    entityType: 'gmail_accounts',
    entityId: id,
    details: { email: a.email },
  }).catch(() => {})

  console.log(`[accounts] נמחקה תיבה ${a.email}`)
  return NextResponse.json({ ok: true })
}
