'use client'

// סקירה מהירה — קבוצת כפילות אחת על המסך, הכרעה במקלדת.
//
// 🔴 הבעיה שזה סוגר: ברמת "קרובים מאוד" יש מאות קבוצות, וכל אחת דורשת הכרעה
// אנושית. ברשימה הרגילה צריך לגלול, לאתר את הזוג בין שאר הכרטיסים, לקרוא,
// ללחוץ, ולמצוא את המקום מחדש אחרי שהרשימה מתעדכנת. על 598 קבוצות זו עבודה
// של ערב שלם, ובאמצע הדרך העין מפסיקה לקרוא ומתחילה ללחוץ.
//
// כאן יש דבר אחד על המסך, ההכרעה היא הקשה אחת, והמעבר מיידי.
//
// ⚠️ ההכרעה עצמה לא הוקלה — רק הניווט אליה. אותם שמות, אותו נימוק, אותה בחירת
// שם, ואותו "אינם אותו אדם". מסך מהיר שמסתיר מידע היה הופך טעויות למהירות יותר.
import { useState, useEffect, useCallback, useRef } from 'react'
import { Check, X, ChevronLeft, Loader2, Undo2, Keyboard, MapPin } from 'lucide-react'

export interface QuickNode {
  id: string; name: string; status: string | null; relation: string | null
  children: number; families: number
}
export interface QuickGroup {
  level: 'exact' | 'strong' | 'possible'
  reason: string; parentId: string; parentName: string
  generation: number; nodes: QuickNode[]
}

export type QuickDecision = 'merged' | 'dismissed' | 'skipped'

const statusTxt = (s: string | null) => s === 'rejected' ? 'נדחה' : s === 'pending' ? 'ממתין' : 'מאושר'
const relTxt = (r: string | null) => r === 'son' ? 'בן' : r === 'son_in_law' ? 'חתן' : 'לא צוין'

/** הניסוח המפורט ביותר — ברירת המחדל לשם שיישאר. */
export const fullestOf = (nodes: QuickNode[]) =>
  [...nodes].sort((a, b) => {
    const aw = a.name.trim().split(/\s+/).length, bw = b.name.trim().split(/\s+/).length
    return aw !== bw ? bw - aw : b.name.trim().length - a.name.trim().length
  })[0]?.name ?? ''

