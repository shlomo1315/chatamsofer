// טופס נדרים — בדיקה אם ת"ז כבר רשום במערכת. יש לקרוא לפני מעבר להרשמה.
// מחזיר אך ורק { found: true/false } (+ הודעה קבועה אם קיים) — ללא שום PII.
// אבטחה: אין חשיפת שם/טלפון/כתובת. rate-limit נגד אנומרציה.
import { createClient } from '@supabase/supabase-js'
import { type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { resolveBeneficiaryByEnteredId } from '@/lib/portalBeneficiary'
import { jsonCors, preflight } from '@/lib/cors'

export const dynamic = 'force-dynamic'

// ההודעה המוצגת למשתמש שכבר רשום (במקום מעבר להרשמה).
const EXISTS_MESSAGE =
  'תעודת הזהות כבר רשומה במערכת האיגוד. לא ניתן להגיש בקשות דרך נדרים פלוס כיוון שכל בקשה מחייבת העלאת קבצים. להגשת בקשות יש לפנות במייל: igud@chasamsofer.info'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function OPTIONS(request: NextRequest) {
  return preflight(request.headers.get('origin'))
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  // הגבלת קצב — בולמת ניסיונות אנומרציה של תעודות זהות
  if (!rateLimit(`nedarim-lookup:${clientIp(request)}`, 30, 15 * 60 * 1000)) {
    return jsonCors({ error: 'יותר מדי ניסיונות. נסה שוב בעוד מספר דקות.' }, { status: 429 }, origin)
  }

  const idParam = request.nextUrl.searchParams.get('id')?.replace(/\D/g, '')
  if (!idParam || idParam.length < 5) {
    return jsonCors({ error: 'מספר תעודת זהות לא תקין' }, { status: 400 }, origin)
  }

  const admin = getAdminClient()
  if (!admin) return jsonCors({ error: 'שגיאת שרת' }, { status: 500 }, origin)

  // 1. מוטב רשום (הבעל/הרשום או בן/בת הזוג) — נחסם מהגשה דרך נדרים.
  //    מוחזר כמו קודם, בלי is_child, כדי שנדרים ימשיך לחסום אותו.
  const found = await resolveBeneficiaryByEnteredId<{ id: string }>(admin, idParam, 'id')
  if (found) return jsonCors({ found: true, type: 'head', message: EXISTS_MESSAGE }, undefined, origin)

  // 2. קיים כילד בתוך children JSONB של רשומה אחרת — *ילד של צאצא*.
  //    מוחזר עם is_child=true + שם ההורה ושרשרת הייחוס, כדי שנדרים ינתב אותו
  //    לרישום מהיר (ולא יחסום). זהה למידע שכבר מחזיר פורטל הרישום שלנו
  //    (app/api/portal/lookup) עבור אותו מסלול בדיוק.
  const { data: rows, error } = await admin
    .from('beneficiaries')
    .select('full_name, family_name, lineage_chain, children')
    .not('children', 'is', null)
  if (error) {
    console.error('[nedarim-lookup] db error:', error.message)
    return jsonCors({ error: 'שגיאת שרת' }, { status: 500 }, origin)
  }
  for (const row of rows ?? []) {
    const kids: Record<string, string>[] = Array.isArray(row.children) ? row.children : []
    const match = kids.find((k) => (k.id_number ?? '').replace(/\D/g, '') === idParam)
    if (match) {
      const parentName = [row.family_name, row.full_name].filter(Boolean).join(' ')
      return jsonCors({
        found: true,
        type: 'child',
        is_child: true,
        parent_name: parentName,
        // שם המשפחה לבדו — להצגת "משפחת X" ולמילוי אוטומטי של שדה שם המשפחה
        family_name: row.family_name ?? '',
        // סדר הדורות עד ההורה: [{ generation, name, relation }]
        lineage_chain: Array.isArray(row.lineage_chain) ? row.lineage_chain : null,
        // פרטי הילד — לנוחות מילוי מראש בטופס הרישום המהיר
        child: {
          name: match.name ?? '',
          id_number: idParam,
          birth_date: match.birth_date ?? '',
          gender: match.gender ?? '',
        },
      }, undefined, origin)
    }
  }

  return jsonCors({ found: false }, undefined, origin)
}
