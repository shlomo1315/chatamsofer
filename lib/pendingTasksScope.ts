import type { SectionKey, UserPermissions, UserRole } from '@/types'
import { roleAllows } from '@/lib/permissions'

// ─────────────────────────────────────────────────────────────────────────────
// סינון "ממתינים לטיפול" לפי הרשאות.
//
// ⚠️ הפאנל מאחד חמש מחלקות לרשימה אחת, ובכללן אלמנות ויתומים. בלי הסינון
// הזה משתמש שהורשה להלוואות בלבד ראה בלוח הבקרה את שמות המשפחות של כל
// שאר המחלקות — בדיוק הדליפה שנסגרה בסרגל ובמסלולי ה-API.
//
// ⚠️ מיפוי מפורש ולא נגזר: סוג משימה חדש שיתווסף בלי שורה כאן ייכשל
// בבירור (undefined → נופל מהרשימה) במקום לדלוף בשקט.
// ─────────────────────────────────────────────────────────────────────────────

export type TaskType = 'beneficiary' | 'loan' | 'maternity' | 'widow' | 'financial_aid'

export interface TaskLike {
  type: TaskType
  name?: string
}

export const TASK_TYPE_SECTION: Record<TaskType, SectionKey> = {
  beneficiary:   'beneficiaries',
  loan:          'loans',
  maternity:     'maternity',
  widow:         'widows',
  financial_aid: 'financial_aid',
}

export function visibleTasks<T extends TaskLike>(
  tasks: readonly T[],
  role: UserRole | undefined,
  permissions: UserPermissions | undefined,
  isAdmin: boolean,
): T[] {
  if (isAdmin) return [...tasks]
  return tasks.filter(task => {
    const section = TASK_TYPE_SECTION[task.type]
    if (!section) return false
    return roleAllows(role, permissions, section, 'view')
  })
}
