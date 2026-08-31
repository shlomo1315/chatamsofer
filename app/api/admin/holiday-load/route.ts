import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { eligibleForLoad, runLoadBatch, DEFAULT_LOAD_AMOUNT } from '@/lib/holidayCardLoad'
import { resolveTestMode } from '@/lib/holidayTestMode'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// טעינת 500₪ לכרטיסי החגים.
//
// 🔴 רצה **רק** מכפתור מפורש. אין Cron ואין הפעלה אוטומטית — זו פעולה
// כספית על כרטיסים אמיתיים.
//
// 🔴 GET מחזיר תצוגה מקדימה בלבד ואינו נוגע בכלום. POST דורש confirm:true
// מפורש: בקשה בלי האישור נדחית, כדי שקריאה מקרית לא תטען כסף.
// ─────────────────────────────────────────────────────────────────────────────

interface Ben {
  id_number: string | null
  family_name: string | null
  full_name: string | null
  /** ⚠️ להקמת המשפחה בנדרים בלבד — ראו LoadTarget. */
  spouse_id_number: string | null
  phone: string | null
  phone2: string | null
  email: string | null
  address: string | null
  city: string | null
}

/**
 * ⚠️ beneficiary מגיע כמערך: Supabase מסיק כך מכל יחס join, גם כשהוא
 * יחיד בפועל. טיפוס אובייקט בודד נכשל בקומפילציה, ו-[0] בזמן ריצה
 * מחזיר undefined בשקט אם מתייחסים אליו כאובייקט.
 */
interface Row {
  id: string
  approval_status: string | null
  load_status: string | null
  /** 🔴 טעינה רק למי שבחר מוקד — ראו eligibleForLoad. */
  center_id: string | null
  beneficiary: Ben | Ben[] | null
}

const firstBen = (b: Row['beneficiary']): Ben | null =>
  Array.isArray(b) ? (b[0] ?? null) : b

/** ⚠️ fetchAllRows: תקרת 1,000 השקטה הייתה חותכת את הרשימה בשקט. */
async function loadRows(
  db: NonNullable<ReturnType<typeof getServiceClient>>,
  distributionId: string,
) {
  const { rows } = await fetchAllRows<Row>((from, to) => db
    .from('distribution_recipients')
    // ⚠️ השדות הנוספים נדרשים *רק* להקמת המשפחה בנדרים כשאינה קיימת שם:
    // לקוח שמוקם בלי טלפון וכתובת אינו שמיש למוקד החלוקה.
    .select('id, approval_status, load_status, center_id, beneficiary:beneficiaries(id_number, spouse_id_number, family_name, full_name, phone, phone2, email, address, city)')
    .eq('distribution_id', distributionId)
    .range(from, to))

  return rows.map(r => {
    const b = firstBen(r.beneficiary)
    return {
      id: r.id,
      approval_status: r.approval_status,
      load_status: r.load_status,
      center_id: r.center_id,
      id_number: b?.id_number ?? null,
      name: [b?.family_name, b?.full_name].filter(Boolean).join(' ') || 'ללא שם',
      spouse_id_number: b?.spouse_id_number ?? null,
      family_name: b?.family_name ?? null,
      full_name: b?.full_name ?? null,
      phone: b?.phone ?? null,
      phone2: b?.phone2 ?? null,
      email: b?.email ?? null,
      address: b?.address ?? null,
      city: b?.city ?? null,
    }
  })
}

