'use client'

// מענה אוטומטי per-mailbox — מתג + נוסח לכל תיבת מייל בנפרד.
// כשמופעל לתיבה, כל פנייה אליה מקבלת מענה אוטומטי (בכל פעם), בעיצוב המערכת.
import { useEffect, useState, useCallback } from 'react'
import { Loader2, Save, Mail } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface PerMailbox { enabled: boolean; message: string; contactEmail?: string }
interface Mailbox { key: string; label: string; email: string }

const DEFAULT_MESSAGE = 'המערכת החדשה שלנו נמצאת כרגע בפיתוח, ותתחיל לפעול בעזרת השם בימים הקרובים.'

export default function MaintenanceReplySettings() {
  const toast = useToast()
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [map, setMap] = useState<Record<string, PerMailbox>>({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/maintenance-reply')
      if (res.ok) {
        const d = await res.json()
        setMailboxes(d.mailboxes ?? [])
        setMap(d.map ?? {})
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const patch = (key: string, next: Partial<PerMailbox>) =>
    setMap(m => ({ ...m, [key]: { ...{ enabled: false, message: '' }, ...m[key], ...next } }))

  // שמירת תיבה בודדת (שולח את כל המפה — השרת ממזג)
  const save = async (key: string, override?: Partial<PerMailbox>) => {
    const cur = { ...{ enabled: false, message: '' }, ...map[key], ...override }
    if (cur.enabled && !cur.message.trim()) { toast.error('יש להזין נוסח לפני הפעלה'); return }
    setSavingKey(key)
    try {
      const res = await fetch('/api/admin/maintenance-reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map: { [key]: cur } }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'השמירה נכשלה')
      if (d.map) setMap(d.map)
      toast.success(cur.enabled ? 'המענה האוטומטי הופעל לתיבה' : 'נשמר')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally { setSavingKey(null) }
  }

  if (loading) return <div className="py-6 text-center text-slate-400"><Loader2 className="inline animate-spin" size={18} /></div>

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-500">
        לכל תיבת מייל אפשר להפעיל <strong>מענה אוטומטי משלה</strong>. כשמופעל — כל פנייה
        לתיבה מקבלת את הנוסח (בעיצוב המערכת), <strong>בכל פעם</strong>, גם למי שכבר רשום.
        לא נשלח מענה לכתובות אוטומטיות (noreply וכד') — למניעת לולאות.
      </p>

      {mailboxes.map(mb => {
        const cur = map[mb.key] ?? { enabled: false, message: '', contactEmail: mb.email }
        const busy = savingKey === mb.key
        return (
          <div key={mb.key} className={`rounded-xl border p-4 ${cur.enabled ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><Mail size={15} className="text-slate-500" /></span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{mb.label}</p>
                  <p className="text-[11px] text-slate-400 ltr-num">{mb.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {busy && <Loader2 size={14} className="animate-spin text-slate-400" />}
                <button type="button" disabled={busy}
                  onClick={() => save(mb.key, { enabled: !cur.enabled })}
                  className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${cur.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  aria-label="הפעל/כבה מענה אוטומטי">
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${cur.enabled ? 'right-0.5' : 'right-5'}`} />
                </button>
              </div>
            </div>

            <label className="mb-1 block text-xs font-semibold text-slate-600">נוסח ההודעה</label>
            <textarea value={cur.message} rows={2}
              onChange={e => patch(mb.key, { message: e.target.value })}
              placeholder={DEFAULT_MESSAGE}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none
                         focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200" />

            <div className="flex items-end gap-2 mt-2 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <label className="mb-1 block text-xs font-semibold text-slate-600">כתובת לפניות בינתיים (לא חובה)</label>
                <input type="email" dir="ltr" value={cur.contactEmail ?? ''}
                  onChange={e => patch(mb.key, { contactEmail: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-left
                             focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
              <button type="button" onClick={() => save(mb.key)} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} שמירה
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
