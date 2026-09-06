'use client'

// ─────────────────────────────────────────────────────────────────────────────
// צפייה מהירה בסדר הדורות של משפחה — ומחיקה מיידית אם היא אינה שייכת.
//
// 🔴 הבעיה שזה פותר: בבדיקה מהירה מתגלות משפחות שאינן צאצאי החתם סופר
// (רישום כפול, טעות, או מי שאינו שייך). כדי להכריע היה צריך לפתוח כרטסת
// בכרטיסייה נפרדת, לגלול לשרשרת, לחזור, ואז לחפש איפה מוחקים. כאן הכול
// במקום אחד: השרשרת המלאה מול העיניים, וכפתור מחיקה לצדה.
//
// ⚠️ המחיקה עוברת ב-/api/admin/beneficiaries/delete הקיים — מנהל בלבד,
// ומוחקת מכל המחלקות (מסמכים, לידות, הלוואות, סיוע, אלמנות, חלוקות...)
// דרך CASCADE במסד. צומת העץ נמחק רק אם הוא עלה, כדי לא ליתם ענף.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { Loader2, X, Trash2, ExternalLink, AlertTriangle, GitBranch, Copy, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface ChainRow { generation: number; name: string; relation?: string | null }
interface Dup {
  id: string; name: string; idNumber: string | null; phone: string | null
  city: string | null; isSpecial: boolean; status: string | null
  createdAt: string; match: 'id' | 'phone' | 'name'
}
interface Detail {
  id: string
  name: string
  idNumber: string | null
  phone: string | null
  city: string | null
  status: string | null
  chain: ChainRow[]
  nodeName: string | null
  nodeStatus: string | null
  /** אחים בעלי אותו שם בעץ — כפילות במיזוג. */
  nodeSiblingDup: number
  duplicates: Dup[]
}

/** עוצמת ההתאמה. ⚠️ שם בלבד הוא רמז חלש — "שטרן משה" חוזר עשרות פעמים. */
const MATCH_META: Record<Dup['match'], { label: string; cls: string; strong: boolean }> = {
  id: { label: 'אותה ת״ז', cls: 'border-rose-300 bg-rose-50 text-rose-800', strong: true },
  phone: { label: 'אותו טלפון', cls: 'border-amber-300 bg-amber-50 text-amber-800', strong: true },
  name: { label: 'אותו שם בלבד', cls: 'border-slate-300 bg-slate-50 text-slate-600', strong: false },
}

