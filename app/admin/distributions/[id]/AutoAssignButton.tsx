'use client'

// ─────────────────────────────────────────────────────────────────────────────
// שיבוץ אוטומטי למוקד לפי עיר — למי שלא בחר עד תום המועד.
//
// 🔴 שני שלבים ולא לחיצה אחת: הפעולה כותבת על מאות שורות ונועלת בחירה.
// הכפתור פותח תצוגה מקדימה שמראה בדיוק כמה ולאן, וההרצה היא רק אחריה.
//
// ⚠️ הפעולה אינה הפיכה מהמסך. לכן התצוגה מפרטת גם את מי ש*לא* ישובץ —
// ערים בלי מוקד ומי שהמועד שלו עדיין פתוח — כדי שהחריגים לא יתגלו בדיעבד.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react'
import { Loader2, MapPin, AlertTriangle, Check, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

interface Preview {
  total: number
  byCenter: { centerId: string; centerName: string; count: number; taken: number }[]
  noCenterInCity: { city: string; count: number }[]
  noCity: number
  skippedStillOpen: number
}

export default function AutoAssignButton({
  distributionId, onDone,
}: {
  distributionId: string
  onDone?: () => void
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  // ⚠️ ברירת המחדל: לא לגעת במי שעוד רשאי לבחור. הפתיחה מפורשת בלבד.
  const [includeExtended, setIncludeExtended] = useState(false)

  const load = useCallback(async (withExtended: boolean) => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/distributions/${encodeURIComponent(distributionId)}/auto-assign-centers`
          + (withExtended ? '?include_extended=1' : ''),
        { cache: 'no-store' },
      )
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'טעינת התצוגה נכשלה')
      setPreview(d)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת התצוגה נכשלה')
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }, [distributionId, toast])

  const openModal = () => {
    setOpen(true)
    setIncludeExtended(false)
    void load(false)
  }

  const toggleExtended = (v: boolean) => {
    setIncludeExtended(v)
    void load(v)
  }

  const run = async () => {
    if (!preview) return
    setRunning(true)
    try {
      const res = await fetch(
        `/api/admin/distributions/${encodeURIComponent(distributionId)}/auto-assign-centers`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // ⚠️ expected — אם המצב זז מאז התצוגה, השרת עוצר ומדווח.
          body: JSON.stringify({ includeExtended, expected: preview.total }),
        },
      )
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'השיבוץ נכשל')
      toast.success(`${d.assigned} משפחות שובצו למוקד`)
      setOpen(false)
      onDone?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'השיבוץ נכשל')
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <button type="button" onClick={openModal}
        className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-violet-700">
        <MapPin size={14} /> שיבוץ אוטומטי למוקד
      </button>

      <Modal
        open={open}
        onClose={() => !running && setOpen(false)}
        title="שיבוץ אוטומטי למוקד לפי עיר"
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => setOpen(false)} disabled={running}
              className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-50">
              ביטול
            </button>
            <Button onClick={() => void run()}
              disabled={running || loading || !preview || preview.total === 0}
              className="rounded-xl">
              {running ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {preview ? `שבץ ${preview.total} משפחות` : 'שבץ'}
            </Button>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" /> בונה תצוגה מקדימה…
          </div>
        ) : !preview ? (
          <p className="py-8 text-center text-sm text-slate-500">לא ניתן לבנות תצוגה מקדימה.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-700">
              כל משפחה שטרם בחרה תשובץ למוקד <strong>בעיר שלה</strong>. בעיר עם כמה
              מוקדים — למוקד המרכזי (זה שהכי הרבה בחרו בו).
            </p>

            {/* 🔴 התווית — הסיבה שאפשר להריץ את זה בלי לאבד מידע. */}
            <p className="rounded-xl bg-violet-50 px-3 py-2 text-[12px] leading-relaxed text-violet-900">
              כל שיבוץ יסומן <strong>&quot;שובץ אוטומטית&quot;</strong> ויישאר מסומן כך —
              כדי שתמיד יהיה אפשר לדעת מי בחר בעצמו ומי שובץ על ידינו אחרי המועד.
            </p>

            {preview.total === 0 ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-4 text-center text-sm font-bold text-emerald-800">
                אין מי לשבץ — לכולם כבר יש מוקד.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-right text-[11px] font-bold text-slate-500">
                      <th className="px-3 py-2">מוקד</th>
                      <th className="px-3 py-2 text-center">יתווספו</th>
                      <th className="px-3 py-2 text-center">יש כעת</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.byCenter.map(c => (
                      <tr key={c.centerId}>
                        <td className="px-3 py-2 font-bold text-slate-800">{c.centerName}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-xs font-extrabold text-violet-800 ltr-num">
                            +{c.count}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-slate-500 ltr-num">{c.taken}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ⚠️ מי שלא ישובץ — מוצג במפורש כדי שלא יתגלה בדיעבד. */}
            {preview.noCenterInCity.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-amber-900">
                  <AlertTriangle size={13} />
                  {preview.noCenterInCity.reduce((s, c) => s + c.count, 0)} משפחות יישארו ללא מוקד — אין מוקד בעירן
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                  {preview.noCenterInCity.map(c => `${c.city} (${c.count})`).join(' · ')}
                </p>
              </div>
            )}

            {preview.noCity > 0 && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-800">
                {preview.noCity} משפחות ללא עיר רשומה בכרטסת — לא ניתן לשבץ אותן.
              </p>
            )}

            {/* קבוצת ההארכה — ברירת המחדל היא לא לגעת בה. */}
            {(preview.skippedStillOpen > 0 || includeExtended) && (
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <input type="checkbox" checked={includeExtended}
                  onChange={e => toggleExtended(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-violet-600" />
                <span className="text-[12px] leading-relaxed text-slate-700">
                  לשבץ גם את מי שהמועד המוארך שלו עדיין פתוח
                  {preview.skippedStillOpen > 0 && !includeExtended && (
                    <strong> ({preview.skippedStillOpen} משפחות)</strong>
                  )}
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    ⚠️ שיבוץ נועל את הבחירה. בדרך כלל אין לסמן — הם עדיין יכולים לבחור בעצמם.
                  </span>
                </span>
              </label>
            )}

            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
              <X size={12} className="mt-0.5 flex-shrink-0 text-slate-400" />
              הפעולה אינה הפיכה מהמסך. משפחה בודדת אפשר לשנות אחר כך דרך עמודת המוקד בטבלה.
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}
