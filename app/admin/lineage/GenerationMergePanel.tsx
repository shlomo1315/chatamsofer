'use client'

// מיזוג מדורג — דור אחד בכל פעם, מלמעלה למטה, באישור מפורש לכל דור.
// הלוגיקה והכללים: lib/generationMerge.ts.
import { useState, useCallback, useEffect } from 'react'
import { Layers, Loader2, RefreshCw, AlertTriangle, CheckCircle2, ShieldCheck, X } from 'lucide-react'

type Group = {
  key: string; name: string; generation: number; parentName: string
  keepId: string; keepVerified: boolean; mergeIds: string[]
  movedChildren: number; movedFamilies: number
}
type Excluded = { name: string; generation: number; parentName: string; ids: string[]; reason: string }
type Plan = {
  generation: number | null; groups: Group[]; deferred: number
  excluded: Excluded[]; upcoming: { generation: number; groups: number }[]; fingerprint: string
}
type Result = {
  ok: boolean; merged: number; removed: number; children: number; families: number
  batchId?: string; generation?: number
  failure?: { name: string; reason: string }; rolledBack?: number; rollbackError?: string
  error?: string; stale?: boolean
}

const he = (n: number) => n.toLocaleString('he-IL')
const short = (id: string) => id.slice(0, 8)

async function readJson(res: Response) {
  const text = await res.text()
  try { return JSON.parse(text) } catch {
    throw new Error(res.status === 504 || /timeout|gateway/i.test(text)
      ? 'הבקשה נקטעה באמצע (חריגת זמן או פריסה חדשה). רענן ובדוק את המצב לפני שממשיכים.'
      : `השרת החזיר תשובה לא צפויה (${res.status}).`)
  }
}

