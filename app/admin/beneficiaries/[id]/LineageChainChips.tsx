'use client'
import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, Loader2, GitBranch, Palette, Check, X, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { genColor, asGenStatus } from '@/lib/lineageDeviation'

// דור בשרשרת: שם, מספר דור, סטטוס הצומת בעץ, ותגית בן/חתן.
export interface ChainGen {
  generation: number
  name: string
  // סטטוס הצומת המאושר התואם בעץ. null = לא נמצא צומת תואם — *חוסר ידיעה*,
  // ולכן כתום (ממתין) ולא אדום. הצבע נגזר ב-lib/lineageDeviation.
  status?: 'verified' | 'pending' | 'rejected' | null
  relation?: 'son' | 'son_in_law' | null
}

// צומת בעץ — לבורר "בחר צומת אחר"
export interface TreeNode {
  id: string
  name: string
  generation: number
  parent_id: string | null
  status?: string
  relation?: 'son' | 'son_in_law' | null
}

// blue=מאושר · orange=ממתין לאימות · red=נדחה. צבעים חזקים ובולטים.
type Color = 'blue' | 'orange' | 'red'

// ─────────────────────────────────────────────────────────────────────────────
// שרשרת הדורות. לחיצה על דור פותחת תפריט קטן:
//   • "בחר צומת אחר" — בורר צמתים מאומתים מאותו דור; בחירה משייכת את הצאצא
//     לצומת (lineage_node_id) והשרשרת נגזרת מחדש בשרת (/api/admin/lineage/assign).
//   • "סמן ידנית" — צביעה ידנית (override), נשמר ב-/api/admin/lineage-marks.
// צביעה אוטומטית לפי *סטטוס הצומת בעץ* (lib/lineageDeviation):
//   verified=כחול · rejected=אדום בכל דור · pending בדורות 2–5=אדום (צומת שנוסף
//   לתוך הליבה המאושרת) · pending מעל 5 או "לא נמצא"=כתום.
// ─────────────────────────────────────────────────────────────────────────────
const STYLE: Record<Color, string> = {
  blue:   'bg-blue-600 text-white border-blue-700 font-semibold',
  orange: 'bg-orange-500 text-white border-orange-600 font-semibold',
  red:    'bg-red-600 text-white border-red-700 font-bold',
}
const GEN_TXT: Record<Color, string> = { blue: 'text-blue-100', orange: 'text-orange-100', red: 'text-red-100' }
// ⚠️ כלל הצבע מגיע מ-lib/lineageDeviation ואינו משוכפל כאן: הצ'יפים וחלונית
// ההתראה חייבים לומר את אותו דבר. עותק שני היה נפרד מהראשון בתיקון הבא, ואז
// ההתראה מדברת על דור שהצ'יפים מציגים כתקין.
const statusColor = (s: ChainGen['status'], generation: number): Color =>
  genColor(generation, asGenStatus(s))

