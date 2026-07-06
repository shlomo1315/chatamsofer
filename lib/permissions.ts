import type { SectionKey, PermissionLevel, UserPermissions } from '@/types'

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