export default function GenerationMergePanel({ onDone, onClose }: { onDone?: () => void; onClose?: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [err, setErr] = useState('')

  // ⚠️ כל ה-setState קורים רק בתוך then, ולכן מותר לקרוא ל-load מתוך useEffect.
  const load = useCallback(() =>
    fetch('/api/admin/lineage/generation-merge', { cache: 'no-store' })
      .then(async res => {
        const d = await readJson(res)
        if (!res.ok) throw new Error(d.error || 'שגיאה בסריקה')
        setPlan(d)
      })
      .catch(e => { setErr(e instanceof Error ? e.message : 'שגיאה'); setPlan(null) })
      .finally(() => setLoading(false)), [])

  const scan = useCallback(() => { setLoading(true); setErr(''); void load() }, [load])

  useEffect(() => { void load() }, [load])

  async function run() {
    if (!plan || plan.generation === null) return
    setConfirming(false); setRunning(true); setErr('')
    try {
      const res = await fetch('/api/admin/lineage/generation-merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generation: plan.generation, fingerprint: plan.fingerprint }),
      })
      const d = await readJson(res) as Result
      setResult({ ...d, ok: res.ok && d.ok !== false })
      if (res.ok) onDone?.()
    } catch (e) { setErr(e instanceof Error ? e.message : 'שגיאה') }
    finally { setRunning(false) }
  }

  const gen = plan?.generation ?? null
  const totals = plan ? plan.groups.reduce((t, g) => ({
    removed: t.removed + g.mergeIds.length, children: t.children + g.movedChildren, families: t.families + g.movedFamilies,
  }), { removed: 0, children: 0, families: 0 }) : null
  const excludedHere = plan?.excluded ?? []

  return (
    <>
      {confirming && plan && gen !== null && totals && (
        <Modal tone="warn" title={`לאשר מיזוג של דור ${gen}?`} icon={<AlertTriangle size={22} className="text-white shrink-0" />}>
          <ul className="space-y-1.5 text-sm text-slate-700 leading-relaxed">
            <li><strong>{he(plan.groups.length)}</strong> קבוצות יתאחדו, ו-<strong>{he(totals.removed)}</strong> עותקים כפולים יימחקו מהעץ.</li>
            <li><strong>{he(totals.children)}</strong> ילדים ו-<strong>{he(totals.families)}</strong> כרטסות יועברו לצומת שנשמר. שום ילד ושום כרטסת לא נמחקים.</li>
            <li>רק דור {gen}. הדורות שמתחתיו לא ישתנו עכשיו.</li>
            <li>אם מיזוג אחד נכשל, כל הדור מתבטל אוטומטית. כל מיזוג נרשם ביומן, ואפשר לבטל אותו גם אחר כך.</li>
          </ul>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={run}
              className="flex-1 rounded-xl bg-amber-600 px-4 py-3 text-sm font-black text-white hover:bg-amber-700">
              כן, מזג את דור {gen}
            </button>
            <button type="button" autoFocus onClick={() => setConfirming(false)}
              className="rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">
              ביטול
            </button>
          </div>
        </Modal>
      )}

      {result && (
        <Modal tone={result.ok ? 'ok' : 'bad'}
          title={result.ok ? `דור ${result.generation} מוזג` : result.stale ? 'העץ השתנה. לא בוצע שום שינוי' : 'המיזוג נכשל'}
          icon={result.ok ? <CheckCircle2 size={22} className="text-white shrink-0" /> : <AlertTriangle size={22} className="text-white shrink-0" />}>
          {result.ok ? (
            <div className="grid grid-cols-2 gap-2">
              <Box label="קבוצות שמוזגו" value={he(result.merged)} />
              <Box label="עותקים שהוסרו" value={he(result.removed)} />
              <Box label="ילדים שהועברו" value={he(result.children)} />
              <Box label="כרטסות שהועברו" value={he(result.families)} />
            </div>
          ) : (
            <div className="space-y-2 text-sm leading-relaxed text-slate-700">
              {result.error && <p>{result.error}</p>}
              {result.failure && <p>נכשל ב־„{result.failure.name}“: {result.failure.reason}</p>}
              {result.rolledBack !== undefined && (
                <p className="font-bold text-emerald-800">כל הדור בוטל אוטומטית ({he(result.rolledBack)} מיזוגים הוחזרו). העץ חזר למצב שלפני.</p>
              )}
              {result.rollbackError && (
                <p className="font-bold text-red-700">
                  גם הביטול האוטומטי נכשל ({result.rollbackError}). בטל ידנית ב„ביטול מיזוגים“ לפי אצווה {result.batchId?.slice(0, 8)}.
                </p>
              )}
            </div>
          )}
          {result.batchId && result.ok && (
            <p className="mt-3 text-xs text-slate-500">מספר אצווה לביטול: {result.batchId.slice(0, 8)}</p>
          )}
          <div className="mt-4 flex gap-2">
            <button type="button" autoFocus onClick={() => { setResult(null); void scan() }}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white hover:bg-violet-800">
              <RefreshCw size={16} /> רענן והצג את הדור הבא
            </button>
          </div>
        </Modal>
      )}

      <section className="mb-4 rounded-2xl border-2 border-violet-200 bg-white p-4 sm:p-5" dir="rtl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-violet-700" />
            <h2 className="text-base font-black text-slate-800">מיזוג מדורג: דור אחרי דור</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={scan} disabled={loading || running}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-sm font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} רענן
            </button>
            {onClose && (
              <button onClick={onClose} aria-label="סגור" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-slate-600">
          ממזגים רק עותקים זהים: אותו אב, אותו שם בדיוק ואותו דור, ולכל היותר כרטסת אחת לקבוצה.
          כל דור מוצג לפני הביצוע ודורש את האישור שלך. אחרי מיזוג, רענן כדי לראות את הדור הבא.
        </p>

        {err && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{err}</p>}
        {loading && !plan && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> סורק את העץ…</p>}

        {plan && gen === null && (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            <ShieldCheck size={16} /> אין כרגע עותקים בטוחים למיזוג באף דור.
          </p>
        )}

        {plan && gen !== null && totals && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-violet-50 px-4 py-3">
              <span className="text-lg font-black text-violet-900">דור {gen}</span>
              <span className="text-sm text-slate-700">{he(plan.groups.length)} קבוצות · {he(totals.removed)} יימחקו · {he(totals.children)} ילדים ו-{he(totals.families)} כרטסות יועברו</span>
              {plan.upcoming.length > 0 && (
                <span className="text-xs text-slate-500">אחר כך: {plan.upcoming.map(u => `דור ${u.generation} (${u.groups})`).join(' · ')}</span>
              )}
            </div>
            {plan.deferred > 0 && (
              <p className="mb-2 text-xs text-amber-700">עוד {he(plan.deferred)} קבוצות בדור הזה יופיעו בסבב הבא.</p>
            )}

            <div className="rounded-xl border border-slate-200">
              <table className="w-full table-fixed text-right text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">שם</th>
                    <th className="px-3 py-2 font-medium hidden sm:table-cell">אב</th>
                    <th className="px-3 py-2 font-medium">נשמר</th>
                    <th className="px-3 py-2 font-medium">נמחקים</th>
                    <th className="px-3 py-2 font-medium hidden sm:table-cell">ילדים שיועברו</th>
                    <th className="px-3 py-2 font-medium hidden sm:table-cell">כרטסות שיועברו</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.groups.map(g => (
                    <tr key={g.key} className="border-t border-slate-100">
                      <td className="px-3 py-2 align-top">
                        <p className="break-words font-bold text-slate-800">{g.name}</p>
                        <p className="text-xs text-slate-500 sm:hidden">{g.parentName ? `בן  · ` : ''}{g.movedChildren} ילדים · {g.movedFamilies} כרטסות יועברו</p>
                      </td>
                      <td className="hidden px-3 py-2 align-top text-slate-600 sm:table-cell">{g.parentName || '—'}</td>
                      <td className="px-3 py-2 align-top">
                        <span className="font-mono text-xs text-emerald-800" dir="ltr">{short(g.keepId)}</span>
                        {g.keepVerified && <span className="mr-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">מאושר</span>}
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-xs text-red-700" dir="ltr">{g.mergeIds.map(id => <span key={id} className="block">{short(id)}</span>)}</td>
                      <td className="hidden px-3 py-2 align-top text-slate-600 sm:table-cell">{g.movedChildren || '—'}</td>
                      <td className="hidden px-3 py-2 align-top text-slate-600 sm:table-cell">{g.movedFamilies || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button type="button" onClick={() => setConfirming(true)} disabled={running || loading}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white hover:bg-violet-800 disabled:opacity-50 sm:w-auto">
              {running ? <><Loader2 size={16} className="animate-spin" /> ממזג את דור {gen}…</> : <>מזג את דור {gen}</>}
            </button>
          </>
        )}

        {excludedHere.length > 0 && (
          <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
            <summary className="cursor-pointer text-sm font-bold text-amber-900">
              {he(excludedHere.length)} קבוצות לא ימוזגו כאן — דורשות בדיקה ידנית
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              {excludedHere.map(x => (
                <li key={x.ids.join()}>דור {x.generation} · <strong>{x.name}</strong>{x.parentName ? ` (בן ${x.parentName})` : ''} · {x.reason}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </>
  )
}

function Modal({ tone, title, icon, children }: { tone: 'ok' | 'warn' | 'bad'; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const c = tone === 'ok' ? ['border-emerald-500', 'bg-emerald-600'] : tone === 'warn' ? ['border-amber-400', 'bg-amber-600'] : ['border-red-400', 'bg-red-600']
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" dir="rtl" role="dialog" aria-modal="true">
      <div className={`w-full max-w-lg overflow-hidden rounded-2xl border-4 bg-white shadow-2xl ${c[0]}`}>
        <div className={`flex items-center gap-2.5 px-5 py-4 ${c[1]}`}>
          {icon}
          <h3 className="text-base font-black text-white">{title}</h3>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="text-lg font-black leading-tight text-slate-800">{value}</p>
    </div>
  )
}
