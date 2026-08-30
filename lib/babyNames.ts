// ─────────────────────────────────────────────────────────────────────────────
// שם התינוק — מקור אמת אחד.
//
// ⚠️ הבאג שזה פותר: שם התינוק נשמר ב*שני* מקומות — בשדה הסקלרי `baby_name`
// ובתוך מערך `babies` (שנכתב בכל בקשת לידה, גם ללידה בודדת) — ואף כותב לא
// סנכרן ביניהם. הקוראים התפצלו: כרטסת הלידה מציגה את `babies[0].name`, בזמן
// שהרשימה הראשית, מסך בית ההחלמה, מסך הכרטיסים והדוחות מציגים `baby_name`.
//
// התוצאה בשטח (אייזנער חוה רחל): בכרטסת נכתב "היולדת ציינה: עדיין אין שם"
// (כי במערך אין שם), ובאותו רגע ברשימה ובבית ההחלמה הופיע הטקסט הישן שהיולדת
// כתבה בשדה השם — והוא זה שנשלח לבית ההחלמה. אישור הלידה לא שינה דבר, כי
// שום מסך לא כתב לשני המקומות.
//
// לכן: כל *קריאה* עוברת דרך babiesOf/babyNameLabel, וכל *כתיבה* עוברת דרך
// babyNamePatch — שמעדכן את שני המקומות ואת הדגל יחד. כך אין יותר שתי אמיתות.
// ─────────────────────────────────────────────────────────────────────────────

export interface BabyEntry {
  name?: string | null
  gender?: string | null
  id_type?: string | null
  id_number?: string | null
}

export interface AidNameFields {
  baby_name?: string | null
  baby_name_pending?: boolean | null
  baby_gender?: string | null
  baby_id_type?: string | null
  baby_id_number?: string | null
  babies?: unknown
  is_twins?: boolean | null
}

/** תווית קבועה לתינוק שהיולדת ציינה שאין לו שם עדיין */
export const NO_NAME_YET = 'עדיין אין שם'

const clean = (v: unknown) => {
  const s = String(v ?? '').trim()
  return s ? s : null
}

/**
 * רשימת התינוקות של התיק — מהמערך אם קיים, אחרת מהשדות הסקלריים.
 * ⚠️ המערך קודם: הוא הרשומה הפר-תינוקית, והוא מה שכרטסת הלידה מציגה.
 */
export function babiesOf(aid: AidNameFields): BabyEntry[] {
  const arr = Array.isArray(aid.babies) ? (aid.babies as BabyEntry[]) : []
  if (arr.length) return arr
  return [{
    name: aid.baby_name ?? null,
    gender: aid.baby_gender ?? null,
    id_type: aid.baby_id_type ?? null,
    id_number: aid.baby_id_number ?? null,
  }]
}

/**
 * השם האמיתי של התינוק (או של כל התאומים) — null כשאין שם בשום מקור.
 * ⚠️ נבדקים *שני* המקורות: רשומה שסונכרנה חלקית לא תיראה כאילו אין לה שם.
 */
export function babyRealName(aid: AidNameFields): string | null {
  const arr = Array.isArray(aid.babies) ? (aid.babies as BabyEntry[]) : []
  const fromArray = arr.map(b => clean(b.name)).filter(Boolean) as string[]
  if (fromArray.length) return fromArray.join(' · ')
  // ⚠️ מערך קיים בלי שם + הדגל דלוק = היולדת ציינה שאין שם. במצב הזה *אסור*
  // ליפול לשדה הסקלרי: שם ישן שנשאר בו הוא בדיוק מה שהמשיך להישלח לבית
  // ההחלמה אחרי שהיולדת כבר ביטלה אותו.
  if (aid.baby_name_pending === true) return null
  // אחרת השדה הסקלרי עדיין קובע — רשומות ותיקות שנכתבו רק אליו
  return clean(aid.baby_name)
}

/**
 * מה להציג בעמודת "שם התינוק" בכל מסך.
 * pending=true → היולדת ציינה שאין שם עדיין (ואין להציג טקסט ישן שנשאר בשדה).
 */
export function babyNameLabel(aid: AidNameFields): { text: string; pending: boolean; missing: boolean } {
  const real = babyRealName(aid)
  if (real) return { text: real, pending: false, missing: false }
  if (aid.baby_name_pending === true) return { text: NO_NAME_YET, pending: true, missing: false }
  return { text: '—', pending: false, missing: true }
}

/** האם התיק ממתין להשלמת שם — הדגל דלוק *ואין* שם אמיתי באף מקור. */
export function isNamePending(aid: AidNameFields): boolean {
  return aid.baby_name_pending === true && !babyRealName(aid)
}

/**
 * ה-patch שכל כותב חייב להשתמש בו כדי לשנות את שם התינוק.
 *
 * name=null → "עדיין אין שם": השדה והמערך מתרוקנים והדגל נדלק. בלי זה נשאר
 *   בשדה טקסט ישן שממשיך להישלח לבית ההחלמה גם אחרי שהיולדת אמרה שאין שם.
 * name=טקסט → נכתב לשני המקומות והדגל נכבה — אחרת התיק נשאר ב"ממתין לתיקונים"
 *   לנצח, גם אחרי שהשם הושלם.
 *
 * index — איזה תינוק (לתאומים). ברירת מחדל: הראשון.
 */
