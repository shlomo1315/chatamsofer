'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, FileText, Loader2, X, Upload } from 'lucide-react'
import { docViewUrl, docDownloadUrl } from '@/lib/docUrl'
import { RECEIPT_MAX_MB } from '@/lib/recoveryException'

export interface RecoveryExceptionInfo {
  active: boolean
  note: string | null
  receiptPath: string | null
  receiptName: string | null
  byName: string | null
  at: string | null
}

// בית החלמה חריג — למנהל בלבד (הדף מרנדר את הרכיב רק למנהל, וה-API בודק שוב).
// יולדת שקיבלה אישור למלון / בית החלמה שאינו ברשימה משלמת ומביאה קבלה:
// כאן מזינים את שם המקום ומעלים את הקבלה, ורואים מי אישר ומתי.
export default function RecoveryExceptionPanel({
  aidId, currentHome, info,
}: {
  aidId: string
  currentHome: string | null
  info: RecoveryExceptionInfo
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [home, setHome] = useState(info.active ? currentHome ?? '' : '')
  const [note, setNote] = useState(info.note ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!home.trim()) { setErr('יש להזין שם בית החלמה / מלון'); return }
    setErr(''); setSaving(true)
    try {
      const fd = new FormData()
      fd.set('aidId', aidId)
      fd.set('home', home)
      fd.set('note', note)
      if (file) fd.set('file', file)
      const res = await fetch('/api/admin/maternity/recovery-exception', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) { setErr(data.error || 'הפעולה נכשלה'); return }
      setOpen(false); setFile(null)
      router.refresh()
    } catch {
      setErr('שגיאת רשת — נסה שוב')
    } finally {
      setSaving(false)
    }
  }

  const when = info.at ? new Date(info.at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : null

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-2">
      {info.active && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800">
            <BadgeCheck size={15} /> אישור חריג: בית החלמה מחוץ לרשימה, תשלום לפי קבלה
          </span>
          {info.note && <p className="text-slate-700">{info.note}</p>}
          {info.receiptPath ? (
            <div className="flex items-center gap-3 flex-wrap">
              <a href={docViewUrl(info.receiptPath)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-sky-700 hover:text-sky-800 underline underline-offset-2">
                <FileText size={14} /> {info.receiptName || 'קבלה'}
              </a>
              <a href={docDownloadUrl(info.receiptPath, info.receiptName)} className="text-xs text-slate-500 hover:text-slate-700">
                הורדה
              </a>
            </div>
          ) : (
            <p className="text-xs text-amber-700">עדיין לא צורפה קבלה.</p>
          )}
          {(info.byName || when) && (
            <p className="text-xs text-slate-500">
              עודכן{info.byName ? ` על ידי ${info.byName}` : ''}{when ? ` · ${when}` : ''}
            </p>
          )}
        </div>
      )}

      {!open ? (
        <button type="button" onClick={() => { setOpen(true); setErr('') }}
          className="self-start inline-flex items-center gap-1 text-xs font-medium text-amber-800 border border-amber-300 hover:bg-amber-50 rounded-lg px-2 py-1 transition-colors">
          <BadgeCheck size={12} /> {info.active ? 'עדכון האישור החריג / הקבלה' : 'בית החלמה חריג (אישור מנהל)'}
        </button>
      ) : (
        <form onSubmit={submit} className="rounded-lg border border-slate-200 p-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">בית החלמה חריג</span>
            <button type="button" onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
              <X size={13} /> ביטול
            </button>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">שם בית ההחלמה / המלון</span>
            <input value={home} onChange={e => setHome(e.target.value)} maxLength={120} required
              placeholder="שם המקום שאושר"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">הערה (לא חובה)</span>
            <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={2}
              placeholder="למשל: סיבת האישור, סכום הקבלה"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">
              קבלה (PDF או תמונה, עד {RECEIPT_MAX_MB}MB){info.receiptPath ? ' · קובץ חדש יחליף את הקיים' : ' · אפשר לצרף גם אחר כך'}
            </span>
            <span className="inline-flex items-center gap-2">
              <Upload size={14} className="text-slate-400" />
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-xs" />
            </span>
          </label>
          <p className="text-[11px] text-slate-500">
            השמירה מחליפה את בית ההחלמה בכרטסת לשם שהוזן. לא נשלח שובר, כי התשלום הוא לפי הקבלה.
          </p>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button type="submit" disabled={saving}
            className="self-start inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />} שמירה
          </button>
        </form>
      )}
    </div>
  )
}
