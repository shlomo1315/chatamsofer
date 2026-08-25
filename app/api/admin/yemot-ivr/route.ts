import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import {
  getIvrConfig, saveIvrConfig, validateIvr, normalizeIvr,
  NODE_TYPE_LABEL, NODE_TYPE_HINT, VALID_DIGITS, type IvrConfig,
} from '@/lib/ivrBuilder'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

// ─────────────────────────────────────────────────────────────────────────────
// מבנה המערכת הטלפונית — טעינה ושמירה.
//
// ⚠️ אין middleware בפרויקט — כל ראוט מגן על עצמו.
// 🔒 מנהל בלבד: שינוי המבנה משנה את מה שכל מתקשר שומע.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * כתובת הווהבוק להדבקה בימות.
 *
 * ⚠️ נגזרת מהבקשה ולא ממשתנה סביבה: היא חייבת להיות הכתובת שהמנהל
 * באמת גולש אליה, אחרת הוא ידביק בימות כתובת שאינה עונה.
 */
function webhookUrl(request: NextRequest): string {
  const envBase = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
  if (envBase) return `${envBase}/api/webhooks/yemot`
  const host = request.headers.get('host') ?? 'chasamsofer.co.il'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  return `${proto}://${host}/api/webhooks/yemot`
}

export async function GET(request: NextRequest) {
  if (!(await requireStaff(['admin']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403, headers: NO_STORE })
  }

  const config = await getIvrConfig()
  return NextResponse.json({
    config,
    problems: validateIvr(config),
    webhookUrl: webhookUrl(request),
    // ⚠️ המילון נשלח מהשרת ולא משוכפל בלקוח: תווית שנוספת לסוג חדש
    // חייבת להופיע בשני המקומות, ועותק שני היה נשאר מאחור.
    typeLabels: NODE_TYPE_LABEL,
    typeHints: NODE_TYPE_HINT,
    validDigits: VALID_DIGITS,
    // האם הטוקן מוגדר — בלעדיו ימות לא תוכל לקרוא לווהבוק.
    tokenSet: Boolean(process.env.YEMOT_API_TOKEN || process.env.YEMOT_TOKEN),
  }, { headers: NO_STORE })
}

export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }

  let body: { config?: IvrConfig }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  if (!body.config || typeof body.config !== 'object') {
    return NextResponse.json({ error: 'חסר מבנה' }, { status: 400 })
  }

  const res = await saveIvrConfig(body.config)
  if (!res.ok) {
    return NextResponse.json({ error: res.error ?? 'שמירה נכשלה' }, { status: 400 })
  }

  // ⚠️ מוחזר המבנה המנורמל ולא זה שנשלח: הלקוח חייב להציג בדיוק את מה
  // שנשמר, אחרת המסך מראה שדות שלא שרדו את הנרמול.
  const saved = normalizeIvr(body.config)
  return NextResponse.json({ ok: true, config: saved, problems: validateIvr(saved) })
}
