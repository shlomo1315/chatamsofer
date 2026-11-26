import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { BIRTH_DATE_COLUMN, isBirthDateWho, validateBirthDate } from '@/lib/portalBirthDate'

export const dynamic = 'force-dynamic'

// תיקון תאריך לידה מהאזור האישי. 🔒 הרשומה נקבעת רק מהסשן החתום בשרת: אין בגוף הבקשה
// מזהה נרשם, ולכן אי אפשר לשנות תאריך של משפחה אחרת. מקבל { who: 'self'|'spouse', birth_date }.
export async function POST(request: NextRequest) {
  const id = getPortalBeneficiaryId(request)
  if (!id) return NextResponse.json({ error: 'נדרש אימות מחדש — נא לבצע כניסה מחדש לפורטל' }, { status: 401 })

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || !isBirthDateWho(body.who)) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  const v = validateBirthDate(body.birth_date)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: ben } = await admin.from('beneficiaries').select('id, eligibility_status').eq('id', id).maybeSingle()
  if (!ben) return NextResponse.json({ error: 'נרשם לא נמצא' }, { status: 404 })
  if ((ben as { eligibility_status?: string }).eligibility_status === 'rejected') {
    return NextResponse.json({ error: 'עדכון פרטים אינו זמין עבור חשבון זה' }, { status: 403 })
  }

  const column = BIRTH_DATE_COLUMN[body.who]
  const { error } = await admin.from('beneficiaries')
    .update({ [column]: v.iso, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: 'שמירת התאריך נכשלה. נסו שוב.' }, { status: 500 })
  return NextResponse.json({ ok: true, who: body.who, birth_date: v.iso })
}
