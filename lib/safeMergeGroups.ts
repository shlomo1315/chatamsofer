// קבוצות מיזוג "בטוח" — שם זהה *בדיוק*, תחת אותו אב, באותו דור.
//
// למה זו קבוצה שאפשר למזג בעיניים עצומות: שני אנשים שונים אכן יכולים לשאת
// אותו שם, אבל לא בטקסט זהה לחלוטין, תחת אותו אב, ובאותו דור. זה אותו אדם
// שנרשם פעמיים — למשל ע"י שני בניו, כל אחד בנפרד.
//
// ⚠️ הכלל כאן מחמיר יותר מ-autoMergeKey שבמיזוג הרגיל. autoMergeKey מסיר תארים
// ("רבי", "מרת") ולכן מזהה גם "רבי ישראל וייס" מול "ישראל וייס" כאותו שם — זה
// נכון ברוב המקרים, אבל זו כבר פרשנות. כאן אין פרשנות: או שהמחרוזת זהה או שלא.
//
// ⚠️ ובגלל שכל השמות בקבוצה זהים — אין בכלל שאלה איזה ניסוח יישאר. זו הסיבה
// שהמסלול הזה אינו דורש בחירת שם, ולכן אפשר להריץ אותו על מאות קבוצות.
//
// ⚠️ צומת 'rejected' אינו משתתף — הוא נדחה בהחלטה מפורשת, בדיוק כמו
// ב-groupForAutoMerge.

export interface SafeNode {
  id: string
  name: string
  parent_id: string | null
  generation: number
  status?: string | null
}

/** נרמול רווחים בלבד. שום דבר אחר — זו כל מהות ה"בטוח". */
export const exactNameKey = (name: string) => String(name ?? '').trim().replace(/\s+/g, ' ')

export const safeGroupKey = (n: SafeNode) =>
  `${n.parent_id ?? 'root'}|${n.generation}|${exactNameKey(n.name)}`

export function findSafeMergeGroups(nodes: SafeNode[]): SafeNode[][] {
  const byKey = new Map<string, SafeNode[]>()
  for (const n of nodes) {
    if ((n.status ?? '') === 'rejected') continue
    if (!exactNameKey(n.name)) continue
    const key = safeGroupKey(n)
    const arr = byKey.get(key) ?? []
    arr.push(n)
    byKey.set(key, arr)
  }
  // סדר קבוע (לא לפי סדר ההכנסה) כדי שתצוגה מקדימה והרצה יראו את אותו דבר.
  return [...byKey.values()]
    .filter(g => g.length > 1)
    .sort((a, b) =>
      a[0].generation - b[0].generation ||
      exactNameKey(a[0].name).localeCompare(exactNameKey(b[0].name), 'he'))
}
