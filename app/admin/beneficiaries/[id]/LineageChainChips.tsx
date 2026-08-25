'use client'
import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, Loader2, GitBranch, Palette, Check, X, Search, AlertTriangle, Undo2 } from 'lucide-react'
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

// ירוק=מאושר · כתום=ממתין לאימות · אדום=חריג. צבעים חזקים ובולטים.
type Color = 'green' | 'orange' | 'red'

// ─────────────────────────────────────────────────────────────────────────────
// שרשרת הדורות. לחיצה על דור פותחת תפריט קטן:
//   • "בחר צומת אחר" — בורר צמתים מאומתים מאותו דור; בחירה משייכת את הצאצא
//     לצומת (lineage_node_id) והשרשרת נגזרת מחדש בשרת (/api/admin/lineage/assign).
//   • "סמן ידנית" — צביעה ידנית (override), נשמר ב-/api/admin/lineage-marks.
// צביעה אוטומטית לפי *סטטוס הצומת בעץ* (lib/lineageDeviation):
//   verified=ירוק · rejected=אדום בכל דור · pending בדורות 2–5=אדום (צומת שנוסף
//   לתוך הליבה המאושרת) · pending מעל 5 או "לא נמצא"=כתום.
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ עיצוב "קלף וחותם" — עקבי עם עץ הדורות שמתחת ועם מסך הניהול.
// הצ'יפים והעץ מציגים את אותה שרשרת; שתי שפות עיצוב שונות על אותו מסך
// גרמו לצ'יפים להיראות כרכיב ישן שנשכח.
//
// ⚠️ הסמנטיקה של הצבע *לא* השתנתה: מאושר/ממתין/חריג נשארים שלושה מצבים
// נבדלים — רק הגוון הותאם. אחידות עיצובית שמוחקת את ההבחנה הזו הייתה
// הופכת אזהרה אמיתית לקישוט.
// 🔴 שלושת הצבעים שסוכמו. הגוון הקודם ל"מאושר" היה זהב (#e0b94a) —
// כמעט זהה לחום-הנחושת של "ממתין", כך ששני המצבים נראו אותו דבר
// ו"מאושר" נקרא כאזהרה.
const STYLE: Record<Color, string> = {
  green:  'text-white font-semibold border-[#166534] bg-[linear-gradient(160deg,#22c55e,#16a34a)] shadow-[0_2px_6px_-2px_rgba(22,163,74,0.55)]',
  orange: 'text-white font-semibold border-[#9a3412] bg-[linear-gradient(160deg,#fb923c,#ea580c)] shadow-[0_2px_6px_-2px_rgba(234,88,12,0.55)]',
  red:    'text-white font-bold border-[#7f1d1d] bg-[linear-gradient(160deg,#b91c1c,#991b1b)] shadow-[0_2px_8px_-2px_rgba(153,27,27,0.6)]',
}
const GEN_TXT: Record<Color, string> = { green: 'text-green-50/85', orange: 'text-orange-50/85', red: 'text-red-100' }
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
  // 🔴 הצומת שנבחר *ממתין לאישור* ואינו נשלח עדיין. קודם לחיצה אחת על שם
  // בבורר הייתה כותבת מיד למסד: דורסת את שרשרת הדורות, ולעתים מחזירה משפחה
  // מאושרת ל"ממתין לאישור" — בלי שהמשתמש ידע מה עומד לקרות ובלי דרך חזרה.
  const [pending, setPending] = useState<TreeNode | null>(null)
  const [undoing, setUndoing] = useState(false)
  // ⚠️ נשמר בצד הלקוח כדי להציג את כפתור הביטול מיד אחרי השינוי. אין בו
  // נתונים — השחזור עצמו נשען על היומן בשרת (lineage_assign_log).
  const [canUndo, setCanUndo] = useState(false)

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
  // תמיד מאושר. override ידני ('green'→ירוק, 'red'→אדום) גובר.
  const autoColor = (g: ChainGen): Color => statusColor(g.status, g.generation)
  const colorOf = (g: ChainGen): Color => {
    const m = marks[String(g.generation)]
    if (m === 'green') return 'green'
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
      // 🔴 לא רק 'verified'. הדרישה שהדור הקודם יהיה מאושר חסמה את הבורר כמעט
      // בכל העץ — 359 מאושרים מול 11,817 ממתינים — והמסך הורה "תקנו קודם את
      // הדור הקודם" גם כשהוא קיים, נכון, ופשוט טרם אושר. אישור הוא החלטה
      // נפרדת של הצוות; לתיקון סדר הדורות די בכך שהצומת קיים.
      // 'rejected' כן נשאר מחוץ לתמונה — הוא נדחה בהחלטה מפורשת.
      .filter(n => n.generation === prevGen && (n.status ?? '') !== 'rejected' && norm(n.name) === norm(prevChip.name))
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
      // ⚠️ גם ממתינים מוצעים, מאותה סיבה. ההגנה האמיתית אינה הסטטוס אלא השורה
      // שאחריה: המועמד חייב להיות *ילד של הדור הקודם בשרשרת*, ולכן אי אפשר
      // לבחור צומת מענף זר גם אם שמו זהה.
      .filter(n => n.generation === pickerGen && (n.status ?? '') !== 'rejected')
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
      setPending(null); setPickerGen(null); setMenuGen(null); setQ('')
      setCanUndo(true)
      router.refresh()
    } catch { setErr('שגיאת תקשורת') }
    finally { setAssigning(false) }
  }

  // ── ביטול השינוי האחרון — שחזור השרשרת, הצומת והסטטוס שהיו לפניו ──
  const undo = async () => {
    setUndoing(true); setErr('')
    try {
      const res = await fetch('/api/admin/lineage/assign/undo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiaryId }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'הביטול נכשל'); return }
      setCanUndo(false)
      router.refresh()
    } catch { setErr('שגיאת תקשורת') }
    finally { setUndoing(false) }
  }

  // ── מה בדיוק ישתנה — נגזר מאותה לוגיקה שהשרת מבצע ──
  //
  // ⚠️ ההודעה חייבת לתאר את הפעולה *האמיתית*: השרת גוזר מחדש את דורות
  // 1..N מהצומת שנבחר כלפי מעלה, ומשאיר את הדורות שמתחת. ניסוח כללי
  // ("האם לשייך?") לא היה מגלה שדורות שהמשתמש לא נגע בהם משתנים גם הם.
  const impact = useMemo(() => {
    if (!pending || pickerGen == null) return null
    const replaced = gens.filter(g => g.generation <= pickerGen)
    const kept = gens.filter(g => g.generation > pickerGen)
    const cur = gens.find(g => g.generation === pickerGen)
    return {
      cur, replaced, kept,
      // 🔴 השיוך עשוי להחזיר משפחה שכבר סווגה כחריגה ל"ממתין לאישור".
      // זה שינוי בסטטוס הזכאות, ולא רק בשמות — חייב להיאמר מראש.
      isLeaf: kept.length === 0,
    }
  }, [pending, pickerGen, gens])

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
        {/* ⚠️ נקודות המקרא נגזרות מאותם גוונים כמו הצ'יפים — מקרא שאינו
            תואם את מה שמעליו גרוע מהיעדר מקרא. */}
        {/* ⚠️ הנקודות במקרא לוקחות את הגוון *מאותו* STYLE שהצ'יפים
            משתמשים בו. מקרא בגוון אחר מלמד את הקורא צבע שגוי. */}
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#16a34a] inline-block" /> מאושר</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#ea580c] inline-block" /> ממתין לאימות</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#991b1b] inline-block" /> חריג — בדיקה מעמיקה</span>
        <span>· לחצו על דור לבחירת צומת אחר או לסימון ידני.</span>
      </p>

      {/* ⚠️ כפתור הביטול מוצג רק אחרי שינוי בפועל, ומיד מתחת לשרשרת —
          במקום שבו רואים את התוצאה ומזהים שהיא שגויה. */}
      {canUndo && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
          <AlertTriangle size={14} className="text-amber-600 shrink-0" />
          <span className="text-xs text-amber-900 font-medium">שרשרת הדורות עודכנה.</span>
          <button type="button" onClick={undo} disabled={undoing}
            className="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-50">
            {undoing ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
            בטלו את השינוי
          </button>
        </div>
      )}

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
                <button key={n.id} type="button" onClick={() => { setPending(n); setErr('') }} disabled={assigning}
                  className="flex items-center justify-between text-right rounded-lg border border-slate-200 px-3 py-2 text-sm hover:border-indigo-300 hover:bg-indigo-50 transition-colors disabled:opacity-50">
                  <span className="font-medium text-slate-800">
                    {n.name}
                    {/* ⚠️ הסטטוס גלוי: מאז שגם ממתינים מוצעים, צריך לדעת שהצומת
                        שנבחר עדיין לא אושר — אחרת השיוך נראה סופי והוא לא. */}
                    {(n.status ?? '') !== 'verified' && (
                      <span className="mr-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">ממתין</span>
                    )}
                  </span>
                  {assigning ? <Loader2 size={13} className="animate-spin text-slate-400" /> : <Check size={14} className="text-indigo-400" />}
                </button>
              ))}
            </div>
            </>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          חלונית אישור — מה בדיוק עומד לקרות.
          🔴 קודם לחיצה על שם בבורר כתבה מיד למסד. בעץ יש שמות כמעט זהים
          בדורות סמוכים, ובחירה שגויה דרסה את השרשרת ללא דרך חזרה.
          ───────────────────────────────────────────────────────────────── */}
      {pending && impact && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4" dir="rtl"
          onClick={() => !assigning && setPending(null)}>
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 border-b border-slate-200 px-5 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 shrink-0">
                <AlertTriangle size={17} className="text-amber-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">אישור שינוי בשרשרת הדורות</h2>
                <p className="text-[11px] text-slate-500">קראו מה עומד להשתנות לפני האישור</p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* מה נבחר */}
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                <p className="text-xs text-indigo-900 leading-relaxed">
                  דור {pickerGen} ישתנה
                  {impact.cur ? <> מ־<b className="font-bold">{impact.cur.name}</b></> : null}
                  {' '}ל־<b className="font-bold">{pending.name}</b>
                  {(pending.status ?? '') !== 'verified' && (
                    <span className="mr-1.5 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">צומת ממתין לאישור</span>
                  )}
                </p>
              </div>

              {/* מה תיגזר מחדש — ההשלכה הלא-מובנת מאליה */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-bold text-slate-700 mb-1.5">מה המערכת תבצע</p>
                <ul className="space-y-1.5 text-[11px] text-slate-700 leading-relaxed list-disc pr-4">
                  <li>
                    <b>דורות 1–{pickerGen} ייגזרו מחדש</b> מהצומת שנבחר כלפי מעלה עד מרן החתם סופר.
                    ייתכן שגם דורות שלא נגעתם בהם ישתנו.
                  </li>
                  {impact.kept.length > 0 ? (
                    <li>
                      הדורות שמתחת נשמרים כפי שהם: <b>{impact.kept.map(k => `דור ${k.generation}`).join(', ')}</b>.
                    </li>
                  ) : (
                    <li>זהו הדור האחרון בשרשרת — שיוך המשפחה בעץ (צומת העלה) יוצמד לצומת שנבחר.</li>
                  )}
                  <li>
                    אם המשפחה מסומנת כ<b>חריגה לבדיקה מעמיקה</b> וכל הדורות 2–5 יתאימו לעץ המאושר —
                    הסטטוס יחזור אוטומטית ל<b>ממתין לאישור</b>.
                  </li>
                </ul>
              </div>

              {/* השרשרת שתידרס — כדי שיראו את השמות עצמם */}
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-[11px] font-bold text-red-800 mb-1.5">הדורות שיידרסו ({impact.replaced.length})</p>
                <div className="flex flex-wrap gap-1">
                  {impact.replaced.map(g => (
                    <span key={g.generation} className="rounded-full bg-white border border-red-200 px-2 py-0.5 text-[10px] text-red-900">
                      <span className="text-red-400 ml-1">דור {g.generation}</span>{g.name}
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Undo2 size={12} className="text-slate-400" />
                ניתן לבטל את השינוי מיד אחרי הביצוע, בכפתור שיופיע מתחת לשרשרת.
              </p>

              {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={() => setPending(null)} disabled={assigning}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">
                ביטול
              </button>
              <button type="button" onClick={() => assign(pending.id)} disabled={assigning}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {assigning && <Loader2 size={13} className="animate-spin" />}
                אשרו את השינוי
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
