'use client'

// מיזוג בטוח — שם זהה בדיוק, אותו אב, אותו דור.
//
// נפרד במסך מהמיזוג הרגיל בכוונה: זו הפעולה היחידה שאפשר להריץ על מאות
// קבוצות בלי לעבור עליהן אחת-אחת, וההפרדה הוויזואלית היא מה שמונע בלבול
// בין "בטוח בוודאות" לבין "מקורב, דורש בדיקה".
import { useState, useCallback } from 'react'
import { ShieldCheck, Loader2, Search, AlertTriangle, CheckCircle2, GitMerge } from 'lucide-react'

type Stats = {
  groups: number
  nodesInGroups: number
  nodesRemoved: number
  childrenMoved: number
  familiesMoved: number
}
type Group = {
  name: string
  generation: number
  parentName: string
  copies: number
  children: number
  families: number
}

const he = (n: number) => n.toLocaleString('he-IL')

export default function SafeMergePanel({ onDone }: { onDone: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const scan = useCallback(async () => {
    setLoading(true); setErr(''); setDone(null)
    try {
      const res = await fetch('/api/admin/lineage/safe-merge', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה בסריקה')
      setStats(d.stats); setGroups(d.groups ?? [])
    } catch (e) { setErr(e instanceof Error ? e.message : 'שגיאה'); setStats(null) }
    finally { setLoading(false) }
  }, [])

  async function run() {
    if (!confirm(
      `למזג ${he(stats?.groups ?? 0)} קבוצות?\n\n` +
      `יוסרו ${he(stats?.nodesRemoved ?? 0)} עותקים כפולים. הילדים והמשפחות שלהם יעברו לצומת שנשאר.\n\n` +
      'כל הקבוצות האלה הן שם זהה בדיוק, תחת אותו אב, באותו דור. אפשר לבטל את כל ההרצה.',
    )) return
    setRunning(true); setErr('')
    try {
      const res = await fetch('/api/admin/lineage/safe-merge', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה במיזוג')
      setDone(d.summary)
      setStats(null); setGroups([])
      onDone()
    } catch (e) { setErr(e instanceof Error ? e.message : 'שגיאה') }
    finally { setRunning(false) }
  }

  return (
    <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-4 mb-4" dir="rtl">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-800">מיזוג בטוח</h2>
          {stats && (
            <span className="text-xs text-slate-500">
              {he(stats.groups)} קבוצות · {he(stats.nodesInGroups)} צמתים
            </span>
          )}
        </div>
        <button onClick={scan} disabled={loading || running}
          className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-3 py-1.5 rounded-lg transition-colors">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {stats ? 'סרוק שוב' : 'מצא קבוצות בטוחות'}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-600 mb-2">
        רק צמתים עם <strong>שם זהה בדיוק</strong>, תחת <strong>אותו אב</strong>, <strong>באותו דור</strong> —
        זה אותו אדם שנרשם פעמיים. אין כאן ניחוש ואין התאמה מקורבת, ולכן אפשר למזג הכל בלחיצה אחת.
        <br />
        וריאציות כתיב ותארים (&quot;רבי ישראל וייס&quot; מול &quot;ישראל וייס&quot;) <strong>אינן</strong> נכללות כאן — הן
        נשארות למיזוג הרגיל, שדורש עין אנושית.
      </p>

      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

      {done && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle2 size={16} /> {done}
        </div>
      )}

      {stats && stats.groups === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle2 size={16} /> אין כפילויות זהות בעץ. מה שנשאר דורש מיזוג רגיל.
        </div>
      )}

      {stats && stats.groups > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-3">
            <Box label="קבוצות" value={he(stats.groups)} />
            <Box label="עותקים שיוסרו" value={he(stats.nodesRemoved)} />
            <Box label="ילדים שיעברו" value={he(stats.childrenMoved)} />
            <Box label="משפחות שיעברו" value={he(stats.familiesMoved)} />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-emerald-200 bg-white mb-3">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 bg-emerald-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">שם</th>
                  <th className="px-3 py-2 font-medium">דור</th>
                  <th className="px-3 py-2 font-medium">תחת</th>
                  <th className="px-3 py-2 font-medium">עותקים</th>
                  <th className="px-3 py-2 font-medium">ילדים</th>
                  <th className="px-3 py-2 font-medium">משפחות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groups.map((g, i) => (
                  <tr key={`${g.name}-${g.generation}-${i}`} className="hover:bg-emerald-50/50">
                    <td className="px-3 py-2 font-medium text-slate-800">{g.name}</td>
                    <td className="px-3 py-2 text-slate-500">{g.generation}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-[180px] truncate">{g.parentName}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                        {g.copies}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{g.children || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{g.families || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.groups > groups.length && (
              <p className="px-3 py-1.5 text-xs text-slate-400">
                מוצגות {he(groups.length)} מתוך {he(stats.groups)} — המיזוג יטפל בכולן.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={run} disabled={running}
              className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-4 py-2 rounded-lg font-bold transition-colors">
              {running ? <Loader2 size={15} className="animate-spin" /> : <GitMerge size={15} />}
              מזג את כל {he(stats.groups)} הקבוצות
            </button>
            <span className="inline-flex items-start gap-1.5 text-[11px] text-slate-500 max-w-md">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
              ההרצה נרשמת כפעולה אחת וניתנת לביטול במלואה. אין מיזוג של אבות ואין התאמות מקורבות.
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-2.5">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="text-lg font-black text-slate-800 leading-tight">{value}</p>
    </div>
  )
}
