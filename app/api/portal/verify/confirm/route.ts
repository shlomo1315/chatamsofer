// אימות הקוד שנשלח (verify/send). בהצלחה מחזיר אסימון חתום המוכיח שהערוץ אומת,
// אותו צד-הלקוח שולח בעת רישום / עדכון פרטים. הקוד נצרך (נמחק) בהצלחה.
import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { verifyCode } from '@/lib/portalPassword'
import { createVerifyToken, normalizeVerifyValue, type VerifyChannel } from '@/lib/verifyToken'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let body: { channel?: string; value?: string; code?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const channel = body.channel === 'phone' ? 'phone' : body.channel === 'email' ? 'email' : null
  const raw = String(body.value ?? '').trim()
  const code = String(body.code ?? '').replace(/\D/g, '')
  if (!channel || !raw || !code) return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })

  if (!rateLimit(`verify-confirm-ip:${clientIp(request)}`, 30, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }, { status: 429 })
  }

  const value = normalizeVerifyValue(channel as VerifyChannel, raw)
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const key = `verify:${channel}:${value}`
  const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle()
  if (!data?.value) return NextResponse.json({ error: 'לא נמצא קוד פעיל. שלחו קוד חדש.' }, { status: 400 })

  let rec: { hash?: string; expires?: number; attempts?: number }
  try { rec = JSON.parse(data.value) } catch { return NextResponse.json({ error: 'קוד לא תקין. שלחו קוד חדש.' }, { status: 400 }) }

  if (!rec.expires || Date.now() > rec.expires) {
    await admin.from('app_settings').delete().eq('key', key)
    return NextResponse.json({ error: 'הקוד פג תוקף. שלחו קוד חדש.' }, { status: 400 })
  }
  if ((rec.attempts ?? 0) >= 5) {
    await admin.from('app_settings').delete().eq('key', key)
    return NextResponse.json({ error: 'יותר מדי ניסיונות שגויים. שלחו קוד חדש.' }, { status: 400 })
  }

  const ok = await verifyCode(code, rec.hash)
  if (!ok) {
    await admin.from('app_settings').upsert(
      { key, value: JSON.stringify({ ...rec, attempts: (rec.attempts ?? 0) + 1 }), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    return NextResponse.json({ error: 'קוד שגוי. נסו שוב.' }, { status: 400 })
  }

  await admin.from('app_settings').delete().eq('key', key)
  return NextResponse.json({ ok: true, token: createVerifyToken(channel as VerifyChannel, raw) })
}
