// כלי אבחון (מנהל בלבד) — שיחת קוד האימות "מתקשרת ומתנתקת מיד כשעונים" (29.10).
//
// 🔴 למה זה קיים: RunCampaign מחזיר OK — החיוג יוצא, והניתוק קורה בתוך ימות.
// yemot-otp-test אינו מחזיר את campaignId, ובלעדיו אי אפשר לשלוף את דוח
// השיחה ולראות את סיבת הניתוק. כאן מוחזרת התשובה הגולמית של ימות + הסטטוס
// והדוח של אותו קמפיין, אחרי המתנה לסיום השיחה.
//
// GET — קריאה בלבד: GetSession + התבנית שמוגדרת ב-YEMOT_OTP_TEMPLATE_ID.
// POST {"phone","templateId?","callerId?","text?","ttsMode?"} — שיחה אחת בדיוק,
// ברירות המחדל זהות ל-placeCodeCall (קוד דמה 123456). הדריסות מאפשרות לבודד
// אם הבעיה בתבנית, במחייג או ב-TTS.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { spokenCode } from '@/lib/yemotCall'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const YEMOT_API = 'https://www.call2all.co.il/ym/api'

async function call(method: string, params: Record<string, string>) {
  try {
    const res = await fetch(`${YEMOT_API}/${method}`, { method: 'POST', body: new URLSearchParams(params), cache: 'no-store' })
    const text = await res.text()
    try { return { http: res.status, json: JSON.parse(text) } } catch { return { http: res.status, text: text.slice(0, 4000) } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 })
  const token = process.env.YEMOT_TOKEN
  const templateId = process.env.YEMOT_OTP_TEMPLATE_ID
  if (!token) return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר' }, { status: 500 })

  const session = await call('GetSession', { token })
  const templates = await call('GetTemplates', { token })
  const list = ('json' in templates ? templates.json?.templates : null) ?? []
  const otpTemplate = (list as { templateId: number }[]).find(t => String(t.templateId) === String(templateId)) ?? null
  return NextResponse.json({
    templateId: templateId ?? null,
    callerIdEnv: process.env.YEMOT_OTP_CALLER_ID ?? null,
    digitSepEnv: process.env.YEMOT_OTP_DIGIT_SEP ?? null,
    otpTemplate,
    session,
  })
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 })
  const token = process.env.YEMOT_TOKEN
  if (!token) return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const tel = String(body.phone ?? '').replace(/\D/g, '')
  if (tel.length < 9) return NextResponse.json({ error: 'מספר טלפון לא תקין' }, { status: 400 })

  const params: Record<string, string> = {
    token,
    templateId: String(body.templateId ?? process.env.YEMOT_OTP_TEMPLATE_ID ?? ''),
    phones: JSON.stringify({ [tel]: String(body.text ?? spokenCode('123456')) }),
    ttsMode: String(body.ttsMode ?? '1'),
    withSMS: '0',
  }
  const callerId = String(body.callerId ?? process.env.YEMOT_OTP_CALLER_ID ?? '023131325')
  if (callerId) params.callerId = callerId
  // פרמטרים נוספים ל-RunCampaign לניסוי (למשל playPrivateMsg=1) — בלי לדרוס את הטוקן
  if (body.extra && typeof body.extra === 'object') {
    for (const [k, v] of Object.entries(body.extra as Record<string, unknown>)) {
      if (k !== 'token') params[k] = String(v)
    }
  }

  const run = await call('RunCampaign', params)
  const j = ('json' in run ? run.json : null) as { campaignId?: unknown; campaign?: { campaignId?: unknown } } | null
  const id = String(j?.campaignId ?? j?.campaign?.campaignId ?? '')

  // ממתינים שהשיחה תסתיים (חיוג + מענה + ניתוק) ואז שולפים את הדוח
  await new Promise(r => setTimeout(r, Number(body.waitMs ?? 40_000)))
  const [status, report, download] = id
    ? await Promise.all([
        call('GetCampaignStatus', { token, campaignId: id }),
        call('GetCampaignReport', { token, campaignId: id }),
        call('DownloadCampaignReport', { token, campaignId: id }),
      ])
    : [null, null, null]

  const { token: _t, ...sent } = params
  void _t
  return NextResponse.json({ sent, run, campaignId: id || null, status, report, download })
}
