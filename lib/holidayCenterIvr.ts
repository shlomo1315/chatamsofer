// ─────────────────────────────────────────────────────────────────────────────
// זרימת בחירת מוקד החלוקה בשלוחה הטלפונית.
//
// 🔴 מודול נפרד ולא בתוך הוובהוק: הוובהoק כבר מחזיק את מסלול הרישום המלא,
// והוספת זרימה שנייה לתוכו הייתה הופכת אותו לקובץ שאי אפשר לקרוא.
//
// ⚠️ הכללים עצמם (מי רשאי לבחור, מה נעול, מה מלא) יושבים ב-
// lib/holidayCenterPick.ts ומשותפים לטלפון ולממשק. כאן רק *הצגת* הזרימה
// בטלפון — מה מושמע, איזה משתנה נקרא, ולאן ממשיכים.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluatePick, groupByRegion, centerLabel, REGIONS, type CenterRow, type RegionKey } from './holidayCenterPick'
import { citiesByNumber, findCityByNumber } from './holidayCityMenu'

/** משתנה נפרד לכל שלב — קריאה חוזרת של משתנה מלא יוצרת לולאה בימות. */
export const CENTER_VARS = {
  region: 'c_region',
  city: 'c_city',
  center: 'c_center',
  confirm: 'c_ok',
} as const

export interface CenterIvrDeps {
  db: SupabaseClient
  distributionId: string
  recipientId: string | null
  /** המוקד שכבר נבחר, אם נבחר. */
  currentCenterId: string | null
  centersOpen: boolean
}

export interface IvrStep {
  /** פקודות ימות להחזרה. */
  commands: string[]
  /** האם השיחה הסתיימה (לצורך תיעוד בלבד). */
  done?: boolean
}

/**
 * שולף את המוקדים הפתוחים בחלוקה, עם מספר הנרשמים לכל אחד.
 *
 * ⚠️ הספירה נצברת ב-SQL. שליפת כל הרשומות והספירה בקוד הייתה מושכת
 * אלפי שורות בכל שיחה — ובשלוחה טלפונית ההשהיה נשמעת.
 */
export async function loadOpenCenters(
  db: SupabaseClient,
  distributionId: string,
): Promise<{ centers: CenterRow[]; taken: Record<string, number> }> {
  const { data: openRows } = await db.from('holiday_center_openings')
    .select('center_id').eq('distribution_id', distributionId)
  const ids = (openRows ?? []).map(r => String((r as { center_id: string }).center_id))
  if (!ids.length) return { centers: [], taken: {} }

  const { data: centers } = await db.from('holiday_centers')
    .select('id, city, name, region, sort_order')
    .in('id', ids).eq('is_active', true)
    .order('sort_order').order('city')

  const taken: Record<string, number> = {}
  const { data: counts } = await db.rpc('holiday_center_counts', { dist_id: distributionId })
    .then(r => r, () => ({ data: null }))
  for (const row of (counts ?? []) as { center_id: string; n: number }[]) {
    if (row.center_id) taken[row.center_id] = Number(row.n)
  }

  return { centers: (centers ?? []) as CenterRow[], taken }
}

/**
 * בונה רשימה מוקראת: "לירושלים הקישו 1, לבני ברק הקישו 2".
 *
 * ⚠️ נבנית מהמוקדים הפתוחים בפועל ולא מרשימה קבועה: מוקד שנסגר לא ייקרא,
 * והמספרים נשארים רציפים כדי שהמאזין לא יחפש מספר שאינו קיים.
 */
export function buildChoiceList(items: { label: string }[], prefix = 'ל'): string {
  return items.map((it, i) => `${prefix}${it.label} הקישו ${i + 1}`).join(' ')
}

/** האזורים שיש בהם מוקדים פתוחים — אזור ריק אינו מוצע. */
export function regionsWithCenters(centers: CenterRow[]): { key: RegionKey; label: string }[] {
  const grouped = groupByRegion(centers)
  return (Object.keys(REGIONS) as RegionKey[])
    .filter(k => grouped[k].length > 0)
    .map(k => ({ key: k, label: REGIONS[k] }))
}

