'use client'
import { useEffect, useState } from 'react'
import { Loader2, Copy, Check, RefreshCw } from 'lucide-react'

export default function RegistrationGate() {
  const [open, setOpen] = useState<boolean | null>(null)
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = () => fetch('/api/admin/registration-settings').then(r => r.json()).then(d => {
    if (typeof d.open === 'boolean') setOpen(d.open)
    if (typeof d.bypassCode === 'string') setCode(d.bypassCode)
  }).catch(() => {})
  useEffect(() => { load() }, [])

  const update = async (payload: { open?: boolean; regenerate?: boolean }) => {
    setSaving(true)
    try {
      const r = await fetch('/api/admin/registration-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json()
      if (typeof d.open === 'boolean') setOpen(d.open)
      if (typeof d.bypassCode === 'string') setCode(d.bypassCode)
    } catch { /* silent */ }
    setSaving(false)
  }

  const testLink = typeof window !== 'undefined' && code ? `${window.location.origin}/?signup=${code}` : ''
  const copy = () => { if (testLink) { navigator.clipboard?.writeText(testLink); setCopied(true); setTimeout(() => setCopied(false), 1800) } }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-slate-50 transition-colors">
        <div>
          <p className="text-sm font-medium text-slate-800">הרשמה ציבורית פתוחה</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {open === null ? 'טוען...' : open ? 'כל אחד יכול להירשם דרך הטופס הציבורי' : 'ההרשמה סגורה — מוצגת הודעה במקום הטופס'}
          </p>
        </div>
        <button
          disabled={saving || open === null}
          onClick={() => update({ open: !open })}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${open ? 'bg-emerald-500' : 'bg-slate-300'}`}
          aria-label="פתח/סגור הרשמה"
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${open ? 'right-0.5' : 'right-5'}`} />
        </button>
      </div>

      {/* קישור סודי לטסטים — עוקף את הסגירה */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
        <p className="text-xs font-semibold text-indigo-800 mb-1.5">קישור פרטי לטסטים (עוקף סגירה)</p>
        <p className="text-[11px] text-indigo-600/80 mb-2 leading-relaxed">
          גם כשההרשמה סגורה לקהל — דרך הקישור הזה תוכל להירשם לצורך בדיקות. אל תשתף אותו בפומבי.
        </p>
        <div className="flex items-center gap-2">
          <input readOnly value={testLink} dir="ltr"
            className="flex-1 text-xs bg-white border border-indigo-200 rounded-lg px-2.5 py-2 text-slate-700 truncate" />
          <button onClick={copy} disabled={!testLink}
            className="flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-lg px-2.5 py-2 hover:bg-indigo-50 disabled:opacity-50">
            {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'הועתק' : 'העתק'}
          </button>
          <button onClick={() => update({ regenerate: true })} disabled={saving}
            title="צור קוד חדש (הקישור הישן יפסיק לעבוד)"
            className="flex items-center gap-1 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-2 hover:bg-slate-50 disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
        </div>
      </div>
    </div>
  )
}
