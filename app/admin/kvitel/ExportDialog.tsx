'use client'

import { useMemo, useState } from 'react'
import { Eye, FileDown, List, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { formatLine } from '@/lib/kvitel'
import { kvitelExportLines, type KvitelRequestRow } from '@/lib/kvitelQuery'
import { KvitelSheet, downloadKvitel } from './KvitelPreview'

// חלונית הייצוא: סיכום של מה שנכנס לקובץ, וסימון "נשלח לציון" לכל בקשה.
// אחרי "ייצוא" — הקובץ יורד, והבקשות שסומנו עוברות ל"נשלח לציון" (done).
//
// ⚠️ "לבדיקה" לא נכנס לקובץ (כמו בשרת, kvitelExportLines) — רק מוצג כמה נשארו בחוץ.

const dateFmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function ExportDialog({ open, onClose, rows, exportHref, canEdit, onDone }: {
  open: boolean
  onClose: () => void
  rows: KvitelRequestRow[]
  exportHref: string
  canEdit: boolean
  onDone: (message: string) => void
}) {
  const exportable = useMemo(() => rows.filter(r => (r.status === 'pending' || r.status === 'done') && r.kvitel_request_lines.length), [rows])
  const markable = exportable.filter(r => r.status === 'pending')
  const reviewCount = rows.filter(r => r.status === 'review').length
  const lineCount = exportable.reduce((n, r) => n + r.kvitel_request_lines.length, 0)

  const previewLines = useMemo(() => kvitelExportLines(rows), [rows])
  const [preview, setPreview] = useState(false)
  const [marked, setMarked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const allMarked = markable.length > 0 && markable.every(r => marked.has(r.id))

  const toggle = (id: string) => setMarked(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  function close() {
    if (busy) return
    setMarked(new Set())
    setError('')
    setPreview(false)
    onClose()
  }

  async function run() {
    setBusy(true)
    setError('')
    try {
      const failed = await downloadKvitel(exportHref)
      if (failed) { setError(failed); return }

      const ids = [...marked]
      if (ids.length) {
        const upd = await fetch('/api/admin/kvitel/requests', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, status: 'done' }),
        })
        const data = await upd.json().catch(() => ({}))
        if (!upd.ok) { setError(`הקובץ ירד, אבל הסימון נכשל: ${data.error || 'שגיאה'}`); return }
        onDone(`הקובץ ירד, ו-${data.updated} בקשות סומנו "נשלח לציון"`)
      } else {
        onDone('הקובץ ירד')
      }
      setMarked(new Set())
    } catch {
      setError('הייצוא נכשל. בדוק את החיבור ונסה שוב.')
    } finally {
      setBusy(false)
    }
  }

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" onClick={close} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-40">
        ביטול
      </button>
      <button type="button" onClick={() => setPreview(p => !p)} disabled={!exportable.length}
        className="flex items-center justify-center gap-2 rounded-lg border border-[#1B3256]/40 bg-white px-4 py-2.5 text-sm font-semibold text-[#1B3256] disabled:opacity-40 sm:ms-auto">
        {preview ? <List className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        {preview ? 'חזרה לרשימה' : 'תצוגה מקדימה'}
      </button>
      <button type="button" onClick={run} disabled={busy || !exportable.length} className="flex items-center justify-center gap-2 rounded-lg bg-[#1B3256] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileDown className="h-4 w-4" aria-hidden />}
        {marked.size ? `ייצוא וסימון ${marked.size} כנשלחו` : 'ייצוא'}
      </button>
    </div>
  )

  return (
    <Modal open={open} onClose={close} title="ייצוא קוויטל" size="lg" footer={footer}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-50 px-4 py-3">
            <p className="text-2xl font-bold text-slate-900">{exportable.length}</p>
            <p className="text-sm text-slate-600">בקשות בקובץ</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-4 py-3">
            <p className="text-2xl font-bold text-slate-900">{lineCount}</p>
            <p className="text-sm text-slate-600">שמות בקובץ</p>
          </div>
        </div>
        {reviewCount > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {`${reviewCount} בקשות "לבדיקה" לא ייכנסו לקובץ. צריך לאשר אותן קודם במסך.`}
          </p>
        )}
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

        {!exportable.length ? (
          <p className="py-6 text-center text-slate-500">אין שמות מאושרים לייצוא בסינון הזה.</p>
        ) : preview ? (
          <KvitelSheet lines={previewLines} downloadHref={exportHref} />
        ) : (
          <>
            {canEdit && markable.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <p className="text-sm text-slate-700">סמן את הבקשות שכבר נשלחו לציון הקדוש:</p>
                <button type="button" onClick={() => setMarked(allMarked ? new Set() : new Set(markable.map(r => r.id)))} className="text-sm font-semibold text-[#1B3256] underline-offset-4 hover:underline">
                  {allMarked ? 'ניקוי הסימון' : 'סימון הכול כנשלחו'}
                </button>
              </div>
            )}
            <ul className="divide-y divide-slate-100">
              {exportable.map(r => {
                const sent = r.status === 'done'
                const body = (
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">{r.contact_name ? `${r.contact_name} · ` : ''}{dateFmt.format(new Date(r.submitted_at))}</p>
                    <ul className="mt-0.5 space-y-0.5 text-sm text-slate-900">
                      {r.kvitel_request_lines.map(l => (
                        <li key={l.id} className="break-words">
                          {formatLine({ name: l.name, relation: l.relation, parentName: l.parent_name, requestType: l.request_type, requestNote: l.request_note })}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
                return (
                  <li key={r.id} className="py-3">
                    {sent || !canEdit ? (
                      <div className="flex items-start gap-3">
                        {body}
                        {sent && <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-900">כבר נשלח</span>}
                      </div>
                    ) : (
                      <label className="flex cursor-pointer items-start gap-3">
                        <input type="checkbox" checked={marked.has(r.id)} onChange={() => toggle(r.id)} className="mt-1 h-4 w-4 shrink-0" />
                        {body}
                        <span className={`shrink-0 text-xs ${marked.has(r.id) ? 'font-semibold text-emerald-800' : 'text-slate-400'}`}>נשלח לציון</span>
                      </label>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </Modal>
  )
}
