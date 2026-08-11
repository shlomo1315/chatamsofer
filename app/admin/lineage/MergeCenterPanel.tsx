'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, X, AlertTriangle, Check, ChevronLeft, ChevronRight, Users, IdCard } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// ─────────────────────────────────────────────────────────────────────────────
// מרכז המיזוגים — תור עבודה: אשכול אחד על המסך, הכרעה, והבא.
//
// ⚠️ תור ולא טבלה: הצוואר כאן הוא *הכרעה* ולא ניווט. טבלה עם מאות שורות
// מחייבת להחליט מה לפתוח לפני שמחליטים מה למזג — שתי החלטות במקום אחת.
//
// ⚠️ אשכול multi_card (יותר מכרטסת אחת) מוצג עם אזהרה ואינו נחסם. שתי כרטסות
// תחת שם זהה הן או אותו אדם שנרשם פעמיים, או שני אנשים שונים — ומהנתונים
// לבדם אי אפשר להכריע. ההכרעה של המנהל, והאזהרה היא שמוודאת שהיא מודעת.
// ─────────────────────────────────────────────────────────────────────────────

interface Member {
  id: string; name: string; status: string; children: number
  idNumber: string | null; parentName: string
  beneficiaryIds: string[]; beneficiaryNames: string[]
}
interface Cluster {
  key: string; name: string; generation: number; removable: number
  sameParent: boolean; risk: 'clean' | 'single_card' | 'multi_card'
  cardCount: number; suggestedKeepId: string; members: Member[]
}
interface Stats {
  clusters: number; removable: number; clean: number; singleCard: number
  multiCard: number; sameParent: number
}

