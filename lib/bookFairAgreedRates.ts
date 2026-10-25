import { AGREED_RATES_KEY, parseAgreedRates } from './bookFairShipping'

// קריאת טבלת התעריף המוסכם מההגדרות. כשל בקריאה = ברירת המחדל, ולא שגיאה.

type SettingsDb = {
  from: (t: string) => {
    select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => PromiseLike<{ data: { value: unknown } | null }> } }
  }
}

export async function loadAgreedRates(db: SettingsDb): Promise<number[]> {
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', AGREED_RATES_KEY).maybeSingle()
    return parseAgreedRates(data?.value ?? null)
  } catch {
    return parseAgreedRates(null)
  }
}
