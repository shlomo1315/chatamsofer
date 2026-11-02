import { describe, it, expect } from 'vitest'
import { buildFixHistory } from './docsFixHistory'

describe('buildFixHistory', () => {
  const req = { required_docs: 'id_card, birth_cert', docs_notes: ' חסר ', requested_by_name: 'רחל', created_at: '2026-07-10T08:00:00Z' }

  it('מסמך שהועלה אחרי הבקשה הושלם; מסמך שהועלה לפניה לא נחשב', () => {
    const [h] = buildFixHistory([req], [
      { doc_type: 'id_card', uploaded_at: '2026-07-09T08:00:00Z' },
      { doc_type: 'id_card', uploaded_at: '2026-07-11T08:00:00Z' },
      { doc_type: 'id_card', uploaded_at: '2026-07-12T08:00:00Z' },
    ])
    expect(h.items).toEqual([
      { docType: 'id_card', doneAt: '2026-07-11T08:00:00Z' },
      { docType: 'birth_cert', doneAt: null },
    ])
    expect(h.complete).toBe(false)
    expect(h.notes).toBe('חסר')
  })

  it('הושלם רק כשכל המסמכים הועלו, והחדשה ראשונה', () => {
    const old = { ...req, created_at: '2026-06-01T08:00:00Z', required_docs: 'x' }
    const out = buildFixHistory([old, req], [
      { doc_type: 'id_card', uploaded_at: '2026-07-11T08:00:00Z' },
      { doc_type: 'birth_cert', uploaded_at: '2026-07-11T09:00:00Z' },
    ])
    expect(out.map(o => o.requestedAt)).toEqual([req.created_at, old.created_at])
    expect(out[0].complete).toBe(true)
    expect(out[1].complete).toBe(false)
  })
})
