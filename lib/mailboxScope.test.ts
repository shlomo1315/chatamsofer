import { describe, it, expect } from 'vitest'
import { scopeInboxToDepartment } from './mailboxScope'

const data = {
  accounts: [
    { id: 'a1', email: 'office@chasamsofer.info', department: 'main' },
    { id: 'a2', email: 'yerid@chasamsofer.info', department: 'yerid' },
    { id: 'a3', email: 'gemach@chasamsofer.info', department: 'gemach' },
  ],
  unreadByDept: { main: 5, yerid: 2, gemach: 1 },
  unreadByAccount: { a1: 5, a2: 2, a3: 1 },
  boxLabels: [{ id: 'l1', account: 'a3', department: 'gemach' }],
  labels: [],
}

describe('scopeInboxToDepartment', () => {
  it('משאיר רק את תיבת היריד, בלי office ובלי תיבות אחרות', () => {
    const s = scopeInboxToDepartment(data, 'yerid')
    expect(s.accounts.map(a => a.email)).toEqual(['yerid@chasamsofer.info'])
    expect(s.unreadByDept).toEqual({ yerid: 2 })
    expect(s.unreadByAccount).toEqual({ a2: 2 })
    expect(s.boxLabels).toEqual([])
  })

  it('בלי מחלקה — הנתונים לא משתנים', () => {
    expect(scopeInboxToDepartment(data, '')).toBe(data)
  })
})
