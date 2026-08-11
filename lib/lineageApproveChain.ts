// ─────────────────────────────────────────────────────────────────────────────
// מה יאושר כשמאשרים נרשם — שרשרת האבות הממתינים שמעליו.
//
// הכלל: יחוס אינו מוכח אם חוליה אחת בשרשרת אינה מאומתת. לכן אישור נרשם מאמת
// גם את כל אבותיו הממתינים, עד הצומת המאומת הראשון — משם ומעלה כבר אושר.
//
// 🔴 המודול הזה קיים כדי שהתצוגה המקדימה והביצוע ישתמשו *באותה* פונקציה.
// שתי הגדרות מקבילות של "מה עומד להתאשר" נפרדות בתיקון הבא, ואז המסך מבטיח
// דבר אחד והשרת עושה אחר — במסך שכל תפקידו להזהיר לפני פעולה רחבה. זה כבר
// קרה בפרויקט הזה עם שתי רשימות ערוצים, ועם שתי הגדרות של "זה אני".
//
// המודול טהור: מקבל צמתים ומחזיר רשימה. אין בו גישה למסד ואין בו כתיבה.
// ─────────────────────────────────────────────────────────────────────────────

export interface ApproveChainNode {
  id: string
  name: string
  parent_id: string | null
  generation: number
  status: string | null
}

export interface ApproveChainStep {
  id: string
  name: string
  generation: number
  /** האם זה הנרשם עצמו ולא אב שלו — הוא הסיבה לפעולה, לא תופעת לוואי שלה. */
  isSelf: boolean
}

/**
 * הצמתים שיעברו ל"מאומת" אם יאושר הנרשם שיושב על startId.
 *
 * מוחזר מהדור הקדום ביותר לחדש ביותר — הסדר שבו קוראים שרשרת יוחסין, ולכן
 * גם הסדר שבו היא צריכה להופיע באזהרה.
 *
 * ⚠️ עוצר בצומת המאומת הראשון. אב שכבר אושר אינו נספר, אחרת האזהרה הייתה
 * מציגה עשרה דורות שרובם לא ישתנו בכלל, ומנהל שרואה מספר מנופח לומד להתעלם
 * ממנו.
 *
 * ⚠️ מוגן מפני מעגלים (guard). מעגל בעץ אינו תיאורטי — ראו lib/lineageForest.
 */
export function planApproveChain(
  nodes: Map<string, ApproveChainNode>,
  startId: string | null | undefined,
): ApproveChainStep[] {
  if (!startId) return []
  const out: ApproveChainStep[] = []
  const guard = new Set<string>()
  let cur: string | null = startId

  while (cur && !guard.has(cur)) {
    guard.add(cur)
    const node: ApproveChainNode | undefined = nodes.get(cur)
    if (!node) break
    if ((node.status ?? '') === 'verified') break
    out.push({
      id: node.id,
      name: node.name,
      generation: node.generation,
      isSelf: node.id === startId,
    })
    cur = node.parent_id
  }

  // מהקדום לחדש — סדר קריאת שרשרת יוחסין.
  return out.reverse()
}
