'use client'

import { useMemo, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { kvitelExportLines, type KvitelRequestRow } from '@/lib/kvitelQuery'
import { KvitelSheet } from './KvitelPreview'

// הדפסת הקוויטלאך החדשים: כל הבקשות שבסטטוס "ממתין לשליחה" (חדשות שאושרו ועוד לא נשלחו).
// אחרי סגירת חלון ההדפסה נשאלת השאלה "לסמן כנשלחו?", ו"כן" מעביר ל"נשלח לציון"
// רק את המזהים שהודפסו בפועל — כך שההדפסה הבאה תכלול רק בקשות חדשות.

export default function PrintNewDialog({ open, onClose, rows, canEdit, onDone }: {
  open: boolean
  onClose: () => void
  rows: KvitelRequestRow[]
  canEdit: boolean
  onDone: (message: string) => void
}) {
  // ה-id-ים והשורות נקבעים יחד, כדי שהסימון יתאים בדיוק למה שהודפס
  const printed = useMemo(() => {
    const list = rows.filter(r => r.status === 'pending' && r.kvitel_request_lines.length)
    return { ids: list.map(r => r.id), lines: kvitelExportLines(list) }
  }, [rows])
  const [asked, setAsked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function close() {
    if (busy) return
    setAsked(false)
    setError('')
    onClose()
  }

  async function mark() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/kvitel/requests', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: printed.ids, status: 'done' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'הסימון נכשל'); return }
      setAsked(false)
      onDone(`${data.updated} בקשות סומנו "נשלח לציון"`)
    } catch {
      setError('הסימון נכשל. בדוק את החיבור ונסה שוב.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="הדפסת קוויטלאך חדשים" size="lg">
      <div className="space-y-4">
        {!printed.lines.length ? (
          <p className="py-6 text-center text-slate-500">אין קוויטלאך חדשים להדפסה.</p>
        ) : (
          <>
            <p className="text-sm text-slate-700">{`${printed.ids.length} בקשות חדשות, ${printed.lines.length} שמות. לחיצה על "הדפסה" פותחת את חלון ההדפסה.`}</p>
            <KvitelSheet lines={printed.lines} onPrinted={() => setAsked(true)} />
          </>
        )}
        {asked && (
          <div role="alertdialog" aria-label="סימון כנשלחו" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="font-semibold text-slate-900">לסמן את כל הבקשות האלה כנשלחו לציון הקדוש?</p>
            <p className="text-sm text-slate-700">{'הן יעברו ל"נשלח לציון", ובהדפסה הבאה יופיעו רק בקשות חדשות.'}</p>
            {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
            <div className="flex gap-2">
              {canEdit && (
                <button type="button" onClick={mark} disabled={busy} className="flex items-center gap-2 rounded-lg bg-[#1B3256] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                  כן, סמן כנשלחו
                </button>
              )}
              <button type="button" onClick={() => setAsked(false)} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700">
                לא עכשיו
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
