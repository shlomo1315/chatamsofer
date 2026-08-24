import type { SupabaseClient } from '@supabase/supabase-js'
import { HOLIDAY_VOUCHER_DEFAULTS, type HolidayVoucherData } from './holidayVoucher'

// ─────────────────────────────────────────────────────────────────────────────
// טעינת המלל הערוך של שובר החגים.
//
// 🔴 קיים כי גם התצוגה המקדימה וגם השליחה בפועל השתמשו ישירות ב-
// HOLIDAY_VOUCHER_DEFAULTS — ברירות המחדל הקבועות בקוד. המסך בהגדרות
// שמר את הנוסח ל-app_settings, אבל אף אחד לא טען אותו: כל עריכה של
// המלל נשמרה ולא הופיעה בשובר, לא בתצוגה ולא אצל המשפחות.
//
// ⚠️ שני הצרכנים חייבים לקרוא מכאן. טוען נפרד לכל אחד היה מחזיר בדיוק
// את הפער שהתגלה — תצוגה שמראה דבר אחד ושליחה ששולחת אחר.
// ─────────────────────────────────────────────────────────────────────────────

export const HOLIDAY_TEXTS_KEY = 'holiday_voucher_texts'

/**
 * המלל השמור, ממוזג על ברירות המחדל.
 *
 * ⚠️ המיזוג אינו קישוט: נוסח שנשמר לפני שנוסף שדה חדש היה מותיר אותו
 * undefined ומפיל את בניית ה-PDF.
 * ⚠️ app_settings.value היא עמודת text — הערך מגיע כמחרוזת JSON.
 */
export async function loadHolidayVoucherTexts(
  db: SupabaseClient,
): Promise<HolidayVoucherData['texts']> {
  try {
    const { data } = await db
      .from('app_settings')
      .select('value')
      .eq('key', HOLIDAY_TEXTS_KEY)
      .maybeSingle()

    const raw = (data as { value?: string } | null)?.value
    if (!raw) return HOLIDAY_VOUCHER_DEFAULTS

    const parsed = JSON.parse(raw) as Partial<HolidayVoucherData['texts']>
    const merged = { ...HOLIDAY_VOUCHER_DEFAULTS, ...parsed }

    // הוראות ריקות או פגומות — חוזרים לברירת המחדל. שובר בלי הוראות
    // שולח את המשפחה למוקד בלי לדעת מה להביא.
    if (!Array.isArray(merged.instructions) || merged.instructions.length === 0) {
      merged.instructions = HOLIDAY_VOUCHER_DEFAULTS.instructions
    }
    return merged
  } catch {
    // נוסח פגום לא ימנע שליחת שוברים — נופלים לברירת המחדל.
    return HOLIDAY_VOUCHER_DEFAULTS
  }
}
