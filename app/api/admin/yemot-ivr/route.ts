import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { yemotConfigured, syncExtensionToYemot } from '@/lib/yemot'
import { buildExtIni, extIniPath } from '@/lib/yemotExtIni'
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

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 סנכרון השלוחות לימות — בכל שמירה.
  //
  // המנהל אינו נוגע בימות: הוא בוחר "תא קולי", ממלא כתובת מייל,
  // ולוחץ שמור — והשלוחה נוצרת שם בפועל.
  //
  // ⚠️ בכל שמירה ולא רק ביצירה: המנהל שמשנה כתובת מייל מצפה שזה
  // ייכנס לתוקף, ו-ext.ini שנשאר מאחור היה שולח לכתובת הישנה.
  //
  // ⚠️ כשל בסנכרון **אינו מפיל את השמירה**: המבנה שלנו כבר נשמר
  // ותקין, וימות עלולה להיות זמנית לא זמינה. הכשלים מוחזרים למסך
  // כדי שהמנהל יידע — שקט כאן פירושו שלוחה שמשמיעה שקט בטלפון.
  // ─────────────────────────────────────────────────────────────────────────
  const syncErrors: { name: string; error: string }[] = []
  if (yemotConfigured()) {
    for (const node of saved.nodes) {
      if (node.type !== 'raw' || !node.yemotType) continue
      const path = extIniPath(node.folder)
      if (!path) {
        syncErrors.push({ name: node.name, error: 'מספר שלוחה לא תקין' })
        continue
      }
      const ini = buildExtIni({ type: node.yemotType, extra: node.yemotFields })
      if (!ini) {
        syncErrors.push({ name: node.name, error: 'סוג שלוחה לא מוכר' })
        continue
      }
      const r = await syncExtensionToYemot(path, ini)
      if (!r.ok) syncErrors.push({ name: node.name, error: r.error ?? 'הסנכרון נכשל' })
    }
  }

  return NextResponse.json({
    ok: true, config: saved, problems: validateIvr(saved),
    // ⚠️ נשלח תמיד, גם ריק: המסך מבחין בין "לא סונכרן" לבין "סונכרן בהצלחה".
    syncErrors,
    yemotConnected: yemotConfigured(),
  })
}
