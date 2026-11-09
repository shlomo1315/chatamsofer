import { describe, it, expect, vi } from 'vitest'
import { fetchWithRetry } from './fetchRetry'

const res = (status: number) => ({ status, ok: status < 400 }) as Response

describe('fetchWithRetry', () => {
  it('מצליח בניסיון ראשון בלי חזרה', async () => {
    const f = vi.fn().mockResolvedValue(res(200))
    expect((await fetchWithRetry('/x', {}, 2, 0, f)).status).toBe(200)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('חוזר אחרי ניתוק חיבור', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('x')).mockResolvedValue(res(200))
    expect((await fetchWithRetry('/x', {}, 2, 0, f)).status).toBe(200)
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('חוזר אחרי 502 ומחזיר את התגובה האחרונה', async () => {
    const f = vi.fn().mockResolvedValue(res(502))
    expect((await fetchWithRetry('/x', {}, 2, 0, f)).status).toBe(502)
    expect(f).toHaveBeenCalledTimes(3)
  })
  it('לא חוזר על 400', async () => {
    const f = vi.fn().mockResolvedValue(res(400))
    await fetchWithRetry('/x', {}, 2, 0, f)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('זורק אחרי שכל הניסיונות נכשלו', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('x'))
    await expect(fetchWithRetry('/x', {}, 2, 0, f)).rejects.toThrow()
    expect(f).toHaveBeenCalledTimes(3)
  })
})