const RISK: Record<Cluster['risk'], { label: string; cls: string }> = {
  clean: { label: 'ללא כרטסת — מיזוג נקי', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  single_card: { label: 'כרטסת אחת', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  multi_card: { label: 'שתי כרטסות ומעלה — דורש הכרעה', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
}

export default function MergeCenterPanel({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [truncated, setTruncated] = useState(0)
  const [cur, setCur] = useState(0)
  const [keepId, setKeepId] = useState<string | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set())
  const [mergedTotal, setMergedTotal] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lineage/merge-center', { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'הטעינה נכשלה'); setLoading(false); return }
      setClusters(d.clusters ?? []); setStats(d.stats ?? null); setTruncated(d.truncated ?? 0)
      setCur(0)
    } catch { toast.error('שגיאת רשת') }
    setLoading(false)
  }, [toast])

  useEffect(() => { void load() }, [load])

  const pending = useMemo(() => clusters.filter(c => !doneKeys.has(c.key)), [clusters, doneKeys])
  const cluster = pending[cur] ?? null

  // איפוס הבחירה בכל מעבר לאשכול — אחרת "הוצאתי צומת" נדבק לאשכול הבא
  useEffect(() => {
    setKeepId(cluster?.suggestedKeepId ?? null)
    setExcluded(new Set())
  }, [cluster?.key, cluster?.suggestedKeepId])

  const active = useMemo(
    () => (cluster?.members ?? []).filter(m => !excluded.has(m.id)),
    [cluster, excluded])
  const mergeIds = useMemo(
    () => active.filter(m => m.id !== keepId).map(m => m.id),
    [active, keepId])
  const movingChildren = useMemo(
    () => active.filter(m => m.id !== keepId).reduce((s, m) => s + m.children, 0),
    [active, keepId])
  const movingCards = useMemo(
    () => active.filter(m => m.id !== keepId).reduce((s, m) => s + m.beneficiaryIds.length, 0),
    [active, keepId])

  const next = useCallback(() => setCur(c => Math.min(Math.max(0, pending.length - 1), c + 1)), [pending.length])
  const prev = useCallback(() => setCur(c => Math.max(0, c - 1)), [])

  const doMerge = useCallback(async () => {
    if (!cluster || !keepId || !mergeIds.length || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/lineage/merge-center', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId, mergeIds }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'המיזוג נכשל'); setBusy(false); return }
      toast.success(`מוזגו ${d.merged} צמתים · ${d.children} ילדים הועברו`)
      setMergedTotal(t => t + (d.merged ?? 0))
      setDoneKeys(s => new Set(s).add(cluster.key))
      setCur(c => Math.max(0, Math.min(c, pending.length - 2)))
      onDone()
    } catch { toast.error('שגיאת רשת') }
    setBusy(false)
  }, [cluster, keepId, mergeIds, busy, toast, onDone, pending.length])

  // מקלדת — Enter מזג, S דלג, חצים ניווט
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'Enter') { e.preventDefault(); void doMerge() }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); next() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); prev() }
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [doMerge, next, prev, onClose])

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-start justify-center overflow-auto p-4" onClick={onClose}>
      <div className="w-full max-w-5xl my-6 rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* כותרת + מונים */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-extrabold text-slate-800">תור הכפילויות</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              שם זהה בדיוק באותו דור — גם תחת אבות שונים. המערכת מציעה, אתם מכריעים.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        {stats && (
          <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 text-[11px] font-bold">
            <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
              {pending.length} אשכולות בתור
            </span>
            <span className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
              {stats.removable} צמתים מיותרים
            </span>
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
              {stats.clean} ללא כרטסת
            </span>
            <span className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-amber-800">
              {stats.multiCard} דורשים הכרעה
            </span>
            {mergedTotal > 0 && (
              <span className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">
                מוזגו בהרצה זו: {mergedTotal}
              </span>
            )}
            {truncated > 0 && (
              <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
                +{truncated} אשכולות נוספים לא מוצגים
              </span>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-16 text-slate-400">
            <Loader2 size={18} className="animate-spin" /> טוען אשכולות…
          </div>
        ) : !cluster ? (
          <div className="p-16 text-center">
            <Check size={36} className="mx-auto mb-3 text-emerald-500" />
            <p className="font-bold text-slate-700">אין אשכולות ממתינים</p>
            <p className="mt-1 text-xs text-slate-500">
              {mergedTotal > 0 ? `מוזגו ${mergedTotal} צמתים בהרצה זו.` : 'לא נמצאו כפילויות שם באותו דור.'}
            </p>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-100 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-extrabold text-slate-800">{cluster.name}</h3>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                  דור {cluster.generation}
                </span>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                  {cluster.members.length} עותקים
                </span>
                <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${RISK[cluster.risk].cls}`}>
                  {RISK[cluster.risk].label}
                </span>
                {!cluster.sameParent && (
                  <span className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                    תחת אבות שונים
                  </span>
                )}
                <span className="ms-auto text-[11px] font-semibold text-slate-400">
                  אשכול {cur + 1} מתוך {pending.length}
                </span>
              </div>

              {cluster.risk === 'multi_card' && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
                  <AlertTriangle size={15} className="mt-0.5 flex-none text-amber-600" />
                  <p className="text-[12px] font-semibold leading-relaxed text-amber-900">
                    באשכול הזה מקושרות <b>{cluster.cardCount} כרטסות שונות</b> — כלומר או שאותו אדם
                    נרשם פעמיים, או שאלו שני אנשים שונים בעלי אותו שם.
                    <b> מיזוג ידביק את שתי המשפחות.</b> בדקו את הכרטסות למטה לפני ההכרעה,
                    והוציאו ידנית כל עותק שאינו אותו אדם.
                  </p>
                </div>
              )}
            </div>

            {/* העותקים */}
            <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {cluster.members.map(m => {
                const isKeep = m.id === keepId
                const isOut = excluded.has(m.id)
                return (
                  <div key={m.id}
                    onClick={() => { if (!isOut) setKeepId(m.id) }}
                    className={`relative cursor-pointer rounded-xl border-2 p-3 transition ${
                      isOut ? 'border-dashed border-slate-200 bg-slate-50 opacity-60'
                        : isKeep ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-[13px] font-bold leading-tight ${isOut ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                        {m.name}
                      </p>
                      <button type="button"
                        onClick={e => {
                          e.stopPropagation()
                          setExcluded(s => {
                            const n = new Set(s)
                            if (n.has(m.id)) n.delete(m.id); else n.add(m.id)
                            // הוצאת המוביל מעבירה את התפקיד לעותק הראשון שנשאר
                            if (!n.has(m.id) || m.id !== keepId) return n
                            const left = cluster.members.find(x => x.id !== m.id && !n.has(x.id))
                            setKeepId(left?.id ?? null)
                            return n
                          })
                        }}
                        className="flex-none rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600">
                        {isOut ? 'החזר' : 'הוצא'}
                      </button>
                    </div>
                    <div className="mt-2 space-y-1 text-[11px]">
                      <div className="flex justify-between"><span className="text-slate-400">אב</span>
                        <span className="font-semibold text-slate-600 truncate max-w-[60%]">{m.parentName}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">ילדים</span>
                        <span className="font-bold text-slate-700 ltr-num">{m.children}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">ת״ז</span>
                        <span className="font-semibold text-slate-600 ltr-num">{m.idNumber || '—'}</span></div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
                      {isKeep && !isOut && (
                        <span className="rounded border border-blue-200 bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                          יישאר
                        </span>
                      )}
                      {m.beneficiaryNames.length > 0 ? m.beneficiaryNames.map((bn, i) => (
                        <a key={i} href={`/admin/beneficiaries/${m.beneficiaryIds[i]}`} target="_blank" rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100">
                          <IdCard size={10} />{bn} ↗
                        </a>
                      )) : (
                        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                          בלי כרטסת
                        </span>
                      )}
                      {m.status !== 'verified' && (
                        <span className="rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
                          {m.status === 'rejected' ? 'נדחה' : 'ממתין'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* תצוגה מקדימה + פעולות */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-5">
              <p className="text-[12.5px] font-semibold leading-relaxed text-slate-600">
                {mergeIds.length === 0 ? (
                  <span className="text-amber-700">לא נותרו צמתים למיזוג באשכול הזה.</span>
                ) : (
                  <>
                    המיזוג יעביר <b className="text-blue-700">{movingChildren}</b> ילדים
                    {movingCards > 0 && <> ו־<b className="text-blue-700">{movingCards}</b> כרטסות</>}
                    {' '}לצומת הנבחר, וימחק <b className="text-blue-700">{mergeIds.length}</b> צמתים.
                    {excluded.size > 0 && <span className="text-amber-700"> ({excluded.size} הוצאו ידנית)</span>}
                  </>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={prev} disabled={cur === 0}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-40">
                  <ChevronRight size={15} />
                </button>
                <button onClick={next}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                  דלג <ChevronLeft size={13} className="inline" />
                </button>
                <button onClick={() => void doMerge()} disabled={busy || !mergeIds.length}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                  {busy && <Loader2 size={13} className="animate-spin" />}
                  <Users size={13} /> מזג {mergeIds.length} צמתים
                </button>
              </div>
            </div>
            <p className="px-5 pb-4 text-[11px] text-slate-400">
              <b>Enter</b> מזג · <b>S</b> דלג · <b>← →</b> ניווט · <b>Esc</b> סגירה
            </p>
          </>
        )}
      </div>
    </div>
  )
}
