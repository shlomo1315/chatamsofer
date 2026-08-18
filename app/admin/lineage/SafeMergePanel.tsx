'use client'

// מיזוג בטוח — שם זהה בדיוק, אותו אב, אותו דור.
//
// נפרד במסך מהמיזוג הרגיל בכוונה: זו הפעולה היחידה שאפשר להריץ על מאות
// קבוצות בלי לעבור עליהן אחת-אחת, וההפרדה הוויזואלית היא מה שמונע בלבול
// בין "בטוח בוודאות" לבין "מקורב, דורש בדיקה".
import { useState, useCallback } from 'react'
import { ShieldCheck, Loader2, Search, AlertTriangle, CheckCircle2, GitMerge } from 'lucide-react'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'

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
type GenRow = { generation: number; groups: number; copies: number }
type Failure = { name: string; reason: string }
type Result = {
  merged: number; removed: number; children: number; families: number
  failed: number; batchId: string; failures: Failure[]
  /** ההרצה נקטעה — ההודעה שמסבירה למה. null = הושלמה. */
  aborted: string | null
}

const he = (n: number) => n.toLocaleString('he-IL')

type ColKey = 'name' | 'generation' | 'parent' | 'copies' | 'children' | 'families'

const COLUMNS: ColDef<ColKey>[] = [
  { key: 'name', label: 'שם', def: true },
  { key: 'generation', label: 'דור', def: true, align: 'center' },
  { key: 'parent', label: 'תחת', def: true },
  { key: 'copies', label: 'עותקים', def: true, align: 'center' },
  { key: 'children', label: 'ילדים', def: true, align: 'center' },
  { key: 'families', label: 'משפחות', def: true, align: 'center' },
]

