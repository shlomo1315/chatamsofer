'use client'

// ─────────────────────────────────────────────────────────────────────────────
// הורדת רשימות איסוף למוקדים.
//
// 🔴 כפתור לכל מוקד בנפרד, ולא רק הורדה מרוכזת: הרשימה נמסרת לראש המוקד,
// והוא צריך את שלו בלבד.
//
// ⚠️ ההורדה היא ניווט מלא ולא fetch+blob: נטפרי חוסם הורדות שנוצרות
// ב-JavaScript מ-blob, והמשתמש מקבל דף לבן בלי שום הסבר.
// ראו components/ui/DocViewer והערות ה-PDF שם.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react'
import { Loader2, Printer, FileText, FileArchive, ClipboardList, Download } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'

interface CenterRow {
  id: string
  name: string | null
  city: string | null
  count: number
}

export default function CenterListsButton({ distributionId }: { distributionId: string }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [centers, setCenters] = useState<CenterRow[]>([])
  const [distName, setDistName] = useState('')

  const base = `/api/admin/distributions/${encodeURIComponent(distributionId)}/center-lists`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(base, { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'טעינת המוקדים נכשלה')
      setCenters(d.centers ?? [])
      setDistName(d.distributionName ?? '')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת המוקדים נכשלה')
    } finally {
      setLoading(false)
    }
  }, [base, toast])

  const openModal = () => { setOpen(true); void load() }

  // ⚠️ ניווט ולא blob — ראו ההערה בראש הקובץ.
  const download = (qs: string) => { window.location.href = `${base}?${qs}` }

  const total = centers.reduce((s, c) => s + c.count, 0)

  return (
    <>
      <button type="button" onClick={openModal}
        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800">
        <Printer size={14} /> רשימות למוקדים
      </button>

      <Modal open={open} onClose={() => setOpen(false)}
        title="רשימות איסוף למוקדים" size="lg">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" /> טוען מוקדים…
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-600">
              רשימה מודפסת לכל מוקד — ת&quot;ז, שם, טלפון וכתובת, ממוינות לפי א&quot;ב,
              עם משבצת סימון לכל משפחה. כל מוקד בעמודים נפרדים.
            </p>

            {/* ── הורדות מרוכזות ── */}
            <div className="grid gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => download('all=1')}
                className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-indigo-200 bg-indigo-50 px-3 py-3 text-center hover:border-indigo-300">
                <FileText size={18} className="text-indigo-600" />
                <span className="text-xs font-extrabold text-indigo-900">כל המוקדים</span>
                <span className="text-[10px] leading-tight text-indigo-700">
                  קובץ אחד להדפסה
                </span>
              </button>

              <button type="button" onClick={() => download('zip=1')}
                className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-violet-200 bg-violet-50 px-3 py-3 text-center hover:border-violet-300">
                <FileArchive size={18} className="text-violet-600" />
                <span className="text-xs font-extrabold text-violet-900">קובץ לכל מוקד</span>
                <span className="text-[10px] leading-tight text-violet-700">
                  ZIP — לשליחה לראשי המוקדים
                </span>
              </button>

              <button type="button" onClick={() => download('summary=1')}
                className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-3 py-3 text-center hover:border-emerald-300">
                <ClipboardList size={18} className="text-emerald-600" />
                <span className="text-xs font-extrabold text-emerald-900">דף סיכום</span>
                <span className="text-[10px] leading-tight text-emerald-700">
                  כמה כרטיסים בכל מוקד
                </span>
              </button>
            </div>

            {/* ── מוקד בודד ── */}
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="text-[11px] font-bold text-slate-500">הורדה למוקד בודד</p>
                <p className="text-[11px] text-slate-400 ltr-num">
                  {centers.length} מוקדים · {total.toLocaleString('he-IL')} משפחות
                </p>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                {centers.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-slate-400">
                    לא הוגדרו מוקדים פתוחים בחלוקה זו.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {centers.map(c => (
                      <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">{c.name}</p>
                          {c.city && c.city !== c.name && (
                            <p className="text-[11px] text-slate-500">{c.city}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 ltr-num">
                            {c.count}
                          </span>
                          <button type="button"
                            onClick={() => download(`center=${encodeURIComponent(c.id)}`)}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800">
                            <Download size={11} /> הורד
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {distName && (
              <p className="text-[11px] text-slate-400">החלוקה: {distName}</p>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
