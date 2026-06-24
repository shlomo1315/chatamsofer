// תיעוד פעולות מזכירים ל-activity_log — שכבה אחידה לכל המערכת.
// כל פעולה רושמת: מי (user_id), מה (action), על מה (entity), מתי (created_at), ופרטים.
// אינו חוסם את הזרימה — כשל ברישום לא נכשל את הפעולה עצמה.
import type { SupabaseClient } from '@supabase/supabase-js'

export type ActivityEntry = {
  userId?: string | null
  action: string
  entityType?: string | null
  entityId?: string | null
  details?: Record<string, unknown>
}

export async function logActivity(admin: SupabaseClient, entry: ActivityEntry): Promise<void> {
  try {
    await admin.from('activity_log').insert({
      user_id: entry.userId ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      details: entry.details ?? {},
    })
  } catch {
    /* תיעוד הוא best-effort בלבד */
  }
}
