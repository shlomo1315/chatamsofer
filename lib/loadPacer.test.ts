import { describe, it, expect, vi } from 'vitest'
import { createLoadPacer } from './loadPacer'

describe('קצב טעינות מול נדרים', () => {
  it('ממתין דקה אחרי כל קבוצה של 10 טעינות, ולא באמצע קבוצה', async () => {
    const sleep = vi.fn(async () => {})
    const after = createLoadPacer(10, 60_000, sleep)
    for (let i = 0; i < 9; i++) await after()
    expect(sleep).not.toHaveBeenCalled()
    await after()
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(60_000)
    for (let i = 0; i < 15; i++) await after()
    expect(sleep).toHaveBeenCalledTimes(2)
  })
})
