import type { SectionKey, PermissionLevel, UserPermissions, UserRole } from '@/types'

// אכיפת הרשאות לפי מסך (section) ופעולה. מטריצה מוסכמת:
//   ללא (none)   — אין גישה
//   צפייה (view) — קריאה בלבד
//   הוספה (add)  — קריאה + הוספת רשומות חדשות (בלבד — לא עריכה/מחיקה של קיים)
//   עריכה (edit) — קריאה + הוספה + עריכת קיים + מחיקה (הרמה המלאה)
// מחיקה דורשת 'edit' — 'add' אינו מספיק.
export type PermAction = 'view' | 'add' | 'edit' | 'delete'

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
// רצפת הרשאות לפי תפקיד
//
// מה שהתפקיד מקבל תמיד — גם אם במטריצה הידנית של המשתמש סומן פחות. נועד
// למקרים שבהם היכולת שייכת לתפקיד עצמו ולא אמורה להיות תלויה בסימון פרטני.
//
// מזכירות: עריכת כרטסת הצאצאים פתוחה תמיד.
// ⚠️ המחיקה אינה נגזרת מכאן — מחיקת צאצא שמורה למנהל בלבד ונאכפת בנפרד
//    (requireAdmin בנתיב /api/admin/beneficiaries/delete + isAdmin בכפתור).
//    לכן רצפה של 'edit' כאן נותנת עריכה, לא מחיקה.
// ─────────────────────────────────────────────────────────────────────────────
const ROLE_FLOOR: Partial<Record<UserRole, Partial<Record<SectionKey, PermissionLevel>>>> = {
  secretary: { beneficiaries: 'edit' },
}

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
