// ─────────────────────────────────────────────────────────────────────────────
// גיזום דורות שנזנחו בתיקון ייחוס.
//
// 🔴 הבעיה שזה פותר: applyChain ידע רק *להוסיף ולחבר מחדש*, ותועד במפורש
// "אין מחיקה של צמתים". משפחה שמחקה בעורך את דור 2 והלאה ובנתה מחדש —
// קיבלה שרשרת חדשה, אבל הדורות השגויים נשארו בעץ בדיוק כפי שהיו. זה מה
// שדווח כ"אי אפשר לתקן כלום, לא למחוק דורות".
//
// 🔴 הכלל: המשפחה מנותקת מהשרשרת הישנה, וצומת נמחק *רק* אם אחרי הניתוק
// לא נשאר תלוי בו אף אחד — לא משפחה אחרת ולא צומת-בן.
//
// ⚠️ מחיקה גורפת של "הכול מדור N והלאה" נשקלה ונדחתה: 79% מהצמתים כתובים
// "רבי X ומרת Y" ואותו אב-קדמון משמש עשרות ענפים. גיזום עיוור היה משאיר
// משפחות שלא ביקשו דבר בלי ייחוס כלל — בדיוק הנזק שהתיקון בא למנוע.
//
// ⚠️ הגיזום עובד מלמטה למעלה: בן נמחק לפני אביו, ולכן אב שכל בניו נגזמו
// הופך בעצמו ליתום באותו מעבר ונגזם גם הוא. בלי הסדר הזה היה נשאר זנב של
// אבות ריקים שאיש אינו תלוי בהם.
// ─────────────────────────────────────────────────────────────────────────────

export interface PruneNode {
  id: string
  parent_id: string | null
  generation: number
}

export interface PrunePlan {
  /** הצמתים למחיקה, מהעמוק לרדוד — סדר המחיקה המחויב במסד. */
  deleteIds: string[]
  /** צמתים שנזנחו אך נשארו, ומי עוד תלוי בהם. לתצוגה במסך האישור. */
  kept: { id: string; reason: 'has_children' | 'has_beneficiaries' }[]
}

/**
 * מתכננת את גיזום הענף הישן לאחר שמוטב הועבר לשרשרת חדשה.
 *
 * @param nodes        כל צמתי העץ.
 * @param abandonedIds הצמתים שהמשפחה הסירה — השרשרת הישנה מנקודת השינוי ומטה.
 * @param keepIds      צמתים שאסור לגעת בהם (השרשרת החדשה שהמוטב חובר אליה).
 * @param benCountByNode כמה מוטבים מחוברים לכל צומת *אחרי* הניתוק.
 */
export function planPrune(
  nodes: PruneNode[],
  abandonedIds: string[],
  keepIds: string[],
  benCountByNode: Map<string, number>,
): PrunePlan {
  const keep = new Set(keepIds)
  // ⚠️ צומת שנמצא גם בשרשרת החדשה אינו "נזנח" — משפחה שתיקנה רק את שם
  // האישה בדור 5 שולחת את אותו צומת בשני הצדדים, ומחיקתו הייתה מוחקת את
  // הדור שהיא בעצמה ביקשה להישאר בו.
  const candidates = abandonedIds.filter(id => !keep.has(id))

  const childrenOf = new Map<string, string[]>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    const l = childrenOf.get(n.parent_id)
    if (l) l.push(n.id); else childrenOf.set(n.parent_id, [n.id])
  }
  const genOf = new Map(nodes.map(n => [n.id, n.generation]))

  // מהעמוק לרדוד: בן נבחן ונמחק לפני אביו, ולכן אב שהתרוקן נגזם באותו מעבר.
  const ordered = [...candidates].sort(
    (a, b) => (genOf.get(b) ?? 0) - (genOf.get(a) ?? 0),
  )

  const deleteIds: string[] = []
  const deleted = new Set<string>()
  const kept: PrunePlan['kept'] = []

  for (const id of ordered) {
    // ⚠️ מוטב מחובר = עצירה מוחלטת. גם אם זה לא המוטב שביקש את התיקון:
    // צומת שמשפחה אחרת תלויה בו אינו שלנו למחיקה.
    if ((benCountByNode.get(id) ?? 0) > 0) {
      kept.push({ id, reason: 'has_beneficiaries' })
      continue
    }
    // בנים שטרם נמחקו במעבר הזה — הצומת עדיין אב של מישהו.
    const liveChildren = (childrenOf.get(id) ?? []).filter(c => !deleted.has(c))
    if (liveChildren.length > 0) {
      kept.push({ id, reason: 'has_children' })
      continue
    }
    deleteIds.push(id)
    deleted.add(id)
  }

  return { deleteIds, kept }
}

/**
 * הצמתים שהמשפחה זנחה: הזנב של השרשרת הישנה מנקודת ההתפצלות ומטה.
 *
 * ⚠️ נקודת ההתפצלות נקבעת לפי *מזהי הצמתים* ולא לפי השמות: המשפחה עשויה
 * לכתוב את אותו אדם בניסוח אחר, ומעבר לשמות היה מסמן דור זהה כנזנח.
 */
export function abandonedTail(oldPath: string[], newPath: string[]): string[] {
  let i = 0
  while (i < oldPath.length && i < newPath.length && oldPath[i] === newPath[i]) i++
  return oldPath.slice(i)
}
