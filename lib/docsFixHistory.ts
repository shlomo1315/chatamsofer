// היסטוריית תיקונים: לכל בקשת השלמה — אילו מסמכים התבקשו ומתי כל אחד הושלם.
// מסמך נחשב שהושלם כשהועלה מסמך מאותו סוג אחרי מועד הבקשה (הראשון שהועלה).

export interface FixRequestRow { required_docs: string | null; docs_notes: string | null; requested_by_name: string | null; created_at: string }
export interface UploadedDocRow { doc_type: string; uploaded_at: string }

export interface FixHistoryItem { docType: string; doneAt: string | null }
export interface FixHistoryEntry {
  requestedAt: string
  requestedBy: string | null
  notes: string | null
  items: FixHistoryItem[]
  /** כל המסמכים שהתבקשו הושלמו */
  complete: boolean
}

export function buildFixHistory(requests: FixRequestRow[], docs: UploadedDocRow[]): FixHistoryEntry[] {
  return [...requests]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(r => {
      const since = new Date(r.created_at).getTime()
      const items = (r.required_docs ?? '').split(',').map(s => s.trim()).filter(Boolean).map(docType => {
        const times = docs
          .filter(d => d.doc_type === docType && new Date(d.uploaded_at).getTime() >= since)
          .map(d => d.uploaded_at)
          .sort()
        return { docType, doneAt: times[0] ?? null }
      })
      return {
        requestedAt: r.created_at,
        requestedBy: r.requested_by_name?.trim() || null,
        notes: r.docs_notes?.trim() || null,
        items,
        complete: items.length > 0 && items.every(i => i.doneAt),
      }
    })
}
