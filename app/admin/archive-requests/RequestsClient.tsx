'use client'

import { useState } from 'react'

export interface RequestView {
  id: string; created_at: string; body: string; area: string
  sender_name: string; sender_contact: string; summary: string | null
  status: 'pending' | 'approved' | 'rejected'
}

const STATUS = { pending: 'ממתינה לאישור', approved: 'אושרה', rejected: 'נדחתה' } as const

export default function RequestsClient({ rows }: { rows: RequestView[] }) {
  const [items, setItems] = useState(rows)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  async function decide(id: string, action: 'approve' | 'reject') {
    setBusy(id); setErr('')
    try {
      const res = await fetch('/api/admin/archive-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error ?? 'הפעולה נכשלה'); return }
      setItems(list => list.map(r => r.id === id ? { ...r, status: action === 'approve' ? 'approved' : 'rejected' } : r))
    } catch { setErr('הפעולה נכשלה') } finally { setBusy(null) }
  }

  const pending = items.filter(r => r.status === 'pending')
  const done = items.filter(r => r.status !== 'pending')

  const card = (r: RequestView) => (
    <article key={r.id} style={{ background: '#fff', border: '1px solid #e5e1d8', borderRadius: 12, padding: 16, display: 'grid', gap: 8 }}>
      <b style={{ fontSize: 17 }}>{r.summary || r.body.slice(0, 140)}</b>
      {r.area && <div style={{ color: '#5f5a52' }}>מקום: {r.area}</div>}
      <details>
        <summary style={{ cursor: 'pointer', color: '#1e2a44' }}>הטקסט המלא של הגולש</summary>
        <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{r.body}</p>
      </details>
      <div style={{ color: '#5f5a52', fontSize: 14 }}>
        {r.sender_name || 'ללא שם'}{r.sender_contact ? ` · ${r.sender_contact}` : ''} · {new Date(r.created_at).toLocaleDateString('he-IL')}
      </div>
      {r.status === 'pending' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={busy === r.id} onClick={() => decide(r.id, 'approve')}
            style={{ minHeight: 44, padding: '0 24px', borderRadius: 10, border: 0, background: '#1e2a44', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>אשר</button>
          <button disabled={busy === r.id} onClick={() => decide(r.id, 'reject')}
            style={{ minHeight: 44, padding: '0 24px', borderRadius: 10, border: '1px solid #c9c4b8', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>דחה</button>
        </div>
      ) : <span style={{ fontWeight: 700 }}>{STATUS[r.status]}</span>}
    </article>
  )

  return (
    <div dir="rtl" style={{ maxWidth: 760, margin: '0 auto', padding: 24, display: 'grid', gap: 16, fontFamily: 'var(--font-heebo), Heebo, sans-serif' }}>
      <h1 style={{ margin: 0 }}>בקשות תיקון מהארכיון</h1>
      <p style={{ margin: 0, color: '#5f5a52' }}>כל בקשה מסוכמת בשורה אחת. אישור מעביר אותה לביצוע.</p>
      {err && <div role="alert" style={{ color: '#b42318' }}>{err}</div>}
      <h2 style={{ margin: '8px 0 0', fontSize: 18 }}>ממתינות ({pending.length})</h2>
      {pending.length ? pending.map(card) : <p>אין בקשות שממתינות.</p>}
      {done.length > 0 && <><h2 style={{ margin: '16px 0 0', fontSize: 18 }}>טופלו</h2>{done.map(card)}</>}
    </div>
  )
}
