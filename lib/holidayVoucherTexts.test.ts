import { describe, it, expect } from 'vitest'
import { loadHolidayVoucherTexts, HOLIDAY_TEXTS_KEY } from './holidayVoucherTexts'
import { HOLIDAY_VOUCHER_DEFAULTS } from './holidayVoucher'
import type { SupabaseClient } from '@supabase/supabase-js'

// 🔴 המלל שנערך בהגדרות נשמר ל-app_settings אך מעולם לא נטען — התצוגה
// המקדימה והשליחה השתמשו בברירות המחדל הקבועות בקוד. הבדיקות כאן נועלות
// את הטעינה, כי כשל בה שקט לחלוטין: השובר יוצא תקין, רק עם הנוסח הישן.

/** מדמה את שרשרת הקריאה של Supabase, עם הערך שהוחזר מהעמודה. */
function dbWith(value: string | null | undefined): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: value === undefined ? null : { value }, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

describe('loadHolidayVoucherTexts', () => {
  it('אין נוסח שמור — ברירות המחדל', async () => {
    expect(await loadHolidayVoucherTexts(dbWith(undefined))).toEqual(HOLIDAY_VOUCHER_DEFAULTS)
  })

  it('🔴 נוסח שמור נטען ומחליף את ברירת המחדל', async () => {
    // הבאג עצמו: זה מה שלא קרה. עריכה נשמרה ולא הופיעה בשובר.
    const saved = JSON.stringify({ title: 'שובר חג הפסח', footer: 'פסח כשר ושמח' })
    const texts = await loadHolidayVoucherTexts(dbWith(saved))
    expect(texts.title).toBe('שובר חג הפסח')
    expect(texts.footer).toBe('פסח כשר ושמח')
  })

  it('⚠️ שדה שלא נשמר מתמלא מברירת המחדל ולא נשאר undefined', async () => {
    // נוסח שנשמר לפני שנוסף שדה חדש היה מפיל את בניית ה-PDF.
    const texts = await loadHolidayVoucherTexts(dbWith(JSON.stringify({ title: 'רק כותרת' })))
    expect(texts.intro).toBe(HOLIDAY_VOUCHER_DEFAULTS.intro)
    expect(texts.instructions).toEqual(HOLIDAY_VOUCHER_DEFAULTS.instructions)
    expect(texts.footer).toBe(HOLIDAY_VOUCHER_DEFAULTS.footer)
  })

  it('JSON פגום אינו מפיל את השליחה', async () => {
    expect(await loadHolidayVoucherTexts(dbWith('{{{ לא JSON'))).toEqual(HOLIDAY_VOUCHER_DEFAULTS)
  })

  it('"[object Object]" — הסימן לשמירה בלי stringify', async () => {
    // app_settings.value היא עמודת text; שמירת אובייקט גולמי נכשלת בשקט.
    expect(await loadHolidayVoucherTexts(dbWith('[object Object]'))).toEqual(HOLIDAY_VOUCHER_DEFAULTS)
  })

  it('הוראות ריקות חוזרות לברירת המחדל', async () => {
    // שובר בלי הוראות שולח את המשפחה למוקד בלי לדעת מה להביא.
    const texts = await loadHolidayVoucherTexts(dbWith(JSON.stringify({ instructions: [] })))
    expect(texts.instructions).toEqual(HOLIDAY_VOUCHER_DEFAULTS.instructions)
  })

  it('המפתח הוא זה שהמסך בהגדרות שומר אליו', () => {
    expect(HOLIDAY_TEXTS_KEY).toBe('holiday_voucher_texts')
  })
})
