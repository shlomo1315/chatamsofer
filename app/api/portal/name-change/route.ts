import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPortalBeneficiaryId } from '@/lib/portalSession'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// בקשת שינוי שם פרטי מהאזור האישי.
//
// 🔴 הרשומה עצמה **אינה משתנה כאן**. השם מזהה את האדם, ושינוי חופשי שלו
// היה מאפשר להחליף זהות של רשומה מאושרת — כולל את הזכאות שנצברה לה.
// הבקשה נשמרת, ההנהלה מאשרת, ורק אז השם מתעדכן.
//
// ⚠️ ת"ז אינה ניתנת לבקשה כלל: היא המפתח לזיהוי מול המשרד ומול העץ, ולא
// שדה שמתקנים בו שגיאת כתיב.
//
// ⚠️ שם משפחה גם הוא לא: הוא משפיע על שיוך העץ ועל החלוקות, ושינוי שלו
// הוא פעולה של המשרד ולא בקשה של הנרשם.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** שם פרטי תקין: אותיות עבריות, גרש/גרשיים, מקף ורווח. */
function cleanName(v: unknown): string {
  return String(v ?? '')
    .replace(/[^֐-׿ a-zA-Z'"׳״\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(request: NextRequest) {
  let body: { beneficiary_id?: string; target?: string; new_name?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const benId = String(body.beneficiary_id ?? '')
  // ⚠️ הסשן הוא מקור האמת ולא ה-body: בלי ההשוואה הזו אפשר היה לשלוח
  // מזהה של משפחה אחרת ולבקש שינוי שם בשמה.
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId || sessionId !== benId) {
    return NextResponse.json({ error: 'נדרש אימות מחדש — נא לבצע כניסה מחדש לפורטל' }, { status: 401 })
  }

  const target = body.target === 'spouse' ? 'spouse' : 'self'
  const newName = cleanName(body.new_name)
  if (!newName) return NextResponse.json({ error: 'יש להזין שם' }, { status: 400 })
  if (newName.length < 2) return NextResponse.json({ error: 'השם קצר מדי' }, { status: 400 })
  if (newName.length > 60) return NextResponse.json({ error: 'השם ארוך מדי' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: ben } = await admin
    .from('beneficiaries')
    .select('id, full_name, spouse_name, eligibility_status')
    .eq('id', benId)
    .maybeSingle()
  if (!ben) return NextResponse.json({ error: 'נרשם לא נמצא' }, { status: 404 })
  if (ben.eligibility_status === 'rejected') {
    return NextResponse.json({ error: 'הפעולה אינה זמינה עבור חשבון זה' }, { status: 403 })
  }

  const oldName = String((target === 'spouse' ? ben.spouse_name : ben.full_name) ?? '')
  // ⚠️ בקשה שאינה משנה דבר נדחית כאן ולא מגיעה למנהל — אחרת החלונית
  // הייתה קופצת על "שינוי" משם לעצמו.
  if (cleanName(oldName) === newName) {
    return NextResponse.json({ error: 'השם שהוזן זהה לשם הקיים' }, { status: 400 })
  }

  // ⚠️ בקשה קודמת ממתינה מוחלפת ולא נערמת: המשתמש שתיקן את עצמו פעמיים
  // אמור לראות בקשה אחת, והמנהל לא אמור להכריע פעמיים על אותו שדה.
  await admin
    .from('name_change_requests')
    .delete()
    .eq('beneficiary_id', benId)
    .eq('target', target)
    .eq('status', 'pending')

  const { error } = await admin.from('name_change_requests').insert({
    beneficiary_id: benId,
    target,
    old_name: oldName || null,
    new_name: newName,
    status: 'pending',
  })
  if (error) {
    console.error('[name-change] יצירת בקשה נכשלה:', error.message)
    return NextResponse.json({ error: 'שמירת הבקשה נכשלה' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pending: true })
}

/** הבקשות הממתינות של המשתמש — כדי שהמסך יראה "ממתין לאישור". */
export async function GET(request: NextRequest) {
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId) return NextResponse.json({ requests: [] })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ requests: [] })

  const { data } = await admin
    .from('name_change_requests')
    .select('id, target, new_name, status, requested_at, reject_reason')
    .eq('beneficiary_id', sessionId)
    .in('status', ['pending', 'rejected'])
    .order('requested_at', { ascending: false })
    .limit(10)

  return NextResponse.json({ requests: data ?? [] })
}
