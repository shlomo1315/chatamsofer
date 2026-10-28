import { describe, it, expect, vi } from 'vitest'
import { runGuardedSend } from './verifySendGuard'

describe('runGuardedSend', () => {
  it('טלפון רשום — לא שולחים', async () => {
    const send = vi.fn(async () => {})
    expect(await runGuardedSend('0527101315', async () => false, send)).toBe('blocked')
    expect(send).not.toHaveBeenCalled()
  })
  it('טלפון פנוי — שולחים', async () => {
    const send = vi.fn(async () => {})
    expect(await runGuardedSend('0521111111', async () => true, send)).toBe('sent')
    expect(send).toHaveBeenCalledOnce()
  })
  it('בלי בדיקה מקדימה — שולחים', async () => {
    const send = vi.fn(async () => {})
    expect(await runGuardedSend('x', undefined, send)).toBe('sent')
    expect(send).toHaveBeenCalledOnce()
  })
})
