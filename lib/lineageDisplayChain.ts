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
 * ⚠️ שמות ריקים מסוננים: ערך ריק מייצר צ'יפ בלי טקסט שנראה כתקלה.
 */
export function displayChain(
  saved: ChainEntry[] | null | undefined,
  treePath: TreeNodeLite[] | null | undefined,
): ChainEntry[] {
  const clean = (rows: readonly ChainEntry[]): ChainEntry[] =>
    rows
      .filter(e => e && typeof e.name === 'string' && e.name.trim())
      .map(e => ({ generation: e.generation, name: e.name.trim(), relation: e.relation ?? null }))
      .sort((a, b) => a.generation - b.generation)

  const fromSaved = Array.isArray(saved) ? clean(saved) : []
  if (fromSaved.length) return fromSaved

  const fromTree = Array.isArray(treePath) ? clean(treePath) : []
  return fromTree
}