export default function LineageChainChips({
  beneficiaryId, gens, initialMarks,
}: {
  beneficiaryId: string
  gens: ChainGen[]
  initialMarks: Record<string, 'red' | 'green'>
}) {
  const router = useRouter()
  const [marks, setMarks] = useState<Record<string, 'red' | 'green'>>(initialMarks)
  const [saving, setSaving] = useState(false)
  const [menuGen, setMenuGen] = useState<number | null>(null)   // איזה דור פתח תפריט
  const [pickerGen, setPickerGen] = useState<number | null>(null) // בורר צמתים פתוח לדור
  const [q, setQ] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [err, setErr] = useState('')

  // ── צמתי הבורר — נטענים *לפי דרישה*, רק כשנפתח בורר לדור מסוים ──
  //
  // ⚠️ ביצועים: קודם כל ~5000 צמתי העץ הגיעו כ-prop מהשרת (allNodes) — כלומר
  // עברו סריאליזציה ל-HTML ולפיילואד ב*כל* פתיחת כרטסת, גם כשהמשתמש בטאב
  // "פרטים אישיים" ולא נגע בבורר. זו הייתה הסיבה המרכזית לכך שכרטסת בודדת
  // נטענה עשרות שניות. הבורר נפתח לעיתים רחוקות — לכן הוא מושך עכשיו רק את
  // שני הדורות שהוא באמת צריך (הנבחר + שמעליו) מ-/api/admin/lineage/generation.
  const [pickerNodes, setPickerNodes] = useState<TreeNode[]>([])
  const [loadingNodes, setLoadingNodes] = useState(false)

  useEffect(() => {
    if (pickerGen == null) return
    let cancelled = false
    setLoadingNodes(true)
    setPickerNodes([])
    fetch(`/api/admin/lineage/generation?gen=${pickerGen}`)
      .then(r => r.ok ? r.json() : { nodes: [] })
      .then(d => { if (!cancelled) setPickerNodes(d.nodes ?? []) })
      .catch(() => { if (!cancelled) setPickerNodes([]) })
      .finally(() => { if (!cancelled) setLoadingNodes(false) })
    return () => { cancelled = true }
  }, [pickerGen])

  // צבע אוטומטי לפי סטטוס הצומת בעץ — בכל דור (כולל מעל 5). דור 1 (חתם סופר)
  // תמיד מאושר. override ידני ('green'→כחול, 'red'→אדום) גובר.
  const autoColor = (g: ChainGen): Color => statusColor(g.status, g.generation)
  const colorOf = (g: ChainGen): Color => {
    const m = marks[String(g.generation)]
    if (m === 'green') return 'blue'
    if (m === 'red') return 'red'
    return autoColor(g)
  }

  // צביעה ידנית — מחזור אוטומטי → מאושר(כחול) → נדחה(אדום) → אוטומטי
  const cycle = async (g: ChainGen) => {
    setMenuGen(null)
    const cur = marks[String(g.generation)]
    const next: 'red' | 'green' | null = cur == null ? 'green' : cur === 'green' ? 'red' : null
    const nextMarks = { ...marks }
    if (next) nextMarks[String(g.generation)] = next
    else delete nextMarks[String(g.generation)]
    setMarks(nextMarks)
    setSaving(true)
    try {
      await fetch('/api/admin/lineage-marks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiaryId, marks: { [String(g.generation)]: next } }),
      })
    } catch { /* best-effort */ }
    setSaving(false)
  }

  // נרמול שם להשוואה (הסרת רווחים כפולים, גרשיים/מקפים) — לזיהוי צומת הדור הקודם
  const norm = (s: string) => String(s ?? '').replace(/["'`׳״]/g, '').replace(/\s+/g, ' ').trim()

  // צומת הדור הקודם (pickerGen-1) בשרשרת הנוכחית — הצמתים ה*מאושרים* (verified)
  // שתואמים לשם+דור בצ'יפים. הבורר יציג *רק* את ילדיהם (parent_id תואם), כדי
  // שהבחירה תישאר ברצף היוחסין. דור 2 — ההורה הוא חתם סופר (דור 1), תמיד מזוהה.
  const prevGenNodeIds = useMemo(() => {
    if (pickerGen == null || pickerGen <= 1) return null   // דור 1 (שורש) — אין הורה
    const prevGen = pickerGen - 1
    const prevChip = gens.find(g => g.generation === prevGen)
    if (!prevChip) return null
    const ids = pickerNodes
      .filter(n => n.generation === prevGen && n.status === 'verified' && norm(n.name) === norm(prevChip.name))
      .map(n => n.id)
    return ids.length ? new Set(ids) : null
  }, [pickerGen, gens, pickerNodes])

  // ⚠️ הדור הקודם אינו מסודר: קיים בשרשרת אך הצומת שלו אינו מאושר בעץ.
  // במקרה כזה אי אפשר לסנן את הדור הנוכחי לפי ההורה — ולכן חוסמים את הבורר
  // ומורים לתקן קודם את הדור הקודם. חייבים לסדר דור-אחר-דור לפי הרצף.
  // (דור 2 פטור — ההורה שלו הוא חתם סופר, תמיד מזוהה.)
  // ⚠️ !loadingNodes — בזמן טעינת הצמתים הרשימה ריקה ו-prevGenNodeIds הוא null,
  // וללא התנאי הזה הבורר היה מציג לרגע "הדור הקודם אינו מסודר" בכל פתיחה.
  const prevGenUnresolved = !loadingNodes && pickerGen != null && pickerGen > 2 && prevGenNodeIds == null

  // צמתים מאומתים באותו דור — מסוננים לפי הורה (הדור הקודם ברצף).
  const pickerOptions = useMemo(() => {
    if (pickerGen == null || prevGenUnresolved) return []
    const term = q.trim()
    return pickerNodes
      .filter(n => n.generation === pickerGen && (n.status === 'verified' || !n.status))
      .filter(n => !prevGenNodeIds || (n.parent_id != null && prevGenNodeIds.has(n.parent_id)))
      .filter(n => !term || n.name.includes(term))
      .slice(0, 60)
  }, [pickerGen, q, pickerNodes, prevGenNodeIds, prevGenUnresolved])

  // שיוך הצאצא לצומת שנבחר לדור מסוים — מחליף את הדור הזה ומעלה, ושומר את
  // הדורות שמתחת (atGeneration). השרשרת ממוזגת ונגזרת מחדש בשרת.
  const assign = async (nodeId: string) => {
    setAssigning(true); setErr('')
    try {
      const res = await fetch('/api/admin/lineage/assign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiaryId, nodeId, atGeneration: pickerGen ?? undefined }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'השיוך נכשל'); return }
      setPickerGen(null); setMenuGen(null); setQ('')
      router.refresh()
    } catch { setErr('שגיאת תקשורת') }
    finally { setAssigning(false) }
  }

  // תגית בן/חתן — רקע לבן מלא וטקסט כהה, כדי שתבלוט ברור על הצ'יפ הצבעוני
  // (כחול/כתום/אדום). בן=כחול כהה · חתן=ענבר כהה.
  const relTag = (r?: 'son' | 'son_in_law' | null) =>
    (r === 'son' || r === 'son_in_law')
      ? <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 mr-1 bg-white ${r === 'son' ? 'text-blue-700' : 'text-amber-700'}`}>{r === 'son' ? 'בן' : 'חתן'}</span>
      : null

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        {gens.map((g, i) => {
          const color = colorOf(g)
          const overridden = marks[String(g.generation)] != null
          return (
            <span key={g.generation} className="relative flex items-center gap-1.5">
              {i > 0 && <ChevronLeft size={12} className="text-slate-300" />}
              <button type="button" onClick={() => setMenuGen(menuGen === g.generation ? null : g.generation)}
                title={`דור ${g.generation} — לחצו לעריכה`}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all hover:brightness-95 ${STYLE[color]} ${overridden ? 'ring-2 ring-offset-1 ring-slate-300' : ''}`}>
                <span className={`ml-1 ${GEN_TXT[color]}`}>דור {g.generation}</span>{g.name}{relTag(g.relation)}
                {color === 'red' && <span className="mr-1">⚠</span>}
              </button>

              {/* תפריט קטן — נפתח בלחיצה על הצ'יפ */}
              {menuGen === g.generation && (
                <div className="absolute z-30 top-full mt-1 right-0 bg-white rounded-xl shadow-lg border border-slate-200 py-1 w-44 text-right"
                  onMouseLeave={() => setMenuGen(null)}>
                  <button type="button" onClick={() => { setPickerGen(g.generation); setQ(''); setErr('') }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-indigo-50 transition-colors">
                    <GitBranch size={13} className="text-indigo-500" /> בחר צומת אחר לדור זה
                  </button>
                  <button type="button" onClick={() => cycle(g)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors">
                    <Palette size={13} className="text-slate-400" /> סמן ידנית (מאושר/נדחה)
                  </button>
                </div>
              )}
            </span>
          )
        })}
        {saving && <Loader2 size={13} className="animate-spin text-slate-400" />}
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> מאושר</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> ממתין לאימות</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> חריג — בדיקה מעמיקה</span>
        <span>· לחצו על דור לבחירת צומת אחר או לסימון ידני.</span>
      </p>

      {/* בורר צמתים — מודל */}
      {pickerGen != null && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" dir="rtl"
          onClick={() => !assigning && setPickerGen(null)}>
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[80vh] overflow-y-auto p-5"
            onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setPickerGen(null)} disabled={assigning}
              className="absolute top-4 left-4 text-slate-400 hover:text-slate-600"><X size={18} /></button>
            <h2 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
              <GitBranch size={16} className="text-indigo-600" /> בחירת צומת לדור {pickerGen}
            </h2>
            <p className="text-xs text-slate-500 mb-3">בחרו צומת מאומת מדור {pickerGen}. השרשרת המלאה תיגזר אוטומטית מהצומת עד השורש.</p>

            {/* ⚠️ חסימה — הדור הקודם עדיין לא מסודר. חייבים דור-אחר-דור. */}
            {prevGenUnresolved ? (
              <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-4 text-center">
                <p className="text-sm font-bold text-amber-900 leading-relaxed">
                  יש לתקן קודם את דור {(pickerGen ?? 0) - 1}.
                </p>
                <p className="text-xs text-amber-800 mt-1.5 leading-relaxed">
                  לא ניתן לבחור צומת לדור {pickerGen} כל עוד הדור הקודם אינו מסודר לפי העץ המאושר.
                  סדרו את הדורות לפי הסדר — דור אחר דור.
                </p>
              </div>
            ) : (
            <>
            <div className="relative mb-3">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש לפי שם…" autoFocus
                className="w-full rounded-xl border border-slate-300 pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">{err}</p>}

            <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
              {loadingNodes ? (
                <p className="text-sm text-slate-400 py-4 text-center flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> טוען צמתים…
                </p>
              ) : pickerOptions.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">
                  {q.trim() ? 'לא נמצאו צמתים תואמים' : `אין צמתים מאומתים בדור ${pickerGen}`}
                </p>
              ) : pickerOptions.map(n => (
                <button key={n.id} type="button" onClick={() => assign(n.id)} disabled={assigning}
                  className="flex items-center justify-between text-right rounded-lg border border-slate-200 px-3 py-2 text-sm hover:border-indigo-300 hover:bg-indigo-50 transition-colors disabled:opacity-50">
                  <span className="font-medium text-slate-800">{n.name}</span>
                  {assigning ? <Loader2 size={13} className="animate-spin text-slate-400" /> : <Check size={14} className="text-indigo-400" />}
                </button>
              ))}
            </div>
            </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
