import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { deadlineState } from '@/lib/centerDeadline'
import {
  evaluatePick, groupByRegion, centerLabel, pickMessage,
  FINAL_WARNING, REGIONS, type CenterRow,
} from '@/lib/holidayCenterPick'
import { loadOpenCenters } from '@/lib/holidayCenterIvr'
import { citiesByNumber } from '@/lib/holidayCityMenu'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// בחירת מוקד חלוקה מהממשק הדיגיטלי.
//
// 🔴 אותם כללים בדיוק כמו בשלוחה — evaluatePick משותפת לשניהם. שני ערוצים
// שכל אחד אוכף כללים משלו נפרדים ברגע שמשנים אחד מהם, והמשפחה מגלה
// שהטלפון מאפשר מה שהמסך חוסם.
//
// 🔴 הרשומה נקשרת לסשן הפורטל, ולא נלקחת מהפרמטר כמות שהיא.
//
// ⚠️ קודם היה כתוב כאן "אין כאן אימות משלנו — הוא נעשה במסלול הכניסה
// לפורטל". זה לא היה נכון: recipient_id הגיע מהבקשה, והנתיב פנה איתו
// דרך service client שעוקף RLS. מי שהחזיק מזהה של משפחה אחרת יכול היה
// לקרוא את המוקד שלה — וגרוע מכך, *לקבוע לה* מוקד. הקביעה ננעלת
// לצמיתות (`.is('center_id', null)`), והמשפחה הייתה מגיעה לעיר הלא נכונה
// בלי שום דרך לתקן.
//
// ⚠️ מזהה שאינו ניתן לניחוש אינו הרשאה. הוא מגיע ללוגים, להיסטוריית
// דפדפן ולשיתופי מסך — ומרגע שדלף הוא הופך לגישת כתיבה.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * מאתר את רשומת החלוקה ומוודא שהיא של המשפחה המחוברת.
 *
 * ⚠️ ההשוואה היא מול beneficiary_id שבסשן החתום — אותו דפוס בדיוק
 * שנעשה ב-holiday-voucher ובשאר נתיבי הפורטל.
 */
async function loadOwnRecipient(
  db: NonNullable<ReturnType<typeof getServiceClient>>,
  request: NextRequest,
  recipientId: string,
) {
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId) return { error: 'נדרש אימות', status: 401 as const, rec: null }

  const { data } = await db.from('distribution_recipients')
    .select('id, center_id, distribution_id, approval_status, beneficiary_id')
    .eq('id', recipientId).maybeSingle()
  const rec = data as {
    id: string; center_id: string | null; distribution_id: string
    approval_status: string | null; beneficiary_id: string | null
  } | null

  // ⚠️ אותה תשובה בדיוק לרשומה שאינה קיימת ולרשומה של משפחה אחרת:
  // הבחנה ביניהן הייתה הופכת את הנתיב לכלי לגילוי מזהים תקפים.
  if (!rec || rec.beneficiary_id !== sessionId) {
    return { error: 'הרשומה לא נמצאה', status: 404 as const, rec: null }
  }
  return { error: null, status: 200 as const, rec }
}

/** החלוקה האחרונה. ⚠️ distributions ולא holiday_distributions — ראו FK. */
async function latestDistribution(db: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { data } = await db.from('distributions')
    .select('id, centers_open, centers_deadline')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data as { id: string; centers_open: boolean; centers_deadline: string | null } | null
}

export async function GET(request: NextRequest) {
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const recipientId = request.nextUrl.searchParams.get('recipient_id') ?? ''
  if (!recipientId) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const dist = await latestDistribution(db)
  if (!dist) return NextResponse.json({ open: false, centers: [] })

  // ⚠️ approval_status נשלף במפורש — הוא שער הבחירה, לא קישוט.
  // 🔒 הקשירה לסשן — ראו loadOwnRecipient.
  const own = await loadOwnRecipient(db, request, recipientId)
  if (!own.rec) return NextResponse.json({ error: own.error }, { status: own.status })
  const rec = own.rec

  const { centers, taken } = await loadOpenCenters(db, rec.distribution_id)

  // המוקד שכבר נבחר — ⚠️ נשלף גם אם אינו פתוח עוד: השובר מצביע עליו,
  // והמשפחה חייבת לראות לאן להגיע.
  let chosen: CenterRow | null = null
  if (rec.center_id) {
    chosen = centers.find(c => c.id === rec.center_id) ?? (
      (await db.from('holiday_centers')
        .select('id, city, name, region, sort_order').eq('id', rec.center_id).maybeSingle()).data as CenterRow | null
    )
  }

  const { data: caps } = await db.from('holiday_centers').select('id, capacity')
  const capacities: Record<string, number | null> = {}
  for (const r of (caps ?? []) as { id: string; capacity: number | null }[]) capacities[r.id] = r.capacity

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 קיבוץ לפי *ערים* ולא לפי אזורים — כמו בשלוחה.
  //
  // ⚠️ המבנה נשאר "regions" בשם השדה כדי לא לשבור את הממשק שכבר עובד,
  // אבל בפועל יש קבוצה אחת שמכילה את כל הערים. שכבת האזור הוסרה: מתוך
  // 18 הערים, 15 הן מוקד יחיד, והיא הוסיפה להן מדרג מיותר.
  //
  // ⚠️ מוקד מלא נשלח עם סימון ולא מוסתר: "המוקד שלי נעלם" מבלבל יותר
  // מ"המוקד מלא".
  // ─────────────────────────────────────────────────────────────────────────
  const regions = [{
    key: 'all' as const,
    label: '',
    cities: citiesByNumber(centers).map(g => ({
      city: g.city,
      number: g.number,
      centers: g.centers.map(c => ({
        id: c.id, name: c.name, city: c.city,
        full: capacities[c.id] != null && (taken[c.id] ?? 0) >= (capacities[c.id] as number),
      })),
    })),
  }]

  // 🔴 אותם שערים בדיוק כמו בשמירה: המסך אינו רשאי להציג בחירה
  // שה-POST ידחה. פער כזה נראה למשפחה כתקלה ולא ככלל.
  const dl = deadlineState(dist.centers_deadline ?? null)
  const approved = rec.approval_status === 'approved'

  return NextResponse.json({
    // ⚠️ "פתוח" = המתג פתוח **וגם** מאושר **וגם** המועד לא חלף.
    open: !!dist.centers_open && approved && !dl.closed,
    // הסיבה נשלחת בנפרד — המסך אומר *למה* סגור ולא רק שסגור.
    closedReason: !dist.centers_open ? 'closed'
      : !approved ? 'not_approved'
      : dl.closed ? 'deadline'
      : null,
    locked: !!rec.center_id,
    chosen: chosen ? { id: chosen.id, label: centerLabel(chosen) } : null,
    warning: FINAL_WARNING.portal,
    // 🔴 הספירה לאחור. ⚠️ נשלח msLeft ולא טקסט מוכן: הטקסט מתיישן
    // בשנייה שאחרי, והמסך מעדכן אותו בעצמו כל דקה.
    deadline: dist.centers_deadline ?? null,
    msLeft: dl.msLeft,
    regions,
  })
}

