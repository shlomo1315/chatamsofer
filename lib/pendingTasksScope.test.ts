import { describe, it, expect } from 'vitest'
import { TASK_TYPE_SECTION, visibleTasks, type TaskLike } from './pendingTasksScope'
import type { UserPermissions } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// פאנל "ממתינים לטיפול" מאחד חמש מחלקות לרשימה אחת — ובכללן אלמנות
// ויתומים. בלי סינון, משתמש שהורשה להלוואות בלבד ראה בלוח הבקרה את שמות
// המשפחות של כל המחלקות האחרות.
//
// ⚠️ הסינון בשרת ולא בתצוגה: השמות מגיעים ל-HTML בכל מקרה אם רק מסתירים.
// ─────────────────────────────────────────────────────────────────────────────

const t = (type: TaskLike['type'], name: string): TaskLike => ({ type, name })

const ALL: TaskLike[] = [
  t('beneficiary', 'כהן'),
  t('loan', 'לוי'),
  t('maternity', 'מזרחי'),
  t('widow', 'אלמנה'),
  t('financial_aid', 'פרידמן'),
]

describe('visibleTasks', () => {
  it('משתמש עם הלוואות בלבד רואה רק הלוואות', () => {
    const perms: UserPermissions = { loans: 'edit' }
    const out = visibleTasks(ALL, 'reviewer', perms, false)
    expect(out.map(x => x.type)).toEqual(['loan'])
  })

  it('🔴 הרגרסיה: אלמנות אינן דולפות למי שאינו מורשה', () => {
    const out = visibleTasks(ALL, 'reviewer', { loans: 'edit' }, false)
    expect(out.some(x => x.type === 'widow')).toBe(false)
    expect(out.some(x => x.name === 'אלמנה')).toBe(false)
  })

  it('מנהל רואה הכל', () => {
    expect(visibleTasks(ALL, 'admin', {}, true)).toHaveLength(5)
  })

  it('משתמש בלי הרשאות אינו רואה דבר', () => {
    expect(visibleTasks(ALL, 'reviewer', {}, false)).toHaveLength(0)
  })

  it('מזכירות ללא סימון אינה רואה משימות — הרצפה בוטלה', () => {
    // 🔴 עד כה מזכירה קיבלה צאצאים אוטומטית, וכרטיס 'ממתינים לטיפול'
    // ספר לה משימות ממחלקה שלא סומנה לה. הסימון הוא מקור האמת היחיד.
    expect(visibleTasks(ALL, 'secretary', {}, false)).toHaveLength(0)
  })

  it('הספירה מוגבלת למחלקות שסומנו בלבד', () => {
    const out = visibleTasks(ALL, 'secretary', { loans: 'add' }, false)
    const types = out.map(x => x.type)
    expect(types).not.toContain('beneficiary')
    expect(out.every(t => TASK_TYPE_SECTION[t.type] === 'loans')).toBe(true)
  })

  it('כל סוג משימה ממופה למחלקה — אין סוג יתום שידלוף', () => {
    for (const task of ALL) {
      expect(TASK_TYPE_SECTION[task.type]).toBeTruthy()
    }
  })
})
