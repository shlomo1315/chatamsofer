import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyPublicToken } from '@/lib/publicToken'

export const dynamic = 'force-dynamic'

// סינון אותיות עבריות בלבד (שם, רווח, גרשיים/מקף) — זהה לסינון בטופס הציבורי.
const NON_HEBREW_NAME_CHARS = /[^א-ת ׳״'"-]/g
const hebrewNameOnly = (v: string) => v.replace(NON_HEBREW_NAME_CHARS, '')

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// קליטת שם התינוק מהעמוד הציבורי (הקישור שנשלח ליולדת). מאמת טוקן HMAC (kind='n'),
// שומר את השם, ומכבה את דגל "עדיין אין שם". פתוח לציבור — מוגן רק ע"י הטוקן החתום.
export async function POST(request: NextRequest) {
  let body: { token?: string; name?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const aidId = verifyPublicToken(body.token, 'n')
  if (!aidId) return NextResponse.json({ error: 'הקישור אינו תקין או שפג תוקפו' }, { status: 403 })

  // רק אותיות עבריות (אותה סינון כמו הטופס הציבורי) — מונע הזנת טקסט פסול
  const name = hebrewNameOnly(String(body.name ?? '')).trim()
  if (!name) return NextResponse.json({ error: 'יש להזין שם תקין (אותיות עבריות בלבד)' }, { status: 400 })
  if (name.length > 60) return NextResponse.json({ error: 'השם ארוך מדי' }, { status: 400 })

  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: aid } = await admin
    .from('maternity_aids')
    .select('id, babies, beneficiary_id, baby_id_number')
    .eq('id', aidId)
    .maybeSingle()
  if (!aid) return NextResponse.json({ error: 'הרשומה לא נמצאה' }, { status: 404 })

  // עדכון השם בתיק + כיבוי דגל "אין שם"
  const { error } = await admin
    .from('maternity_aids')
    .update({ baby_name: name, baby_name_pending: false, updated_at: new Date().toISOString() })
    .eq('id', aidId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // סנכרון לכרטסת המשפחה (children) — כמו בעריכת אדמין: מאתרים את התינוק לפי הקישור
  // לתיק הלידה או לפי ת"ז, ומעדכנים את שמו. כשל בסנכרון לא חוסם.
  try {
    if (aid.beneficiary_id) {
      const { data: ben } = await admin.from('beneficiaries').select('children').eq('id', aid.beneficiary_id).maybeSingle()
      const children = Array.isArray(ben?.children) ? ben!.children as Record<string, unknown>[] : []
      const idx = children.findIndex(c =>
        (c.maternity_aid_id && c.maternity_aid_id === aidId) ||
        (aid.baby_id_number && c.id_number === aid.baby_id_number))
      if (idx !== -1) {
        const updated = children.map((c, i) => i === idx ? { ...c, name } : c)
        await admin.from('beneficiaries').update({ children: updated }).eq('id', aid.beneficiary_id)
      }
    }
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true })
}
