// זמן הסבב השעתי הבא של טעינת כרטיסי יולדות (tickCards ב-instrumentation.ts).
// נשמר ב-globalThis כי instrumentation ונתיבי ה-API עשויים לרוץ במופעי מודול שונים.
const KEY = '__maternityCardNextRunAt'

export function setNextCardRunAt(ms: number): void {
  ;(globalThis as Record<string, unknown>)[KEY] = ms
}

export function getNextCardRunAt(): number | null {
  const v = (globalThis as Record<string, unknown>)[KEY]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// שניות שנותרו עד הריצה (0 אם הזמן עבר), או null אם הזמן אינו ידוע.
export function secondsUntil(nextRunAt: number | null | undefined, now: number): number | null {
  if (typeof nextRunAt !== 'number' || !Number.isFinite(nextRunAt)) return null
  return Math.max(0, Math.ceil((nextRunAt - now) / 1000))
}

export function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m} דקות ו-${s} שניות`
}
