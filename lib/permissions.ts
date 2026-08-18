import type { SectionKey, PermissionLevel, UserPermissions, UserRole } from '@/types'

// אכיפת הרשאות לפי מסך (section) ופעולה. מטריצה מוסכמת:
//   ללא (none)   — אין גישה
//   צפייה (view) — קריאה בלבד
//   הוספה (add)  — קריאה + הוספת רשומות חדשות (בלבד — לא עריכה/מחיקה של קיים)
//   עריכה (edit) — קריאה + הוספה + עריכת קיים + מחיקה (הרמה המלאה)
// מחיקה דורשת 'edit' — 'add' אינו מספיק.
export type PermAction = 'view' | 'add' | 'edit' | 'delete'

// ─────────────────────────────────────────────────────────────────────────────
// רשימת המחלקות — מקור אמת יחיד.
//
// ⚠️ למה כאן ולא במסך ההגדרות: הרשימה הייתה משוכפלת ב-EditUserButton
// וב-AddUserButton, ושתיהן פספסו את widows ו-newsletter. מחלקה שאינה
// ברשימה אינה ניתנת לסימון — ומה שלא ניתן לסמן נשאר פתוח לכולם. זו הייתה
// הדליפה בפועל: "הרשאת הלוואות רואה אלמנות וניוזלטר".
// כל SectionKey חדש חייב להופיע כאן, אחרת הוא נולד דולף.
// ─────────────────────────────────────────────────────────────────────────────
export const ALL_SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'beneficiaries',   label: 'צאצאים' },
  { key: 'lineage',         label: 'עץ הדורות' },
  { key: 'maternity',       label: 'עזר יולדות' },
  { key: 'maternity_cards', label: 'כרטיסי מזון יולדות' },
  { key: 'loans',           label: 'הלוואות' },
  { key: 'financial_aid',   label: 'סיוע רפואי' },
  { key: 'distributions',   label: 'חלוקות חגים' },
  { key: 'widows',          label: 'אלמנות ויתומים' },
  { key: 'reports',         label: 'דוחות' },
  { key: 'newsletter',      label: 'ניוזלטר' },
  { key: 'mail',            label: 'תיבות דואר' },
]

export function levelAllows(level: PermissionLevel | undefined, action: PermAction): boolean {
  const l = level ?? 'none'
  switch (action) {
    case 'view':   return l === 'view' || l === 'add' || l === 'edit'
    case 'add':    return l === 'add' || l === 'edit'
    case 'edit':   return l === 'edit'
    case 'delete': return l === 'edit'
    default:       return false
  }
}

export function permissionAllows(perms: UserPermissions | undefined, section: SectionKey, action: PermAction): boolean {
  return levelAllows(perms?.[section], action)
}

// ─────────────────────────────────────────────────────────────────────────────
// רצפת הרשאות לפי תפקיד — בוטלה.
//
// 🔴 הרצפה נתנה לכל מזכירה צאצאים (עריכה) וחלוקות חגים (צפייה) בלי קשר
// לסימון. היא נוספה כשהאכיפה על חלוקות החגים נכנסה לתוקף ואיש עדיין לא היה
// מסומן — בלעדיה כל המזכירות היו נחסמות באמצע קמפיין רישום.
//
// ⚠️ אבל היא גם *ביטלה סימון מפורש*: מנהל שסימן "ללא" לצאצאים ראה את
// המחלקה נשארת פתוחה, בלי שום חיווי שהסימון שלו לא נאכף. מסך שמראה
// "ללא" ומתנהג כ"עריכה" הוא גרוע יותר מהיעדר הרשאה — הוא משקר למי
// שמנהל את ההרשאות.
//
// עכשיו הסימון הידני הוא מקור האמת היחיד. ⚠️ המשמעות: מזכירה שלא סומן
// לה דבר חסומה — הסימון חייב להיות מפורש.
// ─────────────────────────────────────────────────────────────────────────────
const ROLE_FLOOR: Partial<Record<UserRole, Partial<Record<SectionKey, PermissionLevel>>>> = {}

// none < view < add < edit — סדר ליניארי: כל רמה מכילה את זו שמתחתיה
// ('edit' מתיר גם הוספה, ראו levelAllows). משמש להשוואת רצפה מול הסימון הידני.
const RANK: Record<PermissionLevel, number> = { none: 0, view: 1, add: 2, edit: 3 }

// הרמה בפועל למשתמש: הגבוהה מבין הסימון הידני לבין רצפת התפקיד.
export function effectiveLevel(
  role: UserRole | undefined,
  perms: UserPermissions | undefined,
  section: SectionKey
): PermissionLevel {
  const stored = perms?.[section] ?? 'none'
  const floor = role ? ROLE_FLOOR[role]?.[section] : undefined
  if (!floor) return stored
  return RANK[floor] > RANK[stored] ? floor : stored
}

// כמו permissionAllows, אך מביא בחשבון גם את רצפת התפקיד.
export function roleAllows(
  role: UserRole | undefined,
  perms: UserPermissions | undefined,
  section: SectionKey,
  action: PermAction
): boolean {
  return levelAllows(effectiveLevel(role, perms, section), action)
}

// ─────────────────────────────────────────────────────────────────────────────
// האם פריט ניווט מוצג למשתמש.
//
// ⚠️ הסרגל הכריע קודם לפי `(permissions?.[section] ?? 'view') !== 'none'` —
// כלומר מחלקה ללא סימון כלל נחשבה *מותרת*. ביחד עם widows/newsletter/mail
// שכלל לא היו ניתנים לסימון, זו הייתה הדליפה: המשתמש סימן 'הלוואות' והניח
// שסגר את השאר, בעוד שכל מה שלא נגע בו נשאר פתוח.
//
// עכשיו ההכרעה זהה לזו של השרת (requirePermission) — אותה פונקציה בדיוק.
// פער בין השניים גרוע משני הכיוונים: פריט שמוצג ומחזיר 403, או פריט מוסתר
// שה-API בכל זאת מגיש למי שיודע לקרוא לו ישירות.
// ─────────────────────────────────────────────────────────────────────────────
export function sectionVisible(
  isAdmin: boolean,
  role: UserRole | undefined,
  perms: UserPermissions | undefined,
  section: SectionKey | undefined
): boolean {
  if (isAdmin) return true
  if (!section) return true // פריט ללא שיוך למחלקה (למשל קישור מערכת) — לא נבדק כאן
  return roleAllows(role, perms, section, 'view')
}
