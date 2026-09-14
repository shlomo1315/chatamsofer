// ─────────────────────────────────────────────────────────────────────────────
// שלב חלוקת הכרטיסים של מוקד בודד.
//
// 🔴 שלושה מצבים ולא שניים. עד כה היה כפתור מתחלף (מחלק / לא מחלק),
// ו"טרם החל" ו"כבר נסגר" נראו זהים במסד — שניהם pickup_open_at=NULL.
// בטלפון שניהם השמיעו "המוקד טרם החל לחלק", כך שמשפחה שאיחרה נשלחה
// להמתין להודעה שלא תגיע לעולם במקום לדעת שהמועד עבר.
//
// ⚠️ זה שונה מ"בחירה: פתוח" — שער נפרד שקובע אם משפחות יכולות *לבחור*
// את המוקד. מוקד יכול להיות סגור לבחירה ועדיין לחלק למי שכבר נרשם.
// ─────────────────────────────────────────────────────────────────────────────

export type PickupPhase = 'not_started' | 'active' | 'ended'

/** שתי החותמות שבמסד → שלב. */
export function pickupPhaseOf(row: {
  pickup_open_at?: string | null
  pickup_ended_at?: string | null
} | null | undefined): PickupPhase {
  if (!row) return 'not_started'
  // 🔴 סיום גובר: מוקד שנסגר נשאר סגור גם אם חותמת הפתיחה נותרה במקומה.
  if (row.pickup_ended_at) return 'ended'
  return row.pickup_open_at ? 'active' : 'not_started'
}

/** שלב → החותמות שיש לכתוב. ⚠️ שתיהן נכתבות תמיד, אחרת נשאר מצב מעורב. */
export function pickupPhasePatch(phase: PickupPhase, now: string = new Date().toISOString()): {
  pickup_open_at: string | null
  pickup_ended_at: string | null
} {
  if (phase === 'active') return { pickup_open_at: now, pickup_ended_at: null }
  if (phase === 'ended') return { pickup_open_at: now, pickup_ended_at: now }
  // חזרה ל"טרם החל" מנקה את שתיהן — המוקד לא התחיל מעולם.
  return { pickup_open_at: null, pickup_ended_at: null }
}

/** מפתח ההודעה שתושמע בטלפון, או null כשהמוקד מחלק. */
export function centerPickupMessageKey(phase: PickupPhase): string | null {
  if (phase === 'active') return null
  return phase === 'ended' ? 'card_pickup_ended' : 'card_center_not_open'
}

export const PICKUP_PHASE_LABEL: Record<PickupPhase, string> = {
  not_started: 'טרם מחלק',
  active: 'מחלק כרטיסים',
  ended: 'נסגרה החלוקה',
}
