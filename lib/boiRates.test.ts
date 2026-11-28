import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRateCache, loadUsdRates, parseBoiCsv, ratesForDays, toUsd } from './boiRates'

// מבנה אמיתי של התשובה מבנק ישראל (format=csv), מקוצר
const CSV = [
  'DATAFLOW,SERIES_CODE,FREQ,BASE_CURRENCY,COUNTER_CURRENCY,UNIT_MEASURE,DATA_TYPE,DATA_SOURCE,TIME_COLLECT,CONF_STATUS,PUB_WEBSITE,UNIT_MULT,COMMENTS,TIME_PERIOD,OBS_VALUE,RELEASE_STATUS',
  'BOI.STATISTICS:EXR(1.0),RER_USD_ILS,D,USD,ILS,ILS,OF00,BOI_MARKETS,V,F,Y,0,,2026-08-17,2.95,',
  'BOI.STATISTICS:EXR(1.0),RER_USD_ILS,D,USD,ILS,ILS,OF00,BOI_MARKETS,V,F,Y,0,,2026-08-14,2.954,',
  'BOI.STATISTICS:EXR(1.0),RER_USD_ILS,D,USD,ILS,ILS,OF00,BOI_MARKETS,V,F,Y,0,,2026-08-18,2.986,',
].join('\n')

describe('parseBoiCsv', () => {
  it('קורא לפי שם העמודה וממיין לפי תאריך', () => {
    expect(parseBoiCsv(CSV)).toEqual([
      { date: '2026-08-14', rate: 2.954 }, { date: '2026-08-17', rate: 2.95 }, { date: '2026-08-18', rate: 2.986 },
    ])
  })
  it('קובץ בלי העמודות או עם ערכים פגומים: ריק', () => {
    expect(parseBoiCsv('a,b\n1,2')).toEqual([])
    expect(parseBoiCsv('TIME_PERIOD,OBS_VALUE\n2026-08-14,\nbad,3')).toEqual([])
  })
})

describe('ratesForDays', () => {
  const points = parseBoiCsv(CSV)
  it('שבת וראשון בלי שער לוקחים את שער שישי, ומציגים את תאריך השער', () => {
    expect(ratesForDays(points, ['2026-08-15', '2026-08-16', '2026-08-17'])).toEqual({
      '2026-08-15': { date: '2026-08-14', rate: 2.954 },
      '2026-08-16': { date: '2026-08-14', rate: 2.954 },
      '2026-08-17': { date: '2026-08-17', rate: 2.95 },
    })
  })
  it('אין שער לפני היום, או שהאחרון ישן מעשרה ימים: ריק', () => {
    expect(ratesForDays(points, ['2026-08-13', '2026-08-29'])).toEqual({ '2026-08-13': null, '2026-08-29': null })
  })
  it('המרה לדולרים מעוגלת לסנט', () => {
    expect(toUsd(500, 2.954)).toBe(169.26)
  })
})

describe('loadUsdRates', () => {
  beforeEach(() => clearRateCache())
  it('פונה לבנק ישראל עם טווח שמתחיל עשרה ימים קודם, ושומר במטמון', async () => {
    const fetcher = vi.fn(async () => new Response(CSV))
    const r = await loadUsdRates(['2026-08-16'], fetcher as never)
    expect(r).toEqual({ '2026-08-16': { date: '2026-08-14', rate: 2.954 } })
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain('RER_USD_ILS?startperiod=2026-08-06&endperiod=2026-08-16&format=csv')
    await loadUsdRates(['2026-08-16'], fetcher as never)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('בנק ישראל לא זמין או מחזיר שגיאה: null, בלי להמציא שער', async () => {
    expect(await loadUsdRates(['2026-08-16'], (async () => { throw new Error('net') }) as never)).toBeNull()
    clearRateCache()
    expect(await loadUsdRates(['2026-08-16'], (async () => new Response('x', { status: 500 })) as never)).toBeNull()
  })
  it('בלי ימים: בלי פנייה', async () => {
    const fetcher = vi.fn()
    expect(await loadUsdRates([], fetcher as never)).toEqual({})
    expect(fetcher).not.toHaveBeenCalled()
  })
})
