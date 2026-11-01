// עזרי שרת לארכיון: ספירות וקאברים נשמרים באירוע עצמו, כדי לעקוף את מגבלת 1000 השורות של Supabase.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function recomputeEvent(db: SupabaseClient, eventId: string): Promise<void> {
  const [{ count: photos }, { count: videos }, { data: covers }] = await Promise.all([
    db.from('archive_files').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('kind', 'image'),
    db.from('archive_files').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('kind', 'video'),
    db.from('archive_files').select('id').eq('event_id', eventId).eq('has_thumb', true)
      .order('kind', { ascending: true }).order('created_at', { ascending: true }).limit(3),
  ])
  await db.from('archive_events').update({
    photo_count: photos ?? 0,
    video_count: videos ?? 0,
    cover_file_ids: (covers ?? []).map(c => c.id as string),
    updated_at: new Date().toISOString(),
  }).eq('id', eventId)
}
