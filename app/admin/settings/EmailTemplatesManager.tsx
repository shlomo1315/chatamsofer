'use client'
import { useState, useEffect } from 'react'
import { Paperclip, Plus, Trash2, Loader2, FileText, Upload } from 'lucide-react'
import { ViewDocButton } from '@/components/ui/DocViewer'
import { useConfirm } from '@/components/ui/ConfirmDialog'

interface Tpl { id: string; name: string; file_url: string; file_name: string; mime_type: string }

export default function EmailTemplatesManager() {
  const { confirm, confirmDialog } = useConfirm()
  const [list, setList] = useState<Tpl[]>([])
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = () => fetch('/api/admin/email-templates').then(r => r.json()).then(d => setList(d.templates ?? [])).catch(() => {})
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!name.trim()) { setErr('יש להזין שם'); return }
    if (!file) { setErr('יש לצרף קובץ'); return }
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.append('name', name.trim()); fd.append('file', file)
      const r = await fetch('/api/admin/email-templates', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'שגיאה'); setBusy(false); return }
      setName(''); setFile(null); load()
    } catch { setErr('שגיאת רשת') }
    setBusy(false)
  }

  const remove = async (id: string) => {
    if (!(await confirm({ title: 'מחיקת טמפלט', message: 'למחוק טמפלט זה?', confirmLabel: 'מחיקה', danger: true }))) return
    setBusy(true)
    await fetch(`/api/admin/email-templates?id=${id}`, { method: 'DELETE' }).catch(() => {})
    load(); setBusy(false)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Paperclip size={18} className="text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-700">טמפלטים לצירוף במייל</h2>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        קבצים קבועים (טפסים, אישורים וכו') שניתן לשלוף ולצרף מיידית בעת כתיבת מייל חדש.
      </p>

      <div className="flex flex-col gap-1.5 mb-4">
        {list.length === 0 && <p className="text-xs text-slate-400 text-center py-3">טרם הועלו טמפלטים</p>}
        {list.map(t => (
          <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/60">
            <ViewDocButton url={t.file_url} className="flex items-center gap-2 min-w-0 text-sm text-slate-700 hover:text-indigo-600">
              <FileText size={15} className="flex-shrink-0 text-slate-400" />
              <span className="font-medium truncate">{t.name}</span>
              <span className="text-xs text-slate-400 truncate">({t.file_name})</span>
            </ViewDocButton>
            <button onClick={() => remove(t.id)} disabled={busy} className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50" title="מחק">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="שם הטמפלט (לדוגמה: טופס בקשה)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        <label className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 cursor-pointer hover:bg-slate-50">
          <Upload size={14} /> {file ? <span className="truncate max-w-[120px]">{file.name}</span> : 'בחר קובץ'}
          <input type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button onClick={add} disabled={busy || !name.trim() || !file}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} הוסף
        </button>
      </div>
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
      {confirmDialog}
    </div>
  )
}
