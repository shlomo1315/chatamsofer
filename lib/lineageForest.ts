// בניית יער עץ הדורות מרשימה שטוחה — עם אחריות אחת שאין עליה פשרה:
// **כל צומת מופיע בעץ. תמיד.**
//
// 🔴 הבאג שזה מתקן: buildTree הקודם צירף כל צומת להורה שלו, וכ"שורש" הוסיף רק
// צמתים בלי הורה. צומת שההורה שלו נמחק אך הוא עצמו נשאר מצביע אליו — הפך
// לשורש, ולכן נראה. אבל צומת בתוך *מעגל* (A הורה של B ו-B הורה של A, או צומת
// שהוא ההורה של עצמו) צורף להורה שלו ולעולם לא נכנס לרשימת השורשים — ולכן הוא
// וכל תת-העץ שמתחתיו לא צויירו בשום מקום. הצאצאים פשוט נעלמו מהמסך.
//
// ⚠️ מעגלים אינם תיאורטיים כאן: מיזוג הכפילויות מסיט הורות בהמוניה
// (parent_id של ילדי הצומת הממוזג מוסב לצומת שנשאר). מיזוג אב אל צאצא שלו,
// או אל עצמו, יוצר מעגל — והתוצאה הייתה משפחות שלמות שנעלמו בשקט.
//
// לכן כאן: מזהים כל צומת שאינו נגיש מהשורשים, שוברים את המעגל, ומחזירים גם
// את *הרשימה* של מה שהיה מנותק — כדי שהמסך יוכל להתריע ולא להסתיר תקלה.

export type FlatNode = { id: string; parent_id: string | null }
export type Built<T> = T & { children: Built<T>[] }

export type Forest<T> = {
  roots: Built<T>[]
  /** צמתים שנותקו ממעגל כדי להפוך אותם נגישים — תקלת נתונים שדורשת טיפול. */
  detached: string[]
  /** צמתים שהם ההורה של עצמם. */
  selfParented: string[]
  /** צמתים שה-parent_id שלהם מצביע לצומת שאינו קיים. */
  danglingParent: string[]
}

export function buildForest<T extends FlatNode>(flat: T[]): Forest<T> {
  const map = new Map<string, Built<T>>()
  for (const n of flat) map.set(n.id, { ...n, children: [] } as Built<T>)

  const roots: Built<T>[] = []
  const selfParented: string[] = []
  const danglingParent: string[] = []

  for (const n of flat) {
    const node = map.get(n.id)!
    const pid = n.parent_id
    if (!pid) { roots.push(node); continue }
    if (pid === n.id) { selfParented.push(n.id); roots.push(node); continue }
    const parent = map.get(pid)
    if (!parent) { danglingParent.push(n.id); roots.push(node); continue }
    parent.children.push(node)
  }

  // ⚠️ מעבר איטרטיבי ולא רקורסיבי: בשרשרת דורות עמוקה רקורסיה עלולה למלא את
  // המחסנית, וזה בדיוק המסך שאמור להציג עץ גדול.
  const visited = new Set<string>()
  const walk = (start: Built<T>) => {
    const stack = [start]
    while (stack.length) {
      const n = stack.pop()!
      if (visited.has(n.id)) continue
      visited.add(n.id)
      for (const c of n.children) if (!visited.has(c.id)) stack.push(c)
    }
  }
  for (const r of roots) walk(r)

  // מה שלא נגיש — יושב במעגל. מטפסים עד שנתקלים באותו צומת פעמיים: זו נקודת
  // הכניסה למעגל, ואותה מנתקים מההורה שלה ומקדמים לשורש.
  const detached: string[] = []
  for (const n of flat) {
    if (visited.has(n.id)) continue
    const seen = new Set<string>()
    let cur: Built<T> | undefined = map.get(n.id)
    while (cur && !seen.has(cur.id) && !visited.has(cur.id)) {
      seen.add(cur.id)
      const pid: string | null = cur.parent_id
      cur = pid ? map.get(pid) : undefined
    }
    const entry = cur && seen.has(cur.id) ? cur : map.get(n.id)!
    const pid = entry.parent_id
    if (pid) {
      const parent = map.get(pid)
      if (parent) parent.children = parent.children.filter(c => c.id !== entry.id)
    }
    detached.push(entry.id)
    roots.push(entry)
    walk(entry)
  }

  return { roots, detached, selfParented, danglingParent }
}

/** ספירת כל הצמתים ביער — לבדיקה שלא נפל אף אחד. */
export function countForest<T>(roots: Built<T>[]): number {
  let n = 0
  const stack = [...roots]
  const seen = new Set<Built<T>>()
  while (stack.length) {
    const node = stack.pop()!
    if (seen.has(node)) continue
    seen.add(node)
    n++
    for (const c of node.children) stack.push(c)
  }
  return n
}
