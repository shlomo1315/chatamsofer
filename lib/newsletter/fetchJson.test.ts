import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchJson, SERVER_UNAVAILABLE } from './fetchJson'

const html403 = () => new Response('<html><head><title>403 Forbidden</title></head></html>', { status: 403, headers: { 'Content-Type': 'text/html' } })
const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 })

afterEach(() => vi.unstubAllGlobals())

describe('fetchJson', () => {
  it('מחזיר את ה-JSON כשהשרת עונה תקין', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok()))
    await expect(fetchJson('/x')).resolves.toEqual({ ok: true, status: 200, data: { ok: true } })
  })

  it('מחזיר שגיאת JSON של השרת כמו שהיא, בלי ניסיון חוזר', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'לא ניתן לערוך' }), { status: 400 }))
    vi.stubGlobal('fetch', f)
    const r = await fetchJson<{ error: string }>('/x', undefined, { retries: 1, retryDelayMs: 0 })
    expect(r).toEqual({ ok: false, status: 400, data: { error: 'לא ניתן לערוך' } })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('דף HTML במקום JSON מחזיר הודעה ברורה ולא Unexpected token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(html403()))
    await expect(fetchJson('/x')).rejects.toThrow(SERVER_UNAVAILABLE)
  })

  it('מנסה שוב פעם אחת ומצליח', async () => {
    const f = vi.fn().mockResolvedValueOnce(html403()).mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', f)
    await expect(fetchJson('/x', { method: 'PATCH' }, { retries: 1, retryDelayMs: 0 })).resolves.toMatchObject({ ok: true })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('ניתוק רשת אחרי הניסיון החוזר מחזיר הודעה ברורה', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', f)
    await expect(fetchJson('/x', undefined, { retries: 1, retryDelayMs: 0 })).rejects.toThrow(SERVER_UNAVAILABLE)
    expect(f).toHaveBeenCalledTimes(2)
  })
})
