import { describe, it, expect } from 'vitest'
import { acquireBackupLock, releaseBackupLock, BACKUP_LOCK_TTL_MS } from './backupLock'

// מסד דמה מינימלי של app_settings (insert עם התנגשות, select, update מותנה, delete)
function fakeAdmin(rows: Record<string, string>) {
  return {
    from() {
      let f: Record<string, string> = {}
      let op = ''
      let payload: any
      const q: any = {
        insert(p: any) { op = 'insert'; payload = p; return q },
        select() { if (!op) op = 'select'; return q },
        update(p: any) { op = 'update'; payload = p; return q },
        delete() { op = 'delete'; return q },
        eq(k: string, v: string) { f[k] = v; return q },
        maybeSingle() { return Promise.resolve({ data: f.key in rows ? { value: rows[f.key] } : null }) },
        then(res: any, rej: any) {
          let out: any
          if (op === 'insert') out = payload.key in rows ? { error: { code: '23505' } } : (rows[payload.key] = payload.value, { error: null })
          else if (op === 'update') out = { data: f.key in rows && rows[f.key] === f.value ? (rows[f.key] = payload.value, [{ key: f.key }]) : [] }
          else { delete rows[f.key]; out = {} }
          return Promise.resolve(out).then(res, rej)
        },
      }
      return q
    },
  } as any
}

describe('backupLock', () => {
  it('שתי הרצות מקבילות — רק אחת מקבלת נעילה', async () => {
    const admin = fakeAdmin({})
    const r = await Promise.all([acquireBackupLock(admin), acquireBackupLock(admin)])
    expect(r.filter(Boolean)).toHaveLength(1)
  })
  it('נעילה טרייה חוסמת, ישנה נתפסת מחדש', async () => {
    const now = new Date('2026-11-06T02:00:00Z')
    const fresh = fakeAdmin({ backup_lock: new Date(now.getTime() - 10 * 60000).toISOString() })
    expect(await acquireBackupLock(fresh, now)).toBe(false)
    const old = fakeAdmin({ backup_lock: new Date(now.getTime() - BACKUP_LOCK_TTL_MS - 1000).toISOString() })
    expect(await acquireBackupLock(old, now)).toBe(true)
  })
  it('שחרור מאפשר הרצה חדשה', async () => {
    const admin = fakeAdmin({})
    expect(await acquireBackupLock(admin)).toBe(true)
    await releaseBackupLock(admin)
    expect(await acquireBackupLock(admin)).toBe(true)
  })
})