export async function POST(request: NextRequest) {
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const b = await request.json().catch(() => ({})) as { recipient_id?: string; center_id?: string }
  const recipientId = String(b.recipient_id ?? '')
  const centerId = String(b.center_id ?? '')
  if (!recipientId || !centerId) return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })

  const dist = await latestDistribution(db)
  if (!dist) return NextResponse.json({ error: pickMessage('closed') }, { status: 400 })

  // 🔴 approval_status — שער הבחירה. בלעדיו כאן, ה-POST היה ממשיך
  // לשמור בחירות של משפחות שאינן מאושרות בזמן שה-GET כבר חוסם אותן.
  //
  // 🔒 הקשירה לסשן קריטית דווקא כאן: זו הכתיבה, והיא בלתי הפיכה.
  const own = await loadOwnRecipient(db, request, recipientId)
  if (!own.rec) return NextResponse.json({ error: own.error }, { status: own.status })
  const rec = own.rec

  const { data: centerRow } = await db.from('holiday_centers')
    .select('id, city, name, region, sort_order, capacity, is_active').eq('id', centerId).maybeSingle()
  const center = centerRow as (CenterRow & { capacity: number | null; is_active: boolean }) | null

  const { data: openRow } = await db.from('holiday_center_openings')
    .select('center_id').eq('distribution_id', rec.distribution_id).eq('center_id', centerId).maybeSingle()

  const { data: countRows } = await db.rpc('holiday_center_counts', { dist_id: rec.distribution_id })
    .then(r => r, () => ({ data: null }))
  let taken = 0
  for (const r of (countRows ?? []) as { center_id: string; n: number }[]) {
    if (r.center_id === centerId) taken = Number(r.n)
  }

  const verdict = evaluatePick({
    centersOpen: !!dist.centers_open,
    // 🔴 רק משפחה מאושרת בוחרת מוקד.
    approved: rec.approval_status === 'approved',
    // ⚠️ אותו מועד בדיוק כמו בשלוחה — מקור אחד, שני ערוצים.
    deadlinePassed: deadlineState(dist.centers_deadline ?? null).closed,
    currentCenterId: rec.center_id,
    centerExists: !!center && center.is_active,
    centerIsOpenInDistribution: !!openRow,
    centerTaken: taken,
    centerCapacity: center?.capacity ?? null,
  }, centerId)

  if (!verdict.ok) {
    // ⚠️ הודעת הנעילה כוללת את שם המוקד שנבחר — היא אישור, לא שגיאה.
    let label: string | null = null
    if (verdict.reason === 'locked' && rec.center_id) {
      const { data: cur } = await db.from('holiday_centers')
        .select('id, city, name, region, sort_order').eq('id', rec.center_id).maybeSingle()
      label = centerLabel(cur as CenterRow | null)
    }
    return NextResponse.json(
      { error: pickMessage(verdict.reason, label), reason: verdict.reason },
      { status: 409 },
    )
  }

  // 🔴 התנאי is('center_id', null) הוא מה שמונע דריסה של בחירה שנשמרה
  // בשלוחה בין רגע הבדיקה לרגע השמירה.
  const { data: updated, error } = await db.from('distribution_recipients').update({
    center_id: centerId,
    center_chosen_at: new Date().toISOString(),
    center_source: 'portal',
  }).eq('id', rec.id).is('center_id', null).select('id')

  if (error) {
    console.error('[portal/holiday-center] שמירה נכשלה:', error.message)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }
  if (!updated?.length) {
    // מרוץ: מישהו הקדים אותנו (למשל בטלפון) בין הבדיקה לשמירה.
    return NextResponse.json({ error: pickMessage('locked'), reason: 'locked' }, { status: 409 })
  }

  console.log(`[portal/holiday-center] נבחר מוקד: rec=${rec.id} → ${centerId}`)
  return NextResponse.json({ ok: true, label: centerLabel(center) })
}
