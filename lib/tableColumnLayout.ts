// ─────────────────────────────────────────────────────────────────────────────
// סדר עמודות והצמדה — הלוגיקה הטהורה מאחורי "סידור עמודות" בטבלאות.
//
// 🔴 הסדר נשמר כרשימת מפתחות, ולכן חל עליו אותו מלכוד כמו על הנראות
// (lib/tableColumnVisibility): עמודה שנוספה לקוד אחרי השמירה אינה ברשימה.
// היא לא נזרקת לסוף — היא נכנסת אחרי העמודה שקודמת לה בקוד, כדי שתופיע
// במקום שבו המפתח התכוון שתהיה.
//
// 🔴 הצמדה בלי גבול חוסמת את הטבלה: מי שמצמיד 4 עמודות רחבות במסך צר
// נשאר בלי מקום לגלול בו. לכן ההצמדה בפועל נעצרת בחצי מרוחב הטבלה.
// ─────────────────────────────────────────────────────────────────────────────

/** מיזוג סדר שמור עם העמודות שבקוד: מסיר מחוקות, משבץ חדשות במקומן. */
export function mergeSavedOrder<K extends string>(codeKeys: readonly K[], saved: readonly string[] | null | undefined): K[] {
  if (!saved?.length) return [...codeKeys]
  const exists = new Set<string>(codeKeys)
  const out = saved.filter((k, i) => exists.has(k) && saved.indexOf(k) === i) as K[]
  const placed = new Set<string>(out)
  codeKeys.forEach((k, i) => {
    if (placed.has(k)) return
    // ⚠️ אחרי הקודמת הקרובה בקוד שכבר משובצת; אם אין — בראש הרשימה.
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const p = out.indexOf(codeKeys[j])
      if (p >= 0) { at = p + 1; break }
    }
    out.splice(at, 0, k)
    placed.add(k)
  })
  return out
}

/** העברת עמודה למקום של עמודה אחרת (גרירה ושחרור). */
export function moveTo<K extends string>(order: readonly K[], key: K, target: K): K[] {
  const from = order.indexOf(key)
  const to = order.indexOf(target)
  if (from < 0 || to < 0 || from === to) return [...order]
  const out = [...order]
  out.splice(from, 1)
  out.splice(to, 0, key)
  return out
}

/**
 * הזזה בצעד אחד בין העמודות *המוצגות* (delta=-1 קדימה, +1 אחורה).
 * ⚠️ מוסתרות מדולגות: אחרת "הזז שמאלה" על יד עמודה מוסתרת לא היה עושה דבר נראה.
 */
export function moveBy<K extends string>(order: readonly K[], key: K, delta: -1 | 1, isShown: (k: K) => boolean = () => true): K[] {
  const vis = order.filter(k => k === key || isShown(k))
  const i = vis.indexOf(key)
  const j = i + delta
  if (i < 0 || j < 0 || j >= vis.length) return [...order]
  return moveTo(order, key, vis[j])
}

/** סדר התצוגה: המוצמדות קודם (בסדר שלהן), ואחריהן השאר. */
export function arrangeKeys<K extends string>(order: readonly K[], pinned: ReadonlySet<K>): K[] {
  return [...order.filter(k => pinned.has(k)), ...order.filter(k => !pinned.has(k))]
}

/**
 * אילו עמודות נכנסות ברוחב הטבלה, כשכל אחת מתכווצת עד המינימום שלה.
 *
 * 🔴 אין גלילה לרוחב במערכת (docs/no-horizontal-scroll.md), ולכן מה שלא
 * נכנס מוסתר — מסוף הסדר, ולא מדלגים לעמודה קטנה יותר אחריה: הסדר שהמשתמש
 * קבע נשמר. `keep` (מוצמדות והעמודה הנעולה) נשארות תמיד.
 * `reserved` — רוחב קבוע שאינו עמודת נתונים (פעולות, עמודה מובילה).
 * box=0 (טרם נמדד / כרטיסים בנייד) = הכול נכנס.
 */
export function fitMask(mins: readonly number[], keep: readonly boolean[], reserved: number, box: number): boolean[] {
  if (box <= 0) return mins.map(() => true)
  let budget = box - reserved - mins.reduce((a, m, i) => a + (keep[i] ? m : 0), 0)
  let open = true
  return mins.map((m, i) => {
    if (keep[i]) return true
    if (open && budget >= m) { budget -= m; return true }
    open = false
    return false
  })
}

/**
 * רוחבים שנכנסים ב-box: כשהסכום גדול מדי, כל עמודה מוותרת על חלק יחסי
 * מהמרווח שבין הרוחב שלה למינימום. אף עמודה לא יורדת מהמינימום — מה
 * שמבטיח שהתוכן לא עולה על העמודה הסמוכה.
 */
export function fitWidths(px: readonly number[], mins: readonly number[], box: number): number[] {
  const sum = px.reduce((a, b) => a + b, 0)
  if (box <= 0 || sum <= box) return [...px]
  const slack = px.reduce((a, w, i) => a + Math.max(0, w - mins[i]), 0)
  const ratio = slack > 0 ? Math.min(1, (sum - box) / slack) : 1
  return px.map((w, i) => Math.floor(w - Math.max(0, w - mins[i]) * ratio))
}
