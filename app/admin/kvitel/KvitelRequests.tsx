'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { decodeKvitelPayload, type KvitelScrambled } from '@/lib/kvitelPayload'
import type { KvitelFilters, KvitelRequestRow } from '@/lib/kvitelQuery'
import KvitelClient from './KvitelClient'
import KvitelWeek from './KvitelWeek'

// טוען את הבקשות מה-API המעורבל (ולא מוטמעות ב-HTML): נטפרי חסם את הדף כשהטקסט החופשי היה גלוי בו.
// "רענון" אחרי שמירה = טעינה מחדש של הרשימה בלבד, בלי רענון של כל הדף.
export default function KvitelRequests({ filters, canEdit, tabs }: { filters: KvitelFilters; canEdit: boolean; tabs?: ReactNode }) {
  const [rows, setRows] = useState<KvitelRequestRow[] | null>(null)
  const [raw, setRaw] = useState<KvitelRequestRow[] | null>(null)   // כמו מהשרת — למסך "השבוע"
  const [error, setError] = useState('')
  // מסך "השבוע" הוא ברירת המחדל; כתובת עם סינון (תאריך, ערוץ, חיפוש) פותחת ישר את הרשימה המלאה
  const filtered = !!(filters.from || filters.to || filters.channel || filters.type || filters.q) || filters.status !== 'open'
  const [view, setView] = useState<'week' | 'list'>(filtered ? 'list' : 'week')
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString()

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/kvitel/requests?${query}`, { credentials: 'same-origin', cache: 'no-store' })
      if (!res.ok) throw new Error()
      const loaded = decodeKvitelPayload<KvitelRequestRow[]>(await res.json() as KvitelScrambled)
      setRaw(loaded)
      // אין מצב "דורש בדיקה": בקשה שנקלטה נחשבת "לא נשלח" (ממתין). לתצוגה בלבד, השרת לא משתנה.
      setRows(loaded.map(r => (r.status === 'review' ? { ...r, status: 'pending' as const, needsReview: true } : r)))
      setError('')
    } catch {
      setError('טעינת הבקשות נכשלה. נסו לרענן את הדף.')
    }
  }, [query])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  if (rows === null) {
    return (
      <div className="space-y-6">
        {tabs}
        {error
          ? <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
          : <p className="py-10 text-center text-ink-faint">טוען בקשות…</p>}
      </div>
    )
  }
  if (view === 'week') {
    return <KvitelWeek rows={raw ?? []} filters={filters} canEdit={canEdit} tabs={tabs} onReload={load} />
  }
  return (
    <div className="space-y-4">
      <button type="button" onClick={() => setView('week')} className="text-sm font-semibold text-[#14213D] underline">חזרה לשבוע</button>
      <KvitelClient allRows={rows} filters={filters} canEdit={canEdit} tabs={tabs} onReload={load} />
    </div>
  )
}
