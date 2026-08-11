'use client'

// ─────────────────────────────────────────────────────────────────────────────
// דור אחרון כפול — נרשם שנתלה כילד של עצמו.
//
// שלא כמו מסך צמתי הרפאים, כאן *יש* פעולה שמשנה נתונים. לכן:
//   · הפעולה פועלת רק על שורות שסומנו במפורש, ולעולם לא על "הכל" בלחיצה אחת
//     בלי מעבר דרך אישור שמפרט מה עומד לקרות.
//   · השרת סורק מחדש ומתקן רק מה שעובר את הזיהוי המלא אצלו. הסימון כאן הוא
//     בחירה, לא הוכחה.
//   · מה שמוגן (צבר ילדים או כרטסות נוספות) מוצג בנפרד ואינו ניתן לסימון.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react'
import {
  GitMerge, Loader2, Search, ChevronLeft, ExternalLink, ShieldQuestion,
  ShieldCheck, Info, ArrowLeft, Wrench,
} from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

interface Row {
  benId: string
  benName: string
  benIdNumber: string
  dupNodeId: string
  dupNodeName: string
  dupGeneration: number
  dupStatus: string | null
  keepNodeId: string
  keepNodeName: string
  keepGeneration: number
  willCopyIdNumber: boolean
}
interface Blocked extends Row { guard: string }

interface ScanData {
  rows: Row[]
  blocked: Blocked[]
  total: number
  blockedTotal: number
  scannedNodes: number
  scannedBeneficiaries: number
  truncated: boolean
  maxRows: number
  restricted: boolean
}

const he = (n: number) => n.toLocaleString('he-IL')