export function babyNamePatch(aid: AidNameFields, name: string | null, index = 0): Record<string, unknown> {
  const value = clean(name)
  const arr = Array.isArray(aid.babies) ? [...(aid.babies as BabyEntry[])] : []
  const patch: Record<string, unknown> = {
    baby_name_pending: value === null,
    updated_at: new Date().toISOString(),
  }
  if (arr.length) {
    arr[index] = { ...(arr[index] ?? {}), name: value }
    patch.babies = arr
    // השדה הסקלרי משקף את התינוק הראשון — כך המסכים שקוראים אותו נשארים נכונים
    patch.baby_name = clean(arr[0]?.name)
  } else {
    patch.baby_name = value
  }
  return patch
}

/**
 * תווית זיהוי לתינוק אחד ברשימת תאומים — "תינוק 1 · בת · ת״ז 246483283".
 *
 * 🔴 בלי זה שני שדות שם ריקים זה מעל זה הם חסרי משמעות: היולדת אינה
 * יודעת איזה שם שייך למי. הת"ז היא המזהה הוודאי (היא מופיעה על תעודת
 * הלידה), והמין הוא הסימן המהיר לעין.
 */
export function babyLabel(b: BabyEntry, index: number): string {
  const parts = [`תינוק ${index + 1}`]
  const g = clean(b.gender)
  if (g === 'male') parts.push('בן')
  else if (g === 'female') parts.push('בת')
  const id = clean(b.id_number)
  if (id) parts.push(`${b.id_type === 'passport' ? 'דרכון' : 'ת״ז'} ${id}`)
  return parts.join(' · ')
}

/**
 * שמירת שמות *כל* התינוקות בתיק בפעולה אחת — המסלול לתאומים.
 *
 * 🔴 הבאג שזה פותר: כל הכותבים קראו ל-babyNamePatch בלי index, כלומר
 * כתבו תמיד ל-babies[0]. ליולדת תאומים נשלחה בקשת תיקון על תינוק אחד
 * בלבד, וגם עריכה ידנית בתוכנה הציגה רק את הראשון. בפועל נמצאו במסד
 * שלושה תיקי תאומים עם תינוק אחד בעל שם והשני null — התאום השני אבד.
 *
 * ⚠️ הדגל baby_name_pending נשאר דלוק כל עוד *תאום אחד* חסר שם. אחרת
 * מילוי של תאום אחד היה מוציא את התיק מרשימת "ממתין לתיקונים", והשני
 * לא היה מושלם לעולם.
 *
 * ⚠️ שם ריק אינו מוחק שם קיים של תאום אחר — כל תא נכתב בנפרד.
 */
export function babyNamesPatch(aid: AidNameFields, names: (string | null)[]): Record<string, unknown> {
  const current = babiesOf(aid)
  const arr = current.map((b, i) => ({ ...b, name: clean(names[i]) }))
  const allNamed = arr.length > 0 && arr.every(b => b.name)
  return {
    babies: arr,
    // השדה הסקלרי משקף את התינוק הראשון — כך המסכים שקוראים אותו נשארים נכונים
    baby_name: clean(arr[0]?.name),
    baby_name_pending: !allNamed,
    updated_at: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// סנכרון שם התינוק מרשימת הילדים של המשפחה אל תיק הלידה.
//
// ⚠️ החוליה החסרה שהתגלתה אצל אייזנער חוה רחל: היולדת *כן* תיקנה את השם — אבל
// בעדכון הפרטים בפורטל, כלומר ברשימת הילדים של המשפחה (beneficiaries.children).
// תיק הלידה לא ידע על כך כלל, ולכן המשיך להציג "עדיין אין שם". הכיוון ההפוך
// (תיק → כרטסת) היה מסונכרן מזמן; זה הכיוון שנשכח.
//
// מסונכרן רק לתיק שאין בו שם אמיתי — כדי שתיקון של הצוות בתיק לא יידרס בשקט
// ע"י שם ישן שנשאר ברשימת הילדים.
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ any על הלקוח בכוונה: הטיפוסים המחושבים של supabase-js על שאילתה מקוננת
// מפוצצים את בודק הטיפוסים (TS2589), והפונקציה הזו נקראת ממסלול שרת בלבד.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

export async function syncMaternityNamesFromChildren(
  db: AnyDb,
  beneficiaryId: string,
  children: unknown,
): Promise<number> {
  const kids = (Array.isArray(children) ? children : []) as { name?: string | null; id_number?: string | null; maternity_aid_id?: string | null }[]
  if (!kids.length) return 0

  const { data } = await db.from('maternity_aids')
    .select('id, baby_name, baby_name_pending, babies, baby_id_number')
    .eq('beneficiary_id', beneficiaryId)
  const aids = (data ?? []) as (AidNameFields & { id: string; baby_id_number?: string | null })[]
  if (!aids.length) return 0

  const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
  let synced = 0
  for (const aid of aids) {
    if (babyRealName(aid)) continue      // בתיק כבר יש שם — לא נוגעים
    const match = kids.find(k => {
      const name = clean(k.name)
      if (!name) return false
      if (k.maternity_aid_id && k.maternity_aid_id === aid.id) return true
      const kid = digits(k.id_number), bid = digits(aid.baby_id_number)
      return !!kid && !!bid && kid === bid
    })
    const name = match ? clean(match.name) : null
    if (!name) continue
    const { error } = await db.from('maternity_aids').update(babyNamePatch(aid, name)).eq('id', aid.id)
    if (!error) synced++
  }
  return synced
}