export default function QuickReview({
  groups, levelLabel, onMerge, onDismiss, onUndo, onLocate, onClose,
}: {
  groups: QuickGroup[]
  levelLabel: string
  /** ממזג. name = הניסוח שנבחר. מחזיר true בהצלחה. */
  onMerge: (g: QuickGroup, name: string) => Promise<boolean>
  onDismiss: (g: QuickGroup) => Promise<boolean>
  /** ביטול המיזוג האחרון. מחזיר true בהצלחה. */
  onUndo: () => Promise<boolean>
  onLocate: (ids: string[]) => void
  onClose: () => void
}) {
  const [i, setI] = useState(0)
  // ⚠️ null = "לא נגעו בשדה", ואז מוצג הניסוח המפורט ביותר של הקבוצה הנוכחית.
  //
  // ברירת המחדל *נגזרת* מהקבוצה ולא נכתבת ל-state באפקט: כתיבה באפקט הייתה
  // מריצה רינדור נוסף בכל מעבר, ובעיקר — שם שהוקלד לזוג אחד היה עלול להישאר
  // על המסך רגע אחד אחרי המעבר לזוג הבא, ולהישמר בטעות.
  const [typed, setTyped] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tally, setTally] = useState({ merged: 0, dismissed: 0, skipped: 0 })
  const [canUndo, setCanUndo] = useState(false)
  const g: QuickGroup | undefined = groups[i]
  const name = typed ?? (g ? fullestOf(g.nodes) : '')

  const advance = useCallback((kind: QuickDecision) => {
    setTally(t => ({ ...t, [kind]: t[kind] + 1 }))
    setTyped(null)
    setI(n => n + 1)
  }, [])

  const doMerge = useCallback(async () => {
    if (!g || busy) return
    setBusy(true)
    const ok = await onMerge(g, name.trim() || fullestOf(g.nodes))
    setBusy(false)
    if (ok) { setCanUndo(true); advance('merged') }
  }, [g, busy, name, onMerge, advance])

  const doDismiss = useCallback(async () => {
    if (!g || busy) return
    setBusy(true)
    const ok = await onDismiss(g)
    setBusy(false)
    // ⚠️ "אינם אותו אדם" אינו ניתן לביטול בכפתור החזרה — הוא רק מסיר הצעה,
    // ולא משנה דבר בעץ. סימון canUndo כאן היה מבטיח משהו שלא קיים.
    if (ok) { setCanUndo(false); advance('dismissed') }
  }, [g, busy, onDismiss, advance])

  const doUndo = useCallback(async () => {
    if (!canUndo || busy) return
    setBusy(true)
    const ok = await onUndo()
    setBusy(false)
    if (ok) { setCanUndo(false); setTyped(null); setTally(t => ({ ...t, merged: Math.max(0, t.merged - 1) })); setI(n => Math.max(0, n - 1)) }
  }, [canUndo, busy, onUndo])

  // ⚠️ מקשים ולא חצים: בממשק ימין-לשמאל "חץ ימינה" הוא קדימה או אחורה תלוי
  // את מי שואלים, וטעות כאן היא מיזוג שלא התכוונו אליו. מקשים בעלי שם מפורש
  // אינם משתמעים לשתי פנים.
  const nameFocused = useRef(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (nameFocused.current || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'enter') { e.preventDefault(); void doMerge() }
      else if (k === 'x' || k === 'delete' || k === 'backspace') { e.preventDefault(); void doDismiss() }
      else if (k === ' ') { e.preventDefault(); advance('skipped') }
      else if (k === 'u') { e.preventDefault(); void doUndo() }
      else if (k === 'escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doMerge, doDismiss, doUndo, advance, onClose])

  const total = groups.length
  const done = tally.merged + tally.dismissed + tally.skipped

  return (
    <div className="fixed inset-0 z-[90] bg-slate-900/80 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-6 overflow-hidden border-2 border-indigo-300">
        <div className="bg-indigo-600 px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-black text-white">סקירה מהירה — {levelLabel}</h3>
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold text-white">
              {Math.min(i + 1, total).toLocaleString('he-IL')} / {total.toLocaleString('he-IL')}
            </span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white" title="סגירה (Esc)"><X size={18} /></button>
        </div>

        <div className="h-1 bg-slate-100">
          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>

        {!g ? (
          <div className="px-6 py-12 text-center">
            <p className="text-lg font-black text-slate-800 mb-1">סיימתם את הרשימה</p>
            <p className="text-sm text-slate-500">
              מוזגו {tally.merged.toLocaleString('he-IL')} · סומנו כשונים {tally.dismissed.toLocaleString('he-IL')}
              {tally.skipped ? ` · דולגו ${tally.skipped.toLocaleString('he-IL')}` : ''}
            </p>
            {!!tally.skipped && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 inline-block">
                מה שדילגתם עליו לא הוכרע — הוא יופיע שוב בסריקה הבאה.
              </p>
            )}
            <button onClick={onClose} className="mt-5 block mx-auto rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">
              סגירה ורענון
            </button>
          </div>
        ) : (
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 flex-wrap mb-2 text-[11px]">
              <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 font-bold text-indigo-700">דור {g.generation}</span>
              <span className="text-slate-500">תחת: <strong className="text-slate-700">{g.parentName}</strong></span>
              <button onClick={() => onLocate(g.nodes.map(n => n.id))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 font-bold text-slate-600 hover:bg-slate-50">
                <MapPin size={11} /> הצג בעץ
              </button>
            </div>
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-3">{g.reason}</p>

            <div className="grid gap-2 sm:grid-cols-2 mb-3">
              {g.nodes.map(n => (
                <div key={n.id} className="rounded-xl border-2 border-slate-200 bg-slate-50/60 px-3 py-2.5">
                  <p className="text-sm font-black text-slate-800 leading-snug">{n.name}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {relTxt(n.relation)} · {statusTxt(n.status)} · {n.children} ילדים
                    {n.families ? ` · ${n.families} משפחות` : ''}
                  </p>
                </div>
              ))}
            </div>

            {/* ⚠️ בחירת השם נשארת גם במסלול המהיר. מי שנשאר נבחר לפי ילדים
                ואימות, ואין לזה קשר לאיכות ניסוח השם — בלי הבחירה מיזוג היה
                מוחק בשקט את שם האישה או את התואר. */}
            <p className="text-[11px] font-bold text-slate-600 mb-1.5">השם שיישאר:</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[...new Set(g.nodes.map(n => n.name.trim()))].map(nm => (
                <button key={nm} onClick={() => setTyped(nm)}
                  className={`rounded-lg border-2 px-2.5 py-1 text-xs font-bold transition-colors ${
                    name.trim() === nm ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {nm}
                </button>
              ))}
            </div>
            <input value={name} onChange={e => setTyped(e.target.value)}
              onFocus={() => { nameFocused.current = true }} onBlur={() => { nameFocused.current = false }}
              placeholder="או הזן ניסוח אחר…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-400" />

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => void doMerge()} disabled={busy}
                className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-50">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} מזג — אותו אדם
              </button>
              <button onClick={() => void doDismiss()} disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                <X size={15} /> אינם אותו אדם
              </button>
              <button onClick={() => advance('skipped')} disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                <ChevronLeft size={15} /> דלג
              </button>
              <button onClick={() => void doUndo()} disabled={busy || !canUndo}
                title={canUndo ? 'ביטול המיזוג האחרון' : 'אין מיזוג לבטל'}
                className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                <Undo2 size={15} />
              </button>
            </div>

            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
              <Keyboard size={12} />
              <strong>Enter</strong> מזג · <strong>X</strong> אינם אותו אדם · <strong>רווח</strong> דלג ·
              <strong>U</strong> בטל · <strong>Esc</strong> סגירה
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              מוזגו {tally.merged.toLocaleString('he-IL')} · שונים {tally.dismissed.toLocaleString('he-IL')}
              {tally.skipped ? ` · דולגו ${tally.skipped.toLocaleString('he-IL')}` : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
