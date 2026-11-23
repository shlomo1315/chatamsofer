// ─────────────────────────────────────────────────────────────────────────────
// 🔴 השרשרת שמוצגת למשתמש — מקור אחד לכל המסכים.
//
// ⚠️ עד כה כל מסך בנה אותה בעצמו, והתוצאה הייתה שאותו מוטב הוצג אחרת
// בשתי כרטסות: בצאצאים עשרה דורות ירוקים, ביולדות שמונה שחלקם אדומים
// (עקשטיין 212404438, בלייכברד 200360204). זה קרה כי מסך אחד העדיף את
// מסלול העץ והשני את השרשרת השמורה.
//
// 🔴 הכלל: מה שהמשפחה בחרה (lineage_chain) מכריע. הקובץ המאושר הוא מקור
// האמת לצביעה, והשרשרת היא מה שהמשפחה הצהירה מולו.
//
// ⚠️ העץ הוא נפילה-לאחור בלבד — למשפחה שנקשרה לצומת בלי לבחור בעצמה.
// העץ עצמו עדיין חולק על הקובץ בדור של 37 שמות, ומכיל כפילויות (אותו
// אדם בדור 6 וגם 7); תיקונו הוא שלב נפרד ואינו צריך לעכב אישור משפחות.
// ─────────────────────────────────────────────────────────────────────────────

export interface ChainEntry {
  generation: number
  name: string
  relation?: string | null
}

export interface TreeNodeLite {
  generation: number
  name: string
  relation?: string | null
}

/**
 * בוחר את השרשרת להצגה: הבחירה השמורה קודמת, והעץ רק בהיעדרה.
 *
 * ⚠️ הסדר הזה מכוון — ראו ההערה בראש הקובץ. השרשרת היא מה שהמשפחה
 * הצהירה, והעץ עדיין חולק עליה בחלק מהשמות.
 *
 * ⚠️ מ-23.09 שני טריגרים במסד (sync_lineage_chain, resync_chains_for_node)
 * מחזיקים את השרשרת זהה למסלול בעץ בכל שינוי, ולכן ההעדפה כאן אינה
 * יוצרת עוד פער בין המסכים — היא רק קובעת מה קורה כשאין צומת כלל.
 *
 * ⚠️ שמות ריקים מסוננים: ערך ריק מייצר צ'יפ בלי טקסט שנראה כתקלה.
 */
export function displayChain(
  saved: ChainEntry[] | null | undefined,
  treePath: TreeNodeLite[] | null | undefined,
  manual?: readonly string[] | null,
): ChainEntry[] {
  // ⚠️ מספרי דור כפולים (שני "דור 6") גורמים לכפילות במסך ולצבע שמחושב מול
  // הדור הלא נכון. אחרי המיון, דור שקטן או שווה לקודם מקבל את הקודם ועוד 1.
  const clean = (rows: readonly ChainEntry[]): ChainEntry[] => {
    const sorted = rows
      .filter(e => e && typeof e.name === 'string' && e.name.trim())
      .map(e => ({ generation: e.generation, name: e.name.trim(), relation: e.relation ?? null }))
      .sort((a, b) => a.generation - b.generation)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].generation <= sorted[i - 1].generation) sorted[i].generation = sorted[i - 1].generation + 1
    }
    return sorted
  }

  const fromSaved = Array.isArray(saved) ? clean(saved) : []
  const fromTree = Array.isArray(treePath) ? clean(treePath) : []
  return withManual(fromSaved.length ? fromSaved : fromTree, manual)
}

/**
 * 🔴 אבות שהוכנסו ידנית (lineage_manual) נשמרים בנפרד מהשרשרת השמורה ומהעץ,
 * והטריגרים מסנכרנים את השרשרת רק למסלול בעץ. בלי הצירוף הזה דור 4 והלאה
 * שהוזנו ידנית נעלמו מהכרטסת. מצרפים אחרי הדור האחרון, ורק שמות שאינם כבר בשרשרת.
 */
// 🔴 23.11 וייס חיה (347425142): השרשרת סונכרנה מהעץ בניסוח "ומרת", והרשימה הידנית
// נשארה "והרבנית", ושלושה דורות הוצגו פעמיים. משווים לפי האדם: בלי תארים וגרשיים.
// שם האשה נשאר במפתח, כדי שנכד על שם סבו (עם אשה אחרת) לא ייבלע.
const TITLES = new Set(['רבי', 'הרב', "ר'", 'ר', 'מרן', 'מרת', 'ומרת', 'הרבנית', 'והרבנית', 'זי"ע', 'זצ"ל', 'ז"ל'])
function personKey(name: string): string {
  return name.replace(/[״]/g, '"').replace(/[׳]/g, "'").split(/[\s,]+/)
    .filter(w => w && !TITLES.has(w))
    .map(w => w.replace(/["'()]/g, ''))
    .join(' ')
}

function withManual(base: ChainEntry[], manual: readonly string[] | null | undefined): ChainEntry[] {
  if (!Array.isArray(manual) || !manual.length) return base
  const seen = new Set(base.map(e => personKey(e.name)))
  const out = [...base]
  let gen = base.length ? Math.max(...base.map(e => e.generation)) : 0
  for (const raw of manual) {
    const name = typeof raw === 'string' ? raw.trim() : ''
    if (!name || seen.has(personKey(name))) continue
    seen.add(personKey(name))
    out.push({ generation: ++gen, name, relation: null })
  }
  return out
}

/**
 * 🔴 הדור של הנרשם עצמו: הדור הבא אחרי האב האחרון בשרשרת. ארבעה אבות (דורות 1–4)
 * הם נרשם בדור 5. ספירת אורך השרשרת טעתה כשהשרשרת לא מתחילה ב-1 או שיש בה דילוג.
 * ⚠️ אם הנרשם עצמו כבר האיבר האחרון (selfIncluded), הדור שלו הוא האחרון עצמו.
 */
export function registrantGeneration(chain: readonly ChainEntry[], selfIncluded = false): number | null {
  if (!chain.length) return null
  const last = chain[chain.length - 1].generation
  return selfIncluded ? last : last + 1
}
