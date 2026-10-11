'use client'
// ─────────────────────────────────────────────────────────────────────────────
// בורר סדר הדורות — משותף לרישום, לתיקון ייחוס בפורטל ולקישור תיקון סדר הדורות.
// 🔴 הוצא מ-app/PublicPortalPage.tsx (11.10) כדי שקישור התיקון ישתמש באותו
// בורר בדיוק כמו הרישום — "כאילו נרשם מחדש עם הסדר המתוקן".
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import { Loader2, X, Plus, Check, User, AlertTriangle } from 'lucide-react'
import TextInput from '@/components/ui/TextInput'
import { composeLineageName, findTitles, lineageIdentityKey } from '@/lib/lineageNameFormat'
import { genTone } from '@/lib/lineagePalette'
import { EARLY_DEPTH } from '@/lib/lineageDeviation'

export interface LineageNode { id: string; name: string; generation: number; parent_id: string | null; status?: string; relation?: 'son' | 'son_in_law' | null }

// ⚠️ הדור המוקדם ביותר שבו ניתן לסמן "זה אני". אין אדם חי שהוא עצמו דור 2־5
// לחתם סופר זיע״א — סימון כזה הוא תמיד טעות, והוא היה קוטע את השרשרת באמצע
// ומשייך את הנרשם לאב-קדמון במקום לעצמו.
const SELF_MIN_GENERATION = 6

// ─────────────────────────────────────────────────────────────────────────────
// גוון הדור בציר הייחוס — נגזר מ-lib/lineagePalette, לא מוגדר כאן.
//
// 🔴 כאן ישבה **הפלטה השביעית**: אינדיגו/תכלת/טורקיז/ורוד/פוקסיה — בדיוק
// סוג העותק המשוכפל שאיחוד הפלטות (14.08) בא לחסל. ששת רכיבי העץ בניהול
// עברו ל-genTone, והפורטל הציבורי — המסך שהמשפחות עצמן רואות — נשאר מאחור
// עם צבעים מעולם אחר לגמרי. ההערה בתת-טאב הייחוס אף טענה שזו "אותה פלטה
// שהעץ בניהול משתמש בה", וזה פשוט לא היה נכון.
//
// התוצאה בפועל: אותו אדם, אותו דור — ורוד בפורטל, זהב בכרטסת.
//
// ⚠️ המרה ל-style ולא ל-מחלקות Tailwind: הסולם "קלף וחותם" בנוי על
// מדרגים (linear-gradient) וצללים בגוון הצומת, ואין להם מקבילה במחלקות
// הסטנדרטיות. ניסיון לקרב אותם למחלקה הקרובה ביותר היה מייצר בדיוק את
// הסטייה שהאיחוד נועד למנוע — פלטה שמנסה להיראות כמו האחרת.
export const genStyle = (i: number) => {
  const t = genTone(i)
  return {
    // ⚠️ הגוון הבהיר (light) ולא ה-bg: ה-bg הוא מדרג רווי לצומת בקנבס
    // ה-SVG, וטקסט כהה עליו אינו קריא. בכרטיסי הציר הרקע בהיר והטקסט כהה.
    card:  { background: t.light, borderColor: t.ring },
    text:  { color: t.text },
    dot:   { background: t.ring },
  }
}

export interface LineageResult {
  valid: boolean
  nodeId: string | null
  ancestors: { id: string | null; name: string; relation: 'son' | 'son_in_law' | null; isNew: boolean }[]
  selfRelation: 'son' | 'son_in_law' | null
  /**
   * הנרשם סימן שהוא עצמו כבר קיים בעץ (הצומת האחרון בשרשרת הוא הוא).
   * ⚠️ אז אין ליצור עבורו דור חדש: יצירה כזו הייתה מוסיפה עותק שני של אדם
   * שכבר רשום — וזה בדיוק מקור הכפילויות שאנחנו ממזגים ידנית.
   */
  selfIsExisting: boolean
}
/**
 * בורר סדר הדורות.
 *
 * ⚠️ מציג צמתים מאושרים בלבד, בכל המסלולים. הדגל includePending הוסר:
 *   סדר ייחוס אינו נבנה על רשומה שטרם נבדקה, גם לא בתיקון. מה שחסר בעץ
 *   מוקלד ידנית ונכנס כ-pending לאישור המשרד.
 *
 * @param prefillChain  השרשרת הרשומה היום, לטעינה מראש כנקודת פתיחה.
 *   ⚠️ "תיקון" משמעו לשנות משהו קיים — בלי זה נדרש היה לבנות 8-9 דורות
 *   מאפס בכל בקשה, וזה לבדו הפיל את רוב הבקשות באמצע.
 */
