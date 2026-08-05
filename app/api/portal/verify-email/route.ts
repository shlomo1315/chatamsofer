import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { verifyVerifyToken } from '@/lib/verifyToken'

// ─────────────────────────────────────────────────────────────────────────────
// אימות כתובת המייל *אחרי* הרישום.
//
// נדרש מרגע שאפשר לכבות את חובת אימות המייל ברישום (מתג בהגדרות): מי שנרשם
// בלי לאמת מתבקש לאמת בכניסה הבאה לאזור האישי — אבל יכול לדלג, כי אימות
// הטלפון בשיחה כבר מבטיח את זהותו.
//
// ⚠️ אבטחה: הפעולה מחייבת סשן פורטל תקף, ורק על הרשומה שבסשן. בלי זה, כל מי
// שיודע ת"ז של אדם אחר היה יכול לשייך לרשומתו כתובת מייל שבשליטתו — ומשם
// להיכנס לחשבון בקוד זמני למייל. זו הסיבה שהאימות אינו זמין במסך הכניסה
// עצמו אלא רק אחרי כניסה מוצלחת (בטלפון, למשל).
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// האם העמודה חסרה (המיגרציה טרם הורצה)
function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? ''
  return m.includes('column') && m.includes('does not exist')
}

// GET — האם המייל של המוטב בסשן כבר אומת.
export async function GET(request: NextRequest) {
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await admin
    .from('beneficiaries')
    .select('email, email_verified_at')
    .eq('id', sessionId)
    .maybeSingle()

  // ⚠️ נכשל-"מאומת": כל עוד המיגרציה לא רצה, אין דרך לדעת מי אימת — ועדיף
  // לא לבקש כלום מאשר להציג לכל המשתמשים בקשה לאמת מייל שכבר עובד להם.
  if (error) {
    if (isMissingColumn(error)) return NextResponse.json({ verified: true, pendingMigration: true })
    console.error('[verify-email] db error:', error.message)
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }

  return NextResponse.json({
    verified: !!data?.email_verified_at,
    email: data?.email ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST — שמירת כתובת מייל מאומתת. גוף: { email, email_verify_token }
export async function POST(request: NextRequest) {
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId) {
    return NextResponse.json({ error: 'נדרש אימות מחדש — נא לבצע כניסה מחדש לפורטל' }, { status: 401 })
  }

  let body: { email?: unknown; email_verify_token?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const email = String(body.email ?? '').trim().toLowerCase()
  const token = typeof body.email_verify_token === 'string' ? body.email_verify_token : undefined
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
  }
  // האסימון החתום הוא ההוכחה היחידה שהכתובת בשליטת הפונה — בלעדיו אין אימות.
  if (!verifyVerifyToken(token, 'email', email)) {
    return NextResponse.json({ error: 'אימות כתובת המייל אינו תקף. יש לשלוח קוד חדש ולאמת שוב.' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ הכתובת חייבת להיות פנויה: אותה כתובת אצל שני מוטבים פירושה ששניהם
  // יכולים לקבל קוד כניסה לחשבון של האחר.
  const { data: taken } = await admin
    .from('beneficiaries').select('id').eq('email', email).neq('id', sessionId).maybeSingle()
  if (taken) {
    return NextResponse.json({ error: 'כתובת המייל הזו כבר רשומה במערכת אצל נרשם אחר.' }, { status: 409 })
  }

  const { error } = await admin
    .from('beneficiaries')
    .update({ email, email_verified_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (error) {
    if (isMissingColumn(error)) {
      // המיגרציה טרם רצה — לפחות הכתובת נשמרת, וסימון האימות ייווצר בהמשך.
      const retry = await admin.from('beneficiaries').update({ email }).eq('id', sessionId)
      if (!retry.error) return NextResponse.json({ ok: true, pendingMigration: true })
    }
    console.error('[verify-email] update error:', error.message)
    return NextResponse.json({ error: 'שגיאה בשמירת הנתונים. אנא נסו שוב.' }, { status: 500 })
  }

  console.log(`[verify-email] מייל אומת אחרי רישום · beneficiary=${sessionId}`)
  return NextResponse.json({ ok: true, email })
}
