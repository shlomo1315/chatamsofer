'use client'
import { useState, useEffect } from 'react'
import { Loader2, Check, X, Pencil, AlertTriangle } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// שיוך מוקד ידני מתוך שורת הטבלה.
//
// 🔴 למה זה קיים: המוקד נבחר רק בשני ערוצים שהמשפחה מפעילה — הפורטל
// והשלוחה. משפחה שאינה מסתדרת עם שניהם (76 נרשמו בהזנה ידנית) נותרה
// בלי מוקד, והמשרד יכול היה רק לראות "טרם נבחר" בלי דרך לתקן.
//
// ⚠️ רשימת המוקדים נטענת פעם אחת לכל הטבלה (prop) ולא לכל שורה: 6,000
// שורות × בקשה לרשימה הן בדיוק העומס שהדפדוף בא למנוע.
//
// ⚠️ דריסת בחירה קיימת דורשת אישור נוסף: זו פעולה שהמשפחה כבר עשתה,
// והיא בלתי הפיכה מבחינתה — לחיצה אחת בטעות שולחת אותה למקום אחר.
// ─────────────────────────────────────────────────────────────────────────────

export type CenterOption = { id: string; city: string | null; name: string | null; full?: boolean }

export default function CenterCellEditor({
  recipientId, centerName, centerSource, centers, onSaved,
}: {
  recipientId: string
  centerName?: string | null
  centerSource?: string | null
  centers: CenterOption[]
  onSaved: (next: { center_id: string | null; center_name: string | null; center_source: string | null }) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  // סגירה ב-Escape — חלונית שאי אפשר לסגור במקלדת נתקעת על המסך.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setConfirmId(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function assign(centerId: string | null) {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/holiday-centers/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: recipientId, center_id: centerId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'השיוך נכשל'); return }
      onSaved({
        center_id: centerId,
        center_name: d.label ?? null,
        center_source: centerId ? 'office' : null,
      })
      setOpen(false); setConfirmId(null)
    } catch { setErr('שגיאת רשת') } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        title={centerName ? 'שינוי המוקד' : 'שיוך מוקד ידני'}
        className="inline-flex items-center gap-1 text-right hover:underline">
        {centerName
          ? <span className="flex flex-col">
              <span className="text-slate-700">{centerName}</span>
              {centerSource && (
                <span className="text-[10px] text-slate-400">
                  {centerSource === 'phone' ? 'טלפון'
                    : centerSource === 'portal' ? 'אתר'
                    : centerSource === 'office' ? 'שויך במשרד' : 'ידני'}
                </span>
              )}
            </span>
          : <span className="text-slate-300">טרם נבחר</span>}
        <Pencil size={10} className="shrink-0 text-slate-300" />
      </button>
    )
  }

  return (
    <div className="relative">
      <div className="absolute right-0 top-0 z-30 w-64 rounded-xl border border-slate-300 bg-white p-2.5 shadow-lg">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-extrabold text-slate-700">שיוך מוקד</span>
          <button type="button" onClick={() => { setOpen(false); setConfirmId(null) }}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100" aria-label="סגירה">
            <X size={13} />
          </button>
        </div>

        {/* ⚠️ אזהרת דריסה — הבחירה כבר נמסרה למשפחה. */}
        {centerName && (
          <p className="mb-1.5 flex items-start gap-1 rounded-lg bg-amber-50 px-2 py-1.5 text-[10.5px] leading-relaxed text-amber-800">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            למשפחה כבר משויך <strong>{centerName}</strong>. שינוי כאן דורס את בחירתה.
          </p>
        )}

        {err && (
          <p className="mb-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[10.5px] font-semibold text-rose-700">{err}</p>
        )}

        <div className="max-h-56 overflow-y-auto">
          {centers.length === 0 && (
            <p className="px-1 py-2 text-[11px] text-slate-400">אין מוקדים פתוחים בחלוקה זו</p>
          )}
          {centers.map(c => {
            const label = [c.city, c.name].filter(Boolean).join(' · ')
            const needsConfirm = !!centerName && confirmId !== c.id
            return (
              <button key={c.id} type="button" disabled={busy}
                onClick={() => { if (needsConfirm) setConfirmId(c.id); else void assign(c.id) }}
                className={`flex w-full items-center justify-between gap-1 rounded-lg px-2 py-1.5 text-right text-[11.5px] transition-colors disabled:opacity-50 ${
                  confirmId === c.id
                    ? 'bg-amber-100 font-extrabold text-amber-900'
                    : 'text-slate-700 hover:bg-slate-100'}`}>
                <span className="min-w-0 truncate">{label}</span>
                {confirmId === c.id
                  ? <span className="shrink-0 text-[10px] font-extrabold">לחצו לאישור</span>
                  : c.full
                    ? <span className="shrink-0 text-[9.5px] font-bold text-rose-500">מלא</span>
                    : null}
              </button>
            )
          })}
        </div>

        {centerName && (
          <button type="button" disabled={busy} onClick={() => void assign(null)}
            className="mt-1.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50">
            ביטול השיוך (חזרה ל&quot;טרם נבחר&quot;)
          </button>
        )}

        {busy && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <Loader2 size={12} className="animate-spin" /> שומר…
          </p>
        )}
      </div>
    </div>
  )
}
