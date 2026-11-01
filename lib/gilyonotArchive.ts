import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// פרסום גיליון בארכיון הציבורי ובטולו. הארכיון הציבורי (/archive/gilyonot) קורא
// רק את התצוגה gilyonot_public_archive ואת הדלי הציבורי gilyonot-public.
// בפרסום מעתיקים את הקובץ מ-documents לדלי הציבורי בשם אקראי (archive_id), כך
// שאין קשר בין הקישור הציבורי לנתיב הפנימי או למזהה הגיליון.
// ─────────────────────────────────────────────────────────────────────────────

export const PUBLIC_BUCKET = 'gilyonot-public'

const MIME: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export function mimeFor(fileName: string, blobType?: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return MIME[ext] ?? (blobType || 'application/octet-stream')
}

export async function publishIssue(
  db: SupabaseClient, issueId: string, opts: { topic?: string | null; date?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: issue } = await db.from('gilyonot_issues').select('file_path, file_name, archive_id, archive_published').eq('id', issueId).maybeSingle()
  if (!issue) return { ok: false, error: 'הגיליון לא נמצא' }
  const archiveId = issue.archive_id ?? randomUUID()
  const { data: blob, error } = await db.storage.from('documents').download(issue.file_path)
  if (error || !blob) return { ok: false, error: 'קובץ הגיליון לא נמצא' }
  const { error: upErr } = await db.storage.from(PUBLIC_BUCKET)
    .upload(archiveId, Buffer.from(await blob.arrayBuffer()), { contentType: mimeFor(issue.file_name, blob.type), upsert: true })
  if (upErr) return { ok: false, error: 'העתקת הקובץ לארכיון נכשלה' }
  const { error: updErr } = await db.from('gilyonot_issues').update({
    archive_published: true, archive_published_at: new Date().toISOString(), archive_id: archiveId,
    archive_topic: opts.topic?.trim().slice(0, 60) || null, archive_date: opts.date || null,
  }).eq('id', issueId)
  if (updErr) { await db.storage.from(PUBLIC_BUCKET).remove([archiveId]); return { ok: false, error: 'עדכון הגיליון נכשל' } }
  return { ok: true }
}

/** ביטול פרסום: מוחק את הקובץ מהדלי הציבורי ומכבה את הדגל. מזהה חדש יונפק בפרסום הבא. */
export async function unpublishIssue(db: SupabaseClient, issueId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: issue } = await db.from('gilyonot_issues').select('archive_id').eq('id', issueId).maybeSingle()
  if (!issue) return { ok: false, error: 'הגיליון לא נמצא' }
  const { error } = await db.from('gilyonot_issues').update({ archive_published: false, archive_published_at: null, archive_id: null }).eq('id', issueId)
  if (error) return { ok: false, error: 'עדכון הגיליון נכשל' }
  if (issue.archive_id) await db.storage.from(PUBLIC_BUCKET).remove([issue.archive_id])
  return { ok: true }
}
