// ─────────────────────────────────────────────────────────────────────────────
// הפקת טופס אישור רב עבור *המבקש עצמו* (הפורטל הציבורי).
//
// 🔴 מסלול נפרד מ-/api/admin/loans/rabbi-form: המסלול הניהולי מוגן ב-
// requireStaff, ולכן דפדפן של מבקש מקבל ממנו דחייה ("הדף לא יכול לטפל
// בבקשות אלו"). כאן האימות הוא סשן הפורטל.
//
// ⚠️ הגישה מוגבלת לבקשה של המוטב שבסשן — מזהה הלוואה של מישהו אחר
// אינו מפיק דבר, גם אם הוא ידוע.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import {
  buildRabbiFormPdf, lineageFromChain, DEFAULT_LAYOUT, type FormLayout, type RabbiFormData,
} from '@/lib/rabbiFormPdf'

export const dynamic = 'force-dynamic'

const LAYOUT_KEY = 'rabbi_form_layout'

export async function GET(request: NextRequest) {
  const beneficiaryId = getPortalBeneficiaryId(request)
  if (!beneficiaryId) {
    return NextResponse.json({ error: 'נדרש אימות מחדש' }, { status: 401 })
  }

  // 🔴 אינו דורש מזהה בקשה.
  //
  // ⚠️ קודם הטופס הופק רק עבור בקשה קיימת (?loan=), וזה כפה את הסדר
  // הישן: המבקש נאלץ להגיש קודם — ולו כטיוטה — רק כדי לקבל את הטופס
  // להחתמה, ואז לחזור בכניסה נפרדת. עכשיו הטופס נגזר מפרטי המוטב
  // בלבד (שם, ת"ז, סדר הדורות), ולכן ניתן להורידו לפני שנפתחה בקשה.
  //
  // ⚠️ ההרשאה לא נחלשה: היא נשענת על סשן הפורטל (getPortalBeneficiaryId)
  // ומפיקה אך ורק את פרטי המוטב שבסשן. הסכום ומספר התשלומים הוסרו
  // מהטופס ממילא — ראה lib/rabbiFormPdf.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: ben } = await db
    .from('beneficiaries')
    .select('family_name, full_name, id_number, lineage_chain, lineage_node_id')
    .eq('id', beneficiaryId)
    .maybeSingle()

  let layout: FormLayout = DEFAULT_LAYOUT
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', LAYOUT_KEY).maybeSingle()
    if (data?.value) {
      layout = { ...DEFAULT_LAYOUT, ...(JSON.parse(String(data.value)) as Partial<FormLayout>) }
    }
  } catch { /* ברירת מחדל */ }

  const data: RabbiFormData = {
    applicantName: [ben?.family_name, ben?.full_name].filter(Boolean).join(' '),
    idNumber: String(ben?.id_number ?? ''),
    lineage: lineageFromChain(ben?.lineage_chain),
  }

  try {
    const bytes = await buildRabbiFormPdf(data, layout)
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        // ⚠️ inline: הטופס מוצג בחלונית בתוך הדף (iframe) ומשם מדפיסים
        // או מורידים. attachment היה כופה הורדה ושובר את התצוגה.
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent('טופס-אישור-רב.pdf')}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[portal/rabbi-form] הפקה נכשלה:', e)
    return NextResponse.json({ error: 'שגיאה בהפקת הטופס' }, { status: 500 })
  }
}
