'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Loader2, Check, AlertTriangle, RotateCcw, Info } from 'lucide-react'
import { format, addWeeks } from 'date-fns'
import { he } from 'date-fns/locale'
import Modal from '@/components/ui/Modal'
import HebrewDatePicker from '@/components/ui/HebrewDatePicker'
import { toHebrewDate } from '@/lib/hebrewDate'
import type { MaternityAid } from '@/types'

const fmt = (d?: string | null) => (d ? format(new Date(d), 'dd/MM/yyyy', { locale: he }) : '—')
const toIso = (d: Date) => d.toISOString().split('T')[0]

type AidLike = Pick<MaternityAid, 'id' | 'birth_date' | 'six_weeks_end' | 'eligibility_extended' | 'eligibility_extension_reason'>

export default function ExtendEligibility({
  aid,
  variant = 'button',
  onDone,
}: {
  aid: AidLike
  variant?: 'button' | 'icon'
  onDone?: () => void
}) {
  const defaultEnd = aid.birth_date ? toIso(addWeeks(new Date(aid.birth_date), 6)) : ''
  const currentEnd = aid.six_weeks_end || defaultEnd
  const extended = !!aid.eligibility_extended

  const [open, setOpen] = useState(false)
  const [endDate, setEndDate] = useState(currentEnd)
  const [reason, setReason] = useState(aid.eligibility_extension_reason ?? '')
  const [saving, setSaving] = useState<'extend' | 'reset' | null>(null)
  const [err, setErr] = useState('')
  const router = useRouter()

  const openModal = () => {
    setEndDate(currentEnd)
    setReason(aid.eligibility_extension_reason ?? '')
    setErr('')
    setOpen(true)
  }

  const submit = async (action: 'extend' | 'reset') => {
    setErr(''); setSaving(action)
    try {
      const res = await fetch('/api/admin/maternity/extend-eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'reset'
          ? { aidId: aid.id, action: 'reset' }
          : { aidId: aid.id, action: 'extend', endDate, reason }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) { setErr(data.error || 'הפעולה נכשלה'); setSaving(null); return }
      setOpen(false)
      if (onDone) onDone(); else router.refresh()
    } catch {
      setErr('שגיאת רשת — נסה שוב')
    } finally {
      setSaving(null)
    }
  }

  const earlierThanDefault = !!endDate && !!defaultEnd && endDate < defaultEnd
  const sameAsCurrent = endDate === currentEnd

  return (
    <>
      {variant === 'icon' ? (
        <button
          onClick={openModal}
          title="הארכת זכאות"
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 border border-indigo-200 hover:bg-indigo-50 rounded-lg px-2.5 py-1.5 transition-colors"
        >
          <CalendarClock size={13} /> הארכת זכאות
        </button>
      ) : (
        <button
          onClick={openModal}
          className="flex items-center gap-1.5 text-sm text-indigo-700 border border-indigo-200 hover:bg-indigo-50 rounded-lg px-3 py-1.5 transition-colors"
        >
          <CalendarClock size={14} /> הארכת זכאות
        </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="הארכת זכאות יולדת" size="md">
        <div className="flex flex-col gap-4">
          {/* סיכום המצב הנוכחי */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-sm flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">ברירת מחדל (6 שבועות מהלידה):</span>
              <span className="font-medium text-slate-700 text-left">
                <span className="ltr-num">{fmt(defaultEnd)}</span>
                {toHebrewDate(defaultEnd) && <span className="block text-[11px] text-slate-400">{toHebrewDate(defaultEnd)}</span>}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">סיום זכאות נוכחי:</span>
              <span className={`font-semibold text-left ${extended ? 'text-indigo-700' : 'text-slate-800'}`}>
                <span className="ltr-num">{fmt(currentEnd)}</span>{extended && <span className="mr-1.5 text-[11px] font-medium text-indigo-600">(הוארך ידנית)</span>}
                {toHebrewDate(currentEnd) && <span className="block text-[11px] font-normal text-slate-400">{toHebrewDate(currentEnd)}</span>}
              </span>
            </div>
          </div>

          {/* בחירת תאריך סיום חדש */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-slate-600">תאריך סיום זכאות חדש</label>
            <HebrewDatePicker value={endDate} onChange={setEndDate} maxToday={false} />
            {earlierThanDefault && (
              <p className="flex items-center gap-1.5 text-xs text-amber-700">
                <Info size={13} /> התאריך שנבחר מוקדם מברירת המחדל (קיצור הזכאות).
              </p>
            )}
          </div>

          {/* סיבת ההארכה */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-slate-600">סיבת ההארכה <span className="font-normal text-slate-400">(לא חובה)</span></label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="לדוגמה: אשפוז ממושך, מקרה חריג שאושר…"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {err && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle size={14} /> {err}
            </div>
          )}

          <p className="text-[11px] text-slate-400 leading-relaxed">
            תאריך זה קובע את סוף הזכאות לכל דבר — כולל פריקת כרטיס המזון האוטומטית, פורטל בתי ההחלמה ושלוחת הטלפון.
          </p>

          <div className="flex items-center justify-between gap-3 pt-1">
            {extended ? (
              <button
                onClick={() => submit('reset')}
                disabled={saving !== null}
                className="flex items-center gap-1.5 text-sm text-slate-600 border border-slate-300 hover:bg-slate-50 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
              >
                {saving === 'reset' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} החזרה ל-6 שבועות
              </button>
            ) : <span />}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={() => submit('extend')}
                disabled={saving !== null || !endDate || sameAsCurrent}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {saving === 'extend' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} שמירת ההארכה
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
