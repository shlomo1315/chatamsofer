'use client'
import { useState, useEffect } from 'react'
import { Lock, CheckCircle2, Copy, ExternalLink, AlertCircle, Loader2, ShieldCheck } from 'lucide-react'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
      title="העתק"
      className="text-slate-400 hover:text-indigo-600 transition-colors"
    >
      {copied ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />}
    </button>
  )
}

export default function DistributionsShareSettings() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}/shared/distributions` : ''

  useEffect(() => {
    fetch('/api/admin/distributions-share/password')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setHasPassword(!!d.hasPassword) })
      .catch(() => {})
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null)
    if (password !== confirm) { setResult({ ok: false, msg: 'הסיסמאות אינן תואמות' }); return }
    if (password.length < 8) { setResult({ ok: false, msg: 'הסיסמה חייבת להכיל לפחות 8 תווים' }); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/distributions-share/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
      })
      const d = await res.json()
      if (res.ok) { setResult({ ok: true, msg: 'הסיסמה עודכנה בהצלחה ✓' }); setPassword(''); setConfirm(''); setHasPassword(true) }
      else setResult({ ok: false, msg: d.error ?? 'שגיאה' })
    } catch { setResult({ ok: false, msg: 'שגיאת תקשורת' }) }
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
          <ShieldCheck size={16} className="text-indigo-500" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-700">שיתוף חלוקות חגים — תצוגה בלבד</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {hasPassword === null ? '' : hasPassword ? '🔒 סיסמה מוגדרת' : '⚠️ טרם הוגדרה סיסמה — הקישור לא יפעל עד שתגדיר'}
          </p>
        </div>
      </div>

      {/* קישור השיתוף */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-slate-500">קישור לצפייה בכל החלוקות והנרשמים (תצוגה בלבד, מוגן בסיסמה):</p>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
          <span dir="ltr" className="text-xs text-slate-700 font-mono flex-1 truncate">{portalUrl || '/shared/distributions'}</span>
          {portalUrl && <CopyButton text={portalUrl} />}
          <a href="/shared/distributions" target="_blank" rel="noopener noreferrer" title="פתח דף שיתוף" className="text-slate-400 hover:text-indigo-600 transition-colors">
            <ExternalLink size={14} />
          </a>
        </div>
        <p className="text-[11px] text-emerald-600 flex items-center gap-1">
          <ShieldCheck size={11} /> הדף מציג נתונים בלבד — אין אפשרות עריכה או גישה לשאר המערכת
        </p>
      </div>

      {/* טופס סיסמה */}
      <form onSubmit={submit} className="flex flex-col gap-3 pt-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">{hasPassword ? 'סיסמה חדשה' : 'הגדר סיסמה'}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="לפחות 8 תווים"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-shadow" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">אימות סיסמה</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="הזן שוב..."
              className={`w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-shadow ${
                confirm && confirm !== password ? 'border-red-300 focus:ring-red-300/40' : 'border-slate-200 focus:ring-indigo-500/40 focus:border-indigo-400'}`} />
          </div>
        </div>

        {result && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${result.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {result.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            {result.msg}
          </div>
        )}
        <p className="text-[11px] text-amber-600 flex items-center gap-1">
          <AlertCircle size={11} /> החלפת הסיסמה פוסלת מיד את כל הקישורים הישנים
        </p>

        <button type="submit" disabled={saving || !password || !confirm}
          className="self-start flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 shadow-sm shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
          שמור סיסמה
        </button>
      </form>
    </div>
  )
}
