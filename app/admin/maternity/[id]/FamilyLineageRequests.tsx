'use client'
// 🔴 A3: בקשת תיקון סדר הדורות שהמשפחה שלחה בקישור ולא הוחלה אוטומטית.
// אישור וסגירה עוברים דרך /api/admin/lineage/requests — אותו מסלול כמו
// במסך "בקשות משפחות", כך שהבקשה נסגרת בשני המקומות יחד.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Inbox } from 'lucide-react'
import LineageChainEditButton from '@/components/lineage/LineageChainEditButton'
import type { FamilyLineageRequest } from '@/lib/familyLineageRequests'

const fmt = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })
}

export default function FamilyLineageRequests({ beneficiaryId, requests, canApprove }: {
  beneficiaryId: string
  requests: FamilyLineageRequest[]
  canApprove: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const act = async (id: string, action: 'approve' | 'reject') => {
    if (action === 'reject' && !confirm('לסגור את הבקשה בלי להחיל את השרשרת של המשפחה?')) return
    setBusy(id); setError('')
    try {
      const res = await fetch('/api/admin/lineage/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, ...(action === 'reject' ? { staffNote: 'נסגר מתיק היולדת' } : {}) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'הפעולה נכשלה'); return }
      router.refresh()
    } catch {
      setError('שגיאת רשת. נסו שוב.')
    } finally {
      setBusy(null)
    }
  }

  if (!requests.length) return null
  return (
    <div className="mb-3 flex flex-col gap-2">
      {requests.map(r => (
        <div key={r.id} className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <Inbox size={14} />
            המשפחה שלחה תיקון לסדר הדורות
          </div>
          <p className="mt-1 text-xs text-amber-900">
            {fmt(r.createdAt)}{r.reviewerName ? ` · ${r.reviewerName}` : ''} · ממתין לאישור
          </p>
          {r.reason && <p className="mt-1 text-xs text-amber-800">לא הוחל אוטומטית: {r.reason}</p>}
          {r.chain.length > 0 && (
            <ol className="mt-2 flex flex-wrap gap-1.5">
              {r.chain.map(c => (
                <li key={c.generation} className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-xs text-slate-800">
                  <span className="text-slate-400">{c.generation}.</span> {c.name}
                  {c.relation === 'son_in_law' ? ' (חתן)' : ''}
                </li>
              ))}
            </ol>
          )}
          {canApprove ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy === r.id || !r.chain.length} onClick={() => act(r.id, 'approve')}
                className="rounded-lg bg-navy px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                {busy === r.id ? 'מחיל…' : 'אישור והחלת התיקון'}
              </button>
              <LineageChainEditButton beneficiaryId={beneficiaryId} initialChain={r.chain} label="עריכה לפני שמירה" compact />
              <button type="button" disabled={busy === r.id} onClick={() => act(r.id, 'reject')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50">
                סגירה בלי להחיל
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-600">לאישור הבקשה נדרשת הרשאת עריכה בעץ הדורות.</p>
          )}
          <p className="mt-1.5 text-[11px] text-slate-500">
            אחרי &quot;עריכה לפני שמירה&quot; לחצו &quot;סגירה בלי להחיל&quot;, כדי שהבקשה לא תישאר פתוחה.
          </p>
        </div>
      ))}
      {error && <p role="alert" className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  )
}
