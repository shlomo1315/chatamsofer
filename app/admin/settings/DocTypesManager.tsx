'use client'
import { useState } from 'react'
import { FileText, Plus, Trash2, Loader2, Lock } from 'lucide-react'
import { useDocTypes } from '@/lib/useDocTypes'
import { PROTECTED_DOC_TYPES } from '@/lib/docTypes'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

export default function DocTypesManager() {
  const { docTypes, setDocTypes } = useDocTypes()
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const [newLabel, setNewLabel] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    const label = newLabel.trim()
    if (!label || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/doc-types', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', label }),
      })
      const data = await res.json()
      if (data.docTypes) setDocTypes(data.docTypes)
      setNewLabel('')
    } finally { setBusy(false) }
  }

  const remove = async (value: string) => {
    if (!(await confirm({ title: 'מחיקת סוג מסמך', message: 'למחוק סוג מסמך זה?', confirmLabel: 'מחיקה', danger: true }))) return
    setBusy(true)
    try {
      const res = await fetch('/api/doc-types', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', value }),
      })
      const data = await res.json()
      if (data.docTypes) setDocTypes(data.docTypes)
      else if (data.error) toast.error(data.error)
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <FileText size={18} className="text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-700">סוגי מסמכים</h2>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        רשימה זו משפיעה על כל המערכת: מסמכים מצורפים בכרטסת, צ'קליסט השלמת מסמכים, שיוך קבצים מהמייל, והפורטל הציבורי.
      </p>

      <div className="flex flex-col gap-1.5 mb-4">
        {docTypes.map(t => {
          const locked = PROTECTED_DOC_TYPES.includes(t.value)
          return (
            <div key={t.value} className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/60">
              <span className="text-sm text-slate-700">{t.label}</span>
              {locked ? (
                <span className="text-slate-300" title="סוג בסיסי — לא ניתן למחיקה"><Lock size={14} /></span>
              ) : (
                <button onClick={() => remove(t.value)} disabled={busy}
                  className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50" title="מחק">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="שם סוג מסמך חדש..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button onClick={add} disabled={busy || !newLabel.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          הוסף
        </button>
      </div>
      {confirmDialog}
    </div>
  )
}
