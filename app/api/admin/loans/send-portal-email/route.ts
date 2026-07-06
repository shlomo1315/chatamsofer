import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { setPortalPassword } from '@/lib/loansPortalAuth'
import { portalCredentialsEmail } from '@/lib/emailTemplates'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'

export const dynamic = 'force-dynamic'

const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

// שליחת פרטי הכניסה לפורטל ביצוע ההלוואות במייל — קובע/מעדכן את הסיסמה ושולח מייל מעוצב.
export async function POST(request: NextRequest) {
  if (!(await requirePermission('loans', 'edit'))) return forbidden()

  let body: { email?: string; password?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const email = (body.email ?? '').trim()
  const password = String(body.password ?? '')
  if (!isEmail(email)) return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'הסיסמה חייבת להכיל לפחות 8 תווים' }, { status: 400 })

  // קביעת/עדכון סיסמת הפורטל (hash)
  await setPortalPassword(password)

  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '')
  const portalUrl = `${base}/shared/loans`
  const mail = portalCredentialsEmail({
    title: 'פורטל ביצוע הלוואות',
    intro: 'להלן פרטי הכניסה לפורטל ביצוע ההלוואות. בפורטל ניתן לצפות בהלוואות שאושרו ולסמן ביצוע/העברה בפועל.',
    portalUrl, password,
  })

  const res = await deliverMail(email, mail.subject, mail.html, undefined, mailFor('gemach'))
  if (!res || !res.ok) return NextResponse.json({ error: 'שליחת המייל נכשלה. נסו שוב.' }, { status: 502 })

  return NextResponse.json({ ok: true })
}
