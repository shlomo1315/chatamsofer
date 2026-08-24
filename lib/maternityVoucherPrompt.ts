// ─────────────────────────────────────────────────────────────────────────────
// מה צריך להישלח ליולדת אחרי שינוי בתיק — ומה לשאול את המזכיר לפני.
//
// 🔴 קודם השליחה הייתה שקטה ולא עקבית: שינוי בית החלמה מהכרטסת שלח שובר
// אוטומטית, אותו שינוי מהעריכה לא שלח כלום, ושינוי בחירת ההטבות
// (wants_food_card / wants_recovery) לא שלח דבר בשום מסלול. יולדת
// שהוסיפה כרטיס מזון או בית החלמה נשארה בלי השובר החדש.
//
// כאן מחושבת ההחלטה בלבד — טהורה, בלי גישה למסד ובלי שליחה — כדי שאותו
// כלל ישרת את כל המסכים ויהיה בדיק.
// ─────────────────────────────────────────────────────────────────────────────

/** מצב התיק בשדות שמשפיעים על השוברים. */
export interface VoucherRelevantState {
  wantsFoodCard: boolean
  wantsRecovery: boolean
  recoveryHome: string | null
  /** ימי הזכאות בבית ההחלמה — מופיעים על השובר. */
  recoveryDays?: number | null
}

export type VoucherKind = 'card' | 'recovery'

export interface VoucherPromptPlan {
  /** האם בכלל לשאול. false ⇒ לשמור בשקט. */
  shouldAsk: boolean
  /** אילו שוברים רלוונטיים לשליחה */
  kinds: VoucherKind[]
  /** מה השתנה, בעברית — מוצג בדיאלוג כדי שההחלטה תהיה מודעת */
  changes: string[]
  /** ⚠️ שינוי שמבטל הטבה: אין מה לשלוח, אבל חשוב שהמזכיר יראה זאת */
  removals: string[]
}

const HOME_LABEL = (h: string | null) => h || 'ללא בית החלמה'

/**
 * משווה מצב קודם למצב חדש ומחליט מה להציע לשלוח.
 *
 * ⚠️ הצעה נעשית רק על **תוספת או עדכון** של הטבה. ביטול הטבה מדווח
 * ב-removals ואינו מייצר שובר — שליחת שובר על מה שבוטל מטעה את היולדת.
 */
export function planVoucherPrompt(
  before: VoucherRelevantState,
  after: VoucherRelevantState,
): VoucherPromptPlan {
  const kinds: VoucherKind[] = []
  const changes: string[] = []
  const removals: string[] = []

  // ── כרטיס מזון ──
  if (!before.wantsFoodCard && after.wantsFoodCard) {
    kinds.push('card')
    changes.push('נוסף כרטיס מזון')
  } else if (before.wantsFoodCard && !after.wantsFoodCard) {
    removals.push('בוטל כרטיס מזון')
  }

  // ── בית החלמה ──
  const recoveryAdded = !before.wantsRecovery && after.wantsRecovery
  const recoveryRemoved = before.wantsRecovery && !after.wantsRecovery

  if (recoveryAdded) {
    kinds.push('recovery')
    changes.push('נוסף בית החלמה')
  } else if (recoveryRemoved) {
    removals.push('בוטל בית החלמה')
  } else if (after.wantsRecovery) {
    // ההטבה קיימת משני הצדדים — אבל פרטיה עשויים להשתנות, והשובר
    // שבידי היולדת כבר אינו נכון.
    const homeChanged = (before.recoveryHome || null) !== (after.recoveryHome || null)
    const daysChanged =
      before.recoveryDays != null && after.recoveryDays != null &&
      before.recoveryDays !== after.recoveryDays

    if (homeChanged) {
      kinds.push('recovery')
      changes.push(`בית החלמה: ${HOME_LABEL(before.recoveryHome)} ← ${HOME_LABEL(after.recoveryHome)}`)
    }
    if (daysChanged) {
      if (!kinds.includes('recovery')) kinds.push('recovery')
      changes.push(`ימי זכאות: ${before.recoveryDays} ← ${after.recoveryDays}`)
    }
  }

  return { shouldAsk: kinds.length > 0, kinds, changes, removals }
}

/** תווית לשובר — לשימוש בדיאלוג ובהודעות. */
export function voucherLabel(kind: VoucherKind): string {
  return kind === 'card' ? 'שובר כרטיס מזון' : 'שובר בית החלמה'
}

/** משפט הדיאלוג: "לשלוח ליולדת שובר כרטיס מזון ושובר בית החלמה?" */
export function voucherPromptText(kinds: VoucherKind[]): string {
  const names = kinds.map(voucherLabel)
  const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} ו${names[names.length - 1]}` : names[0]
  return `לשלוח ליולדת ${joined} מעודכן?`
}
