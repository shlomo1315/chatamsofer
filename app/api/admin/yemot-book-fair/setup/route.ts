import { NextResponse } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { syncExtensionToYemot, yemotConfigured } from '@/lib/yemot'
import { buildExtIni } from '@/lib/yemotExtIni'
import { getPaymentSettings } from '@/lib/payments/settings'

// ─────────────────────────────────────────────────────────────────────────────
// הגדרת שלוחת היריד בימות — מהשרת, בלי לגעת בממשק ימות.
//
// 🔴 למה: "אין מספר מסוף" בטלפון. פקודת credit_card= שאנחנו שולחים
// תקינה, אבל ימות קוראת את פרטי הסליקה (סוג, מסוף, ApiValid, קטגוריה)
// מהגדרות השלוחה — ובלעדיהן היא עונה כך עוד לפני שהיא פונה לנדרים.
//
// ⚠️ ext.ini הוא קובץ ההגדרות של השלוחה בימות. העלאתו *יוצרת או
// מעדכנת* את השלוחה, ולכן זו הדרך להגדיר הכול מהשרת.
//
// ⚠️ ה-ApiValid נקרא מהגדרות התשלום שבמסד ואינו מוטמע בקוד: הוא סוד,
// והוא כבר מוזן במסך ההגדרות עבור ערוץ האתר.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EXT = process.env.YEMOT_BOOK_FAIR_EXT || '9'
const TERMINAL = '7004562'
const CATEGORY = 'צאצאי מרן החתם סופר'
/** מתי ההגדרה רצה — כדי שהמסך יסמן "מוגדר" גם אחרי רענון. */
const SETUP_KEY = 'yemot_book_fair_setup'

export async function POST() {
  if (!(await requireStaff(['admin']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }
  if (!yemotConfigured('bookFair')) {
    return NextResponse.json({ error: 'טוקן ימות של היריד אינו מוגדר' }, { status: 500 })
  }

  const settings = await getPaymentSettings()
  const apiValid = (settings.apiValid ?? '').trim()
  if (!apiValid) {
    return NextResponse.json(
      { error: 'ApiValid של נדרים אינו מוגדר — יש להזינו בהגדרות התשלום' },
      { status: 400 },
    )
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il'
  const token = process.env.YEMOT_WEBHOOK_SECRET ?? ''

  // ⚠️ ApiToken בתוך api_add_0 ולא בתוך api_link: ה-query של api_link
  // נאבד, והשלוחה קיבלה "אין הרשאה" בכל שיחה.
  const ini = buildExtIni({
    type: 'api',
    extra: {
      api_link: `${base}/api/webhooks/yemot-book-fair`,
      api_add_0: token ? `ApiToken=${token}` : '',
      api_url_post: 'yes',

      // ── סליקה ──
      credit_card_type: 'nedarim_plus',
      credit_card_terminal_number: TERMINAL,
      nedarim_plus_ApiValid: apiValid,
      credit_card_category_nedarim_plus: CATEGORY,
      credit_card_max_tashloumim: '1',
      credit_card_currency: '1',
      // ⚠️ לא מכבים take_id/take_cvv — כיבוי פוגע בסיכויי אישור העסקה.
      // מדלגים רק על ההקראה החוזרת, שמאריכה את השיחה בלי להוסיף דבר.
      say_digits_card: 'no',
      say_date_card: 'no',
      say_cvv_card: 'no',
    },
  })

  if (!ini) {
    return NextResponse.json({ error: 'בניית ההגדרות נכשלה' }, { status: 500 })
  }

  const r = await syncExtensionToYemot(`ivr2:/${EXT}/ext.ini`, ini, 'bookFair')
  if (!r.ok) {
    console.error('[yemot-book-fair/setup] הסנכרון נכשל:', r.error)
    return NextResponse.json({ error: `הסנכרון לימות נכשל: ${r.error}` }, { status: 502 })
  }

  // 🔴 נרשם במסד כדי שהמסך יסמן "מוגדר" גם אחרי רענון: בלי זה המנהל
  // אינו יודע אם ההגדרה כבר רצה, ולוחץ שוב "ליתר ביטחון".
  // ⚠️ app_settings.value היא עמודת text — תמיד JSON.stringify.
  const db = getServiceClient()
  if (db) {
    await db.from('app_settings').upsert({
      key: SETUP_KEY,
      value: JSON.stringify({ at: new Date().toISOString(), ext: EXT, terminal: TERMINAL }),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
  }

  // ⚠️ ה-ApiValid מוסתר מהתשובה — אין סיבה שיחזור למסך.
  console.log(`[yemot-book-fair/setup] ✅ שלוחה ${EXT} הוגדרה (מסוף ${TERMINAL})`)
  return NextResponse.json({
    ok: true,
    ext: EXT,
    terminal: TERMINAL,
    category: CATEGORY,
  })
}

/** מתי ההגדרה רצה לאחרונה — למסך. */
export async function GET() {
  if (!(await requireStaff(['admin']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ configured: false })

  const { data } = await db.from('app_settings')
    .select('value').eq('key', SETUP_KEY).maybeSingle()
  let info: { at?: string; terminal?: string } = {}
  try { info = JSON.parse(String(data?.value ?? '{}')) } catch { /* ריק */ }

  return NextResponse.json({
    configured: !!info.at,
    at: info.at ?? null,
    terminal: info.terminal ?? null,
  })
}
