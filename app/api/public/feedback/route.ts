import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { verifyPublicToken } from '@/lib/publicToken'
import { rateLimit, clientIp } from '@/lib/rateLimit'

// ─────────────────────────────────────────────────────────────────────────────
// משוב על בית ההחלמה — endpoint ציבורי (ללא התחברות).
// ⚠️ מול היולדת לא משתמשים במילה "סקר".
// חד-פעמיות נאכפת ע"י unique index על maternity_aid_id.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

const MAX_FREE_TEXT = 1000

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET — טעינת השאלות + בדיקה אם כבר נענה
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  const aidId = verifyPublicToken(token, 's')
  if (!aidId) return NextResponse.json({ error: 'קישור לא תקין' }, { status: 401 })

  const db = adminClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const [{ data: questions }, { data: existing }, { data: aid }] = await Promise.all([
    db.from('survey_questions')
      .select('id, position, text, type')
      .eq('survey', 'recovery').eq('is_active', true).order('position'),
    db.from('survey_responses').select('id').eq('maternity_aid_id', aidId).maybeSingle(),
    db.from('maternity_aids').select('recovery_home').eq('id', aidId).maybeSingle(),
  ])

  return NextResponse.json({
    questions: questions ?? [],
    submitted: Boolean(existing),
    recoveryHome: aid?.recovery_home ?? null,
  })
}

export async function POST(request: NextRequest) {
  if (!rateLimit(`feedback:${clientIp(request)}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות, נסו שוב מאוחר יותר' }, { status: 429 })
  }

  let payload: Record<string, unknown>
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const aidId = verifyPublicToken(String(payload.token ?? ''), 's')
  if (!aidId) return NextResponse.json({ error: 'קישור לא תקין או שפג תוקפו' }, { status: 401 })

  const db = adminClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ולידציה: רק ציונים 1–10, ורק לשאלות מסוג scale שקיימות ופעילות
  const { data: questions } = await db
    .from('survey_questions')
    .select('id, type')
    .eq('survey', 'recovery').eq('is_active', true)

  const validIds = new Set((questions ?? []).filter(q => q.type === 'scale').map(q => String(q.id)))

  const rawAnswers = (payload.answers ?? {}) as Record<string, unknown>
  const answers: Record<string, number> = {}
  for (const [qid, val] of Object.entries(rawAnswers)) {
    const n = Number(val)
    if (validIds.has(qid) && Number.isInteger(n) && n >= 1 && n <= 10) answers[qid] = n
  }

  const freeText = String(payload.freeText ?? '')
    .replace(/<[^>]*>/g, '').slice(0, MAX_FREE_TEXT).trim()

  if (Object.keys(answers).length === 0 && !freeText) {
    return NextResponse.json({ error: 'לא התקבלו תשובות' }, { status: 400 })
  }

  const { data: aid } = await db
    .from('maternity_aids')
    .select('beneficiary_id, recovery_home')
    .eq('id', aidId)
    .maybeSingle()

  const { error } = await db.from('survey_responses').upsert({
    maternity_aid_id: aidId,
    beneficiary_id: aid?.beneficiary_id ?? null,
    recovery_home: aid?.recovery_home ?? null,
    source: 'web',
    answers,
    free_text: freeText || null,
  }, { onConflict: 'maternity_aid_id', ignoreDuplicates: true })

  if (error) {
    console.error('[feedback] שמירה נכשלה:', error.message)
    return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
