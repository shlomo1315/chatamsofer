import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import {
  evaluatePick, groupByRegion, centerLabel, pickMessage,
  FINAL_WARNING, REGIONS, type CenterRow,
} from '@/lib/holidayCenterPick'
import { loadOpenCenters } from '@/lib/holidayCenterIvr'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// בחירת מוקד חלוקה מהממשק הדיגיטלי.
//
// 🔴 אותם כללים בדיוק כמו בשלוחה — evaluatePick משותפת לשניהם. שני ערוצים
// שכל אחד אוכף כללים משלו נפרדים ברגע שמשנים אחד מהם, והמשפחה מגלה
// שהטלפון מאפשר מה שהמסך חוסם.
//
// ⚠️ הזיהוי הוא לפי מזהה הרשומה (recipient) שהפורטל כבר אימת. אין כאן
// אימות משלנו — הוא נעשה במסלול הכניסה לפורטל.
// ─────────────────────────────────────────────────────────────────────────────

/** החלוקה האחרונה. ⚠️ distributions ולא holiday_distributions — ראו FK. */
async function latestDistribution(db: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { data } = await db.from('distributions')
    .select('id, centers_open').order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data as { id: string; centers_open: boolean } | null
}

export async function GET(request: NextRequest) {
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const recipientId = request.nextUrl.searchParams.get('recipient_id') ?? ''
  if (!recipientId) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const dist = await latestDistribution(db)
  if (!dist) return NextResponse.json({ open: false, centers: [] })

  const { data: recRow } = await db.from('distribution_recipients')
    .select('id, center_id, distribution_id').eq('id', recipientId).maybeSingle()
  const rec = recRow as { id: string; center_id: string | null; distribution_id: string } | null
  if (!rec) return NextResponse.json({ error: 'הרשומה לא נמצאה' }, { status: 404 })

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

  // ⚠️ מוקד מלא נשלח עם סימון ולא מוסתר: "המוקד שלי נעלם" מבלבל יותר
  // מ"המוקד מלא".
  const grouped = groupByRegion(centers)
  const regions = (Object.keys(REGIONS) as (keyof typeof REGIONS)[])
    .filter(k => grouped[k].length)
    .map(k => ({
      key: k, label: REGIONS[k],
      cities: grouped[k].map(g => ({
        city: g.city,
        centers: g.centers.map(c => ({
          id: c.id, name: c.name, city: c.city,
          full: capacities[c.id] != null && (taken[c.id] ?? 0) >= (capacities[c.id] as number),
        })),
      })),
    }))

  return NextResponse.json({
    open: !!dist.centers_open,
    locked: !!rec.center_id,
    chosen: chosen ? { id: chosen.id, label: centerLabel(chosen) } : null,
    warning: FINAL_WARNING.portal,
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

  const { data: recRow } = await db.from('distribution_recipients')
    .select('id, center_id, distribution_id').eq('id', recipientId).maybeSingle()
  const rec = recRow as { id: string; center_id: string | null; distribution_id: string } | null
  if (!rec) return NextResponse.json({ error: 'הרשומה לא נמצאה' }, { status: 404 })

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