export default function QuickChainModal({
  beneficiaryId, onClose, onDeleted,
}: {
  beneficiaryId: string
  onClose: () => void
  onDeleted?: (id: string) => void
}) {
  const toast = useToast()
  const [d, setD] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/lineage/quick-view?id=${encodeURIComponent(beneficiaryId)}`, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'טעינה נכשלה')
      setD(j.detail ?? null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינה נכשלה')
      onClose()
    } finally { setLoading(false) }
  }, [beneficiaryId, toast, onClose])

  // ⚠️ טעינה אסינכרונית בעלייה — הכלל מסמן גם את הדפוס התקין הזה.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const remove = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/beneficiaries/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: beneficiaryId }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'המחיקה נכשלה')
      toast.success(j.treeRemoved ? 'נמחק — כולל הצומת בעץ' : 'נמחק מכל המחלקות')
      onDeleted?.(beneficiaryId)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'המחיקה נכשלה')
    } finally { setDeleting(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div dir="rtl" onClick={e => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <GitBranch size={16} />
            </span>
            <h3 className="text-base font-bold text-slate-800">סדר הדורות</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        {loading && <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-indigo-500" /></div>}

        {!loading && d && (
          <>
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-sm font-bold text-slate-800">{d.name}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                {d.idNumber && <span dir="ltr">{d.idNumber}</span>}
                {d.phone && <span dir="ltr">{d.phone}</span>}
                {d.city && <span>{d.city}</span>}
              </p>
            </div>

            {/* ── כפילויות ──
                🔴 זו השאלה שמכריעה אם למחוק: רישום כפול נמחק בלב שקט,
                וכרטסת יחידה היא כל מה שיש על המשפחה. */}
            {d.duplicates.length > 0 ? (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-amber-900">
                  <Copy size={12} /> נמצאו {d.duplicates.length} כרטסות נוספות שעשויות להיות אותו אדם
                </p>
                <div className="flex flex-col gap-1">
                  {d.duplicates.map(dp => {
                    const m = MATCH_META[dp.match]
                    return (
                      <div key={dp.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${m.cls}`}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium">{dp.name}</span>
                          <span className="flex flex-wrap items-center gap-x-1.5 text-[10px] opacity-80">
                            {dp.idNumber && <span dir="ltr">{dp.idNumber}</span>}
                            {dp.phone && <span dir="ltr">{dp.phone}</span>}
                            {dp.city && <span>{dp.city}</span>}
                            {dp.isSpecial && <span className="font-bold">· אישורים חריגים</span>}
                          </span>
                        </span>
                        <span className="flex-shrink-0 rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-bold">
                          {m.label}
                        </span>
                        <a href={`/admin/beneficiaries/${dp.id}`} target="_blank" rel="noopener noreferrer"
                          className="flex-shrink-0 rounded p-1 hover:bg-white/60" title="פתיחת הכרטסת">
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    )
                  })}
                </div>
                {/* ⚠️ אזהרה מפורשת: שם זהה לבדו אינו הוכחה. */}
                {d.duplicates.every(x => x.match === 'name') && (
                  <p className="mt-1.5 text-[10px] leading-relaxed text-amber-800">
                    כל ההתאמות הן <b>לפי שם בלבד</b> — שם נפוץ חוזר במאגר עשרות פעמים.
                    ודאו לפי ת״ז או טלפון לפני מחיקה.
                  </p>
                )}
              </div>
            ) : (
              <div className="mb-3 flex items-center gap-1.5 rounded-xl border border-green-200 bg-green-50 px-2.5 py-2 text-[11px] text-green-800">
                <CheckCircle2 size={12} /> אין כרטסת נוספת לאדם זה במערכת.
              </div>
            )}

            {/* כפילות בעץ עצמו */}
            {d.nodeSiblingDup > 0 && (
              <div className="mb-3 flex items-start gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-2.5 py-2">
                <Copy size={12} className="mt-0.5 flex-shrink-0 text-purple-600" />
                <p className="text-[11px] leading-relaxed text-purple-800">
                  בעץ קיימים <b>{d.nodeSiblingDup}</b> צמתים נוספים באותו שם תחת אותו אב —
                  כלומר הצומת עצמו כפול וטעון מיזוג.
                </p>
              </div>
            )}

            {/* ── השרשרת ── */}
            {d.chain.length ? (
              <div className="mb-3 flex flex-col gap-0.5">
                {d.chain.map((c, i) => (
                  <div key={`${c.generation}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                    style={{ marginRight: Math.min(i, 10) * 11 }}>
                    <span className="flex-shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                      דור {c.generation}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-slate-700">{c.name}</span>
                    {c.relation && (
                      <span className="flex-shrink-0 text-[10px] text-slate-400">
                        {c.relation === 'son_in_law' ? 'חתן' : 'בן'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                אין שרשרת דורות רשומה למשפחה זו.
              </p>
            )}

            {/* ── פעולות ── */}
            <div className="flex flex-wrap items-center gap-2">
              <a href={`/admin/beneficiaries/${d.id}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <ExternalLink size={13} /> לכרטסת המלאה
              </a>
              <span className="flex-1" />
              {!confirming ? (
                <button onClick={() => setConfirming(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50">
                  <Trash2 size={13} /> מחיקה
                </button>
              ) : (
                <div className="flex w-full flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-rose-600" />
                    {/* 🔴 אזהרה מפורשת: המחיקה בלתי-הפיכה ונוגעת בכל המחלקות. */}
                    <p className="text-[11px] leading-relaxed text-rose-800">
                      <b>{d.name}</b> יימחק לצמיתות — כולל מסמכים, לידות, הלוואות,
                      סיוע, אלמנות וחלוקות. הפעולה <b>אינה הפיכה</b>.
                      הצומת בעץ יימחק רק אם אין מתחתיו צאצאים.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={remove} disabled={deleting}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                      {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      כן, מחק לצמיתות
                    </button>
                    <button onClick={() => setConfirming(false)} disabled={deleting}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">
                      ביטול
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
