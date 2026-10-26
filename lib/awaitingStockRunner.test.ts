import { describe, it, expect } from 'vitest'
import { startAwaitingStockRun, awaitingStockIdle, isAwaitingStockRunning } from './awaitingStockRunner'

const tick = () => new Promise(r => setTimeout(r, 5))

describe('startAwaitingStockRun', () => {
  it('חוזר מיד, והחלוקה ממשיכה ברקע', async () => {
    let done = false
    const res = startAwaitingStockRun(async () => { await tick(); done = true })
    expect(res.alreadyRunning).toBe(false)
    expect(done).toBe(false)
    expect(isAwaitingStockRunning()).toBe(true)
    await awaitingStockIdle()
    expect(done).toBe(true)
    expect(isAwaitingStockRunning()).toBe(false)
  })

  it('לא מריץ שתי חלוקות במקביל, ומריץ שוב פעם אחת בסוף', async () => {
    let active = 0, maxActive = 0, calls = 0
    const run = async () => { calls++; active++; maxActive = Math.max(maxActive, active); await tick(); active-- }
    startAwaitingStockRun(run)
    expect(startAwaitingStockRun(run).alreadyRunning).toBe(true)
    expect(startAwaitingStockRun(run).alreadyRunning).toBe(true)
    await awaitingStockIdle()
    expect(maxActive).toBe(1)
    expect(calls).toBe(2)
  })

  it('שגיאה בחלוקה לא משאירה את המנעול תפוס', async () => {
    startAwaitingStockRun(async () => { throw new Error('x') })
    await awaitingStockIdle()
    expect(isAwaitingStockRunning()).toBe(false)
  })
})
