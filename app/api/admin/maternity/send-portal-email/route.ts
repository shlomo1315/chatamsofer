import { NextResponse, type NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { portalCredentialsEmail } from '@/lib/emailTemplates'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'

export const dynamic = 'force-dynamic'

const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

// שליחת פרטי הכניסה לפורטל בית ההחלמה במייל — קובע/מעדכן את הסיסמה ושולח מייל מעוצב.
export async function POST(request: NextRequest) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  let body: { home?: string; email?: string; password?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const home = (body.home ?? '').trim()
  const email = (body.email ?? '').trim()
  const password = String(body.password ?? '')
  if (!home) return NextResponse.json({ error: 'חסר שם בית החלמה' }, { status: 400 })
  if (!isEmail(email)) return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
  if (password.length < 10) return NextResponse.json({ error: 'הסיסמה חייבת להכיל לפחות 10 תווים' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  // אימות שבית ההחלמה קיים
  const { data: exists } = await admin.from('recovery_homes').select('name').eq('name', home).maybeSingle()
  if (!exists) return NextResponse.json({ error: 'בית החלמה לא נמצא' }, { status: 404 })

  // קביעת/עדכון הסיסמה (hash) + שמירת המייל לבית ההחלמה
  const hash = await bcrypt.hash(password, 10)
  const { error: pErr } = await admin.from('recovery_portals').upsert(
    { home_name: home, password: hash, updated_at: new Date().toISOString() }, { onConflict: 'home_name' },
  )
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  await admin.from('recovery_homes').update({ report_email: email }).eq('name', home).then(undefined, () => {})

  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '')
  const portalUrl = `${base}/portal/maternity/${encodeURIComponent(home)}`
  const mail = portalCredentialsEmail({
    title: `פורטל בית ההחלמה — ${home}`,
    intro: `להלן פרטי הכניסה לפורטל בית ההחלמה "${home}". בפורטל ניתן לצפות ברשימת היולדות הזכאיות, לסמן הגעה ולעדכן פרטי שהייה.`,
    portalUrl, password, username: home, usernameLabel: 'בית החלמה',
  })

  const res = await deliverMail(email, mail.subject, mail.html, undefined, mailFor('maternity'))
  if (!res || !res.ok) return NextResponse.json({ error: 'שליחת המייל נכשלה. נסו שוב.' }, { status: 502 })

  return NextResponse.json({ ok: true })
}
