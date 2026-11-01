import { describe, it, expect, vi } from 'vitest'
import { planImport, runImport, createJob, getJob, activeJobFor, dupKey, type ImportDeps } from './archiveImport'
import type { DriveMedia } from './googleDrive'

const m = (name: string, o: Partial<DriveMedia> = {}): DriveMedia => ({
  id: 'd-' + name, name, mime: name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg', size: 100,
  width: null, height: null, durationSec: null, ...o,
})

describe('planImport', () => {
  it('מדלג על כפילויות וקבצים שכבר באירוע', () => {
    const { todo, skipped } = planImport(
      [m('a.jpg'), m('a.jpg'), m('b.jpg'), m('c.mp4'), m('x.txt', { mime: 'text/plain' })],
      new Set([dupKey('b.jpg', 100)]),
    )
    expect(todo.map(f => f.name)).toEqual(['a.jpg', 'c.mp4'])
    expect(skipped).toBe(3)
  })
})

describe('runImport', () => {
  const deps = (o: Partial<ImportDeps> = {}): ImportDeps => ({
    copy: async f => 'new-' + f.id,
    save: async (f) => 'rec-' + f.name,
    thumb: async () => {},
    finish: async () => {},
    ...o,
  })

  it('מייבא הכול, סופר התקדמות וקורא לסיום', async () => {
    const job = createJob('11111111-1111-1111-1111-111111111111', 4)
    const finish = vi.fn(async () => {})
    const thumb = vi.fn(async () => {})
    await runImport(job, [m('1.jpg'), m('2.jpg'), m('3.mp4'), m('4.jpg')], deps({ finish, thumb }))
    expect(job).toMatchObject({ state: 'done', done: 4, failed: 0 })
    expect(finish).toHaveBeenCalledOnce()
    expect(thumb).toHaveBeenCalledTimes(4)
  })

  it('קובץ שנכשל לא עוצר את השאר, וההודעה נשמרת', async () => {
    const job = createJob('22222222-2222-2222-2222-222222222222', 3)
    await runImport(job, [m('1.jpg'), m('bad.jpg'), m('3.jpg')], deps({
      copy: async f => { if (f.name === 'bad.jpg') throw new Error('אין הרשאה'); return 'x' },
    }))
    expect(job).toMatchObject({ state: 'done', done: 3, failed: 1 })
    expect(job.lastError).toContain('bad.jpg')
  })

  it('כשל במוקטן לא נחשב כשל בקובץ', async () => {
    const job = createJob('33333333-3333-3333-3333-333333333333', 1)
    await runImport(job, [m('1.jpg')], deps({ thumb: async () => { throw new Error('canvas') } }))
    expect(job).toMatchObject({ state: 'done', failed: 0 })
  })

  it('כשל בסיום מסמן שגיאה', async () => {
    const job = createJob('44444444-4444-4444-4444-444444444444', 1)
    await runImport(job, [m('1.jpg')], deps({ finish: async () => { throw new Error('db') } }))
    expect(job.state).toBe('error')
  })
})

describe('מאגר משימות', () => {
  it('מוצא משימה פעילה לפי אירוע ומזהה', () => {
    const job = createJob('55555555-5555-5555-5555-555555555555', 1)
    expect(getJob(job.id)).toBe(job)
    expect(activeJobFor(job.eventId)).toBe(job)
    expect(getJob('not-a-uuid')).toBeNull()
  })
})
