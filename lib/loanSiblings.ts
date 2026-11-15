// ניווט "הקודם / הבא" בין תיקי הלוואה שממתינים לטיפול, בלי לטפל בתיק הנוכחי.
// הסדר קבוע (לפי זמן הגשה, מהישן לחדש) ומעגלי, כדי שאפשר לדלג קדימה ולחזור אחר כך.
// תיק שאינו ברשימה (כבר הוכרע) מקבל את הראשון כ"הבא" ואת האחרון כ"קודם".
export function loanSiblings(orderedIds: string[], currentId: string): { prev: string | null; next: string | null } {
  const others = orderedIds.filter(id => id !== currentId)
  if (!others.length) return { prev: null, next: null }
  const at = orderedIds.indexOf(currentId)
  if (at === -1) return { prev: others[others.length - 1], next: others[0] }
  const n = orderedIds.length
  return { prev: orderedIds[(at - 1 + n) % n], next: orderedIds[(at + 1) % n] }
}
