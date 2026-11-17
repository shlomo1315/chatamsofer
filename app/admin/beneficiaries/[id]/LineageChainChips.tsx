'use client'
import { useState, useMemo, useEffect, type CSSProperties } from 'react'
import { Loader2, AlertTriangle, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { genColor, asGenStatus } from '@/lib/lineageDeviation'
import s from './LineageChainChips.module.css'
// דור בשרשרת: שם, מספר דור, סטטוס הצומת בעץ, ותגית בן/חתן.
export interface ChainGen {
  generation: number
  name: string
  // סטטוס הצומת המאושר התואם בעץ. null = לא נמצא צומת תואם — *חוסר ידיעה*,
  // ולכן כתום (ממתין) ולא אדום. הצבע נגזר ב-lib/lineageDeviation.
  status?: 'verified' | 'pending' | 'rejected' | null
  relation?: 'son' | 'son_in_law' | null
  // 🔴 הצבע שחושב בשרת מול הקובץ המאושר. הרכיב הזה הוא לקוח ואינו יכול
  // לשאול את lineage_approved_ref בעצמו, ולכן הצבע מגיע מוכן.
  color?: Color
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
// ⚠️ עיצוב "מדרגות": כל דור נכנס מדרגה אחת פנימה מאביו (LineageChainChips.module.css,
// לפי המוקאפ המאושר). הסמנטיקה של הצבע *לא* השתנתה: מאושר=ירוק מלא, ממתין=כתום
// חלול, חריג=אדום עם הילה. אחידות עיצובית שמוחקת את ההבחנה הזו הייתה הופכת
// אזהרה אמיתית לקישוט.
const CLS: Record<Color, string> = { green: '', orange: s.o, red: s.r }
const PILL: Record<Color, string> = { green: 'מאושר', orange: 'ממתין', red: 'חריג' }
// ⚠️ כלל הצבע מגיע מ-lib/lineageDeviation ואינו משוכפל כאן: הצ'יפים וחלונית
// ההתראה חייבים לומר את אותו דבר. עותק שני היה נפרד מהראשון בתיקון הבא, ואז
// ההתראה מדברת על דור שהצ'יפים מציגים כתקין.
// 🔴 הצבע מגיע מהשרת, שחישב אותו מול הקובץ המאושר. נפילה-לאחור ל-genColor
// רק כשלא נשלח צבע (מסך ישן שטרם עודכן) — ואז הכלל הישן לפי התווית.
//
// ⚠️ זו הייתה נקודת הכשל: הצ'יפים חישבו לבדם לפי status='verified', ולכן
// הציגו ירוק על צומת שאינו בקובץ בעוד חלונית ההתראה כבר אמרה אדום.
const statusColor = (g: ChainGen): Color =>
  g.color ?? genColor(g.generation, asGenStatus(g.status))

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
  const [menuIdx, setMenuIdx] = useState<number | null>(null)   // איזה דור (לפי מיקום) פתח תפריט
  const [marking, setMarking] = useState(false)                  // שורת מאושר/נדחה פתוחה בתפריט
  const [pickerGen, setPickerGen] = useState<number | null>(null) // בורר צמתים פתוח לדור
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)            // צומת שסומן בבורר; null = הנוכחי
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
  const autoColor = (g: ChainGen): Color => statusColor(g)
  const colorOf = (g: ChainGen): Color => {
    const m = marks[String(g.generation)]
    if (m === 'green') return 'green'
    if (m === 'red') return 'red'
    return autoColor(g)
  }

  // סימון ידני (override). לחיצה על הסימון שכבר פעיל מחזירה לצבע האוטומטי.
  const setMark = async (g: ChainGen, v: 'red' | 'green') => {
    setMenuIdx(null); setMarking(false)
    const next: 'red' | 'green' | null = marks[String(g.generation)] === v ? null : v
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

  // סגירת התפריט בלחיצה מחוצה לו או ב-Escape; Escape סוגר גם את הבורר.
  useEffect(() => {
    if (menuIdx == null && pickerGen == null) return
    const onDown = (e: PointerEvent) => {
      if (menuIdx != null && !(e.target as Element | null)?.closest?.('.' + s.nodeWrap)) { setMenuIdx(null); setMarking(false) }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setMenuIdx(null); setMarking(false)
      if (pickerGen != null && !pending && !assigning) { setPickerGen(null); setSel(null) }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menuIdx, pickerGen, pending, assigning])

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
      setPending(null); setPickerGen(null); setSel(null); setMenuIdx(null); setQ('')
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

  const total = { g: 0, o: 0, r: 0 }
  gens.forEach(g => { const c = colorOf(g); total[c === 'green' ? 'g' : c === 'orange' ? 'o' : 'r']++ })
  const pickerCur = pickerGen == null ? undefined : gens.find(g => g.generation === pickerGen)
  const pickerPrev = pickerGen == null ? undefined : gens.find(g => g.generation === pickerGen - 1)
  const closePicker = () => { if (!assigning) { setPickerGen(null); setSel(null) } }
  const confirmPick = () => {
    if (sel == null) { closePicker(); return }
    const n = pickerOptions.find(o => o.id === sel)
    if (n) { setPending(n); setErr('') }
  }

  return (
    <div className={s.root}>
      <div className={s.head}>
        <div>
          <h2>סדר הדורות</h2>
          <p>כל דור נכנס מדרגה אחת פנימה מאביו. לחיצה על דור פותחת עריכה והחלפה.</p>
        </div>
        <div className={s.tally}>
          {saving && <Loader2 size={13} className="animate-spin text-slate-400" />}
          <span><b>{gens.length}</b> דורות</span>
          {total.g > 0 && <span style={{ '--c': 'var(--g)' } as CSSProperties}><i /><b>{total.g}</b> מאושרים</span>}
          {total.o > 0 && <span style={{ '--c': 'var(--o)' } as CSSProperties}><i /><b>{total.o}</b> ממתינים</span>}
          {total.r > 0 && <span style={{ '--c': 'var(--r)' } as CSSProperties}><i /><b>{total.r}</b> חריג</span>}
        </div>
      </div>

      <div className={s.panel}>
        <ol className={s.tree}>
          {gens.map((g, i) => {
            const color = colorOf(g)
            const open = menuIdx === i
            const prev = gens[i - 1]
            const rel = g.relation === 'son' ? 'בן' : g.relation === 'son_in_law' ? 'חתן' : ''
            return (
              <li key={`${g.generation}-${i}`} className={`${s.gen} ${CLS[color]}`} style={{ '--i': i } as CSSProperties}>
                <span className={s.dot}>{g.generation}</span>
                <div className={`${s.nodeWrap} ${open ? s.open : ''} ${open && marking ? s.marking : ''}`}>
                  <button type="button" className={s.node} aria-haspopup="menu" aria-expanded={open}
                    title={`דור ${g.generation}, לחצו לעריכה`}
                    onClick={() => { setMenuIdx(open ? null : i); setMarking(false) }}>
                    <span className={s.txt}>
                      <span className={s.nm}>{g.name}</span>
                      <span className={s.meta}>
                        {rel && <><span className={s.rel}>{rel}</span><span className={s.sep} /></>}
                        <span className={s.par}>{prev ? `אביו: ${prev.name.split(' ומרת')[0].split(',')[0]}` : 'ראש השושלת'}</span>
                      </span>
                    </span>
                    <span className={s.pill}>{PILL[color]}</span>
                    <svg className={s.chev} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
                  </button>
                  <div className={s.menu} role="menu">
                    <button type="button" className={s.mi} role="menuitem"
                      onClick={() => { setMenuIdx(null); setMarking(false); setPickerGen(g.generation); setSel(null); setQ(''); setErr('') }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h9l-2.5-2.5M13 11H4l2.5 2.5" /></svg>
                      בחר צומת אחר לדור זה
                    </button>
                    <hr />
                    <button type="button" className={s.mi} role="menuitem" onClick={() => setMarking(m => !m)}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>
                      סמן ידנית (מאושר/נדחה)
                    </button>
                    {/* ⚠️ לחיצה על הסימון שכבר פעיל מבטלת אותו וחוזרת לצבע האוטומטי */}
                    <div className={s.mark}>
                      <button type="button" className={s.ok} aria-pressed={marks[String(g.generation)] === 'green'} onClick={() => setMark(g, 'green')}>מאושר</button>
                      <button type="button" className={s.no} aria-pressed={marks[String(g.generation)] === 'red'} onClick={() => setMark(g, 'red')}>נדחה</button>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>

        <div className={s.foot}>
          <div className={s.legend}>
            <span><i style={{ '--c': 'var(--g)' } as CSSProperties} />מאושר</span>
            <span><i className={s.hollow} />ממתין לאימות</span>
            <span><i style={{ '--c': 'var(--r)' } as CSSProperties} />חריג: בדיקה מעמיקה</span>
          </div>
          <span>לחצו על דור כדי להחליף או לסמן ידנית</span>
        </div>
      </div>

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

      {/* בורר צמתים: באמצע המסך עם טשטוש */}
      {pickerGen != null && (
        <div className={s.ov} dir="rtl" onClick={closePicker}>
          <div className={s.dlg} role="dialog" aria-modal="true" aria-labelledby="lineage-pick-title" onClick={e => e.stopPropagation()}>
            <div className={s.k}>דור {pickerGen} · אביו: {pickerPrev?.name ?? '—'}</div>
            <h3 id="lineage-pick-title">בחירת צומת אחר לדור הזה</h3>
            <p>צמתים מהעץ באותו דור, שאביהם הוא הדור הקודם בשרשרת.</p>

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
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש לפי שם…" autoFocus aria-label="חיפוש לפי שם" />

            {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">{err}</p>}

            <div className={s.cands} role="radiogroup">
              {pickerCur && (
                <button type="button" role="radio" aria-checked={sel == null}
                  className={`${s.cand} ${sel == null ? s.sel : ''}`} onClick={() => setSel(null)}>
                  <span className={s.radio} /><b>{pickerCur.name}</b><small>נוכחי</small>
                </button>
              )}
              {loadingNodes ? (
                <div className={s.empty}><Loader2 size={14} className="animate-spin" /> טוען צמתים…</div>
              ) : pickerOptions.length === 0 ? (
                <div className={s.empty}>{q.trim() ? 'לא נמצאו צמתים תואמים' : `אין צמתים מאומתים בדור ${pickerGen}`}</div>
              ) : pickerOptions.map(n => (
                <button key={n.id} type="button" role="radio" aria-checked={sel === n.id} disabled={assigning}
                  className={`${s.cand} ${sel === n.id ? s.sel : ''}`} onClick={() => setSel(n.id)}>
                  <span className={s.radio} /><b>{n.name}</b>
                  {/* ⚠️ הסטטוס גלוי: מאז שגם ממתינים מוצעים, צריך לדעת שהצומת
                      שנבחר עדיין לא אושר — אחרת השיוך נראה סופי והוא לא. */}
                  <small>{(n.status ?? '') === 'verified' ? 'מאושר' : 'ממתין'}</small>
                </button>
              ))}
            </div>
            </>
            )}

            <div className={s.acts}>
              <button type="button" className={s.x} onClick={closePicker} disabled={assigning}>ביטול</button>
              <button type="button" className={s.go} onClick={confirmPick} disabled={assigning || prevGenUnresolved}>שייך לדור הזה</button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          חלונית אישור — מה בדיוק עומד לקרות.
          🔴 קודם לחיצה על שם בבורר כתבה מיד למסד. בעץ יש שמות כמעט זהים
          בדורות סמוכים, ובחירה שגויה דרסה את השרשרת ללא דרך חזרה.
          ───────────────────────────────────────────────────────────────── */}
      {pending && impact && (
        <div className="dlg-backdrop " dir="rtl"
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
              <div className="rounded-xl border border-line bg-sand px-4 py-3">
                <p className="text-xs text-navy-dark leading-relaxed">
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
                className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy-dark transition-colors disabled:opacity-50">
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