/**
 * מכריע את השלב הבא לפי מה שכבר הוקש.
 *
 * 🔴 ההכרעה כאן טהורה — אין בה גישה למסד ולא ל-Gmail/נדרים. כך אפשר
 * לבדוק את כל הענפים בטסטים בלי שלוחה ובלי מסד.
 */
export interface CenterFlowInput {
  centers: CenterRow[]
  taken: Record<string, number>
  capacities: Record<string, number | null>
  currentCenterId: string | null
  centersOpen: boolean
  /** ההקשות שהתקבלו עד כה. */
  tapped: { region?: string; city?: string; center?: string; confirm?: string }
}

export type CenterFlowStep =
  | { kind: 'closed' }
  | { kind: 'already'; centerId: string; label: string }
  | { kind: 'no_centers' }
  // ⚠️ ask_region נשאר בטיפוס אך אינו מוחזר עוד — שכבת האזור הוסרה
  // מהזרימה (ראו ההערה ב-nextCenterStep). הקוראים שמטפלים בו אינם
  // שבורים, הם פשוט לא ייקראו.
  | { kind: 'ask_region'; options: { key: RegionKey; label: string }[] }
  /** ⚠️ options נושא את מספר העיר — הוא מה שמוקרא, ולא מיקום ברשימה. */
  | { kind: 'ask_city'; options: { number: number; city: string; centers: CenterRow[] }[] }
  | { kind: 'ask_center'; city: string; options: CenterRow[] }
  | { kind: 'confirm'; center: CenterRow; label: string }
  | { kind: 'full'; center: CenterRow }
  | { kind: 'save'; center: CenterRow; label: string }
  | { kind: 'cancelled' }

export function nextCenterStep(input: CenterFlowInput): CenterFlowStep {
  const { centers, taken, capacities, currentCenterId, centersOpen, tapped } = input

  if (!centersOpen) return { kind: 'closed' }

  // ⚠️ נבדק לפני הכול: מי שכבר בחר מקבל אישור עם שם המוקד, לא תפריט.
  if (currentCenterId) {
    const c = centers.find(x => x.id === currentCenterId)
    return { kind: 'already', centerId: currentCenterId, label: centerLabel(c) ?? '' }
  }

  if (!centers.length) return { kind: 'no_centers' }

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 השלב הראשון הוא *עיר*, ולא אזור.
  //
  // ⚠️ שכבת האזור (ירושלים והסביבה / מרכז / צפון / דרום) הוסרה במכוון:
  // מתוך 18 הערים ברשימה, 15 הן מוקד יחיד — ולהן היא הוסיפה הקשה
  // שלמה בלי שום תועלת.
  //
  // 🔴 ההקשה היא מספר העיר (sort_order) ולא מיקום ברשימה. המספר מתפרסם
  // למשפחות מראש; אילו היה נגזר מהמיקום, סגירת עיר אחת הייתה מזיזה את
  // כל המספרים שאחריה, ומי שיודע את המספר שלו היה מגיע לעיר אחרת.
  // ─────────────────────────────────────────────────────────────────────────
  const cities = citiesByNumber(centers)
  const city = findCityByNumber(centers, tapped.city)
  if (!city) return { kind: 'ask_city', options: cities }

  // ⚠️ עיר עם מוקד יחיד מדלגת על שלב הבחירה — תפריט בן אפשרות אחת מיותר.
  let center: CenterRow | undefined
  if (city.centers.length === 1) {
    center = city.centers[0]
  } else {
    const idx = Number(tapped.center ?? 0) - 1
    center = city.centers[idx]
    if (!center) return { kind: 'ask_center', city: city.city, options: city.centers }
  }

  const verdict = evaluatePick({
    centersOpen,
    currentCenterId,
    centerExists: true,
    centerIsOpenInDistribution: true,
    centerTaken: taken[center.id] ?? 0,
    centerCapacity: capacities[center.id] ?? null,
  }, center.id)

  if (!verdict.ok && verdict.reason === 'full') return { kind: 'full', center }

  const label = centerLabel(center) ?? center.name
  if (!tapped.confirm) return { kind: 'confirm', center, label }
  if (tapped.confirm !== '1') return { kind: 'cancelled' }

  return { kind: 'save', center, label }
}
