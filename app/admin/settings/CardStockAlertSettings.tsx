'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, Plus, X, Check, Mail } from 'lucide-react'

// הגדרות התראת מלאי כרטיסי מזון: סף התראה + רשימת מיילים שיקבלו התראה כשהמלאי נמוך.
export default function CardStockAlertSettings() {
  const [threshold, setThreshold] = useState('5')
  const [emails, setEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/card-stock/alert-settings', { cache: 'no-store' })
      const d = await r.json()
      setThreshold(String(d.threshold ?? 5))
      setEmails(Array.isArray(d.emails) ? d.emails : [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])
  useEffect(() => { const t = setTimeout(() => { void load() }, 0); return () => clearTimeout(t) }, [load])

  const addEmail = () => {
    const e = newEmail.trim()
    if (!e) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setErr('כתובת מייל לא תקינה'); return }
    if (emails.includes(e)) { setErr('כתובת זו כבר ברשימה'); return }
    setEmails([...emails, e]); setNewEmail(''); setErr('')
  }
  const removeEmail = (e: string) => setEmails(emails.filter(x => x !== e))

  const save = async () => {
    setSaving(true); setErr(''); setMsg('')
    try {
      const r = await fetch('/api/admin/card-stock/alert-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: Number(threshold) || 0, emails }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'שגיאה בשמירה') } else { setMsg('ההגדרות נשמרו'); setTimeout(() => setMsg(''), 3000) }
    } catch { setErr('שגיאת רשת') }
    setSaving(false)
  }

  if (loading) return <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 size={15} className="animate-spin" /> טוען…</div>

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">
        כשמלאי כרטיסי המזון יורד לסף שהוגדר או פחות — תישלח התראה במייל לכתובות הרשומות כאן.
      </p>

      {/* סף */}
      <div className="flex flex-col gap-1.5 max-w-xs">
        <label className="text-sm font-medium text-slate-700">סף התראה (מספר כרטיסים)</label>
        <input value={threshold} onChange={e => setThreshold(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" dir="ltr"
          className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-center w-28 focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="5" />
        <p className="text-xs text-slate-400">ברירת מחדל: 5</p>
      </div>

      {/* מיילים */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700">כתובות מייל להתראה</label>
        <div className="flex flex-col gap-1.5">
          {emails.length === 0 ? (
            <p className="text-sm text-slate-400">אין כתובות עדיין — הוסף כתובת למטה.</p>
          ) : emails.map(e => (
            <div key={e} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-2 text-slate-700"><Mail size={14} className="text-slate-400" /><span className="ltr-num">{e}</span></span>
              <button onClick={() => removeEmail(e)} className="text-slate-400 hover:text-red-600"><X size={16} /></button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <input value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail() } }}
            dir="ltr" placeholder="email@example.com"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          <button onClick={addEmail}
            className="inline-flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg px-3.5 py-2.5">
            <Plus size={15} /> הוסף
          </button>
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {msg && <p className="text-sm text-emerald-600 inline-flex items-center gap-1"><Check size={14} /> {msg}</p>}

      <div>
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-5 py-2.5">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} שמירת הגדרות
        </button>
      </div>
    </div>
  )
}
