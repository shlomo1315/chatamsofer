import type { SupabaseClient } from '@supabase/supabase-js'
import { israelDay } from '@/lib/kvitelQuery'
import { openKvitelWeek, type KvitelWeekInfo } from '@/lib/kvitelWeek'

// השבוע הפתוח בשרת (סגירת מנה וכותרת הקובץ): הפרשה שאחרי המנה האחרונה — ראו openKvitelWeek.
// בלי טבלת המנות או בשגיאה — השבוע של היום, כמו לפני שהמנות נרשמו.
export async function loadOpenKvitelWeek(db: SupabaseClient, now = new Date()): Promise<KvitelWeekInfo> {
  const { data, error } = await db.from('kvitel_batches')
    .select('closed_at, parsha')
    .order('closed_at', { ascending: false })
    .limit(1)
  if (error) console.error('[kvitel] last batch load failed:', error)
  return openKvitelWeek(error ? null : data?.[0] ?? null, israelDay(now.toISOString()))
}

// התאריך שממנו נבנית כותרת הקובץ (shabbatLabel): צהרי השבת של השבוע
export const weekDate = (w: Pick<KvitelWeekInfo, 'shabbat'>) => new Date(w.shabbat + 'T12:00:00Z')
