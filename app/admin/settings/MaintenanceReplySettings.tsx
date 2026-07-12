'use client'

// מענה אוטומטי זמני — "המערכת בפיתוח".
// מי ששולח מייל למשרד ואינו מזוהה במערכת מקבל תשובה אוטומטית.
import { useEffect, useState, useCallback } from 'react'
import { Loader2, Save, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Settings {
  enabled: boolean
  contactEmail: string
  message: string
  sentCount?: number
}

const DEFAULT_MESSAGE = 'המערכת החדשה שלנו נמצאת כרגע בפיתוח, ותתחיל לפעול בימים הקרובים.'

export default function MaintenanceReplySettings() {
  const toast = useToast()
  const [s, setS] = useState<Settings>({
    enabled: false,
    contactEmail: 'chasamsofer3@gmail.com',
    message: DEFAULT_MESSAGE,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/maintenance-reply')
      if (res.ok) {
        const d = await res.json()
        if (d.settings) setS(d.settings)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function save(next?: Partial<Settings>) {
    const payload = { ...s, ...next }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/maintenance-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'השמירה נכשלה')

      setS(d.settings)
      toast.success(
        d.settings.enabled
          ? 'המענה האוטומטי הופעל'
          : 'המענה האוטומטי כובה',
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="py-6 text-center text-slate-400">
        <Loader2 className="inline animate-spin" size={18} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* מצב נוכחי + מתג */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${
        s.enabled
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-slate-200 bg-slate-50'
      }`}>
        <div className="flex items-center gap-2.5">
          {s.enabled
            ? <CheckCircle2 size={20} className="text-emerald-600" />
            : <AlertTriangle size={20} className="text-slate-400" />}
          <div>
            <p className={`text-sm font-bold ${s.enabled ? 'text-emerald-800' : 'text-slate-600'}`}>
              {s.enabled ? 'המענה האוטומטי פעיל' : 'המענה האוטומטי כבוי'}
            </p>
            <p className="text-xs text-slate-500">
              {s.enabled
                ? `נשלחו ${(s.sentCount ?? 0).toLocaleString('he-IL')} מיילים אוטומטיים`
                : 'פונים שאינם במערכת לא מקבלים מענה'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => save({ enabled: !s.enabled })}
          disabled={saving}
          className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-40 ${
            s.enabled ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
        >
          {saving ? <Loader2 size={15} className="mx-auto animate-spin" />
            : s.enabled ? 'ביטול המענה האוטומטי' : 'הפעלת המענה האוטומטי'}
        </button>
      </div>

      <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-500">
        כשמופעל, כל מי ששולח מייל למשרד <strong>ואינו מזוהה כמוטב במערכת</strong> מקבל
        תשובה אוטומטית. כל כתובת מקבלת מענה <strong>פעם אחת בלבד</strong>, ולא נשלח
        מענה לכתובות אוטומטיות (noreply וכדומה) — כדי למנוע לולאות.
      </p>

      {/* תוכן ההודעה */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">תוכן ההודעה</label>
        <textarea
          value={s.message}
          onChange={e => setS({ ...s, message: e.target.value })}
          rows={3}
          className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm
                     focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">
          כתובת לפניות בינתיים
        </label>
        <input
          type="email"
          dir="ltr"
          value={s.contactEmail}
          onChange={e => setS({ ...s, contactEmail: e.target.value })}
          className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm
                     focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      <button
        type="button"
        onClick={() => save()}
        disabled={saving}
        className="inline-flex items-center justify-center gap-1.5 self-start rounded-xl border
                   border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600
                   transition hover:bg-slate-50 disabled:opacity-40"
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        שמירת השינויים
      </button>
    </div>
  )
}
