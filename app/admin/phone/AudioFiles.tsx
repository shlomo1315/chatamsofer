'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, Trash2, FileAudio, AlertTriangle, Check } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// קבצי השמע של השלוחה — מה באמת יושב בימות.
//
// 🔴 למה זה קיים: ההגדרות אומרות איזה קובץ *אמור* להתנגן; המסך הזה
// אומר מה קיים שם בפועל. הפער בין השניים היה בלתי נראה לגמרי, והתסמין
// היחיד הוא הודעה שנשמעת ישנה או לא נשמעת כלל.
//
// ⚠️ שמות הקבצים כוללים חותמת זמן כדי לעקוף את מטמון ימות, ולכן כל
// יצירה מחדש משאירה את הקודם מאחור. בלי ניקוי התיקייה מתמלאת בהקלטות
// נטושות שאי אפשר להבחין בינן לבין הפעילה.
//
// ⚠️ המחיקה מאומתת בשרת ולא נסמכת על הרשימה שהלקוח שולח — ראו
// app/api/admin/yemot-files. מחיקה של קובץ פעיל משתיקה הודעה.
// ─────────────────────────────────────────────────────────────────────────────

type FileRow = {
  name: string; base: string
  linkedTo: string | null
  kind: 'tts' | 'builder' | 'other'
  orphan: boolean
}

const KIND_LABEL: Record<FileRow['kind'], string> = {
  tts: 'קול טבעי', builder: 'בונה השלוחות', other: 'קובץ אחר',
}

export default function AudioFiles({ scope }: { scope: 'menu' | 'holiday' | 'maternity' }) {
  const [rows, setRows] = useState<FileRow[] | null>(null)
  const [folder, setFolder] = useState('')
  const [shared, setShared] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')

  const load = useCallback(async () => {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/admin/yemot-files?scope=${scope}`, { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'קריאת התיקייה נכשלה'); setRows([]); return }
      setRows(d.files ?? []); setFolder(String(d.folder ?? '')); setShared(!!d.shared)
    } catch { setErr('שגיאת רשת'); setRows([]) } finally { setBusy(false) }
  }, [scope])

  useEffect(() => { void load() }, [load])

  const orphans = (rows ?? []).filter(f => f.orphan)

  async function cleanup() {
    if (!orphans.length) return
    setBusy(true); setErr(''); setDone('')
    try {
      const res = await fetch('/api/admin/yemot-files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, names: orphans.map(f => f.name) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'הניקוי נכשל'); return }
      setDone(`נמחקו ${d.deleted} קבצים`)
      await load()
    } catch { setErr('שגיאת רשת') } finally { setBusy(false) }
  }

  if (rows === null) {
    return <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
      <Loader2 size={16} className="animate-spin" /> קורא את התיקייה בימות…
    </div>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">
            קבצי השמע — תיקייה {folder} בימות
          </h3>
          <p className="text-[12px] text-slate-500">
            {rows.length} קבצים · {orphans.length} יתומים
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-[11.5px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            רענון מימות
          </button>
          {orphans.length > 0 && (
            <button type="button" onClick={() => void cleanup()} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-[11.5px] font-bold text-white hover:bg-rose-700 disabled:opacity-50">
              <Trash2 size={12} /> ניקוי היתומים ({orphans.length})
            </button>
          )}
        </div>
      </div>

      {/* 🔴 התיקייה המשותפת — למה יש כאן קבצים שאינם של השלוחה. */}
      {shared && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-900">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          תיקייה זו משותפת לתפריט הראשי ולבונה השלוחות. קבצים המסומנים
          &quot;בונה השלוחות&quot; שייכים לשלוחות שנבנו במסך הבונה — הם אינם יתומים,
          ואינם נמחקים בניקוי.
        </p>
      )}

      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">{err}</p>}
      {done && (
        <p className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-[12px] font-bold text-emerald-700">
          <Check size={12} /> {done}
        </p>
      )}

      {rows.length === 0 && !err && (
        <p className="py-6 text-center text-[13px] text-slate-400">אין קבצים בתיקייה זו</p>
      )}

      <div className="flex flex-col gap-1.5">
        {rows.map(f => (
          <div key={f.name}
            className={`flex flex-wrap items-center gap-2.5 rounded-lg border px-3 py-2 ${
              f.orphan ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}>
            <FileAudio size={13} className={f.orphan ? 'shrink-0 text-rose-400' : 'shrink-0 text-slate-400'} />
            <span dir="ltr" className="min-w-0 flex-1 break-all font-mono text-[11.5px] text-slate-700">
              {f.name}
            </span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
              {KIND_LABEL[f.kind]}
            </span>
            {f.linkedTo ? (
              <span className="text-[11px] font-bold text-emerald-700">משויך · {f.linkedTo}</span>
            ) : f.orphan ? (
              <span className="text-[11px] font-bold text-rose-700">יתום — אינו משויך לאף הודעה</span>
            ) : (
              <span className="text-[11px] text-slate-400">אינו מנוהל מכאן</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
