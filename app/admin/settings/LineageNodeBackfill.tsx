'use client'

// השלמה למפרע: צומת בעץ הדורות לכל נרשם שאין לו.
import { useState } from 'react'
import { Loader2, Search, TreePine, CheckCircle2, AlertTriangle, Play } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

type Stats = {
  total: number
  haveOwnNode: number
  missing: number
  buildable: number
  noName: number
  notLinkedToTree: number
}
type Family = { id: string; name: string; idNumber: string | null; buildable: boolean }
// אבחון — מסביר מספר חריג במקום לדרוש חפירה בלוגים
type Diag = { treeNodes: number; matchedById: number; matchedByName: number; linkedToMissingNode: number }

const he = (n: number) => n.toLocaleString('he-IL')

export default function LineageNodeBackfill() {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [families, setFamilies] = useState<Family[]>([])
  const [diag, setDiag] = useState<Diag | null>(null)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  async function check() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lineage/backfill-nodes')
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה')
      setStats(d.stats)
      setFamilies(d.families ?? [])
      setDiag(d.diag ?? null)
      setDone(null)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה') }
    finally { setLoading(false) }
  }

  async function run() {
    if (!confirm(
      `ליצור צומת בעץ ל-${he(stats?.buildable ?? 0)} נרשמים?\n\n` +
      'כולם ייכנסו בסטטוס "ממתין לאישור". אין כאן אישור אוטומטי של אף אחד.\n' +
      'הפעולה בטוחה להרצה חוזרת — מי שכבר קיבל צומת לא יקבל כפילות.',
    )) return
    setRunning(true)
    try {
      const res = await fetch('/api/admin/lineage/backfill-nodes', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה')
      setDone(d.summary)
      toast.success(d.summary)
      await check()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה') }
    finally { setRunning(false) }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 leading-relaxed">
        עד כה נרשם קיבל צומת בעץ <strong>רק אם הוסיף דורות ידנית</strong> בטופס. מי שמצא את אביו כבר
        מאומת בעץ ולא הוסיף כלום נשמר ככרטסת בלבד — ולכן לא הופיע בעץ, ואפשר היה לראות אותו רק
        דרך &quot;פתיחת הכרטסת&quot; על צומת האב.
        <br />
        מרישום חדש זה כבר מטופל אוטומטית. כאן משלימים את כל הנרשמים הקיימים.
      </p>

      {!stats && (
        <Button onClick={check} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          בדוק מי חסר בעץ
        </Button>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Box label="יש להם צומת" value={he(stats.haveOwnNode)} tone="green" />
            <Box label="חסרים בעץ" value={he(stats.missing)} tone={stats.missing ? 'amber' : 'green'} />
            <Box label="ניתנים להשלמה" value={he(stats.buildable)} tone={stats.buildable ? 'indigo' : 'green'} />
            <Box label="בלי שם לבניית צומת" value={he(stats.noName)} tone={stats.noName ? 'red' : 'green'}
              sub="דורש תיקון שם בכרטסת" />
          </div>

          {diag && (
            <p className="text-[10px] text-slate-400 leading-relaxed" dir="rtl">
              אבחון: {he(diag.treeNodes)} צמתים בעץ · זוהו לפי ת&quot;ז {he(diag.matchedById)} · לפי שם {he(diag.matchedByName)}
              {diag.linkedToMissingNode > 0 && <> · ⚠️ {he(diag.linkedToMissingNode)} מקושרים לצומת שאינו קיים</>}
            </p>
          )}

          {!!stats.notLinkedToTree && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                <strong>{he(stats.notLinkedToTree)}</strong> נרשמים אינם משויכים לאף צומת בעץ, ולכן אין מקום
                לתלות אותם. הם דורשים שיוך ייחוס תחילה — לא ניתן להשלים אותם אוטומטית.
              </span>
            </div>
          )}

          {done ? (
            <div className="flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 size={16} /> {done}
            </div>
          ) : stats.buildable > 0 ? (
            <Button onClick={run} disabled={running}>
              {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              צור צומת ל-{he(stats.buildable)} נרשמים
            </Button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-green-800">
              <TreePine size={16} /> כל הנרשמים מופיעים בעץ.
            </div>
          )}

          {families.length > 0 && (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-right text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">ייכנס לעץ בשם</th>
                    <th className="px-3 py-2 font-medium">ת&quot;ז</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {families.map(f => (
                    <tr key={f.id} className={f.buildable ? 'hover:bg-slate-50' : 'bg-red-50/60'}>
                      <td className="px-3 py-2">{f.name}</td>
                      <td className="px-3 py-2 text-slate-500" dir="ltr">{f.idNumber || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stats.missing > families.length && (
                <p className="px-3 py-1.5 text-xs text-slate-400">
                  מוצגים {he(families.length)} מתוך {he(stats.missing)} — ההרצה תטפל בכולם.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Box({ label, value, sub, tone }: {
  label: string; value: string; sub?: string
  tone: 'green' | 'amber' | 'red' | 'indigo'
}) {
  const tones = {
    green: 'border-green-100 bg-green-50 text-green-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-800',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  }
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold opacity-80">{label}</p>
      <p className="text-xl font-black leading-tight">{value}</p>
      {sub && <p className="text-[10px] opacity-70 mt-0.5">{sub}</p>}
    </div>
  )
}
