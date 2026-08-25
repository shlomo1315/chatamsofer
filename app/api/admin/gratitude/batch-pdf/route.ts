import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, forbidden, getServiceClient } from '@/lib/apiAuth'
import { buildGratitudeBatchPdf, type BatchLetterFull } from '@/lib/gratitudeBatchPdf'
import type { BatchFilters, SentFilter, StatusFilter } from '@/lib/gratitudeBatch'

// ─────────────────────────────────────────────────────────────────────────────
// הפקת הקובץ המרוכז של הברכות — בשרת.
//
// 🔴 ההפקה הייתה בדפדפן ונכשלה: "Failed to execute 'atob' on 'Window'".
// הפונט המוטמע הוא variable font של 122KB, ו-embedFont עליו אינו עובד
// באותה צורה בדפדפן. שוברי היולדות והחגים תמיד רצו בשרת (Buffer) — ולכן
// הם עבדו, וזה המסלול המוכח.
//
// ⚠️ runtime = 'nodejs' מפורש: pdf-lib עם fontkit דורש Buffer, ו-edge
// אינו מספק אותו.
//
// ⚠️ הקובץ נבנה מהמסד ולא מנתונים שהדפדפן שולח: לקוח יכול לבקש כל טווח,
// אבל לא להזריק תוכן ברכות שלא קיים.
//
// 🔒 צוות בלבד.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface Row {
  id: string
  status: string | null
  sent_to_donor_at: string | null
  created_at: string | null
  body: string | null
  signature: string | null
  is_anonymous: boolean | null
  source: string | null
  scan_url: string | null
  aid?: {
    birth_date?: string | null
    beneficiary?: { family_name?: string | null; spouse_name?: string | null; full_name?: string | null } | null
  } | {
    birth_date?: string | null
    beneficiary?: { family_name?: string | null; spouse_name?: string | null; full_name?: string | null } | null
  }[] | null
}

/** ⚠️ join של Supabase מחזיר מערך או אובייקט — שניהם נתמכים. */
const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return forbidden('הפקת הקובץ שמורה לצוות')

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let input: { from?: string | null; to?: string | null; sent?: string; status?: string }
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  // ⚠️ ערכים לא מוכרים נופלים ל'all' ולא נשלחים כמות שהם לפילוח: כך
  // בקשה משובשת מחזירה יותר מדי ולא פחות מדי, וזה הצד הבטוח.
  const SENT: SentFilter[] = ['all', 'unsent', 'sent']
  const STATUS: StatusFilter[] = ['all', 'approved', 'received', 'rejected']
  const filters: BatchFilters = {
    from: (input.from ?? '').trim() || null,
    to: (input.to ?? '').trim() || null,
    sent: SENT.includes(input.sent as SentFilter) ? (input.sent as SentFilter) : 'all',
    status: STATUS.includes(input.status as StatusFilter) ? (input.status as StatusFilter) : 'all',
  }

  const { data, error } = await db
    .from('gratitude_letters')
    .select('id, status, sent_to_donor_at, created_at, body, signature, is_anonymous, source, scan_url, aid:maternity_aids(birth_date, beneficiary:beneficiaries(family_name, spouse_name, full_name))')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const letters: BatchLetterFull[] = ((data ?? []) as Row[]).map(r => {
    const aid = one(r.aid)
    const b = one(aid?.beneficiary)
    return {
      id: r.id,
      status: r.status,
      sent_to_donor_at: r.sent_to_donor_at,
      created_at: r.created_at,
      body: r.body,
      signature: r.signature,
      is_anonymous: r.is_anonymous,
      source: r.source,
      scan_url: r.scan_url,
      motherName: [b?.family_name, b?.spouse_name || b?.full_name].filter(Boolean).join(' '),
      birthDate: aid?.birth_date ?? null,
    }
  })

  try {
    const bytes = await buildGratitudeBatchPdf({ letters, filters })
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        // ⚠️ שם הקובץ נשלח מקודד: שם עברי ב-Content-Disposition ללא
        // filename* נשבר לג'יבריש בחלק מהדפדפנים.
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('מכתבי ברכה.pdf')}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאה בהפקת הקובץ' }, { status: 500 })
  }
}