export function LineageBuilder({ selfName, onChange, prefillChain }: {
  selfName: string
  onChange: (r: LineageResult) => void
  prefillChain?: { name: string; relation?: 'son' | 'son_in_law' | null }[] | null
}) {
  const [root, setRoot] = useState<{ id: string; name: string } | null>(null)
  const [chain, setChain] = useState<{ id: string | null; name: string; relation: 'son' | 'son_in_law' | null; isNew: boolean }[]>([])
  const [options, setOptions] = useState<LineageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  // כמה דורות נטענו מראש מהשרשרת הקיימת — לתצוגת ההסבר בלבד.
  const [prefilled, setPrefilled] = useState(0)
  // ⚠️ שלושה שדות ולא שדה שם אחד: כשהיה שדה חופשי, כל נרשם כתב אחרת ("רבי",
  // "ר'", "הרב", ועם "שליט\"א" בסוף) — ואותו אדם נכנס לעץ בכמה ניסוחים שנראים
  // כמו אנשים שונים. כאן מזינים רק את השמות, והמערכת מרכיבה את הניסוח האחיד.
  const [newHusband, setNewHusband] = useState('')
  const [newWife, setNewWife] = useState('')
  const [newFamily, setNewFamily] = useState('')
  const [newRel, setNewRel] = useState<'son' | 'son_in_law' | null>(null)
  const [newErr, setNewErr] = useState('')
  const [selfAdded, setSelfAdded] = useState(false)
  const [selfRel, setSelfRel] = useState<'son' | 'son_in_law' | null>(null)
  // הנרשם סימן שהוא עצמו כבר קיים ברשימה — משויך לצומת הקיים במקום ליצור חדש
  const [selfExistingId, setSelfExistingId] = useState<string | null>(null)
  // חלונית אזהרה לפני הוספה ידנית — נפתחת מחדש בכל דור ובכל לחיצה (ללא זיכרון),
  // כי כל דור הוא בדיקה נפרדת וכפילות באחד מהם פוסלת את הרישום כולו.
  const [manualGate, setManualGate] = useState(false)

  // ⚠️ חלונית שנייה — ברגע הכניסה לשדה השם עצמו.
  //
  // האזהרה על התארים יושבת מעל השדות, ובפועל אנשים מתחילים להקליד בלי לקרוא
  // אותה, ואז נכנס לעץ שם חלקי או כינוי ("איצק" במקום "יצחק אייזיק"). שם לא
  // מדויק אינו ניתן לזיהוי מול העץ, והרישום נפסל. לכן ההתראה נעצרת בדרך
  // לשדה במקום להיות עוד טקסט לידו.
  //
  // פעם אחת לכל פתיחת טופס — לא בכל focus. אחרת מעבר בין שדה הבעל לשדה
  // האישה היה פותח אותה שוב ושוב והמשתמש היה לומד לסגור אותה בלי לקרוא.
  const [nameGate, setNameGate] = useState(false)
  const [nameGateSeen, setNameGateSeen] = useState(false)
  const husbandRef = useRef<HTMLInputElement>(null)
  const wifeRef = useRef<HTMLInputElement>(null)
  const gateFrom = useRef<'husband' | 'wife'>('husband')

  // ⚠️ ה-blur מיידי: בלי זה המקלדת בנייד נשארת פתוחה מעל החלונית, והמשתמש
  // מקליד לתוך שדה מוסתר בזמן שהאזהרה על המסך.
  const openNameGate = (which: 'husband' | 'wife') => {
    if (nameGateSeen) return
    gateFrom.current = which
    ;(which === 'husband' ? husbandRef : wifeRef).current?.blur()
    setNameGate(true)
  }

  // ⚠️ בלי include_pending: השליפה מחזירה צמתים מאושרים בלבד בכל דור.
  const fetchChildren = async (parentId: string) => { try { const r = await fetch(`/api/lineage?parent_id=${parentId}`); const d = await r.json(); return (d.nodes ?? []) as LineageNode[] } catch { return [] } }

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/lineage'); const d = await r.json(); const rn = (d.nodes ?? [])[0]
        if (rn) {
          setRoot({ id: rn.id, name: rn.name })
          // ── טעינה מראש של השרשרת הקיימת ──
          // ⚠️ ההליכה היא צעד-אחר-צעד במורד העץ, ולא התאמה גורפת: כל דור
          // מחפש את שמו בין *ילדי הדור הקודם* בלבד. התאמה כלל-עצית לפי שם
          // הייתה משייכת לענף זר — 79% מהצמתים בנוסח "רבי X ומרת Y", ושמות
          // חוזרים בין ענפים.
          //
          // ⚠️ עצירה בדור הראשון שלא נמצא: משם והלאה זה בדיוק מה שהמשתמש
          // בא לתקן, והוא ממשיך ידנית. אין המצאה של צמתים שאינם בעץ.
          const pre = (prefillChain ?? []).filter(c => c?.name?.trim())
          if (pre.length) {
            const built: { id: string | null; name: string; relation: 'son' | 'son_in_law' | null; isNew: boolean }[] = []
            let parentId = rn.id as string
            // דור 1 הוא השורש עצמו, והוא קבוע בתצוגה — מדלגים עליו.
            //
            // 🔴 הזיהוי לפי *מיקום* (generation === 1) ולא לפי השם.
            // ⚠️ השוואת שמות נכשלת כאן: השורש בעץ הוא «מרן החתם סופר זי"ע»
            // ואילו בשרשרות השמורות כתוב «רבינו החתם סופר» — ו-«רבינו»
            // אינו ברשימת התארים, כך ש-lineageIdentityKey מחזיר מפתחות
            // שונים. הסתמכות על השם הייתה מפילה את הטעינה מראש אצל 6,873
            // המוטבים (95%) — הם היו מקבלים טופס ריק בדיוק כמו קודם.
            const first = prefillChain?.[0] as { generation?: number } | undefined
            const startIdx = (Number(first?.generation) === 1
              || /חתם\s*סופר/.test(pre[0].name)) ? 1 : 0
            for (let i = startIdx; i < pre.length; i++) {
              const kids = await fetchChildren(parentId)
              const key = lineageIdentityKey(pre[i].name)
              const hit = kids.find(k => lineageIdentityKey(k.name) === key)
              if (!hit) break
              built.push({ id: hit.id, name: hit.name, relation: hit.relation ?? null, isNew: false })
              parentId = hit.id
            }
            if (built.length) {
              setChain(built)
              setOptions(await fetchChildren(parentId))
              setPrefilled(built.length)
              setLoading(false)
              return
            }
          }
          setOptions(await fetchChildren(rn.id))
        }
      } catch { /* ignore */ }
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const deepestVerified = [...chain].reverse().find(c => !c.isNew && c.id)
    // ⚠️ כשהנרשם סימן שהוא עצמו כבר ברשימה, הצומת האחרון בשרשרת *הוא* הוא:
    // אין דור נוסף להוסיף, ולכן גם אין צורך בבחירת בן/חתן עבורו — הקשר כבר
    // מוגדר על הצומת הקיים בעץ.
    const selfExisting = !!selfExistingId && chain.some(c => c.id === selfExistingId)
    const valid = selfExisting
      ? chain.length >= 1 && chain.every(c => !c.isNew || !!c.relation)
      // קשר (בן/חתן) נדרש רק לדורות שהנרשם הוסיף ידנית; דורות מאומתים מהעץ
      // משתמשים בקשר שמוגדר בניהול (שעשוי להיות ריק) — אחרת אי אפשר להתקדם.
      : chain.length >= 1 && selfAdded && !!selfRel && chain.every(c => !c.isNew || !!c.relation)
    onChange({
      valid,
      nodeId: selfExisting ? selfExistingId : (deepestVerified?.id ?? null),
      ancestors: chain,
      selfRelation: selfRel,
      selfIsExisting: selfExisting,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, selfAdded, selfRel, selfExistingId])

  /**
   * "זה אני" — הנרשם מסמן שהצומת הקיים הוא הוא עצמו.
   * ⚠️ הצומת נכנס לשרשרת ומסומן כנרשם, ולא נוצר עבורו דור חדש: יצירה כזו
   * הייתה מוסיפה עותק שני של אדם שכבר רשום בעץ.
   */
  const markSelfExisting = async (node: LineageNode) => {
    setChain(c => [...c, { id: node.id, name: node.name, relation: node.relation ?? null, isNew: false }])
    setOptions([])
    setSelfAdded(false)
    setSelfRel(node.relation ?? null)
    setSelfExistingId(node.id)
  }

  const pickVerified = async (node: LineageNode) => {
    setSelfExistingId(null)
    setSelfAdded(false)
    setChain(c => [...c, { id: node.id, name: node.name, relation: node.relation ?? null, isNew: false }])
    setOptions(await fetchChildren(node.id))
  }
  // תצוגה חיה של הניסוח שייווצר — כדי שהנרשם יראה מה ייכנס לעץ, ולא ינחש
  const newPreview = composeLineageName({ husband: newHusband, wife: newWife, family: newFamily })

  const confirmNew = () => {
    const h = newHusband.trim(), w = newWife.trim(), f = newFamily.trim()
    if (!h) { setNewErr('יש להזין את שמו הפרטי של הבעל'); return }
    if (!f) { setNewErr('יש להזין שם משפחה'); return }
    // ⚠️ תואר שהוזן בטעות נחסם *לפני* השמירה ולא מנוקה בשקט: אם נשתוק, הנרשם
    // לא ילמד את הכלל וימשיך להזין תארים בכל דור.
    const bad = [...findTitles(h), ...findTitles(w), ...findTitles(f)]
    if (bad.length) {
      setNewErr(`אין להזין תארים — הסירו «${bad.join('», «')}». המערכת מוסיפה "רבי" ו"מרת" לבד.`)
      return
    }
    if (!newRel) { setNewErr('יש לסמן בן או חתן'); return }
    setSelfAdded(false)
    setChain(c => [...c, { id: null, name: newPreview, relation: newRel, isNew: true }])
    setOptions([]); setAddOpen(false)
    setNewHusband(''); setNewWife(''); setNewFamily(''); setNewRel(null); setNewErr('')
  }
  // מחיקת שם מהשרשרת לפי מיקומו — מסירה אותו ואת כל מה שאחריו (הדורות תלויים זה בזה),
  // ומחזירה את רשימת הבחירה לדור שנותר האחרון.
  const removeAt = async (chainIndex: number) => {
    const next = chain.slice(0, chainIndex)
    setChain(next)
    // ⚠️ מחיקה מהשרשרת מבטלת גם את סימון "זה אני": אם הצומת שסומן ירד,
    // הסימון היה נשאר תלוי על מזהה שכבר אינו בשרשרת והרישום היה נחסם.
    setSelfExistingId(null)
    setSelfAdded(false); setAddOpen(false)
    const prev = next[next.length - 1]
    if (prev && !prev.isNew && prev.id) setOptions(await fetchChildren(prev.id))
    else if (!prev && root) setOptions(await fetchChildren(root.id))
    else setOptions([])
  }

  const relBadge = (r: 'son' | 'son_in_law' | null) => (r === 'son' || r === 'son_in_law') ? (
    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0 ${r === 'son' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{r === 'son' ? 'בן' : 'חתן'}</span>
  ) : null

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-400 py-3"><Loader2 size={14} className="animate-spin" /> טוען דורות…</div>

  // ⚠️ מי שסימן "זה אני" אינו מוסיף את עצמו שוב — זו בדיוק הכפילות שנמנעה
  // 🔴 הנרשם עצמו לעולם אינו דור 2–5 (12.10): אין אדם חי שהוא נין של החתם סופר.
  // "הוסיפו אותי" בדור 3 קטע את השרשרת באמצע ותלה את הנרשם על אב-קדמון.
  const canAddSelf = chain.length + 2 > EARLY_DEPTH && !selfAdded && !selfExistingId
  const lastIsNew = chain.length > 0 && chain[chain.length - 1].isNew
  // 🔴 דורות 2–5 נבחרים מהרשימה בלבד (12.10) — הם מוגדרים במלואם בקובץ המאושר.
  // הקלדה ידנית שם יצרה את העותקים הממתינים שזיהמו את העץ (ענף פרידמן: "אברהם
  // חנוך" ו"שמואל בנימין" הוקלדו שוב ושוב בנוסחים שונים). הקלדה מותרת רק כשאין
  // ברשימה דבר — מתחת ל-4 הצמתים בקובץ שאין להם ילדים בקובץ.
  const manualBlocked = chain.length + 2 <= EARLY_DEPTH && options.length > 0 && !lastIsNew
  // הרשימה המוצגת היא דור chain.length + 2 — ו"זה אני" נפתח רק מדור SELF_MIN_GENERATION
  const canMarkSelfHere = chain.length + 2 >= SELF_MIN_GENERATION

  return (
    <div className="flex flex-col">
      {/* ⚠️ הסבר על נקודת הפתיחה: בלי זה נראה כאילו המערכת "בנתה משהו לבד",
          והמשתמש אינו יודע שמותר (וצריך) למחוק מכאן ולתקן. */}
      {prefilled > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 mb-3">
          <p className="text-[13px] text-indigo-900 leading-relaxed">
            טענו עבורכם את <span className="font-bold">{prefilled} הדורות</span> הרשומים אצלנו היום, כנקודת פתיחה.
            <span className="block mt-1">
              מחקו בעזרת <span className="font-bold">✗</span> את הדור שממנו הטעות מתחילה (וכל מה שאחריו יימחק יחד איתו),
              ובנו משם את הסדר הנכון.
            </span>
          </p>
        </div>
      )}

      {/* סיכום הדורות שנבחרו — דור 1 קבוע ואז השרשרת */}
      {[{ name: root?.name ?? 'רבינו החתם סופר זיע״א', relation: null as 'son' | 'son_in_law' | null, fixed: true, isNew: false }, ...chain.map(c => ({ ...c, fixed: false }))].map((row, i) => {
        const col = genStyle(i)
        return (
          <div key={i} className="flex items-stretch gap-3">
            <div className="flex flex-col items-center w-5 flex-shrink-0">
              <span className="w-3 h-3 rounded-full mt-2.5" style={col.dot} />
              <span className="w-0.5 flex-1 bg-slate-200 my-0.5" />
            </div>
            <div className="flex-1 mb-2 rounded-xl border px-3 py-2 flex items-center gap-2" style={col.card}>
              <span className="text-[10px] font-bold flex-shrink-0 opacity-70" style={col.text}>דור {i + 1}</span>
              <span className="text-sm font-semibold flex-1 truncate" style={col.text}>{row.name}</span>
              {row.fixed && <span className="text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 rounded-full px-2 py-0.5 flex-shrink-0">קבוע</span>}
              {!row.fixed && (row as { isNew: boolean }).isNew && <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 flex-shrink-0">ממתין לאימות</span>}
              {!row.fixed && (row as { id?: string | null }).id === selfExistingId && selfExistingId && (
                <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 flex-shrink-0">זה אני</span>
              )}
              {relBadge(row.relation)}
              {!row.fixed && !selfAdded && (
                <button type="button" onClick={() => removeAt(i - 1)}
                  className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-100 text-red-600 border border-red-300 hover:bg-red-600 hover:text-white hover:border-red-600 shadow-sm transition-colors"
                  title="מחיקת שם זה (וכל מה שאחריו)"><X size={17} strokeWidth={2.5} /></button>
              )}
            </div>
          </div>
        )
      })}

      {/* ⚠️ אזהרה מודגשת באדום — מיד אחרי דור החתם סופר, לפני בחירת דור 2.
          הוספה ידנית של דור שכבר קיים מייצרת כפילות בעץ הדורות ומחייבת
          תיקון ידני, ולכן הניסוח חד וחד-משמעי.

          🔴 מוצגת רק כשיש בכלל מה לבדוק מולו (options.length > 0).
          העץ נגמר בפועל בדור 5 — 116 מתוך 126 הצמתים שם הם קצה מסלול —
          ולכן רוב הנרשמים מגיעים לדור שבו הרשימה *ריקה*. אזהרה שצועקת
          "חובה לבדוק ברשימה" ו"הרישום יידחה לאלתר" מול רשימה ריקה אינה
          מונעת כפילות (אין מה לכפול), אלא רק מרתיעה אנשים מלהמשיך —
          וזה בדיוק מה שדווח: נרשמים נעצרו ולא השלימו את הרישום.
          כשהרשימה ריקה מוצגת במקומה הנחיה עניינית על דיוק השם. */}
      {options.length > 0 ? (
      <div className="rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3.5 mb-3">
        <p className="text-sm font-extrabold text-red-800 leading-relaxed mb-2">
          ⚠️ חובה לבדוק בכל דור אם הוא כבר קיים ברשימה — לפני הוספה ידנית!
        </p>
        <ul className="text-sm text-red-800 leading-relaxed space-y-1.5 pr-1">
          <li className="flex gap-2">
            <span className="font-bold flex-shrink-0">1.</span>
            <span>בכל דור — <span className="font-bold">חפשו תחילה ברשימה הקיימת ובחרו משם</span>.</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold flex-shrink-0">2.</span>
            <span><span className="font-bold">רק אם הדור המבוקש אינו מופיע ברשימה כלל</span> — ניתן להוסיף אותו ידנית.</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold flex-shrink-0">3.</span>
            <span className="font-extrabold">
              הוספה ידנית של דור שכבר קיים במערכת — הרישום יידחה לאלתר.
            </span>
          </li>
        </ul>
      </div>
      ) : (
        /* אין רשומות בדור הזה — אין מה להצליב מולו. ההנחיה היחידה שרלוונטית
           כאן היא דיוק ומלאות השם, שהוא מה שמאפשר את ההצלבה בהמשך. */
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 mb-3">
          <p className="text-sm font-bold text-blue-900 leading-relaxed mb-1">
            המשיכו לבנות את סדר הדורות
          </p>
          <p className="text-[13px] text-blue-800 leading-relaxed">
            בדור זה עדיין אין רשומות במערכת, ולכן יש להוסיף את הדור הבא ידנית.
            הקפידו על <span className="font-bold">השם המלא והמדויק</span> (שם פרטי מלא ושם משפחה, בלי כינוי או קיצור) —
            כך נוכל לשייך אתכם נכון.
          </p>
        </div>
      )}

      {/* שורת הנרשם — אחרי שלחץ "הוסף אותי" */}
      {selfAdded && (
        <div className="flex items-stretch gap-3">
          <div className="flex flex-col items-center w-5 flex-shrink-0"><span className="w-3 h-3 rounded-full mt-2.5 bg-green-600 ring-2 ring-green-200" /></div>
          <div className="flex-1 mb-2 rounded-xl border-2 border-green-300 bg-green-600 px-3 py-2 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-green-100 flex-shrink-0">דור {chain.length + 2}</span>
            <span className="text-sm font-semibold text-white flex-1 truncate">{selfName || '(שמך)'}</span>
            <span className={`text-xs font-bold text-white ${selfRel === null ? 'animate-pulse' : ''}`}>{selfRel === null ? '← בחרו בן/חתן (חובה):' : 'בן/חתן:'}</span>
            {(['son', 'son_in_law'] as const).map(r => (
              <button key={r} type="button" onClick={() => setSelfRel(r)}
                className={`text-sm font-bold rounded-lg px-4 py-1.5 border-2 transition-all duration-150 ${selfRel === r ? 'bg-white text-green-800 border-white shadow-md ring-2 ring-white/60' : selfRel === null ? 'bg-white/90 text-green-800 border-white animate-pulse ring-2 ring-yellow-300 shadow-lg' : 'bg-green-800/60 text-white border-white/80 hover:bg-green-800'}`}>{r === 'son' ? 'בן' : 'חתן'}</button>
            ))}
            <button type="button" onClick={() => { setSelfAdded(false); setSelfRel(null) }} className="text-green-100 hover:text-white flex-shrink-0" title="בטל"><X size={15} /></button>
          </div>
        </div>
      )}

      {/* בורר הדור הבא — כפתורים + "אחר" */}
      {!selfAdded && (
        <div className="mr-8 mt-1">
          {!addOpen ? (
            <>
              {!lastIsNew && options.length > 0 && (
                <>
                  {/* כותרת הבורר: הכיתוב מסביר *מה עושים* (בוחרים מהרשימה שלמטה),
                      ותג קטן בצד ימין אומר *באיזה דור* מדובר — כך מספר הדור אינו
                      בולע את ההוראה עצמה.
                      ⚠️ התנאי להוספה ידנית נאמר כאן, בנקודה שבה מחליטים — ולא רק
                      בבאנר שלמעלה: הוספה ידנית של דור שכבר קיים בעץ היא המקור
                      המרכזי לכפילויות, ולכן ההשלכה נכתבת מפורשות. */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5 flex-shrink-0">דור {chain.length + 2}</span>
                    <p className="text-xs font-semibold text-slate-600">בחרו את הדור הבא מתוך הרשימה שלהלן:</p>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 mb-2">
                    הוספה ידנית של דור אפשרית <strong>רק</strong> כאשר הדור המבוקש אינו מופיע ברשימה כלל.
                    יש לוודא זאת לפני ההוספה — הוספה ידנית של דור הקיים כבר בעץ הדורות תגרום ל<strong>דחיית הרישום</strong>.
                  </p>
                  {/* ⚠️ ליד כל שם — "זה אני". בלי זה נרשם שכבר קיים בעץ נאלץ
                      ללחוץ "הוסף אותי" ונוצר עותק שני שלו, וזה בדיוק מקור
                      הכפילויות שאנחנו ממזגים ידנית אחר כך.

                      ⚠️ אבל הכפתור *דיסקרטי בכוונה*, ורק מדור 5 ומעלה:
                      • הגבלת הדור — אין אדם חי שהוא עצמו דור 2/3/4 לחתם סופר.
                        בדורות האלה סימון "זה אני" הוא תמיד טעות, והוא היה קוטע
                        את השרשרת באמצע ומשייך את הנרשם לאב-קדמון.
                      • הדיסקרטיות — כפתור ירוק בולט ליד כל שם הזמין לחיצה
                        סתמית ("אולי זה אני?") במקום המשך בניית השרשרת. מי
                        שבאמת מחפש את עצמו יזהה את הסמל ואת ההסבר בריחוף. */}
                  <div className="flex flex-col gap-1.5 mb-2">
                    {options.slice().sort((a, b) => a.name.localeCompare(b.name, 'he')).map(node => (
                      <div key={node.id} className="flex items-stretch gap-1.5">
                        <button type="button" onClick={() => pickVerified(node)}
                          className="flex-1 text-right text-sm px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:border-indigo-400 hover:bg-indigo-50 transition-all duration-150">
                          {node.name}{node.relation ? <span className="text-[10px] text-slate-400 mr-1">({node.relation === 'son' ? 'בן' : 'חתן'})</span> : null}
                          {/* ⚠️ סימון מפורש של רשומה שטרם אושרה. בלי זה היא נראית
                              זהה למאושרת, והמשתמש מסיק שהייחוס שלו כבר נבדק. */}
                          {(node.status ?? 'verified') !== 'verified' && (
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-1.5 py-0.5 mr-1.5 whitespace-nowrap">ממתין לאישור</span>
                          )}
                        </button>
                        {canMarkSelfHere && (
                          /* ⚠️ הכפתור בולט ומסומן בטקסט ולא באייקון מעומעם: מי
                             שכבר קיים בעץ ולא מזהה את האפשרות לוחץ "הוסף אותי"
                             ונוצר עותק שני שלו — וזה מקור הכפילויות שאנחנו
                             ממזגים ידנית אחר כך. עדיף שיראה אותו מיד. */
                          <button type="button" title="זה אני — זהו שמי; שייכו אותי לרשומה הקיימת ואל תיצרו דור חדש"
                            onClick={() => { void markSelfExisting(node) }}
                            className="flex-shrink-0 inline-flex items-center justify-center gap-1 px-3 rounded-lg border-2 border-green-400 bg-green-50 text-green-700 text-xs font-bold shadow-sm hover:bg-green-600 hover:text-white hover:border-green-600 focus:bg-green-600 focus:text-white transition-all duration-150 whitespace-nowrap">
                            <User size={13} />
                            זה אני
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {manualBlocked ? (
                <p className="text-[11px] leading-relaxed text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
                  בדורות 2–5 בוחרים <strong>מהרשימה בלבד</strong> — זהו סדר הדורות המאושר.
                  אם הדור שלכם אינו מופיע ברשימה, נא לפנות למשרד.
                </p>
              ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setManualGate(true); setNewErr('') }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 border border-amber-300 bg-amber-50 hover:bg-amber-100 rounded-lg px-3 py-1.5 transition-all duration-150">
                  <Plus size={13} /> {lastIsNew || options.length === 0 ? 'הוסיפו את הדור הבא' : 'הדור הבא לא ברשימה — הוסיפו "אחר"'}
                </button>
              </div>
              )}
              {canAddSelf && (
                <div className="mt-4">
                  <button type="button" onClick={() => setSelfAdded(true)}
                    className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-bold text-white bg-gradient-to-b from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-sm hover:shadow-md active:scale-[0.98] rounded-lg px-3 py-2.5 transition-all duration-150 shadow-sm">
                    <Check size={15} /> הוסיפו אותי כעת (סיימנו את האבות)
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-amber-800">הוספת דור {chain.length + 2} (ייכנס לאישור הצוות)</p>

              {/* ⚠️ ההנחיה מפורשת ובאדום: כשהיה שדה חופשי, כל אחד כתב אחרת
                  ואותו אדם נכנס לעץ בכמה ניסוחים. כאן מזינים שמות בלבד. */}
              <div className="rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2.5">
                <p className="text-xs font-extrabold text-red-800 mb-1.5">
                  ⚠️ יש להזין <span className="underline">שמות פרטיים בלבד</span> — בלי תארים!
                </p>
                <ul className="text-[11px] text-red-800 leading-relaxed space-y-0.5 pr-1">
                  <li>✗ לא לכתוב לפני השם: <span className="font-bold">רבי · ר׳ · הרב · מוהר״ר · הרבנית · מרת</span></li>
                  <li>✗ לא לכתוב אחרי השם: <span className="font-bold">שליט״א · הי״ו · ז״ל · זצ״ל · ע״ה</span></li>
                  <li>✓ לדוגמה: לכתוב רק <span className="font-bold">משה</span> ורק <span className="font-bold">חיה</span></li>
                </ul>
                <p className="text-[11px] font-bold text-red-900 mt-1.5">
                  המערכת מוסיפה «רבי» ו«מרת» אוטומטית.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-600">שם הבעל (פרטי בלבד) *</span>
                  <TextInput ref={husbandRef} value={newHusband} onFocus={() => openNameGate('husband')}
                    onChange={e => { setNewHusband(e.target.value); setNewErr('') }} placeholder="משה" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-600">שם האישה (פרטי בלבד)</span>
                  <TextInput ref={wifeRef} value={newWife} onFocus={() => openNameGate('wife')}
                    onChange={e => { setNewWife(e.target.value); setNewErr('') }} placeholder="חיה" />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-600">שם משפחה *</span>
                <TextInput value={newFamily} onChange={e => { setNewFamily(e.target.value); setNewErr('') }} placeholder="כהן" />
              </label>

              {/* מה ייכנס בפועל — כדי שלא יצטרך לנחש */}
              {newPreview && (
                <div className="rounded-lg bg-white border border-amber-300 px-3 py-2">
                  <span className="text-[11px] font-semibold text-slate-500">ייכנס לעץ כך: </span>
                  <span className="text-sm font-extrabold text-amber-900">{newPreview}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">בן/חתן של הדור הקודם:</span>
                {(['son', 'son_in_law'] as const).map(r => (
                  <button key={r} type="button" onClick={() => setNewRel(r)}
                    className={`text-sm font-bold rounded-lg px-4 py-1.5 border-2 transition-all duration-150 ${newRel === r ? (r === 'son' ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-200' : 'bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-200') : 'bg-white text-slate-700 border-slate-400 hover:border-slate-500 hover:bg-slate-50'}`}>{r === 'son' ? 'בן' : 'חתן'}</button>
                ))}
              </div>
              {newErr && <p className="text-xs text-red-600">{newErr}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={confirmNew} className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-[0_6px_16px_-6px_rgba(217,119,6,0.5)] hover:shadow-[0_10px_22px_-8px_rgba(217,119,6,0.6)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] rounded-lg px-4 py-2"><Check size={12} /> הוסף</button>
                <button type="button" onClick={() => { setAddOpen(false); setNewHusband(''); setNewWife(''); setNewFamily(''); setNewRel(null); setNewErr('') }} className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-2">ביטול</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ⚠️ חלונית חוסמת — נפתחת בכל לחיצה על "הוספה ידנית", בכל דור מחדש.
          אין כאן "אישור שנשמר": כל דור הוא בדיקה נפרדת, ואין זיכרון בין הדורות.
          שני נוסחים לפי מצב הרשימה באותו דור:
          • יש רשומות (options.length>0) — אזהרה אדומה: יש לבדוק ברשימה לפני הוספה,
            ודור כפול פוסל את הרישום כולו.
          • אין שום רשומה בדור הזה — אין מה לבדוק מולו, ולכן לא דורשים זאת. חלונית
            מידע ניטרלית שמדגישה רק דיוק ומלאות השם (שם פרטי + שם משפחה, בלי תארים). */}
      {/* ⚠️ חלונית חוסמת בכניסה לשדה השם — נפתחת מחדש בכל הוספה ידנית.
          שם חלקי או כינוי ("איצק" במקום "יצחק אייזיק") אינו ניתן להצלבה מול
          העץ, והרישום נפסל. הדרישה הזאת חייבת לעצור את המשתמש בדרך לשדה, כי
          כטקסט לצד השדה היא נקראה רק אחרי שכבר הקליד. */}
      {nameGate && (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border-4 border-red-500">
            <div className="bg-red-600 px-5 py-4 flex items-center gap-2.5">
              <AlertTriangle size={24} className="text-white flex-shrink-0" />
              <h3 className="text-lg font-black text-white">עצרו! השם חייב להיות מדויק ומלא</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-base text-slate-900 font-extrabold leading-relaxed mb-3">
                יש להזין את <span className="text-red-700 underline">השם המלא במדויק</span>, בדיוק כפי שקראו לו —
                כולל כל השמות, ולא כינוי או קיצור.
              </p>

              <div className="rounded-xl bg-slate-50 border-2 border-slate-200 px-4 py-3 mb-3 space-y-2">
                <div className="flex gap-2 items-start">
                  <span className="text-green-600 font-black flex-shrink-0 text-lg leading-none mt-0.5">✓</span>
                  <p className="text-sm text-slate-800 leading-relaxed">
                    <span className="font-extrabold text-green-800">יצחק אייזיק</span> · <span className="font-extrabold text-green-800">משה יהודה לייב</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">כל השמות, במלואם</span>
                  </p>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="text-red-600 font-black flex-shrink-0 text-lg leading-none mt-0.5">✗</span>
                  <p className="text-sm text-slate-800 leading-relaxed">
                    <span className="font-extrabold text-red-700">איצק</span> · <span className="font-extrabold text-red-700">לייבל</span> · <span className="font-extrabold text-red-700">משה י.</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">כינוי, קיצור או ראשי תיבות</span>
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-red-600 px-4 py-3.5 shadow-inner">
                <p className="text-base font-black text-white leading-relaxed text-center">
                  שם שאינו מדויק — הרישום לא ייקלט במערכת.
                </p>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mt-3">
                אנחנו מצליבים כל שם מול עץ הדורות. שם חלקי או כינוי אינו ניתן לזיהוי,
                ולכן הרישום נדחה ואי אפשר לשייך אתכם למשפחה.
              </p>
            </div>
            <div className="px-5 pb-5">
              <button type="button" autoFocus
                onClick={() => {
                  setNameGate(false); setNameGateSeen(true)
                  // מחזירים את הסמן לשדה שממנו נכנסו — אחרת המשתמש סוגר
                  // את החלונית ונשאר בלי מיקוד, וצריך ללחוץ פעמיים.
                  setTimeout(() => (gateFrom.current === 'husband' ? husbandRef : wifeRef).current?.focus(), 0)
                }}
                className="w-full inline-flex items-center justify-center gap-2 text-base font-black text-white bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-xl px-4 py-3.5 shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-150">
                <Check size={18} /> הבנתי — אזין את השם המלא במדויק
              </button>
            </div>
          </div>
        </div>
      )}

      {manualGate && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          {options.length > 0 ? (
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border-2 border-red-300">
              <div className="bg-red-600 px-5 py-4 flex items-center gap-2.5">
                <AlertTriangle size={22} className="text-white flex-shrink-0" />
                <h3 className="text-base font-extrabold text-white">עצרו — בדקתם שהדור הזה באמת לא ברשימה?</h3>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-slate-800 font-bold leading-relaxed mb-3">
                  אתם עומדים להוסיף את <span className="text-red-700">דור {chain.length + 2}</span> באופן ידני.
                  הוספה ידנית מיועדת <span className="underline">אך ורק</span> לדור שאינו קיים כלל במערכת.
                </p>
                <ul className="text-sm text-slate-700 leading-relaxed space-y-2 mb-3">
                  <li className="flex gap-2">
                    <span className="text-red-600 font-bold flex-shrink-0">•</span>
                    <span>חזרו לרשימה שמעל וּודאו <span className="font-bold">בוודאות מלאה</span> שהשם שאתם רוצים להוסיף אינו מופיע בה.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-red-600 font-bold flex-shrink-0">•</span>
                    <span>שימו לב גם לשינויי כתיב קלים בשם (למשל: יצחק / איצק, ה״א בסוף השם וכדומה).</span>
                  </li>
                </ul>
                <div className="rounded-xl bg-red-50 border-2 border-red-300 px-4 py-3">
                  <p className="text-sm font-extrabold text-red-800 leading-relaxed">
                    אם תוסיפו ידנית דור שכבר קיים במערכת — הרישום שלכם יידחה.
                  </p>
                </div>
              </div>
              <div className="px-5 pb-5 flex flex-col gap-2">
                <button type="button" onClick={() => { setManualGate(false); setNameGateSeen(false); setAddOpen(true) }}
                  className="w-full inline-flex items-center justify-center gap-2 text-sm font-bold text-white bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 rounded-xl px-4 py-3 shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-150">
                  <Check size={16} /> כן, בדקנו — הדור הזה אינו ברשימה, ממשיכים להוספה ידנית
                </button>
                <button type="button" onClick={() => setManualGate(false)}
                  className="w-full inline-flex items-center justify-center gap-2 text-sm font-bold text-slate-700 bg-white border-2 border-slate-300 hover:bg-slate-50 rounded-xl px-4 py-3 transition-all duration-150">
                  <X size={16} /> נבדוק שוב ברשימה
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border-2 border-indigo-300">
              <div className="bg-indigo-600 px-5 py-4 flex items-center gap-2.5">
                <AlertTriangle size={22} className="text-white flex-shrink-0" />
                <h3 className="text-base font-extrabold text-white">שימו לב — אתם מזינים דור חדש במערכת</h3>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-slate-800 font-bold leading-relaxed mb-3">
                  לא נמצאו עדיין רשומות מאושרות בדור {chain.length + 2} — לכן אין רשימה לבחור ממנה, ואתם מזינים את הפרטים ישירות.
                </p>
                <div className="rounded-xl bg-indigo-50 border-2 border-indigo-200 px-4 py-3">
                  <p className="text-sm font-extrabold text-indigo-900 leading-relaxed">
                    יש להזין שם פרטי ושם משפחה בנפרד, ואת שם האישה — בצורה מדויקת ומלאה, בדיוק לפי ההנחיות שמופיעות בטופס (שם פרטי בלבד, בלי תארים).
                  </p>
                </div>
              </div>
              <div className="px-5 pb-5">
                <button type="button" onClick={() => { setManualGate(false); setNameGateSeen(false); setAddOpen(true) }}
                  className="w-full inline-flex items-center justify-center gap-2 text-sm font-bold text-white bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 rounded-xl px-4 py-3 shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-150">
                  <Check size={16} /> הבנתי, ממשיכים למילוי הפרטים
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
