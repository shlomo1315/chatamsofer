'use client'

// נרשמים ללא שיוך לעץ — הרשימה שההשלמה האוטומטית אינה יכולה לגעת בה.
//
// ⚠️ למה זה מסך ולא כפתור "השלם הכל": שיוך שגוי מעביר אדם לענף זר, וזו טעות
// שקשה לגלות אחרי שנשמרה. לכן כל שורה היא אישור נפרד, וההצעה מלווה בהסבר
// *למה* היא הוצעה — הדור שנמצא בשרשרת שהנרשם עצמו הזין.
import { useState, useCallback } from 'react'
import { Link2, Loader2, Search, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react'

type Suggestion = {
  nodeId: string; nodeName: string; generation: number
  matchedGeneration: number; matchedDepth: number; ambiguous: boolean
}
type Row = {
  id: string; name: string; idNumber: string | null
  email: string | null; phone: string | null; createdAt: string | null
  chainLength: number; chainTail: string; suggestion: Suggestion | null
}
type Stats = {
  total: number; withSuggestion: number; ambiguous: number
  noChain: number; chainNotFound: number
}

const he = (n: number) => n.toLocaleString('he-IL')

export default function UnlinkedPanel({ onDone }: { onDone: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [linked, setLinked] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')

  const scan = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/admin/lineage/unlinked', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה בסריקה')
      setStats(d.stats); setRows(d.rows ?? []); setLinked({})
    } catch (e) { setErr(e instanceof Error ? e.message : 'שגיאה'); setStats(null) }
    finally { setLoading(false) }
  }, [])

  async function assign(row: Row) {
    const s = row.suggestion
    if (!s) return
    if (!confirm(
      `לשייך את "${row.name}" לצומת:\n\n${s.nodeName}  (דור ${s.generation})\n\n` +
      `ההתאמה נמצאה בדור ${s.matchedGeneration} של שרשרת הייחוס שהנרשם הזין.\n` +
      'שרשרת הדורות שלו תחושב מחדש מהצומת הזה ומעלה.',
    )) return
    setBusy(row.id); setErr('')
    try {
      const res = await fetch('/api/admin/lineage/assign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiaryId: row.id, nodeId: s.nodeId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'השיוך נכשל')
      setLinked(p => ({ ...p, [row.id]: s.nodeName }))
      onDone()
    } catch (e) { setErr(e instanceof Error ? e.message : 'שגיאה') }
    finally { setBusy(null) }
  }

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-4 mb-4" dir="rtl">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Link2 size={18} className="text-amber-600" />
          <h2 className="text-sm font-bold text-slate-800">נרשמים ללא שיוך לעץ</h2>
          {stats && <span className="text-xs text-slate-500">{he(stats.total)} נרשמים</span>}
        </div>
        <button onClick={scan} disabled={loading}
          className="flex items-center gap-1.5 text-sm bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white px-3 py-1.5 rounded-lg transition-colors">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {stats ? 'סרוק שוב' : 'מצא נרשמים ללא שיוך'}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-600 mb-2">
        לנרשמים האלה אין צומת אב בעץ, ולכן ההשלמה האוטומטית אינה יכולה לתלות אותם בשום מקום.
        אבל רובם <strong>אינם חסרי מידע</strong>: בטופס הרישום נשמרה שרשרת הדורות שהם עצמם הזינו, וכאן
        מחפשים אותה בעץ ומציעים את <strong>הצומת העמוק ביותר שנמצא</strong>.
        <br />
        שם שמופיע פעמיים בעץ מסומן ואינו מקבל הצעה — בחירה שרירותית שם מעבירה אדם לענף זר.
      </p>

      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">{err}</p>}

      {stats && stats.total === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle2 size={16} /> כל הנרשמים משויכים לעץ.
        </div>
      )}

      {stats && stats.total > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-3">
            <Box label="הצעה ודאית" value={he(stats.withSuggestion)} tone="green" sub="לחיצה אחת" />
            <Box label="שם כפול בעץ" value={he(stats.ambiguous)} tone="amber" sub="דורש בחירה ידנית" />
            <Box label="שרשרת לא נמצאה" value={he(stats.chainNotFound)} tone="amber" sub="הזין דורות שאינם בעץ" />
            <Box label="בלי שרשרת כלל" value={he(stats.noChain)} tone="red" sub="אין ממה להציע" />
          </div>

          <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-amber-200 bg-white">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 bg-amber-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">נרשם</th>
                  <th className="px-3 py-2 font-medium">ת&quot;ז</th>
                  <th className="px-3 py-2 font-medium">הצומת המוצע</th>
                  <th className="px-3 py-2 font-medium">למה</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => (
                  <tr key={r.id} className={linked[r.id] ? 'bg-green-50' : 'hover:bg-amber-50/50'}>
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {r.name}
                      {r.chainTail && (
                        <span className="block text-[10px] text-slate-400 truncate max-w-[220px]">
                          הזין: {r.chainTail}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500" dir="ltr">{r.idNumber || '—'}</td>
                    <td className="px-3 py-2 max-w-[240px]">
                      {linked[r.id] ? (
                        <span className="text-green-700 font-semibold text-xs">✓ שויך ל{linked[r.id]}</span>
                      ) : r.suggestion ? (
                        <span className={r.suggestion.ambiguous ? 'text-amber-800' : 'text-slate-800'}>
                          {r.suggestion.nodeName}
                          <span className="text-[10px] text-slate-400 mr-1">(דור {r.suggestion.generation})</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">אין הצעה</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-500">
                      {r.suggestion?.ambiguous
                        ? <span className="text-amber-700 font-semibold">שם מופיע פעמיים בעץ</span>
                        : r.suggestion
                          ? <>נמצא דור {r.suggestion.matchedGeneration} · {r.suggestion.matchedDepth} מ-{r.chainLength} דורות</>
                          : r.chainLength
                            ? <>הזין {r.chainLength} דורות, אף אחד לא בעץ</>
                            : 'לא הזין שרשרת'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {!linked[r.id] && r.suggestion && !r.suggestion.ambiguous && (
                        <button onClick={() => assign(r)} disabled={busy === r.id}
                          className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-2.5 py-1 rounded-lg transition-colors">
                          {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                          שייך
                        </button>
                      )}
                      {/* ⚠️ למי שאין לו הצעה ודאית — מעבר לכרטסת, ששם יש בורר
                          עץ מלא עם חיפוש ותצוגה מקדימה של השרשרת. */}
                      <a href={`/admin/beneficiaries/${r.id}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 px-2 py-1">
                        <ExternalLink size={12} /> כרטסת
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="inline-flex items-start gap-1.5 text-[11px] text-slate-500 mt-2">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
            השיוך מחשב מחדש את שרשרת הדורות מהצומת שנבחר ומעלה, ואינו משנה סטטוס של אף צומת.
          </p>
        </>
      )}
    </div>
  )
}

function Box({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone: 'green' | 'amber' | 'red'
}) {
  const tones = {
    green: 'border-green-200 bg-green-50 text-green-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-800',
  }
  return (
    <div className={`rounded-xl border p-2.5 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold opacity-80">{label}</p>
      <p className="text-lg font-black leading-tight">{value}</p>
      {sub && <p className="text-[10px] opacity-70">{sub}</p>}
    </div>
  )
}
