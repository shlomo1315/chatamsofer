// ─────────────────────────────────────────────────────────────────────────────
// טופס נדרים פלוס — רישום לחלוקת חגים.
//
// ⚠️ נדרים מציגים בטופס שלהם "רישום למענק לפני החגים". הפרמטר היחיד שהם צריכים
// לשלוח הוא תעודת הזהות; המערכת מזהה לפי זה את המשפחה במאגר הצאצאים ורושמת אותה
// לחלוקה הפתוחה. הרישום *אינו* יוצר משפחה חדשה — מי שאינו רשום באיגוד מקבל
// הודעה להירשם קודם, כי בלי כרטסת אין למי לשייך את החלוקה.
//
// GET  ?id=<ת"ז>   → { open, distribution, registered }  — לבדיקה/הצגה בטופס
// POST { id }      → { ok, already }                     — רישום בפועל
//
// אבטחה: CORS מוגדר (jsonCors) ורייט-לימיט נגד אנומרציה של תעודות זהות.
// אין החזרת PII: לא שם, לא טלפון, לא כתובת — רק אם נרשם ומה שם החלוקה.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { resolveBeneficiaryByEnteredId } from '@/lib/portalBeneficiary'
import { jsonCors, preflight } from '@/lib/cors'
import { getOpenDistribution, registerToOpenDistribution } from '@/lib/holidayDistributions'

export const dynamic = 'force-dynamic'

const NOT_REGISTERED =
  'תעודת הזהות אינה רשומה במערכת איגוד הצאצאים. יש להירשם תחילה לאיגוד הצאצאים, ולאחר מכן ניתן להירשם לחלוקת החגים.'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function OPTIONS(request: NextRequest) {
  return preflight(request.headers.get('origin'))
}

async function resolve(idParam: string) {
  const admin = getAdminClient()
  if (!admin) return { admin: null, ben: null }
  const ben = await resolveBeneficiaryByEnteredId<{ id: string }>(admin, idParam, 'id')
  return { admin, ben }
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!rateLimit(`nedarim-holiday:${clientIp(request)}`, 40, 15 * 60 * 1000)) {
    return jsonCors({ error: 'יותר מדי ניסיונות. נסו שוב בעוד מספר דקות.' }, { status: 429 }, origin)
  }

  const dist = await getOpenDistribution()
  const idParam = (request.nextUrl.searchParams.get('id') ?? '').replace(/\D/g, '')
  if (!dist) return jsonCors({ open: false }, undefined, origin)

  const payload = {
    open: true,
    distribution: `${dist.name}${dist.year ? ` ${dist.year}` : ''}`,
  }
  if (!idParam || idParam.length < 5) return jsonCors(payload, undefined, origin)

  const { admin, ben } = await resolve(idParam)
  if (!admin) return jsonCors({ error: 'שגיאת שרת' }, { status: 500 }, origin)
  if (!ben) return jsonCors({ ...payload, found: false, message: NOT_REGISTERED }, undefined, origin)

  const { data } = await admin.from('distribution_recipients')
    .select('id').eq('distribution_id', dist.id).eq('beneficiary_id', ben.id).maybeSingle()
  return jsonCors({ ...payload, found: true, registered: !!data }, undefined, origin)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!rateLimit(`nedarim-holiday-post:${clientIp(request)}`, 20, 15 * 60 * 1000)) {
    return jsonCors({ error: 'יותר מדי ניסיונות. נסו שוב בעוד מספר דקות.' }, { status: 429 }, origin)
  }

  let body: { id?: string; id_number?: string; zeout?: string }
  try { body = await request.json() } catch { body = {} }
  // נדרים שולחים את השדה בשמות שונים לפי הטופס — מקבלים את כולם
  const idParam = String(body.id ?? body.id_number ?? body.zeout ?? request.nextUrl.searchParams.get('id') ?? '').replace(/\D/g, '')
  if (!idParam || idParam.length < 5) {
    return jsonCors({ error: 'מספר תעודת זהות לא תקין' }, { status: 400 }, origin)
  }

  const dist = await getOpenDistribution()
  if (!dist) return jsonCors({ ok: false, open: false, error: 'הרישום לחלוקת החגים אינו פתוח כרגע' }, { status: 409 }, origin)

  const { admin, ben } = await resolve(idParam)
  if (!admin) return jsonCors({ error: 'שגיאת שרת' }, { status: 500 }, origin)
  if (!ben) return jsonCors({ ok: false, found: false, error: NOT_REGISTERED }, { status: 404 }, origin)

  const result = await registerToOpenDistribution(ben.id, 'nedarim', {})
  if (!result.ok) return jsonCors({ ok: false, error: result.error ?? 'הרישום נכשל' }, { status: 500 }, origin)

  return jsonCors({
    ok: true,
    already: !result.created,
    distribution: `${dist.name}${dist.year ? ` ${dist.year}` : ''}`,
    message: result.created
      ? 'רישומכם לחלוקת החגים נקלט בהצלחה. בעזרת השם, במהלך חודש אלול תקבלו עדכון מדויק על אופן החלוקה.'
      : 'אתם כבר רשומים לחלוקת החגים. אין צורך בפעולה נוספת.',
  }, undefined, origin)
}
