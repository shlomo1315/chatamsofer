import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/apiAuth'

// ─────────────────────────────────────────────────────────────────────────────
// הגדרות תזכורת שיוך/איסוף כרטיס מזון.
//
// התזכורת נשלחת ליולדת ש:
//   • לידתה אושרה (status='active'),
//   • והכרטיס עדיין לא שויך (card_picked_up_at ריק).
// מתי: לפי firstDays ימים אחרי *הלידה* (birth_date). אפשר גם תזכורת שנייה
// (secondDays) אם עדיין לא שויך. ניתן לעריכה במסך ההגדרות.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'card_pickup_reminder'
export const DEFAULT_FIRST_DAYS = 14   // שבועיים אחרי הלידה
export const DEFAULT_SECOND_DAYS = 21  // שבוע נוסף (ברירת מחדל)

export type CardReminderSettings = {
  enabled: boolean
  firstDays: number
  secondDays: number | null   // null = בלי תזכורת שנייה
}

const DEFAULTS: CardReminderSettings = {
  enabled: true,
  firstDays: DEFAULT_FIRST_DAYS,
  secondDays: DEFAULT_SECOND_DAYS,
}

export async function getCardReminderSettings(admin?: SupabaseClient): Promise<CardReminderSettings> {
  const client = admin ?? getServiceClient()
  if (!client) return DEFAULTS
  const { data } = await client.from('app_settings').select('value').eq('key', KEY).maybeSingle()
  if (!data?.value) return DEFAULTS
  try {
    const v = JSON.parse(data.value) as Partial<CardReminderSettings>
    const firstDays = Number.isFinite(Number(v.firstDays)) && Number(v.firstDays) >= 0 ? Math.trunc(Number(v.firstDays)) : DEFAULT_FIRST_DAYS
    const secondRaw = v.secondDays
    const secondDays = secondRaw == null ? null
      : (Number.isFinite(Number(secondRaw)) && Number(secondRaw) > firstDays ? Math.trunc(Number(secondRaw)) : null)
    return {
      enabled: v.enabled !== false,
      firstDays,
      secondDays,
    }
  } catch {
    return DEFAULTS
  }
}

export async function saveCardReminderSettings(admin: SupabaseClient, s: CardReminderSettings): Promise<boolean> {
  const { error } = await admin.from('app_settings').upsert(
    { key: KEY, value: JSON.stringify(s), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return !error
}
