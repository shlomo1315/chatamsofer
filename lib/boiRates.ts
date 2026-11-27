// שער יציג דולר-שקל מבנק ישראל, לדוח החיובים לנדיב (lib/donorCharges).
// ⚠️ זה שער משוער להמחשה: אמקס מחייבת בשער שלה ובמועד הסליקה שלה. לכן לא
// ממציאים שער: אם בנק ישראל לא ענה, התאים נשארים ריקים.
// ביום שאין בו שער (שבת, חג, או היום לפני הפרסום) לוקחים את השער האחרון
// שפורסם לפניו, ומציגים את תאריך השער לצד הערך.

export interface DayRate { rate: number; date: string }
export type RateMap = Record<string, DayRate | null>

const BOI_URL = 'https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/RER_USD_ILS'
const DAY_MS = 86_400_000
/** כמה ימים אחורה מחפשים שער קודם (חגי תשרי יכולים לסגור כמה ימים ברצף) */
const LOOKBACK_DAYS = 10
const CACHE_MS = 6 * 3_600_000

const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY_MS).toISOString().slice(0, 10)

/** קורא את קובץ ה-CSV של בנק ישראל לפי שמות העמודות TIME_PERIOD ו-OBS_VALUE */
export function parseBoiCsv(csv: string): DayRate[] {
  const lines = csv.trim().split(/\r?\n/)
  const head = (lines.shift() ?? '').split(',').map(h => h.trim())
  const di = head.indexOf('TIME_PERIOD'), vi = head.indexOf('OBS_VALUE')
  if (di < 0 || vi < 0) return []
  const out: DayRate[] = []
  for (const line of lines) {
    const cols = line.split(',')
    const date = cols[di]?.trim(), rate = Number(cols[vi])
    if (/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') && Number.isFinite(rate) && rate > 0) out.push({ date: date!, rate })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** לכל יום: השער שפורסם באותו יום, או האחרון שלפניו (עד LOOKBACK_DAYS ימים) */
export function ratesForDays(points: DayRate[], days: string[]): RateMap {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const out: RateMap = {}
  for (const day of days) {
    let hit: DayRate | null = null
    for (const p of sorted) { if (p.date > day) break; hit = p }
    out[day] = hit && hit.date >= addDays(day, -LOOKBACK_DAYS) ? hit : null
  }
  return out
}

/** סכום בדולרים לפי השער, מעוגל לסנט */
export const toUsd = (ils: number, rate: number) => Math.round((ils / rate) * 100) / 100

// מטמון לפי טווח: הדף מתרענן כל דקה, ובלי מטמון כל רענון היה פונה לבנק ישראל.
// כישלון נשמר ל-5 דקות (points ריק), כדי שבנק ישראל איטי לא יעכב כל רענון.
const cache = new Map<string, { until: number; points: DayRate[] }>()
const FAIL_MS = 5 * 60_000

/** שולף את השערים לימים שנבחרו. מחזיר null אם בנק ישראל לא זמין. */
export async function loadUsdRates(days: string[], fetcher: typeof fetch = fetch): Promise<RateMap | null> {
  if (!days.length) return {}
  const sorted = [...days].sort()
  const start = addDays(sorted[0], -LOOKBACK_DAYS), end = sorted[sorted.length - 1]
  const key = `${start}|${end}`
  const hit = cache.get(key)
  let points = hit && hit.until > Date.now() ? hit.points : null
  if (!points) {
    points = []
    try {
      const res = await fetcher(`${BOI_URL}?startperiod=${start}&endperiod=${end}&format=csv`, { signal: AbortSignal.timeout(6000), cache: 'no-store' })
      if (res.ok) points = parseBoiCsv(await res.text())
      else console.error('[boiRates] status', res.status)
    } catch (e) {
      console.error('[boiRates]', e)
    }
    if (cache.size > 200) cache.clear()
    cache.set(key, { until: Date.now() + (points.length ? CACHE_MS : FAIL_MS), points })
  }
  return points.length ? ratesForDays(points, sorted) : null
}

/** לבדיקות בלבד */
export const clearRateCache = () => cache.clear()
