import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { verifyPublicToken } from '@/lib/publicToken'
import { buildGratitudeVoucher } from '@/lib/gratitudeVoucher'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { gratitudeReceivedEmail } from '@/lib/emailTemplates'

// ─────────────────────────────────────────────────────────────────────────────
// כתיבת דברי ברכה לנדיב — endpoint ציבורי (ללא התחברות).
// האימות היחיד הוא הטוקן החתום שנשלח במייל ליולדת.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

const MAX_BODY = 1500
const MAX_SIG = 60

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ניקוי טקסט חופשי — הטקסט נכנס ל-PDF ולמייל, לכן מסירים כל תג HTML
function clean(s: unknown, max: number): string {
  return String(s ?? '').replace(/<[^>]*>/g, '').slice(0, max).trim()
}

interface BenRow { family_name?: string | null; spouse_name?: string | null; email?: string | null }

// GET — טעינת מצב הדף (האם כבר נשלח מכתב)
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  const aidId = verifyPublicToken(token, 'g')
  if (!aidId) return NextResponse.json({ error: 'קישור לא תקין' }, { status: 401 })

  const db = adminClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: existing } = await db
    .from('gratitude_letters')
    .select('id')
    .eq('maternity_aid_id', aidId)
    .maybeSingle()

  return NextResponse.json({ submitted: Boolean(existing) })
}

export async function POST(request: NextRequest) {
  if (!rateLimit(`gratitude:${clientIp(request)}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות, נסו שוב מאוחר יותר' }, { status: 429 })
  }

  let payload: Record<string, unknown>
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const aidId = verifyPublicToken(String(payload.token ?? ''), 'g')
  if (!aidId) return NextResponse.json({ error: 'קישור לא תקין או שפג תוקפו' }, { status: 401 })

  const text = clean(payload.body, MAX_BODY)
  if (!text) return NextResponse.json({ error: 'לא נכתבו דברי ברכה' }, { status: 400 })

  const db = adminClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // חד-פעמיות: אם כבר התקבל מכתב ללידה הזו — מכל מסלול (טופס, מייל,
  // או שובר סרוק) — הקישור אינו פעיל עוד. (תצוגה מקדימה מותרת תמיד.)
  if (payload.preview !== true) {
    const { data: existing } = await db
      .from('gratitude_letters')
      .select('id')
      .eq('maternity_aid_id', aidId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'כבר התקבל מכתב ברכה עבור לידה זו. תודה רבה!', alreadySubmitted: true },
        { status: 409 },
      )
    }
  }

  const { data: aid } = await db
    .from('maternity_aids')
    .select('id, beneficiary_id, beneficiary:beneficiaries(family_name, spouse_name, email)')
    .eq('id', aidId)
    .maybeSingle()
  if (!aid) return NextResponse.json({ error: 'הרשומה לא נמצאה' }, { status: 404 })

  const ben = (Array.isArray(aid.beneficiary) ? aid.beneficiary[0] : aid.beneficiary) as BenRow | null

  // ברירת המחדל: השם מופיע. אנונימי רק אם ביקשו במפורש.
  const isAnonymous = payload.isAnonymous === true
  const signature = clean(payload.signature, MAX_SIG)

  const voucher = await buildGratitudeVoucher({
    mode: 'filled',
    body: text,
    signature,
    familyName: ben?.family_name ?? undefined,
    isAnonymous,
  })

  // תצוגה מקדימה — לא נשמר דבר
  if (payload.preview === true) {
    return NextResponse.json({ pdf: voucher.contentB64 })
  }

  const { error } = await db.from('gratitude_letters').upsert({
    maternity_aid_id: aidId,
    beneficiary_id: aid.beneficiary_id,
    source: 'web',
    body: text,
    signature: signature || null,
    is_anonymous: isAnonymous,
  }, { onConflict: 'maternity_aid_id' })

  if (error) {
    console.error('[gratitude] שמירה נכשלה:', error.message)
    return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 })
  }

  // מייל אישור ליולדת עם השובר המעוצב — לא חוסם את התגובה
  void (async () => {
    if (!ben?.email) return
    try {
      const mail = gratitudeReceivedEmail({ familyName: ben.family_name, motherName: ben.spouse_name })
      await deliverMail(ben.email, mail.subject, mail.html, [voucher], mailFor('maternity'))
    } catch (e) { console.error('[gratitude] מייל אישור נכשל:', e) }
  })()

  return NextResponse.json({ ok: true })
}
