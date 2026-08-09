'use client'
import { useMemo, useState } from 'react'
import { X, Loader2, Check } from 'lucide-react'
import { compareHebrewNames } from '@/lib/hebrewNames'

export interface CleanNode { id: string; name: string; generation: number; childCount: number; status?: string }

// ─────────────────────────────────────────────────────────────────────────────
// ניקוי ילדים כפולים תחת אב אחד.
//
// ⚠️ הבעיה שזה פותר: צומת עם 115 "ילדים" אינו משפחה — הוא ערימת כפילויות
// שנוצרה מרישומים חוזרים. הזיהוי בעץ עצמו תופס רק שם *זהה בדיוק*, ולכן
// "רבי ישראל שטערן" ו"רבי ישראל וביילא שטערן" נראים כשני אנשים שונים ואינם
// מסומנים כלל. הפאנל הזה מריץ את compareHebrewNames על כל הזוגות תחת אותו
// אב, מקבץ לאשכולות, ומאפשר מיזוג של אשכול שלם בלחיצה אחת.
//
// המנהל *מאשר* כל אשכול — המערכת רק מציעה. אשכול שאינו נכון פשוט מדלגים.
// ─────────────────────────────────────────────────────────────────────────────
export default function CleanChildrenPanel({
  parentName, children, busyId, onMerge, onMergeAll, onClose,
}: {
  parentName: string
  children: CleanNode[]
  busyId: string | null
  onMerge: (keepId: string, mergeIds: string[], finalName: string) => void
  onMergeAll?: (groups: { keepId: string; mergeIds: string[]; finalName: string }[]) => void
  onClose: () => void
}) {
  const [minLevel, setMinLevel] = useState<'strong' | 'possible'>('strong')
  const [done, setDone] = useState<Set<string>>(new Set())

  // איחוד למחלקות שקילות (union-find פשוט) לפי רמת ההתאמה שנבחרה.
  const clusters = useMemo(() => {
    const ok = (lvl: string) => lvl === 'exact' || lvl === 'strong' || (minLevel === 'possible' && lvl === 'possible')
    const parent = new Map<string, string>()
    const find = (x: string): string => { const p = parent.get(x); if (!p || p === x) return x; const r = find(p); parent.set(x, r); return r }
    const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
    children.forEach(c => parent.set(c.id, c.id))
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        if (ok(compareHebrewNames(children[i].name, children[j].name).level)) union(children[i].id, children[j].id)
      }
    }
    const byRoot = new Map<string, CleanNode[]>()
    for (const c of children) {
      const r = find(c.id)
      const arr = byRoot.get(r) ?? []; arr.push(c); byRoot.set(r, arr)
    }
    return [...byRoot.values()]
      .filter(g => g.length > 1 && !done.has(g.map(x => x.id).sort().join('|')))
      // הקבוצות הגדולות קודם — שם הרווח הגדול ביותר
      .sort((a, b) => b.length - a.length)
  }, [children, minLevel, done])

  // הצומת שיישאר: המאומת, אחרת בעל הכי הרבה ילדים
  const pickKeep = (g: CleanNode[]) =>
    g.find(n => (n.status ?? 'verified') === 'verified') ??
    [...g].sort((a, b) => b.childCount - a.childCount)[0]

  // השם שיישאר: המפורט ביותר (הכי הרבה מילים, ואז הכי ארוך)
  const pickName = (g: CleanNode[]) =>
    [...g].map(n => n.name).sort((a, b) =>
      b.trim().split(/\s+/).length - a.trim().split(/\s+/).length || b.length - a.length)[0]

  const totalDup = clusters.reduce((s, g) => s + g.length - 1, 0)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div dir="rtl" onClick={e => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 bg-purple-600 px-5 py-4 text-white">
          <div className="flex-1">
            <p className="text-base font-bold">ניקוי כפילויות — {parentName}</p>
            <p className="mt-1 text-xs text-purple-100">
              {children.length} ילדים · נמצאו {clusters.length} קבוצות כפילות ({totalDup} צמתים מיותרים)
            </p>
          </div>
          <button onClick={onClose} className="text-purple-200 hover:text-white"><X size={18} /></button>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-2.5">
          <span className="text-[11px] font-bold text-slate-500">רגישות:</span>
          {([['strong', 'בטוח'], ['possible', 'כולל מקורב']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setMinLevel(k)}
              className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${minLevel === k ? 'border-purple-300 bg-purple-100 text-purple-700' : 'border-slate-200 bg-white text-slate-500 hover:border-purple-200'}`}>
              {label}
            </button>
          ))}
          <span className="mr-auto text-[10px] text-slate-400">״מקורב״ מציג גם התאמות פחות ודאיות — בדקו לפני מיזוג</span>
        </div>

        {/* מיזוג כל האשכולות בלחיצה אחת — הפתרון לצומת עם עשרות כפילויות,
            שבו מיזוג אשכול-אחר-אשכול הוא עשרות לחיצות. */}
        {onMergeAll && clusters.length > 1 && (
          <div className="flex items-center gap-2 border-b border-purple-100 bg-purple-50 px-5 py-2.5">
            <button disabled={!!busyId}
              onClick={() => {
                const all = clusters.map(g => {
                  const keep = pickKeep(g)
                  return { keepId: keep.id, mergeIds: g.filter(x => x.id !== keep.id).map(x => x.id), finalName: pickName(g) }
                })
                setDone(s => { const n = new Set(s); clusters.forEach(g => n.add(g.map(x => x.id).sort().join('|'))); return n })
                onMergeAll(all)
              }}
              className="rounded-lg bg-purple-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-purple-800 disabled:opacity-50">
              ⚯ מזג את כל {clusters.length} הקבוצות ({totalDup} צמתים)
            </button>
            <span className="text-[10px] text-purple-600">כל קבוצה ממוזגת לצומת המסומן ★ — עברו על הרשימה לפני</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {clusters.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              לא נמצאו כפילויות ברמה זו.{minLevel === 'strong' && ' נסו ״כולל מקורב״.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {clusters.map(g => {
                const keep = pickKeep(g)
                const finalName = pickName(g)
                const key = g.map(x => x.id).sort().join('|')
                const isBusy = busyId === keep.id
                return (
                  <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">{g.length} כפילויות</span>
                      <button disabled={isBusy}
                        onClick={() => { onMerge(keep.id, g.filter(x => x.id !== keep.id).map(x => x.id), finalName); setDone(s => new Set(s).add(key)) }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700 disabled:opacity-50">
                        {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} מזג
                      </button>
                    </div>
                    <div className="flex flex-col gap-1">
                      {g.map(n => (
                        <div key={n.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${n.id === keep.id ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                          {n.id === keep.id && <span className="text-[9px] font-bold text-emerald-700">★ נשאר</span>}
                          <span className={`flex-1 ${n.id === keep.id ? 'font-bold text-slate-800' : 'text-slate-600'}`}>{n.name}</span>
                          {n.childCount > 0 && <span className="text-[10px] text-slate-400">{n.childCount} ילדים</span>}
                        </div>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-400">שם סופי: <span className="font-semibold text-slate-600">{finalName}</span></p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3">
          <p className="text-[11px] leading-relaxed text-slate-400">
            כל מיזוג מתבצע מיד. הילדים והנרשמים של הכפילויות עוברים לצומת שנשאר, וניתן לבטל מסרגל הכלים.
          </p>
        </div>
      </div>
    </div>
  )
}