const STATUS: Record<string, { txt: string; cls: string }> = {
  verified: { txt: 'מאושר', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  pending: { txt: 'ממתין', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  rejected: { txt: 'נדחה', cls: 'text-red-700 bg-red-50 border-red-200' },
}

export default function SelfDuplicatesPanel({ onLocate, onFixed }: {
  onLocate: (id: string) => void
  onFixed: () => void
}) {
  const toast = useToast()
  const [data, setData] = useState<ScanData | null>(null)
  const [loading, setLoading] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [err, setErr] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const [openBlocked, setOpenBlocked] = useState(false)

  const scan = useCallback(async () => {
    setLoading(true); setErr(''); setPicked(new Set())
    try {
      const res = await fetch('/api/admin/lineage/self-duplicates', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'שגיאה בסריקה'); setData(null) }
      else { setData(d); setOpenBlocked(false) }
    } catch { setErr('שגיאת רשת') }
    setLoading(false)
  }, [])

  const runFix = useCallback(async () => {
    setConfirm(false)
    if (!picked.size) return
    setFixing(true)
    try {
      const res = await fetch('/api/admin/lineage/self-duplicates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dupNodeIds: [...picked] }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error ?? 'התיקון נכשל'); setFixing(false); return }
      const bits = [`תוקנו ${he(d.fixed)}`]
      if (d.claimed) bits.push(`ת״ז הועברה ב-${he(d.claimed)}`)
      if (d.rejected) bits.push(`${he(d.rejected)} דולגו — כבר אינם עומדים בתנאים`)
      if (d.failures?.length) toast.error(`${bits.join(' · ')} · כשלים: ${d.failures.length}`)
      else toast.success(bits.join(' · '))
      onFixed()
      await scan()
    } catch { toast.error('שגיאת רשת') }
    setFixing(false)
  }, [picked, toast, onFixed, scan])

  const rows = data?.rows ?? []
  const allPicked = rows.length > 0 && rows.every(r => picked.has(r.dupNodeId))
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(rows.map(r => r.dupNodeId)))
  const toggle = (id: string) => setPicked(p => {
    const n = new Set(p)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  return (
    <div className="mb-4 rounded-2xl border-2 border-fuchsia-300 bg-fuchsia-50/40 p-4" dir="rtl">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitMerge size={18} className="text-fuchsia-700" />
          <h2 className="text-sm font-bold text-slate-800">דור אחרון כפול — נרשם שנתלה כילד של עצמו</h2>
          {data && (
            <span className="text-xs text-slate-400">
              סרקנו {he(data.scannedNodes)} צמתים · {he(data.scannedBeneficiaries)} כרטסות
            </span>
          )}
        </div>
        <button onClick={scan} disabled={loading || fixing}
          className="flex items-center gap-1.5 rounded-lg bg-fuchsia-700 px-3 py-1.5 text-sm text-white transition-colors hover:bg-fuchsia-800 disabled:bg-slate-300">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {data ? 'סרוק שוב' : 'סרוק את העץ'}
        </button>
      </div>

      <p className="mb-2 text-[11px] leading-relaxed text-slate-600">
        הרישום מוודא שלכל נרשם יש צומת, ולפני שהוא יוצר חדש הוא בודק אם הצומת שהנרשם כבר מקושר אליו הוא
        <strong> הוא עצמו</strong>. הבדיקה נשענה על שרשרת הייחוס, והרישום הציבורי לא שלף אותה — כך שדי היה
        בהבדל ניסוח אחד (״חנה רחל״ מול ״מנה רחל״) כדי שייווצר לנרשם עותק שני, דור אחד עמוק מדי.
        <br />
        <strong>המקור תוקן.</strong> כאן מתקנים את מה שכבר נוצר: הכרטסת מוחזרת לצומת האמיתי, הת״ז מסומנת עליו,
        והעותק נמחק.
      </p>

      <p className="mb-3 inline-flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
        <Info size={13} className="mt-0.5 shrink-0" />
        נמחק רק צומת שהוכח כעותק <strong>ואין לו ילדים ואין כרטסות אחרות עליו</strong>. השרת בודק את זה מחדש
        ברגע התיקון, ולא סומך על הסימון במסך.
      </p>

      {err && <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

      {!data && !loading && !err && (
        <p className="text-sm text-slate-500">לחצו ״סרוק את העץ״ כדי לראות כמה כאלה יש ומי הם.</p>
      )}

      {data?.restricted && (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <ShieldQuestion size={12} className="ml-1 inline" />
          המספרים מלאים, אך ת״ז ומעבר לכרטסת מוצגים רק לבעלי הרשאת צפייה במשפחות.
        </p>
      )}

      {data && (
        <div className="flex flex-col gap-3">
          {data.total === 0 ? (
            <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              🎉 לא נמצאו נרשמים שנתלו כילד של עצמם.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-fuchsia-200 bg-white px-3 py-2">
                <span className="text-sm font-bold text-slate-800">
                  נמצאו <span className="text-fuchsia-700">{he(data.total)}</span> לתיקון
                </span>
                <button onClick={toggleAll}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-fuchsia-300">
                  {allPicked ? 'נקה סימון' : `סמן את כל ${he(rows.length)} המוצגים`}
                </button>
                <span className="text-[11px] text-slate-500">סומנו {he(picked.size)}</span>
                <button onClick={() => setConfirm(true)} disabled={!picked.size || fixing}
                  className="mr-auto inline-flex items-center gap-1.5 rounded-xl bg-fuchsia-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-fuchsia-800 disabled:bg-slate-300">
                  {fixing ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
                  תקן את המסומנים
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="max-h-[26rem] overflow-y-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="w-8 px-3 py-2"></th>
                        <th className="px-3 py-2 font-medium">הכרטסת</th>
                        <th className="px-3 py-2 font-medium">ת״ז</th>
                        <th className="px-3 py-2 font-medium">העותק שיימחק</th>
                        <th className="px-3 py-2 font-medium">הצומת שיישאר</th>
                        <th className="px-3 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map(r => {
                        const st = STATUS[r.dupStatus ?? 'pending'] ?? STATUS.pending
                        return (
                          <tr key={r.dupNodeId} className={picked.has(r.dupNodeId) ? 'bg-fuchsia-50/60' : 'hover:bg-slate-50'}>
                            <td className="px-3 py-2">
                              <input type="checkbox" checked={picked.has(r.dupNodeId)}
                                onChange={() => toggle(r.dupNodeId)}
                                className="h-4 w-4 accent-fuchsia-700" />
                            </td>
                            <td className="max-w-[180px] truncate px-3 py-2 font-medium text-slate-800">{r.benName}</td>
                            <td className="ltr-num px-3 py-2 font-mono text-xs text-slate-500">{r.benIdNumber || '—'}</td>
                            <td className="px-3 py-2">
                              <button onClick={() => onLocate(r.dupNodeId)}
                                className="text-right text-xs text-rose-700 hover:text-rose-900">
                                דור {r.dupGeneration} · {r.dupNodeName}
                              </button>
                              <span className={`mr-1.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${st.cls}`}>{st.txt}</span>
                            </td>
                            <td className="px-3 py-2">
                              <button onClick={() => onLocate(r.keepNodeId)}
                                className="flex items-center gap-1 text-right text-xs text-emerald-700 hover:text-emerald-900">
                                <ArrowLeft size={11} className="shrink-0" />
                                דור {r.keepGeneration} · {r.keepNodeName}
                              </button>
                              {r.willCopyIdNumber && (
                                <span className="block text-[10px] text-slate-400">הת״ז תסומן עליו</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {r.benId && (
                                <a href={`/admin/beneficiaries/${r.benId}`} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-800">
                                  <ExternalLink size={12} /> כרטסת
                                </a>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {data.truncated && (
                  <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
                    מוצגות {he(rows.length)} מתוך {he(data.total)} — הספירה מלאה. תקנו את המוצגות וסרקו שוב.
                  </p>
                )}
              </div>
            </>
          )}

          {/* ⚠️ המוגנים מוצגים במפורש: "למה זה לא ברשימה" היא שאלה שחייבת תשובה. */}
          {data.blockedTotal > 0 && (
            <div>
              <button onClick={() => setOpenBlocked(o => !o)}
                className="flex w-full items-start gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-[11px] leading-relaxed text-slate-500 transition-colors hover:bg-slate-50">
                <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>
                  עוד <strong>{he(data.blockedTotal)}</strong> זוהו כעותקים אך הושארו בחוץ במכוון — צברו ילדים
                  או כרטסות נוספות, ומחיקתם הייתה מנתקת רשומות אמיתיות.
                </span>
                <ChevronLeft size={13} className={`mr-auto mt-0.5 shrink-0 text-slate-300 transition-transform ${openBlocked ? '-rotate-90' : ''}`} />
              </button>
              {openBlocked && (
                <div className="mt-1 max-h-[20rem] overflow-y-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-right text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 font-medium">הכרטסת</th>
                        <th className="px-3 py-2 font-medium">הצומת</th>
                        <th className="px-3 py-2 font-medium">למה לא נוגעים</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.blocked.map(r => (
                        <tr key={r.dupNodeId} className="hover:bg-slate-50">
                          <td className="max-w-[180px] truncate px-3 py-2 text-slate-800">{r.benName}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => onLocate(r.dupNodeId)}
                              className="text-right text-xs text-slate-600 hover:text-violet-700">
                              דור {r.dupGeneration} · {r.dupNodeName}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-xs text-emerald-700">{r.guard}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        danger
        title="תיקון דור אחרון כפול"
        confirmLabel={`תקן ${he(picked.size)}`}
        message={
          <div className="flex flex-col gap-2 text-right text-[13px] leading-relaxed">
            <p>עבור <strong>{he(picked.size)}</strong> נרשמים תתבצע הפעולה הבאה:</p>
            <ol className="mr-4 list-decimal space-y-1 text-slate-600">
              <li>הכרטסת תוחזר לצומת האמיתי של הנרשם (צומת האב).</li>
              <li>הת״ז תסומן על אותו צומת, אם חסרה לו.</li>
              <li>הצומת הכפול יימחק.</li>
            </ol>
            <p className="text-slate-500">
              נמחק רק צומת בלי ילדים ובלי כרטסות אחרות. השרת בודק זאת מחדש ומדלג על כל מה שהשתנה מאז הסריקה.
            </p>
            <p className="font-bold text-rose-700">המחיקה אינה הפיכה.</p>
          </div>
        }
        onConfirm={() => void runFix()}
        onCancel={() => setConfirm(false)}
      />
    </div>
  )
}
