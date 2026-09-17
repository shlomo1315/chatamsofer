// ─────────────────────────────────────────────────────────────────────────────
// בדיקת צלב: מי שמסומן 'loaded' אצלנו — האם באמת יש לו תלוש בנדרים.
//
// 🔴 למה זה נחוץ: load_status אינו אמין כהוכחה שהכסף יצא. ב-17.09 נמצאו
// 4 משפחות (בראנדער, קליין נחום יואל, שווארץ, שטרן מאיר) שסומנו 'loaded'
// ללא שגיאה — ובנדרים לא היה להן תלוש כלל. הן הסתובבו עם כרטיס ריק ונדחו
// בקופה ב"אין תלושים זמינים למימוש בכרטיס זה", אחת מהן פעמיים ביומיים.
// השורש היה כרטסת כפולה בדרכונים (ראו saveClientCard/Tsad3Id), אבל התסמין
// עלול לחזור מכל כשל שמתרחש בין AddTlush לכתיבת load_status.
//
// 🔴 קריאה בלבד — GetClientCard בלבד. אין כאן AddTlush, אין תיקון
// אוטומטי: טעינה היא פעולה כספית והיא נעשית בהחלטת אדם. הנקודה הזו
// *מדווחת* ולא מתקנת.
//
// ⚠️ מוגן ב-CRON_SECRET ונכשל-סגור, כמו שאר נקודות ה-cron. נדרים גם
// מגבילה את המפתח לפי IP, ולכן הבדיקה מתאפשרת רק מהשרת.
//
// ⚠️ קצב מבוקר (SPACING_MS) ותקרת ?limit=: נדרים איימו בחסימה על ~3,000
// פניות בשעה, ובדיקה של 4,100 כרטסות בלי מרווח הייתה חוזרת לשם בדיוק.
// ברירת המחדל בודקת מנה אחת; ?offset= ממשיך מהנקודה הבאה.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse, type NextRequest } from 'next/server'
import { verifyCronSecret, getServiceClient } from '@/lib/apiAuth'
import { getHolidayNedarimCreds, getClientCardFull } from '@/lib/nedarim'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** מרווח בין קריאות לנדרים. ⚠️ אל תקטין — ראו אזהרת הקצב למעלה. */
const SPACING_MS = 150
const DEFAULT_LIMIT = 400

interface Row {
  id: string
  card_number: string | null
  loaded_at: string | null
  amount: number | null
  beneficiaries: {
    id_number: string | null
    family_name: string | null
    full_name: string | null
    nedarim_id_holiday: string | null
  } | null
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const okToken = verifyCronSecret(request) || sp.get('token') === process.env.CRON_SECRET
  if (!process.env.CRON_SECRET || !okToken) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })
  const creds = await getHolidayNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'לא הוגדרו הרשאות נדרים לחגים' }, { status: 400 })

  const limit = Math.min(Math.max(Number(sp.get('limit')) || DEFAULT_LIMIT, 1), 1000)
  const offset = Math.max(Number(sp.get('offset')) || 0, 0)

  // ⚠️ range ולא .limit(): מעל 1000 שורות .limit() נחתך בשקט (db-max-rows).
  const { data, error, count } = await db
    .from('distribution_recipients')
    .select(
      'id, card_number, loaded_at, amount,'
      + ' beneficiaries!inner(id_number, family_name, full_name, nedarim_id_holiday)',
      { count: 'exact' },
    )
    .eq('load_status', 'loaded')
    .not('beneficiaries.nedarim_id_holiday', 'is', null)
    .order('loaded_at', { ascending: true })
    .range(offset, offset + limit - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as unknown as Row[]

  const empty: Record<string, unknown>[] = []
  const unreadable: Record<string, unknown>[] = []
  let withTlush = 0
  let withoutLimit = 0

  for (const r of rows) {
    const b = r.beneficiaries
    const clientId = b?.nedarim_id_holiday
    if (!clientId) continue

    let card: Record<string, unknown> | null = null
    try {
      card = (await getClientCardFull(creds, clientId)) as Record<string, unknown> | null
    } catch {
      card = null
    }

    if (!card) {
      unreadable.push({ clientId, name: `${b?.family_name ?? ''} ${b?.full_name ?? ''}`.trim() })
      await new Promise(res => setTimeout(res, SPACING_MS))
      continue
    }

    // ⚠️ פריט יחיד מוחזר כאובייקט ולא כמערך באורך 1 — ראו countHolidayLoads.
    const raw = (card as { Tlushim?: unknown }).Tlushim
    const tlushim = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : []

    if (tlushim.length === 0) {
      // 🔴 זה הממצא: אצלנו 'loaded', בנדרים אין תלוש. הכרטיס ריק.
      empty.push({
        recipientId: r.id,
        clientId,
        name: `${b?.family_name ?? ''} ${b?.full_name ?? ''}`.trim(),
        idNumber: b?.id_number ?? null,
        cardNumber: r.card_number,
        loadedAt: r.loaded_at,
        amount: r.amount,
        balance: String((card as { TotalFreeAmount?: unknown }).TotalFreeAmount ?? ''),
        declines: Array.isArray((card as { Siruvim?: unknown }).Siruvim)
          ? ((card as { Siruvim: unknown[] }).Siruvim).length : 0,
      })
    } else {
      withTlush++
      // ⚠️ לדיווח בלבד: תלושים מלפני הגדרת קבוצה 862 יצאו בלי הגבלת חנויות.
      const anyLimited = (tlushim as Record<string, unknown>[])
        .some(t => String(t.LimitedStores ?? '').trim())
      if (!anyLimited) withoutLimit++
    }

    await new Promise(res => setTimeout(res, SPACING_MS))
  }

  const nextOffset = offset + rows.length
  const total = count ?? null
  return NextResponse.json({
    checked: rows.length,
    offset,
    nextOffset: total != null && nextOffset < total ? nextOffset : null,
    total,
    withTlush,
    withoutStoreLimit: withoutLimit,
    emptyCount: empty.length,
    unreadableCount: unreadable.length,
    // 🔴 הרשימה המלאה — אלה המשפחות שמחזיקות כרטיס בלי כסף.
    empty,
    unreadable,
  })
}