export default function SafeMergePanel({ onDone }: { onDone: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [byGen, setByGen] = useState<GenRow[]>([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const tc = useTableColumns('lineage-safe-merge', COLUMNS)

  const cell = (c: ColDef<ColKey>, g: Group) => {
    switch (c.key) {
      case 'name': return <span className="font-medium text-slate-800">{g.name}</span>
      case 'generation': return <span className="text-slate-500">{g.generation}</span>
      case 'parent': return <span className="text-slate-500">{g.parentName}</span>
      case 'copies': return (
        <span className="inline-flex items-center rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-800">
          {g.copies}
        </span>
      )
      case 'children': return <span className="text-slate-500">{g.children || '—'}</span>
      case 'families': return <span className="text-slate-500">{g.families || '—'}</span>
    }
  }

  const scan = useCallback(async () => {
    setLoading(true); setErr(''); setDone(null)
    try {
      const res = await fetch('/api/admin/lineage/safe-merge', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה בסריקה')
      setStats(d.stats); setGroups(d.groups ?? []); setByGen(d.byGeneration ?? [])
    } catch (e) { setErr(e instanceof Error ? e.message : 'שגיאה'); setStats(null) }
    finally { setLoading(false) }
  }, [])

  // ⚠️ תשובת השרת חייבת לעבור כאן ולא ב-res.json() ישיר: כשהנתיב חורג מהזמן,
  // או כשפריסה חדשה מחליפה את הקונטיינר באמצע, מוחזר דף HTML — ו-JSON.parse
  // זרק "Unexpected token '<'", הודעה שלא אומרת למנהל דבר.
  async function readJson(res: Response) {
    const text = await res.text()
    try { return JSON.parse(text) } catch {
      throw new Error(res.status === 504 || /timeout|gateway/i.test(text)
        ? 'הבקשה נקטעה באמצע (חריגת זמן או פריסה חדשה). מה שכבר מוזג נשמר — סרוק שוב והמשך.'
        : `השרת החזיר תשובה לא צפויה (${res.status}).`)
    }
  }

  // 🔴 לולאת מנות בצד הלקוח, ולא בקשה אחת ארוכה.
  //
  // הרצה על 1,501 קבוצות לא חזרה כלל: כל מיזוג הוא כמה פניות למסד, והסדרה
  // חרגה מתקרת הזמן. גרוע מזה — פריסה חדשה באמצע הרגה את הקונטיינר, והמסך
  // פשוט הסתובב ונעצר בלי לומר דבר. מנה של 150 חוזרת תמיד בזמן.
  //
  // ⚠️ batchId אחד נשלח לכל המנות, כדי שכל ההרצה תישאר ניתנת לביטול אחד.
  async function run() {
    const total = stats?.groups ?? 0
    if (!confirm(
      `למזג ${he(total)} קבוצות?\n\n` +
      `יוסרו ${he(stats?.nodesRemoved ?? 0)} עותקים כפולים. הילדים והמשפחות שלהם יעברו לצומת שנשאר.\n\n` +
      'כל הקבוצות האלה הן שם זהה בדיוק, תחת אותו אב, באותו דור.\n' +
      'הפעולה רצה במנות ומציגה התקדמות, וניתנת לביטול במלואה.',
    )) return

    setRunning(true); setErr('')
    // ⚠️ מונה מיד עם הלחיצה, ולא רק אחרי שהמנה הראשונה חוזרת. קודם הוא נדלק
    // רק בסוף המנה, ולכן בדקה הראשונה המסך נראה בדיוק כמו תקוע — וזו הייתה
    // כל הסיבה שההרצה נראתה מתה בזמן שהיא עבדה.
    setProgress(`מנה 1 · ממזג…`)
    const batchId = crypto.randomUUID()
    const tot = { merged: 0, removed: 0, children: 0, families: 0, failed: 0 }
    const failures: Failure[] = []
    let lastErr: string | null = null
    let strikes = 0
    try {
      // ⚠️ תקרת סבבים: הגנה מפני לולאה שאינה מתקדמת. 80 × 25 מכסה בנוחות
      // כל סריקה סבירה.
      for (let round = 0; round < 80; round++) {
        setProgress(`מנה ${round + 1} · מוזגו ${he(tot.merged)}${lastErr ? ' · מנסה שוב' : ''}`)
        let d: { merged: number; removed: number; children?: number; families?: number
          failed?: number; failures?: Failure[]; remaining: number; error?: string }
        try {
          const res = await fetch(`/api/admin/lineage/safe-merge?limit=25&batch=${batchId}`, { method: 'POST' })
          d = await readJson(res)
          if (!res.ok) throw new Error(d.error || 'שגיאה במיזוג')
        } catch (e) {
          // 🔴 מנה שנקטעה אינה מפילה את ההרצה.
          //
          // מנה שחורגת מהזמן מחזירה 499, אבל השרת ממשיך וכותב את מה שהספיק —
          // כל מיזוג נשמר בפני עצמו. ביטול כל ההרצה בנקודה הזאת זרק גם את מה
          // שכן בוצע, והמנהל נשאר עם "0 מוזגו" בזמן שהמסד התקדם. המנה הבאה
          // סורקת מחדש וממשיכה מהמצב האמיתי.
          lastErr = e instanceof Error ? e.message : 'שגיאה'
          if (++strikes >= 3) throw new Error(lastErr)
          continue
        }
        strikes = 0; lastErr = null
        tot.merged += d.merged; tot.removed += d.removed
        tot.children += d.children ?? 0; tot.families += d.families ?? 0
        tot.failed += d.failed ?? 0
        if (d.failures?.length) failures.push(...d.failures)
        setProgress(`מוזגו ${he(tot.merged)} · נותרו ${he(d.remaining)}`)
        if (d.remaining === 0 || (d.merged === 0 && d.failed === 0)) break
      }
      setResult({ ...tot, batchId, failures: failures.slice(0, 20), aborted: null })
      setStats(null); setGroups([]); setByGen([])
      onDone()
    } catch (e) {
      // ⚠️ גם כישלון נכנס לחלונית ועם המספרים שכבר הושגו: הרצה שנקטעה אחרי
      // 600 מיזוגים אינה "נכשלה", והצגתה כשגיאה בלבד גורמת להרצה חוזרת
      // מיותרת ולחוסר אמון במה שכן בוצע.
      setResult({ ...tot, batchId, failures: failures.slice(0, 20), aborted: e instanceof Error ? e.message : 'שגיאה' })
      onDone()
    }
    finally { setRunning(false); setProgress(null) }
  }

  return (
    <>
    {/* 🔴 חלונית תוצאה — נפתחת תמיד בסוף ההרצה, גם בהצלחה וגם בקטיעה.
        קודם התוצאה הופיעה כשורת טקסט קטנה בתוך הפאנל, ובהרצה שנקטעה באמצע
        המסך פשוט הפסיק להסתובב בלי לומר דבר: המנהל לא ידע אם מוזג משהו, אם
        אפשר להריץ שוב, ומה בכלל קרה. */}
    {result && (
      <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
        <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border-4 ${result.aborted ? 'border-amber-400' : 'border-emerald-500'}`}>
          <div className={`px-5 py-4 flex items-center gap-2.5 ${result.aborted ? 'bg-amber-500' : 'bg-emerald-600'}`}>
            {result.aborted ? <AlertTriangle size={22} className="text-white shrink-0" /> : <CheckCircle2 size={22} className="text-white shrink-0" />}
            <h3 className="text-base font-black text-white">
              {result.aborted ? 'ההרצה נעצרה באמצע' : 'המיזוג הושלם'}
            </h3>
          </div>
          <div className="px-5 py-4">
            {result.aborted && (
              <div className="rounded-xl bg-amber-50 border-2 border-amber-300 px-4 py-3 mb-3">
                <p className="text-sm font-bold text-amber-900 leading-relaxed">{result.aborted}</p>
                <p className="text-xs text-amber-800 mt-1.5 leading-relaxed">
                  מה שמוזג עד לרגע העצירה <strong>נשמר</strong>. אפשר לסרוק שוב ולהמשיך מאותה נקודה.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <Box label="קבוצות שמוזגו" value={he(result.merged)} />
              <Box label="עותקים שהוסרו" value={he(result.removed)} />
              <Box label="ילדים שהועברו" value={he(result.children)} />
              <Box label="משפחות שהועברו" value={he(result.families)} />
            </div>
            {result.failed > 0 && (
              <div className="rounded-xl bg-red-50 border-2 border-red-200 px-4 py-3 mb-3">
                <p className="text-sm font-bold text-red-800 mb-1">{he(result.failed)} קבוצות נכשלו</p>
                <ul className="text-[11px] text-red-700 space-y-0.5 max-h-32 overflow-y-auto">
                  {result.failures.map((f, i) => <li key={i}>{f.name} — {f.reason}</li>)}
                </ul>
              </div>
            )}
            <p className="text-[11px] text-slate-500 leading-relaxed">
              כל ההרצה נרשמה תחת מזהה אחד וניתנת לביטול במלואה במרכז המיזוגים.
              <span className="block font-mono text-[10px] text-slate-400 mt-0.5" dir="ltr">{result.batchId}</span>
            </p>
            {!result.aborted && (
              <p className="text-[11px] text-slate-600 leading-relaxed mt-2">
                ⚠️ <strong>סרוק שוב.</strong> אחרי איחוד אב, הילדים שלו מתאחדים תחת הורה אחד ונוצרות
                קבוצות זהות חדשות דור אחד למטה. חזרו עד שהסריקה מחזירה 0.
              </p>
            )}
          </div>
          <div className="px-5 pb-5 flex gap-2">
            <button type="button" autoFocus onClick={() => { setResult(null); void scan() }}
              className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl px-4 py-3 transition-colors">
              <Search size={16} /> סרוק שוב
            </button>
            <button type="button" onClick={() => setResult(null)}
              className="inline-flex items-center justify-center text-sm font-bold text-slate-600 bg-white border-2 border-slate-300 hover:bg-slate-50 rounded-xl px-4 py-3 transition-colors">
              סגור
            </button>
          </div>
        </div>
      </div>
    )}

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

          {/* 🔴 פילוח לפי דור — הבדיקה שמפרידה בין "ניקוי היסטורי" לבין "תקלה".
              הטבלה שמתחת ממוינת לפי דור, ולכן העמוד הראשון שלה לעולם אינו
              מייצג את הפיזור. כאן רואים את התמונה כולה בשורה אחת. */}
          {byGen.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-white p-3 mb-3">
              <p className="text-[11px] font-bold text-slate-600 mb-2">פיזור הקבוצות לפי דור</p>
              <div className="flex items-end gap-1 overflow-x-auto pb-1">
                {byGen.map(g => {
                  const max = Math.max(...byGen.map(x => x.groups))
                  const h = Math.max(4, Math.round((g.groups / max) * 56))
                  const deep = g.generation >= 7
                  return (
                    <div key={g.generation} className="flex flex-col items-center gap-1 min-w-[34px]"
                      title={`דור ${g.generation}: ${he(g.groups)} קבוצות · ${he(g.copies)} עותקים יוסרו`}>
                      <span className="text-[9px] font-bold text-slate-500">{he(g.groups)}</span>
                      <div style={{ height: h }}
                        className={`w-full rounded-t ${deep ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                      <span className="text-[9px] text-slate-400">{g.generation}</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] leading-relaxed text-slate-500 mt-2">
                <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400 align-middle" /> דורות האבות —
                כפילויות היסטוריות, בדיוק מה שהמיזוג נועד לנקות.
                {' '}
                <span className="inline-block w-2 h-2 rounded-sm bg-amber-400 align-middle" /> דורות הנרשמים (7+) —
                אם רוב הקבוצות כאן, כדאי לבדוק את מקור הכפילות לפני מיזוג ולא אחריו.
              </p>
            </div>
          )}

          <div className="mb-2">{tc.picker}</div>
          {/* ⚠️ גלילה אנכית בלבד — הכלל: אין גלילה לרוחב בשום טבלה. */}
          <div className="max-h-72 overflow-y-auto rounded-lg border border-emerald-200 bg-white mb-3">
            <table className="w-full text-right text-sm" style={tc.rt.tableStyle}>
              <colgroup>{tc.rt.cols}</colgroup>
              <thead className="sticky top-0 bg-emerald-50 text-slate-600">
                <tr>
                  {tc.shown.map((c, i) => (
                    <th key={c.key} className={`px-3 py-2 font-medium ${tc.headClass(c)}`}>{c.label}{tc.rt.handle(i)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groups.map((g, i) => (
                  <tr key={`${g.name}-${g.generation}-${i}`} className="hover:bg-emerald-50/50">
                    {tc.shown.map(c => (
                      <td key={c.key} className={`px-3 py-2 ${tc.cellClass(c)}`}>{cell(c, g)}</td>
                    ))}
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
            {progress && (
              <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 rounded-lg px-2.5 py-1.5">
                {progress}
              </span>
            )}
            <span className="inline-flex items-start gap-1.5 text-[11px] text-slate-500 max-w-md">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
              ההרצה נרשמת כפעולה אחת וניתנת לביטול במלואה. אין מיזוג של אבות ואין התאמות מקורבות.
            </span>
          </div>
          {running && (
            <p className="text-[11px] text-slate-500 mt-1.5">
              רץ במנות. השאירו את הדף פתוח — כל מנה נשמרת בפני עצמה, וגם אם ההרצה תיקטע
              אפשר להמשיך מאותה נקודה.
            </p>
          )}
        </>
      )}
    </div>
    </>
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
