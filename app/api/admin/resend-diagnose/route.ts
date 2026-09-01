// ─────────────────────────────────────────────────────────────────────────────
// אבחון Resend — ניתוב נכנס ואירועי webhook. קריאה בלבד.
//
// 🔴 שתי תקלות שקטות שהכלי הזה נועד לחשוף, כי אף אחת מהן אינה מייצרת
// שגיאה בשום מקום:
//
//   1. תיבה שאין לה כלל ניתוב Inbound. המייל פשוט לא מגיע, ההגדרות
//      במסך נראות תקינות, והמענה האוטומטי "לא עובד" — בזמן שלא היה
//      למה להשיב מלכתחילה.
//
//   2. webhook שמנוי רק על חלק מהאירועים. delivered נרשם ו-opened/
//      clicked לעולם לא, כך שכל הקמפיינים מציגים 0% פתיחות לנצח
//      ונראה כאילו איש אינו פותח את הדואר.
//
// ⚠️ resend-domains הקיים בודק DNS בלבד ואינו רואה אף אחת מהשתיים.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

const NEEDED_EVENTS = [
  'email.sent', 'email.delivered', 'email.opened',
  'email.clicked', 'email.bounced', 'email.complained',
]

async function api(key: string, path: string) {
  const r = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  const body = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, body }
}

export async function GET() {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 })

  const key = process.env.RESEND_API_KEY
  if (!key) return NextResponse.json({ error: 'RESEND_API_KEY אינו מוגדר' }, { status: 500 })

  // ── ניתוב נכנס ──
  const inbound = await api(key, '/inbound-endpoints')
  const rawIn = inbound.body?.data
  const endpoints: Record<string, unknown>[] =
    Array.isArray(rawIn) ? rawIn : Array.isArray(rawIn?.data) ? rawIn.data : []

  // ── webhooks ──
  const hooks = await api(key, '/webhooks')
  const rawWh = hooks.body?.data
  const webhooks: Record<string, unknown>[] =
    Array.isArray(rawWh) ? rawWh : Array.isArray(rawWh?.data) ? rawWh.data : []

  const webhookReport = webhooks.map(w => {
    const events = (w.events ?? []) as string[]
    return {
      endpoint: w.endpoint ?? w.url ?? null,
      status: w.status ?? null,
      events,
      // 🔴 השורה שמסבירה "אין נתוני פתיחות": האירוע פשוט לא מנוי.
      missing: NEEDED_EVENTS.filter(e => !events.includes(e)),
      tracksOpens: events.includes('email.opened'),
      tracksClicks: events.includes('email.clicked'),
    }
  })

  return NextResponse.json({
    ok: true,
    inbound: {
      supported: inbound.ok,
      note: inbound.ok ? null : `Resend החזיר ${inbound.status} — ייתכן שהניתוב הנכנס מוגדר בלוח הבקרה בלבד`,
      endpoints: endpoints.map(e => ({
        address: e.address ?? e.email ?? e.name ?? null,
        destination: e.endpoint ?? e.url ?? null,
        status: e.status ?? null,
      })),
    },
    webhooks: webhookReport,
    // ⚠️ הסיכום נועד להיקרא בלי לפרש JSON: זו בדיוק השאלה שנשאלה.
    summary: {
      anyWebhookTracksOpens: webhookReport.some(w => w.tracksOpens),
      anyWebhookTracksClicks: webhookReport.some(w => w.tracksClicks),
      inboundAddresses: endpoints.map(e => String(e.address ?? e.email ?? '')).filter(Boolean),
    },
  })
}
