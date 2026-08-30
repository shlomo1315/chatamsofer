import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import {
  loadOpenCenters, nextCenterStep, buildChoiceList,
  type CenterFlowStep,
} from '@/lib/holidayCenterIvr'
import { citiesByNumber } from '@/lib/holidayCityMenu'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// סימולטור שלוחת בחירת מוקד החלוקה.
//
// מריץ את *אותה* פונקציה שהשלוחה האמיתית מריצה (nextCenterStep) על הנתונים
// האמיתיים של החלוקה, ומחזיר את מה שהמתקשר היה שומע — בלי לחייג ובלי לגעת
// במסד.
//
// 🔴 קריאה בלבד. הצעד 'save' מוחזר כתיאור ואינו נשמר: סימולציה שכותבת
// למסד הייתה תופסת מקום במוקד על שם משפחה אקראית.
//
// ⚠️ nextCenterStep ולא לוגיקה מקבילה — ברגע שהסימולטור מחשב בעצמו, הוא
// מפסיק לבדוק את מה שרץ בפועל ומתחיל לבדוק את עצמו.
//
// ⚠️ אין middleware בפרויקט — כל ראוט מגן על עצמו.
// ─────────────────────────────────────────────────────────────────────────────

/** מה שהמתקשר שומע בכל צעד — הטקסט שהשלוחה מקריאה. */
function speak(step: CenterFlowStep): { text: string; expects: string | null; done: boolean } {
  switch (step.kind) {
    case 'closed':
      return { text: 'בחירת מוקדי החלוקה סגורה כעת.', expects: null, done: true }
    case 'no_centers':
      return { text: 'לא נמצאו מוקדים פתוחים בחלוקה זו.', expects: null, done: true }
    case 'already':
      return { text: `כבר נבחר עבורכם המוקד ${step.label}.`, expects: null, done: true }
    case 'ask_region':
      return {
        text: buildChoiceList(step.options.map(o => ({ label: o.label }))),
        expects: 'region',
        done: false,
      }
    case 'ask_city':
      // 🔴 לפי מספר העיר ולא לפי מיקום — בדיוק כמו בשלוחה עצמה.
      //
      // ⚠️ סימולטור שממספר אחרת מהשלוחה גרוע מאין סימולטור: הוא מראה
      // "הקישו 3" בזמן שהמתקשר האמיתי שומע "הקישו 7", והבדיקה מאשרת
      // מסלול שאינו קיים.
      return {
        text: step.options.map(o => `ל${o.city} הקישו ${o.number}`).join(' '),
        expects: 'city',
        done: false,
      }
    case 'ask_center':
      return {
        text: buildChoiceList(step.options.map(o => ({ label: o.name }))),
        expects: 'center',
        done: false,
      }
    case 'confirm':
      return { text: `בחרתם ${step.label}. לאישור הקישו 1, לביטול הקישו 2.`, expects: 'confirm', done: false }
    case 'full':
      return { text: `המוקד ${step.center.name} מלא. יש לבחור מוקד אחר.`, expects: null, done: true }
    case 'cancelled':
      return { text: 'הבחירה בוטלה.', expects: null, done: true }
    case 'save':
      return { text: `נרשמתם למוקד ${step.label}. (סימולציה — לא נשמר)`, expects: null, done: true }
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requirePermission('reports', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: {
    distributionId?: string
    tapped?: { region?: string; city?: string; center?: string; confirm?: string }
    currentCenterId?: string | null
  }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const distributionId = String(body.distributionId ?? '').trim()
  if (!distributionId) return NextResponse.json({ error: 'חסר מזהה חלוקה' }, { status: 400 })

  // ⚠️ distributions ולא holiday_distributions — ראו FK (portal/holiday-center).
  const { data: dist } = await db
    .from('distributions')
    .select('id, centers_open')
    .eq('id', distributionId)
    .maybeSingle()
  if (!dist) return NextResponse.json({ error: 'החלוקה לא נמצאה' }, { status: 404 })

  const { centers, taken } = await loadOpenCenters(db, distributionId)

  // ⚠️ התפוסות נשלפות בנפרד — loadOpenCenters מחזיר taken בלבד.
  const { data: caps } = await db.from('holiday_centers').select('id, capacity')
  const capacities: Record<string, number | null> = {}
  for (const r of (caps ?? []) as { id: string; capacity: number | null }[]) {
    capacities[r.id] = r.capacity
  }

  // ⚠️ '__any__' = "דמה משפחה שכבר בחרה" מהמסך. נפתר למוקד אמיתי כדי
  // ש-nextCenterStep תחזיר שם מוקד ולא מחרוזת ריקה — הענף הזה אינו נגיש
  // בשיחה רגילה, ובלעדיו אי אפשר לבדוק אותו כלל.
  const requested = body.currentCenterId ?? null
  const currentCenterId = requested === '__any__' ? (centers[0]?.id ?? null) : requested

  const step = nextCenterStep({
    centers,
    taken,
    capacities,
    currentCenterId,
    centersOpen: !!dist.centers_open,
    tapped: body.tapped ?? {},
  })

  const heard = speak(step)

  return NextResponse.json({
    ok: true,
    step: step.kind,
    ...heard,
    // מצב העולם שהשלוחה רואה — כדי שהבודק יבין *למה* קיבל את התשובה הזו.
    state: {
      centersOpen: !!dist.centers_open,
      centersCount: centers.length,
      // ⚠️ ערים ולא אזורים: שכבת האזור הוסרה מהזרימה, והצגתה כאן הייתה
      // מתארת מסלול שהמתקשר אינו עובר.
      regions: citiesByNumber(centers).map(c => `${c.number}. ${c.city}`),
      full: centers
        .filter(c => capacities[c.id] != null && (taken[c.id] ?? 0) >= (capacities[c.id] as number))
        .map(c => `${c.city} · ${c.name}`),
    },
  })
}
