import { describe, it, expect, vi } from 'vitest'
import { kvitelCloseFlow } from './kvitelCloseFlow'

const setup = (downloadErr: string | null = null, recordOk = true) => {
  const download = vi.fn(async () => downloadErr)
  const record = vi.fn(async () => recordOk)
  return { download, record, flow: kvitelCloseFlow({ download, record }) }
}

describe('הורדת הקוויטלאך וסימון שנשלח לציון הקדוש', () => {
  it('הורדה לבדה (PDF וגם Word) לא מסמנת ולא רושמת מנה', async () => {
    const { download, record, flow } = setup()
    expect(await flow.download(['a', 'b'], 'pdf')).toBeNull()
    expect(await flow.download(['a', 'b'], 'docx')).toBeNull()
    expect(download).toHaveBeenCalledTimes(2)
    expect(download).toHaveBeenLastCalledWith(['a', 'b'], 'docx')
    expect(record).not.toHaveBeenCalled()
  })

  it('רק האישור מסמן — מנה אחת, עם הבקשות שהיו בקובץ', async () => {
    const { record, flow } = setup()
    await flow.download(['a', 'b'], 'pdf')
    expect(await flow.confirm()).toBe(true)
    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith(['a', 'b'])
  })

  it('לחיצה כפולה על האישור לא רושמת מנה כפולה', async () => {
    const { record, flow } = setup()
    await flow.download(['a', 'b'], 'pdf')
    const [x, y] = await Promise.all([flow.confirm(), flow.confirm()])
    expect([x, y, await flow.confirm()]).toEqual([true, true, true])
    expect(record).toHaveBeenCalledTimes(1)
  })

  it('בלי הורדה מוצלחת — האישור לא מסמן כלום', async () => {
    const { record, flow } = setup('ההורדה נכשלה (418)')
    expect(await flow.download(['a'], 'pdf')).toBe('ההורדה נכשלה (418)')
    expect(await flow.confirm()).toBe(false)
    expect(record).not.toHaveBeenCalled()
  })

  it('מסמן רק את מה שירד: בקשה שנכנסה אחרי ההורדה לא מסומנת', async () => {
    const { record, flow } = setup()
    const ids = ['a', 'b']
    await flow.download(ids, 'pdf')
    ids.push('c')
    await flow.confirm()
    expect(record).toHaveBeenCalledWith(['a', 'b'])
  })

  it('רישום שנכשל — אפשר לאשר שוב', async () => {
    const record = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const flow = kvitelCloseFlow({ download: async () => null, record })
    await flow.download(['a'], 'pdf')
    expect(await flow.confirm()).toBe(false)
    expect(await flow.confirm()).toBe(true)
    expect(record).toHaveBeenCalledTimes(2)
  })
})
