// ─────────────────────────────────────────────────────────────────────────────
// מיזוג בחירת עמודות שמורה עם הגדרת העמודות הנוכחית.
//
// 🔴 הבעיה שזה פותר: הבחירה נשמרת ב-localStorage כרשימת מפתחות. עמודה
// שנוספת לקוד אחר כך אינה ברשימה, וטעינה שדורסת בה את ברירת המחדל
// מסתירה את העמודה החדשה מכל מי שאי פעם נגע בבורר — כלומר דווקא
// מהמשתמשים הוותיקים. הפיצ'ר נראה כאילו לא נפרס.
//
// 🔴 ההבחנה בין "עמודה חדשה" ל"הוסתרה במפורש" *אינה ניתנת לגזירה*
// מרשימת הנראות לבדה: בשני המקרים המפתח פשוט חסר. לכן נשמרת לצידה
// גם רשימת המפתחות שהיו קיימים בזמן השמירה (known).
//
//   מפתח ב-known ולא ב-visible  → המשתמש הסתיר אותו   → נשאר מוסתר
//   מפתח שאינו ב-known          → נוסף לקוד מאז       → לפי def
//
// ⚠️ בפורמט הישן (מערך בלבד, בלי known) אין את המידע הזה. שם נבחרה
// ההתנהגות הבטוחה יותר: עמודה חדשה עם def:true *כן* תוצג. עדיף שמשתמש
// יסיר עמודה שאינו רוצה, על פני שלא ידע שהיא קיימת.
// ─────────────────────────────────────────────────────────────────────────────

export interface VisibilityCol<K extends string = string> {
  key: K
  def: boolean
}

/** מה שנשמר ב-localStorage. המערך הוא הפורמט הישן, שנתמך לאחור. */
export type SavedVisibility = readonly string[] | { visible: string[]; known: string[] }

export function mergeSavedVisibility<K extends string>(
  columns: readonly VisibilityCol<K>[],
  saved: SavedVisibility | null | undefined,
): Set<K> {
  const defaults = new Set(columns.filter(c => c.def).map(c => c.key))
  if (!saved) return defaults

  // ⚠️ הצמצום נעשה על משתנה נפרד: Array.isArray אינו מצמצם readonly string[]
  // מול האיחוד, ו-TypeScript ממשיך לראות את שתי האפשרויות.
  const obj = Array.isArray(saved) ? null : (saved as { visible: string[]; known: string[] })
  const isNew = obj !== null
  const visible = new Set<string>(obj ? obj.visible : (saved as readonly string[]))
  // בפורמט הישן אין known — כל מפתח שאינו ברשימה נחשב "לא ידוע", ולכן
  // עמודה עם def:true תיכנס. ראו ההערה בראש הקובץ.
  const known = obj ? new Set<string>(obj.known) : visible

  // ⚠️ מסונן מול הקוד: מפתח של עמודה שנמחקה מהקוד אינו נשמר, אחרת הוא
  // היה נספר בבורר ("9/10") בלי שיש לו עמודה להציג.
  const out = new Set(columns.filter(c => visible.has(c.key)).map(c => c.key))

  // רשימה ריקה בפורמט הישן = הסתרה מכוונת של הכל, ואין ממה להסיק "חדש".
  if (!isNew && visible.size === 0) return out

  for (const c of columns) {
    if (c.def && !known.has(c.key)) out.add(c.key)
  }
  return out
}

/** מה לשמור: הנראות *וגם* המפתחות שהיו קיימים ברגע השמירה. */
export function toSavedVisibility<K extends string>(
  columns: readonly VisibilityCol<K>[],
  visible: ReadonlySet<K>,
): { visible: string[]; known: string[] } {
  return { visible: [...visible], known: columns.map(c => c.key) }
}
