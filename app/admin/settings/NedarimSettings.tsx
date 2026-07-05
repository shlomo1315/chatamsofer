'use client'
import { useEffect, useState } from 'react'
import { CreditCard, Loader2, Check, Eye, EyeOff } from 'lucide-react'
import LimitGroupDiag from '@/app/admin/maternity/cards/LimitGroupDiag'

export default function NedarimSettings() {
  const [mosadId, setMosadId] = useState('')
  const [apiPassword, setApiPassword] = useState('')
  const [configured, setConfigured] = useState(false)
  const [hasPw, setHasPw] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/nedarim/settings')
      .then(r => r.json())
      .then(d => { setMosadId(d.mosadId ?? ''); setConfigured(!!d.configured); setHasPw(!!d.hasApiPassword) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setError(''); setSaved(false)
    if (!mosadId.trim() || !apiPassword.trim()) { setError('יש להזין קוד מוסד וקוד API'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/nedarim/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mosadId: mosadId.trim(), apiPassword: apiPassword.trim() }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'שגיאה בשמירה'); return }
      setSaved(true); setConfigured(true); setHasPw(true); setApiPassword('')
      setTimeout(() => setSaved(false), 2500)
    } catch { setError('שגיאת רשת') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
          <CreditCard size={16} className="text-emerald-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-700">חיבור נדרים קארד</h2>
          <p className="text-xs text-slate-400">קוד מוסד וקוד API לחיבור למערכת נדרים פלוס</p>
        </div>
        {configured && <span className="ml-auto text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5 font-medium">מחובר ✓</span>}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-3"><Loader2 size={14} className="animate-spin" /> טוען…</div>
      ) : (
        <div className="flex flex-col gap-3" dir="rtl">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">קוד מוסד (7 ספרות)</label>
            <input value={mosadId} onChange={e => setMosadId(e.target.value.replace(/\D/g, ''))} dir="ltr" inputMode="numeric"
              placeholder="0000000" maxLength={9}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-left tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">קוד API {hasPw && <span className="text-slate-400">(שמור — השאר ריק כדי לא לשנות)</span>}</label>
            <div className="relative">
              <input value={apiPassword} onChange={e => setApiPassword(e.target.value)} dir="ltr"
                type={showPw ? 'text' : 'password'} placeholder={hasPw ? '••••••••' : 'קוד ה-API מהמשרד'}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 pl-9 text-sm text-left focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
              {saved ? 'נשמר' : 'שמירת חיבור'}
            </button>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            את קוד ה-API יש לבקש משירות הלקוחות של נדרים פלוס (במייל מורשה במוסד). הקוד נשמר מוצפן בצד שרת ואינו נחשף בדפדפן.
          </p>

          {/* אבחון קבוצת הגבלת חנויות — לחיבור טעינת ה-600 ₪ לקבוצה הנכונה */}
          {configured && <LimitGroupDiag />}
        </div>
      )}
    </div>
  )
}
