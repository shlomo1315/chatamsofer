// ─────────────────────────────────────────────────────────────────────────────
// הפקת טופס חתימת רב עבור *המבקש עצמו* (הפורטל הציבורי).
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
  buildRabbiFormPdf, DEFAULT_LAYOUT, type FormLayout, type RabbiFormData,
} from '@/lib/rabbiFormPdf'

export const dynamic = 'force-dynamic'

const LAYOUT_KEY = 'rabbi_form_layout'

export async function GET(request: NextRequest) {
  const beneficiaryId = getPortalBeneficiaryId(request)
  if (!beneficiaryId) {
    return NextResponse.json({ error: 'נדרש אימות מחדש' }, { status: 401 })
  }

  const loanId = request.nextUrl.searchParams.get('loan')
  if (!loanId) return NextResponse.json({ error: 'חסר מזהה בקשה' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  // ⚠️ ה-eq על beneficiary_id הוא ההרשאה עצמה: בלעדיו כל מזהה הלוואה
  // היה מפיק טופס עם פרטי משפחה אחרת.
  const { data: loan } = await db
    .from('loans')
    .select('id, amount, installments, beneficiary_id')
    .eq('id', loanId)
    .eq('beneficiary_id', beneficiaryId)
    .maybeSingle()

  if (!loan) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })

  const { data: ben } = await db
    .from('beneficiaries')
    .select('family_name, full_name, id_number')
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
    amount: Number(loan.amount ?? 0),
    installments: Number(loan.installments ?? 0),
    lineage: [],
  }

  try {
    const bytes = await buildRabbiFormPdf(data, layout)
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        // ⚠️ inline: הטופס מוצג בחלונית בתוך הדף (iframe) ומשם מדפיסים
        // או מורידים. attachment היה כופה הורדה ושובר את התצוגה.
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent('טופס-חתימת-רב.pdf')}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[portal/rabbi-form] הפקה נכשלה:', e)
    return NextResponse.json({ error: 'שגיאה בהפקת הטופס' }, { status: 500 })
  }
}
