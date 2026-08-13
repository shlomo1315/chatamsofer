// ─────────────────────────────────────────────────────────────────────────────
// סימון "נשלח שטר" בפורטל הביצוע.
//
// ⚠️ שלב ביניים בין האישור להפקדה, ולא סטטוס נפרד: הבקשה נשארת
// 'approved' לכל אורך הדרך. סטטוס נפרד היה מחייב כל שאילתה במערכת
// להכיר בו, ובפועל מה שמעניין הוא רק *מתי* השטר נשלח.
//
// POST   — סימון שהשטר נשלח
// DELETE — ביטול הסימון (נשלח בטעות)
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken, PORTAL_COOKIE } from '@/lib/loansPortalAuth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(PORTAL_COOKIE)?.value
  if (!(await verifyPortalToken(token))) {
    return NextResponse.json({ error: 'נדרשת אימות' }, { status: 401 })
  }

  const { id } = await params
  let body: { note_sent_by?: string } = {}
  try { body = await req.json() } catch { /* גוף ריק — מותר */ }

  const admin = adminClient()

  // ⚠️ ה-eq על הסטטוס הוא ההגנה: שטר נשלח רק על בקשה מאושרת. בלעדיו
  // לחיצה על בקשה שכבר בוצעה או נדחתה הייתה מסמנת אותה בשקט.
  const { data, error } = await admin
    .from('loans')
    .update({
      note_sent_at: new Date().toISOString(),
      note_sent_by: body.note_sent_by || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'approved')
    .is('disbursed_at', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) {
    return NextResponse.json({ error: 'הבקשה אינה במצב שמאפשר שליחת שטר' }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(PORTAL_COOKIE)?.value
  if (!(await verifyPortalToken(token))) {
    return NextResponse.json({ error: 'נדרשת אימות' }, { status: 401 })
  }

  const { id } = await params
  const admin = adminClient()

  // ⚠️ ביטול מותר רק לפני ההפקדה: אחריה הסימון הוא חלק מהתיעוד
  // ההיסטורי של התיק ואין סיבה לגעת בו.
  const { error } = await admin
    .from('loans')
    .update({ note_sent_at: null, note_sent_by: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('disbursed_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