/** תצוגה מקדימה — כמה ייטענו, כמה כבר נטענו, וכמה כסף מדובר. */
export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const distributionId = request.nextUrl.searchParams.get('distribution_id') ?? ''
  if (!distributionId) return NextResponse.json({ error: 'חסר מזהה חלוקה' }, { status: 400 })

  const amount = Number(request.nextUrl.searchParams.get('amount') ?? DEFAULT_LOAD_AMOUNT)

  const rows = await loadRows(db, distributionId)
  const targets = eligibleForLoad(rows)

  // ⚠️ מדווח כבר בתצוגה המקדימה: מנהל שלוחץ "טען" בלי לדעת שהחלוקה
  // במצב בדיקה מקבל "נטענו X" ומניח שהעבודה נגמרה.
  const { data: preRow } = await db.from('distributions')
    .select('test_mode, test_email').eq('id', distributionId).maybeSingle()
  const preTest = resolveTestMode(preRow as { test_mode?: boolean | null; test_email?: string | null } | null)

  return NextResponse.json({
    amount,
    testMode: preTest.active,
    testEmail: preTest.email,
    eligible: targets.length,
    // 🔴 מי בדיוק ייטען — ולא רק כמה.
    //
    // ⚠️ מספר לבדו אינו ניתן לבדיקה: "ייטענו 340" אינו מאפשר לוודא
    // שמשפחה מסוימת נכללת, או שמישהו שלא אמור להיטען אינו ברשימה.
    // זו פעולה כספית, והרשימה היא מה שמאפשר לאשר אותה בעיניים פקוחות.
    //
    // ⚠️ מוגבל ל-500 שמות: רשימה של אלפי שורות מנפחת את התשובה בלי
    // להוסיף ודאות. המונה למעלה תמיד מלא.
    eligibleList: targets.slice(0, 500).map(t => ({
      id: t.recipientId,
      name: t.name,
      idNumber: t.idNumber,
    })),
    eligibleListTruncated: targets.length > 500,
    total: amount * targets.length,
    alreadyLoaded: rows.filter(r => r.load_status === 'loaded').length,
    failed: rows.filter(r => r.load_status === 'failed').length,
    // ⚠️ מדווח במפורש מי *לא* ייטען ולמה — אחרת ההפרש בין המספרים נראה
    // כתקלה, והמשתמש אינו יודע שחסרה ת"ז או אישור.
    skipped: {
      notApproved: rows.filter(r => r.approval_status !== 'approved').length,
      noId: rows.filter(r => r.approval_status === 'approved' && !(r.id_number ?? '').trim()).length,
      // 🔴 מאושרים שטרם בחרו מוקד — הקבוצה שממתינה, ולא כשל.
      //
      // ⚠️ בלי המספר הזה ההפרש בין "6,050 מאושרים" ל"340 ייטענו" נראה
      // כתקלה. הוא בדיוק הנתון שאתה צריך כדי להחליט מתי להריץ שוב.
      noCenter: rows.filter(r =>
        r.approval_status === 'approved' && !!(r.id_number ?? '').trim()
        && r.load_status !== 'loaded' && !r.center_id).length,
    },
  })
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as {
    distribution_id?: string; amount?: number; confirm?: boolean; ids?: string[]
  }

  // 🔴 שער האישור. בלי confirm מפורש — לא נטען דבר.
  if (!body.confirm) {
    return NextResponse.json({ error: 'נדרש אישור מפורש לטעינה' }, { status: 400 })
  }

  const distributionId = String(body.distribution_id ?? '')
  if (!distributionId) return NextResponse.json({ error: 'חסר מזהה חלוקה' }, { status: 400 })

  const amount = Number(body.amount ?? DEFAULT_LOAD_AMOUNT)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  }

  // ⚠️ תוקף הכרטיס נלקח *מהחלוקה* ולא מהגדרה גלובלית: כל חג נפרק במועד
  // אחר, והגדרה משותפת הייתה נכונה לחלוקה אחת ושגויה לכל השאר.
  const { data: distRow } = await db.from('distributions')
    .select('card_expiry, test_mode, test_email').eq('id', distributionId).maybeSingle()
  const dist = distRow as { card_expiry?: string | null; test_mode?: boolean | null; test_email?: string | null } | null
  const expiryIso = dist?.card_expiry ?? null
  // 🔴 מצב בדיקה נקרא *מהחלוקה* ולא מגוף הבקשה: לקוח לא יכול לבקש
  // "אל תטען באמת", וגם לא להפך — לכפות טעינה אמיתית על חלוקת בדיקה.
  const testMode = resolveTestMode(dist)

  const rows = await loadRows(db, distributionId)
  // ⚠️ בחירה חלקית (ids) מסוננת *אחרי* אותם כללי זכאות — לא במקומם.
  const scoped = body.ids?.length ? rows.filter(r => body.ids!.includes(r.id)) : rows
  const targets = eligibleForLoad(scoped)

  if (!targets.length) {
    return NextResponse.json({ ok: true, attempted: 0, loaded: 0, failed: 0, note: 'אין מי לטעון' })
  }

  console.log(`[holiday-load] מתחיל: ${targets.length} משפחות × ${amount}₪ · ${staff.email ?? ''}`)

  // מסמנים 'pending' לפני היציאה — כך המסך מראה מה בתהליך גם אם נפל באמצע.
  //
  // 🔴 לא במצב בדיקה: שם אין טעינה אמיתית, ושורה שנשארה 'pending' אחרי
  // בדיקה נראית כטעינה שרצה ונתקעה — ואיש לא ינסה אותה שוב. המשפחה
  // הייתה נשארת בלי כסף בכרטיס בלי שום סימן.
  if (!testMode.active) {
    await db.from('distribution_recipients')
      .update({ load_status: 'pending', load_error: null })
      .in('id', targets.map(t => t.recipientId))
  }

  try {
    const summary = await runLoadBatch(db, targets, amount, { delayMs: 120, expiryIso, testMode: testMode.active })
    // ⚠️ testMode מוחזר במפורש: בלעדיו המסך היה מציג "נטענו 40 כרטיסים"
    // בלי שום רמז שלא יצא שקל, וזו בדיוק ההודעה שגורמת לחשוב שהעבודה נגמרה.
    return NextResponse.json({
      ok: true, ...summary, outcomes: undefined,
      failedList: summary.outcomes.filter(o => !o.ok),
      testMode: testMode.active,
      testEmail: testMode.email,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'תקלה'
    console.error('[holiday-load] נכשל:', msg)
    // ⚠️ מנקים את ה-pending: שורה שנתקעה ב'בתהליך' לנצח נראית כאילו
    // הטעינה עדיין רצה, ואיש לא ינסה שוב.
    await db.from('distribution_recipients')
      .update({ load_status: 'failed', load_error: msg })
      .in('id', targets.map(t => t.recipientId)).eq('load_status', 'pending')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
