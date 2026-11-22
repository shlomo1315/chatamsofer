// שמירת הערת פורטל על הלוואה (PUT). טקסט ריק מוחק את ההערה.
import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken, PORTAL_COOKIE } from '@/lib/loansPortalAuth'
import { normalizePortalNote } from '@/lib/loansPortalNote'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(PORTAL_COOKIE)?.value
  if (!(await verifyPortalToken(token))) {
    return NextResponse.json({ error: 'נדרשת אימות' }, { status: 401 })
  }

  const { id } = await params
  let body: { note?: unknown } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const parsed = normalizePortalNote(body.note)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const db = adminClient()
  const now = new Date().toISOString()

  // ⚠️ ההשוואה לערך הקודם בשרת ולא רק בדפדפן: שמירה חוזרת של אותו טקסט
  // לא פותחת מחדש התראה שהמזכירות כבר סימנו "טופל".
  const { data: cur } = await db.from('loans').select('portal_note').eq('id', id).maybeSingle()
  const changed = (cur?.portal_note ?? null) !== parsed.value

  // 🔴 הערה חדשה/ששונתה פותחת התראה למזכירות ההלוואות (חלונית + הבהוב
  // ברשימה). מחיקת ההערה סוגרת אותה — אין על מה לטפל.
  const alert = !changed ? {}
    : parsed.value
      ? { portal_note_at: now, portal_note_alert: 'open', portal_note_remind_at: null,
          portal_note_handled_at: null, portal_note_handled_by: null }
      : { portal_note_alert: null, portal_note_remind_at: null }

  // ⚠️ רק הלוואות שמוצגות בפורטל (מאושרות/פעילות).
  const run = (extra: Record<string, unknown>) => db
    .from('loans')
    .update({ portal_note: parsed.value, updated_at: now, ...extra })
    .eq('id', id)
    .in('status', ['approved', 'active'])
    .select('id')

  let { data, error } = await run(alert)
  // ⚠️ לפני שמיגרציית ההתראה רצה העמודות חסרות — ההערה עצמה נשמרת בכל זאת.
  if (error && /portal_note_(at|alert|remind_at|handled)/.test(error.message)) {
    console.error('[portal-note] עמודות ההתראה חסרות — נשמר בלי התראה:', error.message)
    ;({ data, error } = await run({}))
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'ההלוואה לא נמצאה' }, { status: 404 })
  return NextResponse.json({ ok: true, note: parsed.value })
}
